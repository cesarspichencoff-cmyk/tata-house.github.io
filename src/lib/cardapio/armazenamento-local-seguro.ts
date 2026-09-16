'use client';

/* =====================================================================
   Recuperação mínima de quota do localStorage.

   Ordem de descarte segura:
   1. histórico __hist.* — snapshots locais de desfazer, opcionais;
   2. cotacao.texto — rascunho bruto da última cotação, também opcional.

   Nunca toca cardápio, preços aplicados, fornecedor, estoque, pendência,
   base de merge, configuração ou qualquer outro dado operacional.
   ===================================================================== */

const PREFIXO_HISTORICO = 'cardapio.v1.__hist.';
const CHAVE_TEXTO_COTACAO = 'cardapio.v1.cotacao.texto';

export function ehErroDeQuota(erro: unknown): boolean {
  // Safari/WebKit normalmente lança DOMException; não podemos depender de
  // `instanceof Error`, porque isso varia entre engines/versões.
  if (erro == null || (typeof erro !== 'object' && typeof erro !== 'function')) return false;

  const info = erro as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
  };

  const nome = typeof info.name === 'string' ? info.name : '';
  const mensagem = typeof info.message === 'string' ? info.message : '';
  const codigo = typeof info.code === 'number' ? info.code : null;

  return (
    nome === 'QuotaExceededError' ||
    nome === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    codigo === 22 ||   // WebKit / DOMException legado
    codigo === 1014 || // Firefox legado
    /quota/i.test(nome) ||
    /quota/i.test(mensagem)
  );
}

/** Remove SOMENTE snapshots locais de desfazer. Nunca toca cardápio, preço,
 * fornecedor, estoque, pendência, base de merge ou configuração. */
export function liberarHistoricosLocais(storage: Storage): number {
  const remover: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const chave = storage.key(i);
      if (chave && chave.startsWith(PREFIXO_HISTORICO)) remover.push(chave);
    }
  } catch {
    return 0;
  }

  for (const chave of remover) {
    try { storage.removeItem(chave); } catch { /* best-effort */ }
  }
  return remover.length;
}

/**
 * A cotação bruta é só conveniência para reabrir o texto que foi colado.
 * Depois que seus preços/ofertas foram aplicados, ela NÃO é dado operacional.
 * Em quota, pode ser descartada antes de qualquer documento real do app.
 *
 * Se a própria gravação que falhou é a do texto da cotação, não removemos o
 * valor anterior aqui: o componente mantém o texto atual em memória e decide
 * sozinho se quer persistir de novo depois.
 */
export function liberarRascunhoCotacaoLocal(storage: Storage, chaveEmGravacao = ''): number {
  if (chaveEmGravacao === CHAVE_TEXTO_COTACAO) return 0;
  try {
    if (storage.getItem(CHAVE_TEXTO_COTACAO) == null) return 0;
    storage.removeItem(CHAVE_TEXTO_COTACAO);
    return 1;
  } catch {
    return 0;
  }
}

export interface ResultadoGravacaoLocal {
  ok: boolean;
  historicosRemovidos: number;
  quota: boolean;
}

/**
 * Tenta a gravação normal. Em QuotaExceededError:
 * 1) remove __hist.* e repete EXATAMENTE a mesma gravação;
 * 2) se ainda não couber, remove o rascunho bruto cotacao.texto e tenta uma
 *    última vez.
 *
 * Não monkey-patcha Storage e não altera o motor de nuvem — cada tentativa
 * continua passando pelo BootNuvem existente e, quando aplicável, é espelhada
 * ao Supabase normalmente. Dados operacionais nunca são descartados para
 * abrir espaço.
 */
export function gravarComRecuperacaoDeQuota(
  storage: Storage,
  chave: string,
  valor: string,
): ResultadoGravacaoLocal {
  try {
    storage.setItem(chave, valor);
    return { ok: true, historicosRemovidos: 0, quota: false };
  } catch (erro) {
    if (!ehErroDeQuota(erro)) {
      return { ok: false, historicosRemovidos: 0, quota: false };
    }

    const historicosRemovidos = liberarHistoricosLocais(storage);

    if (historicosRemovidos > 0) {
      try {
        storage.setItem(chave, valor);
        return { ok: true, historicosRemovidos, quota: true };
      } catch (erroRetry) {
        if (!ehErroDeQuota(erroRetry)) {
          return { ok: false, historicosRemovidos, quota: true };
        }
      }
    }

    const rascunhosRemovidos = liberarRascunhoCotacaoLocal(storage, chave);
    if (rascunhosRemovidos > 0) {
      try {
        storage.setItem(chave, valor);
        return { ok: true, historicosRemovidos, quota: true };
      } catch {
        return { ok: false, historicosRemovidos, quota: true };
      }
    }

    return { ok: false, historicosRemovidos, quota: true };
  }
}
