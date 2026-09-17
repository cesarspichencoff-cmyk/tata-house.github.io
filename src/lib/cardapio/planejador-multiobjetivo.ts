import {
  DADOS,
  converterParaUnidadeBase,
  familiaDoPrato,
  listaDoDia,
  normalizar,
  notaNutricaoPrato,
  proteinaDoPrato,
  tecnicaDoPrato,
  validarSemana,
} from './motor';
import { RECEITAS_POR_CATEGORIA, receitaDoPrato } from './receitas';
import { resolverPreco } from './precos';
import {
  agregarDesperdicioHistorico,
  analisarCenarioGovernanca,
  aplicarEventosDemandaGovernanca,
  podeCalibrarDemandaAutomaticamente,
  type CenarioGovernanca,
  type ContextoCenariosGovernanca,
  type ModoCenarioGovernanca,
} from './governanca-candidatos';
import {
  aceitacaoParaPlanejamento,
  demandaOficialPorDiaSemana,
  evidenciaGovernancaAtual,
  resumoOperacionalOficial,
} from './governanca-readonly';
import { impactoRestricoesLocais } from './governanca-restricoes';
import type { DiaCardapio, Proteina } from './tipos';

interface SinalPrato {
  nome: string;
  chave: string;
  proteina: Proteina;
  tecnica: string;
  familia: string;
  aceitacao: number | null;
  amostraAceitacao: number;
  frequenciaRecente: number;
  ocorrenciasHistoricas: number;
  nutricao: number;
  adequacao: number;
  carga: number;
  custoPorPessoa: number | null;
  coberturaPreco: number;
  coberturaEstoque: number;
  desperdicio: number | null;
  amostraDesperdicio: number;
  conflitosRestricao: number;
  pessoasRestricao: number;
}

interface EstadoBusca {
  pratos: string[];
  score: number;
  contagem: Record<Proteina, number>;
  familias: Set<string>;
  tecnicas: Map<string, number>;
  ultimo: Proteina | null;
}

interface ContextoIntegrado {
  contexto: ContextoCenariosGovernanca;
  eventosAplicados: number;
  eventosRevisao: number;
  ajustesHumanosPreservados: number;
  mensagensEventos: string[];
  usouDemandaOficial: number;
  amostraOficial: number;
  resumoOficial: ReturnType<typeof resumoOperacionalOficial>;
}

const PERFIL_META: Record<ModoCenarioGovernanca, { titulo: string; selo: string; descricao: string }> = {
  historico: {
    titulo: 'Continuidade operacional',
    selo: 'Menos ruptura',
    descricao: 'Preserva o que já funciona e melhora a semana com o menor número útil de mudanças.',
  },
  equilibrado: {
    titulo: 'Equilíbrio multiobjetivo',
    selo: 'Visão completa',
    descricao: 'Cruza custo, aceitação, estoque, desperdício, demanda, repetição, nutrição e carga de produção.',
  },
  criativo: {
    titulo: 'Variedade controlada',
    selo: 'Mais novidade',
    descricao: 'Abre espaço para pratos menos usados sem relaxar regras, custo, restrições ou capacidade da cozinha.',
  },
};

function limitar01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function unicos(receitas: string[], historico: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const nome of [...receitas, ...historico]) {
    const chave = normalizar(nome);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(nome);
  }
  return out;
}

const PRINCIPAIS = unicos(RECEITAS_POR_CATEGORIA.principal, DADOS.listas.principais);
const GUARNICOES = unicos(RECEITAS_POR_CATEGORIA.guarnicao, DADOS.listas.guarnicoes);
const SALADAS = unicos(RECEITAS_POR_CATEGORIA.salada, DADOS.listas.saladas);
const SOBREMESAS = unicos(RECEITAS_POR_CATEGORIA.sobremesa, DADOS.listas.sobremesas);

const OCORRENCIAS_HISTORICAS = (() => {
  const mapa: Record<string, number> = {};
  DADOS.combos.forEach((combo) => {
    const chave = normalizar(combo.p);
    if (!chave) return;
    mapa[chave] = (mapa[chave] ?? 0) + Math.max(1, combo.occ ?? 1);
  });
  return mapa;
})();

