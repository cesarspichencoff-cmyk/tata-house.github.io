import { describe, expect, it } from 'vitest';
import { mesclarDocumentoConcorrente } from './sync-concorrente';

describe('sync-concorrente', () => {
  it('preserva edicoes simultaneas em itens diferentes do mesmo mapa', () => {
    const base = { arroz: 10, feijao: 8 };
    const local = { arroz: 11, feijao: 8 };
    const remoto = { arroz: 10, feijao: 9 };
    const r = mesclarDocumentoConcorrente(base, local, remoto);
    expect(r.conflitos).toEqual([]);
    expect(r.valor).toEqual({ arroz: 11, feijao: 9 });
  });

  it('preserva exclusao quando o outro lado nao alterou o mesmo campo', () => {
    const r = mesclarDocumentoConcorrente({ a: 1, b: 2 }, { b: 2 }, { a: 1, b: 3 });
    expect(r.conflitos).toEqual([]);
    expect(r.valor).toEqual({ b: 3 });
  });

  it('bloqueia publicacao silenciosa quando o mesmo campo mudou dos dois lados', () => {
    const r = mesclarDocumentoConcorrente({ arroz: 10 }, { arroz: 11 }, { arroz: 12 });
    expect(r.conflitos).toEqual(['arroz']);
    expect(r.valor).toEqual({ arroz: 11 });
  });

  it('une adicoes concorrentes em arrays com id', () => {
    const base = [{ id: '1', nome: 'A' }];
    const local = [...base, { id: '2', nome: 'B' }];
    const remoto = [...base, { id: '3', nome: 'C' }];
    const r = mesclarDocumentoConcorrente(base, local, remoto);
    expect(r.conflitos).toEqual([]);
    expect(r.valor).toEqual([{ id: '1', nome: 'A' }, { id: '2', nome: 'B' }, { id: '3', nome: 'C' }]);
  });

  it('une ofertas diferentes pelo fornecedor', () => {
    const base = [{ fornecedor: 'A', preco: 10 }];
    const local = [...base, { fornecedor: 'B', preco: 9 }];
    const remoto = [...base, { fornecedor: 'C', preco: 8 }];
    const r = mesclarDocumentoConcorrente(base, local, remoto);
    expect(r.conflitos).toEqual([]);
    expect((r.valor as unknown[])).toHaveLength(3);
  });
});
