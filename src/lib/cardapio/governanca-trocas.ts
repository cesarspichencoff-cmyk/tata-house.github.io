import { custoDaSemana } from './custo-semana';
import {
  DADOS,
  familiaDoPrato,
  linhasDoDia,
  normalizar,
  notaNutricaoPrato,
  proteinaDoPrato,
  validarSemana,
} from './motor';
import { receitaDoPrato, RECEITAS_POR_CATEGORIA } from './receitas';
import { consolidarAprendizado } from './substituicoes';
import type {
  Aceitacao,
  DiaCardapio,
  EstadoSemana,
  SubstituicaoAprendida,
  SubstituicaoRegistro,
} from './tipos';

export interface ImpactoTrocaGovernanca {
  nome: string;
  norm: string;
  proteina: string;
  aceitacao: number | null;
  votos: number;
  repeticaoRecente: number;
  custoPorRefeicao: number | null;
  deltaCustoPorRefeicao: number | null;
  nutricao: number;
  deltaNutricao: number;
  coberturaEstoquePct: number;
  erros: number;
  alertas: number;
  deltaErros: number;
  deltaAlertas: number;
  familiaRepetida: boolean;
  aprendizado: SubstituicaoAprendida | null;
  bloqueada: boolean;
  motivos: string[];
}

