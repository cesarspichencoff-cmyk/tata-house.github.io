import { describe, expect, it } from 'vitest';
import {
  GOV_HOUSE_SNAPSHOT_REQUEST_V2,
  ORIGEM_GOVERNANCA_HOUSE_V2,
  normalizarRequisicaoHouseSnapshotV2,
} from './governanca-house-snapshot-protocolo';

describe('protocolo de snapshot House → Governança', () => {
  it('aceita somente origem, semana, correlation e seções conhecidas', () => {
    expect(normalizarRequisicaoHouseSnapshotV2(ORIGEM_GOVERNANCA_HOUSE_V2, {
      type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
      correlationId: 'req-2026-S37-001',
      semanaId: '2026-S37',
      secoes: ['cardapio', 'estoque'],
    })).toEqual({
      type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
      correlationId: 'req-2026-S37-001',
      semanaId: '2026-S37',
      secoes: ['cardapio', 'estoque'],
    });
  });

  it('rejeita origem diferente e campos extras', () => {
    const base = {
      type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
      correlationId: 'req-2026-S37-001',
      semanaId: '2026-S37',
    };
    expect(normalizarRequisicaoHouseSnapshotV2('https://evil.example', base)).toBeNull();
    expect(normalizarRequisicaoHouseSnapshotV2(ORIGEM_GOVERNANCA_HOUSE_V2, {
      ...base,
      token: 'nao-aceito',
    })).toBeNull();
  });

  it('rejeita seção desconhecida e correlation curta', () => {
    expect(normalizarRequisicaoHouseSnapshotV2(ORIGEM_GOVERNANCA_HOUSE_V2, {
      type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
      correlationId: 'curto',
      semanaId: '2026-S37',
    })).toBeNull();
    expect(normalizarRequisicaoHouseSnapshotV2(ORIGEM_GOVERNANCA_HOUSE_V2, {
      type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
      correlationId: 'req-2026-S37-001',
      semanaId: '2026-S37',
      secoes: ['funcionarios'],
    })).toBeNull();
  });
});
