/* =====================================================================
   Motor do Cardápio da equipe — regras de negócio em cima do histórico
   (405 dias reais de pedidos: 2025 + Abril/Maio/Junho 2026)
   ===================================================================== */

import dadosJson from './dados.json';
import { receitaDoPrato, RECEITAS_POR_CATEGORIA } from './receitas';
import { DIAS_SEMANA, normalizar } from './texto';
import type {
  Aviso,
  DadosCardapio,
  DadosCombo,
  DiaCardapio,
  EstadoSemana,
  FonteItem,
  ItemSugerido,
  Proteina,
  StatusItem,
} from './tipos';

export type { FonteItem };
// Re-export das utilidades de texto (definidas em ./texto, sem dependências)
// para manter a API histórica `import { normalizar, DIAS_SEMANA } from './motor'`.
export { DIAS_SEMANA, normalizar };

export const DADOS = dadosJson as unknown as DadosCardapio;

/** Curva de movimento padrão: Seg/Ter menor, Qua/Qui média, Sex–Dom pico. */
export const PESSOAS_PADRAO = [55, 55, 65, 65, 80, 80, 80];

/* ------------------------- proteína do prato ------------------------- */

const REGRAS_PROTEINA: [Proteina, RegExp][] = [
  [
    'frango',
    /\bfrango|coxa|sobrecoxa|sobre coxa|galinha|asinha|\basa\b|chester|passarinho/,
  ],
  [
    'suina',
    /suin|porco|bisteca|lombo|pernil|costelinha|calabresa|toscana|feijoada|panceta|barriga|joelho/,
  ],
  ['peixe', /peixe|tilapia|merluza|sardinha|bacalhau|pescad|file de panga/],
  ['ovo', /\bovo\b|\bovos\b|omelete/],
  [
    'bovina',
    /bovin|bife|acem|aranha|patinho|picadinho|churrasco|carreteir|chuleta|chuletinha|cupim|costela|carne|almondega|strogonoff|escondidinho|hamburguer|lagarto|maminha|fraldinha|paleta|musculo|lasanha|panelada/,
  ],
];

export function proteinaDoPrato(prato: string | null | undefined): Proteina {
  const n = normalizar(prato);
  if (!n) return 'outros';
  for (const [prot, re] of REGRAS_PROTEINA) {
    if (re.test(n)) return prot;
  }
  return 'outros';
}

export const ROTULO_PROTEINA: Record<Proteina, string> = {
  bovina: 'Bovina',
  frango: 'Frango',
  suina: 'Suína',
  peixe: 'Peixe',
  ovo: 'Ovo',
  outros: 'Outros',
};

/* --------------------------- validação ------------------------------- */

export function validarSemana(dias: DiaCardapio[], precos?: Record<string, number>): Aviso[] {
  const avisos: Aviso[] = [];
  const prots = dias.map((d) => (d.principal ? proteinaDoPrato(d.principal) : null));
  const cont: Record<string, number> = {};
  prots.forEach((p) => {
    if (p) cont[p] = (cont[p] ?? 0) + 1;
  });

  const suina = cont['suina'] ?? 0;
  const frango = cont['frango'] ?? 0;
  const bovina = cont['bovina'] ?? 0;
  const preenchidos = prots.filter(Boolean).length;

  dias.forEach((d, i) => {
    if (!d.principal)
      avisos.push({ nivel: 'alerta', msg: `${DIAS_SEMANA[i]} sem prato principal definido.` });
  });

  if (suina > 2) avisos.push({ nivel: 'erro', msg: `Carne suína ${suina}× — a regra é no máximo 2× na semana.` });
  if (frango > 4) avisos.push({ nivel: 'erro', msg: `Frango ${frango}× — máximo 4× na semana.` });
  if (bovina > 3) avisos.push({ nivel: 'erro', msg: `Carne bovina ${bovina}× — máximo 3× na semana.` });
  if (preenchidos === 7) {
    const familiasProteina = Object.values(cont).filter((qtd) => qtd > 0).length;
    if (familiasProteina < 3) {
      avisos.push({ nivel: 'alerta', msg: 'Semana com pouca variedade de proteínas — tente distribuir melhor as famílias.' });
    }
  }

  for (let i = 1; i < 7; i++) {
    if (prots[i] && prots[i] === prots[i - 1] && prots[i] !== 'outros') {
      avisos.push({
        nivel: 'alerta',
        msg: `${ROTULO_PROTEINA[prots[i] as Proteina]} repetida em dias seguidos (${DIAS_SEMANA[i - 1]} → ${DIAS_SEMANA[i]}).`,
      });
    }
  }

  const vistos = new Map<string, number>();
  dias.forEach((d, i) => {
    const k = normalizar(d.principal);
    if (!k) return;
    if (vistos.has(k)) {
      avisos.push({
        nivel: 'alerta',
        msg: `“${d.principal}” repetido na semana (${DIAS_SEMANA[vistos.get(k)!]} e ${DIAS_SEMANA[i]}).`,
      });
    } else vistos.set(k, i);
  });

  // Validação de custo por pessoa: valores acima do padrão histórico indicam
  // erro de unidade ou ingrediente duplicado na lista de compras.
  if (precos && Object.keys(precos).length > 3) {
    dias.forEach((d, i) => {
      if (!d.principal) return;
      const lista = listaDoDia(d);
      const custo = custoDaLista(lista, precos);
      if (custo.itensComPreco < 3) return; // poucos preços = não há base para validar
      const porPessoa = custo.total / (d.pessoas > 0 ? d.pessoas : DADOS.baseline);
      if (porPessoa > 25) {
        avisos.push({
          nivel: 'erro',
          msg: `${DIAS_SEMANA[i]}: custo estimado R$${porPessoa.toFixed(0)}/pessoa — verifique unidades ou ingredientes duplicados.`,
        });
      } else if (porPessoa > 15) {
        avisos.push({
          nivel: 'alerta',
          msg: `${DIAS_SEMANA[i]}: custo estimado R$${porPessoa.toFixed(0)}/pessoa — acima do padrão histórico (≤ R$12).`,
        });
      }
    });
  }

  if (avisos.length === 0 && preenchidos === 7)
    avisos.push({ nivel: 'ok', msg: 'Semana fechada: rotação de proteínas dentro das regras.' });
  return avisos;
}

