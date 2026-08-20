'use client';

/* =====================================================================
   Estudo da operação — o que a casa aprendeu nas últimas semanas.

   Diferente do bloco de conferência da semana (que olha só o cardápio
   aberto), aqui cada cartão nasce de dado acumulado: sobra registrada,
   voto no QR, série de preços, nota fiscal lida. Sem dado, não aparece
   recomendação — aparece o que falta registrar para o app conseguir
   estudar. Recomendação sem lastro é o que fazia a equipe desconfiar.
   ===================================================================== */

import { useMemo } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import { formatarReais } from '@/lib/cardapio/motor';
import {
  estudarOperacao,
  cobertura,
  type Achado,
  type CategoriaAchado,
} from '@/lib/cardapio/estudo-operacao';
import {
  useAceitacao,
  useHistoricoPrecos,
  semanasComConteudo,
  lerSemana,
  lerDesperdicio,
} from '@/lib/cardapio/estado';
import { useGastos } from '@/lib/cardapio/gastos';

const ROTULO: Record<CategoriaAchado, string> = {
  preco: 'Preço',
  desperdicio: 'Desperdício',
  aceitacao: 'Aceitação',
  gasto: 'Gasto',
  variedade: 'Variedade',
  oportunidade: 'Oportunidade',
};

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

export function EstudoOperacao({ custoRefeicao }: { custoRefeicao?: number | null }) {
  const { aceitacao } = useAceitacao();
  const historicoPrecos = useHistoricoPrecos();
  const { lancamentos } = useGastos();

  const entrada = useMemo(() => {
    const ids = semanasComConteudo();
    return {
      semanas: ids.map((id) => ({ semanaId: id, estado: lerSemana(id) })),
      aceitacao,
      desperdicio: ids.flatMap((id) => lerDesperdicio(id)),
      historicoPrecos,
      gastos: lancamentos,
      custoRefeicaoSemana: custoRefeicao ?? null,
    };
  }, [aceitacao, historicoPrecos, lancamentos, custoRefeicao]);

  const achados = useMemo(() => estudarOperacao(entrada), [entrada]);
  const cob = useMemo(() => cobertura(entrada), [entrada]);

  const economiaTotal = achados.reduce((s, a) => s + (a.impactoSemanal ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-carvao-900 dark:text-white">O que a operação está dizendo</p>
          <p className="text-[11px] text-texto-suave">
            Baseado em sobras, avaliações, preços e notas registrados — não em palpite.
          </p>
        </div>
        {economiaTotal > 0 && (
          <Pilula tom="verde">até {formatarReais(economiaTotal)}/semana em jogo</Pilula>
        )}
      </div>

      {achados.length === 0 ? (
        <Cartao className="space-y-2">
          <p className="text-sm font-semibold">Ainda não dá para estudar a operação com honestidade.</p>
          {cob.faltando.length > 0 && (
            <>
              <p className="text-xs text-texto-suave">Falta alimentar:</p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-carvao-600 dark:text-areia-300">
                {cob.faltando.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[11px] text-texto-suave">
            Assim que esses registros começarem a entrar, esta área passa a mostrar onde está o dinheiro
            e o que a equipe realmente come.
          </p>
        </Cartao>
      ) : (
        <div className="space-y-2">
          {achados.map((a) => (
            <Cartao key={a.id} className={`space-y-1.5 border-l-4 ${BORDA[a.prioridade]}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Pilula tom={TOM[a.prioridade]}>{ROTULO[a.categoria]}</Pilula>
                <p className="text-sm font-bold text-carvao-900 dark:text-white">{a.titulo}</p>
                {a.impactoSemanal ? (
                  <span className="ml-auto text-xs font-bold tabular-nums text-brand-700 dark:text-brand-300">
                    ≈ {formatarReais(a.impactoSemanal)}/sem
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-carvao-600 dark:text-areia-300">{a.evidencia}</p>
              <p className="text-xs font-semibold leading-relaxed text-carvao-800 dark:text-areia-100">
                → {a.acao}
              </p>
            </Cartao>
          ))}
        </div>
      )}
    </div>
  );
}
