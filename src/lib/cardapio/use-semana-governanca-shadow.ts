'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSemana } from './estado';
import { clonarSemanaParaRascunho } from './governanca-shadow';
import type { EstadoSemana } from './tipos';

/**
 * Wrapper de coexistência House → Líderes.
 * Lê a semana operacional somente como ponto de partida e destaca uma cópia em memória.
 * O atualizar retornado nunca chama o updater persistente de useSemana.
 */
export function useSemanaGovernancaShadow(semanaId: string) {
  const { estado: operacional, pronto: operacionalPronto } = useSemana(semanaId);
  const [rascunho, setRascunho] = useState<EstadoSemana | null>(null);
  const inicializado = useRef(false);

  useEffect(() => {
    if (!operacionalPronto || inicializado.current) return;
    inicializado.current = true;
    setRascunho(clonarSemanaParaRascunho(operacional));
  }, [operacionalPronto, operacional]);

  const atualizar = useCallback((fn: (atual: EstadoSemana) => EstadoSemana) => {
    setRascunho((atual) => (atual ? fn(atual) : atual));
  }, []);

  return {
    estado: rascunho ?? operacional,
    atualizar,
    pronto: operacionalPronto && rascunho !== null,
  };
}
