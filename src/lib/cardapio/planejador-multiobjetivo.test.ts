import { describe, expect, it, vi } from 'vitest';
import { normalizar, proteinaDoPrato } from './motor';
import { gerarCenariosMultiobjetivo, cargaOperacionalPrato } from './planejador-multiobjetivo';
import type { Aceitacao, DiaCardapio, EstadoSemana } from './tipos';

function diasBase(): DiaCardapio[] {
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
    pessoas: [55, 55, 65, 65, 80, 80, 80][i],
    principal,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: 'Legumes',
    salada: 'Salada verde',
    sobremesa: 'Fruta',
  }));
}

function estadoBase(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: diasBase(),
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
  };
}

function aceitacao(): Aceitacao {
  return {
    [normalizar('Frango grelhado')]: {
      prato: 'Frango grelhado', bom: 4, ok: 0, ruim: 0, somaNotas: 18, n: 4, atualizadoEm: '2026-09-01T00:00:00Z',
    },
    [normalizar('Bife acebolado')]: {
      prato: 'Bife acebolado', bom: 3, ok: 1, ruim: 0, somaNotas: 16, n: 4, atualizadoEm: '2026-09-01T00:00:00Z',
    },
  };
}

function contexto() {
  return {
    estado: estadoBase(),
    precos: {
      [normalizar('Tiras de Carne')]: 39.98,
      [normalizar('File de frango sem osso')]: 15,
      [normalizar('Acém')]: 33,
      [normalizar('Acém moído')]: 34.9,
      [normalizar('Lombo suíno')]: 24.9,
      [normalizar('Bisteca suína')]: 16.9,
    },
    estimativas: {},
    aceitacao: aceitacao(),
    frequencia: {
      [normalizar('Frango grelhado')]: 2,
      [normalizar('Bife acebolado')]: 1,
    },
    estoque: {
      [normalizar('Acém')]: 20,
      [normalizar('Cebola')]: 10,
    },
    restricoesEquipe: {},
    desperdicioHistorico: [],
    historicoPrecos: {},
    baselineAutomatico: estadoBase().dias.map((d) => d.pessoas),
    eventos: [],
    datasSemana: ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20'],
  };
}

describe('planejador multiobjetivo', () => {
  it('não usa sorteio e produz as mesmas propostas para a mesma evidência', () => {
    const aleatorio = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random não pode participar do novo planejador');
    });
    try {
      const a = gerarCenariosMultiobjetivo(contexto());
      const b = gerarCenariosMultiobjetivo(contexto());
      expect(a).toHaveLength(3);
      expect(b).toHaveLength(3);
      expect(a.map((c) => c.fingerprint)).toEqual(b.map((c) => c.fingerprint));
      expect(a.map((c) => c.id)).toEqual(['historico', 'equilibrado', 'criativo']);
      for (const cenario of a) {
        expect(cenario.dias).toHaveLength(7);
        expect(cenario.metricas.erros).toBe(0);
        expect(cenario.porques.some((p) => /determin[ií]stica/i.test(p))).toBe(true);
        expect(cenario.porques.some((p) => /carga operacional/i.test(p))).toBe(true);
        expect(cenario.porques.some((p) => /aprendizado/i.test(p))).toBe(true);
      }
    } finally {
      aleatorio.mockRestore();
    }
  }, 15_000);

  it('não obriga frango a dominar a semana e preserva diversidade de proteína', () => {
    const cenarios = gerarCenariosMultiobjetivo(contexto());
    for (const cenario of cenarios) {
      const proteinas = cenario.dias.map((d) => proteinaDoPrato(d.principal));
      const frangos = proteinas.filter((p) => p === 'frango').length;
      const maiorConcentracao = Math.max(...Array.from(new Set(proteinas)).map((p) => proteinas.filter((x) => x === p).length));
      expect(frangos).toBeLessThanOrEqual(3);
      expect(maiorConcentracao).toBeLessThanOrEqual(3);
      for (let i = 1; i < proteinas.length; i += 1) {
        if (proteinas[i] !== 'outros') expect(proteinas[i]).not.toBe(proteinas[i - 1]);
      }
    }
  }, 15_000);

  it('expõe carga operacional normalizada e usa receita real quando disponível', () => {
    const simples = cargaOperacionalPrato('Frango grelhado');
    const complexo = cargaOperacionalPrato('Bife à role');
    expect(simples).toBeGreaterThanOrEqual(0);
    expect(simples).toBeLessThanOrEqual(1);
    expect(complexo).toBeGreaterThanOrEqual(0);
    expect(complexo).toBeLessThanOrEqual(1);
    expect(complexo).toBeGreaterThan(simples);
  });
});