/* ----------------------- lista de compras ---------------------------- */

/**
 * Arredonda para tamanhos práticos de compra (pensa como a cozinha, não
 * como uma calculadora):
 *  kg   ≤ 3 kg  → múltiplo de 0,5 kg  (ex: 1,7 → 2,0)
 *  kg   3–20 kg → kg inteiro           (ex: 7,3 → 8)
 *  kg   > 20 kg → múltiplo de 2 kg     (ex: 21,3 → 22)
 *  lt / g / ml  → 1 decimal (sem alteração)
 *  unidades discretas (un, pct, lata…) → sempre arredonda para cima
 */
export function arredondar(qtd: number, unid: string): number {
  if (unid === 'g' || unid === 'ml') return Math.round(qtd * 10) / 10;
  if (unid === 'lt') return Math.round(qtd * 10) / 10;
  if (unid === 'kg') {
    if (qtd <= 3) return Math.ceil(qtd * 2) / 2;
    if (qtd <= 20) return Math.ceil(qtd);
    return Math.ceil(qtd / 2) * 2;
  }
  return Math.ceil(qtd - 1e-9);
}

const porChave = new Map<string, DadosCombo>();
DADOS.combos.forEach((c) => porChave.set(normalizar(c.chave), c));

const porTipoOpcao = new Map<string, { i: string; q: number; u: string | null }[]>();
DADOS.mapas.forEach((m) => porTipoOpcao.set(`${m.tipo}|${normalizar(m.op)}`, m.itens));

const unidadePadrao = new Map<string, string>();
DADOS.itens.forEach((it) => unidadePadrao.set(normalizar(it.n), it.u));

const excluidos = new Set(DADOS.excluir.map(normalizar));

const TIPOS: ['principal' | 'guarnicao_fixa' | 'guarnicao' | 'salada' | 'sobremesa', keyof DiaCardapio][] = [
  ['principal', 'principal'],
  ['guarnicao_fixa', 'guarnicaoFixa'],
  ['guarnicao', 'guarnicao'],
  ['salada', 'salada'],
  ['sobremesa', 'sobremesa'],
];

export function chaveDoDia(dia: DiaCardapio): string {
  return [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa]
    .map((v) => v ?? '')
    .join('|');
}

/* --------- garantia: o que está escrito no cardápio entra na lista ---- */

function tokensTexto(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** Encontra o item do catálogo citado num trecho de texto do cardápio. */
function itemDoTexto(parte: string): { n: string; u: string; f: number } | null {
  const toks = new Set(tokensTexto(parte));
  if (toks.size === 0) return null;
  let melhor: { n: string; u: string; f: number } | null = null;
  let melhorNota = 0;
  for (const it of DADOS.itens) {
    const itoks = tokensTexto(it.n);
    if (itoks.length === 0 || itoks.length > 3) continue;
    if (!itoks.every((t) => toks.has(t))) continue;
    const nota = itoks.length * 1000 + Math.min(it.f, 999);
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = it;
    }
  }
  return melhor;
}

/**
 * Mediana histórica de proteína por pessoa, derivada dos 115 mapas de
 * principal com quantidade real registrada. Ex: frango ≈ 0.30 kg/pessoa
 * (20 kg para 65 pessoas), bovina ≈ 0.29 kg/pessoa.
 * É o principal mecanismo que evita que receitas subestimem proteínas.
 */
const qtdHistoricaProteinaPorPessoa = new Map<Proteina, number>();
{
  const acc: Record<string, number[]> = {};
  DADOS.mapas
    .filter((m) => m.tipo === 'principal')
    .forEach((m) => {
      m.itens.forEach(({ i, q, u }: { i: string; q: number; u: string | null }) => {
        if (u === 'kg' && q > 0) {
          const prot = proteinaDoPrato(i);
          if (prot !== 'outros') {
            if (!acc[prot]) acc[prot] = [];
            acc[prot].push(q / DADOS.baseline);
          }
        }
      });
    });
  for (const [prot, qtds] of Object.entries(acc)) {
    if (qtds.length > 2) {
      qtds.sort((a, b) => a - b);
      qtdHistoricaProteinaPorPessoa.set(prot as Proteina, qtds[Math.floor(qtds.length / 2)]);
    }
  }
}

/** Quantidade padrão por pessoa — usa mediana histórica para proteínas. */
function qtdPadraoPorPessoa(categoria: string, unid: string, prot: Proteina | null): number {
  if (prot && prot !== 'outros' && unid === 'kg') {
    // Mediana histórica (dos mapas reais) prevalece sobre qualquer heurística
    return qtdHistoricaProteinaPorPessoa.get(prot) ?? 0.30;
  }
  const porUnid: Record<string, number> = {
    kg: 0.05,
    un: 0.08,
    mç: 0.04,
    pct: 0.04,
    lata: 0.04,
    lt: 0.03,
    bd: 0.02,
    bag: 0.02,
  };
  let q = porUnid[unid] ?? 0.04;
  if (categoria === 'sobremesa') q *= 0.5;
  if (categoria === 'salada' && unid === 'un') q = 0.1;
  return q;
}

