import { custoDaSemana } from './custo-semana';
import {
  normalizar,
  notaNutricaoPrato,
  proteinaDoPrato,
  sugerirSemana,
  sugerirSemanaCriativa,
  sugerirSemanaHistorica,
  validarSemana,
} from './motor';
import type { Aceitacao, DiaCardapio, EstadoSemana } from './tipos';

export type ModoCenarioGovernanca = 'historico' | 'equilibrado' | 'criativo';

export interface MetricasCenarioGovernanca {
  custoTotal: number;
  custoPorRefeicao: number | null;
  itensSemPreco: number;
  itensEstimados: number;
  coberturaPrecoPct: number;
  aceitacaoMedia: number | null;
  pratosComAceitacao: number;
  votosAceitacao: number;
  pratosRecentes: number;
  ocorrenciasRecentes: number;
  nutricaoMedia: number;
  proteinasDistintas: number;
  erros: number;
  alertas: number;
  coberturaDadosPct: number;
}

export interface CenarioGovernanca {
  id: ModoCenarioGovernanca;
  titulo: string;
  selo: string;
  descricao: string;
  dias: DiaCardapio[];
  metricas: MetricasCenarioGovernanca;
  porques: string[];
  fingerprint: string;
  semelhanteA?: ModoCenarioGovernanca;
}

export interface ContextoCenariosGovernanca {
  estado: EstadoSemana;
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
  estoque?: Record<string, number>;
}

const META: Record<ModoCenarioGovernanca, { titulo: string; selo: string; descricao: string }> = {
  historico: {
    titulo: 'Base comprovada',
    selo: 'Mais previsível',
    descricao: 'Prioriza combinações que já apareceram na operação e respeita as regras atuais.',
  },
  equilibrado: {
    titulo: 'Equilíbrio VÉRTICE',
    selo: 'Melhor equilíbrio',
    descricao: 'Cruza aceitação, variedade, repetição recente, nutrição, estoque e custo.',
  },
  criativo: {
    titulo: 'Exploração controlada',
    selo: 'Mais novidade',
    descricao: 'Busca combinações menos repetidas sem abrir mão das regras da casa.',
  },
};

function clonarDias(dias: DiaCardapio[]): DiaCardapio[] {
  return dias.map((dia) => ({ ...dia }));
}

/**
 * Um cenário novo invalida derivados operacionais da composição anterior.
 * Mantém orçamento e histórico/auditoria, mas volta o fluxo a rascunho e
 * limpa ajustes, itens manuais, status, contagens e notas ligadas ao menu antigo.
 */
export function aplicarCenarioAoEstado(
  estado: EstadoSemana,
  dias: DiaCardapio[],
): EstadoSemana {
  if (dias.length !== 7) return estado;
  return {
    ...estado,
    dias: clonarDias(dias),
    etapa: 'rascunho',
    ajustes: {},
    manuais: {},
    status: {},
    refeicoes: undefined,
    notas: undefined,
    notasFiscais: undefined,
  };
}

function fingerprintDias(dias: DiaCardapio[]): string {
  return dias
    .map((dia) => [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa]
      .map((v) => normalizar(v))
      .join('|'))
    .join('::');
}

export function analisarCenarioGovernanca(args: {
  estadoBase: EstadoSemana;
  dias: DiaCardapio[];
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
}): MetricasCenarioGovernanca {
  const estadoCandidato = aplicarCenarioAoEstado(args.estadoBase, args.dias);
  const custo = custoDaSemana(
    estadoCandidato,
    args.precos,
    args.estimativas ?? {},
    { fatores: args.fatores, mostrarBasicos: args.mostrarBasicos },
  );
  const avisos = validarSemana(args.dias, args.precos);

  let somaAceitacao = 0;
  let pratosComAceitacao = 0;
  let votosAceitacao = 0;
  let pratosRecentes = 0;
  let ocorrenciasRecentes = 0;
  let somaNutricao = 0;
  const proteinas = new Set<string>();

  args.dias.forEach((dia) => {
    const principal = dia.principal.trim();
    if (!principal) return;
    const chave = normalizar(principal);
    const av = args.aceitacao[chave];
    if (av && av.n >= 2) {
      somaAceitacao += av.somaNotas / av.n;
      pratosComAceitacao += 1;
      votosAceitacao += av.n;
    }
    const freq = Math.max(0, args.frequencia[chave] ?? 0);
    if (freq > 0) {
      pratosRecentes += 1;
      ocorrenciasRecentes += freq;
    }
    somaNutricao += notaNutricaoPrato(principal);
    proteinas.add(proteinaDoPrato(principal));
  });

  const principais = args.dias.filter((dia) => dia.principal.trim()).length;
  const aceitacaoMedia = pratosComAceitacao > 0 ? somaAceitacao / pratosComAceitacao : null;
  const nutricaoMedia = principais > 0 ? somaNutricao / principais : 0;
  const coberturaAceitacao = principais > 0 ? pratosComAceitacao / principais : 0;
  const coberturaPreco = custo.itens > 0
    ? Math.max(0, Math.min(1, 1 - custo.itensSemPreco / custo.itens))
    : 0;
  const coberturaDadosPct = Math.round(((coberturaAceitacao + coberturaPreco) / 2) * 100);

  return {
    custoTotal: custo.total,
    custoPorRefeicao: custo.porRefeicao,
    itensSemPreco: custo.itensSemPreco,
    itensEstimados: custo.itensEstimados,
    coberturaPrecoPct: Math.round(coberturaPreco * 100),
    aceitacaoMedia,
    pratosComAceitacao,
    votosAceitacao,
    pratosRecentes,
    ocorrenciasRecentes,
    nutricaoMedia: Math.round(nutricaoMedia),
    proteinasDistintas: proteinas.size,
    erros: avisos.filter((a) => a.nivel === 'erro').length,
    alertas: avisos.filter((a) => a.nivel === 'alerta').length,
    coberturaDadosPct,
  };
}

