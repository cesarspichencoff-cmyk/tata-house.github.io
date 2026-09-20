import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('exportador same-origin sem deploy', () => {
  it('permanece estritamente local e read-only', () => {
    const source = readFileSync(
      new URL('../../../scripts/cardapio/exportar-notas-benchmark-same-origin.js', import.meta.url),
      'utf8',
    );

    expect(source).toContain("const EXPECTED_ORIGIN = 'https://tata-house.github.io'");
    expect(source).toContain("location.origin !== EXPECTED_ORIGIN");
    expect(source).toContain("indexedDB.open(DB_NAME)");
    expect(source).toContain("req.transaction && req.transaction.abort()");
    expect(source).toContain("db.transaction(STORE, 'readonly')");
    expect(source).not.toContain("db.transaction(STORE, 'readwrite')");
    expect(source).not.toContain('localStorage.setItem');
    expect(source).not.toContain('localStorage.removeItem');
    expect(source).not.toContain('localStorage.clear');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('XMLHttpRequest');
    expect(source).not.toContain('WebSocket');
    expect(source).not.toContain('sendBeacon');
  });
});
