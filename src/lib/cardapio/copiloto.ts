/* =====================================================================
   Copiloto — o que dá para dizer HOJE, com o que a casa já tem.

   Por que este arquivo existe: o estudo da operação (estudo-operacao.ts)
   só fala quando há sobra registrada, voto no QR e nota fiscal lida.
   Rodando com os dados reais da casa — 11 semanas de cardápio, base de
   preços cheia, nenhum desses registros — ele produzia UM achado. Honesto
   e inútil ao mesmo tempo: quem abria não via diferença nenhuma.

   O erro era pedir dado que ninguém digitou em vez de extrair valor do
   que já está lá. Cardápio servido + preço + receita já respondem muita
   coisa: quanto a semana custa por refeição contra as anteriores, qual
   dia puxa o custo, qual item domina a conta, quanto do custo está
   escondido por falta de cotação e se a proteína está desequilibrada.

   Nenhum achado aqui depende de registro novo da equipe. Função PURA,
   testada em copiloto.test.ts.
   ===================================================================== */

import { custoDaSemana, custoDoDia, itensDoDiaParaCusto, type OpcoesCusto } from './custo-semana';
import { resolverPreco } from './precos';
import {
  converterParaUnidadeBase,
  proteinaDoPrato,
  ROTULO_PROTEINA,
  DIAS_SEMANA,
} from './motor';
import type { Achado } from './estudo-operacao';
import type { EstadoSemana, Proteina } from './tipos';

export interface SemanaRef {
  semanaId: string;
  estado: EstadoSemana;
}

