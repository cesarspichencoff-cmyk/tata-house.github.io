import { describe, it, expect } from 'vitest';
import { custoDaSemana, custoDoDia } from './custo-semana';
import { listaDoDia, normalizar } from './motor';
import { custoTipado } from './precos';
import type { EstadoSemana } from './tipos';

function semana(parcial: Partial<EstadoSemana> = {}): EstadoSemana {
  return {
    versao: 1,
    orcamento: null,
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
    dias: Array.from({ length: 7 }, () => ({
      pessoas: 60,
      principal: '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    ...parcial,
  };
}

/** Semana com um dia montado, para ter itens de verdade na lista. */
function comUmDia(): EstadoSemana {
  const s = semana();
  s.dias[0].principal = 'Frango grelhado';
  return s;
}

describe('custo da semana — fonte única', () => {
  it('respeita o ajuste de quantidade feito pela cozinha', () => {
    const base = comUmDia();
    const precos: Record<string, number> = {};
    // dá preço a todos os itens do dia, para o total não ficar zerado
    listaDoDia(base.dias[0]).forEach((s) => { precos[normalizar(s.item)] = 10; });

    const antes = custoDoDia(base, 0, precos).total;

    // a cozinha dobra a quantidade do primeiro item
    const primeiro = listaDoDia(base.dias[0])[0];
    const comAjuste = comUmDia();
    comAjuste.ajustes = { 0: { [normalizar(primeiro.item)]: { qtd: primeiro.qtd * 2 } } };

    const depois = custoDoDia(comAjuste, 0, precos).total;
    expect(depois).toBeGreaterThan(antes); // o caminho antigo ignorava isso
  });

  it('respeita a remoção de um item', () => {
    const base = comUmDia();
    const precos: Record<string, number> = {};
    listaDoDia(base.dias[0]).forEach((s) => { precos[normalizar(s.item)] = 10; });
    const antes = custoDoDia(base, 0, precos).total;

    const primeiro = listaDoDia(base.dias[0])[0];
    const comRemocao = comUmDia();
    comRemocao.ajustes = { 0: { [normalizar(primeiro.item)]: { removido: true } } };

    expect(custoDoDia(comRemocao, 0, precos).total).toBeLessThan(antes);
  });

  it('inclui itens acrescentados à mão', () => {
    const base = comUmDia();
    const precos: Record<string, number> = { [normalizar('Item extra teste')]: 25 };
    const antes = custoDoDia(base, 0, precos).total;

    const comManual = comUmDia();
    comManual.manuais = { 0: [{ item: 'Item extra teste', unid: 'kg', qtd: 4 }] };

    expect(custoDoDia(comManual, 0, precos).total).toBeCloseTo(antes + 100, 5);
  });

  it('o caminho antigo da tela do cardápio ignorava os ajustes — este não', () => {
    const primeiro = listaDoDia(comUmDia().dias[0])[0];
    const precos: Record<string, number> = {};
    listaDoDia(comUmDia().dias[0]).forEach((s) => { precos[normalizar(s.item)] = 10; });

    const est = comUmDia();
    est.ajustes = { 0: { [normalizar(primeiro.item)]: { qtd: primeiro.qtd * 5 } } };

    // como a tela do cardápio calculava antes: lista BASE, sem ajustes
    const antigo = custoTipado(
      listaDoDia(est.dias[0]).map((s) => ({ norm: normalizar(s.item), qtd: s.qtd, unid: s.unid })),
      precos,
    ).total;

    const novo = custoDoDia(est, 0, precos).total;
    expect(novo).toBeGreaterThan(antigo);
  });

  it('soma a semana e calcula o custo por refeição', () => {
    const s = comUmDia();
    s.dias[0].pessoas = 50;
    const precos: Record<string, number> = {};
    listaDoDia(s.dias[0]).forEach((x) => { precos[normalizar(x.item)] = 10; });

    const c = custoDaSemana(s, precos);
    expect(c.totalPessoas).toBe(50);
    expect(c.porRefeicao).toBeCloseTo(c.total / 50, 6);
  });

  it('itens sem preço são contados e listados, não somem em silêncio', () => {
    const s = comUmDia();
    const c = custoDaSemana(s, {}, {}); // nenhum preço informado
    expect(c.itensSemPreco + c.itensEstimados + c.itensReais).toBe(c.itens);
    if (c.itensSemPreco > 0) expect(c.semPreco.length).toBeGreaterThan(0);
  });

  it('semana vazia não gera custo nem divide por zero', () => {
    const c = custoDaSemana(semana(), {});
    expect(c.total).toBe(0);
    expect(c.porRefeicao).toBeNull();
  });
});
