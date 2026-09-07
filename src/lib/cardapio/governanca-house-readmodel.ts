import type { ContagemRefeicoesDia, EstadoSemana } from './tipos';
import {
  conciliarPlanejamentoPorPonto,
  conciliarRefeicoesPorPonto,
  type DistribuicaoRefeicoesPorPonto,
  type PlanejamentoPorPonto,
  type QuantidadeRefeicoes,
  type StatusConciliacaoPontos,
} from './pontos-refeicao';

export const CONTRATO_HOUSE_GOVERNANCA_READMODEL = 'tata-house.governanca.v1' as const;

export interface PontosDiaReadModel {
  planejamento?: PlanejamentoPorPonto;
  servido?: DistribuicaoRefeicoesPorPonto;
}

export interface RefeicoesReadModel {
  almoco: number;
  jantar: number;
  marmitas: number;
  total: number;
}

export interface DiaHouseGovernancaReadModelV1 {
  data: string;
  cardapio: {
    principal: string;
    guarnicaoFixa: string;
    guarnicao: string;
    salada: string;
    sobremesa: string;
  };
  planejamento: {
    pessoas: number;
    porPonto?: PlanejamentoPorPonto;
    conciliacao: StatusConciliacaoPontos;
  };
  servido: {
    registrado: boolean;
    totais: RefeicoesReadModel | null;
    porPonto?: DistribuicaoRefeicoesPorPonto;
    conciliacao: StatusConciliacaoPontos | 'sem_registro';
  };
}

export interface HouseGovernancaReadModelV1 {
  contrato: typeof CONTRATO_HOUSE_GOVERNANCA_READMODEL;
  versao: 1;
  modo: 'read-only';
  fonte: 'tata-house';
  dominio: 'tata-house';
  semanaId: string;
  etapa: EstadoSemana['etapa'];
  dias: DiaHouseGovernancaReadModelV1[];
}

function quantidadeTotal(c: ContagemRefeicoesDia): QuantidadeRefeicoes {
  return {
    almoco: Math.max(0, c.almoco),
    jantar: Math.max(0, c.jantar),
    marmitas: Math.max(0, c.marmitas),
  };
}

function totais(c: ContagemRefeicoesDia): RefeicoesReadModel {
  const q = quantidadeTotal(c);
  return { ...q, total: q.almoco + q.jantar + q.marmitas };
}

/**
 * Constrói a superfície de leitura da Governança a partir do estado real do
 * House. Itaim/Pinheiros só aparecem quando a distribuição foi registrada;
 * ausência nunca é preenchida por estimativa ou divisão automática.
 */
export function construirHouseGovernancaReadModelV1(entrada: {
  semanaId: string;
  datas: readonly string[];
  estado: EstadoSemana;
  contagens: readonly ContagemRefeicoesDia[];
  pontosPorData?: Readonly<Record<string, PontosDiaReadModel | undefined>>;
}): HouseGovernancaReadModelV1 {
  if (entrada.datas.length !== 7 || entrada.estado.dias.length !== 7) {
    throw new Error('O read model exige exatamente 7 dias de uma semana House.');
  }

  const contagemPorData = new Map(entrada.contagens.map((c) => [c.data, c]));

  const dias = entrada.datas.map((data, indice): DiaHouseGovernancaReadModelV1 => {
    const dia = entrada.estado.dias[indice];
    const pontos = entrada.pontosPorData?.[data];
    const planejamento = conciliarPlanejamentoPorPonto(dia.pessoas, pontos?.planejamento);
    const contagem = contagemPorData.get(data);

    if (!contagem) {
      return {
        data,
        cardapio: {
          principal: dia.principal,
          guarnicaoFixa: dia.guarnicaoFixa,
          guarnicao: dia.guarnicao,
          salada: dia.salada,
          sobremesa: dia.sobremesa,
        },
        planejamento: {
          pessoas: dia.pessoas,
          ...(pontos?.planejamento ? { porPonto: pontos.planejamento } : {}),
          conciliacao: planejamento.status,
        },
        servido: {
          registrado: false,
          totais: null,
          ...(pontos?.servido ? { porPonto: pontos.servido } : {}),
          conciliacao: 'sem_registro',
        },
      };
    }

    const conciliacaoServido = conciliarRefeicoesPorPonto(quantidadeTotal(contagem), pontos?.servido);
    return {
      data,
      cardapio: {
        principal: dia.principal,
        guarnicaoFixa: dia.guarnicaoFixa,
        guarnicao: dia.guarnicao,
        salada: dia.salada,
        sobremesa: dia.sobremesa,
      },
      planejamento: {
        pessoas: dia.pessoas,
        ...(pontos?.planejamento ? { porPonto: pontos.planejamento } : {}),
        conciliacao: planejamento.status,
      },
      servido: {
        registrado: true,
        totais: totais(contagem),
        ...(pontos?.servido ? { porPonto: pontos.servido } : {}),
        conciliacao: conciliacaoServido.status,
      },
    };
  });

  return {
    contrato: CONTRATO_HOUSE_GOVERNANCA_READMODEL,
    versao: 1,
    modo: 'read-only',
    fonte: 'tata-house',
    dominio: 'tata-house',
    semanaId: entrada.semanaId,
    etapa: entrada.estado.etapa,
    dias,
  };
}