export function cargaOperacionalPrato(prato: string | null | undefined): number {
  const receita = receitaDoPrato(prato);
  if (!receita) return 0.55;
  const complexidade = receita.complexidade === 'baixa' ? 0.25 : receita.complexidade === 'media' ? 0.58 : 0.9;
  const tempo = limitar01(receita.tempoMin / 100);
  const ingredientes = limitar01(receita.ingredientes.length / 12);
  const passos = limitar01(receita.preparo.length / 7);
  return limitar01(complexidade * 0.42 + tempo * 0.28 + ingredientes * 0.18 + passos * 0.12);
}

function custoEEstoquePrato(
  prato: string,
  precos: Record<string, number>,
  estimativas: Record<string, number>,
  estoque: Record<string, number>,
): { custo: number | null; coberturaPreco: number; coberturaEstoque: number } {
  const pessoas = Math.max(1, DADOS.baseline);
  const dia: DiaCardapio = {
    pessoas,
    principal: prato,
    guarnicaoFixa: '',
    guarnicao: '',
    salada: '',
    sobremesa: '',
  };
  const itens = listaDoDia(dia);
  if (itens.length === 0) return { custo: null, coberturaPreco: 0, coberturaEstoque: 0 };

  let total = 0;
  let comPreco = 0;
  let comEstoque = 0;
  itens.forEach((item) => {
    const chave = normalizar(item.item);
    const resolvido = resolverPreco(chave, precos, estimativas);
    if (resolvido.tipo !== 'sem' && resolvido.valor > 0) {
      total += resolvido.valor * converterParaUnidadeBase(item.qtd, item.unid);
      comPreco += 1;
    }
    if ((estoque[chave] ?? 0) > 0) comEstoque += 1;
  });

  return {
    custo: comPreco > 0 ? total / pessoas : null,
    coberturaPreco: comPreco / itens.length,
    coberturaEstoque: comEstoque / itens.length,
  };
}

function construirSinais(contexto: ContextoCenariosGovernanca): SinalPrato[] {
  const desperdicio = agregarDesperdicioHistorico(contexto.desperdicioHistorico ?? []);
  const estimativas = contexto.estimativas ?? {};
  const estoque = contexto.estoque ?? {};
  const restricoes = contexto.restricoesEquipe ?? {};

  return PRINCIPAIS.map((nome) => {
    const chave = normalizar(nome);
    const av = contexto.aceitacao[chave];
    const receita = receitaDoPrato(nome);
    const custo = custoEEstoquePrato(nome, contexto.precos, estimativas, estoque);
    const desp = desperdicio[chave];
    const impacto = impactoRestricoesLocais([{
      pessoas: DADOS.baseline,
      principal: nome,
      guarnicaoFixa: '',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    }], restricoes);

    return {
      nome,
      chave,
      proteina: proteinaDoPrato(nome),
      tecnica: tecnicaDoPrato(nome),
      familia: familiaDoPrato(nome),
      aceitacao: av?.n >= 2 ? av.somaNotas / av.n : null,
      amostraAceitacao: av?.n ?? 0,
      frequenciaRecente: Math.max(0, contexto.frequencia[chave] ?? 0),
      ocorrenciasHistoricas: OCORRENCIAS_HISTORICAS[chave] ?? 0,
      nutricao: notaNutricaoPrato(nome),
      adequacao: receita?.adequacaoRefeitorio ?? 55,
      carga: cargaOperacionalPrato(nome),
      custoPorPessoa: custo.custo,
      coberturaPreco: custo.coberturaPreco,
      coberturaEstoque: custo.coberturaEstoque,
      desperdicio: desp && desp.n >= 2 ? desp.taxaMedia : null,
      amostraDesperdicio: desp?.n ?? 0,
      conflitosRestricao: impacto.ocorrencias,
      pessoasRestricao: impacto.pessoasSomadas,
    };
  }).filter((s) => s.adequacao >= 50 || s.ocorrenciasHistoricas > 0);
}

