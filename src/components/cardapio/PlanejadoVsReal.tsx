'use client';

/* =====================================================================
   Planejado × gasto real da semana — "compras seguiu o cardápio?".

   Cruza o custo previsto da lista com as notas fiscais lançadas dentro
   do período da semana. Mostra o total, os itens que mais destoaram, o
   que foi comprado fora do plano e o que ficou faltando.
   ===================================================================== */

import { useMemo } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import { formatarReais, converterParaUnidadeBase, normalizar } from '@/lib/cardapio/motor';
import { itensDoDiaParaCusto } from '@/lib/cardapio/custo-semana';
import { resolverPreco } from '@/lib/cardapio/precos';
import { compararPlanejadoReal, veredito, type ItemPlanejado } from '@/lib/cardapio/conciliacao-compras';
import { casarItem } from '@/lib/cardapio/cotacao';
import { datasDaSemana } from '@/lib/cardapio/estado';
import { useGastos } from '@/lib/cardapio/gastos';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function PlanejadoVsReal({
  estado,
  semanaId,
  precos,
  estimativas = {},
  fatores,
  mostrarBasicos,
}: {
  estado: EstadoSemana;
  semanaId: string;
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
}) {
  const { lancamentos } = useGastos();

  const comparacao = useMemo(() => {
    // Custo planejado item a item — mesma fonte da lista de compras.
    const porItem = new Map<string, ItemPlanejado>();
    estado.dias.forEach((_, di) => {
      for (const l of itensDoDiaParaCusto(estado, di, { fatores, mostrarBasicos })) {
        const r = resolverPreco(l.norm, precos, estimativas);
        if (!(r.valor > 0)) continue;
        const custo = r.valor * converterParaUnidadeBase(l.qtd, l.unid);
        const atual = porItem.get(l.norm) ?? { norm: l.norm, nome: l.norm, custo: 0 };
        atual.custo += custo;
        porItem.set(l.norm, atual);
      }
    });

    const datas = datasDaSemana(semanaId);
    return compararPlanejadoReal(
      Array.from(porItem.values()),
      lancamentos,
      iso(datas[0]),
      iso(datas[6]),
      // casarItem devolve o nome de exibição do catálogo ("Costela Bovina");
      // o plano é indexado pelo nome normalizado, então traduzimos aqui.
      (nome) => {
        const achado = casarItem(nome);
        return achado ? normalizar(achado) : null;
      },
    );
  }, [estado, semanaId, precos, estimativas, fatores, mostrarBasicos, lancamentos]);

  const v = veredito(comparacao);

  return (
    <Cartao className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-carvao-900 dark:text-white">Compras seguiu o cardápio?</p>
          <p className="text-[11px] text-texto-suave">
            Custo previsto da lista × notas fiscais lançadas nesta semana.
          </p>
        </div>
        <Pilula tom={v.tom}>{v.texto}</Pilula>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { r: 'Planejado', v: formatarReais(comparacao.planejado) },
          { r: 'Gasto real', v: formatarReais(comparacao.real) },
          {
            r: 'Diferença',
            v: `${comparacao.diferenca >= 0 ? '+' : '−'}${formatarReais(Math.abs(comparacao.diferenca))}`,
          },
        ].map((k) => (
          <div key={k.r} className="rounded-xl bg-carvao-50 px-3 py-2 text-center dark:bg-carvao-800/50">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">{k.r}</p>
            <p className="text-sm font-extrabold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      {!comparacao.temDados ? (
        <p className="text-xs text-texto-suave">
          Leia as notas desta semana na aba <strong>Notas</strong> para a comparação aparecer aqui.
        </p>
      ) : (
        <>
          {comparacao.itens.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-texto-suave">
                Maiores diferenças por item
              </p>
              {comparacao.itens.slice(0, 6).map((i) => (
                <div key={i.norm} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate capitalize">{i.nome}</span>
                  <span className="shrink-0 tabular-nums text-texto-suave">
                    {formatarReais(i.planejado)} → {formatarReais(i.real)}
                  </span>
                  <span
                    className={`w-20 shrink-0 text-right font-bold tabular-nums ${
                      i.diferenca > 0 ? 'text-perigo' : 'text-brand-600 dark:text-brand-400'
                    }`}
                  >
                    {i.diferenca >= 0 ? '+' : '−'}
                    {formatarReais(Math.abs(i.diferenca))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {comparacao.foraDoPlano.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-perigo">
                Comprado fora do plano
              </p>
              {comparacao.foraDoPlano.slice(0, 5).map((i) => (
                <div key={i.norm} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate capitalize">{i.nome}</span>
                  <span className="shrink-0 font-bold tabular-nums">{formatarReais(i.real)}</span>
                </div>
              ))}
            </div>
          )}

          {comparacao.naoComprado.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-texto-suave">
                Estava no plano e não apareceu em nota
              </p>
              {comparacao.naoComprado.slice(0, 5).map((i) => (
                <div key={i.norm} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate capitalize">{i.nome}</span>
                  <span className="shrink-0 tabular-nums text-texto-suave">
                    {formatarReais(i.planejado)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-texto-suave">
            {comparacao.notas} nota(s) no período. Itens da nota são casados pelo nome do produto —
            nomes muito diferentes do cadastro aparecem como &quot;fora do plano&quot;.
          </p>
        </>
      )}
    </Cartao>
  );
}
