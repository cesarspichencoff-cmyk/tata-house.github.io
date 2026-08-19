import { describe, it, expect, beforeEach } from 'vitest';
import { definirArmazenamentoLocalCheio, armazenamentoLocalEstaCheio } from './aviso-armazenamento';

describe('aviso-armazenamento', () => {
  beforeEach(() => {
    definirArmazenamentoLocalCheio(false);
  });

  it('começa falso', () => {
    expect(armazenamentoLocalEstaCheio()).toBe(false);
  });

  it('liga quando uma gravação falha', () => {
    definirArmazenamentoLocalCheio(true);
    expect(armazenamentoLocalEstaCheio()).toBe(true);
  });

  it('desliga assim que uma gravação seguinte dá certo', () => {
    definirArmazenamentoLocalCheio(true);
    definirArmazenamentoLocalCheio(false);
    expect(armazenamentoLocalEstaCheio()).toBe(false);
  });
});