function scorePrato(
  sinal: SinalPrato,
  modo: ModoCenarioGovernanca,
  pessoasDia: number,
  mediaPessoas: number,
  principalAtual: string,
): number {
  const aceitacao = sinal.aceitacao === null ? 0.58 : limitar01(sinal.aceitacao / 5);
  const confiancaAceitacao = sinal.aceitacao === null ? 0.2 : limitar01(sinal.amostraAceitacao / 8);
  const hist = limitar01(Math.log1p(sinal.ocorrenciasHistoricas) / Math.log(12));
  const novidade = 1 - hist;
  const custo = sinal.custoPorPessoa === null ? 0.5 : limitar01(sinal.custoPorPessoa / 18);
  const custoConfiavel = sinal.coberturaPreco >= 0.6;
  const desperdicio = sinal.desperdicio ?? 0;
  const demanda = Math.max(0.65, Math.min(1.6, pessoasDia / Math.max(mediaPessoas, 1)));
  const preservaAtual = normalizar(principalAtual) === sinal.chave ? 1 : 0;

  // Restrições são quase-hard: a busca só aceita conflito quando não encontra alternativa viável.
  let score = -sinal.pessoasRestricao * 160 - sinal.conflitosRestricao * 60;
  score += sinal.adequacao * 0.12;
  score += sinal.nutricao * 0.09;
  score += aceitacao * confiancaAceitacao * 42;
  score += sinal.coberturaEstoque * 9;
  score -= sinal.frequenciaRecente * 10;
  score -= desperdicio * 55;
  score -= sinal.carga * demanda * 24;
  score += sinal.coberturaPreco * 8;

  if (custoConfiavel) score -= custo * 20;
  else score -= 6;

  if (modo === 'historico') {
    score += hist * 34;
    score += preservaAtual * 26;
    score -= novidade * 4;
  } else if (modo === 'equilibrado') {
    score += hist * 8;
    score += preservaAtual * 9;
    score += (1 - sinal.carga) * 8;
    if (custoConfiavel) score -= custo * 10;
  } else {
    score += novidade * 30;
    score -= hist * 4;
    score -= sinal.frequenciaRecente * 7;
    score += (1 - sinal.carga) * 4;
  }

  return score;
}

function contagemInicial(): Record<Proteina, number> {
  return { bovina: 0, frango: 0, suina: 0, peixe: 0, ovo: 0, outros: 0 };
}

function viavelAposAdicionar(cont: Record<Proteina, number>): boolean {
  // Nenhuma proteína deve dominar a semana. Três é apenas teto de fallback;
  // a seleção final tenta primeiro no máximo duas ocorrências por proteína.
  return cont.frango <= 3
    && cont.bovina <= 3
    && cont.suina <= 3
    && cont.peixe <= 3
    && cont.ovo <= 3;
}

