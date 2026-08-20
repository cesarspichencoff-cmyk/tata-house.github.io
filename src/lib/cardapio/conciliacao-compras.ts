/* =====================================================================
   Planejado × gasto real da semana.

   A pergunta que ninguém conseguia responder: "o setor de compras está
   comprando o que o cardápio pediu?". O app sabia o que a semana deveria
   custar, e passou a saber (pelas notas lidas) o que de fato foi gasto —
   mas os dois números nunca se olhavam. Aqui eles se encontram, no total
   e item a item.

   Três respostas que só aparecem quando se cruza:
     • gastou mais/menos do que o plano, e quanto;
     • item comprado ACIMA do que o cardápio pedia;
     • item que entrou na nota sem estar no plano (compra fora do
       cardápio) e item do plano que não foi comprado.

   Função PURA e testada. Não julga intenção — mostra a diferença.
   ===================================================================== */

import type { LancamentoGasto } from './gastos';

export interface ItemComparado {
  norm: string;
  nome: string;
  planejado: number;
  real: number;
  diferenca: number; // real − planejado
}

export interface ComparacaoSemana {
  /** Custo previsto pela lista de compras da semana. */
  planejado: number;
  /** Soma das notas fiscais lançadas dentro do período da semana. */
  real: number;
  diferenca: number;
  /** Variação % sobre o planejado (0 quando não há plano). */
  percentual: number;
  /** Quantas notas caíram dentro da semana. */
  notas: number;
  /** Itens presentes nos dois lados, ordenados pela maior diferença. */
  itens: ItemComparado[];
  /** Comprado sem estar no plano da semana. */
  foraDoPlano: ItemComparado[];
  /** Estava no plano e não apareceu em nota nenhuma. */
  naoComprado: ItemComparado[];
  /** Sem nota no período não há o que comparar. */
  temDados: boolean;
}

export interface ItemPlanejado {
  norm: string;
  nome: string;
  custo: number;
}

/** Notas cuja data cai dentro do intervalo [inicio, fim] (datas yyyy-mm-dd). */
export function notasDaSemana(
  gastos: LancamentoGasto[],
  inicio: string,
  fim: string,
): LancamentoGasto[] {
  return gastos.filter((g) => {
    const d = (g.data ?? '').slice(0, 10);
    return d >= inicio && d <= fim;
  });
}

/**
 * Casamento de nomes entre a nota e o plano. A nota traz o nome do
 * fornecedor ("COSTELA BOV RESF KG"); o plano traz o item do catálogo
 * ("costela"). Sem uma tradução, item legitimamente planejado aparecia
 * como "comprado fora do plano" — pior que não mostrar nada, porque
 * acusa o setor de compras por engano.
 */
export type Casador = (nome: string) => string | null;

function resolverChave(norm: string, nome: string, plano: Map<string, ItemComparado>, casar?: Casador): string {
  if (plano.has(norm)) return norm;
  const viaCasador = casar?.(nome) ?? casar?.(norm);
  if (viaCasador && plano.has(viaCasador)) return viaCasador;
  // último recurso: prefixo — "costela bovina" casa com "costela" do plano
  for (const chave of Array.from(plano.keys())) {
    if (norm.startsWith(chave) || chave.startsWith(norm)) return chave;
  }
  return norm;
}

export function compararPlanejadoReal(
  planejados: ItemPlanejado[],
  gastos: LancamentoGasto[],
  inicio: string,
  fim: string,
  casar?: Casador,
): ComparacaoSemana {
  const notas = notasDaSemana(gastos, inicio, fim);

  const planoPorItem = new Map<string, ItemComparado>();
  let planejadoTotal = 0;
  for (const p of planejados) {
    if (!p.norm) continue;
    const atual = planoPorItem.get(p.norm) ?? {
      norm: p.norm, nome: p.nome, planejado: 0, real: 0, diferenca: 0,
    };
    atual.planejado += p.custo;
    planejadoTotal += p.custo;
    planoPorItem.set(p.norm, atual);
  }

  const realPorItem = new Map<string, { nome: string; real: number }>();
  let realTotal = 0;
  for (const n of notas) {
    realTotal += n.total;
    for (const it of n.itens ?? []) {
      if (!it.norm) continue;
      const k = resolverChave(it.norm, it.produto, planoPorItem, casar);
      const atual = realPorItem.get(k) ?? { nome: it.produto, real: 0 };
      atual.real += it.precoTotal;
      realPorItem.set(k, atual);
    }
  }

  const itens: ItemComparado[] = [];
  const naoComprado: ItemComparado[] = [];
  for (const [norm, p] of Array.from(planoPorItem.entries())) {
    const r = realPorItem.get(norm);
    if (r) {
      itens.push({ ...p, real: r.real, diferenca: r.real - p.planejado });
    } else if (notas.length > 0) {
      naoComprado.push({ ...p, real: 0, diferenca: -p.planejado });
    }
  }

  const foraDoPlano: ItemComparado[] = [];
  for (const [norm, r] of Array.from(realPorItem.entries())) {
    if (planoPorItem.has(norm)) continue;
    foraDoPlano.push({ norm, nome: r.nome, planejado: 0, real: r.real, diferenca: r.real });
  }

  const ordenarPorDiferenca = (a: ItemComparado, b: ItemComparado) =>
    Math.abs(b.diferenca) - Math.abs(a.diferenca);

  return {
    planejado: Math.round(planejadoTotal * 100) / 100,
    real: Math.round(realTotal * 100) / 100,
    diferenca: Math.round((realTotal - planejadoTotal) * 100) / 100,
    percentual: planejadoTotal > 0 ? ((realTotal - planejadoTotal) / planejadoTotal) * 100 : 0,
    notas: notas.length,
    itens: itens.sort(ordenarPorDiferenca).slice(0, 12),
    foraDoPlano: foraDoPlano.sort(ordenarPorDiferenca).slice(0, 8),
    naoComprado: naoComprado.sort((a, b) => b.planejado - a.planejado).slice(0, 8),
    temDados: notas.length > 0,
  };
}

/** Leitura curta do resultado, para não deixar o número solto na tela. */
export function veredito(c: ComparacaoSemana): { texto: string; tom: 'verde' | 'ouro' | 'vermelho' } {
  if (!c.temDados) {
    return { texto: 'Nenhuma nota lançada nesta semana ainda.', tom: 'ouro' };
  }
  if (c.planejado <= 0) {
    return { texto: 'Semana sem plano de compras para comparar.', tom: 'ouro' };
  }
  const p = Math.abs(Math.round(c.percentual));

  // O total pode fechar redondo e ainda assim a compra ter sido OUTRA: gastou
  // o mesmo dinheiro em itens que o cardápio não pediu, deixando de comprar o
  // que pediu. Olhar só o total esconderia exatamente o desvio que interessa.
  const foraTotal = c.foraDoPlano.reduce((s, i) => s + i.real, 0);
  const desvioComposicao = foraTotal / c.planejado;
  if (p <= 10 && desvioComposicao > 0.2) {
    return {
      texto: `Total bateu, mas ${Math.round(desvioComposicao * 100)}% foi gasto fora do plano.`,
      tom: 'ouro',
    };
  }

  if (p <= 10) {
    return { texto: `Compras seguiram o plano (${p}% de diferença).`, tom: 'verde' };
  }
  if (c.diferenca > 0) {
    return { texto: `Gastou ${p}% acima do planejado nesta semana.`, tom: 'vermelho' };
  }
  return { texto: `Gastou ${p}% abaixo do planejado — confira se faltou comprar algo.`, tom: 'ouro' };
}
