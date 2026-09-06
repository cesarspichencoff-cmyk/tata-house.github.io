'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSubstituicoes } from '@/lib/cardapio/estado';
import {
  aplicarTrocaGovernanca,
  podeAplicarTrocaGovernanca,
  ranquearTrocasGovernanca,
  type ImpactoTrocaGovernanca,
} from '@/lib/cardapio/governanca-trocas';
import { DIAS_SEMANA, formatarReais, normalizar } from '@/lib/cardapio/motor';
import type { Aceitacao, EstadoSemana, MotivoSubstituicao } from '@/lib/cardapio/tipos';

const MOTIVOS: { id: MotivoSubstituicao; rotulo: string }[] = [
  { id: 'preco', rotulo: 'Preço' },
  { id: 'estoque', rotulo: 'Estoque' },
  { id: 'qualidade', rotulo: 'Qualidade' },
  { id: 'variedade', rotulo: 'Variedade' },
  { id: 'outro', rotulo: 'Outro' },
];

function valorDelta(v: number | null): string {
  if (v === null) return 'Não comparável';
  if (Math.abs(v) < 0.005) return 'Sem diferença';
  return `${v > 0 ? '+' : '−'} ${formatarReais(Math.abs(v))}`;
}

function TomDelta({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-texto-suave">{valorDelta(valor)}</span>;
  const cls = valor < 0 ? 'text-brand-700 dark:text-brand-300' : valor > 0 ? 'text-ouro-700 dark:text-ouro-300' : 'text-texto-suave';
  return <span className={cls}>{valorDelta(valor)}</span>;
}

function CardTroca({
  item,
  podeAplicar,
  motivo,
  aoAplicar,
}: {
  item: ImpactoTrocaGovernanca;
  podeAplicar: boolean;
  motivo: MotivoSubstituicao | '';
  aoAplicar: () => void;
}) {
  return (
    <article
      data-testid={`troca-${item.norm}`}
      className={`rounded-2xl border p-4 ${
        item.bloqueada
          ? 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/10'
          : 'border-carvao-100 bg-white dark:border-carvao-800 dark:bg-carvao-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-carvao-900 dark:text-areia-100">{item.nome}</h4>
          <p className="mt-1 text-[11px] text-texto-suave">
            {item.proteina} · nutrição {item.nutricao}/100
            {item.aprendizado ? ` · já testada ${item.aprendizado.n}×` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
          item.bloqueada
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            : item.deltaErros < 0
              ? 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
              : 'bg-carvao-100 text-carvao-600 dark:bg-carvao-800 dark:text-carvao-200'
        }`}>
          {item.bloqueada ? 'Piora regra' : item.deltaErros < 0 ? 'Corrige regra' : 'Viável'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl bg-carvao-50 p-2.5 dark:bg-carvao-800/70">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Custo/ref.</p>
          <p className="mt-1 font-bold"><TomDelta valor={item.deltaCustoPorRefeicao} /></p>
        </div>
        <div className="rounded-xl bg-carvao-50 p-2.5 dark:bg-carvao-800/70">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Aceitação</p>
          <p className="mt-1 font-bold">{item.aceitacao === null ? 'Sem amostra' : `${item.aceitacao.toFixed(1)}/5`}</p>
        </div>
        <div className="rounded-xl bg-carvao-50 p-2.5 dark:bg-carvao-800/70">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Recente</p>
          <p className="mt-1 font-bold">{item.repeticaoRecente}×</p>
        </div>
        <div className="rounded-xl bg-carvao-50 p-2.5 dark:bg-carvao-800/70">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Estoque</p>
          <p className="mt-1 font-bold">{item.coberturaEstoquePct}%</p>
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-carvao-100 px-3 py-2 dark:border-carvao-800">
        <summary className="cursor-pointer text-xs font-extrabold text-carvao-600 dark:text-carvao-200">Impacto desta troca</summary>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-texto-suave">
          {item.motivos.map((m) => <li key={m}>• {m}</li>)}
        </ul>
      </details>

      <button
        type="button"
        data-testid={`aplicar-troca-${item.norm}`}
        onClick={aoAplicar}
        disabled={!podeAplicar || !motivo || item.bloqueada}
        className="mt-3 w-full rounded-xl bg-carvao-900 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-carvao-700 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-areia-100 dark:text-carvao-900"
      >
        {item.bloqueada ? 'Não aplicar — piora regra' : !motivo ? 'Informe o motivo para aplicar' : 'Aplicar ao rascunho'}
      </button>
    </article>
  );
}

export function TrocaInteligenteGovernanca({
  semanaId,
  estado,
  atualizar,
  precos,
  estimativas,
  fatores,
  mostrarBasicos,
  aceitacao,
  frequencia,
  estoque,
}: {
  semanaId: string;
  estado: EstadoSemana;
  atualizar: (fn: (estado: EstadoSemana) => EstadoSemana) => void;
  precos: Record<string, number>;
  estimativas: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
  estoque: Record<string, number>;
}) {
  const primeiroPreenchido = Math.max(0, estado.dias.findIndex((d) => d.principal.trim()));
  const [diaIndice, setDiaIndice] = useState(primeiroPreenchido);
  const [alternativas, setAlternativas] = useState<ImpactoTrocaGovernanca[]>([]);
  const [motivo, setMotivo] = useState<MotivoSubstituicao | ''>('');
  const [mensagem, setMensagem] = useState('');
  const { registros, registrar } = useSubstituicoes();
  const atual = estado.dias[diaIndice]?.principal ?? '';

  useEffect(() => {
    if (!atual && primeiroPreenchido >= 0) setDiaIndice(primeiroPreenchido);
  }, [atual, primeiroPreenchido]);

  useEffect(() => {
    setAlternativas([]);
    setMotivo('');
    setMensagem('');
  }, [diaIndice, atual]);

  const permissao = useMemo(
    () => podeAplicarTrocaGovernanca(estado, diaIndice),
    [estado, diaIndice],
  );

  const buscar = () => {
    if (!atual.trim()) {
      setMensagem('Este dia ainda não tem prato principal para substituir.');
      setAlternativas([]);
      return;
    }
    const lista = ranquearTrocasGovernanca({
      estado,
      diaIndice,
      precos,
      estimativas,
      fatores,
      mostrarBasicos,
      aceitacao,
      frequencia,
      estoque,
      substituicoes: registros,
    }, 6);
    setAlternativas(lista);
    setMensagem(lista.length
      ? 'Alternativas ordenadas por regras → aceitação real → aprendizado da casa → repetição → custo → nutrição → estoque.'
      : 'Não encontrei alternativas elegíveis com os dados carregados.');
  };

  const aplicar = (item: ImpactoTrocaGovernanca) => {
    if (!motivo || !permissao.ok || item.bloqueada) return;
    const original = atual;
    atualizar((e) => aplicarTrocaGovernanca(e, diaIndice, item.nome));
    registrar({
      semanaId,
      dia: diaIndice,
      nomeOriginal: original,
      nomeSubstituto: item.nome,
      normOriginal: normalizar(original),
      normSubstituto: item.norm,
      motivo,
    });
    setAlternativas([]);
    setMensagem(`Troca aplicada apenas ao rascunho: ${original} → ${item.nome}. A decisão ficou registrada para aprendizado futuro.`);
    setMotivo('');
  };

  if (!estado.dias.some((d) => d.principal.trim())) return null;

  return (
    <section data-testid="troca-inteligente" className="rounded-3xl border border-carvao-100 bg-white p-4 shadow-sm dark:border-carvao-800 dark:bg-carvao-900 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">Ajuste inteligente por dia</p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Troque um prato vendo o impacto antes</h2>
          <p className="mt-2 text-sm leading-6 text-texto-suave">
            Nada é substituído automaticamente. A lista prioriza alternativas que não pioram regras e mostra evidência real de aceitação, custo, repetição e estoque.
          </p>
        </div>
        <div className="rounded-2xl bg-carvao-50 px-4 py-3 text-xs text-carvao-600 dark:bg-carvao-800 dark:text-carvao-200">
          <strong>Ordem transparente:</strong> não há score oculto.
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Dias da semana">
        {estado.dias.map((dia, i) => (
          <button
            key={i}
            type="button"
            data-testid={`troca-dia-${i}`}
            onClick={() => setDiaIndice(i)}
            className={`min-w-[112px] rounded-xl border px-3 py-2 text-left transition ${
              diaIndice === i
                ? 'border-brand-400 bg-brand-50 dark:border-brand-700 dark:bg-brand-950/30'
                : 'border-carvao-100 bg-white dark:border-carvao-800 dark:bg-carvao-900'
            }`}
          >
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">{DIAS_SEMANA[i]}</span>
            <span className="mt-1 block truncate text-xs font-bold">{dia.principal || 'Sem principal'}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <div className="rounded-2xl bg-areia-50 px-4 py-3 dark:bg-carvao-950/40">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Prato atual</p>
          <p data-testid="troca-prato-atual" className="mt-1 text-sm font-extrabold">{atual || '—'}</p>
          {!permissao.ok && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">{permissao.motivo}</p>}
        </div>
        <label className="block">
          <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-wider text-texto-suave">Motivo da decisão</span>
          <select
            data-testid="motivo-troca"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoSubstituicao | '')}
            className="h-11 w-full rounded-xl border border-carvao-200 bg-white px-3 text-xs font-bold dark:border-carvao-700 dark:bg-carvao-800"
          >
            <option value="">Selecione…</option>
            {MOTIVOS.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
          </select>
        </label>
        <button
          type="button"
          data-testid="buscar-trocas"
          onClick={buscar}
          disabled={!atual.trim()}
          className="h-11 rounded-xl bg-brand-600 px-5 text-xs font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Ver melhores trocas
        </button>
      </div>

      {mensagem && <p data-testid="mensagem-troca" className="mt-3 text-xs font-semibold text-carvao-500 dark:text-carvao-300">{mensagem}</p>}

      {alternativas.length > 0 && (
        <div data-testid="lista-trocas" className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {alternativas.map((item) => (
            <CardTroca
              key={item.norm}
              item={item}
              podeAplicar={permissao.ok}
              motivo={motivo}
              aoAplicar={() => aplicar(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
