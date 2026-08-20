'use client';

/* =====================================================================
   Copiloto da semana — no Início, onde a pessoa já está.

   Mostra as duas coisas mais importantes para agir agora, com número, e
   deixa o resto atrás de um toque. Não espera registro nenhum da equipe:
   funciona com o cardápio montado e a base de preços que já existem.
   ===================================================================== */

import { useMemo } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import { formatarReais } from '@/lib/cardapio/motor';
import { analisarCardapio } from '@/lib/cardapio/copiloto';
import { semanasComConteudo, lerSemana } from '@/lib/cardapio/estado';
import type { Achado } from '@/lib/cardapio/estudo-operacao';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const TOM: Record<Achado['prioridade'], 'vermelho' | 'ouro' | 'neutro'> = {
  alta: 'vermelho',
  media: 'ouro',
  baixa: 'neutro',
};

const BORDA: Record<Achado['prioridade'], string> = {
  alta: 'border-l-perigo',
  media: 'border-l-ouro-400',
  baixa: 'border-l-carvao-300 dark:border-l-carvao-600',
};

export function CopilotoSemana({
  estado,
  semanaId,
  precos,
  estimativas,
  onAbrirTudo,
}: {
  estado: EstadoSemana;
  semanaId: string;
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  onAbrirTudo?: () => void;
}) {
  const achados = useMemo(() => {
    const anteriores = semanasComConteudo()
      .filter((id) => id !== semanaId)
      .map((id) => ({ semanaId: id, estado: lerSemana(id) }));
    return analisarCardapio({
      atual: { semanaId, estado },
      anteriores,
      precos,
      estimativas: estimativas ?? {},
    });
  }, [estado, semanaId, precos, estimativas]);

  if (achados.length === 0) return null;

  const destaque = achados.slice(0, 2);
  const resto = achados.length - destaque.length;
  const emJogo = achados.reduce((s, a) => s + (a.impactoSemanal ?? 0), 0);

  return (
    <Cartao className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-carvao-900 dark:text-white">Copiloto da semana</p>
          <p className="text-[11px] text-texto-suave">
            O que mexer agora, calculado do cardápio e dos preços desta semana.
          </p>
        </div>
        {emJogo > 0 && <Pilula tom="verde">{formatarReais(emJogo)} em jogo</Pilula>}
      </div>

      <div className="space-y-2">
        {destaque.map((a) => (
          <div
            key={a.id}
            className={`space-y-1 rounded-xl border-l-4 bg-carvao-50 px-3 py-2.5 dark:bg-carvao-800/50 ${BORDA[a.prioridade]}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Pilula tom={TOM[a.prioridade]}>{a.prioridade === 'alta' ? 'Agora' : 'Atenção'}</Pilula>
              <p className="text-sm font-bold text-carvao-900 dark:text-white">{a.titulo}</p>
              {a.impactoSemanal ? (
                <span className="ml-auto text-xs font-bold tabular-nums text-brand-700 dark:text-brand-300">
                  {formatarReais(a.impactoSemanal)}
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-carvao-600 dark:text-areia-300">{a.evidencia}</p>
            <p className="text-xs font-semibold leading-relaxed text-carvao-800 dark:text-areia-100">
              → {a.acao}
            </p>
          </div>
        ))}
      </div>

      {resto > 0 && onAbrirTudo && (
        <button
          type="button"
          onClick={onAbrirTudo}
          className="text-caption font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300"
        >
          Ver mais {resto} {resto > 1 ? 'recomendações' : 'recomendação'} no Chef IA
        </button>
      )}
    </Cartao>
  );
}
