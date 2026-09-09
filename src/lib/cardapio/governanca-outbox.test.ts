import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTRATO_GOVERNANCA,
  LIMITE_PENDENCIAS_GOVERNANCA,
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
    expect(evento?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(listarPendenciasGovernanca()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém UUID v4 mesmo sem crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = i + 1;
        return bytes;
      },
    });

    const evento = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato fallback',
      voto: 'ok',
    });

    expect(evento?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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

  it('rejeita Date inválida antes de persistir', () => {
    const evento = registrarAvaliacaoGovernancaPendente({
      data: new Date('invalida'),
      prato: 'Peixe',
      voto: 'bom',
    });
    expect(evento).toBeNull();
    expect(listarPendenciasGovernanca()).toEqual([]);
  });

  it('falha fechada no limite sem descartar pendências antigas', () => {
    const existentes = Array.from({ length: LIMITE_PENDENCIAS_GOVERNANCA }, (_, i) => ({
      id: `pendente-${i}`,
      tipo: 'avaliacao.prato',
      origem: 'tata-house',
      criadoEm: '2026-09-05T15:00:00.000Z',
      data: '2026-09-05',
      unidade: 'tata-house',
      prato: `Prato ${i}`,
      voto: 'bom',
    }));
    window.localStorage.setItem('tata.governanca.outbox.v1', JSON.stringify(existentes));

    const novo = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato novo',
      voto: 'ruim',
    });

    expect(novo).toBeNull();
    expect(listarPendenciasGovernanca()).toHaveLength(LIMITE_PENDENCIAS_GOVERNANCA);
    expect(listarPendenciasGovernanca()[0]?.id).toBe('pendente-0');
    expect(listarPendenciasGovernanca().at(-1)?.id).toBe(`pendente-${LIMITE_PENDENCIAS_GOVERNANCA - 1}`);
  });

  it('filtra registros locais que violam o contrato v1', () => {
    window.localStorage.setItem(
      'tata.governanca.outbox.v1',
      JSON.stringify([
        {
          id: 'ok-1',
          tipo: 'avaliacao.prato',
          origem: 'tata-house',
          criadoEm: '2026-09-05T15:00:00.000Z',
          data: '2026-09-05',
          unidade: 'tata-house',
          prato: 'Frango',
          voto: 'bom',
        },
        {
          id: 'timestamp-incompleto',
          tipo: 'avaliacao.prato',
          origem: 'tata-house',
          criadoEm: '2026-09-05',
          data: '2026-09-05',
          unidade: 'tata-house',
          prato: 'Sopa',
          voto: 'bom',
        },
        {
          id: 'data-impossivel',
          tipo: 'avaliacao.prato',
          origem: 'tata-house',
          criadoEm: '2026-09-05T15:00:00.000Z',
          data: '2026-02-31',
          unidade: 'tata-house',
          prato: 'Peixe',
          voto: 'ok',
        },
        {
          id: 'campo-extra',
          tipo: 'avaliacao.prato',
          origem: 'tata-house',
          criadoEm: '2026-09-05T15:00:00.000Z',
          data: '2026-09-05',
          unidade: 'tata-house',
          prato: 'Carne',
          voto: 'ruim',
          segredo: 'não pertence ao contrato',
        },
        {
          id: 'comentario-longo',
          tipo: 'avaliacao.prato',
          origem: 'tata-house',
          criadoEm: '2026-09-05T15:00:00.000Z',
          data: '2026-09-05',
          unidade: 'tata-house',
          prato: 'Massa',
          voto: 'bom',
          comentario: 'x'.repeat(1001),
        },
      ]),
    );

    expect(listarPendenciasGovernanca().map((e) => e.id)).toEqual(['ok-1']);
  });
});
