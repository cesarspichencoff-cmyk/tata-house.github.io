import {
  custoDaLista,
  listaDoDia,
  normalizar,
  notaNutricaoPrato,
  proteinaDoPrato,
  sugerirSemana,
  sugerirSemanaCriativa,
  sugerirSemanaHistorica,
  validarSemana,
} from './motor';
import type { DiaCardapio, Proteina } from './tipos';

export type PerfilPlanejamento = 'equilibrado' | 'economia' | 'variedade';

export interface AceitacaoPlanejamento {
  n: number;
  somaNotas: number;
}

export interface ContextoPlanejamentoInteligente {
  pessoas: number[];
  precos: Record<string, number>;
  aceitacao?: Record<string, AceitacaoPlanejamento>;
  frequencia?: Record<string, number>;
  estoque?: Record<string, number>;
  proteinasPrefer?: Proteina[];
  proteinasEvitar?: Proteina[];
  custoAlvoPorRefeicao?: number;
}

export interface MetricasSemanaInteligente {
  custoTotal: number;
  custoPorRefeicao: number;
  coberturaPreco: number;
  aceitacaoMedia: number | null;
  coberturaAceitacao: number;
  repeticoesRecentes: number;
  diversidadeProteinas: number;
  diversidadePratos: number;
  nutricaoMedia: number;
  coberturaEstoque: number;
  proteinasPreferidas: number;
  proteinasEvitadas: number;
  bloqueios: number;
  alertas: number;
}

export interface PropostaSemanaInteligente {
  perfil: PerfilPlanejamento;
  titulo: string;
  subtitulo: string;
  dias: DiaCardapio[];
  metricas: MetricasSemanaInteligente;
  motivos: string[];
}

const META = {
  equilibrado: {
    titulo: 'Equilibrado',
    subtitulo: 'Aceitação, variedade, nutrição e custo no mesmo plano.',
  },
  economia: {
    titulo: 'Economia',
    subtitulo: 'Pressiona o custo para baixo sem ignorar aceitação e regras.',
  },
  variedade: {
    titulo: 'Variedade',
    subtitulo: 'Reduz repetição recente e amplia pratos, técnicas e proteínas.',
  },
} as const;

export function avaliarSemanaInteligente(
  dias: DiaCardapio[],
  ctx: Pick<
    ContextoPlanejamentoInteligente,
    'precos' | 'aceitacao' | 'frequencia' | 'estoque' | 'proteinasPrefer' | 'proteinasEvitar'
  >,
): MetricasSemanaInteligente {
  const aceitacao = ctx.aceitacao ?? {};
  const frequencia = ctx.frequencia ?? {};
  const estoque = ctx.estoque ?? {};
  const preferidas = new Set(ctx.proteinasPrefer ?? []);
  const evitadas = new Set(ctx.proteinasEvitar ?? []);
  let custoTotal = 0;
  let itensTotal = 0;
  let itensComPreco = 0;
  let itensComEstoque = 0;
  let totalPessoas = 0;
  let somaAceitacao = 0;
  let qtdAceitacao = 0;
  let repeticoesRecentes = 0;
  let somaNutricao = 0;
  let proteinasPreferidas = 0;
  let proteinasEvitadas = 0;
  const proteinas = new Set<string>();
  const pratos = new Set<string>();

  for (const dia of dias) {
    totalPessoas += Math.max(0, dia.pessoas || 0);
    if (dia.principal) {
      const norm = normalizar(dia.principal);
      const proteina = proteinaDoPrato(dia.principal);
      pratos.add(norm);
      proteinas.add(proteina);
      if (preferidas.has(proteina)) proteinasPreferidas++;
      if (evitadas.has(proteina)) proteinasEvitadas++;
      repeticoesRecentes += frequencia[norm] ?? 0;
      somaNutricao += notaNutricaoPrato(dia.principal);
      const a = aceitacao[norm];
      if (a?.n > 0) {
        somaAceitacao += a.somaNotas / a.n;
        qtdAceitacao++;
      }
    }

    const lista = listaDoDia(dia);
    const custo = custoDaLista(lista, ctx.precos);
    custoTotal += custo.total;
    itensTotal += custo.itensTotal;
    itensComPreco += custo.itensComPreco;
    itensComEstoque += lista.filter((item) => (estoque[normalizar(item.item)] ?? 0) > 0).length;
  }

  const avisos = validarSemana(dias, ctx.precos);
  return {
    custoTotal,
    custoPorRefeicao: totalPessoas > 0 ? custoTotal / totalPessoas : 0,
    coberturaPreco: itensTotal > 0 ? itensComPreco / itensTotal : 0,
    aceitacaoMedia: qtdAceitacao > 0 ? somaAceitacao / qtdAceitacao : null,
    coberturaAceitacao: dias.length > 0 ? qtdAceitacao / dias.length : 0,
    repeticoesRecentes,
    diversidadeProteinas: proteinas.size,
    diversidadePratos: pratos.size,
    nutricaoMedia: dias.length > 0 ? somaNutricao / dias.length : 0,
    coberturaEstoque: itensTotal > 0 ? itensComEstoque / itensTotal : 0,
    proteinasPreferidas,
    proteinasEvitadas,
    bloqueios: avisos.filter((a) => a.nivel === 'erro').length,
    alertas: avisos.filter((a) => a.nivel === 'alerta').length,
  };
}

