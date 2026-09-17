from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    s = read(path)
    if old not in s:
        raise RuntimeError(f'Padrão não encontrado em {path}: {old[:160]!r}')
    if s.count(old) != 1:
        raise RuntimeError(f'Padrão não é único em {path}: {s.count(old)} ocorrências')
    write(path, s.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimo: int = 1) -> None:
    s = read(path)
    n = s.count(old)
    if n < minimo:
        raise RuntimeError(f'Esperava ao menos {minimo} ocorrência(s) em {path}, achei {n}: {old[:120]!r}')
    write(path, s.replace(old, new))


# 0) Corrige o único erro de tipo exposto pelo primeiro replay.
# estado.status é dia -> item -> StatusItem; precisamos achatar os itens do dia.
replace_once(
    'src/components/cardapio/AbaGastos.tsx',
    "      ...Object.values(estado.status).map((s) => s.compradoEm).filter((v): v is string => !!v),\n",
    "      ...Object.values(estado.status)\n"
    "        .flatMap((dia) => Object.values(dia))\n"
    "        .map((s) => s.compradoEm)\n"
    "        .filter((v): v is string => typeof v === 'string' && v.length > 0),\n",
)


# 1) Proveniência explícita: item aprendido da operação não pode fingir ser receita/mapa.
tipos = 'src/lib/cardapio/tipos.ts'
replace_once(
    tipos,
    " * fallback          — completado por heurística de texto/proteína padrão\n"
    " */\n"
    "export type FonteItem = 'operacional_combo' | 'operacional_mapa' | 'receita' | 'fallback';\n",
    " * fallback          — completado por heurística de texto/proteína padrão\n"
    " * aprendido_app     — recorrência observada nas listas realmente ajustadas no app\n"
    " */\n"
    "export type FonteItem = 'operacional_combo' | 'operacional_mapa' | 'receita' | 'fallback' | 'aprendido_app';\n",
)


# 2) Congelamento retrocompatível: listas já persistidas NÃO entram automaticamente
# na nova composição. Só documentos novos, criados após esta evolução, recebem v2.
replace_once(
    tipos,
    "  versao: 1;\n",
    "  versao: 1;\n  /** v2 = composição aprendida habilitada somente para listas novas; ausente = lista legada congelada. */\n  listaInteligenciaVersao?: 2;\n",
)
replace_once(
    'src/lib/cardapio/estado.tsx',
    "    versao: 1,\n",
    "    versao: 1,\n    // Opt-in apenas em semanas NOVAS. Semanas já salvas não têm este campo e permanecem congeladas.\n    listaInteligenciaVersao: 2,\n",
)