/** Proteína de reserva quando o prato descreve carne e nada veio do histórico. */
const PROTEINA_PADRAO: Partial<Record<Proteina, { item: string; unid: string }>> = {
  bovina: { item: 'Acém', unid: 'kg' },
  frango: { item: 'File de frango sem osso', unid: 'kg' },
  suina: { item: 'Lombo suíno', unid: 'kg' },
  peixe: { item: 'Filé de peixe', unid: 'kg' },
  ovo: { item: 'Ovos', unid: 'bd' },
};

/**
 * Gera a lista sugerida do dia com rastreabilidade de origem por item.
 *
 * Prioridade (dados operacionais sempre prevalecem sobre estimativas):
 *   1. operacional_combo — combo exato (prato+acompanhamentos) do dados.json
 *   2. operacional_mapa  — mapa por componente do dados.json (sem combo exato)
 *   3. receita           — ingredientes da biblioteca de receitas (gap-fill)
 *   4. fallback          — heurística de texto / proteína padrão
 *
 * Escala pela curva de pessoas. `fatores` é o aprendizado da casa.
 */
export interface OpcoesLista {
  mostrarBasicos?: boolean;
}

/* Acompanhamentos que, quando aparecem como COMPLEMENTO no nome do prato
   principal ("Carne com mandioca", "Picadinho com chuchu", "Frango com batata"),
   NÃO devem virar item de compra pelo principal — a guarnição do dia já cobre.
   Evita duplicar guarnição na lista e inflar o custo.
   IMPORTANTE: só remove o COMPLEMENTO (o que vem depois de "com"/"e"); o prato
   principal em si é sempre mantido. Pratos onde o "acompanhamento" é a própria
   base (Bobó, Escondidinho, Macarronada, Yakisoba) não têm "com <side>" no nome
   e por isso não são afetados. */
const ACOMPANHAMENTOS_PRINCIPAL = [
  'mandioca', 'aipim', 'macaxeira', 'batata', 'batata doce', 'batata palha',
  'farofa', 'pure', 'pure de batata', 'macarrao', 'polenta', 'mandioquinha',
  'cuscuz', 'angu', 'baiao', 'arroz', 'feijao', 'chuchu', 'abobora', 'abobrinha',
  'quiabo', 'couve', 'couve flor', 'couve manteiga', 'repolho', 'cenoura',
  'beterraba', 'vagem', 'brocolis', 'jilo', 'legumes', 'milho', 'milho verde',
];
function ehAcompanhamentoDoPrincipal(nome: string): boolean {
  const n = normalizar(nome);
  // s? cobre plural ("batatas", "legumes"); \s+ cobre "batata doce" etc.
  return ACOMPANHAMENTOS_PRINCIPAL.some((a) => new RegExp(`\\b${a.replace(/ /g, '\\s+')}s?\\b`).test(n));
}

/* Extrai os complementos de guarnição do NOME do prato principal — os segmentos
   após "com"/"e"/"," que são puro acompanhamento. "Carne com mandioca" → ['mandioca'];
   "Strogonoff com Arroz e Batata Palha" → ['arroz','batata palha']. O primeiro
   segmento (o prato em si) nunca é complemento. Devolve chaves normalizadas. */
function complementosDoPrincipal(nome: string | null | undefined): string[] {
  if (!nome) return [];
  const segs = nome.split(/\s+com\s+|\s+e\s+|,/i).map((s) => s.trim()).filter(Boolean);
  return segs.slice(1).filter((s) => ehAcompanhamentoDoPrincipal(s)).map((s) => normalizar(s));
}

/* Modos de preparo/derivação que NÃO mudam o ingrediente comprado: "mandioca
   frita" é comprada como "mandioca", "frango grelhado" como "frango". A entrada
   já vem normalizada (minúscula, sem acento). Usado no preço (precos.ts) e para
   evitar que a forma preparada duplique o ingrediente cru na lista. */
const PREPARO_RE =
  /\b(frit[oa]s?|assad[oa]s?|cozid[oa]s?|grelhad[oa]s?|refogad[oa]s?|empanad[oa]s?|gratinad[oa]s?|saltead[oa]s?|mexid[oa]s?|dourad[oa]s?|milanesa|a dore|na chapa|na brasa|ao? forno|de forno|ao molho|marinad[oa]s?|temperad[oa]s?|desfiad[oa]s?|ralad[oa]s?|picad[oa]s?|cremos[oa]s?|de panela|caseir[oa]s?|a moda|rechead[oa]s?|no vapor|cozid[oa] no vapor|em cubos?|em cubinhos?|em tiras?|em iscas?|em pedacos?|em postas?|em bifes?|em rodelas?|moid[oa]s?|desossad[oa]s?|sem osso|com osso|fatiad[oa]s?)\b/g;

/** Reduz um item preparado ao ingrediente base ("mandioca frita" → "mandioca").
    Idempotente; devolve o próprio nome quando não há preparo a remover. */
export function ingredienteBase(nome: string): string {
  const norm = normalizar(nome);
  const base = norm.replace(PREPARO_RE, '').replace(/\s+/g, ' ').trim();
  return base && base !== norm ? base : norm;
}

