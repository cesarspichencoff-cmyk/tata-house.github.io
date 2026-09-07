import { describe, expect, it } from 'vitest';
import { construirHouseGovernancaSnapshotV2 } from './governanca-house-snapshot';
import type { EstadoSemana } from './tipos';

const datas = [
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
  '2026-09-11', '2026-09-12', '2026-09-13',
] as const;

function semana(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 1500,
    etapa: 'compras',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
    dias: Array.from({ length: 7 }, (_, i) => ({
      pessoas: 100 + i,
      principal: i === 0 ? 'Frango assado' : '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: i === 0 ? 'Batata' : '',
      salada: i === 0 ? 'Folhas' : '',
      sobremesa: i === 0 ? 'Fruta' : '',
    })),
  };
}

function base() {
  return {
    semanaId: '2026-S37',
    datas,
    estado: semana(),
    contagens: [{
      data: '2026-09-07',
      almoco: 70,
      jantar: 20,
      marmitas: 10,
      registradoEm: '2026-09-07T22:00:00.000Z',
    }],
    desperdicio: [{
      id: 'd1',
      dia: 0,
      prato: 'Frango assado',
      produzido: 100,
      consumido: 92,
      unid: 'porções' as const,
      em: '2026-09-07T22:10:00.000Z',
    }],
    estoque: {
      arroz: { item: 'Arroz', unid: 'kg', qtd: 4, minimo: 5, atualizadoEm: '2026-09-07T20:00:00.000Z' },
      feijao: { item: 'Feijão', unid: 'kg', qtd: 8, minimo: 3, atualizadoEm: '2026-09-07T20:00:00.000Z' },
    },
    precos: { arroz: 22.5, feijao: 18 },
    fornecedores: { arroz: 'Fornecedor A' },
    aceitacao: {
      frango: {
        prato: 'Frango assado',
        bom: 8,
        ok: 1,
        ruim: 1,
        somaNotas: 44,
        n: 10,
        atualizadoEm: '2026-09-07T22:20:00.000Z',
      },
    },
    geradoEm: '2026-09-07T23:00:00.000Z',
  };
}

describe('House → Governança snapshot v2', () => {
  it('é aditivo, read-only e preserva o V1 para cardápio/refeições', () => {
    const snapshot = construirHouseGovernancaSnapshotV2(base());

    expect(snapshot).toMatchObject({
      contrato: 'tata-house.governanca.snapshot.v2',
      versao: 2,
      modo: 'read-only',
      fonte: 'tata-house',
      dominio: 'tata-house',
      semanaId: '2026-S37',
      geradoEm: '2026-09-07T23:00:00.000Z',
    });
    expect(snapshot.semana?.contrato).toBe('tata-house.governanca.v1');
    expect(snapshot.semana?.dias[0].cardapio.guarnicaoFixa).toBe('Arroz e Feijão');
    expect(snapshot.semana?.dias[0].servido.totais?.total).toBe(100);
  });

  it('calcula desperdício e estoque baixo sem alterar os valores de origem', () => {
    const snapshot = construirHouseGovernancaSnapshotV2(base());

    expect(snapshot.desperdicio).toMatchObject({
      totalProduzido: 100,
      totalConsumido: 92,
      totalDesperdicio: 8,
      taxa: 0.08,
    });
    expect(snapshot.desperdicio?.registros[0]).toMatchObject({
      data: '2026-09-07',
      prato: 'Frango assado',
      desperdicio: 8,
      taxa: 0.08,
    });
    expect(snapshot.estoque).toMatchObject({ totalItens: 2, itensBaixos: 1 });
    expect(snapshot.estoque?.itens.find((x) => x.chave === 'arroz')?.baixo).toBe(true);
  });

  it('expõe preços e apenas o nome operacional do fornecedor', () => {
    const snapshot = construirHouseGovernancaSnapshotV2(base());

    expect(snapshot.precos?.itens).toEqual([
      { chave: 'arroz', valor: 22.5, fornecedor: 'Fornecedor A' },
      { chave: 'feijao', valor: 18 },
    ]);
  });

  it('calcula aceitação agregada sem dados pessoais', () => {
    const snapshot = construirHouseGovernancaSnapshotV2(base());

    expect(snapshot.aceitacao).toMatchObject({
      totalPratos: 1,
      totalAvaliacoes: 10,
      itens: [{
        chave: 'frango',
        prato: 'Frango assado',
        bom: 8,
        ok: 1,
        ruim: 1,
        n: 10,
        media: 4.4,
      }],
    });
  });

  it('respeita leitura seletiva e não carrega seções não pedidas', () => {
    const snapshot = construirHouseGovernancaSnapshotV2({
      ...base(),
      secoes: ['estoque', 'desperdicio'],
    });

    expect(snapshot.secoes).toEqual(['estoque', 'desperdicio']);
    expect(snapshot.semana).toBeUndefined();
    expect(snapshot.precos).toBeUndefined();
    expect(snapshot.aceitacao).toBeUndefined();
    expect(snapshot.estoque).toBeDefined();
    expect(snapshot.desperdicio).toBeDefined();
  });
});
