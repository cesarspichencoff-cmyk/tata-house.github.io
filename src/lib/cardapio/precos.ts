/* =====================================================================
   Núcleo de preços — quatro estados claros:
   - real:       veio da cotação, nota fiscal ou entrada manual confirmada.
   - historico:  média das planilhas de compras Mai/Jun 2026 — sempre disponível.
   - estimado:   estimativa de mercado gerada pelo usuário (substituída pelo
                 histórico quando disponível).
   - sem:        item totalmente sem referência de preço.
   Funções puras, sem efeitos; a camada de UI só consome o resultado.
   ===================================================================== */

import { DADOS, normalizar, converterParaUnidadeBase, ingredienteBase } from './motor';
import { PRECOS_COMPRAS, UNIDADES_COMPRAS } from './precos-compras';
import type { HistoricoPrecos } from './tipos';

export type TipoPreco = 'real' | 'historico' | 'estimado' | 'sem';

export interface PrecoResolvido {
  valor: number;
  tipo: TipoPreco;
}

/** Referências internas mais recentes disponíveis para o ciclo out-dez/2026.
 * Não são preço confirmado da semana: entram como referência até Compras
 * aplicar a cotação real. Quando não há dado recente, o histórico antigo segue
 * como fallback normal do motor. */
const REFERENCIAS_RECENTES_2026: Record<string, number> = {
  'acem': 32.49,
  'bisteca suina': 14.98,
  'lombo suino': 20.85,
  'costelinha suina': 16.93,
  'file de tilapia': 35.48,
  'file de coxa': 12.69,
  'file de frango': 16.64,
  'file de peito': 16.64,
  'peito de frango': 16.64,
  'coxa de frango': 8.29,
  'sobrecoxa': 10.49,
  'coxa e sobre coxa': 9.39,
  'abobora': 2.98,
  'abobora moranga': 2.98,
  'beterraba': 3.29,
  'mandioca': 3.31,
  'repolho': 5.87,
  'melancia': 5.92,
  'pepino': 6.58,
  'cenoura': 7.03,
  'abacaxi': 7.40,
  'banana': 7.89,
  'batata': 10.66,
  'alface crespa': 15.30,
  'fruta da semana': 7.06,
};

const unidadeDe = new Map<string, string>();
DADOS.itens.forEach((i) => unidadeDe.set(normalizar(i.n), i.u));

function media(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / Math.max(ns.length, 1);
}

/* ------------------------------------------------------------------ */
/* Resolução aproximada — mapeia variantes do dados.json → PRECOS_COMPRAS */
/* ------------------------------------------------------------------ */

