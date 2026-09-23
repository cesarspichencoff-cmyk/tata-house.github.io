/* =====================================================================
   Leitor de cotações — cole o texto do WhatsApp (ou da tabela do
   fornecedor) e extraímos itens + preços, casando com o histórico.

   Formatos reconhecidos:
   A) "7,00 Frango inteiro RF"               → preço na frente
   B) "Acém Resf - Ribeiro *31,90*"          → preço no fim (asteriscos)
   C) "Tiras de carnes\t\tR$ 43,00"          → R$ no fim, com tabulações
   D) "ALHO KG 29,80"                        → tabela com unidade no meio
   E) "WG\tTiras de carnes\t\tR$ 43,00"     → fornecedor prefixando a linha
   ===================================================================== */

import { DADOS, normalizar } from './motor';
import { converterPreco } from './unidades';
import { resolverPreco } from './precos';
import { PRECOS_COMPRAS, UNIDADES_COMPRAS } from './precos-compras';
import { iaEdgeAtivo, chamarEdge } from './ia-cliente';

export type Confianca = 'alta' | 'media' | 'baixa' | 'sem-historico';

export interface LinhaCotacao {
  nome: string;
  preco: number;
  marca: string | null;
  unid: string | null;
  item: string | null;
  // Validação contra histórico TATÁ House
  precoHistorico?: number | null;
  deltaHistorico?: number | null; // fração: +0.3 = 30% acima
  confianca?: Confianca;
  alerta?: string | null;
  /** Unidade incompatível com o padrão: preço NÃO pode ser aplicado. */
  bloqueado?: boolean;
  origemHistorico?: string | null;
  conservacao?: 'resfriado' | 'congelado' | null;
  origem?: 'texto' | 'estruturado' | 'ia';
}

export interface ItemCotado {
  item: string;
  unid: string;
  preco: number;
  marca: string | null;
  ofertas: number;
  precoHistorico?: number | null;
  deltaHistorico?: number | null;
  confianca?: Confianca;
  alerta?: string | null;
  /** Unidade incompatível com o padrão: preço NÃO pode ser aplicado. */
  bloqueado?: boolean;
  origemHistorico?: string | null;
}

const RE_PRECO = /\d{1,3}(?:\.\d{3})?,\d{2}/g;
const RE_TEM_PRECO = /\d{1,3}(?:\.\d{3})?,\d{2}/;
const UNIDADES = new Set(['kg', 'un', 'cx', 'bd', 'dz', 'pct', 'lt', 'mc', 'mç', 'pc', 'sc']);

/** Palavras de qualificação que não ajudam a identificar o produto. */
const RUIDO = new Set([
  'resf', 'resfriado', 'resfriada', 'cong', 'congelado', 'congelada', 'congelados',
  'rf', 'cg', 'grill', 'fifo', 'premium', 'tradicional', 'nanica', 'ouro', 'in', 'natura',
  'inteira', 'pesado', 'pesada', 'porc', 'fatiado', 'fatiados', 'fatiada', 'val',
  'tipo', 'extra', 'especial', 'novilho', 'solteira', 'temp',
]);

/** Fornecedores sempre reconhecidos — nunca desabilitados, mesmo quando o usuário cadastra os seus.
    Cobre os fornecedores reais da casa (planilha jan–mai/2026) para que um
    cabeçalho "FLD", "Mar Fish", "Malte"… já marque a seção sem precisar cadastrar. */
const FORNECEDORES_BASE: [RegExp, string][] = [
  [/vita[\s-]*frango/i, 'Vita Frango'],
  [/\bjampac\b/i,       'JAMPAC Alimentos'],
  [/apeti+t+o/i,        'Apetito Foods'],
  [/\bsul[\s-]*beef\b/i, 'Sulbeef'],
  [/\bwg\b/i,           'WG'],
  [/frito[\s-]*sul/i,   'Frito Sul'],
  [/\bfld\b/i,          'FLD'],
  [/mar[\s-]*fish/i,    'Mar Fish'],
  [/\bmalte\b/i,        'Malte'],
  [/\bbiofood\b/i,      'Biofood'],
  [/frango[\s-]*da[\s-]*nonna/i, 'Frango da Nonna'],
  [/princesa[\s-]*do[\s-]*oeste/i, 'Princesa do Oeste'],
  [/\bkenai\b/i,        'Kenai'],
  [/\bjonaldo\b/i,      'Jonaldo'],
  [/\bfrigosul\b/i,     'Frigosul'],
  [/\brold[aã]o\b/i,    'Roldão'],
  [/atacad[aã]o/i,      'Atacadão'],
  [/irm[aã]os[\s-]*avelino/i, 'Irmãos Avelino'],
];

/**
 * Remetentes INTERNOS — pessoas do setor de compras que ENCAMINHAM as
 * cotações dos fornecedores (ex.: a Erika). Nunca são fornecedores. O sistema
 * ignora esses nomes ao detectar/registrar fornecedor e busca o nome REAL do
 * fornecedor no conteúdo da mensagem. Estende-se em runtime via `bloquearRemetente`.
 */
const NAO_FORNECEDORES = new Set<string>(['erika']);

/** Frases da própria casa que encaminha as cotações — nunca são fornecedor. */
const FRASES_INTERNAS = ['tata sushi', 'tata house', 'sushi compras', 'compras erika'];

