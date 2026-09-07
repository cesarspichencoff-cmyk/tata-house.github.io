import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVENTO_GOVERNANCA_CONTEXTO_V1,
  GOV_CONTEXTO_V1,
  ORIGEM_GOVERNANCA_CONTEXTO_V1,
  instalarContextoGovernanca,
  lerContextoGovernanca,
  normalizarContextoGovernanca,
} from './governanca-contexto';

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

let parentSource: MessageEventSource;
let listeners: Record<string, EventListener>;
let sessionStorageMock: Storage;
let localStorageMock: Storage;

beforeEach(() => {
  parentSource = {} as MessageEventSource;
  listeners = {};
  sessionStorageMock = memoriaStorage();
  localStorageMock = memoriaStorage();

  const janela = {
    parent: parentSource,
    opener: null,
    sessionStorage: sessionStorageMock,
    localStorage: localStorageMock,
    addEventListener: vi.fn((tipo: string, listener: EventListener) => {
      listeners[tipo] = listener;
    }),
    removeEventListener: vi.fn((tipo: string) => {
      delete listeners[tipo];
    }),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal('window', janela);
  vi.stubGlobal(
    'CustomEvent',
    class<T = unknown> {
      type: string;
      detail: T;
      constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('governanca-contexto', () => {
  it('aceita somente contexto descritivo da origem e janela autorizadas', () => {
    const contexto = normalizarContextoGovernanca(
      ORIGEM_GOVERNANCA_CONTEXTO_V1,
      parentSource,
      {
        type: GOV_CONTEXTO_V1,
        payload: { displayName: '  César  ', perfil: '  admin  ' },
      },
    );

    expect(contexto).toMatchObject({
      versao: 1,
      origem: 'lideres',
      displayName: 'César',
      perfil: 'admin',
    });
  });

  it('rejeita origem diferente mesmo com payload válido', () => {
    expect(
      normalizarContextoGovernanca('https://example.com', parentSource, {
        type: GOV_CONTEXTO_V1,
        payload: { displayName: 'César', perfil: 'admin' },
      }),
    ).toBeNull();
  });

  it('rejeita uma janela que não é parent nem opener', () => {
    expect(
      normalizarContextoGovernanca(
        ORIGEM_GOVERNANCA_CONTEXTO_V1,
        {} as MessageEventSource,
        {
          type: GOV_CONTEXTO_V1,
          payload: { displayName: 'César', perfil: 'admin' },
        },
      ),
    ).toBeNull();
  });

  it('falha fechado quando tentam enviar token, papel ou permissões', () => {
    for (const campo of ['token', 'papel', 'permissoes', 'pin']) {
      expect(
        normalizarContextoGovernanca(
          ORIGEM_GOVERNANCA_CONTEXTO_V1,
          parentSource,
          {
            type: GOV_CONTEXTO_V1,
            payload: { displayName: 'César', perfil: 'admin', [campo]: 'administrador' },
          },
        ),
      ).toBeNull();
    }
  });

  it('persiste somente em sessionStorage e não altera autorização do House', () => {
    localStorageMock.setItem('cardapio.v1.papel', JSON.stringify('cozinha'));
    localStorageMock.setItem('cardapio.v1.login.perfil', JSON.stringify('cozinha'));

    instalarContextoGovernanca();
    expect(listeners.message).toBeTypeOf('function');

    listeners.message({
      origin: ORIGEM_GOVERNANCA_CONTEXTO_V1,
      source: parentSource,
      data: {
        type: GOV_CONTEXTO_V1,
        payload: { displayName: 'César', perfil: 'admin' },
      },
    } as unknown as Event);

    expect(lerContextoGovernanca()).toMatchObject({
      versao: 1,
      origem: 'lideres',
      displayName: 'César',
      perfil: 'admin',
    });
    expect(localStorageMock.getItem('cardapio.v1.papel')).toBe(JSON.stringify('cozinha'));
    expect(localStorageMock.getItem('cardapio.v1.login.perfil')).toBe(JSON.stringify('cozinha'));
    expect((window.dispatchEvent as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    const evento = (window.dispatchEvent as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      type: string;
    };
    expect(evento.type).toBe(EVENTO_GOVERNANCA_CONTEXTO_V1);
  });
});
