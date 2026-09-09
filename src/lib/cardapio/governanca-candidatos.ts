import { custoDaSemana } from './custo-semana';
import {
  normalizar,
  notaNutricaoPrato,
  PESSOAS_PADRAO,
  proteinaDoPrato,
  sugerirSemana,
  sugerirSemanaCriativa,
  sugerirSemanaHistorica,
  validarSemana,
} from './motor';
import {
  aceitacaoParaPlanejamento,
  demandaOficialPorDiaSemana,
  evidenciaGovernancaAtual,
  resumoOperacionalOficial,
} from './governanca-readonly';
import { impactoRestricoesLocais } from './governanca-restricoes';
import type { DiaCardapio, EstadoSemana, RegistroDesperdicio } from './tipos';

export type ModoCenarioGovernanca = 'historico' | 'equilibrado' | 'criativo';
export type AceitacaoPlanejamento = Record<string, { n: number; somaNotas: number }>;

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
  ocorrenciasRestricao: number;
  pessoasRestricaoSomadas: number;
  desperdicioMedioPct: number | null;
  pratosComDesperdicio: number;
  amostraDesperdicio: number;
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
  aceitacao: AceitacaoPlanejamento;
  frequencia: Record<string, number>;
  estoque?: Record<string, number>;
  restricoesEquipe?: Record<string, number>;
  desperdicioHistorico?: RegistroDesperdicio[];
  /** Pessoas geradas automaticamente pelo próprio House antes de qualquer ajuste humano. */
  baselineAutomatico?: number[];
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

export interface DesperdicioPratoPlanejamento { taxaMedia: number; n: number; }

/** Taxa adimensional por prato. Cada registro é normalizado dentro da própria unidade
 * (kg ou porções), portanto nunca somamos quantidades incompatíveis. */
export function agregarDesperdicioHistorico(registros: RegistroDesperdicio[]): Record<string, DesperdicioPratoPlanejamento> {
  const acc: Record<string, { soma: number; n: number }> = {};
  registros.forEach((r) => {
    if (!(r.produzido > 0) || !Number.isFinite(r.consumido)) return;
    const chave = normalizar(r.prato);
    if (!chave) return;
    const taxa = Math.max(0, Math.min(1, (r.produzido - r.consumido) / r.produzido));
    const atual = acc[chave] ?? { soma: 0, n: 0 };
    atual.soma += taxa;
    atual.n += 1;
    acc[chave] = atual;
  });
  return Object.fromEntries(Object.entries(acc).map(([chave, v]) => [chave, { taxaMedia: v.soma / v.n, n: v.n }]));
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
  aceitacao: AceitacaoPlanejamento;
  frequencia: Record<string, number>;
  restricoesEquipe?: Record<string, number>;
  desperdicioHistorico?: RegistroDesperdicio[];
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
  const impactoRestricoes = impactoRestricoesLocais(args.dias, args.restricoesEquipe ?? {});
  const desperdicio = agregarDesperdicioHistorico(args.desperdicioHistorico ?? []);
  let somaTaxasDesperdicio = 0;
  let amostraDesperdicio = 0;
  let pratosComDesperdicio = 0;
  args.dias.forEach((dia) => {
    const d = desperdicio[normalizar(dia.principal)];
    if (!d || d.n <= 0) return;
    somaTaxasDesperdicio += d.taxaMedia * d.n;
    amostraDesperdicio += d.n;
    pratosComDesperdicio += 1;
  });
  const desperdicioMedioPct = amostraDesperdicio > 0
    ? Math.round((somaTaxasDesperdicio / amostraDesperdicio) * 100)
    : null;

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
    ocorrenciasRestricao: impactoRestricoes.ocorrencias,
    pessoasRestricaoSomadas: impactoRestricoes.pessoasSomadas,
    desperdicioMedioPct,
    pratosComDesperdicio,
    amostraDesperdicio,
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
  if (m.ocorrenciasRestricao > 0) itens.push(`O cadastro de funcionários do House detectou ${m.ocorrenciasRestricao} conflito(s) de restrição (${m.pessoasRestricaoSomadas} impacto(s) pessoa-dia). O cenário exige correção antes da decisão.`);
  else itens.push('Nenhum conflito foi encontrado nas restrições cadastradas no módulo de funcionários do House.');
  if (m.desperdicioMedioPct !== null) itens.push(`Histórico House dos principais deste cenário: desperdício médio ${m.desperdicioMedioPct}% em ${m.amostraDesperdicio} registro(s), cobrindo ${m.pratosComDesperdicio}/7 prato(s). A taxa é normalizada dentro de cada registro; kg e porções nunca são somados.`);
  else itens.push('Ainda não há amostra de desperdício House para os principais deste cenário; o sistema não inventa penalidade.');
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
    restricoesEquipe: contexto.restricoesEquipe,
    desperdicioHistorico: contexto.desperdicioHistorico,
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

export function podeCalibrarDemandaAutomaticamente(
  pessoasAtual: number,
  indice: number,
  baselineAutomatico?: number[],
): boolean {
  const aprendido = baselineAutomatico?.[indice];
  if (typeof aprendido === 'number' && Number.isFinite(aprendido) && aprendido > 0) {
    return pessoasAtual === Math.round(aprendido);
  }
  return pessoasAtual === PESSOAS_PADRAO[indice];
}

function contextoComInteligenciaOficial(
  contexto: ContextoCenariosGovernanca,
): { contexto: ContextoCenariosGovernanca; usouDemanda: number; amostraOficial: number; resumo: ReturnType<typeof resumoOperacionalOficial> } {
  const evidencia = evidenciaGovernancaAtual();
  const aceitacao = aceitacaoParaPlanejamento(contexto.aceitacao, evidencia);
  const demanda = demandaOficialPorDiaSemana(evidencia);
  let usouDemanda = 0;

  const dias = contexto.estado.dias.map((dia, i) => {
    const ref = demanda[i];
    // O baseline automático pode já ter sido aprendido pelo próprio House e, portanto,
    // ser diferente do PESSOAS_PADRAO. Só a alteração humana bloqueia a calibração oficial.
    if (!ref || ref.amostra < 2 || !podeCalibrarDemandaAutomaticamente(dia.pessoas, i, contexto.baselineAutomatico)) return { ...dia };
    usouDemanda += 1;
    return { ...dia, pessoas: Math.max(1, Math.round(ref.mediaServido)) };
  });

  return {
    contexto: {
      ...contexto,
      estado: { ...contexto.estado, dias },
      aceitacao,
    },
    usouDemanda,
    amostraOficial: evidencia?.principais.reduce((s, p) => s + p.amostraAvaliacoes, 0) ?? 0,
    resumo: resumoOperacionalOficial(evidencia),
  };
}

function gerarComMenorImpacto(
  gerador: () => DiaCardapio[] | null,
  restricoes: Record<string, number>,
  desperdicioHistorico: RegistroDesperdicio[],
): DiaCardapio[] | null {
  let melhor: DiaCardapio[] | null = null;
  let melhorPeso = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 4; i += 1) {
    const dias = gerador();
    if (!Array.isArray(dias) || dias.length !== 7) continue;
    const impacto = impactoRestricoesLocais(dias, restricoes);
    const desp = agregarDesperdicioHistorico(desperdicioHistorico);
    let penalidadeDesperdicio = 0;
    dias.forEach((dia) => {
      const d = desp[normalizar(dia.principal)];
      // Só influencia escolha automática com pelo menos 2 registros; amostra unitária fica apenas visível.
      if (d && d.n >= 2) penalidadeDesperdicio += d.taxaMedia * 100;
    });
    // Restrição humana domina completamente o desempate; desperdício só refina candidatos equivalentes.
    const peso = impacto.pessoasSomadas * 10000 + impacto.ocorrencias * 1000 + penalidadeDesperdicio;
    if (peso < melhorPeso) {
      melhor = dias;
      melhorPeso = peso;
    }
    if (peso === 0) break;
  }
  return melhor;
}

