import { describe, expect, it } from 'vitest';
import {
  auditoriaDeLegado,
  ehAuditoriaV2,
  mesclarAuditoria,
  type AuditoriaV2,
} from './estado-grande-merge';
import { gravarMescladoComCas } from './estado-grande-cas';
import type { RegistroAuditoria } from './tipos';

const reg = (em: string, acao: string): RegistroAuditoria => ({
  em,
  papel: 'gestor',
  acao,
  alvo: acao,
});

describe('estado-grande-cas', () => {
  it('rele e remescla quando outro cliente vence a primeira escrita', async () => {
    const local = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'A')]);
    let remoto: AuditoriaV2 = auditoriaDeLegado([
      reg('2026-08-26T10:00:01.000Z', 'B'),
    ]);
    let versao = 'v1';
    let primeira = true;

    const resultado = await gravarMescladoComCas(
      local,
      async () => ({ existe: true, valor: remoto, atualizadoEm: versao }),
      async (valor, esperada) => {
        if (primeira) {
          primeira = false;
          remoto = mesclarAuditoria(
            remoto,
            auditoriaDeLegado([reg('2026-08-26T10:00:02.000Z', 'C')]),
          );
          versao = 'v2';
          return false;
        }

        if (esperada.atualizadoEm !== versao) return false;
        remoto = valor;
        versao = 'v3';
        return true;
      },
      ehAuditoriaV2,
      mesclarAuditoria,
    );

    expect(resultado.tentativas).toBe(2);
    expect(remoto.registros.map((r) => r.acao)).toEqual(['C', 'B', 'A']);
  });

  it('insere o estado local quando a chave ainda nao existe', async () => {
    const local = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'A')]);
    let gravado: AuditoriaV2 | null = null;

    const resultado = await gravarMescladoComCas(
      local,
      async () => ({ existe: false, valor: null, atualizadoEm: null }),
      async (valor, esperada) => {
        expect(esperada.existe).toBe(false);
        gravado = valor;
        return true;
      },
      ehAuditoriaV2,
      mesclarAuditoria,
    );

    expect(resultado.tentativas).toBe(1);
    expect(gravado).toEqual(local);
  });

  it('falha fechado se o remoto existe mas tem formato invalido', async () => {
    let tentouGravar = false;
    const local = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'A')]);

    await expect(
      gravarMescladoComCas(
        local,
        async () => ({ existe: true, valor: { quebrado: true }, atualizadoEm: 'v1' }),
        async () => {
          tentouGravar = true;
          return true;
        },
        ehAuditoriaV2,
        mesclarAuditoria,
      ),
    ).rejects.toThrow('Estado grande remoto inválido');

    expect(tentouGravar).toBe(false);
  });

  it('mantem falha se a concorrencia nao estabiliza dentro do limite', async () => {
    const local = auditoriaDeLegado([reg('2026-08-26T10:00:00.000Z', 'A')]);
    let leituras = 0;

    await expect(
      gravarMescladoComCas(
        local,
        async () => {
          leituras += 1;
          return {
            existe: true,
            valor: auditoriaDeLegado([reg('2026-08-26T10:00:01.000Z', 'B')]),
            atualizadoEm: `v${leituras}`,
          };
        },
        async () => false,
        ehAuditoriaV2,
        mesclarAuditoria,
        3,
      ),
    ).rejects.toThrow('CAS falhou após 3 tentativa(s)');

    expect(leituras).toBe(3);
  });
});
