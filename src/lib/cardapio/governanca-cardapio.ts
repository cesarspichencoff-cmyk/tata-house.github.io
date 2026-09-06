'use client';

import {
  CONTRATO_GOVERNANCA,
  VERSAO_CONTRATO_GOVERNANCA,
  dataLocalIso,
  unidadeHouse,
} from './governanca-outbox';

const PREFIXO_CARDAPIO = 'tata.governanca.cardapio.v1.';

export interface CardapioGovernancaDiaV1 {
  contrato: typeof CONTRATO_GOVERNANCA;
  versao: typeof VERSAO_CONTRATO_GOVERNANCA;
  tipo: 'cardapio.dia';
  origem: 'governanca';
  atualizadoEm: string;
  data: string;
  unidade: string;
  principal: string;
  guarnicao: string;
  salada: string;
}

export interface EntradaCardapioGovernanca {
  data: string;
  unidade?: string;
  principal: string;
  guarnicao?: string;
  salada?: string;
  atualizadoEm?: string;
}

function storageDisponivel(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function dataValida(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function chave(data: string, unidade: string): string {
  return `${PREFIXO_CARDAPIO}${encodeURIComponent(unidade.toLowerCase())}.${data}`;
}

function snapshotValido(v: unknown): v is CardapioGovernancaDiaV1 {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<CardapioGovernancaDiaV1>;
  return Boolean(
    s.contrato === CONTRATO_GOVERNANCA &&
      s.versao === VERSAO_CONTRATO_GOVERNANCA &&
      s.tipo === 'cardapio.dia' &&
      s.origem === 'governanca' &&
      texto(s.atualizadoEm) &&
      dataValida(texto(s.data)) &&
      texto(s.unidade) &&
      texto(s.principal),
  );
}

/**
 * Aceita um snapshot já obtido por um canal autorizado e o persiste localmente.
 * Não busca rede e não sabe de onde o transporte veio.
 */
export function salvarCardapioGovernancaLocal(
  entrada: EntradaCardapioGovernanca,
): CardapioGovernancaDiaV1 | null {
  const storage = storageDisponivel();
  if (!storage) return null;

  const data = entrada.data.trim();
  const unidade = entrada.unidade?.trim() || unidadeHouse();
  const principal = entrada.principal.trim();
  if (!dataValida(data) || !unidade || !principal) return null;

  const snapshot: CardapioGovernancaDiaV1 = {
    contrato: CONTRATO_GOVERNANCA,
    versao: VERSAO_CONTRATO_GOVERNANCA,
    tipo: 'cardapio.dia',
    origem: 'governanca',
    atualizadoEm: entrada.atualizadoEm?.trim() || new Date().toISOString(),
    data,
    unidade,
    principal,
    guarnicao: entrada.guarnicao?.trim() || '',
    salada: entrada.salada?.trim() || '',
  };

  try {
    storage.setItem(chave(data, unidade), JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Lê apenas o snapshot da data/unidade exatas. Ausência ou corrupção devolve
 * null para que o House use seu cardápio local normal como fallback.
 */
export function lerCardapioGovernancaLocal(
  data: Date,
  unidade = unidadeHouse(),
): CardapioGovernancaDiaV1 | null {
  const storage = storageDisponivel();
  if (!storage) return null;

  try {
    const raw = storage.getItem(chave(dataLocalIso(data), unidade));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return snapshotValido(parsed) ? { ...parsed } : null;
  } catch {
    return null;
  }
}