/** Marca um nome como remetente interno (nunca tratado como fornecedor). */
export function bloquearRemetente(nome: string) {
  const n = normalizar(nome);
  if (n) NAO_FORNECEDORES.add(n);
}

/** True se o nome é de alguém interno (quem encaminha), não um fornecedor. */
export function ehRemetenteInterno(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const n = normalizar(nome);
  if (!n) return false;
  if (NAO_FORNECEDORES.has(n)) return true;
  // frases da própria casa: "Tatá Sushi Compras - Érika", "Tatá House" etc.
  if (FRASES_INTERNAS.some((f) => n.includes(f))) return true;
  // também pega "Erika Compras", "[10:32] Erika:" → o primeiro nome próprio
  const palavras = n.split(/\s+/);
  return palavras.some((p) => NAO_FORNECEDORES.has(p));
}

/** Gera regex a partir do nome cadastrado (case-insensitive, espaços flexíveis). */
function regexDeFornecedor(nome: string): RegExp {
  const s = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return new RegExp(`\\b${s}\\b`, 'i');
}

/**
 * Constrói lookup: custom tem prioridade, base é sempre incluída como complemento.
 * Nunca inventa fornecedor — só reconhece o que foi cadastrado ou está na base.
 */
function buildLookupFornecedor(custom: string[]): (s: string) => string | null {
  // Remetentes internos (Erika etc.) nunca entram como fornecedor, mesmo se
  // foram cadastrados por engano antes desta regra existir.
  const customValido = custom.filter((n) => !ehRemetenteInterno(n));
  const customPares: [RegExp, string][] = customValido.map((n) => [regexDeFornecedor(n), n]);
  const customNomes = new Set(customValido.map((n) => n.toLowerCase()));
  const basePares = FORNECEDORES_BASE.filter(([, nome]) => !customNomes.has(nome.toLowerCase()));
  const lista = [...customPares, ...basePares];
  return (s: string) => {
    for (const [re, nome] of lista) if (re.test(s)) return ehRemetenteInterno(nome) ? null : nome;
    return null;
  };
}

function paraNumero(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** Tokens informativos de um nome (sem acento, sem ruído, sem números). */
function tokens(nome: string): string[] {
  return normalizar(nome)
    .replace(/\bs\/(\w)/g, 'sem $1')
    .replace(/\bc\/(\w)/g, 'com $1')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !RUIDO.has(t) && !/^\d/.test(t));
}

/* ---------------- aliases: cotação → item canônico do histórico -------- */

const ALIASES: [RegExp, string][] = [
  [/file.*(peito|frango).*(s|sem).*osso|^file (de )?frango/, 'File de frango sem osso'],
  [/^sassami$/, 'Filezinho sassami'],
  [/peito.*(s\/|sem )sassami/, 'Peito de Frango sem osso'],
  [/peito (c\/|com )?osso/, 'Peito de Frango'],
  [/tiras? de carnes?/, 'Tiras de Carne'],
  [/tiras? de frangos?/, 'Tiras de frango'],
  [/acem moido|carne moida acem/, 'Acém moído'],
  [/acem em pecas?/, 'Acem em peça'],
  [/acem.*(cubos|iscas)/, 'Acem em cubos'],
  [/^acem\b/, 'Acém'],
  [/carne moida/, 'Carne Moída'],
  [/costelinha|costela.*(suina|churrasco|tiras)/, 'Costelinha suína'],
  [/^costela(?: bovina)?$/, 'Costela Bovina'],
  [/^lombo(?: suino)?$/, 'Lombo suíno'],
  [/bisteca/, 'Bisteca suína'],
  [/bife a role/, 'Bife a Role'],
  [/^bife(?: bovino)?$/, 'Bife'],
  [/linguica toscana|ling toscana/, 'Linguiça Toscana'],
  [/calabresa/, 'Linguiça Calabresa'],
  [/linguica suina|ling suina/, 'Linguiça Fresca'],
  [/frango inteiro|frango (s\/|sem )miudos/, 'Frango inteiro'],
  [/coxa (c\/|com )?(sobrecoxa|sobre coxa)|sobrecoxa|sobre coxa/, 'Sobre coxa'],
  [/^pernil(?: suino)?$/, 'Pernil de porco fatiado'],
  [/mussarela/, 'Mussarela'],
  [/^batata (?:palito|frita)$/, 'Batata Frita'],
  [/^ovos?( de galinha| vermelhos| extra)?$/, 'Ovos'],
];

export interface SugestaoItemCotacao {
  item: string | null;
  unid: string | null;
  confianca: number;
  motivo: 'alias' | 'exato' | 'tokens' | 'ambiguo' | 'sem-match';
}

function tokenComparavel(token: string): string {
  const mapa: Record<string, string> = {
    und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
    kgs: 'kg', quilo: 'kg', quilos: 'kg',
    pacotes: 'pacote', caixas: 'caixa', bandejas: 'bandeja',
  };
  let t = mapa[token] ?? token;
  // Singularização conservadora cobre a maior parte dos nomes de fornecedor
  // (tomates, cenouras, abacaxis, frangos) sem tentar adivinhar morfologia inteira.
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}

function tokensComparaveis(nome: string): string[] {
  return Array.from(new Set(tokens(nome).map(tokenComparavel).filter(Boolean)));
}