# 3) Memória de COMPOSIÇÃO. O app já aprendia quantidade; agora aprende também
# o que a operação remove repetidamente e o que acrescenta repetidamente.
aprendizado = r'''import { arredondar, linhasDoDia, normalizar, type LinhaCompra, type OpcoesLista } from './motor';
import type { DiaCardapio, EstadoSemana } from './tipos';

/**
 * Aprendizado da composição da lista de compras.
 *
 * Princípio: histórico operacional > receita/fallback > palpite.
 * - remoção humana repetida só pode suprimir fonte fraca (receita/fallback);
 * - combo/mapa histórico nunca é apagado automaticamente;
 * - item manual recorrente vira sugestão apenas após repetição em semanas distintas;
 * - ausência de check de compra NÃO é evidência de remoção.
 */

export interface SemanaCompraAprendida {
  semanaId: string;
  estado: EstadoSemana;
}

export interface RemocaoAprendida {
  contexto: string;
  nivel: 'combo' | 'principal';
  itemNorm: string;
  semanas: number;
}

export interface AdicaoAprendida {
  contexto: string;
  nivel: 'combo' | 'principal';
  item: string;
  itemNorm: string;
  unid: string;
  semanas: number;
  qtdPorPessoa: number;
}

export interface MemoriaComposicaoCompras {
  remocoes: RemocaoAprendida[];
  adicoes: AdicaoAprendida[];
}

export interface DecisaoComposicaoCompras {
  removidos: Set<string>;
  adicoes: AdicaoAprendida[];
}

const PREFIXO_SEMANA = 'cardapio.v1.semana.';

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function chaveCombo(dia: DiaCardapio): string {
  return [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa]
    .map((v) => normalizar(v ?? ''))
    .join('|');
}

function contextosDoDia(dia: DiaCardapio): { chave: string; nivel: 'combo' | 'principal' }[] {
  const principal = normalizar(dia.principal);
  if (!principal) return [];
  return [
    { chave: `combo:${chaveCombo(dia)}`, nivel: 'combo' },
    { chave: `principal:${principal}`, nivel: 'principal' },
  ];
}

type AccRemocao = {
  contexto: string;
  nivel: 'combo' | 'principal';
  itemNorm: string;
  semanas: Set<string>;
};

type AccAdicao = {
  contexto: string;
  nivel: 'combo' | 'principal';
  item: string;
  itemNorm: string;
  unid: string;
  semanas: Set<string>;
  amostrasPorSemana: Map<string, number[]>;
};

/** Constrói aprendizado a partir de semanas persistidas, sem depender do motor atual. */
export function construirMemoriaComposicaoCompras(
  semanas: SemanaCompraAprendida[],
): MemoriaComposicaoCompras {
  const removidos = new Map<string, AccRemocao>();
  const adicionados = new Map<string, AccAdicao>();

  for (const { semanaId, estado } of semanas) {
    estado.dias.forEach((dia, di) => {
      const contextos = contextosDoDia(dia);
      if (!contextos.length) return;

      for (const [itemNormBruto, ajuste] of Object.entries(estado.ajustes[di] ?? {})) {
        if (!ajuste?.removido) continue;
        const itemNorm = normalizar(itemNormBruto);
        if (!itemNorm) continue;
        for (const ctx of contextos) {
          const id = `${ctx.chave}::${itemNorm}`;
          const acc = removidos.get(id) ?? {
            contexto: ctx.chave,
            nivel: ctx.nivel,
            itemNorm,
            semanas: new Set<string>(),
          };
          acc.semanas.add(semanaId);
          removidos.set(id, acc);
        }
      }

      const pessoas = Math.max(1, dia.pessoas || 1);
      (estado.manuais[di] ?? []).forEach((manual, mi) => {
        const itemNorm = normalizar(manual.item);
        if (!itemNorm || !manual.unid) return;
        const chaveStatus = `manual:${mi}:${itemNorm}`;
        const comprado = estado.status[di]?.[chaveStatus]?.compradoQtd;
        const qtd = comprado && comprado > 0 ? comprado : manual.qtd;
        if (!(qtd > 0)) return;
        const qtdPP = qtd / pessoas;

        for (const ctx of contextos) {
          // Unidade faz parte do sinal: duas unidades diferentes não se misturam em silêncio.
          const id = `${ctx.chave}::${itemNorm}::${manual.unid}`;
          const acc = adicionados.get(id) ?? {
            contexto: ctx.chave,
            nivel: ctx.nivel,
            item: manual.item,
            itemNorm,
            unid: manual.unid,
            semanas: new Set<string>(),
            amostrasPorSemana: new Map<string, number[]>(),
          };
          acc.semanas.add(semanaId);
          const amostras = acc.amostrasPorSemana.get(semanaId) ?? [];
          amostras.push(qtdPP);
          acc.amostrasPorSemana.set(semanaId, amostras);
          adicionados.set(id, acc);
        }
      });
    });
  }

  return {
    remocoes: Array.from(removidos.values()).map((r) => ({
      contexto: r.contexto,
      nivel: r.nivel,
      itemNorm: r.itemNorm,
      semanas: r.semanas.size,
    })),
    adicoes: Array.from(adicionados.values()).map((a) => {
      // Um item repetido duas vezes na mesma semana continua valendo como UMA semana.
      const porSemana = Array.from(a.amostrasPorSemana.values()).map(mediana).filter((v) => v > 0);
      return {
        contexto: a.contexto,
        nivel: a.nivel,
        item: a.item,
        itemNorm: a.itemNorm,
        unid: a.unid,
        semanas: a.semanas.size,
        qtdPorPessoa: mediana(porSemana),
      };
    }).filter((a) => a.qtdPorPessoa > 0),
  };
}

/**
 * Exato (cardápio inteiro) precisa repetir em 2 semanas; padrão por prato
 * principal precisa repetir em 3. Assim o sistema aprende sem transformar
 * um ajuste isolado em regra permanente.
 */
export function resolverAprendizadoCompra(
  dia: DiaCardapio,
  memoria: MemoriaComposicaoCompras,
): DecisaoComposicaoCompras {
  const contextos = contextosDoDia(dia);
  const combo = contextos.find((c) => c.nivel === 'combo')?.chave;
  const principal = contextos.find((c) => c.nivel === 'principal')?.chave;
  const removidos = new Set<string>();

  memoria.remocoes
    .filter((r) => (r.contexto === combo && r.semanas >= 2) || (r.contexto === principal && r.semanas >= 3))
    .sort((a, b) => (a.nivel === b.nivel ? b.semanas - a.semanas : a.nivel === 'combo' ? -1 : 1))
    .forEach((r) => removidos.add(r.itemNorm));

  const candidatos = memoria.adicoes
    .filter((a) => (a.contexto === combo && a.semanas >= 2) || (a.contexto === principal && a.semanas >= 3))
    .sort((a, b) => {
      if (a.nivel !== b.nivel) return a.nivel === 'combo' ? -1 : 1;
      return b.semanas - a.semanas || b.qtdPorPessoa - a.qtdPorPessoa;
    });

  const porItem = new Map<string, AdicaoAprendida>();
  for (const a of candidatos) {
    if (removidos.has(a.itemNorm) || porItem.has(a.itemNorm)) continue;
    porItem.set(a.itemNorm, a);
  }
  return { removidos, adicoes: Array.from(porItem.values()) };
}

export function lerSemanasSalvasParaAprendizado(): SemanaCompraAprendida[] {
  if (typeof window === 'undefined') return [];
  const semanas: SemanaCompraAprendida[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const chave = localStorage.key(i);
      if (!chave?.startsWith(PREFIXO_SEMANA)) continue;
      const raw = localStorage.getItem(chave);
      if (!raw) continue;
      const estado = JSON.parse(raw) as EstadoSemana;
      if (!Array.isArray(estado?.dias) || estado.dias.length !== 7) continue;
      semanas.push({ semanaId: chave.slice(PREFIXO_SEMANA.length), estado });
    }
  } catch {
    return [];
  }
  return semanas;
}

/** Aplica a memória sobre linhas já montadas pelo motor, preservando autoridade. */
export function aplicarMemoriaComposicaoCompras(
  linhasBase: LinhaCompra[],
  estado: EstadoSemana,
  diaIdx: number,
  memoria: MemoriaComposicaoCompras,
): LinhaCompra[] {
  // Regra de preservação: qualquer semana criada antes da inteligência v2
  // não recebe alteração automática de composição. Ela continua exatamente
  // com a lista que o motor legado + ajustes já produziam.
  if (estado.listaInteligenciaVersao !== 2) return linhasBase;
  const dia = estado.dias[diaIdx];
  if (!dia?.principal) return linhasBase;
  const decisao = resolverAprendizadoCompra(dia, memoria);

  // Só fontes inferidas podem ser suprimidas. Combo/mapa são prova operacional
  // histórica e permanecem mesmo que tenha existido uma remoção pontual no app.
  const linhas = linhasBase.filter((l) => {
    if (l.manual) return true;
    if (l.fonte === 'operacional_combo' || l.fonte === 'operacional_mapa') return true;
    return !decisao.removidos.has(normalizar(l.item));
  });

  const existentes = new Set(linhas.map((l) => normalizar(l.item)));
  const ajustes = estado.ajustes[diaIdx] ?? {};
  const status = estado.status[diaIdx] ?? {};
  const manuaisAtuais = new Set((estado.manuais[diaIdx] ?? []).map((m) => normalizar(m.item)));

  for (const aprendido of decisao.adicoes) {
    if (existentes.has(aprendido.itemNorm) || manuaisAtuais.has(aprendido.itemNorm)) continue;
    const ajuste = ajustes[aprendido.itemNorm];
    if (ajuste?.removido) continue;
    const unid = ajuste?.unidOverride ?? aprendido.unid;
    const sugerida = arredondar(aprendizadoQtd(aprendido.qtdPorPessoa, dia.pessoas), unid);
    const qtd = ajuste?.qtd ?? sugerida;
    if (!(qtd > 0)) continue;
    linhas.push({
      chave: aprendido.itemNorm,
      item: aprendido.item,
      unid,
      sugerida,
      qtd,
      manual: false,
      fonte: 'aprendido_app',
      status: status[aprendido.itemNorm] ?? {},
    });
    existentes.add(aprendido.itemNorm);
  }

  return linhas.sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));
}

function aprendizadoQtd(qtdPorPessoa: number, pessoas: number): number {
  return qtdPorPessoa * Math.max(1, pessoas || 1);
}

/**
 * Versão operacional da lista: motor atual + memória das listas realmente
 * corrigidas desde que o app começou a armazenar semanas neste dispositivo/nuvem.
 */
export function linhasDoDiaComAprendizado(
  estado: EstadoSemana,
  diaIdx: number,
  fatores?: Record<string, number>,
  opts?: OpcoesLista,
): LinhaCompra[] {
  const base = linhasDoDia(estado, diaIdx, fatores, opts);
  if (typeof window === 'undefined') return base;
  const memoria = construirMemoriaComposicaoCompras(lerSemanasSalvasParaAprendizado());
  return aplicarMemoriaComposicaoCompras(base, estado, diaIdx, memoria);
}
'''
write('src/lib/cardapio/aprendizado-compras.ts', aprendizado)


