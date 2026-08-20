/* =====================================================================
   Custo da semana — FONTE ÚNICA.

   Achado da auditoria (VÉRTICE, 20/08/2026): existiam três caminhos
   diferentes para responder "quanto custa esta semana", e eles davam
   respostas diferentes:

   1. Tela do Cardápio
        listaDoDia(dia)            → quantidades BASE da sugestão
        + custoTipado              → preço em 4 camadas (real, histórico,
                                     estimado, ingrediente base)
      Ignorava os ajustes de quantidade da cozinha, os itens removidos,
      os itens acrescentados à mão e os fatores de aprendizado. Ou seja:
      mostrava o custo de uma lista que ninguém vai comprar.

   2. Lista de Compras (modo detalhado)
        linhasDoDia(estado, dia, fatores)  → quantidades REAIS
        + custoDaLista                     → só o mapa de preços cru,
                                             sem estimativas nem o
                                             fallback de ingrediente base
      Subestimava o custo, porque todo item sem preço direto entrava
      como zero — silenciosamente.

   3. Ainda por cima, (1) e (2) montavam a lista com opções diferentes
      de "mostrar básicos", então nem o conjunto de itens batia.

   Daí a sensação, correta, de que o custo "não é fiel à cotação".

   Este módulo passa a ser o único jeito de perguntar o custo: sempre as
   quantidades reais (com ajustes, manuais e fatores) e sempre o preço
   resolvido em todas as camadas — os mesmos números na tela do cardápio
   e na lista de compras.
   ===================================================================== */

import { linhasDoDia, normalizar } from './motor';
import { custoTipado, type CustoTipado } from './precos';
import type { EstadoSemana } from './tipos';

export interface OpcoesCusto {
  /** Fatores de aprendizado por item (mesma fonte da lista de compras). */
  fatores?: Record<string, number>;
  /** Incluir itens básicos (sal, óleo, tempero) — precisa bater com a lista. */
  mostrarBasicos?: boolean;
}

/** Itens de UM dia, exatamente como aparecem na lista de compras. */
export function itensDoDiaParaCusto(
  estado: EstadoSemana,
  diaIdx: number,
  opts: OpcoesCusto = {},
): { norm: string; qtd: number; unid: string }[] {
  return linhasDoDia(estado, diaIdx, opts.fatores, { mostrarBasicos: opts.mostrarBasicos }).map(
    (l) => ({ norm: normalizar(l.item), qtd: l.qtd, unid: l.unid }),
  );
}

/** Custo de um dia, com as quantidades reais e o preço em 4 camadas. */
export function custoDoDia(
  estado: EstadoSemana,
  diaIdx: number,
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
  opts: OpcoesCusto = {},
): CustoTipado {
  return custoTipado(itensDoDiaParaCusto(estado, diaIdx, opts), precos, estimativas);
}

export interface CustoSemana extends CustoTipado {
  itens: number;
  /** Total de refeições previstas nos dias com prato definido. */
  totalPessoas: number;
  /** Custo por refeição (null quando não dá para calcular). */
  porRefeicao: number | null;
}

/** Custo da semana inteira — a resposta oficial, usada por todas as telas. */
export function custoDaSemana(
  estado: EstadoSemana,
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
  opts: OpcoesCusto = {},
): CustoSemana {
  const acc: CustoSemana = {
    total: 0, real: 0, estimado: 0,
    itensReais: 0, itensEstimados: 0, itensSemPreco: 0,
    semPreco: [], itens: 0, totalPessoas: 0, porRefeicao: null,
  };
  const semPreco = new Set<string>();

  estado.dias.forEach((dia, di) => {
    const itens = itensDoDiaParaCusto(estado, di, opts);
    if (itens.length === 0) return;
    const c = custoTipado(itens, precos, estimativas);
    acc.real += c.real;
    acc.estimado += c.estimado;
    acc.itensReais += c.itensReais;
    acc.itensEstimados += c.itensEstimados;
    acc.itensSemPreco += c.itensSemPreco;
    acc.itens += itens.length;
    c.semPreco.forEach((n) => semPreco.add(n));
    if (dia.principal) acc.totalPessoas += dia.pessoas;
  });

  acc.total = acc.real + acc.estimado;
  acc.semPreco = Array.from(semPreco);
  acc.porRefeicao = acc.totalPessoas > 0 && acc.total > 0 ? acc.total / acc.totalPessoas : null;
  return acc;
}