function candidatosCatalogo(itensExtras?: Record<string, { n: string; u: string }>) {
  const mapa = new Map<string, { n: string; u: string; f: number }>();
  for (const it of DADOS.itens) mapa.set(normalizar(it.n), { n: it.n, u: it.u, f: it.f });
  for (const extra of Object.values(itensExtras ?? {})) {
    const k = normalizar(extra.n);
    if (k && !mapa.has(k)) mapa.set(k, { n: extra.n, u: extra.u, f: 0 });
  }
  return Array.from(mapa.values());
}

/**
 * Resolve nomes de fornecedor contra o catálogo sem pedir trabalho humano item a item.
 * Só aceita automaticamente quando o melhor candidato é forte E claramente melhor
 * que o segundo colocado; ambiguidade continua explícita em vez de contaminar preços.
 */
export function sugerirItemCotacao(
  nome: string,
  itensExtras?: Record<string, { n: string; u: string }>,
): SugestaoItemCotacao {
  const tokensNome = tokensComparaveis(nome);
  const n = tokensNome.join(' ');
  if (!n) return { item: null, unid: null, confianca: 0, motivo: 'sem-match' };

  // Item extra já aprendido pela operação tem prioridade quando o nome canônico
  // está integralmente contido no texto do fornecedor e o match é único.
  // Aqui NÃO usamos RUIDO: termos como "especial" podem ser justamente parte do
  // nome ensinado pela operação ("Molho especial"). Ainda exigimos >=2 tokens
  // para não transformar uma palavra genérica isolada em casamento automático.
  const tokensAprendidos = (valor: string) =>
    normalizar(valor).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !/^\d/.test(t));
  const setNomeAprendido = new Set(tokensAprendidos(nome));
  const extrasCompativeis = Object.values(itensExtras ?? {}).filter((extra) => {
    const et = tokensAprendidos(extra.n);
    return et.length >= 2 && et.every((t) => setNomeAprendido.has(t));
  });
  if (extrasCompativeis.length === 1) {
    const extra = extrasCompativeis[0];
    return { item: extra.n, unid: extra.u || null, confianca: 0.97, motivo: 'tokens' };
  }

  const catalogo = candidatosCatalogo(itensExtras);
  const consultaNorm = normalizar(nome);
  const exato = catalogo.find((it) => normalizar(it.n) === consultaNorm);
  if (exato) {
    return { item: exato.n, unid: exato.u || null, confianca: 1, motivo: 'exato' };
  }

  for (const [re, alvo] of ALIASES) {
    if (!re.test(n)) continue;
    const alvoDados = catalogo.find((it) => normalizar(it.n) === normalizar(alvo));
    return { item: alvo, unid: alvoDados?.u ?? null, confianca: 1, motivo: 'alias' };
  }

  const consultaTokens = new Set(tokensComparaveis(nome));
  const avaliados = catalogo.map((it) => {
    const candidatoNorm = normalizar(it.n);
    if (candidatoNorm === consultaNorm) return { ...it, score: 1 };

    const candTokens = new Set(tokensComparaveis(it.n));
    if (candTokens.size === 0 || consultaTokens.size === 0) return { ...it, score: 0 };
    let inter = 0;
    candTokens.forEach((t) => { if (consultaTokens.has(t)) inter += 1; });
    if (inter === 0) return { ...it, score: 0 };

    const dice = (2 * inter) / (candTokens.size + consultaTokens.size);
    const coberturaCandidato = inter / candTokens.size;
    const coberturaConsulta = inter / consultaTokens.size;
    let score = dice;

    // Nome do fornecedor contém todo o nome canônico + qualificadores/embalagem.
    if (candTokens.size >= 2 && coberturaCandidato === 1) {
      score = Math.max(score, 0.94 - Math.min(0.08, Math.max(0, consultaTokens.size - candTokens.size) * 0.02));
    }
    // Fornecedor usa uma forma mais curta, mas todos os seus tokens apontam ao candidato.
    if (consultaTokens.size >= 2 && coberturaConsulta === 1) score = Math.max(score, 0.88);
    // Plural/singular de item de uma palavra é seguro após normalização conservadora.
    if (consultaTokens.size === 1 && candTokens.size === 1 && inter === 1) score = 0.98;

    // Frequência histórica só desempata; não transforma semelhança ruim em match.
    score += Math.min(it.f, 100) / 100000;
    return { ...it, score: Math.min(score, 1) };
  }).sort((a, b) => b.score - a.score || a.n.localeCompare(b.n, 'pt-BR'));

  const melhor = avaliados[0];
  const segundo = avaliados[1];
  if (!melhor || melhor.score < 0.82) {
    return { item: null, unid: null, confianca: melhor?.score ?? 0, motivo: 'sem-match' };
  }
  const margem = melhor.score - (segundo?.score ?? 0);
  const seguro = (melhor.score >= 0.94 && margem >= 0.04) || (melhor.score >= 0.86 && margem >= 0.08);
  if (!seguro) {
    return { item: null, unid: null, confianca: melhor.score, motivo: 'ambiguo' };
  }
  return {
    item: melhor.n,
    unid: melhor.u || null,
    confianca: melhor.score,
    motivo: melhor.score >= 0.98 ? 'exato' : 'tokens',
  };
}

/** Casa um nome de cotação com um item conhecido (ou null). */
export function casarItem(nome: string): string | null {
  return sugerirItemCotacao(nome).item;
}