function motivosDaProposta(
  perfil: PerfilPlanejamento,
  m: MetricasSemanaInteligente,
  ctx: ContextoPlanejamentoInteligente,
): string[] {
  const motivos: string[] = [];

  if (m.coberturaPreco >= 0.9) {
    motivos.push(`${Math.round(m.coberturaPreco * 100)}% do custo está apoiado em preços cadastrados.`);
  } else {
    motivos.push(`Custo com ${Math.round(m.coberturaPreco * 100)}% de cobertura: itens sem preço não são tratados como economia.`);
  }

  if (m.aceitacaoMedia !== null) {
    motivos.push(`Aceitação média conhecida: ${m.aceitacaoMedia.toFixed(1)}/5 em ${Math.round(m.coberturaAceitacao * 100)}% dos dias.`);
  } else {
    motivos.push('Ainda não há avaliações suficientes para usar aceitação como evidência forte.');
  }

  if (perfil === 'economia') {
    if (m.coberturaPreco >= 0.6) {
      motivos.push(`Estimativa atual: R$ ${m.custoPorRefeicao.toFixed(2).replace('.', ',')} por refeição.`);
    } else {
      motivos.push('O perfil econômico preserva as regras, mas só ranqueia custo quando a cobertura de preços é suficiente.');
    }
  }
  if (perfil === 'variedade') {
    motivos.push(`${m.diversidadePratos}/7 pratos distintos e ${m.diversidadeProteinas} grupos de proteína.`);
  }
  if (perfil === 'equilibrado') {
    motivos.push('Combina custo, aceitação, nutrição, estoque e anti-repetição sem deixar um único critério dominar.');
  }

  if (Object.keys(ctx.estoque ?? {}).length > 0) {
    motivos.push(`${Math.round(m.coberturaEstoque * 100)}% dos itens sugeridos têm saldo conhecido no estoque informado.`);
  } else if (m.repeticoesRecentes === 0) {
    motivos.push('Nenhum dos pratos aparece nas quatro semanas recentes conhecidas.');
  } else {
    motivos.push(`${m.repeticoesRecentes} ocorrência(s) recente(s) foram consideradas na penalização de repetição.`);
  }

  if (m.proteinasEvitadas > 0) motivos.push(`${m.proteinasEvitadas} dia(s) ainda usam proteína marcada para evitar.`);
  if (m.bloqueios > 0) motivos.push(`${m.bloqueios} bloqueio(s) operacional(is) ainda precisam ser resolvidos.`);
  return motivos.slice(0, 4);
}

function chaveSemana(dias: DiaCardapio[]): string {
  return dias
    .map((d) => [d.principal, d.guarnicaoFixa, d.guarnicao, d.salada, d.sobremesa].map(normalizar).join('|'))
    .join('::');
}