# 3) Lista compacta: passa a usar a composição aprendida e mostra a origem.
lista = 'src/components/cardapio/ListaCompras.tsx'
replace_once(
    lista,
    "import { DADOS, DIAS_SEMANA, formatarQtd, formatarReais, ingredienteBase, linhasDoDia, normalizar } from '@/lib/cardapio/motor';\n",
    "import { DADOS, DIAS_SEMANA, formatarQtd, formatarReais, ingredienteBase, normalizar } from '@/lib/cardapio/motor';\n"
    "import { linhasDoDiaComAprendizado } from '@/lib/cardapio/aprendizado-compras';\n",
)
replace_all(lista, 'linhasDoDia(estado, di, fatores, { mostrarBasicos })', 'linhasDoDiaComAprendizado(estado, di, fatores, { mostrarBasicos })')
extra_badge = "{l.manual && <span className=\"ml-1 text-micro font-bold uppercase text-ouro-600\">extra</span>}"
learned_badge = extra_badge + "\n                            {l.fonte === 'aprendido_app' && <span className=\"ml-1 text-[9px] font-bold uppercase tracking-wide text-brand-600\">aprendido</span>}"
replace_all(lista, extra_badge, learned_badge, minimo=2)


# 4) Toda a operação de Compras (lista, detalhado, lote e casamento de NF)
# usa a mesma lista aprendida. O histórico de relatórios não é reescrito.
aba = 'src/components/cardapio/AbaCompras.tsx'
replace_once(aba, '  linhasDoDia,\n', '')
replace_once(
    aba,
    "} from '@/lib/cardapio/motor';\n",
    "} from '@/lib/cardapio/motor';\nimport { linhasDoDiaComAprendizado } from '@/lib/cardapio/aprendizado-compras';\n",
)
replace_all(aba, 'linhasDoDia(', 'linhasDoDiaComAprendizado(', minimo=4)
replace_once(
    aba,
    "const custo = custoDoDia(estado, di, precos, estimativas, { fatores, mostrarBasicos });",
    "const custo = custoDoDia(estado, di, precos, estimativas, { fatores, mostrarBasicos, usarAprendizadoComposicao: true });",
)


