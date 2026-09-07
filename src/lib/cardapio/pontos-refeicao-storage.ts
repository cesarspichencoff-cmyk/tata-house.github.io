'use client';

import {
  PONTOS_REFEICAO,
  conciliarRefeicoesPorPonto,
  normalizarQuantidadeRefeicoes,
  type DistribuicaoRefeicoesPorPonto,
  type PontoRefeicao,
  type QuantidadeRefeicoes,
  type StatusConciliacaoPontos,
} from './pontos-refeicao';

const PREFIXO = 'cardapio.v1.pontosRefeicao.';
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENTO_CHAVE = 'tata:chave-externa';

export interface RegistroPontosRefeicaoDiaV1 {
  versao: 1;
  data: string;
  porPonto: DistribuicaoRefeicoesPorPonto;
  atualizadoEm: string;
}

export interface EstadoPontosRefeicaoDia {
  registro: RegistroPontosRefeicaoDiaV1 | null;
  status: StatusConciliacaoPontos;
  total: QuantidadeRefeicoes;
  distribuido: QuantidadeRefeicoes;
  diferenca: QuantidadeRefeicoes;
}

function storageDisponivel(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function dataValida(data: string): boolean {
  if (!DATA_RE.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function dataHoraValida(valor: string): boolean {
  return Boolean(valor) && !Number.isNaN(Date.parse(valor));
}

function quantidadeValida(valor: unknown): valor is QuantidadeRefeicoes {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const v = valor as Record<string, unknown>;
  if (Object.keys(v).some((k) => !['almoco', 'jantar', 'marmitas'].includes(k))) return false;
  return ['almoco', 'jantar', 'marmitas'].every((k) =>
    typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= 0,
  );
}

export function normalizarRegistroPontosRefeicaoDia(
  entrada: unknown,
): RegistroPontosRefeicaoDiaV1 | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const e = entrada as Record<string, unknown>;
  if (Object.keys(e).some((k) => !['versao', 'data', 'porPonto', 'atualizadoEm'].includes(k))) return null;
  if (e.versao !== 1 || typeof e.data !== 'string' || !dataValida(e.data)) return null;
  if (typeof e.atualizadoEm !== 'string' || !dataHoraValida(e.atualizadoEm)) return null;
  if (!e.porPonto || typeof e.porPonto !== 'object' || Array.isArray(e.porPonto)) return null;

  const bruto = e.porPonto as Record<string, unknown>;
  if (Object.keys(bruto).some((k) => !PONTOS_REFEICAO.includes(k as PontoRefeicao))) return null;

  const porPonto: DistribuicaoRefeicoesPorPonto = {};
  for (const ponto of PONTOS_REFEICAO) {
    const valor = bruto[ponto];
    if (valor === undefined) continue;
    if (!quantidadeValida(valor)) return null;
    porPonto[ponto] = normalizarQuantidadeRefeicoes(valor);
  }

  if (Object.keys(porPonto).length === 0) return null;
  return { versao: 1, data: e.data, porPonto, atualizadoEm: e.atualizadoEm };
}

export function chavePontosRefeicao(data: string): string {
  return `pontosRefeicao.${data}`;
}

export function lerPontosRefeicaoDia(data: string): RegistroPontosRefeicaoDiaV1 | null {
  if (!dataValida(data)) return null;
  const storage = storageDisponivel();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIXO + data);
    return raw ? normalizarRegistroPontosRefeicaoDia(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Salva somente a distribuição explícita. O total tradicional permanece em
 * contagemRefeicoes; esta camada nunca o recalcula nem o sobrescreve.
 *
 * Não existe remoção local isolada neste contrato: o BootNuvem intercepta
 * setItem para sincronizar com Supabase, mas não removeItem. Assim evitamos uma
 * falsa exclusão local que poderia ser ressuscitada pela cópia remota.
 */
export function salvarPontosRefeicaoDia(
  data: string,
  porPonto: DistribuicaoRefeicoesPorPonto,
): RegistroPontosRefeicaoDiaV1 | null {
  if (!dataValida(data)) return null;
  const storage = storageDisponivel();
  if (!storage) return null;

  const registro = normalizarRegistroPontosRefeicaoDia({
    versao: 1,
    data,
    porPonto,
    atualizadoEm: new Date().toISOString(),
  });
  if (!registro) return null;

  try {
    storage.setItem(PREFIXO + data, JSON.stringify(registro));
    return registro;
  } catch {
    return null;
  }
}

export function estadoPontosRefeicaoDia(
  data: string,
  total: QuantidadeRefeicoes,
): EstadoPontosRefeicaoDia {
  const registro = lerPontosRefeicaoDia(data);
  const conciliacao = conciliarRefeicoesPorPonto(total, registro?.porPonto);
  return { registro, ...conciliacao };
}

/**
 * Escuta alterações vindas de outra aba ou do Realtime já aplicado pelo
 * BootNuvem. Retorna unsubscribe e não cria uma segunda infraestrutura de sync.
 */
export function assinarPontosRefeicaoDia(data: string, aoMudar: () => void): () => void {
  if (typeof window === 'undefined' || !dataValida(data)) return () => {};
  const chaveLogica = chavePontosRefeicao(data);
  const chaveStorage = PREFIXO + data;

  const onExterno = (event: Event) => {
    const detalhe = (event as CustomEvent<{ chave?: string }>).detail;
    if (detalhe?.chave === chaveLogica) aoMudar();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === chaveStorage) aoMudar();
  };

  window.addEventListener(EVENTO_CHAVE, onExterno);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENTO_CHAVE, onExterno);
    window.removeEventListener('storage', onStorage);
  };
}
