import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listarPendenciasGovernanca,
  registrarAvaliacaoGovernancaPendente,
} from './governanca-outbox';
import {
  sincronizarPendenciasGovernanca,
  type TransporteGovernancaV1,
} from './governanca-sync';

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

describe('governanca-sync', () => {
  it('não chama transporte quando a fila está vazia', async () => {
    const enviarAvaliacoes = vi.fn();
    const transporte: TransporteGovernancaV1 = { enviarAvaliacoes };

    await expect(sincronizarPendenciasGovernanca(transporte)).resolves.toEqual({
      tentados: 0,
      confirmados: 0,
      pendentes: 0,
    });
    expect(enviarAvaliacoes).not.toHaveBeenCalled();
  });

  it('remove apenas eventos confirmados pelo transporte', async () => {
    const a = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato A',
      voto: 'bom',
    });
    const b = registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato B',
      voto: 'ok',
    });

    const transporte: TransporteGovernancaV1 = {
      enviarAvaliacoes: vi.fn(async () => ({
        confirmados: [a!.id, 'id-que-nao-foi-enviado'],
      })),
    };

    await expect(sincronizarPendenciasGovernanca(transporte)).resolves.toEqual({
      tentados: 2,
      confirmados: 1,
      pendentes: 1,
    });
    expect(listarPendenciasGovernanca().map((evento) => evento.id)).toEqual([b!.id]);
  });

  it('preserva a fila inteira se o transporte falhar', async () => {
    registrarAvaliacaoGovernancaPendente({
      data: new Date(2026, 8, 5),
      prato: 'Prato A',
      voto: 'ruim',
    });

    const transporte: TransporteGovernancaV1 = {
      enviarAvaliacoes: vi.fn(async () => {
        throw new Error('offline');
      }),
    };

    await expect(sincronizarPendenciasGovernanca(transporte)).rejects.toThrow('offline');
    expect(listarPendenciasGovernanca()).toHaveLength(1);
  });
});