export function listaDoDia(dia: DiaCardapio, fatores?: Record<string, number>, opts?: OpcoesLista): ItemSugerido[] {
  // Complementos de guarnição citados no NOME do principal ("Carne com mandioca",
  // "Picadinho com chuchu") são removidos SÓ da contribuição do principal — a
  // guarnição do dia já cobre. Nunca esvazia o dia (a proteína/base permanece).
  const complementos = complementosDoPrincipal(dia.principal);
  const ehComplemento = (nomeItem: string): boolean => {
    if (!complementos.length) return false;
    const a = normalizar(nomeItem).replace(/s$/, '');
    return complementos.some((c) => {
      const b = c.replace(/s$/, '');
      return a === b || b.startsWith(a + ' ') || a.startsWith(b + ' ');
    });
  };

  const fator = dia.pessoas > 0 ? dia.pessoas / DADOS.baseline : 1;
  const acc = new Map<string, { item: string; unid: string; qtd: number; fonte: FonteItem }>();

  const adiciona = (nome: string, q: number, u: string | null, fonte: FonteItem) => {
    const k = normalizar(nome);
    if (!k) return;
    // Pantry/insumos contínuos: só entram na lista quando vêm do histórico
    // operacional (combo exato ou mapa). Receita ou fallback os omite.
    const fonteOperacional = fonte === 'operacional_combo' || fonte === 'operacional_mapa';
    if (!opts?.mostrarBasicos && excluidos.has(k) && !fonteOperacional) return;
    const unid = u || unidadePadrao.get(k) || 'un';
    const atual = acc.get(k);
    if (atual) {
      // mantém o item; atualiza qtd pelo máximo; preserva fonte mais autoritativa
      atual.qtd = Math.max(atual.qtd, q);
      // hierarquia de fontes: combo > mapa > receita > fallback
      const ordemFonte: FonteItem[] = ['operacional_combo', 'operacional_mapa', 'receita', 'fallback'];
      if (ordemFonte.indexOf(fonte) < ordemFonte.indexOf(atual.fonte)) atual.fonte = fonte;
    } else {
      acc.set(k, { item: nome, unid, qtd: q, fonte });
    }
  };

  /* ── 1. Fonte operacional: combo exato ─────────────────────────────── */
  const combo = porChave.get(normalizar(chaveDoDia(dia)));
  if (combo) {
    combo.itens.forEach(({ i, q, u }) => adiciona(i, q, u, 'operacional_combo'));
  } else {
    /* ── 2. Fonte operacional: mapas por componente ─────────────────── */
    let algumMapa = false;
    for (const [tipo, campo] of TIPOS) {
      const opcao = dia[campo];
      if (!opcao || typeof opcao !== 'string') continue;
      const itens = porTipoOpcao.get(`${tipo}|${normalizar(opcao)}`);
      if (itens && itens.length > 0) {
        itens.forEach(({ i, q, u }) => adiciona(i, q, u, 'operacional_mapa'));
        algumMapa = true;
      }
    }

    /* ── 3. Gap-fill com receitas (itens ausentes após combo/mapa) ──── */
    // Para cada componente do cardápio, a receita complementa o que não veio
    // do histórico operacional — nunca substitui itens já presentes.
    for (const [, campo] of TIPOS) {
      const opcao = dia[campo];
      if (!opcao || typeof opcao !== 'string') continue;
      const receita = receitaDoPrato(opcao);
      if (receita) {
        receita.ingredientes.forEach((ing) => {
          const k = normalizar(ing.item);
          // complemento de guarnição citado no nome do principal não entra por aqui
          if (campo === 'principal' && ehComplemento(ing.item)) return;
          // só adiciona se ainda não está coberto pelo histórico operacional
          if (acc.has(k)) return;
          // Quantidade ínfima por pessoa = tempero/condimento = pantry item
          // (< 8g/pessoa ou < 8ml/pessoa). A cozinha gerencia esses itens em
          // estoque contínuo sem precisar vê-los na lista semanal.
          if (['kg', 'g'].includes(ing.unid) && ing.porPessoa < 0.008) return;
          if (['lt', 'ml'].includes(ing.unid) && ing.porPessoa < 0.008) return;
          // Proteínas: receita não pode subestimar abaixo de 80% da mediana
          // histórica real. Ex: receita diz 0,16 kg → histórico diz 0,30 kg → usa 0,30.
          let qtdPP = ing.porPessoa;
          if (ing.unid === 'kg') {
            const p = proteinaDoPrato(ing.item);
            if (p !== 'outros') {
              const mediana = qtdHistoricaProteinaPorPessoa.get(p) ?? 0.30;
              if (qtdPP < mediana * 0.8) qtdPP = mediana;
            }
          }
          adiciona(ing.item, qtdPP * DADOS.baseline, ing.unid, 'receita');
        });
        // se não havia nenhum mapa E não havia combo, a receita é a fonte primária
        if (!algumMapa) {
          // itens de receita já inseridos ficam com fonte 'receita' (correto)
        }
      }
    }
  }

  /* ── 4. Fallback: completa com ingredientes citados no texto ─────── */
  const completa = (texto: string, categoria: string) => {
    if (!texto) return;
    for (const parte of texto.split(/\s+com\s+|\s+e\s+|,|\+|·|\//i)) {
      const it = itemDoTexto(parte);
      if (!it) continue;
      const k = normalizar(it.n);
      // complemento de guarnição no nome do principal ("com batata") não entra
      if (categoria === 'principal' && ehComplemento(it.n)) continue;
      if (acc.has(k) || (!opts?.mostrarBasicos && excluidos.has(k))) continue;
      // Forma preparada ("Mandioca Frita") não entra se o ingrediente base
      // ("Mandioca") já está na lista — compra-se o cru, não o preparo.
      const base = ingredienteBase(it.n);
      if (base !== k && acc.has(base)) continue;
      const toks = tokensTexto(it.n);
      const coberto = Array.from(acc.values()).some((v) => {
        const vt = new Set(tokensTexto(v.item));
        return toks.every((t) => vt.has(t));
      });
      if (coberto) continue;
      const prot = proteinaDoPrato(it.n);
      adiciona(it.n, qtdPadraoPorPessoa(categoria, it.u, prot !== 'outros' ? prot : null) * DADOS.baseline, it.u, 'fallback');
    }
  };
  completa(dia.principal, 'principal');
  completa(dia.guarnicaoFixa, 'guarnicaoFixa');
  completa(dia.guarnicao, 'guarnicao');
  completa(dia.salada, 'salada');
  completa(dia.sobremesa, 'sobremesa');

  // garantia final: prato com carne descrita SEMPRE leva a proteína na lista
  if (dia.principal) {
    const alvo = proteinaDoPrato(dia.principal);
    if (alvo !== 'outros') {
      const tem = Array.from(acc.values()).some((v) => proteinaDoPrato(v.item) === alvo);
      const padrao = PROTEINA_PADRAO[alvo];
      if (!tem && padrao) {
        adiciona(padrao.item, qtdPadraoPorPessoa('principal', padrao.unid, alvo) * DADOS.baseline, padrao.unid, 'fallback');
      }
    }
  }

  return Array.from(acc.values())
    .map(({ item, unid, qtd, fonte }) => {
      const aprendido = fatores?.[normalizar(item)] ?? 1;
      return { item, unid, qtd: arredondar(qtd * fator * aprendido, unid), fonte };
    })
    .filter((x) => x.qtd > 0)
    .sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));
}