/* --------------------------- parser de texto -------------------------- */

/**
 * Muitas cotações de hortifrúti vêm em 2–3 colunas coladas numa linha só:
 * "GENGIBRE KG 19,48 INHAME KG 11,59 JILO KG 20,30". Sem separar, só o primeiro
 * (ou pior, o preço trocado) é lido. Quebra em uma linha por item toda vez que
 * um par "UNIDADE PREÇO" é seguido de mais conteúdo (o próximo item).
 */
const RE_UNID_SPLIT = 'kg|un|und|unid|cx|bd|bdj|dz|pct|lt|l|mc|mç|pc|sc|mo';
function separarMultiItens(linha: string): string[] {
  const re = new RegExp(`\\b(${RE_UNID_SPLIT})\\s+(\\d{1,3}(?:\\.\\d{3})?,\\d{2})\\s+(?=\\S)`, 'gi');
  return linha.replace(re, '$1 $2\n').split('\n');
}

function limparLinha(bruta: string): string {
  return bruta
    .replace(/^\[[^\]]*\]\s*[^:]*:\s*/, '')    // prefixo WhatsApp "[data] C.:"
    .replace(/\*/g, '')
    .replace(/_([^_]+)_/g, '$1')               // itálico WhatsApp _texto_
    .replace(/[\t ]+/g, ' ')
    .replace(/\bval\.?\s*\d{2}\/\d{2}(\/\d{2,4})?/gi, '') // validade "Val 08/07"
    .replace(/\bvalidade\.?\s*\d{2}\/\d{2}(\/\d{2,4})?/gi, '')
    .replace(/\bcx c\/ ?\d+ ?kgs?\b/gi, '')
    .replace(/\bfifo\b/gi, '')
    // emojis BMP (Misc Symbols, Dingbats, etc.)
    .replace(/[⌀-⏿☀-➿⬀-⯿■-◿]/g, '')
    // emojis nos planos suplementares (surrogate pairs: U+1F000+)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    // variation selectors, zero-width joiner, combining enclosing keycap
    .replace(/[︀-️‍⃣]/g, '')
    .trim();
}

/**
 * Detecta se uma linha sem preço é um cabeçalho de fornecedor genérico.
 * Retorna null para saudações, datas, dias da semana e linhas muito longas.
 */
function detectarFornecedor(linha: string): string | null {
  if (linha.length < 2 || linha.length > 80) return null;
  if (RE_TEM_PRECO.test(linha)) return null;
  if (!/[a-zA-ZÀ-ÿ]/.test(linha)) return null;
  // Saudações → não é fornecedor
  if (/^(bom\s+dia|boa\s+tarde|boa\s+noite|oi\b|olá\b|prezad)/i.test(linha)) return null;
  // Dias da semana e datas ("Segunda-feira 08/06/2026") → não é fornecedor
  if (/^(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i.test(linha)) return null;
  const words = linha.trim().split(/\s+/);
  if (words.length > 8) return null;
  // Limpa prefixo "TABELA", datas DD/MM e pontuação final
  const limpo = linha
    .replace(/^tabela\s+/i, '')
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, '')
    .replace(/[-–:.,!?▪•]+\s*$/, '')
    .trim();
  return limpo || null;
}

/* ─── Validação histórica ──────────────────────────────────────────── */

/**
 * Cruza o preço cotado com o histórico real do TATÁ (planilhas Mai/Jun 2026).
 * Atribui confiança e alerta sem inventar nada.
 */
function validarLinha(l: LinhaCotacao): LinhaCotacao {
  const normItem = l.item ? normalizar(l.item) : null;
  const normNome = normalizar(l.nome);

  // Tenta resolver pelo item canônico primeiro, depois pelo nome bruto
  let hist = normItem ? resolverPreco(normItem, {}) : { valor: 0, tipo: 'sem' as const };
  if (hist.valor === 0) hist = resolverPreco(normNome, {});

  if (hist.valor === 0 || hist.tipo === 'sem') {
    return { ...l, precoHistorico: null, deltaHistorico: null, confianca: 'sem-historico', alerta: null, origemHistorico: null };
  }

  const precoHist = hist.valor;
  const delta = (l.preco - precoHist) / precoHist;
  const deltaAbs = Math.abs(delta);

  let confianca: Confianca = deltaAbs <= 0.12 ? 'alta' : deltaAbs <= 0.30 ? 'media' : 'baixa';
  let alerta: string | null = null;

  if (confianca === 'baixa') {
    const sinal = delta > 0 ? '+' : '';
    alerta = `${sinal}${(delta * 100).toFixed(0)}% vs histórico R$${precoHist.toFixed(2)}`;
    if (delta < -0.45) alerta += ' — verificar unidade';
  }

  // Unidade: antes daqui, uma cotação em unidade diferente do padrão gerava
  // só um aviso e o preço era aplicado como se estivesse na unidade certa —
  // caixa cotada virava preço por quilo e inflava o custo em silêncio.
  const keyHist = normItem ?? normNome;
  const unidEsperada = (UNIDADES_COMPRAS[keyHist] ?? '').toLowerCase();
  let precoFinal = l.preco;
  let bloqueado = false;

  if (l.unid && unidEsperada && l.unid !== unidEsperada) {
    const conv = converterPreco(l.preco, l.unid, unidEsperada);
    if (conv.status === 'convertido') {
      precoFinal = conv.valor;
      const nota = `convertido de ${l.unid.toUpperCase()} para ${unidEsperada.toUpperCase()}`;
      alerta = alerta ? `${alerta} · ${nota}` : nota;
    } else if (conv.status === 'incompativel') {
      bloqueado = true;
      const nota = conv.motivo ?? `unidade "${l.unid}" ≠ padrão "${unidEsperada}"`;
      alerta = alerta ? `${alerta} · ${nota}` : nota;
      confianca = 'baixa';
    }
  }

  const origemHistorico = hist.tipo === 'historico' ? 'planilha Mai/Jun 2026' : 'estimado';
  return {
    ...l,
    preco: precoFinal,
    precoHistorico: precoHist,
    deltaHistorico: delta,
    confianca,
    alerta,
    bloqueado,
    origemHistorico,
  };
}

