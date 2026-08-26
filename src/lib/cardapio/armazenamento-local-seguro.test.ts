import { describe, expect, it } from 'vitest';
import {
  ehErroDeQuota,
  gravarComRecuperacaoDeQuota,
  liberarHistoricosLocais,
} from './armazenamento-local-seguro';

class StorageFake {
  dados = new Map<string, string>();
  limite = Infinity;

  get length() { return this.dados.size; }
  key(i: number) { return Array.from(this.dados.keys())[i] ?? null; }
  getItem(k: string) { return this.dados.get(k) ?? null; }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  setItem(k: string, v: string) {
    const clone = new Map(this.dados);
    clone.set(k, v);
    const tamanho = Array.from(clone.entries()).reduce((s, [a, b]) => s + a.length + b.length, 0);
    if (tamanho > this.limite) {
      const e = new Error('Quota exceeded');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.dados = clone;
  }
}

describe('armazenamento-local-seguro', () => {
  it('reconhece QuotaExceededError', () => {
    const e = new Error('Quota exceeded');
    e.name = 'QuotaExceededError';
    expect(ehErroDeQuota(e)).toBe(true);
  });

  it('remove somente históricos __hist.*', () => {
    const s = new StorageFake();
    s.dados.set('cardapio.v1.__hist.2026-S34', 'x'.repeat(50));
    s.dados.set('cardapio.v1.__hist.2026-S35', 'x'.repeat(50));
    s.dados.set('cardapio.v1.semana.2026-S35', 'CARDAPIO');
    s.dados.set('cardapio.v1.precos', 'PRECOS');
    s.dados.set('cardapio.v1.__base.semana.2026-S35', 'BASE');

    expect(liberarHistoricosLocais(s as unknown as Storage)).toBe(2);
    expect(s.getItem('cardapio.v1.__hist.2026-S34')).toBeNull();
    expect(s.getItem('cardapio.v1.__hist.2026-S35')).toBeNull();
    expect(s.getItem('cardapio.v1.semana.2026-S35')).toBe('CARDAPIO');
    expect(s.getItem('cardapio.v1.precos')).toBe('PRECOS');
    expect(s.getItem('cardapio.v1.__base.semana.2026-S35')).toBe('BASE');
  });

  it('quando a quota estoura, libera histórico e repete a mesma gravação', () => {
    const s = new StorageFake();
    s.dados.set('cardapio.v1.__hist.2026-S34', 'h'.repeat(200));
    s.dados.set('cardapio.v1.semana.2026-S34', 'ANTERIOR');
    s.limite = 180;

    const r = gravarComRecuperacaoDeQuota(
      s as unknown as Storage,
      'cardapio.v1.semana.2026-S35',
      'NOVO-CARDAPIO',
    );

    expect(r.ok).toBe(true);
    expect(r.quota).toBe(true);
    expect(r.historicosRemovidos).toBe(1);
    expect(s.getItem('cardapio.v1.semana.2026-S35')).toBe('NOVO-CARDAPIO');
    expect(s.getItem('cardapio.v1.semana.2026-S34')).toBe('ANTERIOR');
  });

  it('não apaga nada quando o erro não é de quota', () => {
    const s = new StorageFake();
    s.dados.set('cardapio.v1.__hist.2026-S35', 'HIST');
    const storage = s as unknown as Storage;
    storage.setItem = () => { throw new Error('Storage indisponível'); };

    const r = gravarComRecuperacaoDeQuota(storage, 'cardapio.v1.precos', 'X');
    expect(r.ok).toBe(false);
    expect(r.quota).toBe(false);
    expect(s.getItem('cardapio.v1.__hist.2026-S35')).toBe('HIST');
  });
});
