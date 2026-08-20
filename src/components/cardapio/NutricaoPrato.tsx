'use client';

/* =====================================================================
   Nutrição por prato — visão principal (item 1). Mostra, direto no card
   do dia, os macros da porção e o índice nutricional do prato, para
   identificar num relance pratos saudáveis, com excesso de sódio,
   proteína insuficiente ou calorias altas. A visão semanal continua
   como complemento (IndicadorNutricional).
   ===================================================================== */

import { useState } from 'react';
import { Icone } from '@/components/Icones';
import { nutricaoDoPratoMontado, PORCAO_PRATO_G } from '@/lib/cardapio/nutricao-prato';
import type { DiaCardapio } from '@/lib/cardapio/tipos';

/** Rótulo do índice (mesma faixa do índice semanal). */
function rotuloIndice(v: number): { texto: string; cor: string; bg: string } {
  if (v >= 80) return { texto: 'equilibrado', cor: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-500' };
  if (v >= 60) return { texto: 'moderado', cor: 'text-ouro-600 dark:text-ouro-300', bg: 'bg-ouro-400' };
  return { texto: 'pesado', cor: 'text-perigo', bg: 'bg-perigo' };
}

export function NutricaoPrato({ dia }: { dia: DiaCardapio }) {
  const [aberto, setAberto] = useState(false);
  // Prato MONTADO (proteína + arroz + feijão + guarnição + salada) — igual
  // ao índice da semana e ao pôster. Mostrar só a proteína aqui era o que
  // fazia o carboidrato aparecer irreal.
  const info = nutricaoDoPratoMontado(dia);
  if (!info) return null;

  // Índice do prato completo, nas faixas de um almoço (~500 g).
  const pctGordura = info.kcal > 0 ? (info.gord * 9) / info.kcal : 0;
  let pontos = 100;
  if (info.kcal > 850) pontos -= 14; else if (info.kcal < 450) pontos -= 8;
  if (info.sodio > 1200) pontos -= 16; else if (info.sodio > 900) pontos -= 8;
  if (pctGordura > 0.4) pontos -= 16; else if (pctGordura > 0.35) pontos -= 8;
  if (info.prot >= 25) pontos += 5; else if (info.prot < 18) pontos -= 10;
  if (info.fibra >= 8) pontos += 5;
  const indice = Math.max(20, Math.min(100, Math.round(pontos)));
  const idx = rotuloIndice(indice);

  // alertas pontuais por prato
  const alertas: string[] = [];
  if (info.sodio > 1200) alertas.push('sódio alto');
  if (info.prot < 18) alertas.push('proteína baixa');
  if (info.kcal > 850) alertas.push('calórico');
  if (pctGordura > 0.4) alertas.push('gorduroso');

  const macros: [string, string][] = [
    ['Kcal', `${info.kcal}`],
    ['Proteína', `${info.prot}g`],
    ['Carbo', `${info.carb}g`],
    ['Gordura', `${info.gord}g`],
    ['Fibra', `${info.fibra}g`],
    ['Sódio', `${info.sodio}mg`],
  ];

  return (
    <div className="rounded-2xl bg-areia-50/70 p-3 ring-1 ring-carvao-100 dark:bg-carvao-900/40 dark:ring-carvao-700/60">
      {/* Resumo clicável — expande os macros sob demanda (os dias dominam) */}
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-1.5 text-micro font-extrabold uppercase tracking-[0.18em] text-texto-suave">
          <Icone nome="nutricao" tam={13} className="text-brand-500" /> Nutrição do prato
          <span className="font-bold text-texto-suave">· prato ~{PORCAO_PRATO_G}g</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-caption font-black ring-1 ring-carvao-100 dark:bg-carvao-800 dark:ring-carvao-700 ${idx.cor}`}>
            {indice}% {idx.texto}
          </span>
          <Icone nome="baixo" tam={14} className={`text-texto-suave transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {!aberto ? null : <div className="mt-2">

      {/* Barra do índice */}
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-800">
        <div className={`h-full rounded-full ${idx.bg} transition-all duration-500`} style={{ width: `${indice}%` }} />
      </div>

      {/* Macros — 3 colunas para os números caberem sem vazar */}
      <div className="grid grid-cols-3 gap-1.5">
        {macros.map(([rot, val]) => (
          <div key={rot} className="min-w-0 rounded-lg bg-white px-1.5 py-1.5 text-center ring-1 ring-carvao-100 dark:bg-carvao-800 dark:ring-carvao-700/60">
            <p className="text-micro font-bold uppercase leading-tight text-texto-suave">{rot}</p>
            <p className="truncate text-nota font-black leading-tight tabular-nums text-carvao-700 dark:text-areia-100">{val}</p>
          </div>
        ))}
      </div>

      {alertas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alertas.map((a) => (
            <span key={a} className="rounded-full bg-perigo/8 px-2 py-0.5 text-micro font-bold text-perigo ring-1 ring-perigo/15">
              {a}
            </span>
          ))}
        </div>
      )}
      </div>}
    </div>
  );
}