/** Top 40 itens do histórico formatados para incluir no prompt do Groq. */
function buildContextoHistorico(): string {
  const linhas = Object.entries(PRECOS_COMPRAS)
    .filter(([, v]) => v > 0)
    .slice(0, 40)
    .map(([item, preco]) => {
      const unid = (UNIDADES_COMPRAS[item] ?? 'kg').toLowerCase();
      return `  ${item}: R$${preco.toFixed(2)}/${unid}`;
    });
  return `PREÇOS REAIS TATÁ HOUSE (Mai/Jun 2026 — use para validar, nunca para inventar):\n${linhas.join('\n')}`;
}


function unidadeEstruturada(valor: string | undefined): string | null {
  const n = normalizar(valor ?? '').replace(/\s+/g, ' ');
  if (!n || n === 'nao informado' || n === 'nao informada' || n === 'n/a') return null;
  const mapa: Record<string, string> = {
    und: 'un', unid: 'un', unidade: 'un', bdj: 'bd', bandeja: 'bd', pacote: 'pct',
    pcte: 'pct', litro: 'lt', litros: 'lt', l: 'lt', caixa: 'cx', saco: 'sc',
    maco: 'mc', peca: 'pc',
  };
  const u = mapa[n] ?? n;
  return UNIDADES.has(u) ? u : null;
}

function precoEstruturado(valor: string | undefined): number {
  if (!valor) return 0;
  const limpo = valor.replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!limpo) return 0;
  if (/,\d{1,2}$/.test(limpo)) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  const n = Number(limpo.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function conservacaoEstruturada(valor: string | undefined): 'resfriado' | 'congelado' | null {
  const n = normalizar(valor ?? '');
  if (/^(rf|resf|resfriado|resfriada)$/.test(n)) return 'resfriado';
  if (/^(cg|cong|congelado|congelada|congelados)$/.test(n)) return 'congelado';
  return null;
}

/** formato canônico estruturado: metadado nunca vira nome de produto. */
function parsearLinhaEstruturada(
  linha: string,
  fornecedorConhecido: (s: string) => string | null,
): LinhaCotacao | null {
  const campos: Record<string, string> = {};
  for (const parte of linha.split('|')) {
    const pos = parte.indexOf('=');
    if (pos <= 0) continue;
    const chave = normalizar(parte.slice(0, pos)).replace(/\s+/g, '_');
    const valor = parte.slice(pos + 1).trim();
    if (chave && valor) campos[chave] = valor;
  }

  const produto = (campos.produto ?? campos.item ?? campos.nome ?? '').trim();
  const preco = precoEstruturado(campos.preco);
  if (!produto || !(preco > 0)) return null;

  const fornecedorRaw = (campos.fornecedor ?? '').trim();
  const marcaRaw = (campos.marca ?? '').trim();
  let marca: string | null = null;
  if (fornecedorRaw && !ehRemetenteInterno(fornecedorRaw)) marca = fornecedorConhecido(fornecedorRaw) ?? fornecedorRaw;
  else if (marcaRaw && !ehRemetenteInterno(marcaRaw)) marca = fornecedorConhecido(marcaRaw) ?? marcaRaw;

  const unid = unidadeEstruturada(campos.unidade_preco ?? campos.unidade ?? campos.unid);
  const conservacao = conservacaoEstruturada(campos.conservacao ?? campos.estado);
  return validarLinha({ nome: produto, preco, marca, unid, item: casarItem(produto), conservacao, origem: 'estruturado' });
}

/**
 * Algumas mensagens reais chegam com o nome do fornecedor DEPOIS da tabela,
 * por exemplo uma mensagem com preços seguida de "WG 👆🏾".
 * A seta para cima é evidência explícita de que o rótulo vale para a mensagem
 * anterior. Fazemos a correção antes do parser normal, sem adivinhar nomes.
 */
function aplicarFornecedorPosteriorWhatsApp(
  texto: string,
  fornecedorConhecido: (s: string) => string | null,
): string {
  const linhas = texto.split(/\r?\n/);
  const blocos: { linhas: string[]; fornecedorInjetado?: string; consumir?: boolean }[] = [];
  let atual: { linhas: string[]; fornecedorInjetado?: string; consumir?: boolean } | null = null;

  for (const linha of linhas) {
    if (/^\[[^\]]+\]\s*[^:\n]{1,60}:/.test(linha)) {
      atual = { linhas: [linha] };
      blocos.push(atual);
    } else if (atual) {
      atual.linhas.push(linha);
    } else {
      atual = { linhas: [linha] };
      blocos.push(atual);
    }
  }

  for (let i = 1; i < blocos.length; i += 1) {
    const bloco = blocos[i];
    const bruto = bloco.linhas.join(' ');
    if (!/👆/u.test(bruto) || RE_TEM_PRECO.test(bruto)) continue;

    const limpas = bloco.linhas.map(limparLinha).filter(Boolean);
    const etiqueta = fornecedorConhecido(limpas.join(' '));
    if (!etiqueta) continue;

    const anterior = blocos[i - 1];
    const linhasAnteriores = anterior.linhas.map(limparLinha).filter(Boolean);
    if (!linhasAnteriores.some((l) => RE_TEM_PRECO.test(l))) continue;

    // Se o próprio bloco anterior já nomeia um fornecedor conhecido,
    // ele é mais forte que a anotação posterior.
    const explicito = linhasAnteriores.some((l) => !RE_TEM_PRECO.test(l) && !!fornecedorConhecido(l));
    if (!explicito) anterior.fornecedorInjetado = etiqueta;
    bloco.consumir = true;
  }

  return blocos
    .flatMap((b) => b.consumir ? [] : [b.fornecedorInjetado ? `Fornecedor: ${b.fornecedorInjetado}` : '', ...b.linhas])
    .filter(Boolean)
    .join('\n');
}

