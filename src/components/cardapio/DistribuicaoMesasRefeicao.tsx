'use client';

import { useEffect, useMemo, useState } from 'react';
import { Botao, estiloInput } from '@/components/ui';
import {
  PONTOS_REFEICAO,
  ROTULO_PONTO_REFEICAO,
  conciliarRefeicoesPorPonto,
  type DistribuicaoRefeicoesPorPonto,
  type PontoRefeicao,
  type QuantidadeRefeicoes,
} from '@/lib/cardapio/pontos-refeicao';
import {
  assinarPontosRefeicaoDia,
  lerPontosRefeicaoDia,
  salvarPontosRefeicaoDia,
} from '@/lib/cardapio/pontos-refeicao-storage';

interface CamposPonto {
  almoco: string;
  jantar: string;
  marmitas: string;
}

type Campos = Record<PontoRefeicao, CamposPonto>;

const VAZIO: CamposPonto = { almoco: '', jantar: '', marmitas: '' };

function camposVazios(): Campos {
  return { itaim: { ...VAZIO }, pinheiros: { ...VAZIO } };
}

function camposDoRegistro(data: string): Campos {
  const registro = lerPontosRefeicaoDia(data);
  if (!registro) return camposVazios();
  const saida = camposVazios();
  for (const ponto of PONTOS_REFEICAO) {
    const q = registro.porPonto[ponto];
    if (!q) continue;
    saida[ponto] = {
      almoco: String(q.almoco),
      jantar: String(q.jantar),
      marmitas: String(q.marmitas),
    };
  }
  return saida;
}

function numero(valor: string): number {
  if (valor.trim() === '') return 0;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function distribuicaoDosCampos(campos: Campos): DistribuicaoRefeicoesPorPonto {
  return {
    itaim: {
      almoco: numero(campos.itaim.almoco),
      jantar: numero(campos.itaim.jantar),
      marmitas: numero(campos.itaim.marmitas),
    },
    pinheiros: {
      almoco: numero(campos.pinheiros.almoco),
      jantar: numero(campos.pinheiros.jantar),
      marmitas: numero(campos.pinheiros.marmitas),
    },
  };
}

function descricaoDiferenca(total: QuantidadeRefeicoes, distribuido: QuantidadeRefeicoes): string {
  const partes: string[] = [];
  const itens: Array<[keyof QuantidadeRefeicoes, string]> = [
    ['almoco', 'almoço'],
    ['jantar', 'jantar'],
    ['marmitas', 'marmitas'],
  ];
  for (const [chave, rotulo] of itens) {
    const diff = distribuido[chave] - total[chave];
    if (diff < 0) partes.push(`faltam ${Math.abs(diff)} em ${rotulo}`);
    if (diff > 0) partes.push(`sobram ${diff} em ${rotulo}`);
  }
  return partes.join(' · ');
}

export function DistribuicaoMesasRefeicao({
  data,
  total,
}: {
  data: string;
  total: QuantidadeRefeicoes;
}) {
  const [campos, setCampos] = useState<Campos>(() => camposDoRegistro(data));
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const recarregar = () => setCampos(camposDoRegistro(data));
    recarregar();
    return assinarPontosRefeicaoDia(data, recarregar);
  }, [data]);

  const distribuicao = useMemo(() => distribuicaoDosCampos(campos), [campos]);
  const conciliacao = useMemo(
    () => conciliarRefeicoesPorPonto(total, distribuicao),
    [total, distribuicao],
  );
  const registroExistente = lerPontosRefeicaoDia(data);
  const temPreenchimento = PONTOS_REFEICAO.some((ponto) =>
    Object.values(campos[ponto]).some((valor) => valor.trim() !== ''),
  );
  const podeSalvar = temPreenchimento && conciliacao.status === 'conciliado';

  const alterar = (ponto: PontoRefeicao, campo: keyof CamposPonto, valor: string) => {
    setSalvo(false);
    setErro('');
    setCampos((atual) => ({
      ...atual,
      [ponto]: { ...atual[ponto], [campo]: valor },
    }));
  };

  const salvar = () => {
    if (!podeSalvar) return;
    const registro = salvarPontosRefeicaoDia(data, distribuicao);
    if (!registro) {
      setErro('Não foi possível salvar a divisão. Os totais do dia não foram alterados.');
      return;
    }
    setErro('');
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2500);
  };

  const diferenca = descricaoDiferenca(conciliacao.total, conciliacao.distribuido);

  return (
    <details className="rounded-2xl border border-carvao-200 bg-white/70 p-3 dark:border-carvao-700 dark:bg-carvao-900/40" open={Boolean(registroExistente)}>
      <summary className="cursor-pointer list-none text-xs font-bold text-carvao-700 dark:text-carvao-200">
        <span className="flex items-center justify-between gap-3">
          <span>Mesas de refeição <span className="font-normal text-texto-suave">· opcional</span></span>
          <span className={`rounded-full px-2 py-0.5 text-micro ${
            registroExistente
              ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
              : 'bg-carvao-100 text-texto-suave dark:bg-carvao-800'
          }`}>
            {registroExistente ? 'Itaim + Pinheiros' : 'não dividido'}
          </span>
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-texto-suave">
          Divida somente se souber os números reais. O total oficial do dia continua sendo o registro acima.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {PONTOS_REFEICAO.map((ponto) => (
            <div key={ponto} className="rounded-xl bg-carvao-50 p-3 dark:bg-carvao-800/60">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-carvao-600 dark:text-carvao-300">
                {ROTULO_PONTO_REFEICAO[ponto]}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['almoco', 'jantar', 'marmitas'] as const).map((campo) => (
                  <label key={campo} className="space-y-1">
                    <span className="block text-micro font-semibold text-texto-suave">
                      {campo === 'almoco' ? 'Almoço' : campo === 'jantar' ? 'Jantar' : 'Marmitas'}
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className={estiloInput}
                      value={campos[ponto][campo]}
                      onChange={(e) => alterar(ponto, campo, e.target.value)}
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {temPreenchimento && conciliacao.status === 'divergente' && (
          <p className="rounded-xl bg-ouro-300/15 px-3 py-2 text-xs font-semibold text-ouro-700 dark:text-ouro-300">
            A divisão ainda não fecha com o total: {diferenca}.
          </p>
        )}
        {temPreenchimento && conciliacao.status === 'conciliado' && (
          <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
            ✓ Itaim + Pinheiros conferem exatamente com o total do dia.
          </p>
        )}
        {erro && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300">
            {erro}
          </p>
        )}

        <Botao onClick={salvar} variante={salvo ? 'sucesso' : 'secundario'} disabled={!podeSalvar} className="w-full">
          {salvo ? '✓ Divisão salva' : 'Salvar divisão Itaim / Pinheiros'}
        </Botao>
      </div>
    </details>
  );
}
