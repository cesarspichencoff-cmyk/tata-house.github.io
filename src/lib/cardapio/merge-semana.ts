/* =====================================================================
   Merge 3-vias do documento da semana — resolve edição simultânea entre
   aparelhos SEM perder dados no caso comum (cada um mexe numa parte
   diferente). Ex.: compras marca "recebido" no item X enquanto a cozinha
   troca o prato de quarta — ambas as mudanças sobrevivem.

   Regra de folha (com base = ancestral comum conhecido):
     • local == remote        → sem conflito
     • só local mudou (remote==base)  → fica o local
     • só remote mudou (local==base)  → fica o remote
     • ambos mudaram diferente → conflito real → vence o remote (quem
       escreveu por último), de forma determinística e convergente.

   Sem base (primeira sincronização deste aparelho para esta semana): cai
   para união de mapas (lossless para edições em chaves distintas) e, nos
   escalares, PRESERVA A NUVEM. Um aparelho sem base pode estar carregando
   uma cópia de semanas atrás; deixá-lo vencer o merge apaga o trabalho de
   todo mundo (ver o aviso em `folha`).

   Função PURA e testada (merge-semana.test.ts). É o único ponto onde a
   reconciliação da nuvem decide o documento da semana.
   ===================================================================== */

import type {
  AjusteItem,
  DiaCardapio,
  EstadoSemana,
  ItemManual,
  RegistroEtapa,
  StatusItem,
} from './tipos';

const ig = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 3-way merge de um valor folha (base pode faltar). */
function folha<T>(base: T | undefined, local: T, remote: T): T {
  if (ig(local, remote)) return remote;
  if (base !== undefined && ig(local, base)) return remote; // só remote mudou
  if (base !== undefined && ig(remote, base)) return local; // só local mudou
  // Conflito real → vence o REMOTE (a nuvem é a verdade compartilhada).
  //
  // ⚠️ NÃO troque isto por "sem base, vence o local". Já tentamos, e destruiu
  // dado real: um aparelho parado há semanas não tem base e carrega uma cópia
  // ANTIGA da semana. Ao voltar a sincronizar, ele vencia o merge com essa
  // cópia velha e ainda a empurrava para a nuvem — apagando, para todo mundo,
  // o cardápio que tinha acabado de ser montado em outro aparelho.
  // Sem base não há como saber quem é mais recente; entre arriscar perder a
  // digitação de um aparelho e arriscar sobrescrever a semana inteira de todos,
  // o certo é preservar a nuvem.
  return remote;
}

/** Merge de um mapa chave→valor, com um combinador por valor (3-way no valor
   quando ambos os lados têm a chave; respeita adições e remoções). */
function mergeMapa<V>(
  base: Record<string, V> | undefined,
  local: Record<string, V>,
  remote: Record<string, V>,
  combinar: (b: V | undefined, l: V, r: V) => V,
): Record<string, V> {
  const out: Record<string, V> = {};
  const vistas: Record<string, true> = {};
  const chaves = Object.keys(local).concat(Object.keys(remote));
  for (const k of chaves) {
    if (vistas[k]) continue;
    vistas[k] = true;
    const b = base?.[k];
    const l = local[k];
    const r = remote[k];
    if (l === undefined) {
      // só remote tem a chave. Se local a removeu e remote não mexeu, fica removida.
      if (b !== undefined && ig(b, r)) continue;
      out[k] = r;
    } else if (r === undefined) {
      // só local tem a chave. Se remote removeu e local não mexeu, fica removida.
      if (b !== undefined && ig(b, l)) continue;
      out[k] = l;
    } else {
      out[k] = combinar(b, l, r);
    }
  }
  return out;
}

/** Mapa simples (folha por valor). */
const mapaFolha = <V>(base: Record<string, V> | undefined, local: Record<string, V>, remote: Record<string, V>) =>
  mergeMapa(base, local, remote, folha);

/** Mapa de mapas (dia → item → valor), 3-way no item. */
const mapaDeMapa = <V>(
  base: Record<string, Record<string, V>> | undefined,
  local: Record<string, Record<string, V>>,
  remote: Record<string, Record<string, V>>,
) => mergeMapa(base, local, remote, (b, l, r) => mergeMapa(b ?? {}, l, r, folha));

