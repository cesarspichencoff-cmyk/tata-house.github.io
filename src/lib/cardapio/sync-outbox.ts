'use client';

import { idbGravar, idbRemover, idbTodos } from './idb';

export interface ItemOutbox {
  chave: string;
  valor: unknown;
  atualizadoEm: string;
}

const cache = new Map<string, ItemOutbox>();
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

export async function salvarOutbox(chave: string, valor: unknown): Promise<void> {
  await inicializarOutbox();
  const item: ItemOutbox = { chave, valor, atualizadoEm: new Date().toISOString() };
  cache.set(chave, item);
  await idbGravar('outbox', chave, item);
}

export async function removerOutbox(chave: string): Promise<void> {
  await inicializarOutbox();
  cache.delete(chave);
  await idbRemover('outbox', chave);
}

export async function listarOutbox(): Promise<ItemOutbox[]> {
  await inicializarOutbox();
  return Array.from(cache.values());
}