function buscarPrincipais(
  sinais: SinalPrato[],
  modo: ModoCenarioGovernanca,
  diasBase: DiaCardapio[],
): string[] | null {
  const pessoas = diasBase.map((d) => Math.max(1, d.pessoas || DADOS.baseline));
  const mediaPessoas = pessoas.reduce((a, b) => a + b, 0) / Math.max(1, pessoas.length);
  let feixe: EstadoBusca[] = [{
    pratos: [],
    score: 0,
    contagem: contagemInicial(),
    familias: new Set(),
    tecnicas: new Map(),
    ultimo: null,
  }];

  for (let dia = 0; dia < 7; dia += 1) {
    const proximos: EstadoBusca[] = [];
    const candidatosDia = [...sinais].sort((a, b) => {
      const sb = scorePrato(b, modo, pessoas[dia], mediaPessoas, diasBase[dia]?.principal ?? '');
      const sa = scorePrato(a, modo, pessoas[dia], mediaPessoas, diasBase[dia]?.principal ?? '');
      return sb - sa || a.nome.localeCompare(b.nome, 'pt-BR');
    }).slice(0, 70);

    for (const estado of feixe) {
      const usados = new Set(estado.pratos.map(normalizar));
      for (const sinal of candidatosDia) {
        if (usados.has(sinal.chave)) continue;
        if (estado.ultimo === sinal.proteina && sinal.proteina !== 'outros') continue;
        if (estado.familias.has(sinal.familia) && sinal.familia) continue;

        const contagem = { ...estado.contagem, [sinal.proteina]: estado.contagem[sinal.proteina] + 1 };
        if (!viavelAposAdicionar(contagem)) continue;

        const tecnicas = new Map(estado.tecnicas);
        const tecnicaQtd = (tecnicas.get(sinal.tecnica) ?? 0) + 1;
        tecnicas.set(sinal.tecnica, tecnicaQtd);
        const diversidade = !estado.tecnicas.has(sinal.tecnica) ? 5 : tecnicaQtd > 2 ? -10 : -2;
        const repeticoesProteina = estado.contagem[sinal.proteina];
        const bonusProteinaNova = repeticoesProteina === 0 ? 9 : 0;
        const penalidadeProteina = sinal.proteina === 'outros' ? 0 : repeticoesProteina * 9;

        proximos.push({
          pratos: [...estado.pratos, sinal.nome],
          score: estado.score + scorePrato(sinal, modo, pessoas[dia], mediaPessoas, diasBase[dia]?.principal ?? '') + diversidade + bonusProteinaNova - penalidadeProteina,
          contagem,
          familias: new Set(Array.from(estado.familias).concat(sinal.familia)),
          tecnicas,
          ultimo: sinal.proteina,
        });
      }
    }

    proximos.sort((a, b) => b.score - a.score || a.pratos.join('|').localeCompare(b.pratos.join('|'), 'pt-BR'));
    feixe = proximos.slice(0, 140);
    if (feixe.length === 0) return null;
  }

  const categorias = (e: EstadoBusca) => Object.values(e.contagem).filter((n) => n > 0).length;
  const ideal = feixe.find((e) =>
    categorias(e) >= 4
    && e.contagem.frango <= 2
    && e.contagem.bovina <= 2
    && e.contagem.suina <= 2
    && e.contagem.peixe <= 2
    && e.contagem.ovo <= 2,
  );
  const fallback = feixe.find((e) => categorias(e) >= 3 && Math.max(...Object.values(e.contagem)) <= 3);
  return ideal?.pratos ?? fallback?.pratos ?? feixe[0]?.pratos ?? null;
}

function custoComponente(
  nome: string,
  precos: Record<string, number>,
  estimativas: Record<string, number>,
): { valor: number | null; cobertura: number } {
  const receita = receitaDoPrato(nome);
  if (!receita || receita.ingredientes.length === 0) return { valor: null, cobertura: 0 };
  let total = 0;
  let com = 0;
  receita.ingredientes.forEach((ing) => {
    const r = resolverPreco(normalizar(ing.item), precos, estimativas);
    if (r.tipo === 'sem' || !(r.valor > 0)) return;
    total += r.valor * converterParaUnidadeBase(ing.porPessoa, ing.unid);
    com += 1;
  });
  return { valor: com > 0 ? total : null, cobertura: com / receita.ingredientes.length };
}

function coberturaEstoqueReceita(nome: string, estoque: Record<string, number>): number {
  const receita = receitaDoPrato(nome);
  if (!receita || receita.ingredientes.length === 0) return 0;
  const cobertos = receita.ingredientes.filter((ing) => (estoque[normalizar(ing.item)] ?? 0) > 0).length;
  return cobertos / receita.ingredientes.length;
}

function associacaoHistorica(principal: string, campo: 'g' | 's' | 'sb', opcao: string): number {
  const p = normalizar(principal);
  const o = normalizar(opcao);
  let n = 0;
  DADOS.combos.forEach((c) => {
    if (normalizar(c.p) !== p || normalizar(c[campo]) !== o) return;
    n += Math.max(1, c.occ ?? 1);
  });
  return n;
}