// Aliases explícitos para itens que não batem por prefixo
const ALIASES_HISTORICO: Record<string, string> = {
  // ovos
  'ovos': 'ovo',
  // óleos e gorduras
  'oleo': 'oleo de soja',
  'oleo vegetal': 'oleo de soja',
  // temperos base
  'alho': 'alho descascado',
  'cebola': 'cebola branca',
  'cebola roxa': 'cebola branca',
  'cebola-': 'cebola branca',
  // carboidratos
  'arroz branco': 'arroz',
  'espaguete': 'macarrao espaguete',
  'macarrao': 'macarrao espaguete',
  'macarrao parafuso': 'macarrao espaguete',
  'macarrao penne': 'macarrao espaguete',
  'macarrao spaguetti': 'macarrao espaguete',
  'farinha de mandioca': 'farinha de mandioca crua',
  'farinha mandioca': 'farinha de mandioca crua',
  'farinha torrada de mandioca': 'farinha de mandioca crua',
  'farinha de empanar': 'farinha para empanar',
  'polenta': 'fuba',
  // queijos
  'parmesao': 'queijo parmesao',
  'parmesao ralado': 'queijo parmesao',
  'queijo mussarela': 'mussarela',
  'mussarela-': 'mussarela',
  // molhos e condimentos
  'shoyu': 'molho shoyu',
  'pimentao': 'pimentao verde',
  'pimentao verde-': 'pimentao verde',
  'barbecue': 'molho barbecue',
  'extrato de tomate': 'molho de tomate',
  'extrato tomate': 'molho de tomate',
  // embutidos
  'calabresa': 'linguica calabresa',
  'linguica calabresa-': 'linguica calabresa',
  'toscana': 'linguica toscana',
  'linguica toscana-': 'linguica toscana',
  'linguica fresca': 'linguica toscana',
  // frango — variantes → file de frango (custo mais próximo)
  'frango': 'file de frango',
  'frango em cubos': 'file de frango',
  'frango inteiro': 'coxa e sobre coxa',
  'peito de frango': 'file de frango',
  'file de peito': 'file de frango',
  'file de coxa': 'file de frango',
  'filezinho sassami': 'file de frango',
  'cubos de frangos': 'file de frango',
  'tiras de frango': 'file de frango',
  'tiras de frangos': 'file de frango',
  'tiras file de frango': 'file de frango',
  'coxa': 'coxa e sobre coxa',
  'coxa pilao': 'coxa e sobre coxa',
  'sobre coxa': 'coxa e sobre coxa',
  'sobrecoxa': 'coxa e sobre coxa',
  'coxa e sobrecoxa': 'coxa e sobre coxa',
  'coxa sobre coxa': 'coxa e sobre coxa',
  // asas e cortes pequenos → frango a passarinho (mesmo corte, preço real disponível)
  'asa': 'frango a passarinho',
  'asa de frango': 'frango a passarinho',
  'coxinha da asa': 'frango a passarinho',
  'coxinha de asa': 'frango a passarinho',
  'meio da asa': 'frango a passarinho',
  'flat de asa': 'frango a passarinho',
  'drumette': 'frango a passarinho',
  // bovinos
  'bife': 'acem',
  'bife acem': 'acem',
  'bife a role': 'acem',
  'bife role': 'acem',
  'bife de patinho': 'acem',
  'carne moida': 'acem moido',
  'carne bovina moida': 'acem moido',
  'carne em cubos': 'acem em cubo',
  'acem em cubo': 'acem',
  'tiras de carne': 'acem',
  'tiras de carnes': 'acem',
  'strogonofe': 'tiras de carnes',
  'strogonofe/tiras de carnes': 'tiras de carnes',
  'patinho': 'acem',
  'aranha': 'acem',
  'aranha alcatra': 'alcatra',
  'aranha da alcatra': 'alcatra',
  'chuleta bovina': 'acem',
  'chuleta paulista': 'acem',
  // suínos
  'pernil': 'pernil suino',
  'pernil de porco': 'pernil suino',
  'pernil fatiado': 'pernil suino',
  'lombo': 'lombo suino',
  'lombo de porco': 'lombo suino',
  'costelinha': 'costela',
  'costelinha de porco': 'costela',
  'costelinha suina': 'costela',
  'costelinha fresca': 'costela',
  'costelina suina': 'costela',
  'bisteca': 'bisteca suina',
  'bisteca de porco': 'bisteca suina',
  // sobremesas
  'gelatina': 'gelatina (sabores)',
  'gelatina de abacaxi': 'gelatina (sabores)',
  'gelatina de morango': 'gelatina (sabores)',
  'gelatina framboesa': 'gelatina (sabores)',
  'gelatina-': 'gelatina (sabores)',
  'pudim': 'pudim pronto',
  'pudim chocolate': 'pudim pronto',
  'pudim de chocolate': 'pudim pronto',
  'pudim de coco': 'pudim pronto',
  'pudim de morango': 'pudim pronto',
  'flan baunilha': 'flan',
  'flan de baunilha': 'flan',
  'flany baunilha': 'flan',
  'flany de baunilha': 'flan',
  'mousse chocolate': 'flan',
  'mousse de chocolate': 'flan',
  'mousse de maracuja': 'flan',
  'mousse de morango': 'flan',
  'mousse morango pronto': 'flan',
  'curau': 'curau pronto',
  // frutas
  'abacaxi madura': 'abacaxi',
  'abacaxi maduro': 'abacaxi',
  'banana': 'banana da terra',
  'banana da terra madura': 'banana da terra',
  'banana da terra maduro': 'banana da terra',
  'banana da terra verde': 'banana da terra',
  // legumes variantes
  'abobora': 'abobora japonesa',
  'abobrinha': 'abobrinha italiana',
  'alface': 'alface crespa',
  'alface americano': 'alface americana',
  'couve': 'couve manteiga',
  'couve flor': 'brocolis',
  'couve-flor': 'brocolis',
  'brocolis ninja': 'brocolis',
  'batata doce': 'batata',
  'batata bolinha': 'batata',
  'batata frita': 'batata',
  'fritas': 'batata congelada',
  'pepino japones': 'pepino',
  'pepino comum': 'pepino',
  'cenoura ralada': 'cenoura',
  'repolho': 'repolho branco',
  'milho': 'milho verde em lata',
  'milho verde': 'milho verde em lata',
  // laticínios/derivados
  'creme culinario': 'creme de leite',
  'leite de coco': 'creme de leite',
  'leite condensado-': 'leite condensado',
  // massas/grãos
  'pure de batata': 'pure em po',
  'feijao carioca': 'feijao',
  'feijao fraldinha': 'feijao fradinho',
  'feijao fraldinho': 'feijao fradinho',
  'massa de lasanha': 'massa para lasanha',
  'massa lasanha': 'massa para lasanha',
  // carne bovina genérica (captura "carne" após limpeza de qualificadores)
  'carne': 'acem',
  // almôndega = carne moída
  'almondega': 'acem moido',
  'almondegas': 'acem moido',
  // alcatra e rabada → referência bovina disponível
  'aranha de alcatra': 'alcatra',
  'rabada bovina': 'costela',
  'osso': 'costela',
  // ervas frescas → herb mais próximo nas compras
  'cebolinha': 'coentro',
  'cebolihha': 'coentro',
  'salsinha': 'salsa desidratada',
  'manjericao': 'ervas finas',
  'guento': 'coentro',
  // gorduras/laticínios
  'manteiga': 'creme de leite',
  'essencia de baunilha': 'adocante',
  // frutas não compradas → proxy de preço por unidade/kg disponível
  'abacate': 'goiaba',
  'laranja': 'goiaba',
  'limao': 'goiaba',
  'manga': 'goiaba',
  'mamao': 'melao',
  'maca': 'goiaba',
  'maca fuji': 'goiaba',
  'mexerica': 'goiaba',
  'maracuja': 'melao',
  // legumes não comprados → proxy de legume disponível
  'agriao': 'acelga',
  'berinjela': 'abobrinha italiana',
  'espinafre': 'acelga',
  'rucula': 'acelga',
  // grãos/doces secos
  'canjica': 'feijao',
  'mazeina': 'maisena',
  'chocolate': 'maisena',
  'bolacha maisena': 'maisena',
  'bolacha': 'refrescos',
  'champion': 'chuchu',
  // sucos industrializados → refrescos
  'suco de morango': 'refrescos',
  'suco de morango calda': 'refrescos',
  'suco de maracuja': 'refrescos',
  'suco de limao': 'refrescos',
  'suco de frambeosa': 'refrescos',
  'suco': 'refrescos',
  // typos / nomes truncados
  'leite condensadon': 'leite condensado',
  'leite condesado': 'leite condensado',
  'maionsese': 'maionese',
  'peito de frango s': 'file de frango',
  // cacau/cacão
  'cacao': 'maisena',
  // mousse sem qualificador (após remoção do parêntese " (Pronto)")
  'mousse morango': 'flan',
};

