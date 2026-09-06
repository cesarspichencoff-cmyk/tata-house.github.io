import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dataLocalIso,
  enviarAvaliacaoGovernanca,
  governancaHabilitada,
  lerCardapioGovernanca,
} from './governanca-bridge';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function desabilitar() {
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_SUPABASE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_UNIDADE', '');
}

function habilitar() {
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_SUPABASE_URL', 'https://governanca.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_SUPABASE_KEY', 'sb_publishable_teste');
  vi.stubEnv('NEXT_PUBLIC_GOVERNANCA_UNIDADE', 'Itaim');
}

describe('governanca-bridge', () => {
  it('fica desligada sem configuração completa', () => {
    desabilitar();
    expect(governancaHabilitada()).toBe(false);
  });

  it('formata a data no calendário local, sem deslocamento UTC', () => {
    const d = new Date(2026, 8, 5, 23, 30, 0);
    expect(dataLocalIso(d)).toBe('2026-09-05');
  });

  it('lê apenas o cardápio público do dia', async () => {
    habilitar();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: '2026-09-05',
          unidade: 'Itaim',
          principal: 'Frango grelhado',
          guarnicao: 'Legumes',
          salada: 'Folhas',
          custo_total: 999,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const out = await lerCardapioGovernanca(new Date(2026, 8, 5));
    expect(out).toEqual({
      data: '2026-09-05',
      unidade: 'Itaim',
      principal: 'Frango grelhado',
      guarnicao: 'Legumes',
      salada: 'Folhas',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/rest/v1/rpc/house_cardapio_dia');
  });

  it('envia voto e comentário pelo contrato limitado', async () => {
    habilitar();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, dia_id: 123 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      enviarAvaliacaoGovernanca({
        data: new Date(2026, 8, 5),
        prato: 'Frango grelhado',
        voto: 'bom',
        comentario: 'Muito bom',
      }),
    ).resolves.toBe(true);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      p_data: '2026-09-05',
      p_unidade: 'Itaim',
      p_prato: 'Frango grelhado',
      p_voto: 'bom',
      p_comentario: 'Muito bom',
    });
  });
});
