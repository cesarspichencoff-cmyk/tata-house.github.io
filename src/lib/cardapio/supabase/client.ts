'use client';

/* =====================================================================
   Cliente Supabase carregado via dynamic import padrão. O bundler inclui
   o pacote no build, mas ele só é instanciado quando as variáveis de
   ambiente estiverem definidas. Sem elas, getSupabase() retorna null e
   o app segue em localStorage.

   Para ativar, defina no repositório (Settings → Secrets / Variables):
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
   ===================================================================== */

import { supabaseConfig, supabaseHabilitado } from './config';

/**
 * Tipo mínimo do que usamos — espelha a API pública do supabase-js.
 * O builder é encadeável e "awaitável" (PromiseLike), como o do supabase-js.
 */
export interface ConsultaSupabase extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols?: string): ConsultaSupabase;
  upsert(linhas: unknown, opc?: unknown): ConsultaSupabase;
  delete(): ConsultaSupabase;
  eq(col: string, val: unknown): ConsultaSupabase;
  /** Faz a query rejeitar (em vez de resolver com `{ error }`) quando o
     Postgres/RLS recusa — sem isso um bloqueio de permissão passa como
     "sucesso"/"vazio" para quem só olha `data`. */
  throwOnError(): ConsultaSupabase;
}

export interface ClienteSupabase {
  from(tabela: string): ConsultaSupabase;
  auth: unknown;
}

let cache: ClienteSupabase | null | undefined;

/** Devolve um cliente Supabase memoizado, ou null se desligado/indisponível. */
export async function getSupabase(): Promise<ClienteSupabase | null> {
  if (cache !== undefined) return cache;
  if (!supabaseHabilitado()) {
    cache = null;
    return null;
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { url, anonKey } = supabaseConfig();
    cache = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    }) as unknown as ClienteSupabase;
    return cache;
  } catch (e) {
    console.warn('[supabase] falha ao inicializar — seguindo em localStorage.', e);
    cache = null;
    return null;
  }
}

/** Limpa o cache do cliente (útil em testes / troca de credencial). */
export function resetSupabase() {
  cache = undefined;
}
