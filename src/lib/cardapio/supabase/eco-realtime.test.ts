import { describe, expect, it } from 'vitest';
import { ehEcoProprio } from './eco-realtime';

describe('ehEcoProprio', () => {
  it('ignora o eco exato da própria escrita dentro da janela', () => {
    expect(
      ehEcoProprio(
        { ts: 1000, valor: { principal: 'Feijoada', pessoas: 20 } },
        { principal: 'Feijoada', pessoas: 20 },
        2000,
      ),
    ).toBe(true);
  });

  it('NÃO ignora alteração diferente de outro usuário na mesma chave', () => {
    expect(
      ehEcoProprio(
        { ts: 1000, valor: { principal: 'Feijoada', pessoas: 20 } },
        { principal: 'Frango', pessoas: 20 },
        2000,
      ),
    ).toBe(false);
  });

  it('não trata como eco depois da janela', () => {
    expect(
      ehEcoProprio({ ts: 1000, valor: { x: 1 } }, { x: 1 }, 9001, 8000),
    ).toBe(false);
  });
});
