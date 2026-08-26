'use client';

/* =====================================================================
   Recuperação mínima de quota do localStorage.

   O histórico __hist.* é local-only e opcional. Quando a quota do navegador
   estoura, ele é o primeiro (e único) dado que podemos descartar com segurança
   para priorizar o dado operacional que a pessoa acabou de editar.
   ===================================================================== */

const PREFIXO_HISTORICO = 'cardapio.v1.__hist.';

export function ehErroDeQuota(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  const nome = erro.name;
  return (
    nome === 'QuotaExceededError' ||
    nome === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(nome) ||
    /quota/i.test(erro.message)
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

export interface ResultadoGravacaoLocal {
  ok: boolean;
  historicosRemovidos: number;
  quota: boolean;
}

/**
 * Tenta a gravação normal. Só em QuotaExceededError remove __hist.* e repete
 * EXATAMENTE a mesma gravação uma vez. Não monkey-patcha Storage e não altera
 * o motor de nuvem — portanto a segunda tentativa continua passando pelo
 * BootNuvem já existente e, quando vence, é espelhada ao Supabase normalmente.
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
    if (historicosRemovidos === 0) {
      return { ok: false, historicosRemovidos: 0, quota: true };
    }

    try {
      storage.setItem(chave, valor);
      return { ok: true, historicosRemovidos, quota: true };
    } catch {
      return { ok: false, historicosRemovidos, quota: true };
    }
  }
}
