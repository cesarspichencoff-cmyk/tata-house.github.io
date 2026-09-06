'use client';

import { useEffect } from 'react';
import { instalarContextoGovernanca } from '@/lib/cardapio/governanca-contexto';

/**
 * Listener global e sem UI. Recebe apenas contexto descritivo vindo da origem
 * autorizada da Governança; nunca autentica, troca papel ou libera permissões.
 */
export function GovernancaContexto() {
  useEffect(() => instalarContextoGovernanca(), []);
  return null;
}
