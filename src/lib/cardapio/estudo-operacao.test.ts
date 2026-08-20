import { describe, it, expect } from 'vitest';
import { estudarOperacao, cobertura, type EntradaEstudo } from './estudo-operacao';
import type { EstadoSemana, RegistroDesperdicio } from './tipos';

const semana = (pratos: string[]): EstadoSemana => ({
  versao: 1,
  orcamento: null,
  etapa: 'rascunho',
  historico: [],
  ajustes: {},
  manuais: {},
  status: {},
  obsCozinha: '',
  dias: pratos.map((p) => ({
    pessoas: 60,
    principal: p,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: '',
    salada: '',
    sobremesa: '',
  })),
});

const vazio: EntradaEstudo = {
  semanas: [],
  aceitacao: {},
  desperdicio: [],
  historicoPrecos: {},
  gastos: [],
};

const sobra = (prato: string, produzido: number, consumido: number, i: number): RegistroDesperdicio => ({
  id: `${prato}-${i}`,
  dia: 0,
  prato,
  produzido,
  consumido,
  unid: 'porções',
  em: new Date().toISOString(),
});

describe('estudo da operação', () => {
  it('sem dado nenhum, não inventa recomendação', () => {
    expect(estudarOperacao(vazio)).toEqual([]);
  });

  it('diz o que falta para conseguir estudar', () => {
    const c = cobertura(vazio);
    expect(c.pronto).toBe(false);
    expect(c.faltando.length).toBeGreaterThan(0);
  });

  it('aponta item cujo preço disparou, com os dois valores', () => {
    const a = estudarOperacao({
      ...vazio,
      historicoPrecos: {
        'file de frango': [
          { valor: 18, em: '2026-06-01T10:00:00Z' },
          { valor: 24, em: '2026-08-01T10:00:00Z' },
        ],
      },
    });
    const achado = a.find((x) => x.categoria === 'preco');
    expect(achado).toBeDefined();
    expect(achado!.titulo).toContain('33%');
    expect(achado!.evidencia).toContain('18');
    expect(achado!.evidencia).toContain('24');
  });

  it('variação pequena de preço não vira alarme', () => {
    const a = estudarOperacao({
      ...vazio,
      historicoPrecos: { arroz: [{ valor: 20, em: '2026-06-01T10:00:00Z' }, { valor: 21, em: '2026-08-01T10:00:00Z' }] },
    });
    expect(a.some((x) => x.categoria === 'preco')).toBe(false);
  });

  it('sobra recorrente vira achado com impacto em reais', () => {
    const a = estudarOperacao({
      ...vazio,
      desperdicio: [sobra('Peixe assado', 100, 60, 1), sobra('Peixe assado', 100, 65, 2)],
      custoRefeicaoSemana: 5,
    });
    const achado = a.find((x) => x.categoria === 'desperdicio');
    expect(achado).toBeDefined();
    expect(achado!.impactoSemanal).toBeGreaterThan(0);
    expect(achado!.titulo).toContain('Peixe assado');
  });

  it('um episódio isolado de sobra não vira padrão', () => {
    const a = estudarOperacao({ ...vazio, desperdicio: [sobra('Peixe assado', 100, 10, 1)] });
    expect(a.some((x) => x.categoria === 'desperdicio')).toBe(false);
  });

  it('prato rejeitado pela equipe é sinalizado como prioridade alta', () => {
    const a = estudarOperacao({
      ...vazio,
      aceitacao: {
        'figado acebolado': {
          prato: 'Fígado acebolado', bom: 1, ok: 1, ruim: 10,
          somaNotas: 16, n: 12, atualizadoEm: new Date().toISOString(),
        },
      },
    });
    const achado = a.find((x) => x.id.startsWith('rejeitado'));
    expect(achado).toBeDefined();
    expect(achado!.prioridade).toBe('alta');
  });

  it('poucos votos não geram recomendação', () => {
    const a = estudarOperacao({
      ...vazio,
      aceitacao: {
        x: { prato: 'X', bom: 0, ok: 0, ruim: 3, somaNotas: 3, n: 3, atualizadoEm: '' },
      },
    });
    expect(a.length).toBe(0);
  });

  it('prato muito aprovado e pouco usado vira oportunidade', () => {
    const a = estudarOperacao({
      ...vazio,
      semanas: [{ semanaId: '2026-S34', estado: semana(['Outro', '', '', '', '', '', '']) }],
      aceitacao: {
        moqueca: { prato: 'Moqueca', bom: 9, ok: 1, ruim: 0, somaNotas: 48, n: 10, atualizadoEm: '' },
      },
    });
    expect(a.some((x) => x.categoria === 'oportunidade')).toBe(true);
  });

  it('gasto do mês bem acima da média vira alerta com valores', () => {
    const g = (data: string, total: number) => ({
      id: data, data, fornecedor: 'F', total, itens: [], origem: 'nf' as const, em: '',
    });
    const a = estudarOperacao({ ...vazio, gastos: [g('2026-06-10', 1000), g('2026-07-10', 1000), g('2026-08-10', 2000)] });
    const achado = a.find((x) => x.categoria === 'gasto');
    expect(achado).toBeDefined();
    expect(achado!.titulo).toContain('acima');
  });

  it('achados de prioridade alta vêm primeiro', () => {
    const a = estudarOperacao({
      ...vazio,
      desperdicio: [sobra('Peixe', 100, 50, 1), sobra('Peixe', 100, 50, 2)],
      historicoPrecos: { arroz: [{ valor: 20, em: '2026-06-01T10:00:00Z' }, { valor: 24, em: '2026-08-01T10:00:00Z' }] },
    });
    expect(a.length).toBeGreaterThan(1);
    expect(a[0].prioridade).toBe('alta');
  });
});
