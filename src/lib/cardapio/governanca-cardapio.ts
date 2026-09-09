'use client';

import {
  CONTRATO_GOVERNANCA,
  VERSAO_CONTRATO_GOVERNANCA,
  dataLocalIso,
  unidadeHouse,
} from './governanca-outbox';

const PREFIXO_CARDAPIO = 'tata.governanca.cardapio.v1.';
const DATA_HORA_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function dataHoraValida(v: string): boolean {
  return DATA_HORA_RFC3339.test(v) && !Number.isNaN(Date.parse(v));
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
      dataHoraValida(texto(s.atualizadoEm)) &&
      dataValida(texto(s.data)) &&
      texto(s.unidade) &&
      texto(s.principal) &&
      typeof s.guarnicao === 'string' &&
      typeof s.salada === 'string',
  );
}

/**
 * Persiste um snapshot de fronteira somente depois de validar o contrato v1.
 * Campos extras são descartados para que o estado local permaneça canônico.
 */
export function salvarSnapshotCardapioGovernancaLocal(
  entrada: unknown,
): CardapioGovernancaDiaV1 | null {
  const storage = storageDisponivel();
  if (!storage || !snapshotValido(entrada)) return null;

  const snapshot: CardapioGovernancaDiaV1 = {
    contrato: CONTRATO_GOVERNANCA,
    versao: VERSAO_CONTRATO_GOVERNANCA,
    tipo: 'cardapio.dia',
    origem: 'governanca',
    atualizadoEm: texto(entrada.atualizadoEm),
    data: texto(entrada.data),
    unidade: texto(entrada.unidade),
    principal: texto(entrada.principal),
    guarnicao: entrada.guarnicao.trim(),
    salada: entrada.salada.trim(),
  };

  try {
    storage.setItem(chave(snapshot.data, snapshot.unidade), JSON.stringify(snapshot));
    return { ...snapshot };
  } catch {
    return null;
  }
}

/**
 * Aceita os campos operacionais e constrói um snapshot canônico antes de
 * persistir. Não busca rede e não conhece o transporte que trouxe os dados.
 */
export function salvarCardapioGovernancaLocal(
  entrada: EntradaCardapioGovernanca,
): CardapioGovernancaDiaV1 | null {
  const data = entrada.data.trim();
  const unidade = entrada.unidade?.trim() || unidadeHouse();
  const principal = entrada.principal.trim();
  if (!dataValida(data) || !unidade || !principal) return null;

  return salvarSnapshotCardapioGovernancaLocal({
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
  });
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
    if (!snapshotValido(parsed)) return null;
    return {
      contrato: CONTRATO_GOVERNANCA,
      versao: VERSAO_CONTRATO_GOVERNANCA,
      tipo: 'cardapio.dia',
      origem: 'governanca',
      atualizadoEm: texto(parsed.atualizadoEm),
      data: texto(parsed.data),
      unidade: texto(parsed.unidade),
      principal: texto(parsed.principal),
      guarnicao: parsed.guarnicao.trim(),
      salada: parsed.salada.trim(),
    };
  } catch {
    return null;
  }
}