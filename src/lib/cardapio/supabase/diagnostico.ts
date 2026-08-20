'use client';

/* =====================================================================
   Diagnóstico da nuvem — responde, em português claro, à única pergunta
   que importa quando algo "some": ESTE aparelho está mesmo conversando
   com a nuvem, ou está trabalhando sozinho achando que sincroniza?

   Por que isso existe: até aqui, quando a nuvem estava desconfigurada ou
   recusando acesso, o app não dizia NADA — seguia gravando só no próprio
   aparelho. Cada celular virava uma ilha, e ninguém percebia até um dado
   "sumir" (ou até alguém limpar os dados do aparelho e perder tudo).
   Diagnosticar isso exigia abrir painel do Supabase; agora é um botão.

   Segurança: a chave anônima NUNCA é exibida — só dizemos se existe e
   quantos caracteres tem. O endereço mostra apenas o domínio.
   ===================================================================== */

import { supabaseConfig, supabaseHabilitado, ESPACO_DADOS, PREFIXO_LOCAL } from './config';
import { getSupabase } from './client';

const TABELA = 'tata_estado';
const CHAVE_TESTE = '__diagnostico';

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

/** Traduz o erro cru do Supabase para uma explicação acionável. */
function explicar(erro: unknown): string {
  const e = (erro ?? {}) as { message?: string; code?: string; details?: string; hint?: string };
  const msg = (e.message ?? String(erro ?? '')).trim();
  const code = e.code ?? '';
  const baixo = msg.toLowerCase();

  if (baixo.includes('invalid api key') || baixo.includes('jwt') || baixo.includes('apikey')) {
    return `A chave de acesso da nuvem não é aceita (${msg}). A chave publicada no site está diferente da que o Supabase espera — normalmente porque a chave foi trocada/renovada no painel e o site não foi republicado.`;
  }
  if (code === '42P01' || baixo.includes('does not exist') || baixo.includes('not find the table')) {
    return `A tabela "${TABELA}" não foi encontrada no banco (${msg}). O banco está no ar, mas sem a tabela que guarda os dados.`;
  }
  if (code === '42501' || baixo.includes('row-level security') || baixo.includes('permission denied')) {
    return `O banco recusou o acesso por regra de segurança (${msg}). A tabela existe, mas a permissão para a chave pública foi fechada — é o que acontece se a seção "OPCIONAL" da migração de segurança tiver sido executada.`;
  }
  if (baixo.includes('failed to fetch') || baixo.includes('networkerror') || baixo.includes('load failed')) {
    return `Não houve resposta da nuvem (${msg}). Ou este aparelho está sem internet, ou o projeto do Supabase está pausado/fora do ar.`;
  }
  return msg || 'Erro sem mensagem.';
}

function contarChavesLocais(): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIXO_LOCAL) && !k.startsWith(PREFIXO_LOCAL + '__')) n++;
  }
  return n;
}

