'use client';

export type LojaIdb = 'estado' | 'outbox';

const DB_NOME = 'tata-house-v2';
const DB_VERSAO = 1;
const LOJAS: LojaIdb[] = ['estado', 'outbox'];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function abrirDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = () => {
        for (const loja of LOJAS) {
          if (!req.result.objectStoreNames.contains(loja)) req.result.createObjectStore(loja);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function idbLer<T>(loja: LojaIdb, chave: IDBValidKey, padrao: T): Promise<T> {
  const db = await abrirDb();
  if (!db) return padrao;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(loja, 'readonly').objectStore(loja).get(chave);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? padrao);
      req.onerror = () => resolve(padrao);
    } catch {
      resolve(padrao);
    }
  });
}

export async function idbGravar(loja: LojaIdb, chave: IDBValidKey, valor: unknown): Promise<boolean> {
  const db = await abrirDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(loja, 'readwrite');
      tx.objectStore(loja).put(valor, chave);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbRemover(loja: LojaIdb, chave: IDBValidKey): Promise<void> {
  const db = await abrirDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(loja, 'readwrite');
      tx.objectStore(loja).delete(chave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbTodos<T>(loja: LojaIdb): Promise<T[]> {
  const db = await abrirDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const out: T[] = [];
    try {
      const req = db.transaction(loja, 'readonly').objectStore(loja).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push(cursor.value as T);
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}
