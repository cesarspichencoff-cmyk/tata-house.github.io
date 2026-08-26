import { describe, expect, it } from 'vitest';
import { FilaPorChave } from './fila-por-chave';

describe('FilaPorChave', () => {
  it('serializa duas gravações da mesma chave na ordem em que foram pedidas', async () => {
    const fila = new FilaPorChave();
    const eventos: string[] = [];
    let liberar!: () => void;
    const trava = new Promise<void>((resolve) => { liberar = resolve; });

    const p1 = fila.enfileirar('semana.2026-S35', async () => {
      eventos.push('v1-inicio');
      await trava;
      eventos.push('v1-fim');
    });
    const p2 = fila.enfileirar('semana.2026-S35', async () => {
      eventos.push('v2-inicio');
      eventos.push('v2-fim');
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(eventos).toEqual(['v1-inicio']);
    expect(fila.tem('semana.2026-S35')).toBe(true);

    liberar();
    await Promise.all([p1, p2]);
    expect(eventos).toEqual(['v1-inicio', 'v1-fim', 'v2-inicio', 'v2-fim']);
    expect(fila.vazia()).toBe(true);
  });

  it('uma falha anterior não bloqueia a versão seguinte da mesma chave', async () => {
    const fila = new FilaPorChave();
    const eventos: string[] = [];

    const p1 = fila.enfileirar('estoque', async () => {
      eventos.push('falhou');
      throw new Error('offline');
    });
    const p2 = fila.enfileirar('estoque', async () => {
      eventos.push('nova-versao');
    });

    await expect(p1).rejects.toThrow('offline');
    await expect(p2).resolves.toBeUndefined();
    expect(eventos).toEqual(['falhou', 'nova-versao']);
    expect(fila.vazia()).toBe(true);
  });
});