export async function rodarDiagnostico(): Promise<ResultadoDiagnostico> {
  const itens: ItemDiagnostico[] = [];
  const local = contarChavesLocais();

  // ---------- 1) Este site foi publicado com a nuvem configurada? ----------
  const { url, anonKey } = supabaseConfig();
  if (!supabaseHabilitado()) {
    itens.push({
      titulo: 'Configuração da nuvem neste site',
      veredito: 'falha',
      detalhe:
        `A nuvem NÃO está configurada nesta versão publicada do site` +
        `${url ? '' : ' (falta o endereço)'}${anonKey ? '' : ' (falta a chave de acesso)'}. ` +
        `Sem isso o app funciona só neste aparelho: nada é enviado nem recebido, ` +
        `e cada pessoa enxerga apenas o que ela mesma digitou. ` +
        `Correção: preencher os segredos SUPABASE_URL e SUPABASE_ANON_KEY no GitHub e publicar de novo.`,
    });
    itens.push({
      titulo: 'Dados guardados neste aparelho',
      veredito: local > 0 ? 'aviso' : 'falha',
      detalhe:
        `${local} item(ns) salvos localmente. Como a nuvem está desligada, eles existem SÓ aqui — ` +
        `limpar os dados do navegador apaga tudo de forma definitiva.`,
    });
    return {
      itens,
      vereditoGeral: 'falha',
      resumo: 'A nuvem está desligada nesta versão do site. O app está funcionando isolado neste aparelho.',
    };
  }

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* mantém como veio */
  }
  itens.push({
    titulo: 'Configuração da nuvem neste site',
    veredito: 'ok',
    detalhe: `Endereço: ${host} · chave de acesso presente (${anonKey.length} caracteres) · espaço de dados: "${ESPACO_DADOS}".`,
  });

  // ---------- 2) O cliente da nuvem inicializa? ----------
  const sb = await getSupabase();
  if (!sb) {
    itens.push({
      titulo: 'Conexão com a nuvem',
      veredito: 'falha',
      detalhe: 'O app não conseguiu iniciar a conexão com a nuvem, mesmo com o endereço configurado.',
    });
    return { itens, vereditoGeral: 'falha', resumo: 'Não foi possível iniciar a conexão com a nuvem.' };
  }

  // ---------- 3) LEITURA: consegue enxergar o que está lá? ----------
  let chavesNaNuvem: string[] | null = null;
  try {
    const res = (await sb.from(TABELA).select('chave').eq('espaco', ESPACO_DADOS)) as {
      data: { chave: string }[] | null;
      error: unknown;
    };
    if (res.error) {
      itens.push({ titulo: 'Leitura da nuvem', veredito: 'falha', detalhe: explicar(res.error) });
    } else {
      chavesNaNuvem = (res.data ?? []).map((r) => r.chave);
      const semanas = chavesNaNuvem.filter((c) => c.startsWith('semana.')).length;
      itens.push({
        titulo: 'Leitura da nuvem',
        veredito: chavesNaNuvem.length > 0 ? 'ok' : 'aviso',
        detalhe:
          chavesNaNuvem.length > 0
            ? `Funcionou. A nuvem tem ${chavesNaNuvem.length} item(ns), sendo ${semanas} semana(s) de cardápio.`
            : 'A leitura funcionou, mas a nuvem está VAZIA — nunca chegou dado nenhum lá, ou o conteúdo foi apagado.',
      });
    }
  } catch (e) {
    itens.push({ titulo: 'Leitura da nuvem', veredito: 'falha', detalhe: explicar(e) });
  }

  // ---------- 4) ESCRITA: consegue gravar de verdade? ----------
  try {
    const carimbo = new Date().toISOString();
    const res = (await sb.from(TABELA).upsert(
      { espaco: ESPACO_DADOS, chave: CHAVE_TESTE, valor: { teste: carimbo }, atualizado_em: carimbo },
      { onConflict: 'espaco,chave' },
    )) as { error: unknown };
    if (res.error) {
      itens.push({ titulo: 'Gravação na nuvem', veredito: 'falha', detalhe: explicar(res.error) });
    } else {
      itens.push({
        titulo: 'Gravação na nuvem',
        veredito: 'ok',
        detalhe: 'Funcionou. Este aparelho consegue enviar dados para a nuvem.',
      });
      // Limpa o registro de teste — não deixa sujeira no banco.
      try {
        await sb.from(TABELA).delete().eq('espaco', ESPACO_DADOS).eq('chave', CHAVE_TESTE);
      } catch {
        /* sobra um registro de teste inofensivo */
      }
    }
  } catch (e) {
    itens.push({ titulo: 'Gravação na nuvem', veredito: 'falha', detalhe: explicar(e) });
  }

  // ---------- 5) Comparação local × nuvem ----------
  if (chavesNaNuvem !== null) {
    const faltando = chavesNaNuvem.length === 0 && local > 0;
    itens.push({
      titulo: 'Este aparelho × nuvem',
      veredito: faltando ? 'falha' : 'ok',
      detalhe: `Neste aparelho: ${local} item(ns). Na nuvem: ${chavesNaNuvem.length} item(ns).` +
        (faltando ? ' Os dados existem só aqui — nunca subiram.' : ''),
    });
  }

  const houveFalha = itens.some((i) => i.veredito === 'falha');
  const houveAviso = itens.some((i) => i.veredito === 'aviso');
  return {
    itens,
    vereditoGeral: houveFalha ? 'falha' : houveAviso ? 'aviso' : 'ok',
    resumo: houveFalha
      ? 'Encontrei um problema que impede a sincronização. Veja o item marcado em vermelho.'
      : houveAviso
        ? 'A conexão funciona, mas há um ponto de atenção.'
        : 'Tudo certo: este aparelho lê e grava na nuvem normalmente.',
  };
}

/** Texto simples para a pessoa copiar e mandar para quem dá suporte. */
export function formatarDiagnostico(r: ResultadoDiagnostico): string {
  const marca = (v: Veredito) => (v === 'ok' ? '[OK]' : v === 'aviso' ? '[ATENÇÃO]' : '[FALHA]');
  return [
    `DIAGNÓSTICO TATÁ HOUSE — ${new Date().toLocaleString('pt-BR')}`,
    `Resumo: ${r.resumo}`,
    '',
    ...r.itens.map((i) => `${marca(i.veredito)} ${i.titulo}\n${i.detalhe}`),
  ].join('\n');
}
