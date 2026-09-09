import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lerUnidadeFonteGovernancaLocal,
  normalizarUnidadeFonteGovernanca,
  salvarUnidadeFonteGovernancaLocal,
  unidadeFonteGovernancaLocal,
} from './governanca-unidade-fonte';

function memoriaStorage(): Storage {
  const dados = new Map<string, string>();
  return {
    get length(){ return dados.size; }, clear(){ dados.clear(); },
    getItem(k){ return dados.get(k) ?? null; }, key(i){ return Array.from(dados.keys())[i] ?? null; },
    removeItem(k){ dados.delete(k); }, setItem(k,v){ dados.set(k,v); }
  };
}

beforeEach(()=>vi.stubGlobal('window',{ localStorage: memoriaStorage() }));
afterEach(()=>{ vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('governanca-unidade-fonte',()=>{
  it('guarda a unidade fonte somente para a mesma data',()=>{
    expect(salvarUnidadeFonteGovernancaLocal({data:'2026-09-06',unidadeFonte:'Itaim',recebidoEm:'2026-09-06T10:00:00.000Z'})).toMatchObject({unidadeFonte:'Itaim'});
    expect(unidadeFonteGovernancaLocal(new Date(2026,8,6))).toBe('Itaim');
    expect(lerUnidadeFonteGovernancaLocal(new Date(2026,8,7))).toBeNull();
  });
  it('rejeita data impossível, timestamp inválido e campos extras',()=>{
    expect(normalizarUnidadeFonteGovernanca({data:'2026-02-31',unidadeFonte:'Itaim',recebidoEm:'2026-09-06T10:00:00.000Z'})).toBeNull();
    expect(normalizarUnidadeFonteGovernanca({data:'2026-09-06',unidadeFonte:'Itaim',recebidoEm:'ontem'})).toBeNull();
    expect(normalizarUnidadeFonteGovernanca({data:'2026-09-06',unidadeFonte:'Itaim',recebidoEm:'2026-09-06T10:00:00.000Z',extra:true})).toBeNull();
  });
});