// Pré-compila lookup por prefixo de palavras (ex: "batata" → "batata congelada")
// Itens mais curtos têm prioridade (sorted menor primeiro)
const LOOKUP_PREFIXO: Record<string, string> = {};
for (const chave of Object.keys(PRECOS_COMPRAS).sort((a, b) => a.length - b.length)) {
  const palavras = chave.split(' ');
  for (let i = 1; i <= palavras.length; i++) {
    const pref = palavras.slice(0, i).join(' ');
    if (!LOOKUP_PREFIXO[pref]) LOOKUP_PREFIXO[pref] = chave;
  }
}

/** Remove qualificadores que não mudam o produto base nem seu custo.
 *  Usa lookahead (?=\s|$) para não consumir o espaço seguinte, permitindo
 *  que múltiplos qualificadores (ex: "suína em tiras") sejam removidos numa
 *  única passagem do regex. */
function limpezaNorm(s: string): string {
  return s
    .replace(/[-\s.]+$/, '')
    .replace(/\s*\([^)]*\)/g, '')                                             // "(Pronto)" "(sabores)" etc.
    .replace(/\s+\d+[,.]?\d*\s*(?:kg|g|l|ml|un)\b/gi, '')                    // "16,4 kg" embutido no nome
    .replace(
      /\s+(sem osso|fatiado[a]?|em cubos?|em bifes?|em tiras?|em peca|em conserva|descascad[oa]|ralad[oa]|frit[oa]s?|pronto[a]?s?|maduro[a]?s?|de porco|bovina?|suina?|baunilha|inteiro[a]?s?|sem sabor|incolor|fresco[a]?|ninja|comum|na manteiga|em estoque|tem estoque|precisa vim)(?=\s|$)/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Busca o preço histórico de um item por aproximação quando não há correspondência exata. */
function buscarHistorico(norm: string): number | null {
  // 1. Alias explícito
  const aliasKey = ALIASES_HISTORICO[norm];
  if (aliasKey && PRECOS_COMPRAS[aliasKey] > 0) return PRECOS_COMPRAS[aliasKey];

  // 2. Norma limpa (sem qualificadores) → alias → direto
  const limpo = limpezaNorm(norm);
  if (limpo !== norm) {
    if (PRECOS_COMPRAS[limpo] > 0) return PRECOS_COMPRAS[limpo];
    const aliasLimpo = ALIASES_HISTORICO[limpo];
    if (aliasLimpo && PRECOS_COMPRAS[aliasLimpo] > 0) return PRECOS_COMPRAS[aliasLimpo];
  }

  // 3. Prefixo de palavras (tenta o mais longo primeiro para máxima especificidade)
  const palavras = limpo.split(' ');
  for (let i = palavras.length; i >= 1; i--) {
    const pref = palavras.slice(0, i).join(' ');
    const chave = LOOKUP_PREFIXO[pref];
    if (chave && PRECOS_COMPRAS[chave] > 0) return PRECOS_COMPRAS[chave];
  }

  return null;
}

/**
 * Resolve o preço de um item em quatro camadas de prioridade:
 * 1. real      — preço digitado/aplicado pela operação
 * 2. historico — referência interna recente; depois histórico de compras
 * 3. estimado  — estimativa de mercado gerada pelo usuário
 * 4. sem       — sem nenhuma referência (evitado ao máximo)
 * Antes de desistir, tenta o ingrediente base (preparo → cru).
 */
export function resolverPreco(
  norm: string,
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
  semFallbackPreparo = false,
): PrecoResolvido {
  const real = precos[norm];
  if (real > 0) return { valor: real, tipo: 'real' };

  // A bag de 5 L precisa de cotação própria. O histórico antigo não prova o
  // preço desta embalagem, então não o reaproveitamos como se fosse atual.
  if (norm === 'leite condensado' || norm === 'leite condensado bag 5 l') {
    const estLeite = estimativas[norm];
    return estLeite > 0 ? { valor: estLeite, tipo: 'estimado' } : { valor: 0, tipo: 'sem' };
  }

  const recente = REFERENCIAS_RECENTES_2026[norm];
  if (recente > 0) return { valor: recente, tipo: 'historico' };
  const hist = PRECOS_COMPRAS[norm] > 0 ? PRECOS_COMPRAS[norm] : buscarHistorico(norm);
  if (hist !== null && hist > 0) return { valor: hist, tipo: 'historico' };
  const est = estimativas[norm];
  if (est > 0) return { valor: est, tipo: 'estimado' };
  // Preparo → ingrediente base (mandioca frita → mandioca), uma única vez.
  if (!semFallbackPreparo) {
    const base = ingredienteBase(norm);
    if (base !== norm) {
      const r = resolverPreco(base, precos, estimativas, true);
      if (r.tipo !== 'sem') return r;
    }
  }
  return { valor: 0, tipo: 'sem' };
}

/** Normaliza unidades para comparação: g/kg→kg, ml/l→l, resto→un. */
function unidadeBase(u: string): string {
  const s = u.toLowerCase();
  if (s === 'g' || s === 'kg') return 'kg';
  if (s === 'ml' || s === 'l') return 'l';
  return 'un';
}

/**
 * Estimativa de preço para itens que não constam nas planilhas de compra:
 * 1. Histórico local registrado pelo usuário (mais confiável).
 * 2. Média de preços reais de outros itens com a mesma unidade.
 * 3. null — sem referência possível.
 *
 * Nota: para itens presentes nas planilhas Mai/Jun 2026, o `resolverPreco`
 * já retorna o preço histórico automaticamente; `estimarPreco` só é acionado
 * para itens fora dessas planilhas.
 */
export function estimarPreco(
  norm: string,
  precos: Record<string, number>,
  historico: HistoricoPrecos,
  unidadeHint?: string,
): number | null {
  // 1. Histórico de preços registrado manualmente
  const serie = historico[norm];
  if (serie && serie.length) return Math.round(media(serie.map((p) => p.valor)) * 100) / 100;

  // 2. Média de itens com mesma unidade (combinando planilhas + entradas manuais)
  // unidadeHint cobre itens extras (não presentes em DADOS.itens) que têm unidade conhecida
  const u = unidadeDe.get(norm) ?? unidadeHint;
  if (u) {
    const ub = unidadeBase(u);
    const dasCompras = Object.entries(PRECOS_COMPRAS)
      .filter(([k, v]) => v > 0 && unidadeBase(UNIDADES_COMPRAS[k] ?? '') === ub)
      .map(([, v]) => v);
    const dosDados = DADOS.itens
      .filter((it) => unidadeBase(it.u) === ub && precos[normalizar(it.n)] > 0)
      .map((it) => precos[normalizar(it.n)]);
    const todos = Array.from(new Set([...dasCompras, ...dosDados]));
    if (todos.length >= 2) return Math.round(media(todos) * 100) / 100;
    if (todos.length === 1) return Math.round(todos[0] * 100) / 100;
  }
  return null;
}

/**
 * Estimativa por IA/API externa — seam para a fase futura. Hoje retorna null
 * (cai na estimativa interna); quando houver chave/endpoint, é só implementar
 * aqui sem mudar quem consome.
 */
export async function estimarPrecoIA(_norm: string): Promise<number | null> {
  void _norm;
  return null;
}

export interface CustoTipado {
  total: number; // real + estimado
  real: number;
  estimado: number;
  itensReais: number;
  itensEstimados: number;
  itensSemPreco: number;
  semPreco: string[]; // norms sem preço (real nem estimado)
}

/**
 * Soma o custo separando real, estimado e sem preço.
 * Aceita `unid` opcionalmente — quando presente, converte g→kg e ml→lt
 * antes de multiplicar pelo preço (que é sempre armazenado por kg ou lt).
 */
export function custoTipado(
  itens: { norm: string; qtd: number; unid?: string }[],
  precos: Record<string, number>,
  estimativas: Record<string, number> = {},
): CustoTipado {
  const c: CustoTipado = {
    total: 0,
    real: 0,
    estimado: 0,
    itensReais: 0,
    itensEstimados: 0,
    itensSemPreco: 0,
    semPreco: [],
  };
  itens.forEach(({ norm, qtd, unid }) => {
    const qtdBase = unid ? converterParaUnidadeBase(qtd, unid) : qtd;
    const r = resolverPreco(norm, precos, estimativas);
    if (r.tipo === 'real') {
      c.real += r.valor * qtdBase;
      c.itensReais++;
    } else if (r.tipo === 'historico' || r.tipo === 'estimado') {
      // histórico e estimado contribuem ao custo estimado (não confirmado)
      c.estimado += r.valor * qtdBase;
      c.itensEstimados++;
    } else {
      c.itensSemPreco++;
      c.semPreco.push(norm);
    }
  });
  c.total = c.real + c.estimado;
  return c;
}

export const ROTULO_TIPO_PRECO: Record<TipoPreco, string> = {
  real:      'real',
  historico: 'histórico',
  estimado:  'estimado',
  sem:       'sem preço',
};