export interface EntradaCopiloto {
  /** Semana aberta na tela — o alvo das recomendações. */
  atual: SemanaRef;
  /** Semanas anteriores já montadas, para servir de régua. */
  anteriores: SemanaRef[];
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  opcoes?: OpcoesCusto;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Math.abs(Math.round(v))}%`;

function mediana(valores: number[]): number | null {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Custo de cada item da semana, somando os sete dias. */
function custoPorItem(
  estado: EstadoSemana,
  precos: Record<string, number>,
  estimativas: Record<string, number>,
  opcoes: OpcoesCusto,
): { norm: string; custo: number }[] {
  const soma = new Map<string, number>();
  estado.dias.forEach((_, di) => {
    for (const l of itensDoDiaParaCusto(estado, di, opcoes)) {
      const r = resolverPreco(l.norm, precos, estimativas);
      if (!(r.valor > 0)) continue;
      soma.set(l.norm, (soma.get(l.norm) ?? 0) + r.valor * converterParaUnidadeBase(l.qtd, l.unid));
    }
  });
  return Array.from(soma.entries())
    .map(([norm, custo]) => ({ norm, custo }))
    .sort((a, b) => b.custo - a.custo);
}

/* ---------- 1) a semana está cara comparada às anteriores? ---------- */

function achadoCustoDaSemana(e: EntradaCopiloto): Achado[] {
  const opcoes = e.opcoes ?? {};
  const est = e.estimativas ?? {};
  const atual = custoDaSemana(e.atual.estado, e.precos, est, opcoes);
  if (!atual.porRefeicao) return [];

  const anteriores = e.anteriores
    .map((s) => custoDaSemana(s.estado, e.precos, est, opcoes).porRefeicao ?? 0)
    .filter((v) => v > 0);

  const ref = mediana(anteriores);
  if (ref === null || anteriores.length < 2) return [];

  const variacao = ((atual.porRefeicao - ref) / ref) * 100;
  if (Math.abs(variacao) < 12) return [];

  const acima = variacao > 0;
  const diferencaSemana = (atual.porRefeicao - ref) * atual.totalPessoas;
  return [{
    id: 'custo-semana',
    categoria: 'gasto',
    prioridade: acima && variacao >= 25 ? 'alta' : 'media',
    titulo: acima
      ? `Esta semana está ${pct(variacao)} mais cara por refeição`
      : `Esta semana está ${pct(variacao)} mais barata por refeição`,
    evidencia: `${brl(atual.porRefeicao)}/refeição contra ${brl(ref)} de mediana nas ${anteriores.length} semanas anteriores.`,
    acao: acima
      ? 'Veja abaixo qual dia e qual item estão puxando — trocar um prato costuma resolver.'
      : 'Registre o que mudou nesta semana para repetir o padrão.',
    impactoSemanal: acima ? Math.abs(diferencaSemana) : undefined,
  }];
}

/* ------------------ 2) qual dia puxa o custo para cima ------------------ */

function achadoDiaCaro(e: EntradaCopiloto): Achado[] {
  const opcoes = e.opcoes ?? {};
  const est = e.estimativas ?? {};
  const porDia = e.atual.estado.dias.map((dia, di) => {
    if (!dia.principal || !(dia.pessoas > 0)) return null;
    const c = custoDoDia(e.atual.estado, di, e.precos, est, opcoes);
    if (!(c.total > 0)) return null;
    return { di, prato: dia.principal, porRefeicao: c.total / dia.pessoas, total: c.total };
  }).filter(Boolean) as { di: number; prato: string; porRefeicao: number; total: number }[];

  if (porDia.length < 3) return [];

  const ordenado = [...porDia].sort((a, b) => b.porRefeicao - a.porRefeicao);
  const caro = ordenado[0];
  const media = porDia.reduce((s, d) => s + d.porRefeicao, 0) / porDia.length;
  const variacao = ((caro.porRefeicao - media) / media) * 100;
  if (variacao < 25) return [];

  // item que domina o custo daquele dia
  const itens = itensDoDiaParaCusto(e.atual.estado, caro.di, opcoes)
    .map((l) => {
      const r = resolverPreco(l.norm, e.precos, est);
      return { norm: l.norm, custo: r.valor > 0 ? r.valor * converterParaUnidadeBase(l.qtd, l.unid) : 0 };
    })
    .sort((a, b) => b.custo - a.custo);
  const dominante = itens[0];
  const share = dominante && caro.total > 0 ? (dominante.custo / caro.total) * 100 : 0;

  return [{
    id: `dia-caro-${caro.di}`,
    categoria: 'gasto',
    prioridade: variacao >= 50 ? 'alta' : 'media',
    titulo: `${DIAS_SEMANA[caro.di]} é o dia mais caro da semana`,
    evidencia:
      `${brl(caro.porRefeicao)}/refeição com "${caro.prato}", ${pct(variacao)} acima da média dos outros dias` +
      (dominante && share > 0 ? ` — ${pct(share)} do custo do dia vem de ${dominante.norm}.` : '.'),
    acao: dominante
      ? `Recote ${dominante.norm} ou troque o prato deste dia por outro da mesma proteína.`
      : 'Troque o prato deste dia por outro da mesma proteína.',
    impactoSemanal: caro.total - media * (caro.total / caro.porRefeicao),
  }];
}

/* -------------- 3) poucos itens concentram o custo da semana ------------- */

function achadoConcentracao(e: EntradaCopiloto): Achado[] {
  const itens = custoPorItem(e.atual.estado, e.precos, e.estimativas ?? {}, e.opcoes ?? {});
  const total = itens.reduce((s, i) => s + i.custo, 0);
  if (!(total > 0) || itens.length < 5) return [];

  const top3 = itens.slice(0, 3);
  const share = (top3.reduce((s, i) => s + i.custo, 0) / total) * 100;
  if (share < 45) return [];

  return [{
    id: 'concentracao',
    categoria: 'oportunidade',
    prioridade: 'media',
    titulo: `${pct(share)} do custo da semana está em 3 itens`,
    evidencia: top3.map((i) => `${i.norm} ${brl(i.custo)}`).join(' · '),
    acao: 'Negociar só estes três já move o custo da semana inteira — é onde uma cotação melhor rende mais.',
  }];
}

/* ------------- 4) custo escondido: itens sem preço na conta ------------- */

function achadoSemPreco(e: EntradaCopiloto): Achado[] {
  const c = custoDaSemana(e.atual.estado, e.precos, e.estimativas ?? {}, e.opcoes ?? {});
  if (c.itensSemPreco === 0 || c.itens === 0) return [];

  const share = (c.itensSemPreco / c.itens) * 100;
  if (share < 8) return [];

  return [{
    id: 'sem-preco',
    categoria: 'preco',
    prioridade: share >= 20 ? 'alta' : 'media',
    titulo: `${c.itensSemPreco} itens da semana estão sem preço`,
    evidencia:
      `${pct(share)} das linhas da lista não têm cotação` +
      (c.semPreco.length ? ` (ex.: ${c.semPreco.slice(0, 3).join(', ')}).` : '.') +
      ` O custo mostrado (${brl(c.total)}) é menor que o real.`,
    acao: 'Cote esses itens antes de fechar o pedido — sem eles o custo por refeição está subestimado.',
  }];
}

/* ------------------ 5) equilíbrio de proteína na semana ----------------- */

const LIMITE_PROTEINA: Partial<Record<Proteina, number>> = {
  frango: 3,
  suina: 2,
  bovina: 3,
};

function achadoProteina(e: EntradaCopiloto): Achado[] {
  const cont = new Map<Proteina, number>();
  let comPrato = 0;
  for (const d of e.atual.estado.dias) {
    if (!d.principal) continue;
    comPrato++;
    const p = proteinaDoPrato(d.principal);
    cont.set(p, (cont.get(p) ?? 0) + 1);
  }
  if (comPrato < 5) return [];

  const out: Achado[] = [];
  for (const [proteina, limite] of Object.entries(LIMITE_PROTEINA) as [Proteina, number][]) {
    const n = cont.get(proteina) ?? 0;
    if (n <= limite) continue;
    out.push({
      id: `proteina-${proteina}`,
      categoria: 'variedade',
      prioridade: n >= limite + 2 ? 'alta' : 'media',
      titulo: `${ROTULO_PROTEINA[proteina]} aparece ${n}× nesta semana`,
      evidencia: `${n} de ${comPrato} dias com prato definido — o recomendado é no máximo ${limite}×.`,
      acao: 'Troque um dia por peixe ou por uma proteína menos usada para equilibrar a semana.',
    });
  }
  return out;
}

/* --------------------- 6) orçamento definido x custo -------------------- */

function achadoOrcamento(e: EntradaCopiloto): Achado[] {
  const orcamento = e.atual.estado.orcamento;
  if (!orcamento || orcamento <= 0) return [];
  const c = custoDaSemana(e.atual.estado, e.precos, e.estimativas ?? {}, e.opcoes ?? {});
  if (!(c.total > 0)) return [];

  const variacao = ((c.total - orcamento) / orcamento) * 100;
  if (variacao < 5) return [];

  return [{
    id: 'orcamento',
    categoria: 'gasto',
    prioridade: variacao >= 15 ? 'alta' : 'media',
    titulo: `Semana ${pct(variacao)} acima do orçamento`,
    evidencia: `Lista em ${brl(c.total)} contra orçamento de ${brl(orcamento)} — ${brl(c.total - orcamento)} a mais.`,
    acao: 'Ajuste o prato do dia mais caro ou reveja as quantidades antes de mandar comprar.',
    impactoSemanal: c.total - orcamento,
  }];
}

/* ------------------------------ copiloto ------------------------------- */

/**
 * Achados que dependem apenas de cardápio + preço — ou seja, disponíveis
 * desde o primeiro dia de uso, sem esperar a equipe registrar nada.
 */
export function analisarCardapio(e: EntradaCopiloto): Achado[] {
  const ORDEM = { alta: 0, media: 1, baixa: 2 } as const;
  return [
    ...achadoOrcamento(e),
    ...achadoCustoDaSemana(e),
    ...achadoDiaCaro(e),
    ...achadoSemPreco(e),
    ...achadoProteina(e),
    ...achadoConcentracao(e),
  ].sort((a, b) => {
    const p = ORDEM[a.prioridade] - ORDEM[b.prioridade];
    return p !== 0 ? p : (b.impactoSemanal ?? 0) - (a.impactoSemanal ?? 0);
  });
}
