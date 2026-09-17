import { calcularCustoPrato } from './custo-prato';
import { converterParaUnidadeBase, linhasDoDia, normalizar } from './motor';
import { resolverPreco } from './precos';
import type { LancamentoGasto } from './gastos';
import type { Ofertas } from './estado';
import type {
  Aceitacao,
  ContagemRefeicoesDia,
  EstadoSemana,
  Estoque,
  HistoricoPrecos,
  RegistroDesperdicio,
} from './tipos';

export type ClasseValor = 'comprovado' | 'registrado' | 'estimado' | 'simulacao' | 'indisponivel';

export interface ValorComEvidencia {
  valor: number | null;
  classe: ClasseValor;
  coberturaPct: number;
  descricao: string;
}

export interface DriverGerencial {
  id: 'desperdicio' | 'demanda' | 'preco' | 'cotacao' | 'estoque' | 'aceitacao';
  titulo: string;
  valor: number | null;
  unidade: 'R$' | '%' | 'refeicoes' | 'nota';
  classe: ClasseValor;
  explicacao: string;
}

export interface InteligenciaViva {
  semanaId: string;
  refeicoesPrevistas: number;
  refeicoesPrevistasComparaveis: number | null;
  refeicoesReais: number | null;
  diasComReal: number;
  coberturaDemandaPct: number;
  erroDemanda: number | null;
  erroDemandaPct: number | null;
  custoPlanejado: ValorComEvidencia;
  comprasRegistradas: ValorComEvidencia;
  notasFiscais: ValorComEvidencia;
  consumoEstimado: ValorComEvidencia;
  desperdicio: ValorComEvidencia;
  estoqueValorizado: ValorComEvidencia;
  economiaCotacao: ValorComEvidencia;
  pressaoPreco: ValorComEvidencia;
  diferencaCompraConsumo: ValorComEvidencia;
  diferencaNfPlanejado: ValorComEvidencia;
  aceitacaoMedia: number | null;
  coberturaAceitacaoPct: number;
  drivers: DriverGerencial[];
  alertas: string[];
}

export interface EntradaInteligenciaViva {
  semanaId: string;
  datasSemana: string[];
  estado: EstadoSemana;
  precos: Record<string, number>;
  estimativas: Record<string, number>;
  fatores?: Record<string, number>;
  desperdicio: RegistroDesperdicio[];
  contagens: ContagemRefeicoesDia[];
  estoque: Estoque;
  ofertas: Ofertas;
  fornecedores: Record<string, string>;
  historicoPrecos: HistoricoPrecos;
  aceitacao: Aceitacao;
  lancamentos: LancamentoGasto[];
}

