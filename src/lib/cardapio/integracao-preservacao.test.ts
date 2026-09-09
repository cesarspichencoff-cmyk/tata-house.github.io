import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function fonte(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('preservação do produto House na integração', () => {
  it('mantém a plaquinha QR gerada localmente e imprimível', () => {
    const s = fonte('src/components/cardapio/PlaquinhaQR.tsx');
    expect(s).toContain("import QRCode from 'qrcode'");
    expect(s).toMatch(/QRCode\.toDataURL/);
    expect(s).toMatch(/window\.print\(\)/);
    expect(s).toMatch(/Avalie a refeição/);
  });

  it('mantém o pôster semanal com QR e impressão A4', () => {
    const s = fonte('src/components/cardapio/PosterSemana.tsx');
    expect(s).toContain("import QRCode from 'qrcode'");
    expect(s).toMatch(/QRCode\.toDataURL/);
    expect(s).toMatch(/window\.print\(\)/);
    expect(s).toMatch(/Escaneie e avalie o prato de hoje/);
    expect(s).toMatch(/size:\s*A4/i);
  });

  it('mantém a pesquisa por QR ligada à plaquinha no módulo de aceitação', () => {
    const s = fonte('src/components/cardapio/AbaAceitacao.tsx');
    expect(s).toMatch(/<PlaquinhaQR/);
    expect(s).toMatch(/Pesquisa por QR/);
  });

  it('mantém as três estratégias automáticas do cérebro House', () => {
    const s = fonte('src/lib/cardapio/governanca-candidatos.ts');
    expect(s).toMatch(/sugerirSemanaHistorica/);
    expect(s).toMatch(/sugerirSemana\(/);
    expect(s).toMatch(/sugerirSemanaCriativa/);
    expect(s).toMatch(/historico/);
    expect(s).toMatch(/equilibrado/);
    expect(s).toMatch(/criativo/);
  });
});
