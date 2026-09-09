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
export const LIMITE_PENDENCIAS_GOVERNANCA = 500 as const;

const CHAVE_OUTBOX = 'tata.governanca.outbox.v1';
const LIMITE_COMENTARIO = 1000;
const DATA_HORA_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CAMPOS_EVENTO = new Set([
  'id',
  'tipo',
  'origem',
  'criadoEm',
  'data',
  'unidade',
  'prato',
  'voto',
  'comentario',
]);

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
    return parsed.filter(eventoGovernancaValido).map((evento) => ({ ...evento }));
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

function eventoGovernancaValido(v: unknown): v is EventoAvaliacaoGovernancaV1 {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const chaves = Object.keys(v);
  if (chaves.some((chave) => !CAMPOS_EVENTO.has(chave))) return false;

  const e = v as Partial<EventoAvaliacaoGovernancaV1>;
  const comentarioValido =
    e.comentario === undefined ||
    (typeof e.comentario === 'string' && e.comentario.length <= LIMITE_COMENTARIO);

  return Boolean(
    texto(e.id) &&
      e.tipo === 'avaliacao.prato' &&
      e.origem === 'tata-house' &&
      dataHoraValida(texto(e.criadoEm)) &&
      dataValida(texto(e.data)) &&
      texto(e.unidade) &&
      texto(e.prato) &&
      votoValido(e.voto) &&
      comentarioValido,
  );
}

function uuidV4Fallback(): string {
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // RFC 4122 v4. O contrato continua aceitando IDs legados já persistidos,
  // mas todo evento NOVO nasce em formato UUID para manter identidade estável
  // entre retries e ser compatível com operation_id do TATÁ OS.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function idEvento(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback UUID abaixo
  }
  return uuidV4Fallback();
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
 *
 * Preservação: a outbox nunca descarta uma pendência antiga para abrir espaço.
 * Ao atingir o teto, a ponte falha fechada e o registro primário do House segue
 * independente em /avaliar.
 */
export function registrarAvaliacaoGovernancaPendente(
  entrada: NovaAvaliacaoGovernanca,
): EventoAvaliacaoGovernancaV1 | null {
  if (Number.isNaN(entrada.data.getTime())) return null;

  const prato = entrada.prato.trim();
  if (!prato) return null;

  const fila = lerFila();
  if (fila.length >= LIMITE_PENDENCIAS_GOVERNANCA) return null;

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

  if (!eventoGovernancaValido(evento)) return null;
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
