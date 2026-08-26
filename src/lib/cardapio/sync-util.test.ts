import { describe, expect, it } from 'vitest';
import { adicionarEcoRecente, ehEcoProprio, serializarCanonico } from './sync-util';

describe('sync-util', () => {
  it('serializa objetos de forma estável independentemente da ordem das chaves', () => {
    expect(serializarCanonico({ b: 2, a: 1 })).toBe(serializarCanonico({ a: 1, b: 2 }));
  });

  it('ignora eco somente quando o valor local ainda coincide', () => {
    let ecos = adicionarEcoRecente(undefined, { a: 1 }, 1_000);
    ecos = adicionarEcoRecente(ecos, { a: 2 }, 2_000);
    expect(ehEcoProprio(ecos, { a: 2 }, { a: 2 }, 2_500)).toBe(true);
    expect(ehEcoProprio(ecos, { a: 1 }, { a: 2 }, 2_500)).toBe(false);
  });

  it('não ignora atualização diferente de outro aparelho na mesma janela', () => {
    const ecos = adicionarEcoRecente(undefined, { a: 1 }, 1_000);
    expect(ehEcoProprio(ecos, { a: 9 }, { a: 1 }, 2_000)).toBe(false);
  });

  it('não ignora atualização depois da janela de eco', () => {
    const ecos = adicionarEcoRecente(undefined, { a: 1 }, 1_000);
    expect(ehEcoProprio(ecos, { a: 1 }, { a: 1 }, 9_000)).toBe(false);
  });
});
