import { describe, expect, it } from 'vitest';
import { normalizar } from './motor';
import {
  agregarDesperdicioHistorico,
  analisarCenarioGovernanca,
  aplicarCenarioAoEstado,
  aplicarEventosDemandaGovernanca,
  gerarCenariosGovernanca,
  podeCalibrarDemandaAutomaticamente,
} from './governanca-candidatos';
import type { Aceitacao, DiaCardapio, EstadoSemana, EventoDemanda, HistoricoPrecos, RegistroDesperdicio } from './tipos';

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

const historicoPrecosAlta: HistoricoPrecos = {
  [normalizar('Frango')]: [
    { valor: 10, em: '2026-08-01T00:00:00Z' },
    { valor: 12, em: '2026-08-08T00:00:00Z' },
  ],
};

const desperdicioHistorico: RegistroDesperdicio[] = [
  { id: 'd1', dia: 0, prato: 'Frango grelhado', produzido: 10, consumido: 8, unid: 'porções', em: '2026-08-01T00:00:00Z' },
  { id: 'd2', dia: 0, prato: 'Frango grelhado', produzido: 5, consumido: 4, unid: 'kg', em: '2026-08-08T00:00:00Z' },
  { id: 'd3', dia: 1, prato: 'Bife acebolado', produzido: 100, consumido: 95, unid: 'porções', em: '2026-08-09T00:00:00Z' },
];

describe('governanca-candidatos', () => {
  it('aplica evento positivo somente sobre baseline automático e falha fechado para dia fechado/ambíguo', () => {
    const base = diasFixture();
    const datas = ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];
    const baseline = base.map((d) => d.pessoas);
    const evento: EventoDemanda = { id: 'e1', data: datas[0], rotulo: 'Treinamento', fator: 1.2 };
    const aplicado = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [evento], datasSemana: datas, baselineAutomatico: baseline });
    expect(aplicado.dias[0].pessoas).toBe(72);
    expect(aplicado.eventosAplicados).toBe(1);
    expect(aplicado.eventosRevisao).toBe(0);

    const fechado = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [{ ...evento, fator: 0, rotulo: 'Fechado' }], datasSemana: datas, baselineAutomatico: baseline });
    expect(fechado.dias[0].pessoas).toBe(60);
    expect(fechado.eventosRevisao).toBe(1);
    expect(fechado.mensagens.join(' ')).toMatch(/fechado/i);

    const ambiguo = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [evento, { ...evento, id: 'e2', rotulo: 'Outro' }], datasSemana: datas, baselineAutomatico: baseline });
    expect(ambiguo.dias[0].pessoas).toBe(60);
    expect(ambiguo.eventosRevisao).toBe(1);
  });

  it('evento não atropela ajuste humano de pessoas', () => {
    const base = diasFixture();
    const ajustado = base.map((d) => ({ ...d }));
    ajustado[0].pessoas = 61;
    const datas = ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];
    const res = aplicarEventosDemandaGovernanca({
      dias: ajustado,
      diasOriginais: ajustado,
      eventos: [{ id: 'e1', data: datas[0], rotulo: 'Evento', fator: 1.5 }],
      datasSemana: datas,
      baselineAutomatico: base.map((d) => d.pessoas),
    });
    expect(res.dias[0].pessoas).toBe(61);
    expect(res.eventosAplicados).toBe(0);
    expect(res.ajustesHumanosPreservados).toBe(1);
  });

  it('distingue baseline aprendido automaticamente de ajuste humano', () => {
    expect(podeCalibrarDemandaAutomaticamente(72, 0, [72, 70, 70, 75, 80, 80, 80])).toBe(true);
    expect(podeCalibrarDemandaAutomaticamente(74, 0, [72, 70, 70, 75, 80, 80, 80])).toBe(false);
    expect(podeCalibrarDemandaAutomaticamente(55, 0)).toBe(true);
    expect(podeCalibrarDemandaAutomaticamente(60, 0)).toBe(false);
  });
  it('normaliza desperdício por registro sem somar kg com porções', () => {
    const mapa = agregarDesperdicioHistorico(desperdicioHistorico);
    expect(mapa[normalizar('Frango grelhado')].n).toBe(2);
    expect(mapa[normalizar('Frango grelhado')].taxaMedia).toBeCloseTo(0.2, 6);
    expect(mapa[normalizar('Bife acebolado')].taxaMedia).toBeCloseTo(0.05, 6);
  });
  it('mostra alta anormal de preço como risco sem alterar o custo por uma segunda penalização', () => {
    const dias = diasFixture();
    const precos = { [normalizar('Frango')]: 15 };
    const comRadar = analisarCenarioGovernanca({
      estadoBase: estadoFixture(),
      dias,
      precos,
      aceitacao: aceitacaoFixture(),
      frequencia: {},
      historicoPrecos: historicoPrecosAlta,
    });
    const semRadar = analisarCenarioGovernanca({
      estadoBase: estadoFixture(),
      dias,
      precos,
      aceitacao: aceitacaoFixture(),
      frequencia: {},
      historicoPrecos: {},
    });
    expect(comRadar.itensPrecoAlta).toBeGreaterThanOrEqual(1);
    expect(comRadar.maiorAltaPrecoPct).toBeGreaterThanOrEqual(15);
    expect(comRadar.custoTotal).toBe(semRadar.custoTotal);
    expect(comRadar.custoPorRefeicao).toBe(semRadar.custoPorRefeicao);
  });

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
      desperdicioHistorico,
      historicoPrecos: historicoPrecosAlta,
    });

    expect(metricas.pratosComAceitacao).toBe(2); // n=1 não entra como evidência mínima
    expect(metricas.votosAceitacao).toBe(5);
    expect(metricas.aceitacaoMedia).toBeCloseTo(4.25, 5);
    expect(metricas.pratosRecentes).toBe(2);
    expect(metricas.ocorrenciasRecentes).toBe(3);
    expect(metricas.ocorrenciasRestricao).toBe(2);
    expect(metricas.pessoasRestricaoSomadas).toBe(3);
    expect(metricas.desperdicioMedioPct).toBe(15);
    expect(metricas.pratosComDesperdicio).toBe(2);
    expect(metricas.amostraDesperdicio).toBe(3);
    expect(metricas.itensPrecoAlta).toBeGreaterThanOrEqual(0);
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
      desperdicioHistorico,
      historicoPrecos: historicoPrecosAlta,
      baselineAutomatico: estadoFixture().dias.map((d) => d.pessoas),
      eventos: [{ id: 'e1', data: '2026-09-07', rotulo: 'Treinamento', fator: 1.1 }],
      datasSemana: ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'],
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
      expect(cenario.porques.some((p) => /desperd[ií]cio/i.test(p))).toBe(true);
      expect(cenario.porques.some((p) => /evento de demanda/i.test(p))).toBe(true);
      expect(cenario.porques.some((p) => /radar|alta anormal/i.test(p))).toBe(true);
      expect(cenario.demanda.eventosAplicados).toBe(1);
      expect(cenario.fingerprint.length).toBeGreaterThan(20);
    }
  });
});
