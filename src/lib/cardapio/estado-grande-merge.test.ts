import { describe, expect, it } from 'vitest';
import {
  adicionarPontoHistorico,
  auditoriaDeLegado,
  historicoDeLegado,
  limparAuditoria,
  mesclarAuditoria,
  mesclarHistorico,
} from './estado-grande-merge';
import type { RegistroAuditoria } from './tipos';

const reg = (em: string, acao: string): RegistroAuditoria => ({
  em,
  papel: 'gestor',
  acao,
  alvo: acao,
});

describe('estado-grande-merge', () => {
  it('mantem as chaves v2 em namespace reservado para clientes antigos ignorarem', async () => {
    const mod = await import('./estado-grande-merge');
    expect(mod.CHAVE_AUDITORIA_V2.startsWith('__')).toBe(true);
    expect(mod.CHAVE_HISTORICO_V2.startsWith('__')).toBe(true);
    expect(mod.ehChaveEstadoGrande(mod.CHAVE_AUDITORIA_V2)).toBe(true);
    expect(mod.ehChaveEstadoGrande(mod.CHAVE_HISTORICO_V2)).toBe(true);
  });

  it('faz união determinística de auditoria concorrente sem perder ações', () => {
    const a = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'A')]);
    const b = auditoriaDeLegado([reg('2026-08-26T10:00:01.000Z', 'B')]);
    const ab = mesclarAuditoria(a, b);
    const ba = mesclarAuditoria(b, a);
    expect(ab).toEqual(ba);
    expect(ab.registros.map((r) => r.acao)).toEqual(['B', 'A']);
  });

  it('tombstone de limpar impede auditoria antiga de ressuscitar', () => {
    const antiga = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'antiga')]);
    const limpa = limparAuditoria(antiga, '2026-08-26T10:01:00.000Z');
    const remotoAtrasado = auditoriaDeLegado([reg('2026-08-26T10:00:30.000Z', 'atrasada')]);
    expect(mesclarAuditoria(limpa, remotoAtrasado).registros).toEqual([]);
  });

  it('mantém ação nova feita depois da limpeza', () => {
    const base = limparAuditoria(auditoriaDeLegado([]), '2026-08-26T10:01:00.000Z');
    const nova = auditoriaDeLegado([reg('2026-08-26T10:02:00.000Z', 'nova')]);
    expect(mesclarAuditoria(base, nova).registros.map((r) => r.acao)).toEqual(['nova']);
  });

  it('une histórico concorrente e deduplica os pontos', () => {
    const a = historicoDeLegado({
      arroz: [{ valor: 10, em: '2026-08-20T00:00:00.000Z' }],
    });
    const b = historicoDeLegado({
      arroz: [
        { valor: 10, em: '2026-08-20T00:00:00.000Z' },
        { valor: 11, em: '2026-08-21T00:00:00.000Z' },
      ],
    });
    const merged = mesclarHistorico(a, b);
    expect(merged.historico.arroz).toHaveLength(2);
    expect(merged).toEqual(mesclarHistorico(b, a));
  });

  it('adiciona preço sem reescrever semanticamente pontos existentes', () => {
    const base = historicoDeLegado({
      arroz: [{ valor: 10, em: '2026-08-20T00:00:00.000Z' }],
    });
    const novo = adicionarPontoHistorico(base, 'arroz', 12, '2026-08-22T00:00:00.000Z');
    expect(novo.historico.arroz.map((p) => p.valor)).toEqual([10, 12]);
  });

  it('limita cada serie aos 40 pontos mais recentes', () => {
    const pontos = Array.from({ length: 55 }, (_, i) => ({
      valor: i + 1,
      em: `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    const merged = mesclarHistorico(
      { versao: 2, historico: {} },
      { versao: 2, historico: { arroz: pontos } },
    );
    expect(merged.historico.arroz).toHaveLength(40);
    expect(merged.historico.arroz[0]?.valor).toBe(16);
    expect(merged.historico.arroz[39]?.valor).toBe(55);
  });
});
