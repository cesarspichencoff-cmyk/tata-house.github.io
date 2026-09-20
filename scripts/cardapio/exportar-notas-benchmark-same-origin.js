(() => {
  'use strict';

  const EXPECTED_ORIGIN = 'https://tata-house.github.io';
  const DB_NAME = 'tata-house-v2';
  const STORE = 'estado';
  const PREFIX_IDB = 'anexos.semana.';
  const PREFIX_LOCAL = 'cardapio.v1.semana.';

  if (location.origin !== EXPECTED_ORIGIN) {
    throw new Error('TATA_HOUSE_EXPORT_ORIGIN_MISMATCH');
  }

  const normalizarDias = (dias) => {
    if (!Array.isArray(dias)) return [];
    return [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      .sort((a, b) => a - b);
  };

  const candidatosDeAnexos = (semanaId, anexos, origem) => {
    const out = [];
    if (!anexos || typeof anexos !== 'object') return out;

    if (Array.isArray(anexos.notasFiscais)) {
      for (const nota of anexos.notasFiscais) {
        if (!nota || typeof nota.foto !== 'string') continue;
        out.push({
          semanaId,
          dias: normalizarDias(nota.dias),
          anexadaEm: typeof nota.em === 'string' && nota.em.trim() ? nota.em : null,
          fonte: origem === 'INDEXEDDB'
            ? 'INDEXEDDB_NOTAS_FISCAIS'
            : 'LOCALSTORAGE_NOTAS_FISCAIS',
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
          fonte: origem === 'INDEXEDDB'
            ? 'INDEXEDDB_NOTA_LEGADO'
            : 'LOCALSTORAGE_NOTA_LEGADO',
          foto,
        });
      }
    }
    return out;
  };

  const dataUrlInfo = (foto) => {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(foto);
    if (!m) return null;
    try {
      const bin = atob(m[2].replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return { mimeType: m[1].toLowerCase(), bytes };
    } catch {
      return null;
    }
  };

  const sha256Hex = async (bytes) => {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const lerIdbExistente = () => new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    try {
      const req = indexedDB.open(DB_NAME);

      req.onupgradeneeded = () => {
        try { req.transaction && req.transaction.abort(); } catch {}
        try { req.result.close(); } catch {}
        finish([]);
      };

      req.onerror = () => finish([]);
      req.onblocked = () => finish([]);

      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.close();
          finish([]);
          return;
        }

        const out = [];
        try {
          const tx = db.transaction(STORE, 'readonly');
          const cursor = tx.objectStore(STORE).openCursor();

          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            if (typeof c.key === 'string' && c.key.startsWith(PREFIX_IDB)) {
              out.push({ chave: c.key, valor: c.value });
            }
            c.continue();
          };

          cursor.onerror = () => { db.close(); finish(out); };
          tx.oncomplete = () => { db.close(); finish(out); };
          tx.onerror = () => { db.close(); finish(out); };
          tx.onabort = () => { db.close(); finish(out); };
        } catch {
          db.close();
          finish([]);
        }
      };
    } catch {
      finish([]);
    }
  });

  const lerLocalStorage = () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const chave = localStorage.key(i);
        if (!chave || !chave.startsWith(PREFIX_LOCAL)) continue;
        const raw = localStorage.getItem(chave);
        if (!raw) continue;
        try { out.push({ chave, valor: JSON.parse(raw) }); } catch {}
      }
    } catch {}
    return out;
  };

  const fontePeso = {
    INDEXEDDB_NOTAS_FISCAIS: 4,
    LOCALSTORAGE_NOTAS_FISCAIS: 3,
    INDEXEDDB_NOTA_LEGADO: 2,
    LOCALSTORAGE_NOTA_LEGADO: 1,
  };

  (async () => {
    const idb = await lerIdbExistente();
    const local = lerLocalStorage();
    const candidatos = [];

    for (const e of idb) {
      const semanaId = e.chave.slice(PREFIX_IDB.length);
      candidatos.push(...candidatosDeAnexos(semanaId, e.valor, 'INDEXEDDB'));
    }
    for (const e of local) {
      const semanaId = e.chave.slice(PREFIX_LOCAL.length);
      candidatos.push(...candidatosDeAnexos(semanaId, e.valor, 'LOCALSTORAGE'));
    }

    const porHash = new Map();
    for (const c of candidatos) {
      const info = dataUrlInfo(c.foto);
      if (!info) continue;
      const sha256 = await sha256Hex(info.bytes);
      const prev = porHash.get(sha256);

      if (prev) {
        prev.dias = [...new Set([...prev.dias, ...c.dias])].sort((a, b) => a - b);
        if (!prev.anexadaEm && c.anexadaEm) prev.anexadaEm = c.anexadaEm;
        if (fontePeso[c.fonte] > fontePeso[prev.fonte]) prev.fonte = c.fonte;
        continue;
      }

      porHash.set(sha256, {
        id: `nf-${sha256.slice(0, 16)}`,
        sha256,
        semanaId: c.semanaId,
        dias: c.dias,
        anexadaEm: c.anexadaEm,
        mimeType: info.mimeType,
        bytes: info.bytes.byteLength,
        fonte: c.fonte,
        dataUrl: c.foto,
      });
    }

    const exportedAt = new Date().toISOString();
    const notes = [...porHash.values()].sort((a, b) =>
      (a.anexadaEm || '').localeCompare(b.anexadaEm || '')
      || a.semanaId.localeCompare(b.semanaId)
      || a.sha256.localeCompare(b.sha256)
    );

    const pacote = {
      schemaVersion: 'tata-house.invoice-benchmark-export.v1',
      exportedAt,
      source: 'TATA_HOUSE_LOCAL_DEVICE_READ_ONLY',
      deviceDataMutated: false,
      networkRequired: false,
      rawOtherHouseStateIncluded: false,
      sourceRecordsScanned: idb.length + local.length,
      imageCandidatesFound: candidatos.length,
      duplicateImagesRemoved: Math.max(0, candidatos.length - notes.length),
      notes,
    };

    const blob = new Blob([JSON.stringify(pacote)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tata-house-notas-benchmark-${exportedAt.slice(0, 10)}.json`;
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    console.info('TATA_HOUSE_READ_ONLY_EXPORT_COMPLETE', {
      notes: notes.length,
      sourceRecordsScanned: pacote.sourceRecordsScanned,
      duplicateImagesRemoved: pacote.duplicateImagesRemoved,
      networkRequired: false,
      deviceDataMutated: false,
    });
  })().catch((error) => {
    console.error('TATA_HOUSE_READ_ONLY_EXPORT_FAILED', error);
    throw error;
  });
})();
