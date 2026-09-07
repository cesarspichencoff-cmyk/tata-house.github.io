import type {
  Aceitacao,
  ContagemRefeicoesDia,
  EstadoSemana,
  Estoque,
  RegistroDesperdicio,
} from './tipos';
import {
  construirHouseGovernancaReadModelV1,
  type HouseGovernancaReadModelV1,
  type PontosDiaReadModel,
} from './governanca-house-readmodel';

export const CONTRATO_HOUSE_GOVERNANCA_SNAPSHOT = 'tata-house.governanca.snapshot.v2' as const;

export const SECOES_HOUSE_GOVERNANCA = [
  'cardapio',
  'refeicoes',
  'desperdicio',
  'estoque',
  'precos',
  'aceitacao',
] as const;

export type SecaoHouseGovernanca = (typeof SECOES_HOUSE_GOVERNANCA)[number];

export interface DesperdicioGovernancaItemV2 {
  data: string;
  prato: string;
  produzido: number;
  consumido: number;
  desperdicio: number;
  taxa: number | null;
  unid: 'porções' | 'kg';
  motivo?: string;
}

export interface EstoqueGovernancaItemV2 {
  chave: string;
  item: string;
  unid: string;
  qtd: number;
  minimo: number;
  baixo: boolean;
  atualizadoEm: string;
}

export interface PrecoGovernancaItemV2 {
  chave: string;
  valor: number;
  fornecedor?: string;
}

export interface AceitacaoGovernancaItemV2 {
  chave: string;
  prato: string;
  bom: number;
  ok: number;
  ruim: number;
  n: number;
  media: number | null;
  atualizadoEm: string;
}

export interface HouseGovernancaSnapshotV2 {
  contrato: typeof CONTRATO_HOUSE_GOVERNANCA_SNAPSHOT;
  versao: 2;
  modo: 'read-only';
  fonte: 'tata-house';
  dominio: 'tata-house';
  geradoEm: string;
  semanaId: string;
  secoes: SecaoHouseGovernanca[];
  semana?: HouseGovernancaReadModelV1;
  desperdicio?: {
    registros: DesperdicioGovernancaItemV2[];
    totalProduzido: number;
    totalConsumido: number;
    totalDesperdicio: number;
    taxa: number | null;
  };
  estoque?: {
    itens: EstoqueGovernancaItemV2[];
    totalItens: number;
    itensBaixos: number;
  };
  precos?: {
    itens: PrecoGovernancaItemV2[];
    totalItens: number;
  };
  aceitacao?: {
    itens: AceitacaoGovernancaItemV2[];
    totalPratos: number;
    totalAvaliacoes: number;
  };
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

function arredondar(valor: number, casas = 3): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function secoesValidas(secoes?: readonly SecaoHouseGovernanca[]): SecaoHouseGovernanca[] {
  const pedidas = secoes?.length ? secoes : SECOES_HOUSE_GOVERNANCA;
  const permitidas = new Set<string>(SECOES_HOUSE_GOVERNANCA);
  return [...new Set(pedidas.filter((secao) => permitidas.has(secao)))];
}

function construirDesperdicio(
  registros: readonly RegistroDesperdicio[],
  datas: readonly string[],
): NonNullable<HouseGovernancaSnapshotV2['desperdicio']> {
  const itens = registros
    .filter((registro) => Number.isInteger(registro.dia) && registro.dia >= 0 && registro.dia < datas.length)
    .map((registro): DesperdicioGovernancaItemV2 => {
      const produzido = Math.max(0, numero(registro.produzido));
      const consumido = Math.max(0, numero(registro.consumido));
      const desperdicio = Math.max(0, produzido - consumido);
      return {
        data: datas[registro.dia],
        prato: registro.prato,
        produzido,
        consumido,
        desperdicio,
        taxa: produzido > 0 ? arredondar(desperdicio / produzido, 4) : null,
        unid: registro.unid,
        ...(registro.motivo?.trim() ? { motivo: registro.motivo.trim() } : {}),
      };
    });

  const totalProduzido = arredondar(itens.reduce((soma, item) => soma + item.produzido, 0));
  const totalConsumido = arredondar(itens.reduce((soma, item) => soma + item.consumido, 0));
  const totalDesperdicio = arredondar(itens.reduce((soma, item) => soma + item.desperdicio, 0));

  return {
    registros: itens,
    totalProduzido,
    totalConsumido,
    totalDesperdicio,
    taxa: totalProduzido > 0 ? arredondar(totalDesperdicio / totalProduzido, 4) : null,
  };
}

function construirEstoque(estoque: Estoque): NonNullable<HouseGovernancaSnapshotV2['estoque']> {
  const itens = Object.entries(estoque)
    .map(([chave, item]): EstoqueGovernancaItemV2 => ({
      chave,
      item: item.item,
      unid: item.unid,
      qtd: Math.max(0, numero(item.qtd)),
      minimo: Math.max(0, numero(item.minimo)),
      baixo: item.minimo > 0 && item.qtd <= item.minimo,
      atualizadoEm: item.atualizadoEm,
    }))
    .sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));

  return {
    itens,
    totalItens: itens.length,
    itensBaixos: itens.filter((item) => item.baixo).length,
  };
}

