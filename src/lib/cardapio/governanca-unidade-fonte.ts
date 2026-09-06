'use client';

const CHAVE_UNIDADE_FONTE = 'tata.governanca.unidade-fonte.v1';
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CAMPOS = new Set(['data', 'unidadeFonte', 'recebidoEm']);

export interface UnidadeFonteGovernancaV1 {
  data: string;
  unidadeFonte: string;
  recebidoEm: string;
}

function storageDisponivel(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function texto(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

function dataValida(v: string): boolean {
  if (!DATA_RE.test(v)) return false;
  const [ano, mes, dia] = v.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function dataHoraValida(v: string): boolean {
  return DATA_HORA_RE.test(v) && !Number.isNaN(Date.parse(v));
}

function dataLocalIso(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export function normalizarUnidadeFonteGovernanca(v: unknown): UnidadeFonteGovernancaV1 | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (Object.keys(v).some((k) => !CAMPOS.has(k))) return null;
  const c = v as Partial<UnidadeFonteGovernancaV1>;
  const data = texto(c.data);
  const unidadeFonte = texto(c.unidadeFonte);
  const recebidoEm = texto(c.recebidoEm);
  if (!dataValida(data) || !unidadeFonte || unidadeFonte.length > 120 || !dataHoraValida(recebidoEm)) return null;
  return { data, unidadeFonte, recebidoEm };
}

export function salvarUnidadeFonteGovernancaLocal(
  entrada: { data: string; unidadeFonte: string; recebidoEm?: string },
): UnidadeFonteGovernancaV1 | null {
  const registro = normalizarUnidadeFonteGovernanca({
    data: entrada.data,
    unidadeFonte: entrada.unidadeFonte,
    recebidoEm: entrada.recebidoEm ?? new Date().toISOString(),
  });
  const storage = storageDisponivel();
  if (!registro || !storage) return null;
  try {
    storage.setItem(CHAVE_UNIDADE_FONTE, JSON.stringify(registro));
    return { ...registro };
  } catch { return null; }
}

export function lerUnidadeFonteGovernancaLocal(data: Date = new Date()): UnidadeFonteGovernancaV1 | null {
  const storage = storageDisponivel();
  if (!storage || Number.isNaN(data.getTime())) return null;
  try {
    const raw = storage.getItem(CHAVE_UNIDADE_FONTE);
    if (!raw) return null;
    const registro = normalizarUnidadeFonteGovernanca(JSON.parse(raw));
    if (!registro || registro.data !== dataLocalIso(data)) return null;
    return { ...registro };
  } catch { return null; }
}

export function unidadeFonteGovernancaLocal(data: Date = new Date()): string | null {
  return lerUnidadeFonteGovernancaLocal(data)?.unidadeFonte ?? null;
}
