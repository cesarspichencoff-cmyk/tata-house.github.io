import { describe, expect, it } from 'vitest';
import {
  GOV_AVALIACOES_ACK_V1,
  ORIGEM_GOVERNANCA_AVALIACOES_V1,
  normalizarAckAvaliacoesGovernanca,
} from './governanca-postmessage';

describe('governanca-postmessage', () => {
  it('aceita somente ACK da origem e correlação esperadas', () => {
    const correlationId = 'corr-123';
    const ack = {
      type: GOV_AVALIACOES_ACK_V1,
      correlationId,
      confirmados: ['evt-1', ' evt-2 ', '', 123],
      rejeitados: [
        { id: 'evt-3', motivo: 'inválido' },
        { id: '' },
        null,
      ],
    };

    expect(
      normalizarAckAvaliacoesGovernanca(
        ORIGEM_GOVERNANCA_AVALIACOES_V1,
        ack,
        correlationId,
      ),
    ).toEqual({
      confirmados: ['evt-1', 'evt-2'],
      rejeitados: [{ id: 'evt-3', motivo: 'inválido' }],
    });

    expect(
      normalizarAckAvaliacoesGovernanca('https://exemplo.invalid', ack, correlationId),
    ).toBeNull();
    expect(
      normalizarAckAvaliacoesGovernanca(
        ORIGEM_GOVERNANCA_AVALIACOES_V1,
        ack,
        'outra-correlacao',
      ),
    ).toBeNull();
  });

  it('normaliza ACK sem rejeições', () => {
    expect(
      normalizarAckAvaliacoesGovernanca(
        ORIGEM_GOVERNANCA_AVALIACOES_V1,
        {
          type: GOV_AVALIACOES_ACK_V1,
          correlationId: 'corr',
          confirmados: ['evt-1'],
        },
        'corr',
      ),
    ).toEqual({ confirmados: ['evt-1'] });
  });
});
