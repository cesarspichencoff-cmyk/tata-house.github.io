import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './client';
import { armazenamentoSupabase } from './armazenamento';

const getSupabaseMock = vi.mocked(getSupabase);

function clienteQueFalha(erro: Error) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.throwOnError = async () => { throw erro; };
  return { from: () => chain };
}

describe('armazenamento Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propaga erro de leitura em vez de fingir que a chave não existe', async () => {
    const erro = new Error('RLS negou leitura');
    getSupabaseMock.mockResolvedValue(clienteQueFalha(erro) as never);
    await expect(armazenamentoSupabase.ler('semana.2026-S35', null)).rejects.toThrow(
      'RLS negou leitura',
    );
  });

  it('não considera cliente ausente como gravação bem-sucedida', async () => {
    getSupabaseMock.mockResolvedValue(null);
    await expect(armazenamentoSupabase.gravar('teste', { ok: true })).rejects.toThrow(
      'Cliente Supabase indisponível',
    );
  });
});
