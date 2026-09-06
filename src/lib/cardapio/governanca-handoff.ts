'use client';

import {
  salvarSnapshotCardapioGovernancaLocal,
  type CardapioGovernancaDiaV1,
} from './governanca-cardapio';

export const GOV_HANDOFF_READY_V1 = 'tata-house:governanca:ready:v1' as const;
export const GOV_HANDOFF_CARDAPIO_V1 = 'tata-house:governanca:cardapio:v1' as const;
export const GOV_HANDOFF_ACK_V1 = 'tata-house:governanca:ack:v1' as const;
export const ORIGEM_GOVERNANCA_V1 = 'https://lideres.tatasushi.tech' as const;

interface MensagemCardapioV1 {
  type: typeof GOV_HANDOFF_CARDAPIO_V1;
  correlationId?: string;
  payload?: unknown;
}

export interface ResultadoHandoffGovernanca {
  tratado: boolean;
  aceito: boolean;
  correlationId?: string;
  snapshot?: CardapioGovernancaDiaV1;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Núcleo determinístico do handoff. Origem diferente da autorizada nunca chega
 * à persistência. Mensagem do tipo correto, mas payload inválido, é tratada e
 * rejeitada para que a Governança receba um ACK negativo explícito.
 */
export function processarMensagemCardapioGovernanca(
  origem: string,
  dados: unknown,
  origemEsperada: string = ORIGEM_GOVERNANCA_V1,
): ResultadoHandoffGovernanca {
  if (origem !== origemEsperada || !dados || typeof dados !== 'object') {
    return { tratado: false, aceito: false };
  }

  const mensagem = dados as Partial<MensagemCardapioV1>;
  if (mensagem.type !== GOV_HANDOFF_CARDAPIO_V1) {
    return { tratado: false, aceito: false };
  }

  const correlationId = texto(mensagem.correlationId) || undefined;
  const snapshot = salvarSnapshotCardapioGovernancaLocal(mensagem.payload);
  if (!snapshot) {
    return { tratado: true, aceito: false, ...(correlationId ? { correlationId } : {}) };
  }

  return {
    tratado: true,
    aceito: true,
    ...(correlationId ? { correlationId } : {}),
    snapshot,
  };
}

/**
 * Instala o receptor cross-window da Fase 1. Funciona com opener ou iframe,
 * sem Supabase/HTTP. O browser é quem prova a origem do postMessage.
 */
export function instalarHandoffCardapioGovernanca(
  aoImportar?: (snapshot: CardapioGovernancaDiaV1) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const aoReceber = (event: MessageEvent<unknown>) => {
    const resultado = processarMensagemCardapioGovernanca(
      event.origin,
      event.data,
      ORIGEM_GOVERNANCA_V1,
    );
    if (!resultado.tratado) return;

    const ack = {
      type: GOV_HANDOFF_ACK_V1,
      correlationId: resultado.correlationId ?? null,
      ok: resultado.aceito,
      ...(resultado.snapshot
        ? { data: resultado.snapshot.data, unidade: resultado.snapshot.unidade }
        : {}),
    };

    try {
      (event.source as Window | null)?.postMessage(ack, ORIGEM_GOVERNANCA_V1);
    } catch {
      // A persistência local já decidiu o resultado; falha de ACK não a desfaz.
    }

    if (resultado.aceito && resultado.snapshot) {
      aoImportar?.(resultado.snapshot);
    }
  };

  window.addEventListener('message', aoReceber);

  const ready = { type: GOV_HANDOFF_READY_V1, versao: 1 };
  try {
    window.opener?.postMessage(ready, ORIGEM_GOVERNANCA_V1);
  } catch {
    // Sem opener autorizado: o House segue normalmente.
  }
  try {
    if (window.parent !== window) window.parent.postMessage(ready, ORIGEM_GOVERNANCA_V1);
  } catch {
    // Sem parent autorizado: o House segue normalmente.
  }

  return () => window.removeEventListener('message', aoReceber);
}