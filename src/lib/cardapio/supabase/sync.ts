'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  aplicarEstadoGrandeDaNuvem,
  inicializarEstadoGrandeLocal,
  liberarEstadoGrandeParaNuvem,
  reenviarEstadoGrandePendente,
} from '../estado-grande';
import { ehChaveEstadoGrande } from '../estado-grande-merge';
import { supabaseHabilitado } from './config';
import { armazenamentoLocal, armazenamentoSupabase } from './armazenamento';

/** Sobe o estado local genérico. Os estados grandes v2 têm fila própria e
 * nunca voltam a ser materializados como blobs no localStorage. */
export async function enviarTudo(): Promise<number> {
  if (!supabaseHabilitado()) return 0;
  const chaves = await armazenamentoLocal.listarChaves();
  let n = 0;
  for (const chave of chaves) {
    if (ehChaveEstadoGrande(chave)) continue;
    const valor = await armazenamentoLocal.ler<unknown>(chave, null);
    if (valor !== null) {
      await armazenamentoSupabase.gravar(chave, valor);
      n++;
    }
  }
  await reenviarEstadoGrandePendente();
  return n;
}

/** Traz o remoto. Estados grandes são reconciliados em IndexedDB/memória,
 * não no localStorage — inclusive quando o usuário aperta o botão manual. */
export async function baixarTudo(): Promise<number> {
  if (!supabaseHabilitado()) return 0;
  await inicializarEstadoGrandeLocal();
  const chaves = await armazenamentoSupabase.listarChaves();
  let n = 0;
  for (const chave of chaves) {
    const valor = await armazenamentoSupabase.ler<unknown>(chave, null);
    if (valor === null) continue;
    if (ehChaveEstadoGrande(chave)) {
      await aplicarEstadoGrandeDaNuvem(chave, valor);
    } else {
      await armazenamentoLocal.gravar(chave, valor);
    }
    n++;
  }
  await liberarEstadoGrandeParaNuvem(chaves);
  return n;
}

export interface EstadoSync {
  disponivel: boolean;
  sincronizando: boolean;
  ultimaSync: string | null;
  erro: string | null;
  enviar: () => Promise<void>;
  baixar: () => Promise<void>;
}

export function useSincronizacao(): EstadoSync {
  const [disponivel, setDisponivel] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setDisponivel(supabaseHabilitado()), []);

  const rodar = useCallback(async (fn: () => Promise<number>) => {
    if (!supabaseHabilitado()) return;
    setSincronizando(true);
    setErro(null);
    try {
      await fn();
      setUltimaSync(new Date().toISOString());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na sincronização');
    } finally {
      setSincronizando(false);
    }
  }, []);

  const enviar = useCallback(() => rodar(enviarTudo), [rodar]);
  const baixar = useCallback(() => rodar(baixarTudo), [rodar]);

  return { disponivel, sincronizando, ultimaSync, erro, enviar, baixar };
}
