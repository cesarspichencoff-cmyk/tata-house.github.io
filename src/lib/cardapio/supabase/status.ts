'use client';

/* =====================================================================
   Sinal global de status da nuvem. O BootNuvem (motor de sincronização)
   atualiza este estado; o indicador no cabeçalho o lê. Mantido fora do
   React para que qualquer parte do app possa reportar/observar sem prop
   drilling — uma store mínima com assinantes.
   ===================================================================== */

import { useEffect, useState } from 'react';

export type StatusNuvem = 'desligado' | 'conectando' | 'online' | 'sincronizando' | 'erro';

let estado: { status: StatusNuvem; ultima: number | null } = { status: 'desligado', ultima: null };
const ouvintes = new Set<() => void>();

/** Reporta um novo status (chamado pelo BootNuvem). `ultima` marca o último
   instante em que ficou efetivamente sincronizado ('online'). */
export function definirStatusNuvem(status: StatusNuvem) {
  const ultima = status === 'online' ? Date.now() : estado.ultima;
  estado = { status, ultima };
  ouvintes.forEach((f) => f());
}

export function lerStatusNuvem() {
  return estado;
}

/* =====================================================================
   "Boot concluído": sinaliza que a primeira reconciliação com a nuvem
   desta sessão já terminou (com sucesso, erro, ou porque o Supabase está
   desligado). Sem isso, uma tela que lê um documento vazio do localStorage
   antes da nuvem responder mostra "vazio" como se fosse definitivo — e um
   cardápio real que ainda não chegou parece ter sumido.
   ===================================================================== */
let bootResolvido = false;
let resolverBoot: (() => void) | null = null;
const promessaBoot = new Promise<void>((resolve) => {
  resolverBoot = resolve;
});

export function marcarBootNuvemConcluido() {
  if (bootResolvido) return;
  bootResolvido = true;
  resolverBoot?.();
}

export function bootNuvemJaConcluido(): boolean {
  return bootResolvido;
}

/** Resolve quando o boot concluir, ou após `timeoutMs` (rede lenta/travada). */
export function aguardarBootNuvem(timeoutMs = 6000): Promise<void> {
  if (bootResolvido) return Promise.resolve();
  return Promise.race([
    promessaBoot,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Observa o status da nuvem para renderizar o indicador. */
export function useStatusNuvem() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((x) => x + 1);
    ouvintes.add(f);
    f(); // sincroniza na montagem
    return () => {
      ouvintes.delete(f);
    };
  }, []);
  return estado;
}
