'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cartao, Kpi, estiloInput, estiloRotulo, Botao } from '@/components/ui';
import { DIAS_SEMANA, formatarReais, linhasDoDia } from '@/lib/cardapio/motor';
import { calcularStats, calcularTendenciaMensal } from '@/lib/cardapio/refeicoes';
import { MEDIA_POR_DIA } from '@/lib/cardapio/media-diaria';
import type { StatsRefeicoes, MesTendencia } from '@/lib/cardapio/refeicoes';
import type { ContagemRefeicoesDia, EstadoSemana, Papel } from '@/lib/cardapio/tipos';
import { DistribuicaoMesasRefeicao } from '@/components/cardapio/DistribuicaoMesasRefeicao';

const DIAS_ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function semanaAtual(): string[] {
  const agora = new Date();
  const diaSem = (agora.getDay() + 6) % 7;
  const segunda = new Date(agora);
  segunda.setDate(agora.getDate() - diaSem);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

function displayData(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function diaSemDaData(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DIAS_ABREV[((new Date(y, m - 1, d).getDay() + 6) % 7)];
}

function mediasPorDiaSemana(contagens: ContagemRefeicoesDia[]): Record<number, { almoco: number; jantar: number; marmitas: number; n: number }> {
  const acc: Record<number, { almoco: number; jantar: number; marmitas: number; n: number }> = {};
  contagens.forEach((c) => {
    const [y, m, d] = c.data.split('-').map(Number);
    const ds = (new Date(y, m - 1, d).getDay() + 6) % 7;
    if (!acc[ds]) acc[ds] = { almoco: 0, jantar: 0, marmitas: 0, n: 0 };
    acc[ds].almoco += c.almoco;
    acc[ds].jantar += c.jantar;
    acc[ds].marmitas += c.marmitas;
    acc[ds].n += 1;
  });
  Object.values(acc).forEach((v) => {
    v.almoco = Math.round(v.almoco / v.n);
    v.jantar = Math.round(v.jantar / v.n);
    v.marmitas = Math.round(v.marmitas / v.n);
  });
  return acc;
}

const GRAFICO_H = 56; // px — h-14

function GraficoMensal({ dados }: { dados: MesTendencia[] }) {
  const max = Math.max(...dados.map((d) => d.total), 1);
  const mesAtualIdx = dados.length - 1;
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-1" style={{ height: GRAFICO_H }}>
        {dados.map((d, i) => {
          const h = d.total === 0 ? 3 : Math.max(3, Math.round((d.total / max) * GRAFICO_H));
          const isAtual = i === mesAtualIdx;
          return (
            <div key={i} className="group relative flex flex-1 flex-col justify-end">
              <div
                className="pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-carvao-900 px-2 py-1 text-micro font-semibold text-white group-hover:block"
                style={{ bottom: h + 4 }}
              >
                {d.total.toLocaleString('pt-BR')}
              </div>
              <div
                className={`w-full rounded-t-sm transition-all ${d.total === 0 ? 'bg-carvao-100 dark:bg-carvao-800' : isAtual ? 'bg-brand-600' : 'bg-brand-200 dark:bg-brand-800'}`}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {dados.map((d, i) => (
          <span key={i} className={`flex-1 text-center text-micro ${i === mesAtualIdx ? 'font-bold text-brand-600 dark:text-brand-400' : 'text-texto-suave'}`}>
            {d.mes}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniBar({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const DATAS_SEMANA = semanaAtual();
const DATA_HOJE = hoje();
const DIA_HOJE_IDX = DATAS_SEMANA.indexOf(DATA_HOJE);

export function AbaContagem({
  contagens,
  onRegistrar,
  estado,
  atualizar,
  precos = {},
  fatores,
  papel = 'gestor',
}: {
  contagens: ContagemRefeicoesDia[];
  onRegistrar: (c: Omit<ContagemRefeicoesDia, 'registradoEm'>) => void;
  estado: EstadoSemana;
  atualizar: (fn: (e: EstadoSemana) => EstadoSemana) => void;
  precos?: Record<string, number>;
  fatores?: Record<string, number>;
  papel?: Papel;
}) {
  const podeContar = papel === 'cozinha' || papel === 'gestor' || papel === 'administrador';

  /* ── Dia activo (padrão: hoje se na semana, senão segunda) ─────────── */
  const [diaAtivo, setDiaAtivo] = useState(DIA_HOJE_IDX >= 0 ? DIA_HOJE_IDX : 0);

  /* ── Formulário do dia activo ──────────────────────────────────────── */
  const [almoco, setAlmoco] = useState('');
  const [jantar, setJantar] = useState('');
  const [marmitas, setMarmitas] = useState('');
  const [obs, setObs] = useState('');
  const [salvo, setSalvo] = useState(false);

  const selecionar = (idx: number) => {
    setDiaAtivo(idx);
    setSalvo(false);
    const iso = DATAS_SEMANA[idx];
    const reg = contagens.find((c) => c.data === iso);
    if (reg) {
      setAlmoco(String(reg.almoco));
      setJantar(String(reg.jantar));
      setMarmitas(String(reg.marmitas));
      setObs(reg.obs ?? '');
    } else {
      setAlmoco('');
      setJantar('');
      setMarmitas('');
      setObs('');
    }
  };

  const handleSalvar = () => {
    const a = Number(almoco) || 0;
    const j = Number(jantar) || 0;
    const m = Number(marmitas) || 0;
    const iso = DATAS_SEMANA[diaAtivo];
    // grava no histórico detalhado
    onRegistrar({ data: iso, almoco: a, jantar: j, marmitas: m, obs: obs.trim() || undefined });
    // sincroniza o total no estado da semana
    atualizar((s) => ({
      ...s,
      refeicoes: { ...(s.refeicoes ?? {}), [diaAtivo]: a + j + m },
    }));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  /* ── Totais por dia (histórico prevalece sobre estado.refeicoes) ───── */
  const totaisDia = useMemo(() =>
    DATAS_SEMANA.map((iso, i) => {
      const reg = contagens.find((c) => c.data === iso);
      if (reg) return reg.almoco + reg.jantar + reg.marmitas;
      return (estado.refeicoes ?? {})[i] ?? 0;
    }),
    [contagens, estado.refeicoes],
  );

  const totalSemana = totaisDia.reduce((s, n) => s + n, 0);

  /* ── Custo/refeição ─────────────────────────────────────────────────── */
  const custoSemana = useMemo(() =>
    estado.dias.reduce(
      (t, _, di) =>
        t + linhasDoDia(estado, di, fatores).reduce((s, l) => {
          const p = l.status.precoPago ?? precos[l.chave];
          return p > 0 ? s + p * (l.status.compradoQtd ?? l.qtd) : s;
        }, 0),
      0,
    ),
    [estado, precos, fatores],
  );

  const custoPorRefeicao = totalSemana > 0 && custoSemana > 0 ? custoSemana / totalSemana : null;

  /* ── Estatísticas históricas ─────────────────────────────────────────── */
  const ultimas30 = contagens.slice(0, 30);
  const medias = useMemo(() => mediasPorDiaSemana(ultimas30), [ultimas30]);
  const totalSemanaStats = useMemo(() => {
    const cutoff = new Date(DATA_HOJE);
    const ultimos7 = contagens.filter((c) => {
      const dc = new Date(c.data);
      return (cutoff.getTime() - dc.getTime()) / 86400000 < 7;
    });
    return ultimos7.reduce(
      (s, c) => ({ almoco: s.almoco + c.almoco, jantar: s.jantar + c.jantar, marmitas: s.marmitas + c.marmitas }),
      { almoco: 0, jantar: 0, marmitas: 0 },
    );
  }, [contagens]);

  const maxMedMedia = Math.max(...Object.values(medias).map((v) => Math.max(v.almoco, v.jantar, v.marmitas)), 1);

  /* ── Stats históricos (dataset completo) ─────────────────────────── */
  const [statsHist, setStatsHist] = useState<StatsRefeicoes | null>(null);
  const [tendencia, setTendencia] = useState<MesTendencia[]>([]);
  useEffect(() => {
    setStatsHist(calcularStats());
    setTendencia(calcularTendenciaMensal());
  }, []);

  /* ── Alerta de pico para o dia selecionado ──────────────────────── */
  const dowAtivo = new Date(DATAS_SEMANA[diaAtivo]).getDay();
  const mediaDiaAtivo = MEDIA_POR_DIA[dowAtivo];
  const isPico = diaAtivo === DIA_HOJE_IDX && totaisDia[diaAtivo] > 0
    && totaisDia[diaAtivo] >= Math.round(mediaDiaAtivo.total * 1.2);

  /* ── Registro do dia activo ─────────────────────────────────────────── */
  const regAtivo = contagens.find((c) => c.data === DATAS_SEMANA[diaAtivo]);

  return (
    <div className="space-y-5">

      {/* ── Painel unificado ──────────────────────────────────────────── */}
      <Cartao className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-extrabold uppercase tracking-widest text-texto-suave">
            Refeições
          </p>
          {custoPorRefeicao !== null && (
            <span className="rounded-full bg-brand-500/10 px-3 py-1 text-sm font-extrabold text-brand-700 ring-1 ring-brand-500/30 dark:text-brand-300">
              {formatarReais(custoPorRefeicao)} / refeição
            </span>
          )}
        </div>

        {/* Seletor de dia */}
        <div className="grid grid-cols-7 gap-1">
          {DATAS_SEMANA.map((iso, i) => {
            const total = totaisDia[i];
            const ativo = i === diaAtivo;
            const ehHoje = iso === DATA_HOJE;
            return (
              <button
                key={i}
                onClick={() => selecionar(i)}
                className={`flex flex-col items-center rounded-xl py-2 px-1 transition ${
                  ativo
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-carvao-50 text-carvao-600 hover:bg-carvao-100 dark:bg-carvao-800 dark:text-carvao-300 dark:hover:bg-carvao-700'
                }`}
              >
                <span className={`text-micro font-extrabold uppercase tracking-wide ${ativo ? 'text-white/70' : 'text-texto-suave'}`}>
                  {DIAS_SEMANA[i].slice(0, 3)}
                </span>
                <span className={`text-xs tabular-nums ${ehHoje && !ativo ? 'font-extrabold text-brand-600 dark:text-brand-400' : ''}`}>
                  {displayData(iso)}
                </span>
                <span className={`mt-0.5 text-sm font-bold ${total > 0 ? '' : ativo ? 'text-white/40' : 'text-carvao-300 dark:text-carvao-600'}`}>
                  {total > 0 ? total : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Formulário do dia selecionado */}
        {podeContar && (
          <div className="space-y-3 rounded-2xl bg-carvao-50 p-4 dark:bg-carvao-800/50">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-xs font-bold text-carvao-500 dark:text-texto-suave">
                {DIAS_SEMANA[diaAtivo]}, {displayData(DATAS_SEMANA[diaAtivo])}
                {regAtivo && (
                  <span className="ml-2 font-normal text-texto-suave">
                    · já registrado: {regAtivo.almoco}A · {regAtivo.jantar}J · {regAtivo.marmitas}M
                  </span>
                )}
              </p>
              {isPico && (
                <span className="rounded-full bg-ouro-400/20 px-2 py-0.5 text-micro font-bold text-ouro-700 dark:text-ouro-300">
                  Pico ↑{Math.round(((totaisDia[diaAtivo] - mediaDiaAtivo.total) / mediaDiaAtivo.total) * 100)}%
                </span>
              )}
            </div>
            {isPico && (
              <p className="rounded-xl bg-ouro-300/15 px-3 py-2 text-xs text-ouro-700 dark:text-ouro-300">
                Dia acima da média histórica ({mediaDiaAtivo.total}). Revise porções e estoque.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={estiloRotulo}>Almoço</label>
                <input type="number" min={0} className={estiloInput} value={almoco}
                  onChange={(e) => setAlmoco(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className={estiloRotulo}>Jantar</label>
                <input type="number" min={0} className={estiloInput} value={jantar}
                  onChange={(e) => setJantar(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className={estiloRotulo}>Marmitas</label>
                <input type="number" min={0} className={estiloInput} value={marmitas}
                  onChange={(e) => setMarmitas(e.target.value)} placeholder="0" />
              </div>
            </div>
            <input
              className={estiloInput} value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação (opcional)"
            />
            <Botao
              onClick={handleSalvar}
              className="w-full"
              variante={salvo ? 'sucesso' : 'primario'}
              disabled={almoco === '' && jantar === '' && marmitas === ''}
            >
              {salvo ? '✓ Salvo!' : `Salvar ${DIAS_SEMANA[diaAtivo]}`}
            </Botao>
            {regAtivo && (
              <DistribuicaoMesasRefeicao
                data={DATAS_SEMANA[diaAtivo]}
                total={{
                  almoco: regAtivo.almoco,
                  jantar: regAtivo.jantar,
                  marmitas: regAtivo.marmitas,
                }}
              />
            )}
          </div>
        )}

        {totalSemana > 0 && (
          <p className="text-xs font-semibold text-texto-suave">
            {totalSemana} refeições na semana
            {custoSemana > 0 && <> · custo da semana ≈ {formatarReais(custoSemana)}</>}
          </p>
        )}
      </Cartao>

      {/* ── Estatísticas ─────────────────────────────────────────────── */}
      {contagens.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi rotulo="Almoços (7d)" valor={totalSemanaStats.almoco} tom="neutro" />
            <Kpi rotulo="Jantares (7d)" valor={totalSemanaStats.jantar} tom="neutro" />
            <Kpi rotulo="Marmitas (7d)" valor={totalSemanaStats.marmitas} tom="neutro" />
          </div>

          <Cartao>
            <p className="mb-4 text-sm font-extrabold uppercase tracking-widest text-texto-suave">
              Médias por dia da semana
            </p>
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((ds) => {
                const m = medias[ds];
                if (!m) return null;
                return (
                  <div key={ds}>
                    <div className="mb-1 flex justify-between text-xs text-carvao-500">
                      <span className="font-semibold">{DIAS_ABREV[ds]}</span>
                      <span>{m.almoco} alm · {m.jantar} jan · {m.marmitas} mar</span>
                    </div>
                    <div className="space-y-1">
                      <MiniBar valor={m.almoco} max={maxMedMedia} cor="bg-brand-500" />
                      <MiniBar valor={m.jantar} max={maxMedMedia} cor="bg-ouro-400" />
                      <MiniBar valor={m.marmitas} max={maxMedMedia} cor="bg-info" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-4 text-caption text-texto-suave">
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-brand-500" />Almoço</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-ouro-400" />Jantar</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-info" />Marmitas</span>
            </div>
          </Cartao>

          <Cartao>
            <p className="mb-4 text-sm font-extrabold uppercase tracking-widest text-texto-suave">
              Histórico recente
            </p>
            <div className="space-y-1.5">
              {ultimas30.slice(0, 14).map((c) => (
                <button
                  key={c.data}
                  onClick={() => {
                    const idx = DATAS_SEMANA.indexOf(c.data);
                    if (idx >= 0) selecionar(idx);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-carvao-50 dark:hover:bg-carvao-800"
                >
                  <span className="w-10 shrink-0 text-xs font-bold text-texto-suave">{diaSemDaData(c.data)}</span>
                  <span className="w-10 text-xs text-carvao-500 tabular-nums">{displayData(c.data)}</span>
                  <span className="flex-1 text-xs text-carvao-600 dark:text-carvao-300 tabular-nums">
                    {c.almoco} · {c.jantar} · {c.marmitas}
                  </span>
                  {c.obs && <span className="truncate text-xs text-texto-suave">{c.obs}</span>}
                </button>
              ))}
            </div>
          </Cartao>
        </>
      )}

      {/* ── Stats históricos — tendência e totais de longo prazo ──── */}
      {statsHist && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-carvao-50 px-3 py-2.5 dark:bg-carvao-800/50">
              <p className="text-micro uppercase tracking-wider text-texto-suave">Este ano</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-carvao-800 dark:text-white">
                {statsHist.anoAtual.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="rounded-2xl bg-carvao-50 px-3 py-2.5 dark:bg-carvao-800/50">
              <p className="text-micro uppercase tracking-wider text-texto-suave">Ano passado</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-carvao-800 dark:text-white">
                {statsHist.anoPassado.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="col-span-2 rounded-2xl bg-carvao-50 px-3 py-2.5 dark:bg-carvao-800/50">
              <p className="text-micro uppercase tracking-wider text-texto-suave">Total histórico</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-carvao-800 dark:text-white">
                {statsHist.totalHistorico.toLocaleString('pt-BR')}
              </p>
              <p className="text-micro text-texto-suave">{statsHist.diasRegistrados.toLocaleString('pt-BR')} dias registrados</p>
            </div>
          </div>
          {tendencia.length > 0 && (
            <Cartao>
              <p className="mb-4 text-sm font-extrabold uppercase tracking-widest text-texto-suave">
                Últimos 12 meses
              </p>
              <GraficoMensal dados={tendencia} />
            </Cartao>
          )}
        </>
      )}

      {contagens.length === 0 && (
        <div className="rounded-2xl bg-carvao-50 py-10 text-center dark:bg-carvao-800/50">
          <p className="text-sm font-semibold text-carvao-500">Sem registros ainda</p>
          <p className="mt-1 text-xs text-texto-suave">
            Clique num dia acima e registre as refeições para gerar métricas e padrões históricos.
          </p>
        </div>
      )}
    </div>
  );
}
