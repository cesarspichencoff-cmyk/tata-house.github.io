import { describe, expect, it } from 'vitest';
import { estadoSemAnexosSemana, extrairAnexosSemana, temCamposAnexoSemana } from './anexos-semana';
import type { EstadoSemana } from './tipos';

function semana(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: Array.from({ length: 7 }, (_, i) => ({
      pessoas: 60 + i,
      principal: i === 0 ? 'Frango assado' : '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: 'preservar',
    notas: { 0: 'data:image/jpeg;base64,' + 'A'.repeat(100_000) },
    notasFiscais: [
      { foto: 'data:image/jpeg;base64,' + 'B'.repeat(200_000), dias: [0, 1], em: '2026-09-01T10:00:00Z' },
    ],
  };
}

describe('anexos da semana fora do localStorage', () => {
  it('remove apenas anexos pesados do cache e preserva a operação', () => {
    const original = semana();
    const leve = estadoSemAnexosSemana(original);
    expect(leve.notas).toBeUndefined();
    expect(leve.notasFiscais).toBeUndefined();
    expect(leve.dias).toEqual(original.dias);
    expect(leve.orcamento).toBe(original.orcamento);
    expect(leve.obsCozinha).toBe('preservar');
    expect(JSON.stringify(leve).length).toBeLessThan(JSON.stringify(original).length / 100);
  });

  it('extrai os anexos sem confundir documento compacto com exclusão explícita', () => {
    const original = semana();
    expect(temCamposAnexoSemana(original)).toBe(true);
    expect(extrairAnexosSemana(original).notasFiscais?.[0]?.dias).toEqual([0, 1]);

    const leve = estadoSemAnexosSemana(original);
    expect(temCamposAnexoSemana(leve)).toBe(false);
  });
});
