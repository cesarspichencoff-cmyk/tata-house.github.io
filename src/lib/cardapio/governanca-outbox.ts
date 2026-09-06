'use client';

/**
 * TATÁ House × Governança — contrato local/offline-first.
 *
 * Esta camada NÃO conhece Supabase, HTTP, RPC ou qualquer outro transporte.
 * O House registra aqui somente o que precisa atravessar a fronteira para a
 * Governança. Um adaptador de transporte poderá consumir a outbox na última
 * fase da integração sem mudar a regra de negócio nem a tela /avaliar.
 */

export const CONTRATO_GOVERNANCA = 'tata-house-governanca' as const;
export const VERSAO_CONTRATO_GOVERNANCA = 1 as const;

const CHAVE_OUTBOX = 'tata.governanca.outbox.v1';
const LIMITE_COMENTARIO = 1000;

export type VotoGovernanca = 'bom' | 'ok' | 'ruim';

export interface EventoAvaliacaoGovernancaV1 {
  id: string;
  tipo: 'avaliacao.prato';
  origem: 'tata-house';
  criadoEm: string;
  data: string;
  unidade: string;
  prato: string;
  voto: VotoGovernanca;
  comentario?: string;
}

export interface PacoteGovernancaV1 {
  contrato: typeof CONTRATO_GOVERNANCA;
  versao: typeof VERSAO_CONTRATO_GOVERNANCA;
  exportadoEm: string;
  eventos: EventoAvaliacaoGovernancaV1[];
}

export interface NovaAvaliacaoGovernanca {
  data: Date;
  prato: string;
  voto: VotoGovernanca;
  comentario?: string;
  unidade?: string;
}

function storageDisponivel(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function lerFila(storage = storageDisponivel()): EventoAvaliacaoGovernancaV1[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CHAVE_OUTBOX);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(eventoGovernancaValido);
  } catch {
    return [];
  }
}

function gravarFila(fila: EventoAvaliacaoGovernancaV1[], storage = storageDisponivel()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CHAVE_OUTBOX, JSON.stringify(fila));
    return true;
  } catch {
    return false;
  }
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function votoValido(v: unknown): v is VotoGovernanca {
  return v === 'bom' || v === 'ok' || v === 'ruim';
}

function eventoGovernancaValido(v: unknown): v is EventoAvaliacaoGovernancaV1 {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<EventoAvaliacaoGovernancaV1>;
  return Boolean(
    texto(e.id) &&
      e.tipo === 'avaliacao.prato' &&
      e.origem === 'tata-house' &&
      texto(e.criadoEm) &&
      texto(e.data) &&
      texto(e.unidade) &&
      texto(e.prato) &&
      votoValido(e.voto),
  );
}

function idEvento(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback abaixo
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function dataLocalIso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function unidadeHouse(): string {
  return (process.env.NEXT_PUBLIC_TATA_ESPACO ?? '').trim() || 'tata-house';
}

/**
 * Registra um evento para sincronização futura. Não faz rede e não depende de
 * backend. Retorna o evento somente quando a persistência local foi confirmada.
 */
export function registrarAvaliacaoGovernancaPendente(
  entrada: NovaAvaliacaoGovernanca,
): EventoAvaliacaoGovernancaV1 | null {
  const prato = entrada.prato.trim();
  if (!prato) return null;

  const comentario = entrada.comentario?.trim().slice(0, LIMITE_COMENTARIO) || undefined;
  const evento: EventoAvaliacaoGovernancaV1 = {
    id: idEvento(),
    tipo: 'avaliacao.prato',
    origem: 'tata-house',
    criadoEm: new Date().toISOString(),
    data: dataLocalIso(entrada.data),
    unidade: entrada.unidade?.trim() || unidadeHouse(),
    prato,
    voto: entrada.voto,
    ...(comentario ? { comentario } : {}),
  };

  const fila = lerFila();
  if (!gravarFila([...fila, evento])) return null;
  return evento;
}

/** Snapshot imutável das pendências, na ordem em que foram registradas. */
export function listarPendenciasGovernanca(): EventoAvaliacaoGovernancaV1[] {
  return lerFila().map((evento) => ({ ...evento }));
}

/**
 * Remove somente IDs explicitamente confirmados pelo futuro transporte.
 * Isso torna a sincronização idempotente: falha parcial nunca limpa a fila toda.
 */
export function confirmarEventosGovernanca(idsConfirmados: readonly string[]): number {
  if (idsConfirmados.length === 0) return 0;
  const ids = new Set(idsConfirmados);
  const atual = lerFila();
  const restante = atual.filter((evento) => !ids.has(evento.id));
  const removidos = atual.length - restante.length;
  if (removidos === 0) return 0;
  return gravarFila(restante) ? removidos : 0;
}

/**
 * Pacote portátil para teste, auditoria, importação manual ou transporte futuro.
 * A geração não altera a outbox.
 */
export function criarPacoteGovernanca(): PacoteGovernancaV1 {
  return {
    contrato: CONTRATO_GOVERNANCA,
    versao: VERSAO_CONTRATO_GOVERNANCA,
    exportadoEm: new Date().toISOString(),
    eventos: listarPendenciasGovernanca(),
  };
}
