'use client';

export const GOV_CONTEXTO_V1 = 'tata-house:governanca:contexto:v1' as const;
export const ORIGEM_GOVERNANCA_CONTEXTO_V1 = 'https://lideres.tatasushi.tech' as const;
export const EVENTO_GOVERNANCA_CONTEXTO_V1 = 'tata:governanca-contexto:v1' as const;

const CHAVE_SESSAO = 'tata.governanca.contexto.v1';

export interface ContextoGovernancaV1 {
  versao: 1;
  origem: 'lideres';
  displayName: string;
  perfil: string;
  recebidoEm: string;
}

interface MensagemContextoV1 {
  type?: unknown;
  payload?: unknown;
}

function texto(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function fonteAutorizada(source: MessageEventSource | null): boolean {
  if (typeof window === 'undefined' || !source) return false;
  try {
    if (window.parent !== window && source === window.parent) return true;
  } catch {
    // segue para opener
  }
  try {
    return Boolean(window.opener && source === window.opener);
  } catch {
    return false;
  }
}

/**
 * Converte somente identidade descritiva do TATÁ Plus. Não aceita papel do
 * House, PIN, token, lista de permissões nem qualquer dado que possa elevar
 * privilégio. O contexto serve apenas para continuidade visual/auditoria.
 */
export function normalizarContextoGovernanca(
  origem: string,
  source: MessageEventSource | null,
  dados: unknown,
): ContextoGovernancaV1 | null {
  if (origem !== ORIGEM_GOVERNANCA_CONTEXTO_V1 || !fonteAutorizada(source)) return null;
  if (!dados || typeof dados !== 'object') return null;

  const mensagem = dados as MensagemContextoV1;
  if (mensagem.type !== GOV_CONTEXTO_V1 || !mensagem.payload || typeof mensagem.payload !== 'object') {
    return null;
  }

  const payload = mensagem.payload as Record<string, unknown>;
  const permitidas = new Set(['displayName', 'perfil']);
  if (Object.keys(payload).some((chave) => !permitidas.has(chave))) return null;

  const displayName = texto(payload.displayName, 120);
  const perfil = texto(payload.perfil, 80);
  if (!displayName && !perfil) return null;

  return {
    versao: 1,
    origem: 'lideres',
    displayName,
    perfil,
    recebidoEm: new Date().toISOString(),
  };
}

export function lerContextoGovernanca(): ContextoGovernancaV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHAVE_SESSAO);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContextoGovernancaV1>;
    if (parsed.versao !== 1 || parsed.origem !== 'lideres') return null;
    return {
      versao: 1,
      origem: 'lideres',
      displayName: texto(parsed.displayName, 120),
      perfil: texto(parsed.perfil, 80),
      recebidoEm: texto(parsed.recebidoEm, 80),
    };
  } catch {
    return null;
  }
}

export function instalarContextoGovernanca(): () => void {
  if (typeof window === 'undefined') return () => {};

  const aoReceber = (event: MessageEvent<unknown>) => {
    const contexto = normalizarContextoGovernanca(event.origin, event.source, event.data);
    if (!contexto) return;
    try {
      window.sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(contexto));
    } catch {
      // Contexto é conveniência; falha de storage não afeta autorização.
    }
    window.dispatchEvent(new CustomEvent(EVENTO_GOVERNANCA_CONTEXTO_V1, { detail: contexto }));
  };

  window.addEventListener('message', aoReceber);
  return () => window.removeEventListener('message', aoReceber);
}
