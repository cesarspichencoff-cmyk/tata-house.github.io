import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerCardapioGovernancaLocal } from './governanca-cardapio';
import {
  GOV_HANDOFF_CARDAPIO_V1,
  processarMensagemCardapioGovernanca,
} from './governanca-handoff';

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

const ORIGEM = 'https://lideres.tatasushi.tech';

function mensagemValida() {
  return {
    type: GOV_HANDOFF_CARDAPIO_V1,
    correlationId: 'corr-001',
    sourceUnit: 'Itaim',
    payload: {
      contrato: 'tata-house-governanca',
      versao: 1,
      tipo: 'cardapio.dia',
      origem: 'governanca',
      atualizadoEm: '2026-09-05T18:30:00.000Z',
      data: '2026-09-05',
      unidade: 'tata-house',
      principal: 'Frango grelhado',
      guarnicao: 'Legumes',
      salada: 'Folhas',
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

describe('governanca-handoff', () => {
  it('aceita somente a origem autorizada e persiste o snapshot canônico', () => {
    const resultado = processarMensagemCardapioGovernanca(ORIGEM, mensagemValida(), ORIGEM);

    expect(resultado.tratado).toBe(true);
    expect(resultado.aceito).toBe(true);
    expect(resultado.correlationId).toBe('corr-001');
    expect(resultado.unidadeFonte).toBe('Itaim');
    expect(resultado.snapshot?.principal).toBe('Frango grelhado');
    expect(lerCardapioGovernancaLocal(new Date(2026, 8, 5))?.principal).toBe('Frango grelhado');
  });

  it('ignora mensagem idêntica quando a origem não é a autorizada', () => {
    const resultado = processarMensagemCardapioGovernanca(
      'https://exemplo-invalido.test',
      mensagemValida(),
      ORIGEM,
    );

    expect(resultado).toEqual({ tratado: false, aceito: false });
    expect(lerCardapioGovernancaLocal(new Date(2026, 8, 5))).toBeNull();
  });

  it('trata, mas rejeita, payload que viola o contrato v1', () => {
    const mensagem = mensagemValida();
    mensagem.payload.data = '2026-02-31';

    const resultado = processarMensagemCardapioGovernanca(ORIGEM, mensagem, ORIGEM);

    expect(resultado).toEqual({ tratado: true, aceito: false, correlationId: 'corr-001' });
    expect(lerCardapioGovernancaLocal(new Date(2026, 1, 28))).toBeNull();
  });
});