function escolherComponente(
  opcoes: string[],
  principal: string,
  campo: 'g' | 's' | 'sb',
  usados: Set<string>,
  modo: ModoCenarioGovernanca,
  cargaPrincipal: number,
  demandaRelativa: number,
  contexto: ContextoCenariosGovernanca,
): string {
  const estimativas = contexto.estimativas ?? {};
  const estoque = contexto.estoque ?? {};
  const avaliados = opcoes.map((nome) => {
    const receita = receitaDoPrato(nome);
    const custo = custoComponente(nome, contexto.precos, estimativas);
    const carga = cargaOperacionalPrato(nome);
    const historico = associacaoHistorica(principal, campo, nome);
    const repetido = usados.has(normalizar(nome));
    let score = (receita?.adequacaoRefeitorio ?? 55) * 0.08;
    score += coberturaEstoqueReceita(nome, estoque) * 6;
    score -= carga * demandaRelativa * (12 + cargaPrincipal * 8);
    if (custo.valor !== null && custo.cobertura >= 0.6) score -= limitar01(custo.valor / 7) * 7;
    else score -= 2;
    if (repetido) score -= 35;
    if (modo === 'historico') score += Math.log1p(historico) * 9;
    if (modo === 'equilibrado') score += Math.log1p(historico) * 3;
    if (modo === 'criativo') score += historico === 0 ? 5 : -Math.log1p(historico) * 2;
    return { nome, score };
  });
  avaliados.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, 'pt-BR'));
  return avaliados[0]?.nome ?? '';
}

function montarDias(
  principais: string[],
  modo: ModoCenarioGovernanca,
  contexto: ContextoCenariosGovernanca,
): DiaCardapio[] {
  const usadosG = new Set<string>();
  const usadosS = new Set<string>();
  const usadosSb = new Set<string>();
  const pessoas = contexto.estado.dias.map((d) => Math.max(1, d.pessoas || DADOS.baseline));
  const media = pessoas.reduce((a, b) => a + b, 0) / Math.max(1, pessoas.length);

  return principais.map((principal, i) => {
    const cargaPrincipal = cargaOperacionalPrato(principal);
    const demandaRelativa = Math.max(0.65, Math.min(1.6, pessoas[i] / Math.max(media, 1)));

    if (modo === 'historico') {
      const combos = DADOS.combos
        .filter((c) => normalizar(c.p) === normalizar(principal) && c.gf && c.g && c.s && c.sb)
        .sort((a, b) => (b.occ ?? 1) - (a.occ ?? 1));
      const combo = combos.find((c) => !usadosG.has(normalizar(c.g)) && !usadosS.has(normalizar(c.s)) && !usadosSb.has(normalizar(c.sb))) ?? combos[0];
      if (combo) {
        usadosG.add(normalizar(combo.g));
        usadosS.add(normalizar(combo.s));
        usadosSb.add(normalizar(combo.sb));
        return {
          pessoas: pessoas[i],
          principal,
          guarnicaoFixa: combo.gf || 'Arroz e Feijão',
          guarnicao: combo.g || '',
          salada: combo.s || '',
          sobremesa: combo.sb || '',
        };
      }
    }

    const guarnicao = escolherComponente(GUARNICOES, principal, 'g', usadosG, modo, cargaPrincipal, demandaRelativa, contexto);
    const salada = escolherComponente(SALADAS, principal, 's', usadosS, modo, cargaPrincipal, demandaRelativa, contexto);
    const sobremesa = escolherComponente(SOBREMESAS, principal, 'sb', usadosSb, modo, cargaPrincipal, demandaRelativa, contexto);
    usadosG.add(normalizar(guarnicao));
    usadosS.add(normalizar(salada));
    usadosSb.add(normalizar(sobremesa));
    return {
      pessoas: pessoas[i],
      principal,
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao,
      salada,
      sobremesa,
    };
  });
}