# 5) A fonte única de custo ganha uma opção explícita. Assim só o fluxo atual
# de compras usa composição aprendida; relatórios históricos não mudam retroativamente.
custo = 'src/lib/cardapio/custo-semana.ts'
replace_once(
    custo,
    "import { linhasDoDia, normalizar } from './motor';\n",
    "import { linhasDoDia, normalizar } from './motor';\n"
    "import { linhasDoDiaComAprendizado } from './aprendizado-compras';\n",
)
replace_once(
    custo,
    "  /** Incluir itens básicos (sal, óleo, tempero) — precisa bater com a lista. */\n"
    "  mostrarBasicos?: boolean;\n",
    "  /** Incluir itens básicos (sal, óleo, tempero) — precisa bater com a lista. */\n"
    "  mostrarBasicos?: boolean;\n"
    "  /** Aplicar memória de composição das listas operacionais do app. */\n"
    "  usarAprendizadoComposicao?: boolean;\n",
)
replace_once(
    custo,
    "  return linhasDoDia(estado, diaIdx, opts.fatores, { mostrarBasicos: opts.mostrarBasicos }).map(\n"
    "    (l) => ({ norm: normalizar(l.item), qtd: l.qtd, unid: l.unid }),\n"
    "  );\n",
    "  const montar = opts.usarAprendizadoComposicao ? linhasDoDiaComAprendizado : linhasDoDia;\n"
    "  return montar(estado, diaIdx, opts.fatores, { mostrarBasicos: opts.mostrarBasicos }).map(\n"
    "    (l) => ({ norm: normalizar(l.item), qtd: l.qtd, unid: l.unid }),\n"
    "  );\n",
)

