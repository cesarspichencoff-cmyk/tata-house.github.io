import {
  custoDaLista,
  listaDoDia,
  normalizar,
  notaNutricaoPrato,
  proteinaDoPrato,
  sugerirSemana,
  sugerirSemanaCriativa,
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
  ctx: Pick<ContextoPlanejamentoInteligente, 'precos' | 'aceitacao' | 'frequencia'>,
): MetricasSemanaInteligente {
  const aceitacao = ctx.aceitacao ?? {};
  const frequencia = ctx.frequencia ?? {};
  let custoTotal = 0;
  let itensTotal = 0;
  let itensComPreco = 0;
  let totalPessoas = 0;
  let somaAceitacao = 0;
  let qtdAceitacao = 0;
  let repeticoesRecentes = 0;
  let somaNutricao = 0;
  const proteinas = new Set<string>();
  const pratos = new Set<string>();

  for (const dia of dias) {
    totalPessoas += Math.max(0, dia.pessoas || 0);
    if (dia.principal) {
      const norm = normalizar(dia.principal);
      pratos.add(norm);
      proteinas.add(proteinaDoPrato(dia.principal));
      repeticoesRecentes += frequencia[norm] ?? 0;
      somaNutricao += notaNutricaoPrato(dia.principal);
      const a = aceitacao[norm];
      if (a?.n > 0) {
        somaAceitacao += a.somaNotas / a.n;
        qtdAceitacao++;
      }
    }
    const custo = custoDaLista(listaDoDia(dia), ctx.precos);
    custoTotal += custo.total;
    itensTotal += custo.itensTotal;
    itensComPreco += custo.itensComPreco;
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
    bloqueios: avisos.filter((a) => a.nivel === 'erro').length,
    alertas: avisos.filter((a) => a.nivel === 'alerta').length,
  };
}

function motivosDaProposta(perfil: PerfilPlanejamento, m: MetricasSemanaInteligente): string[] {
  const motivos: string[] = [];
  if (m.coberturaPreco >= 0.9) motivos.push(`${Math.round(m.coberturaPreco * 100)}% do custo está apoiado em preços cadastrados.`);
  else motivos.push(`Custo ainda tem só ${Math.round(m.coberturaPreco * 100)}% de cobertura; confira itens sem preço antes de aprovar.`);

  if (m.aceitacaoMedia !== null) motivos.push(`Aceitação média conhecida: ${m.aceitacaoMedia.toFixed(1)}/5.`);
  else motivos.push('Ainda não há avaliações suficientes para usar aceitação como evidência forte.');

  if (perfil === 'economia') motivos.push(`Estimativa atual: R$ ${m.custoPorRefeicao.toFixed(2).replace('.', ',')} por refeição.`);
  if (perfil === 'variedade') motivos.push(`${m.diversidadePratos}/7 pratos distintos e ${m.diversidadeProteinas} grupos de proteína.`);
  if (perfil === 'equilibrado') motivos.push(`Combina custo, aceitação, nutrição e anti-repetição sem deixar um único critério dominar.`);

  if (m.repeticoesRecentes === 0) motivos.push('Nenhum dos pratos aparece nas quatro semanas recentes conhecidas.');
  else motivos.push(`${m.repeticoesRecentes} ocorrência(s) recente(s) foram consideradas na penalização de repetição.`);
  if (m.bloqueios > 0) motivos.push(`${m.bloqueios} bloqueio(s) operacional(is) ainda precisam ser resolvidos.`);
  return motivos.slice(0, 4);
}

function proposta(
  perfil: PerfilPlanejamento,
  dias: DiaCardapio[] | null,
  ctx: ContextoPlanejamentoInteligente,
): PropostaSemanaInteligente | null {
  if (!dias) return null;
  const metricas = avaliarSemanaInteligente(dias, ctx);
  return {
    perfil,
    titulo: META[perfil].titulo,
    subtitulo: META[perfil].subtitulo,
    dias,
    metricas,
    motivos: motivosDaProposta(perfil, metricas),
  };
}

/**
 * Gera três rotas deliberadamente diferentes para a mesma semana.
 * O motor continua respeitando as regras duras da casa; o perfil muda os pesos
 * da decisão, sem fingir que custo, aceitação ou histórico são certeza quando
 * a base está incompleta.
 */
export function planejarSemanaInteligente(ctx: ContextoPlanejamentoInteligente): PropostaSemanaInteligente[] {
  const base = {
    aceitacao: ctx.aceitacao,
    frequencia: ctx.frequencia,
    estoque: ctx.estoque,
    proteinasPrefer: ctx.proteinasPrefer,
    proteinasEvitar: ctx.proteinasEvitar,
    custoAlvoPorRefeicao: ctx.custoAlvoPorRefeicao,
  };

  const equilibrado = proposta(
    'equilibrado',
    sugerirSemana(ctx.pessoas, ctx.precos, { ...base, perfil: 'equilibrado' }),
    ctx,
  );
  const economia = proposta(
    'economia',
    sugerirSemana(ctx.pessoas, ctx.precos, { ...base, perfil: 'economia' }),
    ctx,
  );
  const variedade = proposta(
    'variedade',
    sugerirSemanaCriativa(ctx.pessoas, ctx.precos, { ...base, perfil: 'variedade', criativo: true }),
    ctx,
  );

  return [equilibrado, economia, variedade].filter((p): p is PropostaSemanaInteligente => !!p);
}
