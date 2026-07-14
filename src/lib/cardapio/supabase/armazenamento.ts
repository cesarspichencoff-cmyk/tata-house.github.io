'use client';

/* =====================================================================
   Abstração de armazenamento (chave → valor JSON). Hoje o app usa o
   localStorage; esta camada dá um caminho único para, no futuro, ler/gravar
   no Supabase sem reescrever as telas. A migração espelha exatamente as
   chaves do localStorage numa tabela KV (tata_estado), o jeito mais fiel e
   de menor risco de transpor o protótipo.
   ===================================================================== */

import { ESPACO_DADOS, PREFIXO_LOCAL, supabaseHabilitado } from './config';
import { getSupabase } from './client';

export interface Armazenamento {
  ler<T>(chave: string, padrao: T): Promise<T>;
  gravar(chave: string, valor: unknown): Promise<void>;
  remover(chave: string): Promise<void>;
  /** Todas as chaves (sem o prefixo) deste espaço. */
  listarChaves(): Promise<string[]>;
}

/* ----------------------------- localStorage ----------------------------- */

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
    try {
      localStorage.setItem(PREFIXO_LOCAL + chave, JSON.stringify(valor));
    } catch {
      /* armazenamento indisponível */
    }
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

/* ------------------------------ Supabase KV ----------------------------- */

const TABELA = 'tata_estado';

export const armazenamentoSupabase: Armazenamento = {
  async ler<T>(chave: string, padrao: T): Promise<T> {
    const sb = await getSupabase();
    if (!sb) return padrao;
    try {
      const res = (await sb
        .from(TABELA)
        .select('valor')
        .eq('espaco', ESPACO_DADOS)
        .eq('chave', chave)) as { data: { valor: T }[] | null };
      const linha = res.data?.[0];
      return linha ? linha.valor : padrao;
    } catch {
      return padrao;
    }
  },
  async gravar(chave: string, valor: unknown): Promise<void> {
    const sb = await getSupabase();
    if (!sb) return;
    try {
      await sb.from(TABELA).upsert(
        { espaco: ESPACO_DADOS, chave, valor, atualizado_em: new Date().toISOString() },
        { onConflict: 'espaco,chave' },
      );
    } catch {
      /* falha silenciosa — o local continua sendo a fonte de verdade */
    }
  },
  async remover(chave: string): Promise<void> {
    const sb = await getSupabase();
    if (!sb) return;
    try {
      await sb.from(TABELA).delete().eq('espaco', ESPACO_DADOS).eq('chave', chave);
    } catch {
      /* ignore */
    }
  },
  async listarChaves(): Promise<string[]> {
    const sb = await getSupabase();
    if (!sb) return [];
    // IMPORTANTE: não engolir erro aqui devolvendo [] — quem chama (BootNuvem)
    // usa esta lista para decidir quais chaves locais são "lacunas" seguras de
    // empurrar sem merge. Uma falha de rede disfarçada de "nuvem vazia" faria
    // o app achar que TODAS as chaves locais são novas e empurrá-las por cima
    // do que já existe na nuvem, sem conflito nenhum — foi exatamente assim
    // que o cardápio da semana foi sobrescrito em 2026-07-14. Deixa o erro
    // propagar para o chamador abortar a sincronização em vez de arriscar.
    const res = (await sb.from(TABELA).select('chave').eq('espaco', ESPACO_DADOS)) as {
      data: { chave: string }[] | null;
    };
    return (res.data ?? []).map((r) => r.chave);
  },
};

/** Armazenamento ativo conforme a configuração (Supabase se ligado). */
export function armazenamentoAtivo(): Armazenamento {
  return supabaseHabilitado() ? armazenamentoSupabase : armazenamentoLocal;
}
