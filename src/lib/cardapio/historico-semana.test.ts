import { describe, expect, it } from 'vitest';
import { estadoParaHistorico } from './historico-semana';
import type { EstadoSemana } from './tipos';

function semanaComFotos(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: Array.from({ length: 7 }, (_, i) => ({
      pessoas: 30,
      principal: i === 0 ? 'Frango grelhado' : '',
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
    obsCozinha: '',
    notas: { 0: 'data:image/jpeg;base64,' + 'x'.repeat(100_000) },
    notasFiscais: [
      {
        foto: 'data:image/jpeg;base64,' + 'y'.repeat(500_000),
        dias: [0, 1],
        em: '2026-09-16T18:00:00.000Z',
      },
    ],
  };
}

describe('historico-semana sem amplificacao de fotos', () => {
  it('remove anexos base64 do snapshot sem alterar a semana operacional', () => {
    const original = semanaComFotos();
    const fotoAtual = original.notasFiscais?.[0].foto;

    const snapshot = estadoParaHistorico(original);

    expect(snapshot.notas).toBeUndefined();
    expect(snapshot.notasFiscais).toBeUndefined();
    expect(snapshot.dias[0].principal).toBe('Frango grelhado');
    expect(original.notasFiscais?.[0].foto).toBe(fotoAtual);
    expect(original.notas?.[0]).toContain('data:image/jpeg;base64,');
  });

  it('reduz materialmente o tamanho quando a semana contém fotos', () => {
    const original = semanaComFotos();
    const snapshot = estadoParaHistorico(original);

    expect(JSON.stringify(snapshot).length).toBeLessThan(JSON.stringify(original).length / 10);
  });
});
