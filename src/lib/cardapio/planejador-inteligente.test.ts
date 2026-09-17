import { describe, expect, it } from 'vitest';
import { avaliarSemanaInteligente, planejarSemanaInteligente } from './planejador-inteligente';
import type { DiaCardapio } from './tipos';

function dia(principal: string, pessoas = 50): DiaCardapio {
  return {
    pessoas,
    principal,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: '',
    salada: '',
    sobremesa: '',
  };
}

describe('planejador inteligente do cardápio', () => {
  it('mede custo, cobertura e repetição sem inventar evidência', () => {
    const dias = [
      dia('Frango Grelhado'),
      dia('Carne de Panela'),
      dia('Frango Xadrez'),
      dia('Bife Acebolado'),
      dia('Frango Assado'),
      dia('Lombo Suíno'),
      dia('Frango ao Molho'),
    ];
    const m = avaliarSemanaInteligente(dias, {
      precos: {},
      aceitacao: {},
      frequencia: { 'frango grelhado': 2 },
    });

    expect(m.custoTotal).toBe(0);
    expect(m.coberturaPreco).toBe(0);
    expect(m.aceitacaoMedia).toBeNull();
    expect(m.repeticoesRecentes).toBeGreaterThanOrEqual(2);
    expect(m.diversidadePratos).toBe(7);
  });

  it('entrega três estratégias comparáveis para a mesma previsão de pessoas', () => {
    const propostas = planejarSemanaInteligente({
      pessoas: [50, 50, 50, 50, 50, 50, 50],
      precos: {},
      aceitacao: {},
      frequencia: {},
    });

    expect(propostas.map((p) => p.perfil).sort()).toEqual(['economia', 'equilibrado', 'variedade']);
    propostas.forEach((p) => {
      expect(p.dias).toHaveLength(7);
      expect(p.metricas.diversidadePratos).toBe(7);
      expect(p.motivos.length).toBeGreaterThan(0);
    });
  });
});