export interface ContextoTrocasGovernanca {
  estado: EstadoSemana;
  diaIndice: number;
  precos: Record<string, number>;
  estimativas?: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
  estoque?: Record<string, number>;
  substituicoes?: SubstituicaoRegistro[];
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function clonarDias(dias: DiaCardapio[]): DiaCardapio[] {
  return dias.map((d) => ({ ...d }));
}

/**
 * Pool contextual da Governança. Espelha a elegibilidade do motor principal:
 * receitas completas adequadas ao refeitório + pratos já vistos no histórico.
 * Substitutos aprendidos entram também, para nunca perder memória real da casa.
 */
export function principaisElegiveisGovernanca(
  aprendidas: SubstituicaoAprendida[] = [],
): string[] {
  const nomes: string[] = [];
  const vistos = new Set<string>();
  const add = (nome: string) => {
    const n = texto(nome);
    const k = normalizar(n);
    if (!n || !k || vistos.has(k)) return;
    vistos.add(k);
    nomes.push(n);
  };

  RECEITAS_POR_CATEGORIA.principal.forEach((nome) => {
    const r = receitaDoPrato(nome);
    if (r && r.adequacaoRefeitorio >= 60) add(nome);
  });
  DADOS.listas.principais.forEach(add);
  aprendidas.forEach((a) => add(a.nomeSubstituto));
  return nomes;
}

export function diaTemDerivadosOperacionais(estado: EstadoSemana, diaIndice: number): boolean {
  if (!Number.isInteger(diaIndice) || diaIndice < 0 || diaIndice > 6) return true;
  if (Object.keys(estado.ajustes?.[diaIndice] ?? {}).length > 0) return true;
  if ((estado.manuais?.[diaIndice] ?? []).length > 0) return true;
  if (Object.keys(estado.status?.[diaIndice] ?? {}).length > 0) return true;
  if ((estado.refeicoes?.[diaIndice] ?? 0) > 0) return true;
  if (texto(estado.notas?.[diaIndice])) return true;
  if ((estado.notasFiscais ?? []).some((n) => (n.dias ?? []).includes(diaIndice))) return true;
  return false;
}

export function podeAplicarTrocaGovernanca(
  estado: EstadoSemana,
  diaIndice: number,
): { ok: boolean; motivo?: string } {
  if (estado.etapa !== 'rascunho') {
    return { ok: false, motivo: 'A semana já avançou no fluxo operacional. Volte a um rascunho antes de trocar o prato.' };
  }
  if (diaTemDerivadosOperacionais(estado, diaIndice)) {
    return { ok: false, motivo: 'Este dia já tem dados operacionais vinculados. A troca automática fica bloqueada para não apagar evidência.' };
  }
  if (!texto(estado.dias[diaIndice]?.principal)) {
    return { ok: false, motivo: 'Defina primeiro um prato principal neste dia.' };
  }
  return { ok: true };
}

export function aplicarTrocaGovernanca(
  estado: EstadoSemana,
  diaIndice: number,
  novoPrincipal: string,
): EstadoSemana {
  const permissao = podeAplicarTrocaGovernanca(estado, diaIndice);
  const nome = texto(novoPrincipal);
  if (!permissao.ok || !nome) return estado;
  if (normalizar(nome) === normalizar(estado.dias[diaIndice]?.principal)) return estado;
  return {
    ...estado,
    dias: estado.dias.map((dia, i) => i === diaIndice ? { ...dia, principal: nome } : { ...dia }),
  };
}

function estadoParaAnalise(estado: EstadoSemana, diaIndice: number, principal: string): EstadoSemana {
  const dias = clonarDias(estado.dias);
  dias[diaIndice] = { ...dias[diaIndice], principal };
  const ajustes = { ...estado.ajustes };
  const manuais = { ...estado.manuais };
  const status = { ...estado.status };
  delete ajustes[diaIndice];
  delete manuais[diaIndice];
  delete status[diaIndice];
  return { ...estado, dias, ajustes, manuais, status };
}

function notaAceitacao(nome: string, aceitacao: Aceitacao): { media: number | null; n: number } {
  const a = aceitacao[normalizar(nome)];
  if (!a || a.n < 2) return { media: null, n: a?.n ?? 0 };
  return { media: a.somaNotas / a.n, n: a.n };
}

function faixaAceitacao(media: number | null): number {
  if (media === null) return 1;
  if (media >= 4) return 0;
  if (media >= 3) return 2;
  return 3;
}

function faixaCusto(delta: number | null): number {
  if (delta === null) return 2;
  if (delta <= -1) return 0;
  if (delta <= 1) return 1;
  return 3;
}

function ordemConfianca(a: SubstituicaoAprendida | null): number {
  if (!a) return 3;
  return a.confianca === 'alta' ? 0 : a.confianca === 'media' ? 1 : 2;
}

function motivosDaTroca(args: {
  impacto: Omit<ImpactoTrocaGovernanca, 'motivos'>;
  atualAceitacao: number | null;
  atualNutricao: number;
}): string[] {
  const { impacto: i, atualAceitacao } = args;
  const motivos: string[] = [];
  if (i.deltaErros < 0) motivos.push(`Remove ${Math.abs(i.deltaErros)} bloqueio(s) de regra da semana.`);
  else if (i.deltaErros === 0 && i.erros === 0) motivos.push('Não introduz bloqueios de regra na composição atual.');
  else if (i.deltaErros > 0) motivos.push(`Introduz ${i.deltaErros} novo(s) bloqueio(s) de regra — não recomendado.`);

  if (i.aprendizado) {
    const conf = i.aprendizado.confianca === 'alta' ? 'alta' : i.aprendizado.confianca === 'media' ? 'média' : 'baixa';
    motivos.push(`A casa já registrou esta substituição ${i.aprendizado.n}×; confiança ${conf}.`);
  }
  if (i.aceitacao !== null) {
    const delta = atualAceitacao === null ? null : i.aceitacao - atualAceitacao;
    motivos.push(delta === null
      ? `Aceitação ${i.aceitacao.toFixed(1)}/5 com ${i.votos} voto(s).`
      : `Aceitação ${i.aceitacao.toFixed(1)}/5 (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs. prato atual).`);
  } else {
    motivos.push('Sem amostra mínima de aceitação; o sistema não inventa nota.');
  }
  if (i.repeticaoRecente === 0) motivos.push('Não apareceu no recorte das semanas recentes carregadas.');
  else motivos.push(`Apareceu ${i.repeticaoRecente}× no recorte recente.`);
  if (i.deltaCustoPorRefeicao !== null) {
    motivos.push(`${i.deltaCustoPorRefeicao <= 0 ? 'Reduz' : 'Aumenta'} o custo estimado em R$ ${Math.abs(i.deltaCustoPorRefeicao).toFixed(2).replace('.', ',')}/refeição.`);
  } else {
    motivos.push('Custo não é comparável com segurança porque há preço faltante/estimado na base.');
  }
  if (i.coberturaEstoquePct > 0) motivos.push(`${i.coberturaEstoquePct}% dos itens calculados para o dia têm saldo de estoque carregado.`);
  return motivos.slice(0, 5);
}

export function ranquearTrocasGovernanca(
  contexto: ContextoTrocasGovernanca,
  limite = 6,
): ImpactoTrocaGovernanca[] {
  const { estado, diaIndice } = contexto;
  if (!Number.isInteger(diaIndice) || diaIndice < 0 || diaIndice > 6) return [];
  const atual = texto(estado.dias[diaIndice]?.principal);
  if (!atual) return [];

  const aprendidas = consolidarAprendizado(contexto.substituicoes ?? [], 2);
  const aprendizadoDoOriginal = new Map(
    aprendidas
      .filter((a) => a.normOriginal === normalizar(atual))
      .map((a) => [a.normSubstituto, a]),
  );
  const usados = new Set(
    estado.dias
      .filter((_, i) => i !== diaIndice)
      .map((d) => normalizar(d.principal))
      .filter(Boolean),
  );
  const candidatos = principaisElegiveisGovernanca(aprendidas).filter((nome) => {
    const k = normalizar(nome);
    return k && k !== normalizar(atual) && !usados.has(k);
  });

  const baseAnalise = estadoParaAnalise(estado, diaIndice, atual);
  const custoBase = custoDaSemana(
    baseAnalise,
    contexto.precos,
    contexto.estimativas ?? {},
    { fatores: contexto.fatores, mostrarBasicos: contexto.mostrarBasicos },
  );
  const avisosBase = validarSemana(baseAnalise.dias, contexto.precos);
  const errosBase = avisosBase.filter((a) => a.nivel === 'erro').length;
  const alertasBase = avisosBase.filter((a) => a.nivel === 'alerta').length;
  const atualAceitacao = notaAceitacao(atual, contexto.aceitacao).media;
  const atualNutricao = notaNutricaoPrato(atual);
  const familiasOutrosDias = new Set(
    estado.dias
      .filter((_, i) => i !== diaIndice)
      .map((d) => familiaDoPrato(d.principal))
      .filter(Boolean),
  );

  const impactos = candidatos.map((nome): ImpactoTrocaGovernanca => {
    const candidatoEstado = estadoParaAnalise(estado, diaIndice, nome);
    const custo = custoDaSemana(
      candidatoEstado,
      contexto.precos,
      contexto.estimativas ?? {},
      { fatores: contexto.fatores, mostrarBasicos: contexto.mostrarBasicos },
    );
    const avisos = validarSemana(candidatoEstado.dias, contexto.precos);
    const erros = avisos.filter((a) => a.nivel === 'erro').length;
    const alertas = avisos.filter((a) => a.nivel === 'alerta').length;
    const ac = notaAceitacao(nome, contexto.aceitacao);
    const chave = normalizar(nome);
    const nutricao = notaNutricaoPrato(nome);
    const familiaRepetida = familiasOutrosDias.has(familiaDoPrato(nome));
    const linhas = linhasDoDia(candidatoEstado, diaIndice, contexto.fatores, { mostrarBasicos: contexto.mostrarBasicos });
    const itensUnicos = new Set(linhas.map((l) => normalizar(l.item)).filter(Boolean));
    const comEstoque = Array.from(itensUnicos).filter((k) => (contexto.estoque?.[k] ?? 0) > 0).length;
    const coberturaEstoquePct = itensUnicos.size > 0 ? Math.round((comEstoque / itensUnicos.size) * 100) : 0;
    const custoComparavel = custoBase.itensSemPreco === 0 && custo.itensSemPreco === 0 &&
      custoBase.itensEstimados === 0 && custo.itensEstimados === 0 &&
      custoBase.porRefeicao !== null && custo.porRefeicao !== null;
    const deltaCusto = custoComparavel
      ? Math.round(((custo.porRefeicao ?? 0) - (custoBase.porRefeicao ?? 0)) * 100) / 100
      : null;
    const parcial: Omit<ImpactoTrocaGovernanca, 'motivos'> = {
      nome,
      norm: chave,
      proteina: proteinaDoPrato(nome),
      aceitacao: ac.media,
      votos: ac.n,
      repeticaoRecente: Math.max(0, contexto.frequencia[chave] ?? 0),
      custoPorRefeicao: custo.itensSemPreco === 0 && custo.porRefeicao !== null ? custo.porRefeicao : null,
      deltaCustoPorRefeicao: deltaCusto,
      nutricao: Math.round(nutricao),
      deltaNutricao: Math.round(nutricao - atualNutricao),
      coberturaEstoquePct,
      erros,
      alertas,
      deltaErros: erros - errosBase,
      deltaAlertas: alertas - alertasBase,
      familiaRepetida,
      aprendizado: aprendizadoDoOriginal.get(chave) ?? null,
      bloqueada: erros > errosBase,
    };
    return {
      ...parcial,
      motivos: motivosDaTroca({ impacto: parcial, atualAceitacao, atualNutricao }),
    };
  });

  impactos.sort((a, b) => {
    // Ordem transparente — não existe score oculto 0–100.
    if (Number(a.bloqueada) !== Number(b.bloqueada)) return Number(a.bloqueada) - Number(b.bloqueada);
    if (a.deltaErros !== b.deltaErros) return a.deltaErros - b.deltaErros;
    if (Number(a.familiaRepetida) !== Number(b.familiaRepetida)) return Number(a.familiaRepetida) - Number(b.familiaRepetida);
    const fa = faixaAceitacao(a.aceitacao), fb = faixaAceitacao(b.aceitacao);
    if (fa !== fb) return fa - fb;
    const ca = ordemConfianca(a.aprendizado), cb = ordemConfianca(b.aprendizado);
    if (ca !== cb) return ca - cb;
    if (a.repeticaoRecente !== b.repeticaoRecente) return a.repeticaoRecente - b.repeticaoRecente;
    if (a.aceitacao !== null && b.aceitacao !== null && a.aceitacao !== b.aceitacao) return b.aceitacao - a.aceitacao;
    const fca = faixaCusto(a.deltaCustoPorRefeicao), fcb = faixaCusto(b.deltaCustoPorRefeicao);
    if (fca !== fcb) return fca - fcb;
    if (a.deltaCustoPorRefeicao !== null && b.deltaCustoPorRefeicao !== null && a.deltaCustoPorRefeicao !== b.deltaCustoPorRefeicao) return a.deltaCustoPorRefeicao - b.deltaCustoPorRefeicao;
    if (a.nutricao !== b.nutricao) return b.nutricao - a.nutricao;
    if (a.coberturaEstoquePct !== b.coberturaEstoquePct) return b.coberturaEstoquePct - a.coberturaEstoquePct;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return impactos.slice(0, Math.max(1, Math.min(12, limite)));
}