/**
 * Fonte primária dos ingredientes do dia — reflete a nova prioridade:
 * dados operacionais (combo/mapa) prevalecem sobre receitas.
 *  - 'combo'    : combinação exata do histórico (melhor qualidade).
 *  - 'mapa'     : mapa por componente do histórico.
 *  - 'receita'  : receita da biblioteca (sem histórico operacional).
 *  - 'estimado' : sem nenhuma fonte estruturada — ingredientes por heurística.
 *  - 'vazio'    : sem prato principal.
 */
export type FonteIngredientes = 'receita' | 'combo' | 'mapa' | 'estimado' | 'vazio';

export function fonteIngredientes(dia: DiaCardapio): FonteIngredientes {
  if (!dia.principal) return 'vazio';
  if (porChave.get(normalizar(chaveDoDia(dia)))) return 'combo';
  if (porTipoOpcao.get(`principal|${normalizar(dia.principal)}`)) return 'mapa';
  if (receitaDoPrato(dia.principal)) return 'receita';
  return 'estimado';
}

/* --------------- linhas de compra do dia (auto + manuais) ------------- */

export interface LinhaCompra {
  chave: string; // item normalizado (ou manual:<idx>:nome)
  item: string;
  unid: string;
  sugerida: number | null; // null = item manual
  qtd: number;
  manual: boolean;
  /** Rastreabilidade: de onde este item veio. */
  fonte: FonteItem | 'manual';
  status: StatusItem;
}

export function linhasDoDia(
  estado: EstadoSemana,
  diaIdx: number,
  fatores?: Record<string, number>,
  opts?: OpcoesLista,
): LinhaCompra[] {
  const dia = estado.dias[diaIdx];
  const ajustes = estado.ajustes[diaIdx] ?? {};
  const status = estado.status[diaIdx] ?? {};
  const linhas: LinhaCompra[] = [];

  if (dia.principal) {
    for (const s of listaDoDia(dia, fatores, opts)) {
      const k = normalizar(s.item);
      const aj = ajustes[k];
      if (aj?.removido) continue;
      linhas.push({
        chave: k,
        item: s.item,
        unid: s.unid,
        sugerida: s.qtd,
        qtd: aj?.qtd ?? s.qtd,
        manual: false,
        fonte: s.fonte,
        status: status[k] ?? {},
      });
    }
  }
  (estado.manuais[diaIdx] ?? []).forEach((m, mi) => {
    const k = `manual:${mi}:` + normalizar(m.item);
    linhas.push({
      chave: k,
      item: m.item,
      unid: m.unid,
      sugerida: null,
      qtd: m.qtd,
      manual: true,
      fonte: 'manual',
      status: status[k] ?? {},
    });
  });
  return linhas;
}

/** O dia tem registro exato no histórico? (qualidade da sugestão) */
export function temHistoricoExato(dia: DiaCardapio): boolean {
  return porChave.has(normalizar(chaveDoDia(dia)));
}

/* ----------------------- custo estimado ------------------------------ */

/**
 * Converte quantidade para a unidade base do preço (kg ou lt).
 * Preços são sempre armazenados por kg ou lt; quantidades em g/ml
 * precisam ser divididas por 1000 antes da multiplicação.
 */
export function converterParaUnidadeBase(qtd: number, unid: string): number {
  if (unid === 'g') return qtd / 1000;
  if (unid === 'ml') return qtd / 1000;
  return qtd;
}

export interface CustoDia {
  total: number;
  itensComPreco: number;
  itensTotal: number;
}

export function custoDaLista(
  itens: { item: string; unid: string; qtd: number }[],
  precos: Record<string, number>,
): CustoDia {
  let total = 0;
  let com = 0;
  itens.forEach(({ item, unid, qtd }) => {
    const p = precos[normalizar(item)];
    if (p !== undefined && p > 0) {
      total += p * converterParaUnidadeBase(qtd, unid);
      com++;
    }
  });
  return { total, itensComPreco: com, itensTotal: itens.length };
}

