'use client';

import type {
  PacoteGovernancaV1,
} from './governanca-outbox';
import type {
  ResultadoEnvioGovernancaV1,
  TransporteGovernancaV1,
} from './governanca-sync';

export const GOV_AVALIACOES_V1 = 'tata-house:governanca:avaliacoes:v1' as const;
export const GOV_AVALIACOES_ACK_V1 = 'tata-house:governanca:avaliacoes:ack:v1' as const;
export const ORIGEM_GOVERNANCA_AVALIACOES_V1 = 'https://lideres.tatasushi.tech' as const;

interface MensagemAckAvaliacoesV1 {
  type?: unknown;
  correlationId?: unknown;
  confirmados?: unknown;
  rejeitados?: unknown;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function correlationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback abaixo
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normaliza um ACK sem confiar no conteúdo vindo de outra janela. O sincronizador
 * ainda filtra os IDs pela lista efetivamente enviada, então um ACK nunca consegue
 * apagar eventos que não pertenciam ao pacote corrente.
 */
export function normalizarAckAvaliacoesGovernanca(
  origem: string,
  dados: unknown,
  correlationEsperado: string,
): ResultadoEnvioGovernancaV1 | null {
  if (origem !== ORIGEM_GOVERNANCA_AVALIACOES_V1 || !dados || typeof dados !== 'object') {
    return null;
  }

  const ack = dados as MensagemAckAvaliacoesV1;
  if (
    ack.type !== GOV_AVALIACOES_ACK_V1 ||
    texto(ack.correlationId) !== correlationEsperado
  ) {
    return null;
  }

  const confirmados = Array.isArray(ack.confirmados)
    ? ack.confirmados.map(texto).filter(Boolean)
    : [];

  const rejeitados = Array.isArray(ack.rejeitados)
    ? ack.rejeitados
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const rec = item as Record<string, unknown>;
          const id = texto(rec.id);
          if (!id) return null;
          const motivo = texto(rec.motivo);
          return motivo ? { id, motivo } : { id };
        })
        .filter((item): item is { id: string; motivo?: string } => item !== null)
    : undefined;

  return rejeitados && rejeitados.length > 0
    ? { confirmados, rejeitados }
    : { confirmados };
}

function janelaGovernanca(): Window | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.opener && !window.opener.closed) return window.opener;
  } catch {
    // tenta parent abaixo
  }
  try {
    if (window.parent !== window) return window.parent;
  } catch {
    // sem janela autorizada
  }
  return null;
}

/**
 * Transporte temporário de PROVA browser→browser. Não persiste remotamente e
 * não conhece Supabase. Se o House não foi aberto/embutido pela Governança,
 * simplesmente não confirma nada e a outbox permanece íntegra.
 */
export function criarTransportePostMessageGovernanca(
  timeoutMs = 3500,
): TransporteGovernancaV1 {
  return {
    async enviarAvaliacoes(pacote: PacoteGovernancaV1): Promise<ResultadoEnvioGovernancaV1> {
      const alvo = janelaGovernanca();
      if (!alvo || typeof window === 'undefined') return { confirmados: [] };

      const correlation = correlationId();

      return await new Promise<ResultadoEnvioGovernancaV1>((resolve, reject) => {
        let concluido = false;

        const finalizar = (fn: () => void) => {
          if (concluido) return;
          concluido = true;
          window.removeEventListener('message', aoReceber);
          clearTimeout(timer);
          fn();
        };

        const aoReceber = (event: MessageEvent<unknown>) => {
          if (event.source !== alvo) return;
          const resposta = normalizarAckAvaliacoesGovernanca(
            event.origin,
            event.data,
            correlation,
          );
          if (!resposta) return;
          finalizar(() => resolve(resposta));
        };

        const timer = window.setTimeout(() => {
          finalizar(() => reject(new Error('Governança não confirmou as avaliações no prazo.')));
        }, timeoutMs);

        window.addEventListener('message', aoReceber);

        try {
          alvo.postMessage(
            {
              type: GOV_AVALIACOES_V1,
              correlationId: correlation,
              payload: pacote,
            },
            ORIGEM_GOVERNANCA_AVALIACOES_V1,
          );
        } catch (erro) {
          finalizar(() => reject(erro instanceof Error ? erro : new Error('Falha no handoff de avaliações.')));
        }
      });
    },
  };
}
