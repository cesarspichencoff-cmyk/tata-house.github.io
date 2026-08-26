'use client';

/* Cliente Supabase singleton por GLOBAL do navegador.
   O cache no módulo não basta quando o Next divide/recarrega chunks: duas
   cópias do módulo podem criar dois GoTrueClient no mesmo contexto. */
import { supabaseConfig, supabaseHabilitado } from './config';

export interface ConsultaSupabase extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols?: string): ConsultaSupabase;
  upsert(linhas: unknown, opc?: unknown): ConsultaSupabase;
  delete(): ConsultaSupabase;
  eq(col: string, val: unknown): ConsultaSupabase;
  throwOnError(): ConsultaSupabase;
}

export interface ClienteSupabase {
  from(tabela: string): ConsultaSupabase;
  auth: unknown;
}

type GlobalTata = typeof globalThis & {
  __tataSupabasePromise?: Promise<ClienteSupabase | null>;
};

function globalTata(): GlobalTata {
  return globalThis as GlobalTata;
}

/** Uma única criação, inclusive quando chamadas simultâneas chegam de chunks diferentes. */
export function getSupabase(): Promise<ClienteSupabase | null> {
  const g = globalTata();
  if (g.__tataSupabasePromise) return g.__tataSupabasePromise;

  if (!supabaseHabilitado()) {
    g.__tataSupabasePromise = Promise.resolve(null);
    return g.__tataSupabasePromise;
  }

  g.__tataSupabasePromise = (async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { url, anonKey } = supabaseConfig();
      return createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      }) as unknown as ClienteSupabase;
    } catch (e) {
      console.warn('[supabase] falha ao inicializar — seguindo sem conexão remota.', e);
      return null;
    }
  })();

  return g.__tataSupabasePromise;
}

/** Testes/troca explícita de configuração. Não é usado no fluxo normal. */
export function resetSupabase() {
  delete globalTata().__tataSupabasePromise;
}
