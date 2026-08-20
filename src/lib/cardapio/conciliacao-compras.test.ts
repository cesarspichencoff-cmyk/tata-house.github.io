import { describe, it, expect } from 'vitest';
import { compararPlanejadoReal, notasDaSemana, veredito } from './conciliacao-compras';
import type { LancamentoGasto } from './gastos';

const nota = (
  data: string,
  total: number,
  itens: { norm: string; produto: string; precoTotal: number }[] = [],
): LancamentoGasto => ({
  id: data + total,
  data,
  fornecedor: 'F',
  total,
  origem: 'nf',
  em: '',
  itens: itens.map((i) => ({
    produto: i.produto, norm: i.norm, qtd: 1, unid: 'KG', precoUnit: i.precoTotal, precoTotal: i.precoTotal,
  })),
});

const INICIO = '2026-08-24';
const FIM = '2026-08-30';

describe('planejado × gasto real', () => {
  it('só considera notas dentro da semana', () => {
    const gastos = [nota('2026-08-23', 100), nota('2026-08-26', 200), nota('2026-08-31', 300)];
    expect(notasDaSemana(gastos, INICIO, FIM).map((n) => n.total)).toEqual([200]);
  });

  it('sem nota na semana, avisa em vez de fingir comparação', () => {
    const c = compararPlanejadoReal([{ norm: 'arroz', nome: 'Arroz', custo: 100 }], [], INICIO, FIM);
    expect(c.temDados).toBe(false);
    expect(veredito(c).texto).toContain('Nenhuma nota');
  });

  it('compras dentro de 10% do plano são consideradas em linha', () => {
    const c = compararPlanejadoReal(
      [{ norm: 'arroz', nome: 'Arroz', custo: 1000 }],
      [nota('2026-08-26', 1050, [{ norm: 'arroz', produto: 'Arroz', precoTotal: 1050 }])],
      INICIO, FIM,
    );
    expect(veredito(c).tom).toBe('verde');
    expect(Math.round(c.percentual)).toBe(5);
  });

  it('estouro do plano é sinalizado com o percentual', () => {
    const c = compararPlanejadoReal(
      [{ norm: 'acem', nome: 'Acém', custo: 1000 }],
      [nota('2026-08-26', 1400, [{ norm: 'acem', produto: 'Acém', precoTotal: 1400 }])],
      INICIO, FIM,
    );
    const v = veredito(c);
    expect(v.tom).toBe('vermelho');
    expect(v.texto).toContain('40%');
    expect(c.diferenca).toBe(400);
  });

  it('item comprado sem estar no plano aparece separado', () => {
    const c = compararPlanejadoReal(
      [{ norm: 'arroz', nome: 'Arroz', custo: 100 }],
      [nota('2026-08-26', 400, [
        { norm: 'arroz', produto: 'Arroz', precoTotal: 100 },
        { norm: 'picanha', produto: 'Picanha', precoTotal: 300 },
      ])],
      INICIO, FIM,
    );
    expect(c.foraDoPlano.map((i) => i.norm)).toEqual(['picanha']);
    expect(c.foraDoPlano[0].real).toBe(300);
  });

  it('item planejado que não foi comprado aparece separado', () => {
    const c = compararPlanejadoReal(
      [
        { norm: 'arroz', nome: 'Arroz', custo: 100 },
        { norm: 'feijao', nome: 'Feijão', custo: 80 },
      ],
      [nota('2026-08-26', 100, [{ norm: 'arroz', produto: 'Arroz', precoTotal: 100 }])],
      INICIO, FIM,
    );
    expect(c.naoComprado.map((i) => i.norm)).toEqual(['feijao']);
  });

  it('itens comuns saem ordenados pela maior diferença', () => {
    const c = compararPlanejadoReal(
      [
        { norm: 'arroz', nome: 'Arroz', custo: 100 },
        { norm: 'acem', nome: 'Acém', custo: 100 },
      ],
      [nota('2026-08-26', 700, [
        { norm: 'arroz', produto: 'Arroz', precoTotal: 110 },
        { norm: 'acem', produto: 'Acém', precoTotal: 590 },
      ])],
      INICIO, FIM,
    );
    expect(c.itens[0].norm).toBe('acem');
    expect(c.itens[0].diferenca).toBe(490);
  });

  it('gasto bem abaixo do plano também é sinalizado — pode ter faltado comprar', () => {
    const c = compararPlanejadoReal(
      [{ norm: 'arroz', nome: 'Arroz', custo: 1000 }],
      [nota('2026-08-26', 400, [{ norm: 'arroz', produto: 'Arroz', precoTotal: 400 }])],
      INICIO, FIM,
    );
    expect(veredito(c).texto).toContain('abaixo');
  });
});

describe('casamento de nomes entre nota e plano', () => {
  const plano = [{ norm: 'costela', nome: 'Costela', custo: 1000 }];

  it('nome da nota diferente do catálogo não vira falsa acusação de compra fora do plano', () => {
    const c = compararPlanejadoReal(
      plano,
      [nota('2026-08-26', 1100, [
        { norm: 'costela bovina resfriada', produto: 'COSTELA BOV RESF KG', precoTotal: 1100 },
      ])],
      INICIO, FIM,
    );
    expect(c.foraDoPlano).toEqual([]);
    expect(c.itens[0].norm).toBe('costela');
    expect(c.itens[0].real).toBe(1100);
  });

  it('um casador externo (catálogo) é usado quando o prefixo não resolve', () => {
    const casar = (nome: string) => (/boi|carne/i.test(nome) ? 'costela' : null);
    const c = compararPlanejadoReal(
      plano,
      [nota('2026-08-26', 900, [{ norm: 'carne especial', produto: 'CARNE ESPECIAL', precoTotal: 900 }])],
      INICIO, FIM, casar,
    );
    expect(c.foraDoPlano).toEqual([]);
    expect(c.itens[0].norm).toBe('costela');
  });

  it('item realmente fora do plano continua sendo apontado', () => {
    const c = compararPlanejadoReal(
      plano,
      [nota('2026-08-26', 1300, [
        { norm: 'costela', produto: 'Costela', precoTotal: 1000 },
        { norm: 'picanha', produto: 'Picanha', precoTotal: 300 },
      ])],
      INICIO, FIM,
    );
    expect(c.foraDoPlano.map((i) => i.norm)).toEqual(['picanha']);
  });
});

describe('veredito olha a composição, não só o total', () => {
  it('total dentro da faixa mas compra trocada é sinalizado', () => {
    // Gastou quase o previsto, porém metade em item que o cardápio não pedia.
    const c = compararPlanejadoReal(
      [
        { norm: 'costela', nome: 'Costela', custo: 500 },
        { norm: 'lombo suino', nome: 'Lombo Suíno', custo: 500 },
      ],
      [nota('2026-08-26', 1000, [
        { norm: 'costela', produto: 'Costela', precoTotal: 500 },
        { norm: 'picanha', produto: 'Picanha', precoTotal: 500 },
      ])],
      INICIO, FIM,
    );
    const v = veredito(c);
    expect(v.tom).toBe('ouro');
    expect(v.texto).toContain('fora do plano');
  });

  it('compra fiel de verdade continua verde', () => {
    const c = compararPlanejadoReal(
      [{ norm: 'costela', nome: 'Costela', custo: 1000 }],
      [nota('2026-08-26', 1000, [{ norm: 'costela', produto: 'Costela', precoTotal: 1000 }])],
      INICIO, FIM,
    );
    expect(veredito(c).tom).toBe('verde');
  });
});
