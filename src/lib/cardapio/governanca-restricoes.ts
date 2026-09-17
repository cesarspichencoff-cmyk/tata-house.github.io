'use client';

import { normalizar } from './motor';
import type { DiaCardapio, Funcionario } from './tipos';

export const GOV_RESTRICOES_REQUEST_V1 = 'tata-house:governanca:restricoes:request:v1' as const;
export const GOV_RESTRICOES_RESPONSE_V1 = 'tata-house:governanca:restricoes:response:v1' as const;
export const ORIGEM_GOVERNANCA_RESTRICOES_V1 = 'https://lideres.tatasushi.tech' as const;

const CONTRATO = 'tata-house-governanca-restricoes' as const;
const FONTE = 'tata_plus.restricoes_do_cardapio' as const;
const SEMANA_RE = /^(\d{4})-S(\d{2})$/;
const MAX_ITENS = 80;
const MAX_CONFLITOS = 120;

export interface ConflitoRestricaoOficialV1 {
  nome: string;
  unidade: string;
  itens: string[];
}

export interface SnapshotRestricoesGovernancaV1 {
  contrato: typeof CONTRATO;
  versao: 1;
  modo: 'read-only';
  origem: 'lideres';
  fonte: typeof FONTE;
  carregadoEm: string;
  unidade: string;
  semanaId: string;
  itensConsultados: number;
  conflitos: ConflitoRestricaoOficialV1[];
}

export type RestricoesEquipeAgregadas = Record<string, number>;

