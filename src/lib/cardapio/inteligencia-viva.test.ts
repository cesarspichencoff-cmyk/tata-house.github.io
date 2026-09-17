import { describe, expect, it } from 'vitest';
import { construirInteligenciaViva, estimarValorDesperdicio } from './inteligencia-viva';
import type { EstadoSemana, RegistroDesperdicio } from './tipos';

function estadoBase(): EstadoSemana {
  return {
    versao: 1,
    orcamento: null,
    dias: Array.from({ length: 7 }, () => ({
      pessoas: 10,
      principal: '',
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
  };
}

function entrada() {
  return {
    semanaId: '2026-S38',
    datasSemana: ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20'],
    estado: estadoBase(),
    precos: {},
    estimativas: {},
    desperdicio: [],
    contagens: [
      { data: '2026-09-14', almoco: 8, jantar: 0, marmitas: 0, registradoEm: '2026-09-14T20:00:00Z' },
      { data: '2026-09-15', almoco: 9, jantar: 0, marmitas: 0, registradoEm: '2026-09-15T20:00:00Z' },
    ],
    estoque: {},
    ofertas: {},
    fornecedores: {},
    historicoPrecos: {},
    aceitacao: {},
    lancamentos: [
      { id: 'nf1', data: '2026-09-15', fornecedor: 'Fornecedor A', total: 123.45, itens: [], origem: 'nf' as const, em: '2026-09-15T10:00:00Z' },
      { id: 'nf2', data: '2026-09-01', fornecedor: 'Fornecedor B', total: 999, itens: [], origem: 'nf' as const, em: '2026-09-01T10:00:00Z' },
    ],
  };
}

describe('inteligência gerencial viva', () => {
  it('cruza somente NFs da semana e mantém classe de evidência explícita', () => {
    const r = construirInteligenciaViva(entrada());
    expect(r.notasFiscais.valor).toBe(123.45);
    expect(r.notasFiscais.classe).toBe('comprovado');
    expect(r.notasFiscais.coberturaPct).toBe(100);
  });

  it('compara demanda real disponível com a previsão sem inventar dias ausentes', () => {
    const r = construirInteligenciaViva(entrada());
    expect(r.refeicoesPrevistas).toBe(70);
    expect(r.refeicoesReais).toBe(17);
    expect(r.erroDemanda).toBe(-53);
    expect(r.erroDemandaPct).toBeCloseTo(-75.714, 2);
  });

  it('não transforma sobra sem base culinária em dinheiro fictício', () => {
    const reg: RegistroDesperdicio = {
      id: 'd1', dia: 0, prato: 'Prato inexistente', produzido: 10, consumido: 5, unid: 'kg', em: '2026-09-14T20:00:00Z',
    };
    const r = estimarValorDesperdicio(reg, { estado: estadoBase(), precos: {}, estimativas: {} });
    expect(r.valor).toBeNull();
    expect(r.metodo).toBe('sem-base');
  });

  it('sobra zero vale zero sem depender de preço', () => {
    const reg: RegistroDesperdicio = {
      id: 'd2', dia: 0, prato: 'Qualquer', produzido: 10, consumido: 10, unid: 'porções', em: '2026-09-14T20:00:00Z',
    };
    const r = estimarValorDesperdicio(reg, { estado: estadoBase(), precos: {}, estimativas: {} });
    expect(r.valor).toBe(0);
  });
});
