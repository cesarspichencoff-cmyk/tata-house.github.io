/* =====================================================================
   Nutrição do PRATO MONTADO — não só da proteína.

   Por que este arquivo existe (achado do nutricionista, 20/08/2026):
   a análise antiga media apenas o prato principal, numa porção de
   200–350 g. Isso produzia três distorções, exatamente as relatadas:

   • "Carbo fora da realidade" — arroz e feijão, que são a maior fonte
     de carboidrato do almoço, simplesmente não entravam na conta. Um
     frango grelhado aparecia com 0 g de carboidrato.
   • "Gordura acima, indo para o lado de fritura" — sem o arroz, o
     feijão e a salada diluindo, a gordura da proteína (muitas vezes
     frita ou gorda) virava quase todo o perfil do prato.
   • "500 g / proteína 3 colheres" — a porção medida não era a porção
     servida. Aqui o prato passa a ser montado como no self-service.

   Referência de porção (recomendação do nutricionista):
     prato de ~500 g, com a proteína em 3 colheres de servir.

   Fonte dos valores por 100 g: TACO (Tabela Brasileira de Composição
   de Alimentos), com arredondamento operacional.
   ===================================================================== */

import { normalizar } from './motor';
import { infoNutricional, type InfoNutricional } from './nutricional';
import type { DiaCardapio } from './tipos';

/* --------------------------- porções servidas -------------------------- */

/** 1 colher de servir de proteína ≈ 40 g; o nutricionista pede 3. */
export const COLHER_SERVIR_G = 40;
export const PORCAO_PROTEINA_G = 3 * COLHER_SERVIR_G; // 120 g
export const PORCAO_ARROZ_G = 150;
export const PORCAO_FEIJAO_G = 80;
export const PORCAO_GUARNICAO_G = 90;
export const PORCAO_SALADA_G = 60;

/** Prato de referência ≈ 500 g montado. */
export const PORCAO_PRATO_G =
  PORCAO_PROTEINA_G + PORCAO_ARROZ_G + PORCAO_FEIJAO_G + PORCAO_GUARNICAO_G + PORCAO_SALADA_G;

/* ---------------------- composição por 100 g (TACO) -------------------- */

export interface Macros {
  kcal: number;
  prot: number;
  carb: number;
  gord: number;
  fibra: number;
  sodio: number; // mg
}

const zero: Macros = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, sodio: 0 };

const por100g = (
  kcal: number, prot: number, carb: number, gord: number, fibra: number, sodio: number,
): Macros => ({ kcal, prot, carb, gord, fibra, sodio });

/** Acompanhamentos e guarnições, por 100 g prontos para consumo. */
const GUARNICOES: Record<string, Macros> = {
  'arroz branco':        por100g(128, 2.5, 28.0, 0.2, 0.5, 200),
  'arroz':               por100g(128, 2.5, 28.0, 0.2, 0.5, 200),
  'arroz integral':      por100g(124, 2.6, 26.0, 1.0, 2.7, 190),
  'feijao':              por100g(76, 4.8, 13.6, 0.5, 8.5, 130),
  'feijao carioca':      por100g(76, 4.8, 13.6, 0.5, 8.5, 130),
  'feijao preto':        por100g(77, 4.5, 14.0, 0.5, 8.4, 130),
  'arroz e feijao':      por100g(110, 3.3, 23.0, 0.3, 3.3, 175),
  'farofa':              por100g(405, 3.0, 60.0, 16.0, 5.0, 520),
  'farofa temperada':    por100g(415, 3.2, 59.0, 17.0, 5.0, 560),
  'farofa simples':      por100g(395, 2.8, 61.0, 15.0, 5.0, 480),
  'pure de batata':      por100g(100, 2.0, 15.0, 3.5, 1.3, 260),
  'batata frita':        por100g(267, 3.4, 35.0, 13.0, 3.0, 210),
  'batata corada':       por100g(150, 2.5, 24.0, 5.0, 2.0, 180),
  'mandioca':            por100g(125, 0.6, 30.0, 0.3, 1.6, 60),
  'mandioca frita':      por100g(280, 1.0, 38.0, 13.0, 2.0, 180),
  'polenta':             por100g(105, 2.0, 22.0, 1.0, 1.0, 200),
  'macarrao':            por100g(160, 5.0, 31.0, 1.5, 1.8, 150),
  'abobora refogada':    por100g(60, 1.2, 8.0, 2.5, 2.0, 160),
  'legumes refogados':   por100g(65, 1.8, 8.0, 2.8, 2.5, 170),
  'legumes':             por100g(60, 1.7, 8.0, 2.4, 2.5, 150),
  'couve refogada':      por100g(90, 3.0, 8.0, 5.0, 3.0, 200),
  'quibebe':             por100g(70, 1.5, 10.0, 2.5, 2.2, 170),
};

