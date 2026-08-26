'use client';

/* =====================================================================
   Cache lógico do TATÁ House.
   O Supabase é a fonte compartilhada; localStorage é apenas cache/offline.
   A "sombra" em memória impede que QuotaExceededError faça uma edição
   desaparecer da UI ou bloqueie a aplicação de um valor recebido da nuvem.
   ===================================================================== */

import { definirArmazenamentoLocalCheio } from './aviso-armazenamento';

const sombra = new Map<string, string>();

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Escreve no armazenamento físico ignorando monkey-patches da instância.
 *  Usado para dados VINDOS da nuvem, para não gerar eco de volta ao Supabase.
 */
function setItemFisico(chave: string, valor: string): void {
  const s = storage();
  if (!s) throw new Error('localStorage indisponível');
  const proto = Object.getPrototypeOf(s) as { setItem?: (k: string, v: string) => void };
  if (typeof proto?.setItem === 'function') {
    Reflect.apply(proto.setItem, s, [chave, valor]);
  } else {
    s.setItem(chave, valor);
  }
}

function removeItemFisico(chave: string): void {
  const s = storage();
  if (!s) return;
  const proto = Object.getPrototypeOf(s) as { removeItem?: (k: string) => void };
  if (typeof proto?.removeItem === 'function') {
    Reflect.apply(proto.removeItem, s, [chave]);
  } else {
    s.removeItem(chave);
  }
}

/** Atualiza só a sombra. O BootNuvem usa isto ANTES da escrita física. */
export function definirSombraRaw(chave: string, valor: string): void {
  sombra.set(chave, valor);
}

/** Lê primeiro a versão mais nova da sessão; cai para o cache físico. */
export function lerRawCache(chave: string): string | null {
  if (sombra.has(chave)) return sombra.get(chave) ?? null;
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(chave);
  } catch {
    return null;
  }
}

/** Existe no cache lógico ou físico. */
export function temRawCache(chave: string): boolean {
  return lerRawCache(chave) !== null;
}

/**
 * Escrita LOCAL normal.
 * Atualiza a sombra primeiro e então usa localStorage.setItem da instância.
 * Quando BootNuvem está ativo, essa chamada é interceptada e enviada à nuvem.
 * Se a escrita física estourar quota, a sombra continua com o valor novo.
 */
export function gravarRawCache(chave: string, valor: string): boolean {
  sombra.set(chave, valor);
  const s = storage();
  if (!s) {
    definirArmazenamentoLocalCheio(true);
    return false;
  }
  try {
    s.setItem(chave, valor);
    definirArmazenamentoLocalCheio(false);
    return true;
  } catch {
    definirArmazenamentoLocalCheio(true);
    return false;
  }
}

/**
 * Valor REMOTO já confirmado pelo Supabase.
 * Sempre atualiza a sombra; persistir fisicamente é best-effort.
 * Uma quota cheia nunca pode transformar um download correto em erro de nuvem.
 */
export function aplicarRawRemoto(chave: string, valor: string): boolean {
  sombra.set(chave, valor);
  try {
    setItemFisico(chave, valor);
    definirArmazenamentoLocalCheio(false);
    return true;
  } catch {
    definirArmazenamentoLocalCheio(true);
    return false;
  }
}

export function removerRawCache(chave: string): void {
  sombra.delete(chave);
  try {
    removeItemFisico(chave);
  } catch {
    /* cache físico é best-effort */
  }
}

/** União das chaves visíveis na sessão e das persistidas no aparelho. */
export function listarChavesCache(prefixo = ''): string[] {
  const out = new Set<string>();
  for (const k of Array.from(sombra.keys())) {
    if (!prefixo || k.startsWith(prefixo)) out.add(k);
  }
  const s = storage();
  if (s) {
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && (!prefixo || k.startsWith(prefixo))) out.add(k);
      }
    } catch {
      /* ainda devolve a sombra */
    }
  }
  return Array.from(out);
}
