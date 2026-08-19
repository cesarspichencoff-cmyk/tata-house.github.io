'use client';

/* =====================================================================
   Sinal global: a última tentativa de gravar no localStorage deste
   aparelho falhou (normalmente `QuotaExceededError` — armazenamento
   cheio). Continua `true` até uma gravação seguinte dar certo.

   É separado do status da nuvem (`status.ts`) de propósito: isso pode
   acontecer mesmo com o Supabase desligado, e é mais grave — quando
   falha, a mudança nem chega a existir localmente, então não há como
   a nuvem "resgatar" depois. Precisa aparecer na tela, sempre.
   ===================================================================== */

import { useEffect, useState } from 'react';

let cheio = false;
const ouvintes = new Set<() => void>();

export function definirArmazenamentoLocalCheio(valor: boolean) {
  if (cheio === valor) return;
  cheio = valor;
  ouvintes.forEach((f) => f());
}

export function armazenamentoLocalEstaCheio(): boolean {
  return cheio;
}

export function useArmazenamentoLocalCheio(): boolean {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((x) => x + 1);
    ouvintes.add(f);
    return () => {
      ouvintes.delete(f);
    };
  }, []);
  return cheio;
}
