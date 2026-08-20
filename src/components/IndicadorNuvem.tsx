'use client';

/* =====================================================================
   Indicador discreto de status da nuvem no cabeçalho. Lê o sinal global
   que o BootNuvem mantém. Fica oculto quando a nuvem está desligada
   (app 100% local) — sem ruído visual quando não há o que mostrar.
   ===================================================================== */

import { useStatusNuvem } from '@/lib/cardapio/supabase';

const MAPA = {
  conectando:    { cor: 'bg-carvao-300 dark:bg-carvao-500', pulse: true,  rotulo: 'Conectando…' },
  online:        { cor: 'bg-brand-500',                     pulse: false, rotulo: 'Sincronizado' },
  sincronizando: { cor: 'bg-alerta',                        pulse: true,  rotulo: 'Salvando…' },
  erro:          { cor: 'bg-perigo',                        pulse: false, rotulo: 'Sem conexão' },
  // Antes este estado renderizava NADA — um app sem nuvem parecia idêntico a
  // um app sincronizando. Agora ele se declara, como qualquer outro estado.
  desligado:     { cor: 'bg-perigo',                        pulse: false, rotulo: 'Sem sincronizar' },
} as const;

export function IndicadorNuvem() {
  const { status, ultima } = useStatusNuvem();

  const m = MAPA[status];
  const hora = ultima
    ? new Date(ultima).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const titulo =
    status === 'online' && hora ? `Sincronizado com a nuvem · ${hora}` : m.rotulo;

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
