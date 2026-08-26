import { beforeEach, describe, expect, it } from 'vitest';
import { aplicarRawRemoto, gravarRawCache, lerRawCache, listarChavesCache } from './cache-local';

class StorageFake {
  data = new Map<string, string>();
  falhar = false;

  get length() { return this.data.size; }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.falhar) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.data.set(k, v);
  }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}

let n = 0;
let local: StorageFake;

beforeEach(() => {
  local = new StorageFake();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: local },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: local,
    configurable: true,
  });
});

describe('cache-local', () => {
  it('mantém a edição na sombra quando localStorage estoura quota', () => {
    const k = `cardapio.v1.teste-quota-${++n}`;
    local.falhar = true;
    expect(gravarRawCache(k, JSON.stringify({ principal: 'Feijoada' }))).toBe(false);
    expect(JSON.parse(lerRawCache(k)!)).toEqual({ principal: 'Feijoada' });
    expect(local.getItem(k)).toBeNull();
  });

  it('valor remoto continua visível mesmo se o cache físico falhar', () => {
    const k = `cardapio.v1.teste-remoto-${++n}`;
    local.data.set(k, JSON.stringify({ versao: 'velha' }));
    local.falhar = true;
    expect(aplicarRawRemoto(k, JSON.stringify({ versao: 'nuvem' }))).toBe(false);
    expect(JSON.parse(lerRawCache(k)!)).toEqual({ versao: 'nuvem' });
    expect(JSON.parse(local.getItem(k)!)).toEqual({ versao: 'velha' });
  });

  it('lista também chaves que só existem na sombra', () => {
    const k = `cardapio.v1.teste-lista-${++n}`;
    local.falhar = true;
    gravarRawCache(k, '1');
    expect(listarChavesCache('cardapio.v1.')).toContain(k);
  });
});
