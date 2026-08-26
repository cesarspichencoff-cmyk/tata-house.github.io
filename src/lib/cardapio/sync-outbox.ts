'use client';

import { idbGravar, idbRemover, idbTodos } from './idb';

export interface ItemOutbox {
  chave: string;
  valor: unknown;
  atualizadoEm: string;
  base?: unknown;
}

const cache = new Map<string, ItemOutbox>();
const falhasPersistencia = new Set<string>();
let inicializacao: Promise<void> | null = null;

export function inicializarOutbox(): Promise<void> {
  if (inicializacao) return inicializacao;
  inicializacao = (async () => {
    const itens = await idbTodos<ItemOutbox>('outbox');
    for (const item of itens) {
      if (item && typeof item.chave === 'string') cache.set(item.chave, item);
    }
  })();
  return inicializacao;
}

export async function salvarOutbox(chave: string, valor: unknown, base?: unknown): Promise<void> {
  await inicializarOutbox();
  const item: ItemOutbox = { chave, valor, atualizadoEm: new Date().toISOString(), ...(base !== undefined ? { base } : {}) };
  cache.set(chave, item);
  const ok = await idbGravar('outbox', chave, item);
  if (!ok) {
    falhasPersistencia.add(chave);
    throw new Error('IndexedDB nao confirmou a outbox de ' + chave);
  }
  falhasPersistencia.delete(chave);
}

export async function removerOutbox(chave: string): Promise<void> {
  await inicializarOutbox();
  const ok = await idbRemover('outbox', chave);
  if (!ok) {
    falhasPersistencia.add(chave);
    throw new Error('IndexedDB nao confirmou a remocao da outbox de ' + chave);
  }
  cache.delete(chave);
  falhasPersistencia.delete(chave);
}

export async function listarOutbox(): Promise<ItemOutbox[]> {
  await inicializarOutbox();
  return Array.from(cache.values());
}

export async function diagnosticarOutbox() {
  await inicializarOutbox();
  const persistidos = await idbTodos<ItemOutbox>('outbox');
  return {
    memoria: cache.size,
    persistidos: persistidos.filter((x) => x && typeof x.chave === 'string').length,
    falhas: Array.from(falhasPersistencia),
  };
}
