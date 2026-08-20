import { describe, it, expect } from 'vitest';
import {
  serieMensal,
  topItens,
  totalDoMes,
  mesDe,
  ULTIMO_MES_PLANILHA,
  type LancamentoGasto,
} from './gastos';

const nf = (data: string, total: number, itens: LancamentoGasto['itens'] = []): LancamentoGasto => ({
  id: data + total,
  data,
  fornecedor: 'Fornecedor X',
  total,
  itens,
  origem: 'nf',
  em: new Date().toISOString(),
});

describe('livro-caixa de compras', () => {
  it('meses cobertos pela planilha não são contados duas vezes', () => {
    // Uma nota lançada dentro do período da planilha não pode inflar o mês:
    // a planilha já contabilizou aquelas compras.
    const mesDaPlanilha = ULTIMO_MES_PLANILHA + '-15';
    const semNota = totalDoMes([], ULTIMO_MES_PLANILHA);
    const comNota = totalDoMes([nf(mesDaPlanilha, 9999)], ULTIMO_MES_PLANILHA);
    expect(comNota).toBe(semNota);
  });

  it('nota de mês posterior à planilha aparece como gasto do app', () => {
    const serie = serieMensal([nf('2026-08-10', 1500), nf('2026-08-20', 500)]);
    const agosto = serie.find((m) => m.mes === '2026-08');
    expect(agosto).toBeDefined();
    expect(agosto!.total).toBe(2000);
    expect(agosto!.fonte).toBe('app');
  });

  it('a série fica em ordem cronológica, planilha antes do app', () => {
    const serie = serieMensal([nf('2026-08-10', 100)]);
    const meses = serie.map((m) => m.mes);
    expect(meses).toEqual([...meses].sort());
    expect(serie[0].fonte).toBe('planilha');
    expect(serie[serie.length - 1].fonte).toBe('app');
  });

  it('top de itens soma as notas novas ao histórico da planilha', () => {
    const comItens = topItens([
      nf('2026-08-10', 900, [
        { produto: 'Acém em cubo', norm: 'acem em cubo', qtd: 30, unid: 'KG', precoUnit: 30, precoTotal: 900 },
      ]),
    ]);
    const acem = comItens.find((x) => x.n === 'acem em cubo');
    const acemSo = topItens([]).find((x) => x.n === 'acem em cubo');
    expect(acem!.t).toBeCloseTo(acemSo!.t + 900, 2);
  });

  it('a linha "total" da planilha nunca entra no top de itens', () => {
    expect(topItens([]).some((x) => x.n === 'total')).toBe(false);
  });

  it('mesDe extrai o mês da data do documento', () => {
    expect(mesDe('2026-08-24')).toBe('2026-08');
    expect(mesDe('')).toBe('');
  });
});
