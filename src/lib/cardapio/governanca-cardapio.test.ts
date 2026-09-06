import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lerCardapioGovernancaLocal,
  salvarCardapioGovernancaLocal,
  salvarSnapshotCardapioGovernancaLocal,
} from './governanca-cardapio';

function memoriaStorage(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear() {
      dados.clear();
    },
    getItem(chave: string) {
      return dados.get(chave) ?? null;
    },
    key(indice: number) {
      return Array.from(dados.keys())[indice] ?? null;
    },
    removeItem(chave: string) {
      dados.delete(chave);
    },
    setItem(chave: string, valor: string) {
      dados.set(chave, valor);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoriaStorage() });
  vi.stubEnv('NEXT_PUBLIC_TATA_ESPACO', 'tata-house');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('governanca-cardapio', () => {
  it('persiste e lê somente data/unidade exatas', () => {
    const salvo = salvarCardapioGovernancaLocal({
      data: '2026-09-05',
      principal: '  Frango grelhado ',
      guarnicao: ' Legumes ',
      salada: ' Folhas ',
      atualizadoEm: '2026-09-05T15:00:00.000Z',
    });

    expect(salvo).toMatchObject({
      contrato: 'tata-house-governanca',
      versao: 1,
      tipo: 'cardapio.dia',
      origem: 'governanca',
      data: '2026-09-05',
      unidade: 'tata-house',
      principal: 'Frango grelhado',
      guarnicao: 'Legumes',
      salada: 'Folhas',
    });

    expect(lerCardapioGovernancaLocal(new Date(2026, 8, 5))?.principal).toBe('Frango grelhado');
    expect(lerCardapioGovernancaLocal(new Date(2026, 8, 6))).toBeNull();
    expect(lerCardapioGovernancaLocal(new Date(2026, 8, 5), 'outra-unidade')).toBeNull();
  });

  it('rejeita data textual inválida, data impossível ou prato principal vazio', () => {
    expect(
      salvarCardapioGovernancaLocal({ data: '05/09/2026', principal: 'Frango' }),
    ).toBeNull();
    expect(
      salvarCardapioGovernancaLocal({ data: '2026-02-31', principal: 'Frango' }),
    ).toBeNull();
    expect(
      salvarCardapioGovernancaLocal({ data: '2026-09-05', principal: '   ' }),
    ).toBeNull();
  });

  it('rejeita snapshot de fronteira que não satisfaz o contrato v1 completo', () => {
    expect(
      salvarSnapshotCardapioGovernancaLocal({
        contrato: 'tata-house-governanca',
        versao: 1,
        tipo: 'cardapio.dia',
        origem: 'governanca',
        atualizadoEm: '2026-09-05T15:00:00.000Z',
        data: '2026-09-05',
        unidade: 'tata-house',
        principal: 'Frango',
        guarnicao: 123,
        salada: '',
      }),
    ).toBeNull();
  });
});