pvr = 'src/components/cardapio/PlanejadoVsReal.tsx'
replace_once(
    pvr,
    "for (const l of itensDoDiaParaCusto(estado, di, { fatores, mostrarBasicos })) {",
    "for (const l of itensDoDiaParaCusto(estado, di, { fatores, mostrarBasicos, usarAprendizadoComposicao: true })) {",
)


# 6) Remove a pressão antiga de "3–4 frangos" da validação legada.
# Mantém apenas tetos de segurança e exige diversidade geral quando a semana fecha.
motor = 'src/lib/cardapio/motor.ts'
replace_once(
    motor,
    "  if (frango > 4) avisos.push({ nivel: 'erro', msg: `Frango ${frango}× — a regra é de 3 a 4× na semana.` });\n",
    "  if (frango > 4) avisos.push({ nivel: 'erro', msg: `Frango ${frango}× — máximo 4× na semana.` });\n",
)
replace_once(
    motor,
    "  if (preenchidos === 7) {\n"
    "    if (frango < 3) avisos.push({ nivel: 'alerta', msg: `Frango só ${frango}× — o ideal é de 3 a 4× na semana.` });\n"
    "    if (bovina < 2) avisos.push({ nivel: 'alerta', msg: `Bovina só ${bovina}× — o ideal é de 2 a 3× na semana.` });\n"
    "  }\n",
    "  if (preenchidos === 7) {\n"
    "    const familiasProteina = Object.values(cont).filter((qtd) => qtd > 0).length;\n"
    "    if (familiasProteina < 3) {\n"
    "      avisos.push({ nivel: 'alerta', msg: 'Semana com pouca variedade de proteínas — tente distribuir melhor as famílias.' });\n"
    "    }\n"
    "  }\n",
)