export function parsearCotacao(texto: string, fornecedoresCustom: string[] = []): LinhaCotacao[] {
  const linhas: LinhaCotacao[] = [];
  let fornecedorSecao: string | null = null;
  const fornecedorConhecido = buildLookupFornecedor(fornecedoresCustom);
  const textoPreparado = aplicarFornecedorPosteriorWhatsApp(texto, fornecedorConhecido);

  for (const bruta of textoPreparado.split(/\r?\n/)) {
    // Extrai remetente do prefixo WA "[data] Remetente:" ANTES de limpar
    const mWA = bruta.match(/^\[[^\]]*\]\s*([^:\n]{1,60}):/);
    const temPrefitoWA = !!mWA;
    if (mWA) {
      const fk = fornecedorConhecido(mWA[1].trim());
      if (fk) fornecedorSecao = fk;
    }
    const linhaLimpa = limparLinha(bruta);
    if (!linhaLimpa || linhaLimpa.length < 2) continue;

    if (/^(importante|legenda|observa(?:cao|ção)|obs)\s*[:\-]/i.test(linhaLimpa)) continue;

    const pareceEstruturada = /(?:^|\|)\s*(?:id|fornecedor|produto|item|nome|preco|unidade_preco|conservacao|estado)\s*=/i.test(linhaLimpa);
    if (pareceEstruturada) {
      const estruturada = parsearLinhaEstruturada(linhaLimpa, fornecedorConhecido);
      if (estruturada) linhas.push(estruturada);
      continue;
    }

    // Quebra linhas multi-item ("A KG 1,00 B KG 2,00") em uma por item.
    for (const linha of separarMultiItens(linhaLimpa)) {
    if (linha.trim().length < 2) continue;

    const precos = linha.match(RE_PRECO);

    if (!precos) {
      // Cabeçalho explícito "Fornecedor: X" / "Fornecedor X" — vale para os
      // itens abaixo, mesmo que X ainda não esteja cadastrado (o usuário
      // escreveu de propósito). Remetente interno (Érika) continua barrado.
      const mForn = linha.match(/^fornecedor\s*[:\-–]?\s*(.{2,40})$/i);
      if (mForn) {
        const nome = mForn[1].trim();
        if (!ehRemetenteInterno(nome)) fornecedorSecao = fornecedorConhecido(nome) ?? nome;
        continue;
      }
      // Senão, só reconhece fornecedor cadastrado/base — nunca inventa.
      const fk = fornecedorConhecido(linha);
      if (fk) fornecedorSecao = fk;
      continue;
    }

    // Linha tem preço(s).
    // Detecta padrão E: fornecedor prefixando a linha de item.
    let linhaItem = linha;
    const mPrefix = linha.match(/^(\S{2,10})\s(.+)$/);
    if (mPrefix && !RE_TEM_PRECO.test(mPrefix[1])) {
      const fk = fornecedorConhecido(mPrefix[1]);
      if (fk) {
        fornecedorSecao = fk;
        linhaItem = mPrefix[2];
      }
    }

    let nome = '';
    let preco = 0;
    let unid: string | null = null;

    const inicio = linhaItem.match(/^(\d{1,3}(?:\.\d{3})?,\d{2})\s+(.+)$/);
    if (inicio) {
      // Formato A: preço na frente
      preco = paraNumero(inicio[1]);
      nome = inicio[2].replace(/\b(RF|CG)\b\.?\*?/g, '').replace(/\be\b\s*$/i, '');
    } else {
      // Formatos B/C/D: último preço da linha
      const precosItem = linhaItem.match(RE_PRECO) ?? precos;
      const ultimo = precosItem[precosItem.length - 1];
      const pos = linhaItem.lastIndexOf(ultimo);
      preco = paraNumero(ultimo);
      nome = linhaItem.slice(0, pos).replace(/R\$\s*$/i, '');
      // Formato D: unidade como último token do nome ("ALHO KG 29,80")
      const m = nome.trim().match(/^(.*\S)\s+([A-Za-zÇç]{2,3})$/);
      if (m && UNIDADES.has(normalizar(m[2]))) {
        nome = m[1];
        unid = normalizar(m[2]);
      }
    }

    nome = nome.replace(/[-–:.,]+\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!nome || !(preco > 0)) continue;

    // Marca após " - ": limpa o nome sempre, mas só registra marca se for fornecedor conhecido.
    // Evita que "Acém - Ribeiro" vire fornecedor "Ribeiro" (Ribeiro é frigorifico, não cadastrado).
    let marca: string | null = null;
    const sep = nome.split(/\s[-–]\s/);
    if (sep.length > 1) {
      const candidato = sep[sep.length - 1].trim();
      marca = fornecedorConhecido(candidato);
      nome = sep.slice(0, -1).join(' - ').trim();
    }

    // se não veio marca inline, herda o fornecedor do cabeçalho de seção
    if (!marca && fornecedorSecao) {
      marca = fornecedorSecao;
    }

    const brutoConservacao = normalizar(linhaItem);
    const conservacao = /\b(rf|resf|resfriado|resfriada)\b/.test(brutoConservacao)
      ? 'resfriado' as const
      : /\b(cg|cong|congelado|congelada|congelados)\b/.test(brutoConservacao)
        ? 'congelado' as const
        : null;
    nome = nome.replace(/\b(RF|CG|RESF|RESFRIAD[OA]|CONG|CONGELAD[OA]S?)\b/gi, '').replace(/\s+/g, ' ').trim();
    const novaLinha: LinhaCotacao = { nome, preco, marca, unid, item: casarItem(nome), conservacao, origem: 'texto' };
    linhas.push(validarLinha(novaLinha));
    } // fim do loop de sub-itens da linha
  }
  return linhas;
}

