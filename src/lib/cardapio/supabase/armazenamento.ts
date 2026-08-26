'use client';

import { gravarComRecuperacaoDeQuota } from '../armazenamento-local-seguro';
import { definirArmazenamentoLocalCheio } from '../aviso-armazenamento';
import { ESPACO_DADOS, PREFIXO_LOCAL, supabaseHabilitado } from './config';
import { getSupabase } from './client';

export interface Armazenamento {
  ler<T>(chave: string, padrao: T): Promise<T>;
  gravar(chave: string, valor: unknown): Promise<void>;
  remover(chave: string): Promise<void>;
  listarChaves(): Promise<string[]>;
}

export const armazenamentoLocal: Armazenamento = {
  async ler<T>(chave: string, padrao: T): Promise<T> {
    if (typeof window === 'undefined') return padrao;
    try {
      const raw = localStorage.getItem(PREFIXO_LOCAL + chave);
      return raw ? (JSON.parse(raw) as T) : padrao;
    } catch {
      return padrao;
    }
  },

  async gravar(chave: string, valor: unknown): Promise<void> {
    if (typeof window === 'undefined') return;
    const resultado = gravarComRecuperacaoDeQuota(
      localStorage,
      PREFIXO_LOCAL + chave,
      JSON.stringify(valor),
    );
    definirArmazenamentoLocalCheio(!resultado.ok);
  },

  async remover(chave: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(PREFIXO_LOCAL + chave);
    } catch {
      /* ignore */
    }
  },

  async listarChaves(): Promise<string[]> {
    if (typeof window === 'undefined') return [];
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO_LOCAL)) out.push(k.slice(PREFIXO_LOCAL.length));
    }
    return out;
  },
};

const TABELA = 'tata_estado';

export const armazenamentoSupabase: Armazenamento = {
  async ler<T>(chave: string, padrao: T): Promise<T> {
    const sb = await getSupabase();
    if (!sb) return padrao;

    // IMPORTANTE: erro de leitura NÃO é ausência de chave. A exceção sobe
    // para o BootNuvem abortar a reconciliação e mostrar falha real.
    const res = (await sb
      .from(TABELA)
      .select('valor')
      .eq('espaco', ESPACO_DADOS)
      .eq('chave', chave)
      .throwOnError()) as { data: { valor: T }[] | null };

    const linha = res.data?.[0];
    return linha ? linha.valor : padrao;
  },

  async gravar(chave: string, valor: unknown): Promise<void> {
    const sb = await getSupabase();
    if (!sb) throw new Error('Cliente Supabase indisponível');
    await sb
      .from(TABELA)
      .upsert(
        { espaco: ESPACO_DADOS, chave, valor, atualizado_em: new Date().toISOString() },
        { onConflict: 'espaco,chave' },
      )
      .throwOnError();
  },

  async remover(chave: string): Promise<void> {
    const sb = await getSupabase();
    if (!sb) throw new Error('Cliente Supabase indisponível');
    await sb.from(TABELA).delete().eq('espaco', ESPACO_DADOS).eq('chave', chave).throwOnError();
  },

  async listarChaves(): Promise<string[]> {
    const sb = await getSupabase();
    if (!sb) throw new Error('Cliente Supabase indisponível');
    const res = (await sb
      .from(TABELA)
      .select('chave')
      .eq('espaco', ESPACO_DADOS)
      .throwOnError()) as { data: { chave: string }[] | null };
    return (res.data ?? []).map((r) => r.chave);
  },
};

export function armazenamentoAtivo(): Armazenamento {
  return supabaseHabilitado() ? armazenamentoSupabase : armazenamentoLocal;
}
