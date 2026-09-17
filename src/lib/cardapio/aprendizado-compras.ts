import { arredondar, linhasDoDia, normalizar, type LinhaCompra, type OpcoesLista } from './motor';
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