/* ------------------- integração Gemini IA ----------------------------- */


function buildPromptIA(fornecedores: string[]): string {
  const listForn = fornecedores.length
    ? fornecedores.join(', ')
    : 'Vita Frango, Jampac, Apetito Foods, WG, Frito Sul';
  return `Você é o comprador do TATÁ House, restaurante industrial em SP.
Extraia TODOS os produtos com preço desta cotação recebida de fornecedores.

${buildContextoHistorico()}

FORNECEDORES CADASTRADOS: ${listForn}

QUEM ENCAMINHA (NÃO é fornecedor): ${Array.from(NAO_FORNECEDORES).join(', ') || '—'}

REGRAS:
- Cabeçalhos de categoria (*ACÉM*, *SUÍNOS*, *BOVINOS* etc.) → IGNORE
- Saudações, datas, dias da semana, status → IGNORE
- A pessoa do setor de compras que ENCAMINHA a cotação (ex.: ${Array.from(NAO_FORNECEDORES).join(', ') || 'Erika'}) NÃO é fornecedor. Nunca use o nome de quem encaminhou como marca. Identifique o fornecedor REAL pelo conteúdo/cabeçalho da própria mensagem.
- Remova qualificadores: Resf/Resfriado/Cong/Congelado/RF/CG/FIFO do nome
- "Produto - Marca valor" → marca é o texto após o traço
- Preço como número com ponto decimal (ex: 31.90)
- Nunca invente preço — extraia apenas do texto fornecido
- Nunca invente fornecedor — use apenas os cadastrados acima

Responda APENAS com JSON no formato {"items":[...]} (sem markdown):
{"items":[{"nome":"Frango inteiro","preco":7.00,"marca":"Vita Frango"},...]}`;

}

type ItemIA = { nome: string; preco: number; marca?: string };

function buildGroqPrompt(texto: string, fornecedores: string[]): string {
  return `${buildPromptIA(fornecedores)}\n\nCOTAÇÃO:\n${texto.slice(0, 16000)}`;
}

/** Converte o JSON da IA em linhas de cotação (descarta remetente interno como marca). */
function parseItensIA(txt: string): LinhaCotacao[] {
  const parsed: { items?: ItemIA[] } | ItemIA[] = JSON.parse(txt || '{}');
  const items: ItemIA[] = Array.isArray(parsed) ? parsed : (parsed as { items?: ItemIA[] }).items ?? [];
  return items
    .filter((it) => it.nome && it.preco > 0)
    .map((it) => {
      // Se a IA escorregou e pôs o remetente interno como marca, descarta.
      const marca = it.marca?.trim() || null;
      return {
        nome: it.nome.trim(),
        preco: it.preco,
        marca: marca && !ehRemetenteInterno(marca) ? marca : null,
        unid: null,
        item: casarItem(it.nome),
        conservacao: null,
        origem: 'ia' as const,
      };
    });
}

/**
 * Combina resultados da lógica (preços confiáveis) e da IA (contexto e nomes):
 * - Lógica é autoritativa em preços e matches já conhecidos
 * - IA preenche gaps: fornecedor não detectado, item canônico para "soltos"
 * - Itens que a IA achou mas a lógica não capturou são adicionados ao final
 */
