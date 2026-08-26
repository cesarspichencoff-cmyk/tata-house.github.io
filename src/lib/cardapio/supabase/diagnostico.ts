'use client';

import {
  CHAVE_AUDITORIA_V2,
  CHAVE_HISTORICO_V2,
  ehChaveEstadoGrande,
} from '../estado-grande-merge';
import { serializarCanonico } from '../sync-util';
import { supabaseConfig, supabaseHabilitado, ESPACO_DADOS, PREFIXO_LOCAL } from './config';
import { getSupabase } from './client';

const TABELA = 'tata_estado';
const CHAVE_TESTE = '__diagnostico';
const LOCAIS_APENAS = new Set(['cotacao.texto', 'groq.key']);

export type Veredito = 'ok' | 'falha' | 'aviso';

export interface ItemDiagnostico {
  titulo: string;
  veredito: Veredito;
  detalhe: string;
}

export interface ResultadoDiagnostico {
  itens: ItemDiagnostico[];
  resumo: string;
  vereditoGeral: Veredito;
}

interface MedidaLocal {
  valores: Map<string, string>;
  totalBytes: number;
  maiores: { chave: string; bytes: number }[];
}

function explicar(erro: unknown): string {
  const e = (erro ?? {}) as { message?: string; code?: string };
  const msg = (e.message ?? String(erro ?? '')).trim();
  const code = e.code ?? '';
  const baixo = msg.toLowerCase();

  if (baixo.includes('invalid api key') || baixo.includes('jwt') || baixo.includes('apikey')) {
    return `A chave de acesso da nuvem não é aceita (${msg}).`;
  }
  if (code === '42P01' || baixo.includes('does not exist') || baixo.includes('not find the table')) {
    return `A tabela "${TABELA}" não foi encontrada (${msg}).`;
  }
  if (code === '42501' || baixo.includes('row-level security') || baixo.includes('permission denied')) {
    return `O banco recusou o acesso por regra de segurança (${msg}).`;
  }
  if (baixo.includes('failed to fetch') || baixo.includes('networkerror') || baixo.includes('load failed')) {
    return `Não houve resposta da nuvem (${msg}).`;
  }
  return msg || 'Erro sem mensagem.';
}