function construirPrecos(
  precos: Readonly<Record<string, number>>,
  fornecedores: Readonly<Record<string, string>>,
): NonNullable<HouseGovernancaSnapshotV2['precos']> {
  const itens = Object.entries(precos)
    .filter(([, valor]) => typeof valor === 'number' && Number.isFinite(valor) && valor > 0)
    .map(([chave, valor]): PrecoGovernancaItemV2 => ({
      chave,
      valor,
      ...(fornecedores[chave]?.trim() ? { fornecedor: fornecedores[chave].trim() } : {}),
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));

  return { itens, totalItens: itens.length };
}

function construirAceitacao(aceitacao: Aceitacao): NonNullable<HouseGovernancaSnapshotV2['aceitacao']> {
  const itens = Object.entries(aceitacao)
    .map(([chave, registro]): AceitacaoGovernancaItemV2 => ({
      chave,
      prato: registro.prato,
      bom: Math.max(0, numero(registro.bom)),
      ok: Math.max(0, numero(registro.ok)),
      ruim: Math.max(0, numero(registro.ruim)),
      n: Math.max(0, numero(registro.n)),
      media: registro.n > 0 ? arredondar(registro.somaNotas / registro.n, 2) : null,
      atualizadoEm: registro.atualizadoEm,
    }))
    .sort((a, b) => a.prato.localeCompare(b.prato, 'pt-BR'));

  return {
    itens,
    totalPratos: itens.length,
    totalAvaliacoes: itens.reduce((soma, item) => soma + item.n, 0),
  };
}

/**
 * Snapshot aditivo para Governança. Nenhum dado é escrito, inferido ou
 * redistribuído. O V1 continua estável e é reutilizado para cardápio/refeições.
 */
export function construirHouseGovernancaSnapshotV2(entrada: {
  semanaId: string;
  datas: readonly string[];
  estado: EstadoSemana;
  contagens: readonly ContagemRefeicoesDia[];
  pontosPorData?: Readonly<Record<string, PontosDiaReadModel | undefined>>;
  desperdicio: readonly RegistroDesperdicio[];
  estoque: Estoque;
  precos: Readonly<Record<string, number>>;
  fornecedores: Readonly<Record<string, string>>;
  aceitacao: Aceitacao;
  secoes?: readonly SecaoHouseGovernanca[];
  geradoEm?: string;
}): HouseGovernancaSnapshotV2 {
  const secoes = secoesValidas(entrada.secoes);
  const querSemana = secoes.includes('cardapio') || secoes.includes('refeicoes');

  return {
    contrato: CONTRATO_HOUSE_GOVERNANCA_SNAPSHOT,
    versao: 2,
    modo: 'read-only',
    fonte: 'tata-house',
    dominio: 'tata-house',
    geradoEm: entrada.geradoEm ?? new Date().toISOString(),
    semanaId: entrada.semanaId,
    secoes,
    ...(querSemana
      ? {
          semana: construirHouseGovernancaReadModelV1({
            semanaId: entrada.semanaId,
            datas: entrada.datas,
            estado: entrada.estado,
            contagens: entrada.contagens,
            pontosPorData: entrada.pontosPorData,
          }),
        }
      : {}),
    ...(secoes.includes('desperdicio')
      ? { desperdicio: construirDesperdicio(entrada.desperdicio, entrada.datas) }
      : {}),
    ...(secoes.includes('estoque') ? { estoque: construirEstoque(entrada.estoque) } : {}),
    ...(secoes.includes('precos') ? { precos: construirPrecos(entrada.precos, entrada.fornecedores) } : {}),
    ...(secoes.includes('aceitacao') ? { aceitacao: construirAceitacao(entrada.aceitacao) } : {}),
  };
}