function arred(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function totalContagem(c?: ContagemRefeicoesDia): number | null {
  if (!c) return null;
  const total = Math.max(0, c.almoco) + Math.max(0, c.jantar) + Math.max(0, c.marmitas);
  return total > 0 ? total : null;
}

function refeicoesReaisPorDia(entrada: EntradaInteligenciaViva): (number | null)[] {
  const porData = new Map(entrada.contagens.map((c) => [c.data, c]));
  return entrada.estado.dias.map((_, i) => {
    const registradoNaSemana = entrada.estado.refeicoes?.[i];
    if (registradoNaSemana != null && registradoNaSemana > 0) return registradoNaSemana;
    return totalContagem(porData.get(entrada.datasSemana[i]));
  });
}

function custoPlanejadoDia(entrada: EntradaInteligenciaViva, dia: number): { total: number; comPreco: number; itens: number } {
  const linhas = linhasDoDia(entrada.estado, dia, entrada.fatores);
  let total = 0;
  let comPreco = 0;
  for (const linha of linhas) {
    const r = resolverPreco(linha.chave, entrada.precos, entrada.estimativas);
    if (r.tipo === 'sem' || !(r.valor > 0)) continue;
    total += r.valor * converterParaUnidadeBase(linha.qtd, linha.unid);
    comPreco += 1;
  }
  return { total, comPreco, itens: linhas.length };
}

function custoComprado(entrada: EntradaInteligenciaViva): { total: number; comprovados: number; estimados: number; itens: number } {
  let total = 0;
  let comprovados = 0;
  let estimados = 0;
  let itens = 0;
  entrada.estado.dias.forEach((_, di) => {
    linhasDoDia(entrada.estado, di, entrada.fatores).forEach((linha) => {
      if (!linha.status.compradoEm) return;
      itens += 1;
      const qtd = linha.status.compradoQtd ?? linha.qtd;
      if (linha.status.precoPago != null && linha.status.precoPago > 0) {
        total += linha.status.precoPago * converterParaUnidadeBase(qtd, linha.unid);
        comprovados += 1;
        return;
      }
      const r = resolverPreco(linha.chave, entrada.precos, entrada.estimativas);
      if (r.tipo !== 'sem' && r.valor > 0) {
        total += r.valor * converterParaUnidadeBase(qtd, linha.unid);
        estimados += 1;
      }
    });
  });
  return { total, comprovados, estimados, itens };
}

export function estimarValorDesperdicio(
  registro: RegistroDesperdicio,
  entrada: Pick<EntradaInteligenciaViva, 'estado' | 'precos' | 'estimativas'>,
): { valor: number | null; cobertura: number; metodo: 'porcao' | 'kg-producao' | 'sem-base' } {
  const sobra = Math.max(0, registro.produzido - registro.consumido);
  if (!(sobra > 0)) return { valor: 0, cobertura: 1, metodo: 'porcao' };
  const pessoasBase = entrada.estado.dias[registro.dia]?.pessoas ?? Math.max(1, Math.round(registro.produzido));
  const pessoas = Math.max(1, pessoasBase);
  const custo = calcularCustoPrato(registro.prato, 'Principal', entrada.precos, pessoas, entrada.estimativas);
  if (!custo || !(custo.custoTotal > 0) || custo.cobertura < 0.4) {
    return { valor: null, cobertura: custo?.cobertura ?? 0, metodo: 'sem-base' };
  }
  if (registro.unid === 'porções') {
    return { valor: arred(sobra * custo.custoPorcao), cobertura: custo.cobertura, metodo: 'porcao' };
  }
  if (registro.produzido > 0) {
    const custoKg = custo.custoTotal / registro.produzido;
    return { valor: arred(sobra * custoKg), cobertura: custo.cobertura, metodo: 'kg-producao' };
  }
  return { valor: null, cobertura: custo.cobertura, metodo: 'sem-base' };
}

function valorEstoque(entrada: EntradaInteligenciaViva): { total: number; comPreco: number; itens: number } {
  let total = 0;
  let comPreco = 0;
  const itens = Object.values(entrada.estoque).filter((e) => e.qtd > 0);
  for (const item of itens) {
    const r = resolverPreco(normalizar(item.item), entrada.precos, entrada.estimativas);
    if (r.tipo === 'sem' || !(r.valor > 0)) continue;
    total += r.valor * converterParaUnidadeBase(item.qtd, item.unid);
    comPreco += 1;
  }
  return { total, comPreco, itens: itens.length };
}

function quantidadesSemana(entrada: EntradaInteligenciaViva): Map<string, number> {
  const mapa = new Map<string, number>();
  entrada.estado.dias.forEach((_, di) => {
    linhasDoDia(entrada.estado, di, entrada.fatores).forEach((linha) => {
      const qtd = converterParaUnidadeBase(linha.qtd, linha.unid);
      mapa.set(linha.chave, (mapa.get(linha.chave) ?? 0) + qtd);
    });
  });
  return mapa;
}

function oportunidadeCotacao(entrada: EntradaInteligenciaViva): { total: number; comparados: number } {
  const qtds = quantidadesSemana(entrada);
  let total = 0;
  let comparados = 0;
  Array.from(qtds.entries()).forEach(([item, qtd]) => {
    const lista = (entrada.ofertas[item] ?? []).filter((o) => o.preco > 0);
    if (lista.length < 2) return;
    const menor = Math.min(...lista.map((o) => o.preco));
    const fornecedorAtual = entrada.fornecedores[item]?.toLowerCase();
    const ofertaAtual = fornecedorAtual
      ? lista.find((o) => o.fornecedor.toLowerCase() === fornecedorAtual)
      : undefined;
    const atual = ofertaAtual?.preco ?? resolverPreco(item, entrada.precos, entrada.estimativas).valor;
    if (!(atual > 0)) return;
    comparados += 1;
    total += Math.max(0, atual - menor) * qtd;
  });
  return { total, comparados };
}

function pressaoDePreco(entrada: EntradaInteligenciaViva): { total: number; comparados: number } {
  const qtds = quantidadesSemana(entrada);
  let total = 0;
  let comparados = 0;
  Array.from(qtds.entries()).forEach(([item, qtd]) => {
    const hist = [...(entrada.historicoPrecos[item] ?? [])].sort((a, b) => a.em.localeCompare(b.em));
    if (hist.length < 2) return;
    const atual = resolverPreco(item, entrada.precos, entrada.estimativas).valor;
    if (!(atual > 0)) return;
    const anterior = hist[hist.length - 2]?.valor;
    if (!(anterior > 0)) return;
    comparados += 1;
    total += Math.max(0, atual - anterior) * qtd;
  });
  return { total, comparados };
}

function aceitacaoSemana(entrada: EntradaInteligenciaViva): { media: number | null; cobertos: number; pratos: number } {
  const principais = entrada.estado.dias.map((d) => d.principal).filter(Boolean);
  let soma = 0;
  let cobertos = 0;
  for (const prato of principais) {
    const a = entrada.aceitacao[normalizar(prato)];
    if (!a || a.n < 2) continue;
    soma += a.somaNotas / a.n;
    cobertos += 1;
  }
  return { media: cobertos > 0 ? soma / cobertos : null, cobertos, pratos: principais.length };
}

export function construirInteligenciaViva(entrada: EntradaInteligenciaViva): InteligenciaViva {
  const reaisDia = refeicoesReaisPorDia(entrada);
  const previstas = entrada.estado.dias.reduce((s, d) => s + Math.max(0, d.pessoas), 0);
  const indicesComReal = reaisDia
    .map((n, i) => n == null ? -1 : i)
    .filter((i) => i >= 0);
  const diasComReal = indicesComReal.length;
  const reais = diasComReal > 0
    ? indicesComReal.reduce((s, i) => s + (reaisDia[i] ?? 0), 0)
    : null;
  const previstasComparaveis = diasComReal > 0
    ? indicesComReal.reduce((s, i) => s + Math.max(0, entrada.estado.dias[i]?.pessoas ?? 0), 0)
    : null;
  const coberturaDemandaPct = pct(diasComReal, entrada.estado.dias.length);

  let planejado = 0;
  let itensPlanejados = 0;
  let itensComPreco = 0;
  let consumo = 0;
  let diasConsumo = 0;
  entrada.estado.dias.forEach((dia, i) => {
    const c = custoPlanejadoDia(entrada, i);
    planejado += c.total;
    itensPlanejados += c.itens;
    itensComPreco += c.comPreco;
    const real = reaisDia[i];
    if (real != null && dia.pessoas > 0) {
      consumo += c.total * (real / dia.pessoas);
      diasConsumo += 1;
    }
  });

  const comprado = custoComprado(entrada);
  const datas = new Set(entrada.datasSemana);
  const nfsSemana = entrada.lancamentos.filter((l) => datas.has(l.data) && l.origem === 'nf');
  const totalNf = nfsSemana.reduce((s, l) => s + Math.max(0, l.total), 0);

  let desperdicioValor = 0;
  let desperdiciosValorados = 0;
  for (const reg of entrada.desperdicio) {
    const est = estimarValorDesperdicio(reg, entrada);
    if (est.valor == null) continue;
    desperdicioValor += est.valor;
    desperdiciosValorados += 1;
  }

  const estq = valorEstoque(entrada);
  const oportunidade = oportunidadeCotacao(entrada);
  const pressao = pressaoDePreco(entrada);
  const aceit = aceitacaoSemana(entrada);
  const erroDemanda = reais == null || previstasComparaveis == null ? null : reais - previstasComparaveis;
  const erroDemandaPct = erroDemanda == null || previstasComparaveis == null || previstasComparaveis <= 0
    ? null
    : (erroDemanda / previstasComparaveis) * 100;

  const custoPlanejado: ValorComEvidencia = {
    valor: itensComPreco > 0 ? arred(planejado) : null,
    classe: 'estimado',
    coberturaPct: pct(itensComPreco, itensPlanejados),
    descricao: 'quantidades planejadas × melhor referência de preço disponível',
  };
  const comprasRegistradas: ValorComEvidencia = {
    valor: comprado.itens > 0 ? arred(comprado.total) : null,
    classe: comprado.comprovados === comprado.itens && comprado.itens > 0 ? 'registrado' : 'estimado',
    coberturaPct: pct(comprado.comprovados + comprado.estimados, comprado.itens),
    descricao: comprado.comprovados > 0 ? 'itens marcados como comprados; preço pago prevalece quando registrado' : 'itens marcados como comprados usando preço disponível',
  };
  const notasFiscais: ValorComEvidencia = {
    valor: nfsSemana.length > 0 ? arred(totalNf) : null,
    classe: nfsSemana.length > 0 ? 'comprovado' : 'indisponivel',
    coberturaPct: nfsSemana.length > 0 ? 100 : 0,
    descricao: nfsSemana.length > 0 ? `${nfsSemana.length} nota(s) fiscal(is) lançada(s) no período` : 'nenhuma nota fiscal vinculada às datas desta semana',
  };
  const consumoEstimado: ValorComEvidencia = {
    valor: diasConsumo > 0 ? arred(consumo) : null,
    classe: diasConsumo > 0 ? 'estimado' : 'indisponivel',
    coberturaPct: pct(diasConsumo, entrada.estado.dias.length),
    descricao: 'custo planejado recalibrado pela quantidade real de refeições servidas',
  };
  const desperdicio: ValorComEvidencia = {
    valor: desperdiciosValorados > 0 ? arred(desperdicioValor) : null,
    classe: desperdiciosValorados > 0 ? 'estimado' : 'indisponivel',
    coberturaPct: pct(desperdiciosValorados, entrada.desperdicio.length),
    descricao: 'sobra × custo real/estimado do prato; kg usa o rendimento produzido informado',
  };
  const estoqueValorizado: ValorComEvidencia = {
    valor: estq.comPreco > 0 ? arred(estq.total) : null,
    classe: estq.comPreco > 0 ? 'estimado' : 'indisponivel',
    coberturaPct: pct(estq.comPreco, estq.itens),
    descricao: 'saldo atual × referência de preço por item',
  };
  const economiaCotacao: ValorComEvidencia = {
    valor: oportunidade.comparados > 0 ? arred(oportunidade.total) : null,
    classe: oportunidade.comparados > 0 ? 'simulacao' : 'indisponivel',
    coberturaPct: oportunidade.comparados > 0 ? 100 : 0,
    descricao: 'diferença entre fornecedor/preço atual e menor oferta comparável para a necessidade da semana',
  };
  const pressaoPreco: ValorComEvidencia = {
    valor: pressao.comparados > 0 ? arred(pressao.total) : null,
    classe: pressao.comparados > 0 ? 'estimado' : 'indisponivel',
    coberturaPct: pressao.comparados > 0 ? 100 : 0,
    descricao: 'efeito aproximado de aumentos recentes de preço sobre as quantidades planejadas',
  };

  const diferencaCompraConsumo: ValorComEvidencia = {
    valor: comprasRegistradas.valor != null && consumoEstimado.valor != null
      ? arred(comprasRegistradas.valor - consumoEstimado.valor)
      : null,
    classe: comprasRegistradas.valor != null && consumoEstimado.valor != null ? 'estimado' : 'indisponivel',
    coberturaPct: Math.min(comprasRegistradas.coberturaPct, consumoEstimado.coberturaPct),
    descricao: 'compras registradas − consumo estimado; é valor a explicar, não perda comprovada (pode incluir estoque e diferença de período)',
  };

  const diferencaNfPlanejado: ValorComEvidencia = {
    valor: notasFiscais.valor != null && custoPlanejado.valor != null
      ? arred(notasFiscais.valor - custoPlanejado.valor)
      : null,
    classe: notasFiscais.valor != null && custoPlanejado.valor != null ? 'estimado' : 'indisponivel',
    coberturaPct: Math.min(notasFiscais.coberturaPct, custoPlanejado.coberturaPct),
    descricao: 'notas fiscais da semana − custo planejado; compras podem abastecer outras semanas, então a diferença não é classificada como desperdício',
  };

  const drivers: DriverGerencial[] = [
    {
      id: 'desperdicio', titulo: 'Valor associado à sobra', valor: desperdicio.valor, unidade: 'R$', classe: desperdicio.classe,
      explicacao: desperdicio.descricao,
    },
    {
      id: 'demanda', titulo: 'Erro de previsão', valor: erroDemanda, unidade: 'refeicoes', classe: erroDemanda == null ? 'indisponivel' : 'registrado',
      explicacao: erroDemanda == null ? 'Ainda faltam contagens reais para comparar.' : erroDemanda < 0 ? 'Foram servidas menos refeições que o planejado.' : erroDemanda > 0 ? 'Foram servidas mais refeições que o planejado.' : 'Planejado e servido coincidiram.',
    },
    {
      id: 'preco', titulo: 'Pressão de alta de preços', valor: pressaoPreco.valor, unidade: 'R$', classe: pressaoPreco.classe,
      explicacao: pressaoPreco.descricao,
    },
    {
      id: 'cotacao', titulo: 'Economia potencial na cotação', valor: economiaCotacao.valor, unidade: 'R$', classe: economiaCotacao.classe,
      explicacao: economiaCotacao.descricao,
    },
    {
      id: 'estoque', titulo: 'Capital em estoque', valor: estoqueValorizado.valor, unidade: 'R$', classe: estoqueValorizado.classe,
      explicacao: estoqueValorizado.descricao,
    },
    {
      id: 'aceitacao', titulo: 'Aceitação dos principais', valor: aceit.media, unidade: 'nota', classe: aceit.media == null ? 'indisponivel' : 'registrado',
      explicacao: aceit.media == null ? 'Ainda não há amostra suficiente.' : `${aceit.cobertos}/${aceit.pratos} prato(s) da semana têm amostra útil.`,
    },
  ];

  const alertas: string[] = [];
  if (diasComReal > 0 && diasComReal < entrada.estado.dias.length) {
    alertas.push(`Demanda comparada em ${diasComReal}/7 dia(s); os dias sem contagem real não entram no desvio.`);
  }
  if (erroDemandaPct != null && erroDemandaPct <= -10) alertas.push(`Nos dias já medidos, a demanda real está ${Math.abs(Math.round(erroDemandaPct))}% abaixo do planejado; revise produção e compra antes de repetir o padrão.`);
  if (erroDemandaPct != null && erroDemandaPct >= 10) alertas.push(`Nos dias já medidos, a demanda real está ${Math.round(erroDemandaPct)}% acima do planejado; há risco de falta ou compra emergencial.`);
  if (desperdicio.valor != null && desperdicio.valor > 0) alertas.push(`${desperdicio.coberturaPct}% dos registros de sobra já têm valor financeiro estimável.`);
  if (economiaCotacao.valor != null && economiaCotacao.valor >= 20) alertas.push(`Há cerca de R$ ${economiaCotacao.valor.toFixed(2).replace('.', ',')} de economia potencial nas ofertas comparáveis desta semana.`);
  if (custoPlanejado.coberturaPct < 80) alertas.push(`Só ${custoPlanejado.coberturaPct}% dos itens planejados têm preço; trate o custo total como incompleto.`);

  return {
    semanaId: entrada.semanaId,
    refeicoesPrevistas: previstas,
    refeicoesPrevistasComparaveis: previstasComparaveis,
    refeicoesReais: reais,
    diasComReal,
    coberturaDemandaPct,
    erroDemanda,
    erroDemandaPct,
    custoPlanejado,
    comprasRegistradas,
    notasFiscais,
    consumoEstimado,
    desperdicio,
    estoqueValorizado,
    economiaCotacao,
    pressaoPreco,
    diferencaCompraConsumo,
    diferencaNfPlanejado,
    aceitacaoMedia: aceit.media,
    coberturaAceitacaoPct: pct(aceit.cobertos, aceit.pratos),
    drivers,
    alertas,
  };
}
