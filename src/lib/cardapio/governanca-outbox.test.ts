import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTRATO_GOVERNANCA,
  VERSAO_CONTRATO_GOVERNANCA,
  confirmarEventosGovernanca,
  criarPacoteGovernanca,
  dataLocalIso,
  listarPendenciasGovernanca,
  registrarAvaliacaoGovernancaPendente,
} from './governanca-outbox';

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

describe('governanca-outbox', () => {
  it('formata a data no calendário local', () => {
    expect(dataLocalIso(new Date(2026, 8, 5, 23, 30, 0))).toBe('2026-09-05');
  });

  it('registra avaliação local sem chamar rede', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const evento = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: '  Frango grelhado  ',
      voto: 'bom',
      comentario: '  Muito bom  ',
    });

    expect(evento).toMatchObject({
      tipo: 'avaliacao.prato',
      origem: 'tata-house',
      data: '2026-09-05',
      unidade: 'tata-house',
      prato: 'Frango grelhado',
      voto: 'bom',
      comentario: 'Muito bom',
    });
    expect(listarPendenciasGovernanca()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirma somente IDs explicitamente aceitos', () => {
    const a = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato A',
      voto: 'ok',
    });
    const b = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato B',
      voto: 'ruim',
    });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(confirmarEventosGovernanca([a!.id])).toBe(1);
    expect(listarPendenciasGovernanca().map((e) => e.id)).toEqual([b!.id]);
  });

  it('gera pacote portátil sem consumir a outbox', () => {
    registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Yakissoba',
      voto: 'bom',
    });

    const pacote = criarPacoteGovernanca();
    expect(pacote.contrato).toBe(CONTRATO_GOVERNANCA);
    expect(pacote.versao).toBe(VERSAO_CONTRATO_GOVERNANCA);
    expect(pacote.eventos).toHaveLength(1);
    expect(listarPendenciasGovernanca()).toHaveLength(1);
  });

  it('limita comentário a 1000 caracteres', () => {
    const evento = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Peixe',
      voto: 'bom',
      comentario: 'x'.repeat(1200),
    });
    expect(evento?.comentario).toHaveLength(1000);
  });
});