/** Saladas, por 100 g. Cruas são leves; refogadas levam óleo. */
const SALADAS: Record<string, Macros> = {
  'alface':              por100g(15, 1.3, 2.3, 0.2, 1.7, 8),
  'alface e tomate':     por100g(18, 1.0, 3.5, 0.2, 1.4, 10),
  'tomate':              por100g(21, 1.1, 4.6, 0.2, 1.2, 5),
  'repolho':             por100g(25, 1.3, 5.8, 0.1, 2.5, 15),
  'repolho roxo':        por100g(31, 1.4, 7.0, 0.2, 2.0, 20),
  'acelga':              por100g(19, 1.8, 3.7, 0.2, 1.6, 210),
  'couve':               por100g(27, 2.9, 4.3, 0.5, 3.1, 30),
  'abobrinha':           por100g(19, 1.1, 4.3, 0.1, 1.2, 12),
  'pepino':              por100g(16, 0.7, 3.6, 0.1, 1.0, 5),
  'cenoura':             por100g(34, 1.3, 7.7, 0.2, 3.2, 65),
  'beterraba':           por100g(49, 1.9, 11.1, 0.1, 3.4, 60),
};

/** Quando o nome não casa, usa uma média conservadora da categoria. */
const PADRAO_GUARNICAO: Macros = por100g(140, 2.5, 25.0, 3.5, 2.0, 220);
const PADRAO_SALADA: Macros = por100g(22, 1.3, 4.3, 0.2, 1.8, 30);

/** Busca por nome, aceitando o mais específico contido no texto. */
function buscar(nome: string | undefined, tabela: Record<string, Macros>): Macros | null {
  const n = normalizar(nome);
  if (!n) return null;
  if (tabela[n]) return tabela[n];
  let melhor: string | null = null;
  for (const chave of Object.keys(tabela)) {
    if (n.includes(chave) && (!melhor || chave.length > melhor.length)) melhor = chave;
  }
  return melhor ? tabela[melhor] : null;
}

const escalar = (m: Macros, gramas: number): Macros => {
  const f = gramas / 100;
  return {
    kcal: m.kcal * f, prot: m.prot * f, carb: m.carb * f,
    gord: m.gord * f, fibra: m.fibra * f, sodio: m.sodio * f,
  };
};

const somar = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal, prot: a.prot + b.prot, carb: a.carb + b.carb,
  gord: a.gord + b.gord, fibra: a.fibra + b.fibra, sodio: a.sodio + b.sodio,
});

