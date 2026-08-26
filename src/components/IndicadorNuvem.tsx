'use client';

import { useStatusNuvem } from '@/lib/cardapio/supabase';

const MAPA = {
  conectando:    { cor: 'bg-carvao-300 dark:bg-carvao-500', pulse: true,  rotulo: 'Conectando…' },
  online:        { cor: 'bg-brand-500',                     pulse: false, rotulo: 'Sincronizado' },
  sincronizando: { cor: 'bg-alerta',                        pulse: true,  rotulo: 'Salvando…' },
  erro:          { cor: 'bg-perigo',                        pulse: false, rotulo: 'Falha ao sincronizar' },
  desligado:     { cor: 'bg-perigo',                        pulse: false, rotulo: 'Sem sincronizar' },
} as const;

export function IndicadorNuvem() {
  const { status, ultima, pendentes } = useStatusNuvem();
  const m = MAPA[status];
  const hora = ultima
    ? new Date(ultima).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const titulo =
    status === 'online' && hora
      ? `Sincronizado com a nuvem · ${hora}`
      : pendentes > 0
        ? `${m.rotulo} · ${pendentes} alteração(ões) pendente(s)`
        : m.rotulo;

  return (
    <span
      title={titulo}
      role="status"
      aria-label={titulo}
      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${m.cor} ${m.pulse ? 'animate-pulse' : ''}`} />
      <span className="hidden text-caption font-semibold text-carvao-500 dark:text-texto-suave lg:inline">
        {m.rotulo}
      </span>
    </span>
  );
}