function construirPorques(
  modo: ModoCenarioGovernanca,
  m: MetricasCenarioGovernanca,
): string[] {
  const itens: string[] = [];
  if (modo === 'historico') itens.push('O motor começou pelas combinações já vistas mais de uma vez no histórico real quando havia base suficiente.');
  if (modo === 'equilibrado') itens.push('O motor multi-critério priorizou aceitação e diversidade antes de custo, com penalidade para repetição recente.');
  if (modo === 'criativo') itens.push('O motor favoreceu combinações inéditas e diversidade, mantendo os mesmos limites operacionais de proteína.');

  if (m.aceitacaoMedia !== null) {
    itens.push(`Há aceitação histórica em ${m.pratosComAceitacao}/7 principais, média ${m.aceitacaoMedia.toFixed(1)}/5 (${m.votosAceitacao} votos).`);
  } else {
    itens.push('Ainda não há amostra mínima de avaliação para os principais deste cenário; isso reduz a evidência disponível, não vira nota inventada.');
  }
  if (m.pratosRecentes > 0) itens.push(`${m.pratosRecentes}/7 principais apareceram nas semanas recentes (${m.ocorrenciasRecentes} ocorrência(s) somadas).`);
  else itens.push('Nenhum principal deste cenário aparece no recorte recente carregado.');
  if (m.itensSemPreco > 0) itens.push(`${m.itensSemPreco} item(ns) continuam sem preço; custo deve ser tratado como incompleto.`);
  else if (m.itensEstimados > 0) itens.push(`Custo usa ${m.itensEstimados} preço(s) estimado(s); a tela distingue estimativa de preço real.`);
  else if (m.custoPorRefeicao !== null) itens.push('O custo foi calculado pela fonte única oficial da semana, sem uma calculadora paralela.');
  if (m.erros > 0 || m.alertas > 0) itens.push(`Validação encontrou ${m.erros} erro(s) e ${m.alertas} alerta(s); o cenário não é tratado como aprovado.`);
  else itens.push('Nenhuma quebra das regras semanais carregadas foi encontrada neste cenário.');
  return itens;
}

function montarCenario(
  modo: ModoCenarioGovernanca,
  dias: DiaCardapio[],
  contexto: ContextoCenariosGovernanca,
): CenarioGovernanca {
  const metricas = analisarCenarioGovernanca({
    estadoBase: contexto.estado,
    dias,
    precos: contexto.precos,
    estimativas: contexto.estimativas,
    fatores: contexto.fatores,
    mostrarBasicos: contexto.mostrarBasicos,
    aceitacao: contexto.aceitacao,
    frequencia: contexto.frequencia,
  });
  return {
    id: modo,
    ...META[modo],
    dias: clonarDias(dias),
    metricas,
    porques: construirPorques(modo, metricas),
    fingerprint: fingerprintDias(dias),
  };
}

/**
 * Gera três estratégias com o motor existente. A camada não reimplementa o
 * motor: ela apenas compara saídas usando as mesmas fontes de custo/validação.
 */
export function gerarCenariosGovernanca(
  contexto: ContextoCenariosGovernanca,
): CenarioGovernanca[] {
  const pessoas = contexto.estado.dias.map((dia) => dia.pessoas);
  const opts = {
    aceitacao: contexto.aceitacao,
    frequencia: contexto.frequencia,
    estoque: contexto.estoque ?? {},
  };
  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [
    ['historico', sugerirSemanaHistorica(pessoas, contexto.precos, opts)],
    ['equilibrado', sugerirSemana(pessoas, contexto.precos, opts)],
    ['criativo', sugerirSemanaCriativa(pessoas, contexto.precos, opts)],
  ];

  const cenarios = gerados
    .filter((item): item is [ModoCenarioGovernanca, DiaCardapio[]] => Array.isArray(item[1]) && item[1].length === 7)
    .map(([modo, dias]) => montarCenario(modo, dias, contexto));

  const vistos = new Map<string, ModoCenarioGovernanca>();
  return cenarios.map((cenario) => {
    const anterior = vistos.get(cenario.fingerprint);
    if (!anterior) {
      vistos.set(cenario.fingerprint, cenario.id);
      return cenario;
    }
    return { ...cenario, semelhanteA: anterior };
  });
}
