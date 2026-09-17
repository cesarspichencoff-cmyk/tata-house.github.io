'use client';

import { normalizar } from './motor';

export const GOV_ESTOQUE_REQUEST_V1 = 'tata-house:governanca:estoque:request:v1' as const;
export const GOV_ESTOQUE_RESPONSE_V1 = 'tata-house:governanca:estoque:response:v1' as const;
export const ORIGEM_GOVERNANCA_ESTOQUE_V1 = 'https://lideres.tatasushi.tech' as const;
export const MAX_IDADE_CONTAGEM_ESTOQUE_DIAS = 8;

const CONTRATO = 'tata-house-governanca-estoque-readonly' as const;
const FONTE = 'public.inventario_minimo+public.inventario_contagem' as const;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMANA_RE = /^(\d{4})-S(\d{2})$/;
const MAX_ITENS = 160;

export interface ItemEstoqueGovernancaV1 {
  item: string;
  chave: string;
  departamento: string;
  unidadeMedida: string;
  estoqueAtual: number;
  dataContagem: string;
}

export interface SnapshotEstoqueGovernancaV1 {
  contrato: typeof CONTRATO;
  versao: 1;
  modo: 'read-only';
  origem: 'lideres';
  fonte: typeof FONTE;
  carregadoEm: string;
  unidade: string;
  semanaId: string;
  itensConsultados: number;
  itens: ItemEstoqueGovernancaV1[];
  ambiguos: string[];
  semContagem: string[];
}

function texto(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function chavesExatas(obj: Record<string, unknown>, campos: string[]): boolean {
  const permitidas = new Set(campos);
  return Object.keys(obj).every((k) => permitidas.has(k)) && campos.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function dataValida(v: string): boolean {
  if (!DATA_RE.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function semanaValida(v: string): boolean {
  const m = SEMANA_RE.exec(v);
  const n = m ? Number(m[2]) : 0;
  return !!m && Number.isInteger(n) && n >= 1 && n <= 53;
}

function stringsUnicas(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_ITENS) return null;
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const bruto of v) {
    const item = texto(bruto, 120);
    const chave = normalizar(item);
    if (!item || !chave) return null;
    if (!vistos.has(chave)) { vistos.add(chave); out.push(item); }
  }
  return out;
}

function normalizarItem(v: unknown, unidade: string): ItemEstoqueGovernancaV1 | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Record<string, unknown>;
  if (!chavesExatas(e, ['item','chave','departamento','unidadeMedida','estoqueAtual','dataContagem'])) return null;
  const item = texto(e.item, 120);
  const chave = texto(e.chave, 160);
  const departamento = texto(e.departamento, 100);
  const unidadeMedida = texto(e.unidadeMedida, 40);
  const estoqueAtual = e.estoqueAtual;
  const dataContagem = texto(e.dataContagem, 10);
  if (!item || !chave || chave !== normalizar(item) || !departamento || !unidadeMedida || typeof estoqueAtual !== 'number' || !Number.isFinite(estoqueAtual) || estoqueAtual < 0 || !dataValida(dataContagem) || !unidade) return null;
  return { item, chave, departamento, unidadeMedida, estoqueAtual, dataContagem };
}

export function normalizarSnapshotEstoqueGovernanca(entrada: unknown): SnapshotEstoqueGovernancaV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  if (!chavesExatas(e, ['contrato','versao','modo','origem','fonte','carregadoEm','unidade','semanaId','itensConsultados','itens','ambiguos','semContagem'])) return null;
  if (e.contrato !== CONTRATO || e.versao !== 1 || e.modo !== 'read-only' || e.origem !== 'lideres' || e.fonte !== FONTE) return null;
  const carregadoEm = texto(e.carregadoEm, 40);
  const unidade = texto(e.unidade, 80);
  const semanaId = texto(e.semanaId, 16);
  const itensConsultados = e.itensConsultados;
  if (!carregadoEm || Number.isNaN(Date.parse(carregadoEm)) || !unidade || !semanaValida(semanaId) || typeof itensConsultados !== 'number' || !Number.isInteger(itensConsultados) || itensConsultados < 0 || itensConsultados > MAX_ITENS || !Array.isArray(e.itens) || e.itens.length > MAX_ITENS) return null;
  const itens = e.itens.map((item) => normalizarItem(item, unidade));
  const ambiguos = stringsUnicas(e.ambiguos);
  const semContagem = stringsUnicas(e.semContagem);
  if (itens.some((item) => item === null) || !ambiguos || !semContagem) return null;
  const chaves = new Set<string>();
  for (const item of itens as ItemEstoqueGovernancaV1[]) {
    if (chaves.has(item.chave)) return null;
    chaves.add(item.chave);
  }
  const amb = new Set(ambiguos.map(normalizar));
  if ((itens as ItemEstoqueGovernancaV1[]).some((item) => amb.has(item.chave))) return null;
  return { contrato: CONTRATO, versao: 1, modo: 'read-only', origem: 'lideres', fonte: FONTE, carregadoEm, unidade, semanaId, itensConsultados, itens: itens as ItemEstoqueGovernancaV1[], ambiguos, semContagem };
}

function idadeEmDias(dataIso: string, agora: Date): number {
  const dt = new Date(`${dataIso}T12:00:00Z`);
  return Math.floor((agora.getTime() - dt.getTime()) / 86400000);
}

export function estoqueOficialParaPlanejamento(
  snapshot: SnapshotEstoqueGovernancaV1 | null,
  unidadeEsperada: string,
  agora: Date = new Date(),
): Record<string, number> {
  const s = normalizarSnapshotEstoqueGovernanca(snapshot);
  if (!s || s.unidade !== unidadeEsperada) return {};
  const out: Record<string, number> = {};
  s.itens.forEach((item) => {
    const idade = idadeEmDias(item.dataContagem, agora);
    if (idade < 0 || idade > MAX_IDADE_CONTAGEM_ESTOQUE_DIAS) return;
    out[item.chave] = item.estoqueAtual;
  });
  return out;
}

export function solicitarEstoqueGovernanca(args: { unidade: string; semanaId: string; itens: string[] }): boolean {
  if (typeof window === 'undefined') return false;
  const unidade = texto(args.unidade, 80);
  const semanaId = texto(args.semanaId, 16);
  const itens = stringsUnicas(args.itens);
  if (!unidade || !semanaValida(semanaId) || !itens?.length) return false;
  const alvo = window.parent !== window ? window.parent : window.opener && !window.opener.closed ? window.opener : null;
  if (!alvo) return false;
  try {
    alvo.postMessage({ type: GOV_ESTOQUE_REQUEST_V1, versao: 1, unidade, semanaId, itens }, ORIGEM_GOVERNANCA_ESTOQUE_V1);
    return true;
  } catch { return false; }
}

export function instalarHandoffEstoqueGovernanca(args: {
  unidadeEsperada: string;
  semanaEsperada: string;
  aoSnapshot: (snapshot: SnapshotEstoqueGovernancaV1) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: MessageEvent) => {
    if (event.origin !== ORIGEM_GOVERNANCA_ESTOQUE_V1) return;
    const fonteValida = event.source === window.parent || (!!window.opener && event.source === window.opener);
    if (!fonteValida || !event.data || typeof event.data !== 'object' || event.data.type !== GOV_ESTOQUE_RESPONSE_V1) return;
    const snapshot = normalizarSnapshotEstoqueGovernanca(event.data.payload);
    if (!snapshot || snapshot.unidade !== args.unidadeEsperada || snapshot.semanaId !== args.semanaEsperada) return;
    args.aoSnapshot(snapshot);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
