import { describe, it, expect } from 'vitest';
import { converterPreco, precoPorEmbalagem } from './unidades';

describe('conversão de unidade na cotação', () => {
  it('mesma unidade passa direto', () => {
    expect(converterPreco(32, 'kg', 'kg')).toEqual({ valor: 32, status: 'igual' });
  });

  it('grama para quilo converte com exatidão', () => {
    const c = converterPreco(0.032, 'g', 'kg');
    expect(c.status).toBe('convertido');
    expect(c.valor).toBeCloseTo(32, 6);
  });

  it('quilo para grama também converte', () => {
    const c = converterPreco(32, 'kg', 'g');
    expect(c.status).toBe('convertido');
    expect(c.valor).toBeCloseTo(0.032, 6);
  });

  it('ml para litro converte', () => {
    const c = converterPreco(0.009, 'ml', 'l');
    expect(c.status).toBe('convertido');
    expect(c.valor).toBeCloseTo(9, 6);
  });

  it('CAIXA para quilo é bloqueado — este era o erro que inflava o custo', () => {
    // Fornecedor cota a caixa por R$ 240 e o item é medido em kg. Antes, o
    // app aplicava R$ 240,00/kg. Agora não aplica nada até saber o conteúdo.
    const c = converterPreco(240, 'CX', 'kg');
    expect(c.status).toBe('incompativel');
    expect(c.motivo).toContain('embalagem');
  });

  it('pacote, fardo, saco e unidade também bloqueiam', () => {
    for (const u of ['PCT', 'FD', 'SC', 'UN', 'DZ']) {
      expect(converterPreco(100, u, 'kg').status).toBe('incompativel');
    }
  });

  it('massa não converte para volume', () => {
    expect(converterPreco(10, 'kg', 'l').status).toBe('incompativel');
  });

  it('unidade ausente não vira acusação', () => {
    expect(converterPreco(32, null, 'kg').status).toBe('igual');
    expect(converterPreco(32, 'kg', undefined).status).toBe('igual');
  });

  it('aceita variações de escrita e acento', () => {
    // "Quilo" e "kg" são a mesma unidade escrita de outro jeito: o que importa
    // é o valor sair intacto e não ser bloqueado — não o rótulo do status.
    const quilo = converterPreco(32, 'Quilo', 'kg');
    expect(quilo.status).not.toBe('incompativel');
    expect(quilo.valor).toBeCloseTo(32, 6);

    expect(converterPreco(100, 'Dúzia', 'kg').status).toBe('incompativel');
  });

  it('com o conteúdo da embalagem informado, o preço unitário sai certo', () => {
    expect(precoPorEmbalagem(240, 20)).toBeCloseTo(12, 6);
    expect(precoPorEmbalagem(240, 0)).toBeNull();
    expect(precoPorEmbalagem(0, 20)).toBeNull();
  });
});
