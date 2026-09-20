'use client';

import type { AnexosSemana } from './anexos-semana';
import type { EstadoSemana, NotaFiscal } from './tipos';

const PREFIXO_LOCAL = 'cardapio.v1.semana.';
const PREFIXO_ANEXO = 'anexos.semana.';
const DB_NOME = 'tata-house-v2';
const LOJA_ESTADO = 'estado';

export type FonteNotaBenchmark = 'INDEXEDDB_NOTAS_FISCAIS' | 'INDEXEDDB_NOTA_LEGADO' | 'LOCALSTORAGE_NOTAS_FISCAIS' | 'LOCALSTORAGE_NOTA_LEGADO';

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
  source: 'TATA_HOUSE_LOCAL_DEVICE_READ_ONLY';
  deviceDataMutated: false;
  networkRequired: false;
  rawOtherHouseStateIncluded: false;
  sourceRecordsScanned: number;
  imageCandidatesFound: number;
  duplicateImagesRemoved: number;
  notes: NotaBenchmark[];
}

interface CandidatoNota {
  semanaId: string;
  dias: number[];
  anexadaEm: string | null;
  fonte: FonteNotaBenchmark;
  foto: string;
}

export interface EntradaAnexoBenchmark {
  chave: string;
  valor: unknown;
}

function normalizarDias(dias: unknown): number[] {
  if (!Array.isArray(dias)) return [];
  return Array.from(new Set(dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
}

function candidatosDeAnexos(semanaId: string, anexos: AnexosSemana, origem: 'INDEXEDDB' | 'LOCALSTORAGE'): CandidatoNota[] {
  const out: CandidatoNota[] = [];

  if (Array.isArray(anexos.notasFiscais)) {
    for (const nota of anexos.notasFiscais as NotaFiscal[]) {
      if (!nota || typeof nota.foto !== 'string') continue;
      out.push({
        semanaId,
        dias: normalizarDias(nota.dias),
        anexadaEm: typeof nota.em === 'string' && nota.em.trim() ? nota.em : null,
        fonte: origem === 'INDEXEDDB' ? 'INDEXEDDB_NOTAS_FISCAIS' : 'LOCALSTORAGE_NOTAS_FISCAIS',
        foto: nota.foto,
      });
    }
  }

  if (anexos.notas && typeof anexos.notas === 'object') {
    for (const [dia, foto] of Object.entries(anexos.notas)) {
      if (typeof foto !== 'string') continue;
      const n = Number(dia);
      out.push({
        semanaId,
        dias: Number.isInteger(n) && n >= 0 && n <= 6 ? [n] : [],
        anexadaEm: null,
        fonte: origem === 'INDEXEDDB' ? 'INDEXEDDB_NOTA_LEGADO' : 'LOCALSTORAGE_NOTA_LEGADO',
        foto,
      });
    }
  }

  return out;
}

function infoDataUrl(foto: string): { mimeType: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(foto);
  if (!m) return null;

  const mimeType = m[1]!.toLowerCase();
  const b64 = m[2]!.replace(/\s+/g, '');
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
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

function escolherFonte(atual: FonteNotaBenchmark, nova: FonteNotaBenchmark): FonteNotaBenchmark {
  const peso: Record<FonteNotaBenchmark, number> = {
    INDEXEDDB_NOTAS_FISCAIS: 4,
    LOCALSTORAGE_NOTAS_FISCAIS: 3,
    INDEXEDDB_NOTA_LEGADO: 2,
    LOCALSTORAGE_NOTA_LEGADO: 1,
  };
  return peso[nova] > peso[atual] ? nova : atual;
}

export async function montarPacoteNotasBenchmark(
  entradasIdb: EntradaAnexoBenchmark[],
  entradasLegado: EntradaAnexoBenchmark[],
  exportedAt = new Date().toISOString(),
): Promise<PacoteNotasBenchmark> {
  const candidatos: CandidatoNota[] = [];

  for (const entrada of entradasIdb) {
    if (!entrada.chave.startsWith(PREFIXO_ANEXO)) continue;
    const semanaId = entrada.chave.slice(PREFIXO_ANEXO.length);
    const anexos = entrada.valor as AnexosSemana;
    if (!anexos || typeof anexos !== 'object') continue;
    candidatos.push(...candidatosDeAnexos(semanaId, anexos, 'INDEXEDDB'));
  }

  for (const entrada of entradasLegado) {
    if (!entrada.chave.startsWith(PREFIXO_LOCAL)) continue;
    const semanaId = entrada.chave.slice(PREFIXO_LOCAL.length);
    const estado = entrada.valor as EstadoSemana;
    if (!estado || typeof estado !== 'object') continue;
    candidatos.push(...candidatosDeAnexos(semanaId, estado, 'LOCALSTORAGE'));
  }

  const porHash = new Map<string, NotaBenchmark>();
  for (const candidato of candidatos) {
    const info = infoDataUrl(candidato.foto);
    if (!info) continue;
    const sha256 = await sha256Hex(info.bytes);
    const anterior = porHash.get(sha256);
    if (anterior) {
      anterior.dias = Array.from(new Set([...anterior.dias, ...candidato.dias])).sort((a, b) => a - b);
      if (!anterior.anexadaEm && candidato.anexadaEm) anterior.anexadaEm = candidato.anexadaEm;
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
    const da = a.anexadaEm ?? '';
    const db = b.anexadaEm ?? '';
    return da.localeCompare(db) || a.semanaId.localeCompare(b.semanaId) || a.sha256.localeCompare(b.sha256);
  });

  return {
    schemaVersion: 'tata-house.invoice-benchmark-export.v1',
    exportedAt,
    source: 'TATA_HOUSE_LOCAL_DEVICE_READ_ONLY',
    deviceDataMutated: false,
    networkRequired: false,
    rawOtherHouseStateIncluded: false,
    sourceRecordsScanned: entradasIdb.length + entradasLegado.length,
    imageCandidatesFound: candidatos.length,
    duplicateImagesRemoved: Math.max(0, candidatos.length - notes.length),
    notes,
  };
}

async function lerEntradasIdbExistenteSomenteLeitura(): Promise<EntradaAnexoBenchmark[]> {
  if (typeof indexedDB === 'undefined') return [];

  return new Promise((resolve) => {
    let resolveu = false;
    const concluir = (valor: EntradaAnexoBenchmark[]) => {
      if (resolveu) return;
      resolveu = true;
      resolve(valor);
    };

    try {
      // Sem versão: nunca solicita upgrade deliberadamente.
      // Se o banco não existir, o browser dispara onupgradeneeded; abortamos
      // a transação para impedir criação de banco/object stores.
      const req = indexedDB.open(DB_NOME);

      req.onupgradeneeded = () => {
        try {
          req.transaction?.abort();
        } catch {
          // fail closed
        }
        try {
          req.result.close();
        } catch {
          // noop
        }
        concluir([]);
      };

      req.onerror = () => concluir([]);
      req.onblocked = () => concluir([]);

      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA_ESTADO)) {
          db.close();
          concluir([]);
          return;
        }

        const out: EntradaAnexoBenchmark[] = [];
        try {
          const tx = db.transaction(LOJA_ESTADO, 'readonly');
          const cursor = tx.objectStore(LOJA_ESTADO).openCursor();

          cursor.onsuccess = () => {
            const atual = cursor.result;
            if (!atual) return;
            if (typeof atual.key === 'string' && atual.key.startsWith(PREFIXO_ANEXO)) {
              out.push({ chave: atual.key, valor: atual.value });
            }
            atual.continue();
          };

          cursor.onerror = () => {
            db.close();
            concluir(out);
          };
          tx.oncomplete = () => {
            db.close();
            concluir(out);
          };
          tx.onerror = () => {
            db.close();
            concluir(out);
          };
          tx.onabort = () => {
            db.close();
            concluir(out);
          };
        } catch {
          db.close();
          concluir([]);
        }
      };
    } catch {
      concluir([]);
    }
  });
}

