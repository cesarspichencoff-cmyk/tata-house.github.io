'use client';

/* =====================================================================
   Linha do Tempo da Casa — a operação contada como história.
   Lê 485 dias reais de refeições (set/2024 →) e transforma em capítulos:
   o começo, a consolidação, o ano em curso e o mês recorde. Tudo
   verdadeiro, extraído das contagens do WhatsApp — nada inventado.
   ===================================================================== */

import { useMemo } from 'react';
import { linhaDoTempoCasa } from '@/lib/cardapio/refeicoes';
import { useContagemRefeicoes } from '@/lib/cardapio/estado';

function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const w = 100;
  const h = 26;
  const passo = w / (valores.length - 1);
  const pts = valores.map((v, i) => `${(i * passo).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`);
  const idxMax = valores.indexOf(Math.max(...valores));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={idxMax * passo} cy={h - (valores[idxMax] / 100) * h} r={2} fill="currentColor" />
    </svg>
  );
}

export function LinhaTempoCasa() {
  const { contagens } = useContagemRefeicoes();
  const lt = useMemo(() => linhaDoTempoCasa(), [contagens]);
  if (!lt || lt.capitulos.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-carvao-100 shadow-suave dark:bg-carvao-850 dark:ring-carvao-700">
      {/* Cabeçalho narrativo */}
      <div className="bg-gradient-to-br from-carvao-900 via-carvao-850 to-brand-900 px-5 py-5 text-white">
        <p className="text-micro font-bold uppercase tracking-[0.18em] text-brand-200/80">A história da casa</p>
        <p className="mt-2 font-display text-2xl font-bold leading-tight">
          {lt.totalRefeicoes.toLocaleString('pt-BR')} refeições servidas
        </p>
        <p className="mt-1 text-sm text-areia-100/70">
          desde {lt.inicio} · {lt.totalDias} dias de operação registrados · histórico + operação atual
        </p>
        <div className="mt-3 text-brand-300/70">
          <Sparkline valores={lt.sparkline} />
        </div>
        {lt.mesRecorde && (
          <p className="mt-2 text-caption text-areia-100/60">
            Mês recorde: <span className="font-bold text-white">{lt.mesRecorde.rotulo}</span> com{' '}
            {lt.mesRecorde.total.toLocaleString('pt-BR')} refeições
          </p>
        )}
      </div>

      {/* Conquistas da casa — marcos que geram orgulho */}
      {lt.conquistas.length > 0 && (
        <div className="border-b border-carvao-100 px-5 py-4 dark:border-carvao-700">
          <p className="mb-3 text-micro font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
            Conquistas da casa
          </p>
          <div className="grid grid-cols-2 gap-2">
            {lt.conquistas.map((c) => (
              <div
                key={c.titulo}
                className="flex items-start gap-2.5 rounded-2xl bg-areia-50 px-3 py-2.5 dark:bg-carvao-800/60"
              >
                <span className="text-lg leading-none">{c.icone}</span>
                <div className="min-w-0">
                  <p className="text-micro font-bold uppercase tracking-wider text-texto-suave">{c.titulo}</p>
                  <p className="mt-0.5 text-sm font-bold leading-snug text-carvao-800 dark:text-areia-100">{c.valor}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capítulos por ano */}
      <ol className="relative space-y-0 px-5 py-4">
        {lt.capitulos.map((c, i) => (
          <li key={c.ano} className="relative flex gap-4 pb-5 last:pb-0">
            {/* trilho */}
            <div className="flex flex-col items-center">
              <span className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-caption font-bold text-white">
                {c.ano.slice(2)}
              </span>
              {i < lt.capitulos.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-carvao-200 dark:bg-carvao-700" />
              )}
            </div>
            {/* conteúdo */}
            <div className="min-w-0 flex-1 pt-1">
              <p className="font-display text-base font-bold text-carvao-900 dark:text-white">{c.titulo}</p>
              <p className="mt-0.5 text-sm text-carvao-600 dark:text-areia-200">{c.destaque}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-texto-suave">
                <span>{c.refeicoes.toLocaleString('pt-BR')} refeições</span>
                <span>·</span>
                <span>{c.dias} dias</span>
                <span>·</span>
                <span>{c.mediaDia}/dia</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
