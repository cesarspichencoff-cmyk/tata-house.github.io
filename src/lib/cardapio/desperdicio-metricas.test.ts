import { describe, expect, it } from 'vitest';
import { resumirDesperdicioPorUnidade } from './desperdicio-metricas';
import type { RegistroDesperdicio } from './tipos';

function reg(id: string, unid: RegistroDesperdicio['unid'], produzido: number, consumido: number): RegistroDesperdicio {
  return { id, dia: 0, prato: 'Teste', produzido, consumido, unid, em: '2026-09-17T00:00:00Z' };
}

describe('métricas de desperdício por unidade', () => {
  it('nunca soma kg com porções', () => {
    const r = resumirDesperdicioPorUnidade([
      reg('p1', 'porções', 10, 8),
      reg('k1', 'kg', 5, 4),
    ]);

    expect(r['porções'].sobra).toBe(2);
    expect(r['porções'].taxa).toBeCloseTo(0.2);
    expect(r.kg.sobra).toBe(1);
    expect(r.kg.taxa).toBeCloseTo(0.2);
  });

  it('limita consumo ao produzido para não gerar sobra negativa', () => {
    const r = resumirDesperdicioPorUnidade([reg('p1', 'porções', 10, 14)]);
    expect(r['porções'].consumido).toBe(10);
    expect(r['porções'].sobra).toBe(0);
    expect(r['porções'].taxa).toBe(0);
  });
});
