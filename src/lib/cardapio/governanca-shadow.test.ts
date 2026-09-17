import { describe, expect, it } from 'vitest';
import { clonarSemanaParaRascunho } from './governanca-shadow';
import type { EstadoSemana } from './tipos';

function estadoFixture(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: Array.from({ length: 7 }, (_, i) => ({
      pessoas: 60 + i,
      principal: i === 0 ? 'Frango grelhado' : '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    etapa: 'compras',
    historico: [{ etapa: 'cozinha', em: '2026-09-15T10:00:00.000Z', papel: 'gestor' }],
    ajustes: { 0: { frango: { qtd: 99 } } },
    manuais: { 0: [{ item: 'Item operacional', qtd: 2, unid: 'kg' }] },
    status: { 0: { frango: { compradoQtd: 4 } } },
    obsCozinha: 'estado em uso pelo House',
    refeicoes: { 0: 58 },
  };
}

describe('governanca-shadow', () => {
  it('destaca o rascunho do estado operacional antes de qualquer edição', () => {
    const operacional = estadoFixture();
    const rascunho = clonarSemanaParaRascunho(operacional);

    expect(rascunho).toEqual(operacional);
    expect(rascunho).not.toBe(operacional);
    expect(rascunho.dias).not.toBe(operacional.dias);
    expect(rascunho.ajustes).not.toBe(operacional.ajustes);
    expect(rascunho.manuais).not.toBe(operacional.manuais);

    rascunho.dias[0].principal = 'Bife acebolado';
    rascunho.ajustes = {};
    rascunho.manuais = {};
    rascunho.status = {};

    expect(operacional.dias[0].principal).toBe('Frango grelhado');
    expect(operacional.ajustes[0]?.frango?.qtd).toBe(99);
    expect(operacional.manuais[0]?.[0]?.item).toBe('Item operacional');
    expect(operacional.status[0]?.frango?.compradoQtd).toBe(4);
  });
});
