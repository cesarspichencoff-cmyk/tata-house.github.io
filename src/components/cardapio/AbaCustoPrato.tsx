'use client';

import { useMemo, useState } from 'react';
import { Cartao, EstadoVazio, Kpi, Secao } from '@/components/ui';
import { calcularCustosSemana } from '@/lib/cardapio/custo-prato';
import { normalizar } from '@/lib/cardapio/motor';
import type { DiaCardapio } from '@/lib/cardapio/tipos';
import type { CustoPorcao } from '@/lib/cardapio/custo-prato';

const COR_COBERTURA = (c: number) =>
  c >= 0.9 ? 'text-brand-600 dark:text-brand-400' :
  c >= 0.6 ? 'text-ouro-600 dark:text-ouro-300' :
  'text-perigo dark:text-perigo-claro';

const ROTULO_ORIGEM_PRECO = {
  real: 'cotação atual',
  historico: 'histórico',
  estimado: 'estimativa',
  sem: 'sem preço',
} as const;

function BarraCusto({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  const cor = pct > 70 ? 'bg-perigo' : pct > 40 ? 'bg-ouro-400' : 'bg-brand-500';
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700">
      <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DetalheIngredientes({ custo, onFechar }: { custo: CustoPorcao; onFechar: () => void }) {
  const total = custo.custoTotal;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onFechar}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl dark:bg-carvao-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold text-carvao-900 dark:text-white">{custo.prato}</h3>
            <p className="text-xs text-texto-suave">
              {custo.categoria} · {custo.pessoas} pessoas ·{' '}
              {custo.deMapa ? 'dados de receita' : 'estimado de combo'}
            </p>
          </div>
          <button onClick={onFechar} className="text-2xl text-texto-suave hover:text-carvao-700">✕</button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-carvao-50 p-3 text-center dark:bg-carvao-800">
            <p className="text-xl font-bold text-carvao-900 dark:text-white">
              R$ {custo.custoPorcao.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs text-texto-suave">por porção</p>
          </div>
          <div className="rounded-2xl bg-carvao-50 p-3 text-center dark:bg-carvao-800">
            <p className="text-xl font-bold text-carvao-900 dark:text-white">
              R$ {custo.custoTotal.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs text-texto-suave">total ({custo.pessoas} pax)</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {custo.ingredientes
            .sort((a, b) => b.custo - a.custo)
            .map((ing, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-carvao-50 px-3 py-2 dark:bg-carvao-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-carvao-800 dark:text-areia-100">{ing.item}</p>
                  <p className="text-xs text-texto-suave">
                    {ing.qtd.toFixed(2)} {ing.unid}
                    {ing.temPreco
                      ? ` · R$ ${ing.precoUnit.toFixed(2)}/${ing.unidPreco} · ${ROTULO_ORIGEM_PRECO[ing.origemPreco]}`
                      : ' · sem preço'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {ing.temPreco ? (
                    <>
                      <p className="text-sm font-bold text-carvao-700 dark:text-areia-100">
                        R$ {ing.custo.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-micro text-texto-suave">
                        {total > 0 ? Math.round((ing.custo / total) * 100) : 0}%
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-carvao-300">—</p>
                  )}
                </div>
              </div>
            ))}
        </div>

        {custo.cobertura < 1 && (
          <p className="mt-4 text-center text-xs text-texto-suave">
            {Math.round((1 - custo.cobertura) * custo.ingredientes.length)} ingrediente(s) sem referência de preço — o total permanece incompleto.
          </p>
        )}
      </div>
    </div>
  );
}

export function AbaCustoPrato({
  dias,
  precos,
}: {
  dias: DiaCardapio[];
  precos: Record<string, number>;
}) {
  const [detalhe, setDetalhe] = useState<CustoPorcao | null>(null);
  const [filtro, setFiltro] = useState<string>('Todos');

  const custos = useMemo(() => calcularCustosSemana(dias, precos), [dias, precos]);

  const principaisSemDados = useMemo(() => {
    const normsComDados = new Set(custos.filter((c) => c.categoria === 'Principal').map((c) => c.norm));
    const vistos = new Set<string>();
    return dias
      .filter((d) => d.principal)
      .map((d) => d.principal as string)
      .filter((p) => {
        const n = normalizar(p);
        if (vistos.has(n)) return false;
        vistos.add(n);
        return !normsComDados.has(n);
      });
  }, [dias, custos]);

  const categorias = ['Todos', ...Array.from(new Set(custos.map((c) => c.categoria)))];
  const filtrados = filtro === 'Todos' ? custos : custos.filter((c) => c.categoria === filtro);

  const maxCusto = Math.max(...filtrados.map((c) => c.custoPorcao), 0.01);
  const mediaCusto = custos.length > 0 ? custos.reduce((s, c) => s + c.custoPorcao, 0) / custos.length : 0;
  const maisCaro = custos[0];
  const maisBarato = custos[custos.length - 1];

  if (custos.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem dados de custo ainda"
        texto="Preencha o cardápio da semana e cadastre preços dos ingredientes para ver o custo por prato."
      />
    );
  }

  return (
    <div className="space-y-5">
      {detalhe && <DetalheIngredientes custo={detalhe} onFechar={() => setDetalhe(null)} />}

      <div className="grid grid-cols-3 gap-3">
        <Kpi rotulo="Média/porção" valor={`R$ ${mediaCusto.toFixed(2).replace('.', ',')}`} tom="neutro" />
        <Kpi rotulo="Mais caro" valor={`R$ ${(maisCaro?.custoPorcao ?? 0).toFixed(2).replace('.', ',')}`} tom="vermelho" />
        <Kpi rotulo="Mais barato" valor={`R$ ${(maisBarato?.custoPorcao ?? 0).toFixed(2).replace('.', ',')}`} tom="verde" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categorias.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltro(cat)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filtro === cat
                ? 'bg-brand-600 text-white'
                : 'bg-carvao-100 text-carvao-600 hover:bg-carvao-200 dark:bg-carvao-700 dark:text-carvao-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <Secao titulo="Custo por porção — ranking">
        <Cartao className="!p-0">
          <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
            {filtrados.map((c) => (
              <li key={c.norm}>
                <button
                  onClick={() => setDetalhe(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-carvao-50 dark:hover:bg-carvao-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-carvao-800 dark:text-areia-100">{c.prato}</p>
                      <span className="shrink-0 text-sm font-bold text-carvao-700 dark:text-areia-100">
                        R$ {c.custoPorcao.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <BarraCusto valor={c.custoPorcao} max={maxCusto} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-carvao-100 px-1 py-0.5 text-micro font-semibold text-carvao-500 dark:bg-carvao-700 dark:text-carvao-300">
                        {c.categoria}
                      </span>
                      <span className={`text-micro font-semibold ${COR_COBERTURA(c.cobertura)}`}>
                        {Math.round(c.cobertura * 100)}% de ingredientes com referência de preço
                      </span>
                      {!c.deMapa && (
                        <span className="text-micro text-texto-suave">estimado</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
            {(filtro === 'Todos' || filtro === 'Principal') && principaisSemDados.map((prato) => (
              <li key={`sem-${prato}`} className="flex items-center gap-3 px-4 py-3 opacity-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-carvao-600 dark:text-texto-suave">{prato}</p>
                    <span className="shrink-0 text-xs text-texto-suave">sem dados</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-carvao-100 dark:bg-carvao-700" />
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-carvao-100 px-1 py-0.5 text-micro font-semibold text-texto-suave dark:bg-carvao-700">Principal</span>
                    <span className="text-micro text-texto-suave">ingredientes não cadastrados</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </Secao>
    </div>
  );
}
