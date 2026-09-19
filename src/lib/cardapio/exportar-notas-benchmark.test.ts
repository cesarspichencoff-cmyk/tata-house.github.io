import { describe, expect, it } from 'vitest';
import { montarPacoteNotasBenchmark } from './exportar-notas-benchmark';

const IMG_A = 'data:image/jpeg;base64,QUJD';
const IMG_B = 'data:image/png;base64,REVG';

describe('exportação read-only das notas da produção v15.5.10', () => {
  it('exporta somente fotos de notas dentro das semanas', async () => {
    const pacote = await montarPacoteNotasBenchmark(
      [
        {
          chave: 'cardapio.v1.semana.2026-S35',
          valor: {
            notasFiscais: [
              { foto: IMG_A, dias: [1, 2], em: '2026-09-01T10:00:00Z' },
            ],
            segredo: 'nao-exportar',
          },
        },
        { chave: 'cardapio.v1.precos', valor: { salmao: 99 } },
      ],
      '2026-09-19T12:00:00Z',
    );

    expect(pacote.notes).toHaveLength(1);
    expect(pacote.notes[0]?.semanaId).toBe('2026-S35');
    expect(pacote.notes[0]?.dias).toEqual([1, 2]);
    expect(pacote.notes[0]?.mimeType).toBe('image/jpeg');
    expect(pacote.notes[0]?.bytes).toBe(3);
    expect(JSON.stringify(pacote)).not.toContain('nao-exportar');
    expect(pacote.rawOtherHouseStateIncluded).toBe(false);
    expect(pacote.deviceDataMutated).toBe(false);
    expect(pacote.networkRequired).toBe(false);
  });

  it('remove duplicata entre formato atual e legado', async () => {
    const pacote = await montarPacoteNotasBenchmark([
      {
        chave: 'cardapio.v1.semana.2026-S35',
        valor: {
          notas: { 0: IMG_A },
          notasFiscais: [
            { foto: IMG_A, dias: [2, 4], em: '2026-09-02T09:00:00Z' },
          ],
        },
      },
    ]);

    expect(pacote.imageCandidatesFound).toBe(2);
    expect(pacote.duplicateImagesRemoved).toBe(1);
    expect(pacote.notes).toHaveLength(1);
    expect(pacote.notes[0]?.dias).toEqual([0, 2, 4]);
    expect(pacote.notes[0]?.anexadaEm).toBe('2026-09-02T09:00:00Z');
    expect(pacote.notes[0]?.fonte).toBe('LOCALSTORAGE_NOTAS_FISCAIS');
  });

  it('ignora URL externa e dataURL inválida', async () => {
    const pacote = await montarPacoteNotasBenchmark([
      {
        chave: 'cardapio.v1.semana.2026-S36',
        valor: {
          notasFiscais: [
            { foto: 'https://externo/nota.jpg', dias: [1], em: 'x' },
            { foto: 'data:image/jpeg;base64,***', dias: [2], em: 'x' },
          ],
        },
      },
    ]);

    expect(pacote.notes).toHaveLength(0);
  });

  it('normaliza dias e preserva metadados seguros', async () => {
    const pacote = await montarPacoteNotasBenchmark([
      {
        chave: 'cardapio.v1.semana.2026-S37',
        valor: {
          notasFiscais: [
            { foto: IMG_B, dias: [6, 1, 1, -1, 9], em: '' },
          ],
        },
      },
    ]);

    expect(pacote.notes[0]?.dias).toEqual([1, 6]);
    expect(pacote.notes[0]?.anexadaEm).toBeNull();
    expect(pacote.source).toBe('TATA_HOUSE_PRODUCTION_LOCALSTORAGE_READ_ONLY');
    expect(pacote.productionBasis).toBe(
      '957548ab012c6205a0ffbdba64d7fe006fe393c4',
    );
  });

  it('gera hash estável derivado apenas da imagem', async () => {
    const a = await montarPacoteNotasBenchmark([
      {
        chave: 'cardapio.v1.semana.A',
        valor: { notas: { 1: IMG_A } },
      },
    ]);
    const b = await montarPacoteNotasBenchmark([
      {
        chave: 'cardapio.v1.semana.B',
        valor: { notas: { 5: IMG_A } },
      },
    ]);

    expect(a.notes[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.notes[0]?.id).toBe(b.notes[0]?.id);
    expect(a.notes[0]?.sha256).toBe(b.notes[0]?.sha256);
  });
});
