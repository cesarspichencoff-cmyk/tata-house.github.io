'use client';

/**
 * Ponte TATÁ House × Governança — Fase 1.
 *
 * O House continua funcionando e aprendendo localmente. Quando as variáveis
 * NEXT_PUBLIC_GOVERNANCA_* estão configuradas, esta camada também lê o
 * cardápio público do dia e envia a avaliação para o backend compartilhado
 * do Portal Líderes. Nenhum custo, estoque ou dado interno atravessa a ponte.
 */

export type VotoGovernanca = 'bom' | 'ok' | 'ruim';

export interface CardapioGovernanca {
  data: string;
  unidade: string;
  principal: string;
  guarnicao: string;
  salada: string;
}

export interface AvaliacaoGovernanca {
  data: Date;
  prato: string;
  voto: VotoGovernanca;
  comentario?: string;
}

interface ConfigGovernanca {
  url: string;
  key: string;
  unidade: string;
}

export function configGovernanca(): ConfigGovernanca {
  return {
    url: (process.env.NEXT_PUBLIC_GOVERNANCA_SUPABASE_URL ?? '').replace(/\/$/, ''),
    key:
      process.env.NEXT_PUBLIC_GOVERNANCA_SUPABASE_KEY ??
      process.env.NEXT_PUBLIC_GOVERNANCA_SUPABASE_PUBLISHABLE_KEY ??
      '',
    unidade: (process.env.NEXT_PUBLIC_GOVERNANCA_UNIDADE ?? '').trim(),
  };
}

export function governancaHabilitada(): boolean {
  const c = configGovernanca();
  return Boolean(c.url && c.key && c.unidade);
}

export function dataLocalIso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function headers(c: ConfigGovernanca): HeadersInit {
  const h: Record<string, string> = {
    apikey: c.key,
    'Content-Type': 'application/json',
  };
  // Chaves anon JWT precisam do Bearer. Publishable keys modernas funcionam
  // pelo header apikey e não devem ser tratadas como JWT.
  if (c.key.startsWith('eyJ')) h.Authorization = `Bearer ${c.key}`;
  return h;
}

async function rpc<T>(nome: string, payload: Record<string, unknown>): Promise<T> {
  const c = configGovernanca();
  if (!c.url || !c.key || !c.unidade) throw new Error('Governança não configurada');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(`${c.url}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: headers(c),
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Governança RPC ${nome}: HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Lê somente os campos públicos necessários à tela /avaliar. */
export async function lerCardapioGovernanca(data: Date): Promise<CardapioGovernanca | null> {
  if (!governancaHabilitada()) return null;
  const c = configGovernanca();
  const raw = await rpc<Record<string, unknown>>('house_cardapio_dia', {
    p_data: dataLocalIso(data),
    p_unidade: c.unidade,
  });

  const principal = texto(raw?.principal);
  if (!principal) return null;
  return {
    data: texto(raw?.data) || dataLocalIso(data),
    unidade: texto(raw?.unidade) || c.unidade,
    principal,
    guarnicao: texto(raw?.guarnicao),
    salada: texto(raw?.salada),
  };
}

/**
 * Espelha a avaliação na Governança. A função não substitui o registro local:
 * quem chama deve salvar no House primeiro e tratar falha remota como pendência,
 * nunca como perda do voto do usuário.
 */
export async function enviarAvaliacaoGovernanca(av: AvaliacaoGovernanca): Promise<boolean> {
  if (!governancaHabilitada()) return false;
  const c = configGovernanca();
  const prato = av.prato.trim();
  if (!prato) return false;

  const res = await rpc<{ ok?: boolean }>('house_avaliacao_registrar', {
    p_data: dataLocalIso(av.data),
    p_unidade: c.unidade,
    p_prato: prato,
    p_voto: av.voto,
    p_comentario: av.comentario?.trim() || null,
  });
  return res?.ok === true;
}
