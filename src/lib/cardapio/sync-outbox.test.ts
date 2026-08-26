import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  idbGravar: vi.fn(),
  idbRemover: vi.fn(),
  idbTodos: vi.fn(),
}));

vi.mock('./idb', () => ({
  idbGravar: mocks.idbGravar,
  idbRemover: mocks.idbRemover,
  idbTodos: mocks.idbTodos,
}));

import { listarOutbox, removerOutbox, salvarOutbox } from './sync-outbox';

describe('sync-outbox', () => {
  beforeEach(async () => {
    mocks.idbTodos.mockResolvedValue([]);
    mocks.idbGravar.mockReset();
    mocks.idbRemover.mockReset();
    // limpa cache entre testes pelo caminho público; se ainda não houver item,
    // a remoção mockada simplesmente confirma.
    mocks.idbRemover.mockResolvedValue(true);
    for (const item of await listarOutbox()) {
      await removerOutbox(item.chave);
    }
    mocks.idbRemover.mockClear();
  });

  it('remove item antigo mesmo depois de falha ao persistir o payload novo', async () => {
    // Primeira edição foi durável.
    mocks.idbGravar.mockResolvedValueOnce(true);
    await salvarOutbox('precos', { arroz: 11 }, { arroz: 10 });

    // A edição mais nova substitui a memória, mas sua gravação IndexedDB falha.
    // O item antigo ainda poderia existir fisicamente no IDB.
    mocks.idbGravar.mockResolvedValueOnce(false);
    await expect(
      salvarOutbox('precos', { arroz: 12 }, { arroz: 10 }),
    ).rejects.toThrow('IndexedDB nao confirmou a outbox');

    const memoriaAntes = await listarOutbox();
    expect(memoriaAntes).toHaveLength(1);
    expect(memoriaAntes[0]?.valor).toEqual({ arroz: 12 });

    // Depois que o upload de 12 foi confirmado, BootNuvem deve sempre chamar
    // removerOutbox(). Se a remoção confirma, nenhum payload velho ressuscita.
    mocks.idbRemover.mockResolvedValueOnce(true);
    await removerOutbox('precos');

    expect(await listarOutbox()).toEqual([]);
    expect(mocks.idbRemover).toHaveBeenCalledWith('outbox', 'precos');
  });
});
