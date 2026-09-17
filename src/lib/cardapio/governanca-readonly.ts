'use client';

import { normalizar } from './motor';

export const GOV_PLANEJADOR_EVIDENCIA_V1 = 'tata-house:governanca:planejador:evidencia:v1' as const;
export const GOV_PLANEJADOR_EVIDENCIA_READY_V1 = 'tata-house:governanca:planejador:evidencia:ready:v1' as const;
export const ORIGEM_GOVERNANCA_READONLY_V1 = 'https://lideres.tatasushi.tech' as const;

const CONTRATO = 'tata-house-governanca-readonly' as const;
const FONTE = 'tata_plus.refeicoes_relatorio_detalhado' as const;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMANA_RE = /^(\d{4})-S(\d{2})$/;
const MAX_DIAS = 56;
const MAX_PRINCIPAIS = 80;

export interface EvidenciaDiaReadOnlyV1 {
  data: string;
  unidade: string;
  status: string;
  resumo: string;
  principal: string;
  custoTotal: number | null;
  desperdicioTotal: number | null;
  avaliacaoMedia: number | null;
  nAvaliacoes: number;
  almocoPlanejado: number | null;
  jantarPlanejado: number | null;
  marmitasPlanejado: number | null;
  almocoServido: number | null;
  jantarServido: number | null;
  marmitasServido: number | null;
  planejadoTotal: number | null;
  servidoTotal: number | null;
  indiceSaudavel: number | null;
  kcal: number | null;
  proteinaG: number | null;
  carbG: number | null;
  gorduraG: number | null;
  fibraG: number | null;
  porcaoG: number | null;
}

export interface EvidenciaPrincipalReadOnlyV1 {
  nome: string;
  ocorrencias8Semanas: number;
  ocorrencias4Semanas: number;
  avaliacaoMedia: number | null;
  amostraAvaliacoes: number;
  custoMedioDia: number | null;
  desperdicioMedioDia: number | null;
  servidoMedioDia: number | null;
  planejadoMedioDia: number | null;
}

export interface EvidenciaGovernancaReadOnlyV1 {
  contrato: typeof CONTRATO;
  versao: 1;
  modo: 'read-only';
  origem: 'lideres';
  fonte: typeof FONTE;
  carregadoEm: string;
  unidade: string;
  semanaId: string;
  periodo: { de: string; ate: string };
  dias: EvidenciaDiaReadOnlyV1[];
  principais: EvidenciaPrincipalReadOnlyV1[];
}

export interface AceitacaoLevePlanejamento {
  n: number;
  somaNotas: number;
}

export interface DemandaOficialDiaSemana {
  mediaServido: number;
  amostra: number;
}

interface MensagemEvidenciaV1 {
  type: typeof GOV_PLANEJADOR_EVIDENCIA_V1;
  payload?: unknown;
}

