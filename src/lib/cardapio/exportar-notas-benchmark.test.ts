import { describe, expect, it } from 'vitest';
import { montarPacoteNotasBenchmark } from './exportar-notas-benchmark';

const IMG_A = 'data:image/jpeg;base64,QUJD';
const IMG_B = 'data:image/png;base64,REVG';

describe('exportação read-only de notas para benchmark', () => {
  it('coleta somente anexos de nota válidos', async () => {
    const pacote = await montarPacoteNotasBenchmark(
      [{
        chave: 'anexos.semana.2026-S35',
        valor: {
          notasFiscais: [{ foto: IMG_A, dias: [1, 2], em: '2026-09-01T10:00:00Z' }],
          segredo: 'nao-exportar',
        },
      }],
      [],
      '2026-09-19T12:00:00Z',
    );

    expect(pacote.notes).toHaveLength(1);
    expect(pacote.notes[0]?.semanaId).toBe('2026-S35');
    expect(pacote.notes[0]?.dias).toEqual([1, 2]);
    expect(pacote.notes[0]?.mimeType).toBe('image/jpeg');
    expect(pacote.notes[0]?.bytes).toBe(3);
    expect(JSON.stringify(pacote)).not.toContain('nao-exportar');
  });

  it('remove duplicata entre IndexedDB e legado sem perder dias/data', async () => {
    const pacote = await montarPacoteNotasBenchmark(
      [{
        chave: 'anexos.semana.2026-S35',
        valor: { notas: { 0: IMG_A } },
      }],
      [{
        chave: 'cardapio.v1.semana.2026-S35',
        valor: {
          notasFiscais: [{ foto: IMG_A, dias: [2, 4], em: '2026-09-02T09:00:00Z' }],
        },
      }],
    );

    expect(pacote.imageCandidatesFound).toBe(2);
    expect(pacote.duplicateImagesRemoved).toBe(1);
    expect(pacote.notes).toHaveLength(1);
    expect(pacote.notes[0]?.dias).toEqual([0, 2, 4]);
    expect(pacote.notes[0]?.anexadaEm).toBe('2026-09-02T09:00:00Z');
  });

  it('ignora entradas que não são anexos/semana e dataURL inválida', async () => {
    const pacote = await montarPacoteNotasBenchmark(
      [
        { chave: 'auditoria.v2', valor: { qualquer: 'coisa' } },
        { chave: 'anexos.semana.2026-S36', valor: { notasFiscais: [{ foto: 'https://externo/nota.jpg', dias: [1], em: 'x' }] } },
      ],
      [
        { chave: 'cardapio.v1.precos', valor: { salmao: 99 } },
      ],
    );

    expect(pacote.notes).toHaveLength(0);
    expect(pacote.rawOtherHouseStateIncluded).toBe(false);
    expect(pacote.deviceDataMutated).toBe(false);
    expect(pacote.networkRequired).toBe(false);
  });

  it('normaliza dias e preserva fontes distintas', async () => {
    const pacote = await montarPacoteNotasBenchmark(
      [{
        chave: 'anexos.semana.2026-S37',
        valor: {
          notasFiscais: [{ foto: IMG_B, dias: [6, 1, 1, -1, 9], em: '' }],
        },
      }],
      [],
    );

    expect(pacote.notes[0]?.dias).toEqual([1, 6]);
    expect(pacote.notes[0]?.anexadaEm).toBeNull();
    expect(pacote.notes[0]?.fonte).toBe('INDEXEDDB_NOTAS_FISCAIS');
  });

  it('gera hash estável e id derivado do conteúdo', async () => {
    const a = await montarPacoteNotasBenchmark(
      [{ chave: 'anexos.semana.A', valor: { notas: { 1: IMG_A } } }],
      [],
    );
    const b = await montarPacoteNotasBenchmark(
      [{ chave: 'anexos.semana.B', valor: { notas: { 5: IMG_A } } }],
      [],
    );

    expect(a.notes[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.notes[0]?.id).toBe(b.notes[0]?.id);
    expect(a.notes[0]?.sha256).toBe(b.notes[0]?.sha256);
  });
});