/** Os 7 dias: merge campo a campo de cada dia. */
function mergeDias(
  base: DiaCardapio[] | undefined,
  local: DiaCardapio[],
  remote: DiaCardapio[],
): DiaCardapio[] {
  const n = Math.max(local.length, remote.length);
  const out: DiaCardapio[] = [];
  for (let i = 0; i < n; i++) {
    const b = base?.[i];
    const l = local[i];
    const r = remote[i];
    if (!l) { out.push(r); continue; }
    if (!r) { out.push(l); continue; }
    out.push({
      pessoas: folha(b?.pessoas, l.pessoas, r.pessoas),
      principal: folha(b?.principal, l.principal, r.principal),
      guarnicaoFixa: folha(b?.guarnicaoFixa, l.guarnicaoFixa, r.guarnicaoFixa),
      guarnicao: folha(b?.guarnicao, l.guarnicao, r.guarnicao),
      salada: folha(b?.salada, l.salada, r.salada),
      sobremesa: folha(b?.sobremesa, l.sobremesa, r.sobremesa),
    });
  }
  return out;
}

/** Histórico de etapas: log append-only → união deduplicada, ordenada por data. */
function mergeHistorico(local: RegistroEtapa[] = [], remote: RegistroEtapa[] = []): RegistroEtapa[] {
  const visto = new Set<string>();
  const out: RegistroEtapa[] = [];
  for (const r of [...local, ...remote]) {
    const k = `${r.etapa}|${r.em}|${r.papel}`;
    if (visto.has(k)) continue;
    visto.add(k);
    out.push(r);
  }
  return out.sort((a, b) => a.em.localeCompare(b.em));
}

/** Merge 3-vias completo de um documento de semana. */
export function mesclarSemana(
  base: EstadoSemana | null,
  local: EstadoSemana,
  remote: EstadoSemana,
): EstadoSemana {
  const merged: EstadoSemana = {
    versao: 1,
    orcamento: folha(base?.orcamento, local.orcamento, remote.orcamento),
    dias: mergeDias(base?.dias, local.dias, remote.dias),
    etapa: folha(base?.etapa, local.etapa, remote.etapa),
    historico: mergeHistorico(local.historico, remote.historico),
    ajustes: mapaDeMapa(
      base?.ajustes as Record<string, Record<string, AjusteItem>> | undefined,
      (local.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
      (remote.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
    ) as unknown as EstadoSemana['ajustes'],
    manuais: mergeMapa(
      base?.manuais as Record<string, ItemManual[]> | undefined,
      (local.manuais ?? {}) as Record<string, ItemManual[]>,
      (remote.manuais ?? {}) as Record<string, ItemManual[]>,
      folha,
    ) as unknown as EstadoSemana['manuais'],
    status: mapaDeMapa(
      base?.status as Record<string, Record<string, StatusItem>> | undefined,
      (local.status ?? {}) as Record<string, Record<string, StatusItem>>,
      (remote.status ?? {}) as Record<string, Record<string, StatusItem>>,
    ) as unknown as EstadoSemana['status'],
    obsCozinha: folha(base?.obsCozinha, local.obsCozinha, remote.obsCozinha),
  };

  // Campos opcionais — só inclui quando há conteúdo, para não inchar o doc.
  const refeicoes = mapaFolha(
    base?.refeicoes as Record<string, number> | undefined,
    (local.refeicoes ?? {}) as Record<string, number>,
    (remote.refeicoes ?? {}) as Record<string, number>,
  );
  if (Object.keys(refeicoes).length) merged.refeicoes = refeicoes as unknown as EstadoSemana['refeicoes'];

  const notas = mapaFolha(
    base?.notas as Record<string, string> | undefined,
    (local.notas ?? {}) as Record<string, string>,
    (remote.notas ?? {}) as Record<string, string>,
  );
  if (Object.keys(notas).length) merged.notas = notas as unknown as EstadoSemana['notas'];

  const nf = folha(base?.notasFiscais, local.notasFiscais, remote.notasFiscais);
  if (nf && nf.length) merged.notasFiscais = nf;

  return merged;
}