let contextoEsperado: { unidade: string; semana: string } | null = null;
let ultimaEvidencia: EvidenciaGovernancaReadOnlyV1 | null = null;

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function chavesExatas(obj: Record<string, unknown>, permitidas: string[]): boolean {
  const conjunto = new Set(permitidas);
  return Object.keys(obj).every((k) => conjunto.has(k)) && permitidas.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function dataValida(v: string): boolean {
  if (!DATA_RE.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function semanaValida(v: string): boolean {
  const m = SEMANA_RE.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const semana = Number(m[2]);
  return Number.isInteger(ano) && semana >= 1 && semana <= 53;
}

function numeroOuNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function numeroNaoNegativoOuNull(v: unknown): number | null | undefined {
  const n = numeroOuNull(v);
  if (n === undefined || n === null) return n;
  return n >= 0 ? n : undefined;
}

function inteiroNaoNegativo(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

const CAMPOS_DIA = [
  'data','unidade','status','resumo','principal','custoTotal','desperdicioTotal','avaliacaoMedia','nAvaliacoes',
  'almocoPlanejado','jantarPlanejado','marmitasPlanejado','almocoServido','jantarServido','marmitasServido',
  'planejadoTotal','servidoTotal','indiceSaudavel','kcal','proteinaG','carbG','gorduraG','fibraG','porcaoG',
];

function normalizarDia(entrada: unknown, unidade: string, de: string, ate: string): EvidenciaDiaReadOnlyV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  if (!chavesExatas(e, CAMPOS_DIA)) return null;
  const data = texto(e.data);
  if (!dataValida(data) || data < de || data > ate || texto(e.unidade) !== unidade) return null;
  const custoTotal = numeroNaoNegativoOuNull(e.custoTotal);
  const desperdicioTotal = numeroNaoNegativoOuNull(e.desperdicioTotal);
  const avaliacaoMedia = numeroOuNull(e.avaliacaoMedia);
  const nAvaliacoes = inteiroNaoNegativo(e.nAvaliacoes);
  const camposNaoNegativos = [
    'almocoPlanejado','jantarPlanejado','marmitasPlanejado','almocoServido','jantarServido','marmitasServido',
    'planejadoTotal','servidoTotal','indiceSaudavel','kcal','proteinaG','carbG','gorduraG','fibraG','porcaoG',
  ] as const;
  const nums: Record<string, number | null> = {};
  for (const campo of camposNaoNegativos) {
    const n = numeroNaoNegativoOuNull(e[campo]);
    if (n === undefined) return null;
    nums[campo] = n;
  }
  if (custoTotal === undefined || desperdicioTotal === undefined || avaliacaoMedia === undefined || nAvaliacoes === null) return null;
  if (avaliacaoMedia !== null && (avaliacaoMedia < 0 || avaliacaoMedia > 5)) return null;
  if (nums.indiceSaudavel !== null && nums.indiceSaudavel > 100) return null;
  return {
    data,
    unidade,
    status: texto(e.status),
    resumo: texto(e.resumo),
    principal: texto(e.principal),
    custoTotal,
    desperdicioTotal,
    avaliacaoMedia,
    nAvaliacoes,
    almocoPlanejado: nums.almocoPlanejado,
    jantarPlanejado: nums.jantarPlanejado,
    marmitasPlanejado: nums.marmitasPlanejado,
    almocoServido: nums.almocoServido,
    jantarServido: nums.jantarServido,
    marmitasServido: nums.marmitasServido,
    planejadoTotal: nums.planejadoTotal,
    servidoTotal: nums.servidoTotal,
    indiceSaudavel: nums.indiceSaudavel,
    kcal: nums.kcal,
    proteinaG: nums.proteinaG,
    carbG: nums.carbG,
    gorduraG: nums.gorduraG,
    fibraG: nums.fibraG,
    porcaoG: nums.porcaoG,
  };
}

function normalizarPrincipal(entrada: unknown): EvidenciaPrincipalReadOnlyV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  if (!chavesExatas(e, [
    'nome','ocorrencias8Semanas','ocorrencias4Semanas','avaliacaoMedia','amostraAvaliacoes','custoMedioDia',
    'desperdicioMedioDia','servidoMedioDia','planejadoMedioDia',
  ])) return null;
  const nome = texto(e.nome);
  const o8 = inteiroNaoNegativo(e.ocorrencias8Semanas);
  const o4 = inteiroNaoNegativo(e.ocorrencias4Semanas);
  const amostra = inteiroNaoNegativo(e.amostraAvaliacoes);
  const avaliacao = numeroOuNull(e.avaliacaoMedia);
  const custo = numeroNaoNegativoOuNull(e.custoMedioDia);
  const desperdicio = numeroNaoNegativoOuNull(e.desperdicioMedioDia);
  const servido = numeroNaoNegativoOuNull(e.servidoMedioDia);
  const planejado = numeroNaoNegativoOuNull(e.planejadoMedioDia);
  if (!nome || o8 === null || o4 === null || amostra === null || avaliacao === undefined || custo === undefined || desperdicio === undefined || servido === undefined || planejado === undefined || o4 > o8) return null;
  if (avaliacao !== null && (avaliacao < 0 || avaliacao > 5)) return null;
  return {
    nome,
    ocorrencias8Semanas: o8,
    ocorrencias4Semanas: o4,
    avaliacaoMedia: avaliacao,
    amostraAvaliacoes: amostra,
    custoMedioDia: custo,
    desperdicioMedioDia: desperdicio,
    servidoMedioDia: servido,
    planejadoMedioDia: planejado,
  };
}

export function normalizarEvidenciaGovernancaReadOnly(entrada: unknown): EvidenciaGovernancaReadOnlyV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  if (!chavesExatas(e, ['contrato','versao','modo','origem','fonte','carregadoEm','unidade','semanaId','periodo','dias','principais'])) return null;
  if (e.contrato !== CONTRATO || e.versao !== 1 || e.modo !== 'read-only' || e.origem !== 'lideres' || e.fonte !== FONTE) return null;
  const carregadoEm = texto(e.carregadoEm);
  const unidade = texto(e.unidade);
  const semanaId = texto(e.semanaId);
  if (!carregadoEm || Number.isNaN(Date.parse(carregadoEm)) || !unidade || !semanaValida(semanaId)) return null;
  if (!e.periodo || typeof e.periodo !== 'object') return null;
  const periodo = e.periodo as Record<string, unknown>;
  if (!chavesExatas(periodo, ['de','ate'])) return null;
  const de = texto(periodo.de);
  const ate = texto(periodo.ate);
  if (!dataValida(de) || !dataValida(ate) || de > ate) return null;
  if (!Array.isArray(e.dias) || e.dias.length > MAX_DIAS || !Array.isArray(e.principais) || e.principais.length > MAX_PRINCIPAIS) return null;
  const dias = e.dias.map((d) => normalizarDia(d, unidade, de, ate));
  const principais = e.principais.map(normalizarPrincipal);
  if (dias.some((d) => d === null) || principais.some((p) => p === null)) return null;
  return {
    contrato: CONTRATO,
    versao: 1,
    modo: 'read-only',
    origem: 'lideres',
    fonte: FONTE,
    carregadoEm,
    unidade,
    semanaId,
    periodo: { de, ate },
    dias: dias as EvidenciaDiaReadOnlyV1[],
    principais: principais as EvidenciaPrincipalReadOnlyV1[],
  };
}

export function frequenciaOficial4Semanas(evidencia: EvidenciaGovernancaReadOnlyV1 | null): Record<string, number> {
  if (!evidencia) return {};
  const saida: Record<string, number> = {};
  evidencia.principais.forEach((p) => {
    const chave = normalizar(p.nome);
    if (!chave) return;
    saida[chave] = Math.max(saida[chave] ?? 0, p.ocorrencias4Semanas);
  });
  return saida;
}

/** A fonte oficial vence quando há amostra. O local é apenas fallback.
 *  Isso evita somar duas vezes o mesmo voto quando o QR passar a persistir
 *  também no tata_refeicoes. Nenhum dado é gravado no House por esta função. */
export function aceitacaoParaPlanejamento(
  local: Record<string, AceitacaoLevePlanejamento>,
  evidencia: EvidenciaGovernancaReadOnlyV1 | null = evidenciaGovernancaAtual(),
): Record<string, AceitacaoLevePlanejamento> {
  const saida: Record<string, AceitacaoLevePlanejamento> = { ...local };
  if (!evidencia) return saida;
  evidencia.principais.forEach((p) => {
    if (p.avaliacaoMedia === null || p.amostraAvaliacoes <= 0) return;
    const chave = normalizar(p.nome);
    if (!chave) return;
    saida[chave] = {
      n: p.amostraAvaliacoes,
      somaNotas: p.avaliacaoMedia * p.amostraAvaliacoes,
    };
  });
  return saida;
}

/** Média de refeições efetivamente servidas por dia da semana (seg=0…dom=6).
 *  Só usa contagem real; planejado não é tratado como consumo realizado. */
export function demandaOficialPorDiaSemana(
  evidencia: EvidenciaGovernancaReadOnlyV1 | null = evidenciaGovernancaAtual(),
): Array<DemandaOficialDiaSemana | null> {
  const acc = Array.from({ length: 7 }, () => ({ soma: 0, n: 0 }));
  if (evidencia) {
    evidencia.dias.forEach((dia) => {
      if (dia.servidoTotal === null || dia.servidoTotal <= 0) return;
      const dt = new Date(`${dia.data}T12:00:00Z`);
      const idx = (dt.getUTCDay() + 6) % 7;
      acc[idx].soma += dia.servidoTotal;
      acc[idx].n += 1;
    });
  }
  return acc.map((a) => a.n > 0 ? { mediaServido: a.soma / a.n, amostra: a.n } : null);
}

export function resumoOperacionalOficial(
  evidencia: EvidenciaGovernancaReadOnlyV1 | null = evidenciaGovernancaAtual(),
) {
  if (!evidencia) return null;
  const comContagem = evidencia.dias.filter((d) => d.servidoTotal !== null && d.servidoTotal > 0);
  const comDesperdicio = evidencia.dias.filter((d) => d.desperdicioTotal !== null && d.desperdicioTotal > 0);
  const saudaveis = evidencia.dias.map((d) => d.indiceSaudavel).filter((n): n is number => n !== null);
  const avaliacoes = evidencia.principais.reduce((s, p) => s + p.amostraAvaliacoes, 0);
  return {
    diasComContagemReal: comContagem.length,
    diasComDesperdicioRegistrado: comDesperdicio.length,
    indiceSaudavelMedio: saudaveis.length ? saudaveis.reduce((a, b) => a + b, 0) / saudaveis.length : null,
    avaliacoesOficiais: avaliacoes,
  };
}

export function evidenciaGovernancaAtual(): EvidenciaGovernancaReadOnlyV1 | null {
  if (!contextoEsperado || !ultimaEvidencia) return null;
  if (ultimaEvidencia.unidade !== contextoEsperado.unidade || ultimaEvidencia.semanaId !== contextoEsperado.semana) return null;
  return ultimaEvidencia;
}

export function processarMensagemEvidenciaGovernanca(
  origem: string,
  dados: unknown,
  unidadeEsperada: string,
  semanaEsperada: string,
): EvidenciaGovernancaReadOnlyV1 | null {
  if (origem !== ORIGEM_GOVERNANCA_READONLY_V1 || !dados || typeof dados !== 'object') return null;
  const msg = dados as Partial<MensagemEvidenciaV1>;
  if (msg.type !== GOV_PLANEJADOR_EVIDENCIA_V1) return null;
  const evidencia = normalizarEvidenciaGovernancaReadOnly(msg.payload);
  if (!evidencia || evidencia.unidade !== unidadeEsperada || evidencia.semanaId !== semanaEsperada) return null;
  return evidencia;
}

export function instalarHandoffEvidenciaReadOnly(opcoes: {
  unidadeEsperada: string;
  semanaEsperada: string;
  aoEvidencia: (evidencia: EvidenciaGovernancaReadOnlyV1) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  contextoEsperado = { unidade: opcoes.unidadeEsperada, semana: opcoes.semanaEsperada };
  if (!ultimaEvidencia || ultimaEvidencia.unidade !== opcoes.unidadeEsperada || ultimaEvidencia.semanaId !== opcoes.semanaEsperada) {
    ultimaEvidencia = null;
  }
  const aoReceber = (event: MessageEvent<unknown>) => {
    const fonteValida = (window.parent !== window && event.source === window.parent) || (!!window.opener && event.source === window.opener);
    if (!fonteValida) return;
    const evidencia = processarMensagemEvidenciaGovernanca(event.origin, event.data, opcoes.unidadeEsperada, opcoes.semanaEsperada);
    if (evidencia) {
      ultimaEvidencia = evidencia;
      opcoes.aoEvidencia(evidencia);
    }
  };
  window.addEventListener('message', aoReceber);

  const ready = { type: GOV_PLANEJADOR_EVIDENCIA_READY_V1, versao: 1 };
  try {
    window.opener?.postMessage(ready, ORIGEM_GOVERNANCA_READONLY_V1);
  } catch {}
  try {
    if (window.parent !== window) window.parent.postMessage(ready, ORIGEM_GOVERNANCA_READONLY_V1);
  } catch {}

  return () => {
    window.removeEventListener('message', aoReceber);
    if (contextoEsperado?.unidade === opcoes.unidadeEsperada && contextoEsperado?.semana === opcoes.semanaEsperada) {
      contextoEsperado = null;
      ultimaEvidencia = null;
    }
  };
}