# 7) Regressões: não aprende com uma semana isolada; aprende repetição real;
# nunca suprime fonte operacional; adição repetida escala por pessoas e não duplica.
teste = r'''import { describe, expect, it } from 'vitest';
import {
  aplicarMemoriaComposicaoCompras,
  construirMemoriaComposicaoCompras,
  resolverAprendizadoCompra,
} from './aprendizado-compras';
import { normalizar, type LinhaCompra } from './motor';
import type { EstadoSemana } from './tipos';

function estadoSemana(args: {
  principal?: string;
  guarnicao?: string;
  pessoas?: number;
  removidos?: string[];
  manuais?: { item: string; unid: string; qtd: number }[];
} = {}): EstadoSemana {
  const principal = args.principal ?? 'Bife acebolado';
  const guarnicao = args.guarnicao ?? 'Legumes';
  const pessoas = args.pessoas ?? 50;
  const dias = Array.from({ length: 7 }, (_, i) => ({
    pessoas,
    principal: i === 0 ? principal : '',
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: i === 0 ? guarnicao : '',
    salada: i === 0 ? 'Salada verde' : '',
    sobremesa: i === 0 ? 'Fruta' : '',
  }));
  const ajustes: EstadoSemana['ajustes'] = {};
  if (args.removidos?.length) {
    ajustes[0] = Object.fromEntries(args.removidos.map((x) => [normalizar(x), { removido: true }]));
  }
  return {
    versao: 1,
    listaInteligenciaVersao: 2,
    orcamento: null,
    dias,
    etapa: 'concluido',
    historico: [],
    ajustes,
    manuais: args.manuais?.length ? { 0: args.manuais } : {},
    status: {},
    obsCozinha: '',
  };
}

const fraca = (item = 'Tomate'): LinhaCompra => ({
  chave: normalizar(item), item, unid: 'kg', sugerida: 2, qtd: 2,
  manual: false, fonte: 'receita', status: {},
});

const operacional = (item = 'Tomate'): LinhaCompra => ({
  chave: normalizar(item), item, unid: 'kg', sugerida: 2, qtd: 2,
  manual: false, fonte: 'operacional_mapa', status: {},
});

describe('aprendizado de composição da lista de compras', () => {
  it('lista já existente permanece congelada mesmo quando há aprendizado forte', () => {
    const legado = estadoSemana();
    delete legado.listaInteligenciaVersao;
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S22', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S23', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const base = [fraca()];
    const antes = JSON.stringify(base);
    const linhas = aplicarMemoriaComposicaoCompras(base, legado, 0, memoria);
    expect(JSON.stringify(linhas)).toBe(antes);
    expect(linhas.map((x) => x.chave)).toEqual(['tomate']);
  });

  it('uma correção isolada não vira regra automática', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    expect(resolverAprendizadoCompra(atual.dias[0], memoria).removidos.has('tomate')).toBe(false);
  });

  it('duas semanas do mesmo cardápio suprimem item fraco repetidamente removido', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    const linhas = aplicarMemoriaComposicaoCompras([fraca()], atual, 0, memoria);
    expect(linhas.find((l) => l.chave === 'tomate')).toBeUndefined();
  });

  it('nunca apaga combo/mapa operacional por aprendizado automático', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    const linhas = aplicarMemoriaComposicaoCompras([operacional()], atual, 0, memoria);
    expect(linhas.find((l) => l.chave === 'tomate')).toBeDefined();
  });

  it('item extra repetido entra como aprendido e escala pela quantidade de pessoas', () => {
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ pessoas: 50, manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ pessoas: 50, manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const atual = estadoSemana({ pessoas: 60 });
    const linhas = aplicarMemoriaComposicaoCompras([], atual, 0, memoria);
    const banana = linhas.find((l) => l.chave === 'banana');
    expect(banana?.fonte).toBe('aprendido_app');
    expect(banana?.qtd).toBe(12);
  });

  it('não duplica item que já foi adicionado manualmente na semana atual', () => {
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const atual = estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 11 }] });
    const manual: LinhaCompra = {
      chave: 'manual:0:banana', item: 'Banana', unid: 'un', sugerida: null,
      qtd: 11, manual: true, fonte: 'manual', status: {},
    };
    const linhas = aplicarMemoriaComposicaoCompras([manual], atual, 0, memoria);
    expect(linhas.filter((l) => normalizar(l.item) === 'banana')).toHaveLength(1);
  });
});
'''
write('src/lib/cardapio/aprendizado-compras.test.ts', teste)

print('Confluência compras patch aplicado.')
