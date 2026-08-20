/* =====================================================================
   Estudo da operação — o que o Chef IA deveria ter sido desde o começo.

   O Chef IA antigo só validava a semana aberta: "frango 5×", "faltam 2
   dias", "item sem preço". Isso é conferência de formulário, não
   inteligência: nenhuma dessas frases olhava o que aconteceu na casa nas
   semanas passadas, quanto custou, o que sobrou no balcão ou o que a
   equipe realmente comeu.

   Aqui é o contrário: cada achado nasce de dado real acumulado
   (aceitação por QR, desperdício registrado, série de preços, notas
   fiscais lidas, cardápios servidos) e chega com número, evidência e uma
   ação concreta. Sem dado suficiente, o achado simplesmente não aparece
   — é melhor calar do que inventar recomendação.

   Função PURA: recebe os dados, devolve os achados. Testada em
   estudo-operacao.test.ts.
   ===================================================================== */

import type {
  Aceitacao,
  EstadoSemana,
  HistoricoPrecos,
  RegistroDesperdicio,
} from './tipos';
import type { LancamentoGasto } from './gastos';

export type CategoriaAchado =
  | 'preco'
  | 'desperdicio'
  | 'aceitacao'
  | 'gasto'
  | 'variedade'
  | 'oportunidade';

export interface Achado {
  id: string;
  categoria: CategoriaAchado;
  prioridade: 'alta' | 'media' | 'baixa';
  titulo: string;
  /** O dado que sustenta o achado — sempre com número. */
  evidencia: string;
  /** O que fazer a respeito. */
  acao: string;
  /** Impacto estimado em R$/semana, quando dá para calcular. */
  impactoSemanal?: number;
}

export interface EntradaEstudo {
  semanas: { semanaId: string; estado: EstadoSemana }[];
  aceitacao: Aceitacao;
  desperdicio: RegistroDesperdicio[];
  historicoPrecos: HistoricoPrecos;
  gastos: LancamentoGasto[];
  /** Custo médio por refeição da semana aberta, quando calculado. */
  custoRefeicaoSemana?: number | null;
}

