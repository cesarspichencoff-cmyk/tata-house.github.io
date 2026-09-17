/* =====================================================================
   Motor de custo real por prato — cruza ingredientes do dados.json
   com a mesma resolução canônica de preços usada pelo restante do House.
   ===================================================================== */

import { DADOS, converterParaUnidadeBase, normalizar } from './motor';
import { resolverPreco, type TipoPreco } from './precos';
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
  /** true = dados de mapa individual; false = inferido de combo */
  deMapa: boolean;
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

function calcularIngredientes(
  itens: { i: string; q: number; u: string | null }[],
  precos: Record<string, number>,
  estimativas: Record<string, number>,
  escala: number,
): IngredienteCusto[] {
  return itens.map((it) => {
    const itNorm = normalizar(it.i);
    const qtd = it.q * escala;
    const unid = it.u ?? 'un';
    // Fonte única de verdade para preço: cotação real → histórico → estimativa
    // → ingrediente-base. Assim "Tiras de Carne", aliases e preparos resolvem
    // da mesma forma no cardápio, na lista e no custo por prato.
    const resolvido = resolverPreco(itNorm, precos, estimativas);
    const precoUnit = resolvido.valor;
    const qtdBase = converterParaUnidadeBase(qtd, unid);
    return {
      item: NOME_ORIGINAL.get(itNorm) ?? it.i,
      norm: itNorm,
      qtd,
      unid,
      unidPreco: unidadePreco(unid),
      precoUnit,
      custo: precoUnit * qtdBase,
      temPreco: resolvido.tipo !== 'sem' && precoUnit > 0,
      origemPreco: resolvido.tipo,
    };
  });
}

/**
 * Calcula o custo por porção de um prato, escalado para `pessoas`.
 * Retorna null quando não há dados de ingredientes no sistema.
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
    const ingredientes = calcularIngredientes(itensMapas, precos, estimativas, escala);
    const custoTotal = ingredientes.reduce((s, i) => s + i.custo, 0);
    const comPreco = ingredientes.filter((i) => i.temPreco).length;
    return {
      prato,
      norm,
      categoria,
      ingredientes,
      custoTotal,
      custoPorcao: custoTotal / pessoas,
      pessoas,
      cobertura: itensMapas.length > 0 ? comPreco / itensMapas.length : 0,
      deMapa: true,
    };
  }

  // Fallback: procura em combo onde este prato aparece (qualquer coluna)
  const combo = DADOS.combos.find(
    (c) =>
      normalizar(c.p ?? '') === norm ||
      normalizar(c.gf ?? '') === norm ||
      normalizar(c.g ?? '') === norm ||
      normalizar(c.s ?? '') === norm ||
      normalizar(c.sb ?? '') === norm,
  );
  if (!combo || combo.itens.length === 0) return null;

  const ingredientes = calcularIngredientes(combo.itens, precos, estimativas, escala);
  const custoTotal = ingredientes.reduce((s, i) => s + i.custo, 0);
  const comPreco = ingredientes.filter((i) => i.temPreco).length;
  return {
    prato,
    norm,
    categoria,
    ingredientes,
    custoTotal,
    custoPorcao: custoTotal / pessoas,
    pessoas,
    cobertura: combo.itens.length > 0 ? comPreco / combo.itens.length : 0,
    deMapa: false,
  };
}

/** Calcula custo de todos os pratos distintos de uma semana, sem repetir. */
export function calcularCustosSemana(
  dias: DiaCardapio[],
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
): CustoPorcao[] {
  const vistos = new Set<string>();
  const resultado: CustoPorcao[] = [];

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
      if (custo) resultado.push(custo);
    });
  });

  return resultado.sort((a, b) => b.custoPorcao - a.custoPorcao);
}
