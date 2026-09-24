import { describe, expect, it } from 'vitest';
import { interpretarQuantidadeCompra, textoQuantidadeCompra } from './quantidade-compra';

describe('quantidade de compra', () => {
  it('não transforma vazio ou zero intermediário em estado compartilhado', () => {
    expect(interpretarQuantidadeCompra('')).toBeNull();
    expect(interpretarQuantidadeCompra('   ')).toBeNull();
    expect(interpretarQuantidadeCompra('0')).toBeNull();
  });

  it('aceita inteiros e decimais com vírgula', () => {
    expect(interpretarQuantidadeCompra('6')).toBe(6);
    expect(interpretarQuantidadeCompra('0,5')).toBe(0.5);
    expect(interpretarQuantidadeCompra('1.25')).toBe(1.25);
  });

  it('rejeita texto inválido e formata para edição humana', () => {
    expect(interpretarQuantidadeCompra('abc')).toBeNull();
    expect(textoQuantidadeCompra(1.5)).toBe('1,5');
  });
});