const ORDEM: Record<Achado['prioridade'], number> = { alta: 0, media: 1, baixa: 2 };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Math.abs(Math.round(v))}%`;

/* ------------------------- 1) preço disparou -------------------------- */

function achadosDePreco(hist: HistoricoPrecos): Achado[] {
  const out: Achado[] = [];
  for (const [item, serie] of Object.entries(hist)) {
    if (!serie || serie.length < 2) continue;
    const ordenada = [...serie].sort((a, b) => a.em.localeCompare(b.em));
    const primeiro = ordenada[0];
    const ultimo = ordenada[ordenada.length - 1];
    if (!(primeiro.valor > 0) || !(ultimo.valor > 0)) continue;
    const variacao = ((ultimo.valor - primeiro.valor) / primeiro.valor) * 100;
    if (variacao < 15) continue;
    out.push({
      id: `preco-${item}`,
      categoria: 'preco',
      prioridade: variacao >= 30 ? 'alta' : 'media',
      titulo: `${item} subiu ${pct(variacao)}`,
      evidencia: `De ${brl(primeiro.valor)} para ${brl(ultimo.valor)} ao longo de ${ordenada.length} cotações.`,
      acao: 'Cote com outro fornecedor antes do próximo pedido, ou troque por um substituto da mesma proteína.',
    });
  }
  return out.sort((a, b) => (a.prioridade === b.prioridade ? 0 : ORDEM[a.prioridade] - ORDEM[b.prioridade])).slice(0, 3);
}

/* ------------------------ 2) desperdício real ------------------------- */

function achadosDeDesperdicio(registros: RegistroDesperdicio[], custoRefeicao: number | null | undefined): Achado[] {
  const porPrato = new Map<string, { produzido: number; consumido: number; n: number }>();
  for (const r of registros) {
    if (!r.prato || !(r.produzido > 0)) continue;
    const atual = porPrato.get(r.prato) ?? { produzido: 0, consumido: 0, n: 0 };
    atual.produzido += r.produzido;
    atual.consumido += r.consumido;
    atual.n++;
    porPrato.set(r.prato, atual);
  }

  const out: Achado[] = [];
  for (const [prato, v] of Array.from(porPrato.entries())) {
    if (v.n < 2) continue; // um episódio isolado não é padrão
    const sobra = v.produzido - v.consumido;
    if (sobra <= 0) continue;
    const perc = (sobra / v.produzido) * 100;
    if (perc < 15) continue;
    const sobraMedia = sobra / v.n;
    const impacto = custoRefeicao && custoRefeicao > 0 ? sobraMedia * custoRefeicao : undefined;
    out.push({
      id: `desperdicio-${prato}`,
      categoria: 'desperdicio',
      prioridade: perc >= 30 ? 'alta' : 'media',
      titulo: `${prato} sobra ${pct(perc)} do que é produzido`,
      evidencia: `${v.n} registros: produzido ${v.produzido.toFixed(0)}, consumido ${v.consumido.toFixed(0)} — sobra média de ${sobraMedia.toFixed(0)} por vez.`,
      acao: `Reduza a produção deste prato em ~${Math.round(perc)}% ou troque a guarnição que está sobrando.`,
      impactoSemanal: impacto,
    });
  }
  return out.sort((a, b) => (b.impactoSemanal ?? 0) - (a.impactoSemanal ?? 0)).slice(0, 3);
}

/* -------------------- 3) aceitação: vilões e campeões ------------------ */

function achadosDeAceitacao(aceitacao: Aceitacao, semanas: EntradaEstudo['semanas']): Achado[] {
  const out: Achado[] = [];

  // frequência real com que cada prato foi servido nas semanas registradas
  const freq = new Map<string, number>();
  for (const { estado } of semanas) {
    for (const d of estado.dias ?? []) {
      if (!d.principal) continue;
      const k = d.principal.toLowerCase();
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }

  for (const reg of Object.values(aceitacao)) {
    const totalVotos = reg.bom + reg.ok + reg.ruim;
    if (totalVotos < 5) continue; // amostra pequena demais para agir

    const aprovacao = ((reg.bom + reg.ok * 0.5) / totalVotos) * 100;
    const vezes = freq.get((reg.prato ?? '').toLowerCase()) ?? 0;

    if (aprovacao < 40) {
      out.push({
        id: `rejeitado-${reg.prato}`,
        categoria: 'aceitacao',
        prioridade: 'alta',
        titulo: `${reg.prato} tem rejeição alta`,
        evidencia: `${totalVotos} avaliações: ${reg.bom} boas, ${reg.ok} ok, ${reg.ruim} ruins (${pct(aprovacao)} de aprovação).`,
        acao: 'Tire do rodízio ou mude o preparo antes de repetir — repetir um prato rejeitado gera sobra.',
      });
    } else if (aprovacao >= 80 && vezes <= 1) {
      out.push({
        id: `campeao-${reg.prato}`,
        categoria: 'oportunidade',
        prioridade: 'media',
        titulo: `${reg.prato} agrada e quase não aparece`,
        evidencia: `${pct(aprovacao)} de aprovação em ${totalVotos} avaliações, servido ${vezes}× nas semanas registradas.`,
        acao: 'Coloque no cardápio das próximas semanas — é ganho de satisfação sem custo extra de teste.',
      });
    }
  }
  return out.sort((a, b) => ORDEM[a.prioridade] - ORDEM[b.prioridade]).slice(0, 4);
}

/* ----------------------- 4) gasto real do mês ------------------------- */

function achadosDeGasto(gastos: LancamentoGasto[]): Achado[] {
  if (gastos.length === 0) return [];

  const porMes = new Map<string, number>();
  for (const l of gastos) {
    const mes = (l.data ?? '').slice(0, 7);
    if (!mes) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + l.total);
  }
  if (porMes.size < 2) return [];

  const meses = Array.from(porMes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const atual = meses[meses.length - 1];
  const anteriores = meses.slice(0, -1);
  const media = anteriores.reduce((s, [, v]) => s + v, 0) / anteriores.length;
  if (!(media > 0)) return [];

  const variacao = ((atual[1] - media) / media) * 100;
  if (Math.abs(variacao) < 12) return [];

  const subiu = variacao > 0;
  return [{
    id: `gasto-${atual[0]}`,
    categoria: 'gasto',
    prioridade: subiu && variacao >= 25 ? 'alta' : 'media',
    titulo: subiu ? `Gasto do mês ${pct(variacao)} acima da média` : `Gasto do mês ${pct(variacao)} abaixo da média`,
    evidencia: `${brl(atual[1])} nas notas de ${atual[0]}, contra média de ${brl(media)} nos meses anteriores.`,
    acao: subiu
      ? 'Confira os itens de maior peso na aba Gastos antes de fechar o próximo pedido.'
      : 'Boa — registre o que mudou para repetir o padrão no próximo mês.',
  }];
}

/* --------------------- 5) variedade entre semanas ---------------------- */

function achadosDeVariedade(semanas: EntradaEstudo['semanas']): Achado[] {
  const recentes = semanas.slice(-4);
  if (recentes.length < 2) return [];

  const freq = new Map<string, number>();
  let totalPratos = 0;
  for (const { estado } of recentes) {
    for (const d of estado.dias ?? []) {
      if (!d.principal) continue;
      const k = d.principal.toLowerCase();
      freq.set(k, (freq.get(k) ?? 0) + 1);
      totalPratos++;
    }
  }
  if (totalPratos < 10) return [];

  const repetidos = Array.from(freq.entries()).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  if (repetidos.length === 0) return [];

  const [prato, n] = repetidos[0];
  return [{
    id: `variedade-${prato}`,
    categoria: 'variedade',
    prioridade: n >= 4 ? 'alta' : 'baixa',
    titulo: `${prato} apareceu ${n}× em ${recentes.length} semanas`,
    evidencia: `De ${totalPratos} pratos servidos no período, ${n} foram o mesmo — ${pct((n / totalPratos) * 100)} do cardápio.`,
    acao: 'Alterne com outro prato da mesma proteína para não cansar a equipe.',
  }];
}

/* ------------------------------ estudo -------------------------------- */

export function estudarOperacao(e: EntradaEstudo): Achado[] {
  const achados = [
    ...achadosDeGasto(e.gastos),
    ...achadosDeDesperdicio(e.desperdicio, e.custoRefeicaoSemana),
    ...achadosDeAceitacao(e.aceitacao, e.semanas),
    ...achadosDePreco(e.historicoPrecos),
    ...achadosDeVariedade(e.semanas),
  ];
  return achados.sort((a, b) => {
    const p = ORDEM[a.prioridade] - ORDEM[b.prioridade];
    if (p !== 0) return p;
    return (b.impactoSemanal ?? 0) - (a.impactoSemanal ?? 0);
  });
}

/** Quanto dado já existe para o estudo — usado para explicar o silêncio. */
export function cobertura(e: EntradaEstudo): { pronto: boolean; faltando: string[] } {
  const faltando: string[] = [];
  if (e.semanas.length < 2) faltando.push('mais semanas montadas no app');
  if (Object.keys(e.aceitacao).length === 0) faltando.push('avaliações dos pratos (QR na mesa)');
  if (e.desperdicio.length === 0) faltando.push('registros de sobra no fim do almoço');
  if (e.gastos.length === 0) faltando.push('notas fiscais lidas na aba Notas');
  return { pronto: faltando.length === 0, faltando };
}