function integrarContexto(contexto: ContextoCenariosGovernanca): ContextoIntegrado {
  const evidencia = evidenciaGovernancaAtual();
  const aceitacao = aceitacaoParaPlanejamento(contexto.aceitacao, evidencia);
  const demanda = demandaOficialPorDiaSemana(evidencia);
  let usouDemandaOficial = 0;

  const diasCalibrados = contexto.estado.dias.map((dia, i) => {
    const ref = demanda[i];
    if (!ref || ref.amostra < 2 || !podeCalibrarDemandaAutomaticamente(dia.pessoas, i, contexto.baselineAutomatico)) return { ...dia };
    usouDemandaOficial += 1;
    return { ...dia, pessoas: Math.max(1, Math.round(ref.mediaServido)) };
  });

  const eventos = aplicarEventosDemandaGovernanca({
    dias: diasCalibrados,
    diasOriginais: contexto.estado.dias,
    eventos: contexto.eventos,
    datasSemana: contexto.datasSemana,
    baselineAutomatico: contexto.baselineAutomatico,
  });

  return {
    contexto: {
      ...contexto,
      estado: { ...contexto.estado, dias: eventos.dias },
      aceitacao,
    },
    eventosAplicados: eventos.eventosAplicados,
    eventosRevisao: eventos.eventosRevisao,
    ajustesHumanosPreservados: eventos.ajustesHumanosPreservados,
    mensagensEventos: eventos.mensagens,
    usouDemandaOficial,
    amostraOficial: evidencia?.principais.reduce((s, p) => s + p.amostraAvaliacoes, 0) ?? 0,
    resumoOficial: resumoOperacionalOficial(evidencia),
  };
}

function fingerprintDias(dias: DiaCardapio[]): string {
  return dias
    .map((dia) => [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa].map(normalizar).join('|'))
    .join('::');
}

function mudancasPrincipais(antes: DiaCardapio[], depois: DiaCardapio[]): number {
  return depois.reduce((n, dia, i) => n + (normalizar(dia.principal) !== normalizar(antes[i]?.principal) ? 1 : 0), 0);
}

function cargaSemana(dias: DiaCardapio[]): { media: number; pico: number } {
  const cargas = dias.map((d) => cargaOperacionalPrato(d.principal));
  return {
    media: cargas.reduce((a, b) => a + b, 0) / Math.max(1, cargas.length),
    pico: Math.max(0, ...cargas),
  };
}

function porquesCenario(
  modo: ModoCenarioGovernanca,
  dias: DiaCardapio[],
  original: DiaCardapio[],
  integrado: ContextoIntegrado,
  metricas: CenarioGovernanca['metricas'],
): string[] {
  const carga = cargaSemana(dias);
  const mudancas = mudancasPrincipais(original, dias);
  const itens: string[] = [
    'Busca determinística multiobjetivo: a mesma evidência produz a mesma proposta; não há sorteio na seleção desta semana.',
    `Carga operacional média ${Math.round(carga.media * 100)}/100, com pico ${Math.round(carga.pico * 100)}/100; dias de maior demanda penalizam preparos mais pesados.`,
  ];

  if (modo === 'historico') itens.push(`${mudancas}/7 principal(is) mudam em relação ao rascunho atual; este perfil paga uma penalidade explícita por ruptura.`);
  if (modo === 'equilibrado') itens.push('O score cruza aceitação, preço por ingrediente, estoque, desperdício, repetição, nutrição, restrições e capacidade de produção.');
  if (modo === 'criativo') itens.push('Novidade recebe bônus apenas depois de respeitar rotação de proteínas, família do prato, restrições e capacidade operacional.');

  if (metricas.custoPorRefeicao !== null) itens.push(`Custo final estimado ${metricas.custoPorRefeicao.toFixed(2).replace('.', ',')} por refeição; cobertura de preço ${metricas.coberturaPrecoPct}%.`);
  else itens.push(`Custo incompleto: ${metricas.itensSemPreco} item(ns) sem referência; ausência de preço não é tratada como custo zero.`);

  if (metricas.aceitacaoMedia !== null) itens.push(`Aceitação conhecida ${metricas.aceitacaoMedia.toFixed(1)}/5 em ${metricas.pratosComAceitacao}/7 principais.`);
  else itens.push('Aceitação insuficiente para virar evidência forte; o motor reduz o peso desse sinal em vez de inventar nota.');

  if (metricas.desperdicioMedioPct !== null) itens.push(`Desperdício histórico observado nos pratos cobertos: ${metricas.desperdicioMedioPct}%.`);
  if (metricas.ocorrenciasRestricao > 0) itens.push(`${metricas.ocorrenciasRestricao} conflito(s) de restrição permanecem e precisam de correção humana.`);
  if (integrado.usouDemandaOficial > 0) itens.push(`Contagem real calibrou ${integrado.usouDemandaOficial} dia(s) que ainda estavam no baseline automático; ajuste manual foi preservado.`);
  integrado.mensagensEventos.forEach((m) => itens.push(`Evento de demanda: ${m}`));
  if (integrado.amostraOficial > 0) itens.push(`Aceitação oficial do TATÁ Plus/QR entrou como fonte prioritária (${integrado.amostraOficial} voto(s) no recorte).`);
  if (integrado.resumoOficial?.diasComDesperdicioRegistrado) itens.push(`Há desperdício oficial registrado em ${integrado.resumoOficial.diasComDesperdicioRegistrado} dia(s); ele é evidência, não verdade inventada para dias sem amostra.`);
  itens.push('A escolha do cenário não altera pesos nem se autopromove como aprendizado: só a decisão humana altera o rascunho.');
  return itens.slice(0, 8);
}