/** Lê os gramas de uma porção escrita como "200g" ou "200g + molho". */
export function gramasDaPorcao(porcao: string | undefined): number | null {
  const m = /(\d+)\s*g/i.exec(porcao ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Macros da proteína na porção que o nutricionista recomenda (3 colheres
 * de servir), reescalando a tabela — que descreve porções de 180–350 g.
 */
export function macrosProteina(prato: string | null | undefined): Macros | null {
  const info: InfoNutricional | null = infoNutricional(prato);
  if (!info) return null;
  const gramasTabela = gramasDaPorcao(info.porcao) ?? 200;
  const f = PORCAO_PROTEINA_G / gramasTabela;
  return {
    kcal: info.kcal * f,
    prot: info.proteinas * f,
    carb: info.carboidratos * f,
    gord: info.gorduras * f,
    fibra: info.fibras * f,
    sodio: info.sodio * f,
  };
}

export interface NutricaoPratoMontado extends Macros {
  /** Gramas somadas do prato montado (referência ≈ 500 g). */
  gramas: number;
  /** true quando a proteína do dia não foi reconhecida na tabela. */
  proteinaDesconhecida: boolean;
}

/**
 * Nutrição do prato como ele chega à bandeja: proteína + arroz + feijão
 * + guarnição + salada. É esta a conta que a equipe deve ver.
 */
export function nutricaoDoPratoMontado(dia: DiaCardapio): NutricaoPratoMontado | null {
  if (!dia?.principal) return null;

  const prot = macrosProteina(dia.principal);
  let total: Macros = prot ?? zero;

  // "Arroz e Feijão" (guarnição fixa) entra como os dois componentes.
  const fixaNorm = normalizar(dia.guarnicaoFixa);
  if (fixaNorm.includes('arroz') && fixaNorm.includes('feijao')) {
    total = somar(total, escalar(GUARNICOES['arroz branco'], PORCAO_ARROZ_G));
    total = somar(total, escalar(GUARNICOES['feijao'], PORCAO_FEIJAO_G));
  } else if (fixaNorm) {
    const m = buscar(dia.guarnicaoFixa, GUARNICOES) ?? PADRAO_GUARNICAO;
    total = somar(total, escalar(m, PORCAO_ARROZ_G));
  }

  if (normalizar(dia.guarnicao)) {
    const m = buscar(dia.guarnicao, GUARNICOES) ?? PADRAO_GUARNICAO;
    total = somar(total, escalar(m, PORCAO_GUARNICAO_G));
  }

  if (normalizar(dia.salada)) {
    const m = buscar(dia.salada, SALADAS) ?? PADRAO_SALADA;
    total = somar(total, escalar(m, PORCAO_SALADA_G));
  }

  const r = (v: number) => Math.round(v);
  return {
    kcal: r(total.kcal),
    prot: r(total.prot),
    carb: r(total.carb),
    gord: r(total.gord),
    fibra: r(total.fibra),
    sodio: r(total.sodio),
    gramas: PORCAO_PRATO_G,
    proteinaDesconhecida: prot === null,
  };
}

/* =====================================================================
   Índice Nutricional da semana (0–100).

   Recalibrado em 20/08/2026 junto com a revisão do nutricionista. Os
   limites antigos (>480 kcal, >26 g de gordura, <20 g de proteína) valiam
   para a porção só da proteína; medindo o PRATO MONTADO (~500 g), um
   almoço perfeitamente normal passa dos 600 kcal e dispararia alarme
   todo dia. As faixas abaixo são as de um almoço completo, que responde
   por ~35–40% da necessidade diária.
   ===================================================================== */
export function indiceNutricionalSemana(dias: DiaCardapio[]): {
  score: number;
  rotulo: string;
  cor: string;
  detalhes: string[];
} {
  const pratos = dias
    .filter((d) => d.principal)
    .map((d) => nutricaoDoPratoMontado(d))
    .filter(Boolean) as NutricaoPratoMontado[];

  if (pratos.length === 0) return { score: 0, rotulo: 'Sem dados', cor: 'carvao', detalhes: [] };

  const media = (f: (p: NutricaoPratoMontado) => number) =>
    pratos.reduce((a, p) => a + f(p), 0) / pratos.length;

  const detalhes: string[] = [];
  let score = 100;

  const kcal = media((p) => p.kcal);
  if (kcal > 850) { score -= 12; detalhes.push('Calorias acima do ideal (>850 kcal por prato)'); }
  else if (kcal < 450) { score -= 8; detalhes.push('Calorias abaixo do ideal (<450 kcal por prato)'); }

  const sodio = media((p) => p.sodio);
  if (sodio > 1200) { score -= 15; detalhes.push('Sódio elevado (>1200 mg por prato)'); }
  else if (sodio > 900) { score -= 8; detalhes.push('Sódio moderadamente alto'); }

  // Gordura avaliada como PERCENTUAL das calorias — era isto que estava
  // mascarado: 21 g pareciam "ok" quando o prato media 393 kcal, mas eram
  // 48% das calorias. A faixa saudável é 25–35%.
  const gord = media((p) => p.gord);
  const pctGordura = kcal > 0 ? (gord * 9) / kcal : 0;
  if (pctGordura > 0.4) { score -= 14; detalhes.push(`Gordura alta: ${Math.round(pctGordura * 100)}% das calorias (ideal até 35%) — muita fritura`); }
  else if (pctGordura > 0.35) { score -= 7; detalhes.push(`Gordura um pouco alta: ${Math.round(pctGordura * 100)}% das calorias`); }

  const prot = media((p) => p.prot);
  if (prot < 18) { score -= 10; detalhes.push('Proteína baixa (<18 g por prato)'); }
  else if (prot >= 25) { score += 5; detalhes.push('Boa densidade proteica (≥25 g por prato)'); }

  const fibra = media((p) => p.fibra);
  if (fibra >= 8) { score += 5; detalhes.push('Boa fonte de fibras (feijão e salada)'); }
  else if (fibra < 4) { score -= 6; detalhes.push('Fibras baixas — reforce salada e leguminosas'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const rotulo = score >= 80 ? 'Saudável' : score >= 60 ? 'Equilibrado' : 'Necessita ajustes';
  const cor = score >= 80 ? 'brand' : score >= 60 ? 'ouro' : 'vermelho';

  return { score, rotulo, cor, detalhes };
}
