export type PontoRefeicao = 'itaim' | 'pinheiros';

export interface QuantidadeRefeicoes {
  almoco: number;
  jantar: number;
  marmitas: number;
}

export type DistribuicaoRefeicoesPorPonto = Partial<Record<PontoRefeicao, QuantidadeRefeicoes>>;
export type PlanejamentoPorPonto = Partial<Record<PontoRefeicao, number>>;

export const PONTOS_REFEICAO: readonly PontoRefeicao[] = ['itaim', 'pinheiros'] as const;

export const ROTULO_PONTO_REFEICAO: Record<PontoRefeicao, string> = {
  itaim: 'Itaim',
  pinheiros: 'Pinheiros',
};

export type StatusConciliacaoPontos = 'sem_distribuicao' | 'conciliado' | 'divergente';

export interface ConciliacaoPlanejamentoPontos {
  status: StatusConciliacaoPontos;
  total: number;
  distribuido: number;
  diferenca: number;
}

export interface ConciliacaoRefeicoesPontos {
  status: StatusConciliacaoPontos;
  total: QuantidadeRefeicoes;
  distribuido: QuantidadeRefeicoes;
  diferenca: QuantidadeRefeicoes;
}

function numeroNaoNegativo(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function distribuicaoPresente<T>(distribuicao: Partial<Record<PontoRefeicao, T>> | undefined): boolean {
  return Boolean(distribuicao && PONTOS_REFEICAO.some((ponto) => distribuicao[ponto] !== undefined));
}

export function somarPlanejamentoPorPonto(distribuicao: PlanejamentoPorPonto | undefined): number {
  if (!distribuicao) return 0;
  return PONTOS_REFEICAO.reduce((total, ponto) => total + numeroNaoNegativo(distribuicao[ponto]), 0);
}

export function somarRefeicoesPorPonto(
  distribuicao: DistribuicaoRefeicoesPorPonto | undefined,
): QuantidadeRefeicoes {
  return PONTOS_REFEICAO.reduce<QuantidadeRefeicoes>(
    (total, ponto) => {
      const atual = distribuicao?.[ponto];
      return {
        almoco: total.almoco + numeroNaoNegativo(atual?.almoco),
        jantar: total.jantar + numeroNaoNegativo(atual?.jantar),
        marmitas: total.marmitas + numeroNaoNegativo(atual?.marmitas),
      };
    },
    { almoco: 0, jantar: 0, marmitas: 0 },
  );
}

/**
 * Concilia a distribuição planejada por ponto com o total já usado pelo House.
 * Nunca redistribui, corrige ou inventa valores: apenas mede a diferença.
 */
export function conciliarPlanejamentoPorPonto(
  totalPlanejado: number,
  distribuicao: PlanejamentoPorPonto | undefined,
): ConciliacaoPlanejamentoPontos {
  const total = numeroNaoNegativo(totalPlanejado);
  const distribuido = somarPlanejamentoPorPonto(distribuicao);
  const diferenca = distribuido - total;

  return {
    status: !distribuicaoPresente(distribuicao)
      ? 'sem_distribuicao'
      : diferenca === 0
        ? 'conciliado'
        : 'divergente',
    total,
    distribuido,
    diferenca,
  };
}

/**
 * Concilia almoço/jantar/marmitas por ponto com os totais atuais do House.
 * A distribuição é informação adicional; os totais existentes continuam sendo
 * a referência e nenhum valor é dividido automaticamente entre Itaim/Pinheiros.
 */
export function conciliarRefeicoesPorPonto(
  totalInformado: QuantidadeRefeicoes,
  distribuicao: DistribuicaoRefeicoesPorPonto | undefined,
): ConciliacaoRefeicoesPontos {
  const total: QuantidadeRefeicoes = {
    almoco: numeroNaoNegativo(totalInformado.almoco),
    jantar: numeroNaoNegativo(totalInformado.jantar),
    marmitas: numeroNaoNegativo(totalInformado.marmitas),
  };
  const distribuido = somarRefeicoesPorPonto(distribuicao);
  const diferenca: QuantidadeRefeicoes = {
    almoco: distribuido.almoco - total.almoco,
    jantar: distribuido.jantar - total.jantar,
    marmitas: distribuido.marmitas - total.marmitas,
  };
  const conciliado = diferenca.almoco === 0 && diferenca.jantar === 0 && diferenca.marmitas === 0;

  return {
    status: !distribuicaoPresente(distribuicao)
      ? 'sem_distribuicao'
      : conciliado
        ? 'conciliado'
        : 'divergente',
    total,
    distribuido,
    diferenca,
  };
}

export function normalizarQuantidadeRefeicoes(
  valor: Partial<QuantidadeRefeicoes> | undefined,
): QuantidadeRefeicoes {
  return {
    almoco: numeroNaoNegativo(valor?.almoco),
    jantar: numeroNaoNegativo(valor?.jantar),
    marmitas: numeroNaoNegativo(valor?.marmitas),
  };
}