/* ------------------- diversidade: técnica & família ------------------ */

/** Técnica de preparo do prato — usada para não repetir o mesmo método. */
const TECNICAS: [string, RegExp][] = [
  ['frito', /frit|empanad|milanesa|a dore|crocante|nuggets|past[eé]l/],
  ['grelhado', /grelhad|chapa|na brasa|churrasc|espet/],
  ['assado', /assad|forno|gratinad|de forno|rost/],
  ['ensopado', /ensopad|cozid|caldo|guisad|panela|sopa|moqueca|vaca atolad/],
  ['refogado', /refogad|saltead|acebolad|picadinho/],
  ['molho', /ao molho|strogonoff|estrogonofe|fricasse|xadrez|curry|parmegiana|rol[eê]|madeira/],
  ['moido', /moid|almondega|kibe|hamburguer|bolinho|croquete|polpetone|escondidinho/],
  ['recheado', /rechead|enrolad|wrap|panqueca|tort/],
];

/** Método de preparo (grelhado, assado, ao molho, …) para medir variedade. */
export function tecnicaDoPrato(prato: string | null | undefined): string {
  const n = normalizar(prato);
  if (!n) return 'outro';
  const r = receitaDoPrato(prato);
  if (r?.tags?.length) {
    for (const [t, re] of TECNICAS) if (r.tags.some((tag) => re.test(normalizar(tag)))) return t;
  }
  for (const [t, re] of TECNICAS) if (re.test(n)) return t;
  return 'outro';
}

/** Pratos que, na prática, são "o mesmo prato" compartilham família. */
const FAMILIAS_ESPECIAIS = [
  'almondega', 'strogonoff', 'estrogonofe', 'lasanha', 'feijoada', 'escondidinho',
  'parmegiana', 'panqueca', 'yakisoba', 'xadrez', 'curry', 'picadinho', 'moqueca',
  'kibe', 'hamburguer', 'nhoque', 'risoto', 'tropeiro', 'virado', 'cuscuz',
  'bobó', 'bobo', 'dobradinha', 'rabada', 'fricasse', 'torta', 'quiche',
  'bolinho', 'croquete', 'polpetone', 'feijoada',
];

/**
 * Família operacional do prato. "Almôndega ao molho" e "Almôndega acebolada"
 * caem na mesma família (almondega) e não devem coexistir na semana. Quando
 * não há família especial, a chave é proteína+técnica — assim "Frango
 * grelhado" e "Frango assado" são famílias diferentes, mas dois grelhados de
 * frango colidem.
 */
export function familiaDoPrato(prato: string | null | undefined): string {
  const n = normalizar(prato);
  if (!n) return '';
  for (const f of FAMILIAS_ESPECIAIS) if (n.includes(f)) return f;
  return `${proteinaDoPrato(prato)}:${tecnicaDoPrato(prato)}`;
}

/** Nota nutricional 0–100 do prato a partir da receita (penaliza excessos). */
export function notaNutricaoPrato(prato: string | null | undefined): number {
  const r = receitaDoPrato(prato);
  if (!r?.nutricao) return 60;
  const nu = r.nutricao;
  let s = 100;
  if (nu.kcal > 600) s -= 16;
  else if (nu.kcal > 500) s -= 8;
  if (nu.sodio > 900) s -= 20;
  else if (nu.sodio > 700) s -= 10;
  if (nu.gord > 28) s -= 14;
  else if (nu.gord > 20) s -= 6;
  if (nu.prot >= 30) s += 6;
  else if (nu.prot < 12) s -= 8;
  if (nu.fibra >= 5) s += 6;
  return Math.max(20, Math.min(100, s));
}

/* -------------------- sugestão automática de semana ------------------ */

function sortear<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/** Aceitação mínima que a IA precisa para ponderar (nota média 0–5). */
export interface AceitacaoLeve {
  n: number;
  somaNotas: number;
  bom?: number;
  ruim?: number;
}

export interface OpcoesSugestao {
  /** Aceitação histórica por prato (normalizado) — pesa muito na decisão. */
  aceitacao?: Record<string, AceitacaoLeve>;
  /** Frequência de uso recente por prato (normalizado) — penaliza repetição. */
  frequencia?: Record<string, number>;
  /** Estoque disponível por item (normalizado) — leve bônus para o que já há. */
  estoque?: Record<string, number>;
  /** Modo criativo: prioriza combinações inéditas em vez de já aprovadas. */
  criativo?: boolean;
}

/* Principais aptos: receitas completas + todos os pratos do histórico. */
function principaisAptos(): string[] {
  const daBiblioteca = RECEITAS_POR_CATEGORIA.principal.filter((nome) => {
    const r = receitaDoPrato(nome);
    return !!r && r.adequacaoRefeitorio >= 60;
  });
  const vistos = new Set(daBiblioteca.map(normalizar));
  const doHistorico = DADOS.listas.principais.filter((n) => !vistos.has(normalizar(n)));
  return [...daBiblioteca, ...doHistorico];
}

/**
 * Monta uma semana equilibrando, NESTA ordem de prioridade:
 *  1. Viabilidade operacional (receita completa + rotação de proteínas)
 *  2. Aceitação do público (avaliações históricas)
 *  3. Diversidade (proteína, técnica e família sem repetição)
 *  4. Equilíbrio nutricional (nota dos macros)
 *  5. Estoque disponível
 *  6. Custo
 * Regras duras: suína ≤2, frango 3–4, sem proteína em dias seguidos, sem
 * repetir prato. Família repetida (ex.: duas almôndegas) é fortemente
 * penalizada. Busca aleatória — melhor de N tentativas.
 */