function montarCenario(
  modo: ModoCenarioGovernanca,
  dias: DiaCardapio[],
  integrado: ContextoIntegrado,
): CenarioGovernanca {
  const ctx = integrado.contexto;
  const metricas = analisarCenarioGovernanca({
    estadoBase: ctx.estado,
    dias,
    precos: ctx.precos,
    estimativas: ctx.estimativas,
    fatores: ctx.fatores,
    mostrarBasicos: ctx.mostrarBasicos,
    aceitacao: ctx.aceitacao,
    frequencia: ctx.frequencia,
    restricoesEquipe: ctx.restricoesEquipe,
    desperdicioHistorico: ctx.desperdicioHistorico,
    historicoPrecos: ctx.historicoPrecos,
  });
  return {
    id: modo,
    ...PERFIL_META[modo],
    dias: dias.map((d) => ({ ...d })),
    metricas,
    porques: porquesCenario(modo, dias, ctx.estado.dias, integrado, metricas),
    fingerprint: fingerprintDias(dias),
    demanda: {
      eventosAplicados: integrado.eventosAplicados,
      eventosRevisao: integrado.eventosRevisao,
      ajustesHumanosPreservados: integrado.ajustesHumanosPreservados,
    },
  };
}

/**
 * Planejador semanal novo: beam search determinístico sobre o catálogo real.
 * Não chama os antigos geradores aleatórios. Toda proposta passa novamente
 * pela validação oficial e pela mesma fonte de custo usada pela operação.
 */
export function gerarCenariosMultiobjetivo(contexto: ContextoCenariosGovernanca): CenarioGovernanca[] {
  const integrado = integrarContexto(contexto);
  const ctx = integrado.contexto;
  const sinais = construirSinais(ctx);
  const modos: ModoCenarioGovernanca[] = ['historico', 'equilibrado', 'criativo'];
  const cenarios: CenarioGovernanca[] = [];

  for (const modo of modos) {
    const principais = buscarPrincipais(sinais, modo, ctx.estado.dias);
    if (!principais) continue;
    const dias = montarDias(principais, modo, ctx);
    // Contraprova final: nunca apresenta como proposta um resultado com regra dura quebrada.
    const erros = validarSemana(dias, ctx.precos).filter((a) => a.nivel === 'erro');
    if (erros.length > 0) continue;
    cenarios.push(montarCenario(modo, dias, integrado));
  }

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
