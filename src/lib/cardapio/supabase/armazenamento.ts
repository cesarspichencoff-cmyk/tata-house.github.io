'use client';

import { gravarComRecuperacaoDeQuota } from '../armazenamento-local-seguro';
import { definirArmazenamentoLocalCheio } from '../aviso-armazenamento';
import {
  CHAVE_AUDITORIA_V2,
  CHAVE_HISTORICO_V2,
  ehAuditoriaV2,
  ehHistoricoV2,
  mesclarAuditoria,
  mesclarHistorico,
} from '../estado-grande-merge';
import {
  gravarMescladoComCas,
  type RegistroVersionado,
  type VersaoRemota,
} from '../estado-grande-cas';
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

interface ConsultaCas extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols?: string): ConsultaCas;
  insert(linhas: unknown): ConsultaCas;
  update(linhas: unknown): ConsultaCas;
  eq(col: string, val: unknown): ConsultaCas;
  is(col: string, val: unknown): ConsultaCas;
  throwOnError(): ConsultaCas;
}

function marcadorNovo(anterior: string | null): string {
  const agora = Date.now();
  const candidato = new Date(agora).toISOString();
  return candidato === anterior ? new Date(agora + 1).toISOString() : candidato;
}

async function lerEstadoGrandeVersionado(
  chave: string,
): Promise<RegistroVersionado<unknown>> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cliente Supabase indisponível');

  const consulta = sb.from(TABELA) as unknown as ConsultaCas;
  const res = (await consulta
    .select('valor, atualizado_em')
    .eq('espaco', ESPACO_DADOS)
    .eq('chave', chave)
    .throwOnError()) as {
    data: { valor: unknown; atualizado_em: string | null }[] | null;
  };

  const linha = res.data?.[0];
  return linha
    ? {
        existe: true,
        valor: linha.valor,
        atualizadoEm: linha.atualizado_em ?? null,
      }
    : { existe: false, valor: null, atualizadoEm: null };
}

async function tentarGravarEstadoGrande(
  chave: string,
  valor: unknown,
  versaoEsperada: VersaoRemota,
): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cliente Supabase indisponível');

  const atualizadoEm = marcadorNovo(versaoEsperada.atualizadoEm);
  const linha = {
    espaco: ESPACO_DADOS,
    chave,
    valor,
    atualizado_em: atualizadoEm,
  };

  if (!versaoEsperada.existe) {
    try {
      const consulta = sb.from(TABELA) as unknown as ConsultaCas;
      const res = (await consulta
        .insert(linha)
        .select('atualizado_em')
        .throwOnError()) as { data: { atualizado_em: string }[] | null };
      return (res.data?.length ?? 0) > 0;
    } catch (erro) {
      // Outro cliente pode ter criado a chave entre a leitura e o INSERT.
      // Só tratamos como corrida quando a releitura confirma a linha; erro de
      // rede/permissão continua subindo e mantém a alteração pendente.
      const atual = await lerEstadoGrandeVersionado(chave);
      if (atual.existe) return false;
      throw erro;
    }
  }

  const tabela = sb.from(TABELA) as unknown as ConsultaCas;
  let consulta = tabela
    .update({ valor, atualizado_em: atualizadoEm })
    .eq('espaco', ESPACO_DADOS)
    .eq('chave', chave);

  consulta =
    versaoEsperada.atualizadoEm === null
      ? consulta.is('atualizado_em', null)
      : consulta.eq('atualizado_em', versaoEsperada.atualizadoEm);

  const res = (await consulta
    .select('atualizado_em')
    .throwOnError()) as { data: { atualizado_em: string }[] | null };

  // Zero linhas = outro cliente mudou a versão depois da nossa leitura.
  return (res.data?.length ?? 0) === 1;
}

async function gravarEstadoGrandeComCas(chave: string, valor: unknown): Promise<void> {
  if (chave === CHAVE_AUDITORIA_V2) {
    if (!ehAuditoriaV2(valor)) {
      throw new Error('Auditoria v2 local inválida; escrita bloqueada');
    }
    await gravarMescladoComCas(
      valor,
      () => lerEstadoGrandeVersionado(chave),
      (combinado, versao) => tentarGravarEstadoGrande(chave, combinado, versao),
      ehAuditoriaV2,
      mesclarAuditoria,
    );
    return;
  }

  if (chave === CHAVE_HISTORICO_V2) {
    if (!ehHistoricoV2(valor)) {
      throw new Error('Histórico v2 local inválido; escrita bloqueada');
    }
    await gravarMescladoComCas(
      valor,
      () => lerEstadoGrandeVersionado(chave),
      (combinado, versao) => tentarGravarEstadoGrande(chave, combinado, versao),
      ehHistoricoV2,
      mesclarHistorico,
    );
    return;
  }

  throw new Error(`Chave de estado grande sem política CAS: ${chave}`);
}

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

    if (chave === CHAVE_AUDITORIA_V2 || chave === CHAVE_HISTORICO_V2) {
      await gravarEstadoGrandeComCas(chave, valor);
      return;
    }

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
