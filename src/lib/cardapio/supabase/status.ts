'use client';

import { useEffect, useState } from 'react';

export type StatusNuvem = 'desligado' | 'conectando' | 'online' | 'sincronizando' | 'erro';

interface EstadoNuvem {
  status: StatusNuvem;
  ultima: number | null;
  erroDesde: number | null;
  pendentes: number;
}

let estado: EstadoNuvem = { status: 'desligado', ultima: null, erroDesde: null, pendentes: 0 };
const ouvintes = new Set<() => void>();
const pendentesPorFonte = new Map<string, number>();

function totalPendentes(): number {
  let total = 0;
  pendentesPorFonte.forEach((n) => { total += Math.max(0, n); });
  return total;
}

/** Nunca deixa uma chamada isolada declarar verde enquanto outra fonte ainda
 * possui alterações pendentes. */
export function definirStatusNuvem(status: StatusNuvem) {
  let efetivo = status;
  if (status === 'online' && estado.pendentes > 0) {
    efetivo = estado.status === 'erro' ? 'erro' : 'sincronizando';
  }

  const ultima = efetivo === 'online' ? Date.now() : estado.ultima;
  const erroDesde = efetivo === 'erro' ? (estado.erroDesde ?? Date.now()) : null;
  estado = { ...estado, status: efetivo, ultima, erroDesde };
  ouvintes.forEach((f) => f());
}

/** Contagem composta. O motor genérico usa a fonte "boot"; módulos remotos
 * especializados podem reportar a própria fila sem sobrescrever a dos demais. */
export function definirPendentesNuvem(pendentes: number, fonte = 'boot') {
  pendentesPorFonte.set(fonte, Math.max(0, pendentes));
  const total = totalPendentes();
  let status = estado.status;
  let erroDesde = estado.erroDesde;

  if (total > 0 && status === 'online') status = 'sincronizando';
  if (total === 0 && status !== 'erro') erroDesde = null;

  estado = { ...estado, pendentes: total, status, erroDesde };
  ouvintes.forEach((f) => f());
}

export function lerStatusNuvem() {
  return estado;
}

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

export function aguardarBootNuvem(timeoutMs = 6000): Promise<void> {
  if (bootResolvido) return Promise.resolve();
  return Promise.race([
    promessaBoot,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function useStatusNuvem() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((x) => x + 1);
    ouvintes.add(f);
    f();
    return () => {
      ouvintes.delete(f);
    };
  }, []);
  return estado;
}
