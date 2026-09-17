/* =====================================================================
   Motor de custo real por prato — cruza ingredientes operacionais/receitas
   com a mesma resolução canônica de preços usada pelo restante do House.
   ===================================================================== */

import { DADOS, converterParaUnidadeBase, normalizar } from './motor';
import { resolverPreco, type TipoPreco } from './precos';
import { receitaDoPrato } from './receitas';
import type { DiaCardapio } from './tipos';

export interface IngredienteCusto {
  item: string;
  norm: string;
  qtd: number;
  unid: string;
  /** Unidade em que o preço resolvido é aplicado (g→kg, ml→lt). */
  unidPreco: string;
  precoUnit: number;
  custo: number;
  temPreco: boolean;
  origemPreco: TipoPreco;
}

export interface CustoPorcao {
  prato: string;
  norm: string;
  categoria: string;
  ingredientes: IngredienteCusto[];
  custoTotal: number;
  custoPorcao: number;
  pessoas: number;
  /** 0–1: proporção de ingredientes com alguma referência de preço resolvida */
  cobertura: number;
  /** Compatibilidade histórica: true quando há fonte estruturada específica do prato. */
  deMapa: boolean;
  fonteDados: 'mapa' | 'receita' | 'combo';
}

/* ------------------------------------------------------------------ */

const BASELINE = DADOS.baseline;

/** Índice: norm(op) → itens do mapa */
const MAPA_IDX = new Map<string, { i: string; q: number; u: string | null }[]>();
DADOS.mapas.forEach((m) => {
  const k = normalizar(m.op);
  if (!MAPA_IDX.has(k)) MAPA_IDX.set(k, m.itens);
});

/** Índice de nomes originais para display */
const NOME_ORIGINAL = new Map<string, string>();
DADOS.itens.forEach((i) => NOME_ORIGINAL.set(normalizar(i.n), i.n));

function unidadePreco(unid: string): string {
  if (unid === 'g') return 'kg';
  if (unid === 'ml') return 'lt';
  return unid;
}

function resolverIngrediente(
  item: string,
  qtd: number,
  unid: string,
  precos: Record<string, number>,
  estimativas: Record<string, number>,
): IngredienteCusto {
  const norm = normalizar(item);
  // Fonte única de verdade para preço: cotação real → histórico → estimativa
  // → ingrediente-base. A cotação aplicada a um item canônico passa, portanto,
  // a alimentar também a receita que referencia esse mesmo ingrediente.
  const resolvido = resolverPreco(norm, precos, estimativas);
  const precoUnit = resolvido.valor;
  return {
    item: NOME_ORIGINAL.get(norm) ?? item,
    norm,
    qtd,
    unid,
    unidPreco: unidadePreco(unid),
    precoUnit,
    custo: precoUnit * converterParaUnidadeBase(qtd, unid),
    temPreco: resolvido.tipo !== 'sem' && precoUnit > 0,
    origemPreco: resolvido.tipo,
  };
}

function calcularIngredientesOperacionais(
  itens: { i: string; q: number; u: string | null }[],
  precos: Record<string, number>,
  estimativas: Record<string, number>,
  escala: number,
): IngredienteCusto[] {
  return itens.map((it) => resolverIngrediente(
    it.i,
    it.q * escala,
    it.u ?? 'un',
    precos,
    estimativas,
  ));
}

function resultado(
  prato: string,
  categoria: string,
  pessoas: number,
  ingredientes: IngredienteCusto[],
  fonteDados: CustoPorcao['fonteDados'],
): CustoPorcao {
  const custoTotal = ingredientes.reduce((s, i) => s + i.custo, 0);
  const comPreco = ingredientes.filter((i) => i.temPreco).length;
  return {
    prato,
    norm: normalizar(prato),
    categoria,
    ingredientes,
    custoTotal,
    custoPorcao: custoTotal / pessoas,
    pessoas,
    cobertura: ingredientes.length > 0 ? comPreco / ingredientes.length : 0,
    deMapa: fonteDados !== 'combo',
    fonteDados,
  };
}

/**
 * Calcula o custo por porção de um prato, escalado para `pessoas`.
 * Ordem de ingredientes: mapa operacional específico → receita estruturada →
 * combo histórico. Preço é sempre resolvido pela cadeia canônica do House.
 */
export function calcularCustoPrato(
  prato: string,
  categoria: string,
  precos: Record<string, number>,
  pessoas: number,
  estimativas: Record<string, number> = {},
): CustoPorcao | null {
  if (!prato || pessoas <= 0) return null;
  const norm = normalizar(prato);
  const escala = pessoas / BASELINE;

  const itensMapas = MAPA_IDX.get(norm);
  if (itensMapas && itensMapas.length > 0) {
    return resultado(
      prato,
      categoria,
      pessoas,
      calcularIngredientesOperacionais(itensMapas, precos, estimativas, escala),
      'mapa',
    );
  }

  // A biblioteca culinária é a segunda fonte. Isso fecha a cadeia
  // cotação → ingrediente canônico → receita, inclusive para pratos novos que
  // ainda não possuem mapa/combo histórico em dados.json.
  const receita = receitaDoPrato(prato);
  if (receita?.ingredientes?.length) {
    const ingredientes = receita.ingredientes
      .filter((ing) => !ing.opcional || resolverPreco(normalizar(ing.item), precos, estimativas).tipo !== 'sem')
      .map((ing) => resolverIngrediente(
        ing.item,
        ing.porPessoa * pessoas,
        ing.unid,
        precos,
        estimativas,
      ));
    if (ingredientes.length > 0) return resultado(prato, categoria, pessoas, ingredientes, 'receita');
  }

  // Último fallback: combo onde este prato aparece (qualquer coluna).
  const combo = DADOS.combos.find(
    (c) =>
      normalizar(c.p ?? '') === norm ||
      normalizar(c.gf ?? '') === norm ||
      normalizar(c.g ?? '') === norm ||
      normalizar(c.s ?? '') === norm ||
      normalizar(c.sb ?? '') === norm,
  );
  if (!combo || combo.itens.length === 0) return null;

  return resultado(
    prato,
    categoria,
    pessoas,
    calcularIngredientesOperacionais(combo.itens, precos, estimativas, escala),
    'combo',
  );
}

/** Calcula custo de todos os pratos distintos de uma semana, sem repetir. */
export function calcularCustosSemana(
  dias: DiaCardapio[],
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
): CustoPorcao[] {
  const vistos = new Set<string>();
  const resultadoSemana: CustoPorcao[] = [];

  const CATEGORIAS: [keyof DiaCardapio, string][] = [
    ['principal', 'Principal'],
    ['guarnicaoFixa', 'Guarnição Fixa'],
    ['guarnicao', 'Guarnição'],
    ['salada', 'Salada'],
    ['sobremesa', 'Sobremesa'],
  ];

  dias.forEach((dia) => {
    CATEGORIAS.forEach(([campo, cat]) => {
      const prato = dia[campo] as string;
      if (!prato) return;
      const norm = normalizar(prato);
      if (vistos.has(norm)) return;
      vistos.add(norm);
      const custo = calcularCustoPrato(prato, cat, precos, dia.pessoas, estimativas);
      if (custo) resultadoSemana.push(custo);
    });
  });

  return resultadoSemana.sort((a, b) => b.custoPorcao - a.custoPorcao);
}
