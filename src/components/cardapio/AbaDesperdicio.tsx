'use client';

import { useMemo, useState } from 'react';
import { toast } from '@/components/Toast';
import { Botao, Cartao, EstadoVazio, Kpi, Pilula, Secao, estiloInput, estiloRotulo } from '@/components/ui';
import { DIAS_SEMANA, formatarQtd, formatarReais } from '@/lib/cardapio/motor';
import { RadarDesperdicio } from '@/components/cardapio/RadarDesperdicio';
import { estimarValorDesperdicio } from '@/lib/cardapio/inteligencia-viva';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import type { EstadoSemana, RegistroDesperdicio } from '@/lib/cardapio/tipos';

export function AbaDesperdicio({
  estado,
  precos,
  fatores,
  registros,
  adicionar,
  remover,
  podeEditar,
}: {
  estado: EstadoSemana;
  precos: Record<string, number>;
  fatores?: Record<string, number>;
  registros: RegistroDesperdicio[];
  adicionar: (r: Omit<RegistroDesperdicio, 'id' | 'em'>) => void;
  remover: (id: string) => void;
  podeEditar: boolean;
}) {
  const { estimativas } = useEstimativas();
  const [dia, setDia] = useState(0);
  const [prato, setPrato] = useState('');
  const [produzido, setProduzido] = useState('');
  const [consumido, setConsumido] = useState('');
  const [unid, setUnid] = useState<'porções' | 'kg'>('porções');
  const [motivo, setMotivo] = useState('');

  const valores = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof estimarValorDesperdicio>>();
    registros.forEach((r) => mapa.set(r.id, estimarValorDesperdicio(r, { estado, precos, estimativas })));
    return mapa;
  }, [registros, estado, precos, estimativas]);

  const totalSobra = registros.reduce((a, r) => a + Math.max(0, r.produzido - r.consumido), 0);
  const totalProduzido = registros.reduce((a, r) => a + r.produzido, 0);
  const taxa = totalProduzido > 0 ? totalSobra / totalProduzido : 0;
  const valorados = registros.filter((r) => valores.get(r.id)?.valor != null);
  const totalCusto = valorados.reduce((a, r) => a + (valores.get(r.id)?.valor ?? 0), 0);
  const coberturaValor = registros.length > 0 ? Math.round((valorados.length / registros.length) * 100) : 0;

  const porPrato = useMemo(() => {
    const m = new Map<string, { prato: string; sobra: number; custo: number; valorados: number }>();
    registros.forEach((r) => {
      const k = r.prato.toLowerCase();
      const prev = m.get(k) ?? { prato: r.prato, sobra: 0, custo: 0, valorados: 0 };
      prev.sobra += Math.max(0, r.produzido - r.consumido);
      const valor = valores.get(r.id)?.valor;
      if (valor != null) {
        prev.custo += valor;
        prev.valorados += 1;
      }
      m.set(k, prev);
    });
    return Array.from(m.values()).sort((a, b) => b.sobra - a.sobra);
  }, [registros, valores]);

  const removerComUndo = (r: RegistroDesperdicio) => {
    remover(r.id);
    toast('Sobra removida', 'info', {
      rotulo: 'Desfazer',
      fn: () =>
        adicionar({
          dia: r.dia,
          prato: r.prato,
          produzido: r.produzido,
          consumido: r.consumido,
          unid: r.unid,
          motivo: r.motivo,
        }),
    });
  };

  const lancar = () => {
    const p = prato.trim() || estado.dias[dia]?.principal || '';
    if (!p || !(Number(produzido) > 0)) {
      toast('Informe o prato e a quantidade produzida', 'erro');
      return;
    }
    adicionar({
      dia,
      prato: p,
      produzido: Number(produzido),
      consumido: Number(consumido) || 0,
      unid,
      motivo: motivo.trim() || undefined,
    });
    toast('Desperdício registrado');
    setPrato('');
    setProduzido('');
    setConsumido('');
    setMotivo('');
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Kpi rotulo="Sobra na semana" valor={`${formatarQtd(totalSobra)}`} detalhe="na unidade registrada" tom="ouro" />
        <Kpi
          rotulo="Valor da sobra"
          valor={valorados.length > 0 ? `≈ ${formatarReais(totalCusto)}` : '—'}
          detalhe={registros.length > 0 ? `${coberturaValor}% dos lançamentos valorados` : 'registre produzido e consumido'}
          tom="vermelho"
        />
        <Kpi rotulo="Taxa de sobra" valor={`${Math.round(taxa * 100)}%`} detalhe="do que foi produzido" tom={taxa > 0.1 ? 'vermelho' : 'verde'} />
      </div>

      <Cartao className="!py-3">
        <p className="text-xs leading-5 text-texto-suave">
          <strong className="text-carvao-700 dark:text-carvao-200">Como o valor é calculado:</strong>{' '}
          sobra em porções usa o custo por porção do prato; sobra em kg usa o custo estimado do principal dividido pelo rendimento em kg que você informou como produzido. O sistema não trata 1 kg como se fosse 1 refeição.
        </p>
      </Cartao>

      <RadarDesperdicio estado={estado} precos={precos} fatores={fatores} registros={registros} />

      {podeEditar && (
        <Secao titulo="Registrar sobra do dia">
          <Cartao className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={estiloRotulo}>Dia</label>
                <select className={estiloInput} value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                  {DIAS_SEMANA.map((d, i) => (
                    <option key={i} value={i}>
                      {d.slice(0, 3)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={estiloRotulo}>Prato</label>
                <input
                  className={estiloInput}
                  placeholder={estado.dias[dia]?.principal || 'Nome do prato'}
                  value={prato}
                  onChange={(e) => setPrato(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={estiloRotulo}>Produzido</label>
                <input type="number" min={0} step="0.1" className={estiloInput} value={produzido} onChange={(e) => setProduzido(e.target.value)} />
              </div>
              <div>
                <label className={estiloRotulo}>Consumido</label>
                <input type="number" min={0} step="0.1" className={estiloInput} value={consumido} onChange={(e) => setConsumido(e.target.value)} />
              </div>
              <div>
                <label className={estiloRotulo}>Unidade</label>
                <select className={estiloInput} value={unid} onChange={(e) => setUnid(e.target.value as 'porções' | 'kg')}>
                  <option value="porções">porções</option>
                  <option value="kg">kg</option>
                </select>
              </div>
              <div>
                <label className={estiloRotulo}>Motivo</label>
                <input className={estiloInput} placeholder="ex.: demanda menor" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            </div>
            <Botao onClick={lancar} className="w-full">
              Registrar desperdício
            </Botao>
          </Cartao>
        </Secao>
      )}

      {porPrato.length > 0 && (
        <Secao titulo="Pratos com maior sobra">
          <Cartao className="!p-0">
            <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
              {porPrato.slice(0, 6).map((p) => (
                <li key={p.prato} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.prato}</p>
                    <p className="text-caption text-texto-suave">
                      {formatarQtd(p.sobra)} de sobra{p.valorados > 0 ? ` · ≈ ${formatarReais(p.custo)}` : ' · sem base de valor suficiente'}
                    </p>
                  </div>
                  <Pilula tom="ouro">revisar produção</Pilula>
                </li>
              ))}
            </ul>
          </Cartao>
          {porPrato[0] && porPrato[0].sobra > 0 && (
            <p className="text-xs font-semibold text-ouro-600 dark:text-ouro-300">
              Na próxima vez que servir <strong>{porPrato[0].prato}</strong>, compare demanda prevista, refeições reais e sobra antes de reduzir a produção automaticamente.
            </p>
          )}
        </Secao>
      )}

      <Secao titulo="Lançamentos da semana">
        {registros.length === 0 ? (
          <EstadoVazio titulo="Nenhuma sobra registrada" texto="Anote a sobra de cada dia para o app calcular taxa, valor e relação com a demanda." />
        ) : (
          <Cartao className="!p-0">
            <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
              {registros
                .slice()
                .reverse()
                .map((r) => {
                  const valor = valores.get(r.id)?.valor;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {r.prato} <span className="font-normal text-texto-suave">· {DIAS_SEMANA[r.dia].slice(0, 3)}</span>
                        </p>
                        <p className="text-caption text-texto-suave">
                          produziu {formatarQtd(r.produzido)} · consumiu {formatarQtd(r.consumido)} {r.unid}
                          {valor != null ? ` · ≈ ${formatarReais(valor)}` : ''}
                          {r.motivo ? ` · ${r.motivo}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pilula tom="ouro">{formatarQtd(Math.max(0, r.produzido - r.consumido))} sobra</Pilula>
                        {podeEditar && (
                          <button
                            onClick={() => removerComUndo(r)}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-carvao-300 hover:bg-perigo/10 hover:text-perigo"
                            aria-label="Remover"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Cartao>
        )}
      </Secao>
    </div>
  );
}
