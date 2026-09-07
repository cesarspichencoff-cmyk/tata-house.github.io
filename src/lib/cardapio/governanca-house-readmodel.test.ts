import { describe, expect, it } from 'vitest';
import { construirHouseGovernancaReadModelV1 } from './governanca-house-readmodel';
import type { EstadoSemana } from './tipos';

function semana(): EstadoSemana {
  return {
    versao: 1,
    orcamento: null,
    etapa: 'cozinha',
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

const datas = [
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
  '2026-09-11', '2026-09-12', '2026-09-13',
] as const;

describe('House → Governança read model', () => {
  it('mantém o House como domínio único e preserva o cardápio completo', () => {
    const modelo = construirHouseGovernancaReadModelV1({
      semanaId: '2026-S37',
      datas,
      estado: semana(),
      contagens: [],
    });

    expect(modelo).toMatchObject({
      contrato: 'tata-house.governanca.v1',
      modo: 'read-only',
      fonte: 'tata-house',
      dominio: 'tata-house',
      semanaId: '2026-S37',
      etapa: 'cozinha',
    });
    expect(modelo.dias[0].cardapio).toEqual({
      principal: 'Frango assado',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: 'Batata',
      salada: 'Folhas',
      sobremesa: 'Fruta',
    });
  });

  it('não inventa Itaim/Pinheiros quando não há distribuição registrada', () => {
    const modelo = construirHouseGovernancaReadModelV1({
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
    });

    expect(modelo.dias[0].planejamento).toEqual({ pessoas: 100, conciliacao: 'sem_distribuicao' });
    expect(modelo.dias[0].servido).toEqual({
      registrado: true,
      totais: { almoco: 70, jantar: 20, marmitas: 10, total: 100 },
      conciliacao: 'sem_distribuicao',
    });
  });

  it('expõe Itaim/Pinheiros somente como pontos da refeição e prova a conciliação', () => {
    const modelo = construirHouseGovernancaReadModelV1({
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
      pontosPorData: {
        '2026-09-07': {
          planejamento: { itaim: 60, pinheiros: 40 },
          servido: {
            itaim: { almoco: 40, jantar: 15, marmitas: 5 },
            pinheiros: { almoco: 30, jantar: 5, marmitas: 5 },
          },
        },
      },
    });

    expect(modelo.dias[0].planejamento).toMatchObject({
      pessoas: 100,
      porPonto: { itaim: 60, pinheiros: 40 },
      conciliacao: 'conciliado',
    });
    expect(modelo.dias[0].servido).toMatchObject({
      registrado: true,
      porPonto: {
        itaim: { almoco: 40, jantar: 15, marmitas: 5 },
        pinheiros: { almoco: 30, jantar: 5, marmitas: 5 },
      },
      conciliacao: 'conciliado',
    });
  });

  it('marca divergência sem alterar os totais do House', () => {
    const modelo = construirHouseGovernancaReadModelV1({
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
      pontosPorData: {
        '2026-09-07': {
          servido: {
            itaim: { almoco: 30, jantar: 15, marmitas: 5 },
            pinheiros: { almoco: 30, jantar: 5, marmitas: 5 },
          },
        },
      },
    });

    expect(modelo.dias[0].servido.totais).toEqual({ almoco: 70, jantar: 20, marmitas: 10, total: 100 });
    expect(modelo.dias[0].servido.conciliacao).toBe('divergente');
  });
});
