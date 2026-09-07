'use client';

import { useEffect } from 'react';
import { lerHouseGovernancaSnapshotV2 } from '@/lib/cardapio/governanca-house-snapshot-runtime';
import {
  GOV_HOUSE_SNAPSHOT_RESPONSE_V2,
  ORIGEM_GOVERNANCA_HOUSE_V2,
  normalizarRequisicaoHouseSnapshotV2,
} from '@/lib/cardapio/governanca-house-snapshot-protocolo';

function janelaSolicitante(source: MessageEventSource | null): Window | null {
  if (typeof window === 'undefined' || !source) return null;
  try {
    if (window.parent !== window && source === window.parent) return window.parent;
  } catch {
    // segue para opener
  }
  try {
    if (window.opener && source === window.opener) return window.opener;
  } catch {
    // sem fonte autorizada
  }
  return null;
}

/**
 * Ponte estritamente read-only House → Governança.
 * Não recebe token, papel, PIN, permissão ou comando de escrita.
 */
export function GovernancaSnapshotResponder() {
  useEffect(() => {
    let ativo = true;

    const aoReceber = (event: MessageEvent<unknown>) => {
      const alvo = janelaSolicitante(event.source);
      if (!alvo) return;

      const requisicao = normalizarRequisicaoHouseSnapshotV2(event.origin, event.data);
      if (!requisicao) return;

      void lerHouseGovernancaSnapshotV2({
        semanaId: requisicao.semanaId,
        secoes: requisicao.secoes,
      })
        .then((payload) => {
          if (!ativo) return;
          alvo.postMessage({
            type: GOV_HOUSE_SNAPSHOT_RESPONSE_V2,
            correlationId: requisicao.correlationId,
            ok: true,
            payload,
          }, ORIGEM_GOVERNANCA_HOUSE_V2);
        })
        .catch((erro) => {
          if (!ativo) return;
          alvo.postMessage({
            type: GOV_HOUSE_SNAPSHOT_RESPONSE_V2,
            correlationId: requisicao.correlationId,
            ok: false,
            erro: erro instanceof Error ? erro.message.slice(0, 180) : 'Falha ao gerar snapshot House.',
          }, ORIGEM_GOVERNANCA_HOUSE_V2);
        });
    };

    window.addEventListener('message', aoReceber);
    return () => {
      ativo = false;
      window.removeEventListener('message', aoReceber);
    };
  }, []);

  return null;
}
