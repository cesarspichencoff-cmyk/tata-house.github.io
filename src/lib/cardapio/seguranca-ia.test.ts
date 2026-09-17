import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('segurança de IA no cliente', () => {
  it('não permite chaves privadas ou chamadas diretas de provedor no src', () => {
    const arquivos = [
      'src/components/cardapio/AbaNF.tsx',
      'src/components/cardapio/AbaCotacao.tsx',
      'src/lib/cardapio/nf-leitura.ts',
      'src/lib/cardapio/cotacao.ts',
      'src/lib/cardapio/ia-cliente.ts',
    ];
    const fonte = arquivos.map(ler).join('\n');
    for (const proibido of [
      'NEXT_PUBLIC_GROQ_KEY',
      'NEXT_PUBLIC_GEMINI_API_KEY',
      'cardapio.v1.groq.key',
      'https://api.groq.com/openai/',
      'generativelanguage.googleapis.com/v1beta/models',
      'chamarGroqDireto',
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it('mantém imagem e segredo exclusivamente na Edge Function', () => {
    const edge = ler('supabase/functions/llm/index.ts');
    expect(edge).toContain("env('GEMINI_API_KEY')");
    expect(edge).toContain('inlineData');
    expect(edge).toContain('8_000_000');
  });
});