function bytesDe(texto: string): number {
  try {
    return new TextEncoder().encode(texto).byteLength;
  } catch {
    return texto.length * 2;
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function medirLocal(): MedidaLocal {
  const valores = new Map<string, string>();
  const tamanhos: { chave: string; bytes: number }[] = [];
  let totalBytes = 0;

  if (typeof window === 'undefined') return { valores, totalBytes, maiores: [] };

  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i);
    if (!full || !full.startsWith(PREFIXO_LOCAL)) continue;
    const chave = full.slice(PREFIXO_LOCAL.length);
    if (chave.startsWith('__')) continue;
    const raw = localStorage.getItem(full) ?? '';
    const bytes = bytesDe(full) + bytesDe(raw);
    valores.set(chave, raw);
    tamanhos.push({ chave, bytes });
    totalBytes += bytes;
  }

  tamanhos.sort((a, b) => b.bytes - a.bytes);
  return { valores, totalBytes, maiores: tamanhos.slice(0, 7) };
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function comparavel(chave: string): boolean {
  return !chave.startsWith('__') && !LOCAIS_APENAS.has(chave) && !ehChaveEstadoGrande(chave);
}

export async function rodarDiagnostico(): Promise<ResultadoDiagnostico> {
  const itens: ItemDiagnostico[] = [];
  const local = medirLocal();
  const { url, anonKey } = supabaseConfig();

  itens.push({
    titulo: 'Armazenamento deste aparelho',
    veredito: local.totalBytes > 4 * 1024 * 1024 ? 'aviso' : 'ok',
    detalhe:
      `${local.valores.size} chave(s) · ${fmtBytes(local.totalBytes)} no localStorage. ` +
      (local.maiores.length
        ? `Maiores: ${local.maiores.map((x) => `${x.chave} (${fmtBytes(x.bytes)})`).join(', ')}.`
        : 'Nenhuma chave local.'),
  });

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const e = await navigator.storage.estimate();
      if (typeof e.usage === 'number' && typeof e.quota === 'number' && e.quota > 0) {
        itens.push({
          titulo: 'Quota total do navegador',
          veredito: e.usage / e.quota > 0.8 ? 'aviso' : 'ok',
          detalhe: `${fmtBytes(e.usage)} usados de aproximadamente ${fmtBytes(e.quota)} disponíveis para este site (inclui IndexedDB/cache, não só localStorage).`,
        });
      }
    } catch { /* opcional */ }
  }

  if (!supabaseHabilitado()) {
    itens.push({
      titulo: 'Configuração da nuvem neste site',
      veredito: 'falha',
      detalhe: `A nuvem não está configurada${url ? '' : ' (falta endereço)'}${anonKey ? '' : ' (falta chave)'}.`,
    });
    return {
      itens,
      vereditoGeral: 'falha',
      resumo: 'A nuvem está desligada nesta versão do site.',
    };
  }

  let host = url;
  try { host = new URL(url).host; } catch { /* mantém */ }
  itens.push({
    titulo: 'Configuração da nuvem neste site',
    veredito: 'ok',
    detalhe: `Endereço: ${host} · chave presente (${anonKey.length} caracteres) · espaço "${ESPACO_DADOS}".`,
  });

  const sb = await getSupabase();
  if (!sb) {
    itens.push({ titulo: 'Conexão com a nuvem', veredito: 'falha', detalhe: 'O cliente Supabase não inicializou.' });
    return { itens, vereditoGeral: 'falha', resumo: 'Não foi possível iniciar a conexão com a nuvem.' };
  }

  let linhas: { chave: string; valor: unknown; atualizado_em?: string }[] | null = null;
  try {
    const res = (await sb
      .from(TABELA)
      .select('chave,valor,atualizado_em')
      .eq('espaco', ESPACO_DADOS)) as {
        data: { chave: string; valor: unknown; atualizado_em?: string }[] | null;
        error: unknown;
      };
    if (res.error) throw res.error;
    linhas = res.data ?? [];
    itens.push({
      titulo: 'Leitura da nuvem',
      veredito: linhas.length > 0 ? 'ok' : 'aviso',
      detalhe: `Funcionou. A nuvem tem ${linhas.length} chave(s).`,
    });
  } catch (e) {
    itens.push({ titulo: 'Leitura da nuvem', veredito: 'falha', detalhe: explicar(e) });
  }

  try {
    const carimbo = new Date().toISOString();
    const res = (await sb.from(TABELA).upsert(
      { espaco: ESPACO_DADOS, chave: CHAVE_TESTE, valor: { teste: carimbo }, atualizado_em: carimbo },
      { onConflict: 'espaco,chave' },
    )) as { error: unknown };
    if (res.error) throw res.error;
    itens.push({ titulo: 'Gravação na nuvem', veredito: 'ok', detalhe: 'Funcionou. Este aparelho consegue gravar no Supabase.' });
    try { await sb.from(TABELA).delete().eq('espaco', ESPACO_DADOS).eq('chave', CHAVE_TESTE); } catch { /* inofensivo */ }
  } catch (e) {
    itens.push({ titulo: 'Gravação na nuvem', veredito: 'falha', detalhe: explicar(e) });
  }

  if (linhas) {
    const remoto = new Map(linhas.map((r) => [r.chave, r.valor]));
    const localComp = new Set(Array.from(local.valores.keys()).filter(comparavel));
    const remotoComp = new Set(Array.from(remoto.keys()).filter(comparavel));

    const soLocal = Array.from(localComp).filter((k) => !remotoComp.has(k));
    const soNuvem = Array.from(remotoComp).filter((k) => !localComp.has(k));
    const divergentes: string[] = [];

    for (const k of Array.from(localComp)) {
      if (!remotoComp.has(k)) continue;
      const l = parseJson(local.valores.get(k) ?? '');
      const r = remoto.get(k);
      if (serializarCanonico(l) !== serializarCanonico(r)) divergentes.push(k);
    }

    const ok = soLocal.length === 0 && soNuvem.length === 0 && divergentes.length === 0;
    itens.push({
      titulo: 'Integridade aparelho × nuvem',
      veredito: ok ? 'ok' : 'aviso',
      detalhe: ok
        ? `As ${localComp.size} chaves operacionais comparáveis têm o mesmo conteúdo nos dois lados.`
        : `Só local: ${soLocal.join(', ') || 'nenhuma'} · só nuvem: ${soNuvem.join(', ') || 'nenhuma'} · conteúdo diferente: ${divergentes.join(', ') || 'nenhum'}.`,
    });

    const temAudV2 = remoto.has(CHAVE_AUDITORIA_V2);
    const temHistV2 = remoto.has(CHAVE_HISTORICO_V2);
    const legadoAudLocal = local.valores.has('auditoria');
    const legadoHistLocal = local.valores.has('historicoPrecos');
    itens.push({
      titulo: 'Estados grandes (quota)',
      veredito: temAudV2 && temHistV2 && !legadoAudLocal && !legadoHistLocal ? 'ok' : 'aviso',
      detalhe:
        `auditoria.v2: ${temAudV2 ? 'na nuvem' : 'ausente'} · historicoPrecos.v2: ${temHistV2 ? 'na nuvem' : 'ausente'} · ` +
        `legado local: auditoria ${legadoAudLocal ? 'presente' : 'removida'}, histórico ${legadoHistLocal ? 'presente' : 'removido'}.`,
    });
  }

  const houveFalha = itens.some((i) => i.veredito === 'falha');
  const houveAviso = itens.some((i) => i.veredito === 'aviso');
  return {
    itens,
    vereditoGeral: houveFalha ? 'falha' : houveAviso ? 'aviso' : 'ok',
    resumo: houveFalha
      ? 'Há uma falha real de sincronização.'
      : houveAviso
        ? 'A conexão funciona, mas há divergência ou migração ainda pendente.'
        : 'Tudo certo: armazenamento e conteúdo estão coerentes com a nuvem.',
  };
}

export function formatarDiagnostico(r: ResultadoDiagnostico): string {
  const marca = (v: Veredito) => (v === 'ok' ? '[OK]' : v === 'aviso' ? '[ATENÇÃO]' : '[FALHA]');
  return [
    `DIAGNÓSTICO TATÁ HOUSE — ${new Date().toLocaleString('pt-BR')}`,
    `Resumo: ${r.resumo}`,
    '',
    ...r.itens.map((i) => `${marca(i.veredito)} ${i.titulo}\n${i.detalhe}`),
  ].join('\n');
}