function combinarResultados(logica: LinhaCotacao[], ia: LinhaCotacao[]): LinhaCotacao[] {
  if (!ia.length) return logica;

  // Fila de itens IA por preço (em centavos) para consumo sequencial
  const filaIA = new Map<number, LinhaCotacao[]>();
  for (const l of ia) {
    const k = Math.round(l.preco * 100);
    filaIA.set(k, [...(filaIA.get(k) ?? []), l]);
  }

  const iaConsumidos = new Set<LinhaCotacao>();

  const resultado = logica.map((l): LinhaCotacao => {
    const k = Math.round(l.preco * 100);
    const fila = filaIA.get(k) ?? [];
    const par = fila.shift();
    if (par) iaConsumidos.add(par);
    const merged: LinhaCotacao = {
      nome: l.nome,
      preco: l.preco,
      marca: l.marca || par?.marca || null,
      unid: l.unid,
      item: l.item || par?.item || null,
      conservacao: l.conservacao ?? par?.conservacao ?? null,
      origem: l.origem ?? par?.origem ?? 'texto',
    };
    return validarLinha(merged);
  });

  // Itens que a IA achou mas a lógica não capturou
  for (const l of ia) {
    if (!iaConsumidos.has(l)) resultado.push(l);
  }

  return resultado;
}

/**
 * Versão combo: lógica + Gemini.
 * A lógica cuida de preços e formatos conhecidos; a IA resolve gaps de contexto
 * (fornecedor, nomes ambíguos, formatos inesperados). Se a IA falhar, retorna
 * o resultado da lógica pura sem interromper o fluxo.
 */
export async function parsearCotacaoComIA(
  texto: string,
  fornecedoresCustom: string[] = [],
): Promise<{ linhas: LinhaCotacao[]; comIA: boolean; erroIA?: string }> {
  const logica = parsearCotacao(texto, fornecedoresCustom);
  const prompt = buildGroqPrompt(texto, fornecedoresCustom);
  if (!iaEdgeAtivo()) {
    return { linhas: logica, comIA: false, erroIA: 'IA segura do servidor não configurada; leitura lógica preservada.' };
  }
  try {
    const txt = await chamarEdge('groq', '', prompt, true);
    return { linhas: combinarResultados(logica, parseItensIA(txt)), comIA: true };
  } catch (e) {
    return { linhas: logica, comIA: false, erroIA: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Extrai o remetente mais frequente de uma conversa exportada do WhatsApp.
 * Útil para detectar o nome do fornecedor automaticamente quando o usuário
 * cola uma cotação recebida pelo WhatsApp.
 */
export function extrairRemetenteWhatsApp(texto: string): string | null {
  const re = /^\[[^\]]+\]\s*([^:\n]+):/gm;
  const freq: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const nome = m[1].trim();
    // Ignora quem só ENCAMINHA (Erika etc.) — não é fornecedor.
    if (nome && !ehRemetenteInterno(nome)) freq[nome] = (freq[nome] ?? 0) + 1;
  }
  if (!Object.keys(freq).length) return null;
  return Object.entries(freq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
}

/* ----------------- agregação: menor preço por item -------------------- */

const unidadeDoItem = new Map<string, string>();
DADOS.itens.forEach((it) => unidadeDoItem.set(it.n, it.u));

export function agruparCotacao(
  linhas: LinhaCotacao[],
  itensExtras?: Record<string, { n: string; u: string }>,
): {
  casados: ItemCotado[];
  soltos: LinhaCotacao[];
} {
  const porItem = new Map<string, ItemCotado>();
  const soltos: LinhaCotacao[] = [];

  for (const bruta of linhas) {
    // 1) alias já aprendido/exato; 2) matcher automático conservador contra
    // catálogo base + itens extras. Match novo é revalidado antes de aplicar preço.
    const extra = !bruta.item ? itensExtras?.[normalizar(bruta.nome)] : undefined;
    const sugestao = !bruta.item && !extra ? sugerirItemCotacao(bruta.nome, itensExtras) : null;
    const itemAuto = extra?.n ?? sugestao?.item ?? null;
    const unidadeAuto = extra?.u ?? sugestao?.unid ?? null;
    const l = itemAuto ? validarLinha({ ...bruta, item: itemAuto }) : bruta;
    if (!l.item) {
      soltos.push(l);
      continue;
    }
    const atual = porItem.get(l.item);
    if (!atual) {
      porItem.set(l.item, {
        item: l.item,
        unid: unidadeDoItem.get(l.item) ?? unidadeAuto ?? l.unid ?? '',
        preco: l.preco,
        marca: l.marca,
        ofertas: 1,
        precoHistorico: l.precoHistorico,
        deltaHistorico: l.deltaHistorico,
        confianca: l.confianca,
        alerta: l.alerta,
        bloqueado: l.bloqueado,
        origemHistorico: l.origemHistorico,
      });
    } else {
      atual.ofertas++;
      const atualBloqueado = !!atual.bloqueado;
      const novoBloqueado = !!l.bloqueado;
      const deveTrocar = (atualBloqueado && !novoBloqueado)
        || (atualBloqueado === novoBloqueado && l.preco < atual.preco);
      if (deveTrocar) {
        atual.preco = l.preco;
        atual.marca = l.marca;
        atual.precoHistorico = l.precoHistorico;
        atual.deltaHistorico = l.deltaHistorico;
        atual.confianca = l.confianca;
        atual.alerta = l.alerta;
        atual.bloqueado = l.bloqueado;
        atual.origemHistorico = l.origemHistorico;
      }
    }
  }

  return {
    casados: Array.from(porItem.values()).sort((a, b) => a.item.localeCompare(b.item, 'pt-BR')),
    soltos,
  };
}