function texto(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function semanaValida(v: string): boolean {
  const m = SEMANA_RE.exec(v);
  if (!m) return false;
  const n = Number(m[2]);
  return Number.isInteger(n) && n >= 1 && n <= 53;
}

function chavesExatas(obj: Record<string, unknown>, esperadas: string[]): boolean {
  const set = new Set(esperadas);
  return Object.keys(obj).every((k) => set.has(k)) && esperadas.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

export function itensDaSemanaParaRestricoes(dias: DiaCardapio[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  dias.forEach((dia) => {
    [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa].forEach((item) => {
      const t = texto(item, 120);
      const chave = normalizar(t);
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      saida.push(t);
    });
  });
  return saida.slice(0, MAX_ITENS);
}

/**
 * Projeta apenas a informação operacional necessária ao motor: termo normalizado
 * -> quantidade de pessoas ativas que declararam aquela restrição no House.
 * Não inventa equivalência com o Plus nem altera o cadastro de funcionários.
 */
export function restricoesLocaisAgregadas(funcionarios: Funcionario[]): RestricoesEquipeAgregadas {
  const saida: RestricoesEquipeAgregadas = {};
  funcionarios.filter((f) => f.ativo).forEach((f) => {
    const termosDaPessoa = new Set<string>();
    f.restricoes.forEach((r) => {
      const chave = normalizar(r.alimento);
      if (chave) termosDaPessoa.add(chave);
    });
    termosDaPessoa.forEach((chave) => { saida[chave] = (saida[chave] ?? 0) + 1; });
  });
  return saida;
}

export function impactoRestricoesLocais(dias: DiaCardapio[], restricoes: RestricoesEquipeAgregadas): {
  ocorrencias: number;
  pessoasSomadas: number;
} {
  const termos = Object.entries(restricoes).filter(([termo, n]) => !!termo && Number.isFinite(n) && n > 0);
  let ocorrencias = 0;
  let pessoasSomadas = 0;
  dias.forEach((dia) => {
    const textoDia = normalizar([dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa].filter(Boolean).join(' | '));
    termos.forEach(([termo, pessoas]) => {
      if (textoDia.includes(termo)) {
        ocorrencias += 1;
        pessoasSomadas += pessoas;
      }
    });
  });
  return { ocorrencias, pessoasSomadas };
}

function normalizarConflito(v: unknown, unidadeEsperada: string): ConflitoRestricaoOficialV1 | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  if (!chavesExatas(obj, ['nome','unidade','itens'])) return null;
  const nome = texto(obj.nome, 120);
  const unidade = texto(obj.unidade, 80);
  if (!nome || unidade !== unidadeEsperada || !Array.isArray(obj.itens) || obj.itens.length > MAX_ITENS) return null;
  const itens = obj.itens.map((i) => texto(i, 120)).filter(Boolean);
  if (itens.length !== obj.itens.length) return null;
  return { nome, unidade, itens: Array.from(new Set(itens)) };
}

export function normalizarSnapshotRestricoesGovernanca(v: unknown): SnapshotRestricoesGovernancaV1 | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  if (!chavesExatas(obj, ['contrato','versao','modo','origem','fonte','carregadoEm','unidade','semanaId','itensConsultados','conflitos'])) return null;
  if (obj.contrato !== CONTRATO || obj.versao !== 1 || obj.modo !== 'read-only' || obj.origem !== 'lideres' || obj.fonte !== FONTE) return null;
  const carregadoEm = texto(obj.carregadoEm, 64);
  const unidade = texto(obj.unidade, 80);
  const semanaId = texto(obj.semanaId, 16);
  if (!carregadoEm || Number.isNaN(Date.parse(carregadoEm)) || !unidade || !semanaValida(semanaId)) return null;
  if (typeof obj.itensConsultados !== 'number' || !Number.isInteger(obj.itensConsultados) || obj.itensConsultados < 0 || obj.itensConsultados > MAX_ITENS) return null;
  if (!Array.isArray(obj.conflitos) || obj.conflitos.length > MAX_CONFLITOS) return null;
  const conflitos = obj.conflitos.map((c) => normalizarConflito(c, unidade));
  if (conflitos.some((c) => c === null)) return null;
  return {
    contrato: CONTRATO,
    versao: 1,
    modo: 'read-only',
    origem: 'lideres',
    fonte: FONTE,
    carregadoEm,
    unidade,
    semanaId,
    itensConsultados: obj.itensConsultados,
    conflitos: conflitos as ConflitoRestricaoOficialV1[],
  };
}

export function solicitarRestricoesGovernanca(opcoes: { unidade: string; semanaId: string; itens: string[] }): boolean {
  if (typeof window === 'undefined') return false;
  const unidade = texto(opcoes.unidade, 80);
  const semanaId = texto(opcoes.semanaId, 16);
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const bruto of opcoes.itens) {
    const item = texto(bruto, 120);
    const chave = normalizar(item);
    if (!item || !chave || vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(item);
    if (itens.length >= MAX_ITENS) break;
  }
  if (!unidade || !semanaValida(semanaId) || itens.length === 0) return false;
  const msg = { type: GOV_RESTRICOES_REQUEST_V1, versao: 1, unidade, semanaId, itens };
  let enviado = false;
  try {
    if (window.parent !== window) {
      window.parent.postMessage(msg, ORIGEM_GOVERNANCA_RESTRICOES_V1);
      enviado = true;
    }
  } catch {}
  try {
    if (window.opener) {
      window.opener.postMessage(msg, ORIGEM_GOVERNANCA_RESTRICOES_V1);
      enviado = true;
    }
  } catch {}
  return enviado;
}

export function instalarHandoffRestricoesGovernanca(opcoes: {
  unidadeEsperada: string;
  semanaEsperada: string;
  aoSnapshot: (snapshot: SnapshotRestricoesGovernancaV1) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  const aoReceber = (event: MessageEvent<unknown>) => {
    const fonteValida = (window.parent !== window && event.source === window.parent) || (!!window.opener && event.source === window.opener);
    if (!fonteValida || event.origin !== ORIGEM_GOVERNANCA_RESTRICOES_V1 || !event.data || typeof event.data !== 'object') return;
    const msg = event.data as Record<string, unknown>;
    if (msg.type !== GOV_RESTRICOES_RESPONSE_V1) return;
    const snapshot = normalizarSnapshotRestricoesGovernanca(msg.payload);
    if (!snapshot || snapshot.unidade !== opcoes.unidadeEsperada || snapshot.semanaId !== opcoes.semanaEsperada) return;
    opcoes.aoSnapshot(snapshot);
  };
  window.addEventListener('message', aoReceber);
  return () => window.removeEventListener('message', aoReceber);
}