function pontuar(
  perfil: PerfilPlanejamento,
  m: MetricasSemanaInteligente,
  ctx: ContextoPlanejamentoInteligente,
): number {
  if (m.bloqueios > 0) return -100000 - m.bloqueios * 10000;

  const aceitacao = m.aceitacaoMedia ?? 3;
  const confiancaAceitacao = Math.max(0.2, m.coberturaAceitacao);
  const custoConfiavel = m.coberturaPreco >= 0.6;
  const custo = custoConfiavel ? m.custoPorRefeicao : 0;
  const alvo = ctx.custoAlvoPorRefeicao;
  const distanciaAlvo = custoConfiavel && alvo && alvo > 0 ? Math.abs(custo - alvo) : 0;

  let nota = 0;
  nota -= m.alertas * 6;
  nota -= m.proteinasEvitadas * 90;
  nota += m.proteinasPreferidas * 12;
  nota += m.coberturaPreco * 20;
  nota += m.coberturaEstoque * 12;

  if (perfil === 'economia') {
    nota += aceitacao * 12 * confiancaAceitacao;
    nota += m.nutricaoMedia * 0.18;
    nota += m.diversidadePratos * 3;
    nota -= m.repeticoesRecentes * 4;
    if (custoConfiavel) nota -= custo * 8;
    if (distanciaAlvo > 0) nota -= distanciaAlvo * 5;
    if (!custoConfiavel) nota -= 30;
  } else if (perfil === 'variedade') {
    nota += m.diversidadePratos * 15;
    nota += m.diversidadeProteinas * 16;
    nota -= m.repeticoesRecentes * 12;
    nota += m.nutricaoMedia * 0.28;
    nota += aceitacao * 7 * confiancaAceitacao;
    if (custoConfiavel) nota -= custo * 1.5;
  } else {
    nota += aceitacao * 18 * confiancaAceitacao;
    nota += m.nutricaoMedia * 0.35;
    nota += m.diversidadePratos * 7;
    nota += m.diversidadeProteinas * 8;
    nota -= m.repeticoesRecentes * 7;
    if (custoConfiavel) nota -= custo * 3;
    if (distanciaAlvo > 0) nota -= distanciaAlvo * 2;
  }

  return nota;
}

function gerarCandidatos(ctx: ContextoPlanejamentoInteligente): DiaCardapio[][] {
  const opts = {
    aceitacao: ctx.aceitacao,
    frequencia: ctx.frequencia,
    estoque: ctx.estoque,
  };
  const candidatos = [
    sugerirSemana(ctx.pessoas, ctx.precos, opts),
    sugerirSemana(ctx.pessoas, ctx.precos, opts),
    sugerirSemanaCriativa(ctx.pessoas, ctx.precos, opts),
    sugerirSemanaHistorica(ctx.pessoas, ctx.precos, opts),
  ].filter((dias): dias is DiaCardapio[] => !!dias);

  const vistos = new Set<string>();
  return candidatos.filter((dias) => {
    const chave = chaveSemana(dias);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/**
 * Gera um pequeno conjunto de semanas válidas e as reavalia sob três lentes.
 * Assim os perfis realmente mudam a decisão sem duplicar as regras duras do
 * motor. Quando preço/aceitação/estoque estão incompletos, a pontuação reduz a
 * confiança nesses sinais em vez de tratá-los como fatos ausentes = zero.
 */
export function planejarSemanaInteligente(ctx: ContextoPlanejamentoInteligente): PropostaSemanaInteligente[] {
  const candidatos = gerarCandidatos(ctx);
  if (candidatos.length === 0) return [];

  const avaliados = candidatos.map((dias) => ({
    dias,
    metricas: avaliarSemanaInteligente(dias, ctx),
  }));
  const usados = new Set<string>();
  const perfis: PerfilPlanejamento[] = ['equilibrado', 'economia', 'variedade'];

  return perfis.map((perfil) => {
    const ordenados = [...avaliados].sort(
      (a, b) => pontuar(perfil, b.metricas, ctx) - pontuar(perfil, a.metricas, ctx),
    );
    const escolhido = ordenados.find((c) => !usados.has(chaveSemana(c.dias))) ?? ordenados[0];
    usados.add(chaveSemana(escolhido.dias));
    return {
      perfil,
      titulo: META[perfil].titulo,
      subtitulo: META[perfil].subtitulo,
      dias: escolhido.dias,
      metricas: escolhido.metricas,
      motivos: motivosDaProposta(perfil, escolhido.metricas, ctx),
    };
  });
}
