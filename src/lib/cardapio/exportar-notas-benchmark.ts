'use client';

import type { EstadoSemana, NotaFiscal } from './tipos';

const PREFIXO_SEMANA = 'cardapio.v1.semana.';

export type FonteNotaBenchmark =
  | 'LOCALSTORAGE_NOTAS_FISCAIS'
  | 'LOCALSTORAGE_NOTA_LEGADO';

export interface NotaBenchmark {
  id: string;
  sha256: string;
  semanaId: string;
  dias: number[];
  anexadaEm: string | null;
  mimeType: string;
  bytes: number;
  fonte: FonteNotaBenchmark;
  dataUrl: string;
}

export interface PacoteNotasBenchmark {
  schemaVersion: 'tata-house.invoice-benchmark-export.v1';
  exportedAt: string;
  source: 'TATA_HOUSE_PRODUCTION_LOCALSTORAGE_READ_ONLY';
  productionBasis: '957548ab012c6205a0ffbdba64d7fe006fe393c4';
  deviceDataMutated: false;
  networkRequired: false;
  rawOtherHouseStateIncluded: false;
  sourceWeekRecordsScanned: number;
  imageCandidatesFound: number;
  duplicateImagesRemoved: number;
  notes: NotaBenchmark[];
}

export interface EntradaSemanaBenchmark {
  chave: string;
  valor: unknown;
}

interface CandidatoNota {
  semanaId: string;
  dias: number[];
  anexadaEm: string | null;
  fonte: FonteNotaBenchmark;
  foto: string;
}

function normalizarDias(dias: unknown): number[] {
  if (!Array.isArray(dias)) return [];
  return Array.from(
    new Set(dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);
}

function candidatosDaSemana(chave: string, valor: unknown): CandidatoNota[] {
  if (!chave.startsWith(PREFIXO_SEMANA) || !valor || typeof valor !== 'object') return [];

  const semanaId = chave.slice(PREFIXO_SEMANA.length);
  const estado = valor as EstadoSemana;
  const out: CandidatoNota[] = [];

  if (Array.isArray(estado.notasFiscais)) {
    for (const nota of estado.notasFiscais as NotaFiscal[]) {
      if (!nota || typeof nota.foto !== 'string') continue;
      out.push({
        semanaId,
        dias: normalizarDias(nota.dias),
        anexadaEm: typeof nota.em === 'string' && nota.em.trim() ? nota.em : null,
        fonte: 'LOCALSTORAGE_NOTAS_FISCAIS',
        foto: nota.foto,
      });
    }
  }

  if (estado.notas && typeof estado.notas === 'object') {
    for (const [dia, foto] of Object.entries(estado.notas)) {
      if (typeof foto !== 'string') continue;
      const n = Number(dia);
      out.push({
        semanaId,
        dias: Number.isInteger(n) && n >= 0 && n <= 6 ? [n] : [],
        anexadaEm: null,
        fonte: 'LOCALSTORAGE_NOTA_LEGADO',
        foto,
      });
    }
  }

  return out;
}

function infoDataUrl(foto: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(foto);
  if (!match) return null;

  const mimeType = match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s+/g, '');

  try {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function escolherFonte(
  atual: FonteNotaBenchmark,
  nova: FonteNotaBenchmark,
): FonteNotaBenchmark {
  if (atual === 'LOCALSTORAGE_NOTAS_FISCAIS') return atual;
  return nova === 'LOCALSTORAGE_NOTAS_FISCAIS' ? nova : atual;
}

export async function montarPacoteNotasBenchmark(
  entradas: EntradaSemanaBenchmark[],
  exportedAt = new Date().toISOString(),
): Promise<PacoteNotasBenchmark> {
  const candidatos = entradas.flatMap((entrada) =>
    candidatosDaSemana(entrada.chave, entrada.valor),
  );

  const porHash = new Map<string, NotaBenchmark>();

  for (const candidato of candidatos) {
    const info = infoDataUrl(candidato.foto);
    if (!info) continue;

    const sha256 = await sha256Hex(info.bytes);
    const anterior = porHash.get(sha256);

    if (anterior) {
      anterior.dias = Array.from(new Set([...anterior.dias, ...candidato.dias])).sort(
        (a, b) => a - b,
      );
      if (!anterior.anexadaEm && candidato.anexadaEm) {
        anterior.anexadaEm = candidato.anexadaEm;
      }
      anterior.fonte = escolherFonte(anterior.fonte, candidato.fonte);
      continue;
    }

    porHash.set(sha256, {
      id: `nf-${sha256.slice(0, 16)}`,
      sha256,
      semanaId: candidato.semanaId,
      dias: candidato.dias,
      anexadaEm: candidato.anexadaEm,
      mimeType: info.mimeType,
      bytes: info.bytes.byteLength,
      fonte: candidato.fonte,
      dataUrl: candidato.foto,
    });
  }

  const notes = Array.from(porHash.values()).sort((a, b) => {
    const dataA = a.anexadaEm ?? '';
    const dataB = b.anexadaEm ?? '';
    return (
      dataA.localeCompare(dataB) ||
      a.semanaId.localeCompare(b.semanaId) ||
      a.sha256.localeCompare(b.sha256)
    );
  });

  return {
    schemaVersion: 'tata-house.invoice-benchmark-export.v1',
    exportedAt,
    source: 'TATA_HOUSE_PRODUCTION_LOCALSTORAGE_READ_ONLY',
    productionBasis: '957548ab012c6205a0ffbdba64d7fe006fe393c4',
    deviceDataMutated: false,
    networkRequired: false,
    rawOtherHouseStateIncluded: false,
    sourceWeekRecordsScanned: entradas.length,
    imageCandidatesFound: candidatos.length,
    duplicateImagesRemoved: Math.max(0, candidatos.length - notes.length),
    notes,
  };
}

function lerSemanasDoLocalStorage(): EntradaSemanaBenchmark[] {
  if (typeof window === 'undefined') return [];

  const entradas: EntradaSemanaBenchmark[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!chave || !chave.startsWith(PREFIXO_SEMANA)) continue;

      const bruto = localStorage.getItem(chave);
      if (!bruto) continue;

      try {
        entradas.push({ chave, valor: JSON.parse(bruto) });
      } catch {
        // Documento inválido é ignorado; nenhuma gravação é feita.
      }
    }
  } catch {
    return entradas;
  }

  return entradas;
}

export async function coletarPacoteNotasBenchmark(): Promise<PacoteNotasBenchmark> {
  return montarPacoteNotasBenchmark(lerSemanasDoLocalStorage());
}

export function arquivoPacoteNotasBenchmark(pacote: PacoteNotasBenchmark): File {
  const dia = pacote.exportedAt.slice(0, 10);
  return new File(
    [JSON.stringify(pacote)],
    `tata-house-notas-benchmark-${dia}.json`,
    { type: 'application/json' },
  );
}

export async function entregarArquivoNotasBenchmark(
  arquivo: File,
): Promise<'SHARE' | 'DOWNLOAD'> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [arquivo] })
  ) {
    await navigator.share({
      files: [arquivo],
      title: 'TATÁ House — notas para benchmark',
      text: 'Exportação local e somente-leitura das fotos de notas fiscais.',
    });
    return 'SHARE';
  }

  const url = URL.createObjectURL(arquivo);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = arquivo.name;
    link.rel = 'noopener';
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return 'DOWNLOAD';
}
