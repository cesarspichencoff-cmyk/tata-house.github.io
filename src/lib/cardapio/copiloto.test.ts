import { describe, it, expect } from 'vitest';
import { analisarCardapio, type EntradaCopiloto } from './copiloto';
import type { EstadoSemana } from './tipos';

const dia = (principal: string, pessoas = 60) => ({
  pessoas, principal, guarnicaoFixa: 'Arroz e Feijão', guarnicao: '', salada: '', sobremesa: '',
});

const semana = (pratos: string[], orcamento: number | null = null): EstadoSemana => ({
  versao: 1,
  orcamento,
  etapa: 'rascunho',
  historico: [],
  ajustes: {},
  manuais: {},
  status: {},
  obsCozinha: '',
  dias: pratos.map((p) => dia(p)),
});

/** Cardápio típico do refeitório, com preços reais de mercado. */
const PRATOS = [
  'Costela ao molho',
  'File de frango grelhado',
  'Feijoada',
  'Frango assado',
  'Carne moida refogada',
  'Peixe assado',
  'Pernil assado',
];

const PRECOS: Record<string, number> = {
  'costela bovina': 32, 'file de frango': 19, 'feijao carioca': 9,
  'molho de tomate': 8, arroz: 6, 'carne moida': 38, 'file de peixe': 34,
  'pernil suino': 22, 'frango inteiro': 12, 'feijao preto': 10,
  'linguica calabresa': 28, bacon: 30, cebola: 5, alho: 26, oleo: 9,
};

const base = (atualPratos: string[], orcamento: number | null = null): EntradaCopiloto => ({
  atual: { semanaId: '2026-S35', estado: semana(atualPratos, orcamento) },
  anteriores: Array.from({ length: 6 }, (_, i) => ({
    semanaId: `2026-S${28 + i}`,
    estado: semana(PRATOS),
  })),
  precos: PRECOS,
  estimativas: {},
});

describe('copiloto — fala com o que a casa já tem', () => {
  it('PROVA: produz vários achados sem nenhuma sobra, voto ou nota registrados', () => {
    // É exatamente o cenário real da casa hoje: cardápios montados e preços
    // cadastrados, e nenhum registro manual de operação. O estudo antigo
    // devolvia 1 achado aqui; o copiloto precisa entregar bem mais.
    const achados = analisarCardapio(base(['Frango assado', 'File de frango grelhado', 'Frango xadrez', 'Frango ao curry', 'Costela ao molho', 'Peixe assado', 'Pernil assado']));
    expect(achados.length).toBeGreaterThanOrEqual(2);
    for (const a of achados) {
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.evidencia.length).toBeGreaterThan(0);
      expect(a.acao.length).toBeGreaterThan(0);
    }
  });

  it('acusa excesso de frango com a contagem real', () => {
    const achados = analisarCardapio(
      base(['Frango assado', 'File de frango grelhado', 'Frango xadrez', 'Frango ao curry', 'Costela ao molho', 'Peixe assado', 'Pernil assado']),
    );
    const p = achados.find((a) => a.id.startsWith('proteina-frango'));
    expect(p).toBeDefined();
    expect(p!.evidencia).toContain('7 dias');
  });

  it('semana equilibrada não gera alerta de proteína', () => {
    const achados = analisarCardapio(base(PRATOS));
    expect(achados.some((a) => a.id.startsWith('proteina-'))).toBe(false);
  });

  it('estouro de orçamento vira achado com os dois valores', () => {
    const achados = analisarCardapio(base(PRATOS, 100));
    const o = achados.find((a) => a.id === 'orcamento');
    expect(o).toBeDefined();
    expect(o!.evidencia).toContain('100');
    expect(o!.impactoSemanal).toBeGreaterThan(0);
  });

  it('orçamento folgado não vira alarme', () => {
    const achados = analisarCardapio(base(PRATOS, 999999));
    expect(achados.some((a) => a.id === 'orcamento')).toBe(false);
  });

  it('sem semanas anteriores suficientes, não inventa comparação de custo', () => {
    const e = base(PRATOS);
    e.anteriores = [];
    expect(analisarCardapio(e).some((a) => a.id === 'custo-semana')).toBe(false);
  });

  it('cada achado com impacto traz valor positivo em reais', () => {
    const achados = analisarCardapio(base(PRATOS, 100));
    for (const a of achados) {
      if (a.impactoSemanal !== undefined) expect(a.impactoSemanal).toBeGreaterThan(0);
    }
  });

  it('achados de prioridade alta vêm primeiro', () => {
    const achados = analisarCardapio(
      base(['Frango assado', 'File de frango grelhado', 'Frango xadrez', 'Frango ao curry', 'Frango a passarinho', 'Peixe assado', 'Pernil assado'], 50),
    );
    expect(achados.length).toBeGreaterThan(1);
    expect(achados[0].prioridade).toBe('alta');
  });

  it('semana vazia não produz recomendação', () => {
    expect(analisarCardapio(base(['', '', '', '', '', '', ''])).length).toBe(0);
  });
});