function montarSemana(
  pessoas: number[],
  precos: Record<string, number>,
  opts: OpcoesSugestao,
): DiaCardapio[] | null {
  const principais = principaisAptos();
  if (principais.length < 7) return null;
  const _mergeList = (receitas: string[], historico: string[]): string[] => {
    const vistos = new Set(receitas.map(normalizar));
    return [...receitas, ...historico.filter((n) => !vistos.has(normalizar(n)))];
  };
  const guarnicoes = _mergeList(RECEITAS_POR_CATEGORIA.guarnicao, DADOS.listas.guarnicoes);
  const saladas = _mergeList(RECEITAS_POR_CATEGORIA.salada, DADOS.listas.saladas);
  const sobremesas = _mergeList(RECEITAS_POR_CATEGORIA.sobremesa, DADOS.listas.sobremesas);

  const temPrecos = Object.keys(precos).length > 3;
  const aceit = opts.aceitacao ?? {};
  const freq = opts.frequencia ?? {};
  const estoque = opts.estoque ?? {};

  const notaAceitacao = (nome: string): number => {
    const a = aceit[normalizar(nome)];
    return a && a.n > 0 ? a.somaNotas / a.n : 0; // 0–5
  };

  let melhor: DiaCardapio[] | null = null;
  let melhorNota = -Infinity;

  for (let tent = 0; tent < 400; tent++) {
    const poolP = sortear(principais);
    const dias: DiaCardapio[] = [];
    const usados = new Set<string>();
    let suina = 0;
    let frango = 0;
    let bovina = 0;
    let anterior: Proteina | null = null;
    let ok = true;

    for (let d = 0; d < 7; d++) {
      const faltam = 7 - d;
      const cand = poolP.find((p) => {
        const prot = proteinaDoPrato(p);
        if (usados.has(normalizar(p))) return false;
        if (prot === anterior && prot !== 'outros') return false;
        if (prot === 'suina' && suina >= 2) return false;
        if (prot === 'frango' && frango >= 4) return false;
        if (prot === 'bovina' && bovina >= 3) return false;
        if (prot !== 'frango' && frango + faltam - 1 < 3) return false;
        if (prot !== 'bovina' && bovina + faltam - 1 < 2) return false;
        return true;
      });
      if (!cand) {
        ok = false;
        break;
      }
      const prot = proteinaDoPrato(cand);
      if (prot === 'suina') suina++;
      if (prot === 'frango') frango++;
      if (prot === 'bovina') bovina++;
      anterior = prot;
      usados.add(normalizar(cand));
      dias.push({
        pessoas: pessoas[d] ?? DADOS.baseline,
        principal: cand,
        guarnicaoFixa: 'Arroz e Feijão',
        guarnicao: '',
        salada: '',
        sobremesa: '',
      });
      poolP.splice(poolP.indexOf(cand), 1);
    }
    if (!ok || frango < 3 || bovina < 2) continue;

    // acompanhamentos variados (sem repetir ao longo da semana)
    const pg = sortear(guarnicoes);
    const ps = sortear(saladas);
    const psb = sortear(sobremesas);
    dias.forEach((dia, d) => {
      dia.guarnicao = pg[d % Math.max(pg.length, 1)] ?? '';
      dia.salada = ps[d % Math.max(ps.length, 1)] ?? '';
      dia.sobremesa = psb[d % Math.max(psb.length, 1)] ?? '';
    });

    /* ---------- pontuação multi-critério (ordem de prioridade) ---------- */
    let nota = 0;

    // 2) Aceitação do público — peso dominante
    let somaAceit = 0;
    let comAceit = 0;
    dias.forEach((dia) => {
      const a = notaAceitacao(dia.principal);
      if (a > 0) {
        somaAceit += a;
        comAceit++;
      }
    });
    if (comAceit > 0) nota += (somaAceit / comAceit) * 40;

    // 3) Diversidade — proteínas e técnicas distintas; família repetida pune
    const tecnicas = dias.map((dia) => tecnicaDoPrato(dia.principal));
    const familias = dias.map((dia) => familiaDoPrato(dia.principal));
    const protsDistintas = new Set(dias.map((dia) => proteinaDoPrato(dia.principal))).size;
    const tecnicasDistintas = new Set(tecnicas).size;
    nota += protsDistintas * 6 + tecnicasDistintas * 6;
    // técnica repetida acima de 2× incomoda; família repetida é quase proibida
    const contTec: Record<string, number> = {};
    tecnicas.forEach((t) => (contTec[t] = (contTec[t] ?? 0) + 1));
    Object.values(contTec).forEach((c) => {
      if (c > 2) nota -= (c - 2) * 8;
    });
    const famDup = familias.length - new Set(familias).size;
    nota -= famDup * 25;
    // penaliza pratos repetidos nas últimas semanas (anti-monotonia)
    dias.forEach((dia) => {
      const f = freq[normalizar(dia.principal)] ?? 0;
      if (f > 0) nota -= f * 5;
    });

    // 4) Equilíbrio nutricional — média da nota de macros
    const mediaNutri =
      dias.reduce((a, dia) => a + notaNutricaoPrato(dia.principal), 0) / dias.length;
    nota += mediaNutri * 0.4;

    // 5) Estoque disponível — leve bônus para o que já temos
    if (Object.keys(estoque).length > 0) {
      dias.forEach((dia) => {
        const itens = listaDoDia(dia);
        const cobertos = itens.filter((s) => (estoque[normalizar(s.item)] ?? 0) > 0).length;
        nota += cobertos * 0.5;
      });
    }

    // 6) Custo — peso menor; bônus se semana cabe em R$3.000–4.000
    if (temPrecos) {
      let custoPorPessoa = 0;
      let custoTotal = 0;
      dias.forEach((dia) => {
        const c = custoDaLista(listaDoDia(dia), precos);
        if (c.itensComPreco > 0) custoPorPessoa += c.total / Math.max(dia.pessoas, 1);
        custoTotal += c.total;
      });
      nota -= custoPorPessoa * 2;
      if (custoTotal >= 3000 && custoTotal <= 4000) nota += 30;
      else nota -= Math.abs(custoTotal - 3500) / 200;
    }

    // 7) Ajuste de modo — criativo busca o inédito; padrão valoriza o aprovado
    let novas = 0;
    dias.forEach((dia) => {
      if (temHistoricoExato(dia)) {
        if (!opts.criativo) nota += 1.5;
      } else {
        novas++;
      }
    });
    if (opts.criativo) nota += novas * 3;

    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = dias;
    }
  }
  return melhor;
}