function lerLegadoLocalStorage(): EntradaAnexoBenchmark[] {
  if (typeof window === 'undefined') return [];
  const out: EntradaAnexoBenchmark[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!chave || !chave.startsWith(PREFIXO_LOCAL)) continue;
      const raw = localStorage.getItem(chave);
      if (!raw) continue;
      try {
        out.push({ chave, valor: JSON.parse(raw) });
      } catch {
        // documento inválido não entra no pacote
      }
    }
  } catch {
    return out;
  }
  return out;
}

export async function coletarPacoteNotasBenchmark(): Promise<PacoteNotasBenchmark> {
  const entradasIdb = await lerEntradasIdbExistenteSomenteLeitura();
  return montarPacoteNotasBenchmark(entradasIdb, lerLegadoLocalStorage());
}

export function arquivoPacoteNotasBenchmark(pacote: PacoteNotasBenchmark): File {
  const dia = pacote.exportedAt.slice(0, 10);
  return new File(
    [JSON.stringify(pacote)],
    `tata-house-notas-benchmark-${dia}.json`,
    { type: 'application/json' },
  );
}

export async function entregarArquivoNotasBenchmark(arquivo: File): Promise<'SHARE' | 'DOWNLOAD'> {
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
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    a.rel = 'noopener';
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return 'DOWNLOAD';
}