/**
 * Gera três estratégias com o motor existente. A camada não reimplementa o
 * motor: ela compara saídas usando custo/validação do House e, quando a
 * Governança entregou evidência oficial, usa a nota agregada do Plus como
 * fonte prioritária e a contagem real para calibrar apenas baselines intactos.
 */
export function gerarCenariosGovernanca(
  contexto: ContextoCenariosGovernanca,
): CenarioGovernanca[] {
  const integrado = contextoComInteligenciaOficial(contexto);
  const ctx = integrado.contexto;
  const pessoas = ctx.estado.dias.map((dia) => dia.pessoas);
  const opts = {
    aceitacao: ctx.aceitacao,
    frequencia: ctx.frequencia,
    estoque: ctx.estoque ?? {},
  };
  const restricoes = ctx.restricoesEquipe ?? {};
  const desperdicioHistorico = ctx.desperdicioHistorico ?? [];
  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [
    ['historico', gerarComMenorImpacto(() => sugerirSemanaHistorica(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],
    ['equilibrado', gerarComMenorImpacto(() => sugerirSemana(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],
    ['criativo', gerarComMenorImpacto(() => sugerirSemanaCriativa(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],
  ];

  const cenarios = gerados
    .filter((item): item is [ModoCenarioGovernanca, DiaCardapio[]] => Array.isArray(item[1]) && item[1].length === 7)
    .map(([modo, dias]) => montarCenario(modo, dias, ctx))
    .map((cenario) => {
      const porques = [...cenario.porques];
      if (integrado.amostraOficial > 0) {
        porques.unshift(`Aceitação oficial do TATÁ Plus/QR carregada como fonte prioritária (${integrado.amostraOficial} voto(s) no recorte).`);
      }
      if (integrado.usouDemanda > 0) {
        porques.unshift(`Contagem real de refeições calibrou ${integrado.usouDemanda} dia(s) que ainda estavam no baseline automático do House; ajustes manuais do gestor foram preservados.`);
      }
      if (integrado.resumo?.diasComDesperdicioRegistrado) {
        porques.push(`Há desperdício oficial registrado em ${integrado.resumo.diasComDesperdicioRegistrado} dia(s). O dado fica visível como evidência e não vira penalidade inventada sem unidade comparável.`);
      }
      if (integrado.resumo?.indiceSaudavelMedio !== null && integrado.resumo?.indiceSaudavelMedio !== undefined) {
        porques.push(`Índice saudável oficial médio no recorte: ${integrado.resumo.indiceSaudavelMedio.toFixed(0)}/100.`);
      }
      return { ...cenario, porques };
    });

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