/* ----------- sugestão baseada no histórico real (occ ≥ 2) ------------ */

/**
 * Gera semana a partir dos combos que já saíram 2× ou mais no histórico real.
 * Prioriza os mais repetidos e respeita todas as regras de proteína.
 */
export function sugerirSemanaHistorica(
  pessoas: number[],
  precos: Record<string, number>,
  opts: OpcoesSugestao = {},
): DiaCardapio[] | null {
  const pool_base = DADOS.combos.filter((c) => c.p && c.gf && c.s && c.sb && (c.occ ?? 1) >= 2);
  if (pool_base.length < 7) return sugerirSemana(pessoas, precos, opts);

  const temPrecos = Object.keys(precos).length > 3;
  let melhor: DiaCardapio[] | null = null;
  let melhorNota = -Infinity;

  for (let tent = 0; tent < 300; tent++) {
    const pool = [...pool_base].sort(() => Math.random() - 0.5);
    const dias: DiaCardapio[] = [];
    const usados = new Set<string>();
    let suina = 0;
    let frango = 0;
    let bovina = 0;
    let anterior: Proteina | null = null;
    let ok = true;

    for (let d = 0; d < 7; d++) {
      const faltam = 7 - d;
      const cand = pool.find((c) => {
        const prot = proteinaDoPrato(c.p);
        if (usados.has(normalizar(c.p ?? ''))) return false;
        if (prot === anterior && prot !== 'outros') return false;
        if (prot === 'suina' && suina >= 2) return false;
        if (prot === 'frango' && frango >= 4) return false;
        if (prot === 'bovina' && bovina >= 3) return false;
        if (prot !== 'frango' && frango + faltam - 1 < 3) return false;
        if (prot !== 'bovina' && bovina + faltam - 1 < 2) return false;
        return true;
      });
      if (!cand) { ok = false; break; }
      const prot = proteinaDoPrato(cand.p);
      if (prot === 'suina') suina++;
      if (prot === 'frango') frango++;
      if (prot === 'bovina') bovina++;
      anterior = prot;
      usados.add(normalizar(cand.p ?? ''));
      dias.push({
        pessoas: pessoas[d] ?? DADOS.baseline,
        principal: cand.p ?? '',
        guarnicaoFixa: cand.gf ?? 'Arroz e Feijão',
        guarnicao: cand.g ?? '',
        salada: cand.s ?? '',
        sobremesa: cand.sb ?? '',
      });
      pool.splice(pool.indexOf(cand), 1);
    }
    if (!ok || frango < 3 || bovina < 2) continue;

    let nota = 0;
    dias.forEach((dia) => {
      const combo = porChave.get(normalizar(chaveDoDia(dia)));
      nota += Math.min((combo?.occ ?? 0) * 2, 20);
    });
    if (temPrecos) {
      let custoTotal = 0;
      let custoPP = 0;
      dias.forEach((dia) => {
        const c = custoDaLista(listaDoDia(dia), precos);
        custoTotal += c.total;
        if (c.itensComPreco > 0) custoPP += c.total / Math.max(dia.pessoas, 1);
      });
      nota -= custoPP * 2;
      if (custoTotal >= 3000 && custoTotal <= 4000) nota += 50;
      else nota -= Math.abs(custoTotal - 3500) / 100;
    }
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = dias;
    }
  }
  return melhor ?? sugerirSemana(pessoas, precos, opts);
}

/**
 * Sugestão "aprovada": prioriza pratos com boa aceitação e já testados,
 * mantendo diversidade e equilíbrio nutricional.
 */
export function sugerirSemana(
  pessoas: number[],
  precos: Record<string, number>,
  opts: OpcoesSugestao = {},
): DiaCardapio[] | null {
  return montarSemana(pessoas, precos, { ...opts, criativo: false });
}

/**
 * Sugestão criativa: recombina a biblioteca de receitas priorizando
 * combinações inéditas, sem abrir mão da diversidade nem da nutrição.
 */
export function sugerirSemanaCriativa(
  pessoas: number[],
  precos: Record<string, number>,
  opts: OpcoesSugestao = {},
): DiaCardapio[] | null {
  return montarSemana(pessoas, precos, { ...opts, criativo: true });
}

/* ------------------------------ util --------------------------------- */

export function formatarQtd(qtd: number): string {
  return Number.isInteger(qtd) ? String(qtd) : qtd.toFixed(1).replace('.', ',');
}

export function formatarReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
