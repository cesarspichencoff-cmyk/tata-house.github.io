'use client';

/* =====================================================================
   Sinal global de status da nuvem. O BootNuvem (motor de sincronização)
   atualiza este estado; o indicador no cabeçalho o lê. Mantido fora do
   React para que qualquer parte do app possa reportar/observar sem prop
   drilling — uma store mínima com assinantes.
   ===================================================================== */

import { useEffect, useState } from 'react';

export type StatusNuvem = 'desligado' | 'conectando' | 'online' | 'sincronizando' | 'erro';

interface EstadoNuvem {
  status: StatusNuvem;
  ultima: number | null;
  /** Desde quando o status está em 'erro' sem interrupção (null se não). Usado
     pelo aviso visível — um blip de 1-2s não precisa virar banner. */
  erroDesde: number | null;
  /** Nº de chaves gravadas localmente que ainda não confirmaram na nuvem. */
  pendentes: number;
}

let estado: EstadoNuvem = { status: 'desligado', ultima: null, erroDesde: null, pendentes: 0 };
const ouvintes = new Set<() => void>();

/** Reporta um novo status (chamado pelo BootNuvem). `ultima` marca o último
   instante em que ficou efetivamente sincronizado ('online'). */
export function definirStatusNuvem(status: StatusNuvem) {
  const ultima = status === 'online' ? Date.now() : estado.ultima;
  const erroDesde = status === 'erro' ? (estado.erroDesde ?? Date.now()) : null;
  estado = { ...estado, status, ultima, erroDesde };
  ouvintes.forEach((f) => f());
}

/** Reporta quantas chaves locais ainda não confirmaram gravação na nuvem
   (chamado pelo BootNuvem sempre que a fila de pendentes muda). */
export function definirPendentesNuvem(pendentes: number) {
  estado = { ...estado, pendentes };
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
