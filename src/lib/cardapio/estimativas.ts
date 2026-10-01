'use client';

/* =====================================================================
   Estimativas de preço (camada separada do preço real). Persistidas em
   localStorage; geradas pela média de mercado interna e substituíveis a
   qualquer momento pelo preço real da cotação/nota.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { estimarPreco } from './precos';
import { PRECOS_COTACAO_SEED } from './dados-seed';
import type { HistoricoPrecos } from './tipos';

const PREFIXO = 'cardapio.v1.';

function ler<T>(chave: string, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    const raw = localStorage.getItem(PREFIXO + chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível */
  }
}

export function useEstimativas() {
  const [estimativas, setEstimativas] = useState<Record<string, number>>({});

  useEffect(() => {
    // Seeds históricos são referência, nunca preço real confirmado da semana.
    setEstimativas({ ...PRECOS_COTACAO_SEED, ...ler('estimativas', {}) });
  }, []);

  /** Define/atualiza manualmente a estimativa de um item (0/null remove). */
  const definirEstimativa = useCallback((norm: string, valor: number | null) => {
    setEstimativas((atual) => {
      const novo = { ...atual };
      if (!valor || valor <= 0) delete novo[norm];
      else novo[norm] = Math.round(valor * 100) / 100;
      gravar('estimativas', novo);
      return novo;
    });
  }, []);

  /** Gera estimativa de mercado para itens sem preço real e sem estimativa. */
  const gerarEstimativas = useCallback((itens: { norm: string; u?: string }[], precos: Record<string, number>) => {
    const historico = ler<HistoricoPrecos>('historicoPrecos', {});
    setEstimativas((atual) => {
      const novo = { ...atual };
      let mudou = false;
      itens.forEach(({ norm, u }) => {
        if (precos[norm] > 0 || novo[norm] > 0) return;
        const est = estimarPreco(norm, precos, historico, u);
        if (est) {
          novo[norm] = est;
          mudou = true;
        }
      });
      if (mudou) gravar('estimativas', novo);
      return novo;
    });
  }, []);

  return { estimativas, definirEstimativa, gerarEstimativas };
}
