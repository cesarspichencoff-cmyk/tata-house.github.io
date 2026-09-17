'use client';

import { useMemo, useState } from 'react';
import { formatarReais } from '@/lib/cardapio/motor';
import {
  avaliarSemanaInteligente,
  planejarSemanaInteligente,
  type AceitacaoPlanejamento,
  type PropostaSemanaInteligente,
} from '@/lib/cardapio/planejador-inteligente';
import type { DiaCardapio } from '@/lib/cardapio/tipos';

export function PlanejadorInteligente({
  diasAtuais,
  precos,
  aceitacao,
  frequencia,
  aoAplicar,
}: {
  diasAtuais: DiaCardapio[];
  precos: Record<string, number>;
  aceitacao: Record<string, AceitacaoPlanejamento>;
  frequencia: Record<string, number>;
  aoAplicar: (dias: DiaCardapio[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [propostas, setPropostas] = useState<PropostaSemanaInteligente[]>([]);
  const [gerando, setGerando] = useState(false);
  const [aplicado, setAplicado] = useState<string | null>(null);

  const atual = useMemo(
    () => avaliarSemanaInteligente(diasAtuais, { precos, aceitacao, frequencia }),
    [diasAtuais, precos, aceitacao, frequencia],
  );

  const gerar = () => {
    setGerando(true);
    setAplicado(null);
    // Deixa o estado de carregamento renderizar antes do trabalho síncrono.
    window.setTimeout(() => {
      const novas = planejarSemanaInteligente({
        pessoas: diasAtuais.map((d) => d.pessoas),
        precos,
        aceitacao,
        frequencia,
      });
      setPropostas(novas);
      setGerando(false);
      setAberto(true);
    }, 20);
  };

  const aplicar = (p: PropostaSemanaInteligente) => {
    aoAplicar(p.dias);
    setAplicado(p.perfil);
  };

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-white to-brand-50/70 p-4 shadow-sm dark:border-brand-900 dark:from-carvao-900 dark:to-brand-950/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-carvao-900 dark:text-white">Planejar semana</p>
          <p className="mt-0.5 text-caption leading-relaxed text-texto-suave">
            Compara três estratégias antes de alterar o cardápio: equilíbrio, economia e variedade.
          </p>
        </div>
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          className="shrink-0 rounded-xl bg-brand-700 px-3 py-2 text-caption font-bold text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {gerando ? 'Analisando…' : propostas.length ? 'Recalcular' : 'Planejar'}
        </button>
      </div>

      {diasAtuais.some((d) => d.principal) && (
        <div className="mt-3 flex flex-wrap gap-2 text-micro text-carvao-500 dark:text-areia-400">
          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-carvao-100 dark:bg-carvao-800 dark:ring-carvao-700">
            Atual: {atual.custoPorRefeicao > 0 ? `${formatarReais(atual.custoPorRefeicao)}/ref.` : 'custo incompleto'}
          </span>
          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-carvao-100 dark:bg-carvao-800 dark:ring-carvao-700">
            {Math.round(atual.coberturaPreco * 100)}% preços cobertos
          </span>
          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-carvao-100 dark:bg-carvao-800 dark:ring-carvao-700">
            {atual.repeticoesRecentes} repetição(ões) recente(s)
          </span>
        </div>
      )}

      {aberto && (
        <div className="mt-4 space-y-3 border-t border-brand-100 pt-4 dark:border-brand-900">
          {propostas.length === 0 ? (
            <p className="text-sm text-perigo">Não encontrei três propostas válidas com os dados atuais. Complete preços ou ajuste as regras.</p>
          ) : propostas.map((p) => {
            const economia = atual.custoPorRefeicao > 0 && p.metricas.custoPorRefeicao > 0
              ? atual.custoPorRefeicao - p.metricas.custoPorRefeicao
              : 0;
            return (
              <div key={p.perfil} className="rounded-2xl border border-carvao-150 bg-white p-3.5 dark:border-carvao-700 dark:bg-carvao-850">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-carvao-900 dark:text-white">{p.titulo}</p>
                    <p className="text-caption text-texto-suave">{p.subtitulo}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => aplicar(p)}
                    className="shrink-0 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-caption font-bold text-brand-800 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-200"
                  >
                    {aplicado === p.perfil ? '✓ Aplicado' : 'Usar esta'}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metrica rotulo="Custo/ref." valor={p.metricas.custoPorRefeicao > 0 ? formatarReais(p.metricas.custoPorRefeicao) : '—'} />
                  <Metrica rotulo="Preços" valor={`${Math.round(p.metricas.coberturaPreco * 100)}%`} />
                  <Metrica rotulo="Aceitação" valor={p.metricas.aceitacaoMedia !== null ? `${p.metricas.aceitacaoMedia.toFixed(1)}/5` : 'sem base'} />
                  <Metrica rotulo="Repetição" valor={String(p.metricas.repeticoesRecentes)} />
                </div>

                {economia > 0.01 && (
                  <p className="mt-2 text-caption font-semibold text-emerald-700 dark:text-emerald-400">
                    Economia estimada de {formatarReais(economia)} por refeição versus o cardápio atual.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-7 gap-1">
                  {p.dias.map((d, i) => (
                    <div key={i} className="min-w-0 rounded-lg bg-carvao-50 px-1.5 py-2 text-center dark:bg-carvao-800">
                      <p className="text-[9px] font-bold uppercase text-texto-suave">{['S','T','Q','Q','S','S','D'][i]}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-carvao-700 dark:text-areia-200" title={d.principal}>
                        {d.principal || '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <ul className="mt-3 space-y-1">
                  {p.motivos.map((m) => (
                    <li key={m} className="text-caption leading-relaxed text-carvao-600 dark:text-areia-300">• {m}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-micro leading-relaxed text-texto-suave">
            Nenhuma proposta é aplicada automaticamente. Você compara e escolhe; depois ainda pode editar qualquer dia manualmente.
          </p>
        </div>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-carvao-50 px-2 py-2 dark:bg-carvao-800">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-texto-suave">{rotulo}</p>
      <p className="mt-0.5 text-xs font-bold tabular-nums text-carvao-800 dark:text-areia-100">{valor}</p>
    </div>
  );
}
