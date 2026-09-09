import { describe, expect, it } from 'vitest';
import { normalizar } from './motor';
import {
  analisarCenarioGovernanca,
  aplicarCenarioAoEstado,
  gerarCenariosGovernanca,
} from './governanca-candidatos';
import type { Aceitacao, DiaCardapio, EstadoSemana } from './tipos';

function diasFixture(): DiaCardapio[] {
  const principais = [
    'Frango grelhado',
    'Bife acebolado',
    'Frango assado',
    'Lombo suíno',
    'Frango xadrez',
    'Carne de panela',
    'Peixe assado',
  ];
  return principais.map((principal, i) => ({
    pessoas: 60 + i,
    principal,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: 'Legumes',
    salada: 'Salada verde',
    sobremesa: 'Fruta',
  }));
}

function estadoFixture(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: diasFixture(),
    etapa: 'compras',
    historico: [{ etapa: 'cozinha', em: '2026-09-01T12:00:00.000Z', papel: 'gestor' }],
    ajustes: { 0: { frango: { qtd: 99 } } },
    manuais: { 0: [{ item: 'Item antigo', qtd: 1, unid: 'kg' }] },
    status: { 0: { frango: { compradoQtd: 4 } } },
    obsCozinha: 'preservar observação de auditoria',
    refeicoes: { 0: 58 },
    notas: { 0: 'data:image/png;base64,abc' },
    notasFiscais: [{ foto: 'x', dias: [0], em: '2026-09-01T12:00:00.000Z' }],
  };
}

function aceitacaoFixture(): Aceitacao {
  return {
    [normalizar('Frango grelhado')]: {
      prato: 'Frango grelhado', bom: 2, ok: 0, ruim: 0, somaNotas: 9, n: 2, atualizadoEm: '2026-09-01T00:00:00Z',
    },
    [normalizar('Bife acebolado')]: {
      prato: 'Bife acebolado', bom: 2, ok: 1, ruim: 0, somaNotas: 12, n: 3, atualizadoEm: '2026-09-01T00:00:00Z',
    },
    [normalizar('Frango assado')]: {
      prato: 'Frango assado', bom: 1, ok: 0, ruim: 0, somaNotas: 5, n: 1, atualizadoEm: '2026-09-01T00:00:00Z',
    },
  };
}

const restricoesEquipe = {
  [normalizar('Frango grelhado')]: 2,
  [normalizar('Lombo suíno')]: 1,
};

describe('governanca-candidatos', () => {
  it('analisa evidência sem inventar aceitação, conta repetição e mede impacto de restrições', () => {
    const dias = diasFixture();
    const metricas = analisarCenarioGovernanca({
      estadoBase: estadoFixture(),
      dias,
      precos: {},
      aceitacao: aceitacaoFixture(),
      frequencia: {
        [normalizar('Frango grelhado')]: 1,
        [normalizar('Frango assado')]: 2,
      },
      restricoesEquipe,
    });

    expect(metricas.pratosComAceitacao).toBe(2); // n=1 não entra como evidência mínima
    expect(metricas.votosAceitacao).toBe(5);
    expect(metricas.aceitacaoMedia).toBeCloseTo(4.25, 5);
    expect(metricas.pratosRecentes).toBe(2);
    expect(metricas.ocorrenciasRecentes).toBe(3);
    expect(metricas.ocorrenciasRestricao).toBe(2);
    expect(metricas.pessoasRestricaoSomadas).toBe(3);
    expect(metricas.proteinasDistintas).toBe(4);
    expect(metricas.nutricaoMedia).toBeGreaterThanOrEqual(20);
    expect(metricas.nutricaoMedia).toBeLessThanOrEqual(100);
    expect(metricas.coberturaDadosPct).toBeGreaterThanOrEqual(0);
    expect(metricas.coberturaDadosPct).toBeLessThanOrEqual(100);
  });

  it('aplicar cenário volta a rascunho e invalida derivados operacionais antigos', () => {
    const base = estadoFixture();
    const novos = diasFixture().map((d) => ({ ...d, principal: `${d.principal} novo` }));
    const aplicado = aplicarCenarioAoEstado(base, novos);

    expect(aplicado).not.toBe(base);
    expect(aplicado.etapa).toBe('rascunho');
    expect(aplicado.dias.map((d) => d.principal)).toEqual(novos.map((d) => d.principal));
    expect(aplicado.ajustes).toEqual({});
    expect(aplicado.manuais).toEqual({});
    expect(aplicado.status).toEqual({});
    expect(aplicado.refeicoes).toBeUndefined();
    expect(aplicado.notas).toBeUndefined();
    expect(aplicado.notasFiscais).toBeUndefined();
    expect(aplicado.orcamento).toBe(3500);
    expect(aplicado.historico).toEqual(base.historico);
    expect(aplicado.obsCozinha).toBe(base.obsCozinha);
  });

  it('recusa aplicação estrutural inválida sem alterar o estado', () => {
    const base = estadoFixture();
    expect(aplicarCenarioAoEstado(base, diasFixture().slice(0, 6))).toBe(base);
  });

  it('gera estratégias com o motor real e leva restrições como critério explícito de decisão', () => {
    const cenarios = gerarCenariosGovernanca({
      estado: estadoFixture(),
      precos: {},
      aceitacao: aceitacaoFixture(),
      frequencia: {},
      estoque: {},
      restricoesEquipe,
    });

    expect(cenarios.length).toBe(3);
    expect(cenarios.map((c) => c.id).sort()).toEqual(['criativo', 'equilibrado', 'historico']);
    for (const cenario of cenarios) {
      expect(cenario.dias).toHaveLength(7);
      expect(cenario.dias.every((d) => d.principal.trim().length > 0)).toBe(true);
      expect(cenario.metricas.erros).toBeGreaterThanOrEqual(0);
      expect(cenario.metricas.alertas).toBeGreaterThanOrEqual(0);
      expect(cenario.metricas.ocorrenciasRestricao).toBeGreaterThanOrEqual(0);
      expect(cenario.metricas.pessoasRestricaoSomadas).toBeGreaterThanOrEqual(0);
      expect(cenario.porques.some((p) => /restri/i.test(p))).toBe(true);
      expect(cenario.fingerprint.length).toBeGreaterThan(20);
    }
  });
});
