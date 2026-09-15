'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSemana } from './estado';
import { clonarSemanaParaRascunho } from './governanca-shadow';
import type { EstadoSemana } from './tipos';

/**
 * Wrapper de coexistência para a migração House → Líderes.
 *
 * Lê a semana operacional real apenas como ponto de partida e, depois do boot,
 * destaca uma cópia em memória. O `atualizar` retornado NUNCA chama o updater
 * persistente de `useSemana`, portanto não grava `cardapio.v1.semana.*`, não
 * aciona o espelhamento do BootNuvem e não altera o House que segue em uso.
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
