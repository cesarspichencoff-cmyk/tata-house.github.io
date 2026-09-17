from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    s = read(path)
    if old not in s:
        raise RuntimeError(f'Padrão não encontrado em {path}: {old[:120]!r}')
    if s.count(old) != 1:
        raise RuntimeError(f'Padrão não é único em {path}: {s.count(old)} ocorrências')
    write(path, s.replace(old, new, 1))


# 1) Cotação: auto-match de alta confiança + catálogo extra.
cotacao = 'src/lib/cardapio/cotacao.ts'
old_matcher = '''/** Casa um nome de cotação com um item do histórico (ou null). */
export function casarItem(nome: string): string | null {
  const n = tokens(nome).join(' ');
  if (!n) return null;

  for (const [re, alvo] of ALIASES) {
    if (re.test(n)) return alvo;
  }

  // pontuação por cobertura de tokens do item dentro do nome cotado
  const nomeTokens = new Set(tokens(nome));
  let melhor: string | null = null;
  let melhorNota = 0;
  for (const it of DADOS.itens) {
    const itTokens = tokens(it.n);
    if (itTokens.length === 0) continue;
    const cobertos = itTokens.filter((t) => nomeTokens.has(t)).length;
    if (cobertos === 0) continue;
    // todos os tokens do item precisam aparecer no nome cotado
    if (cobertos < itTokens.length) continue;
    // nota: itens mais específicos (mais tokens) e mais frequentes vencem
    const nota = itTokens.length * 1000 + Math.min(it.f, 999);
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = it.n;
    }
  }
  return melhor;
}
'''
new_matcher = '''export interface SugestaoItemCotacao {
  item: string | null;
  unid: string | null;
  confianca: number;
  motivo: 'alias' | 'exato' | 'tokens' | 'ambiguo' | 'sem-match';
}

function tokenComparavel(token: string): string {
  const mapa: Record<string, string> = {
    und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
    kgs: 'kg', quilo: 'kg', quilos: 'kg',
    pacotes: 'pacote', caixas: 'caixa', bandejas: 'bandeja',
  };
  let t = mapa[token] ?? token;
  // Singularização conservadora cobre a maior parte dos nomes de fornecedor
  // (tomates, cenouras, abacaxis, frangos) sem tentar adivinhar morfologia inteira.
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}

function tokensComparaveis(nome: string): string[] {
  return Array.from(new Set(tokens(nome).map(tokenComparavel).filter(Boolean)));
}

function candidatosCatalogo(itensExtras?: Record<string, { n: string; u: string }>) {
  const mapa = new Map<string, { n: string; u: string; f: number }>();
  for (const it of DADOS.itens) mapa.set(normalizar(it.n), { n: it.n, u: it.u, f: it.f });
  for (const extra of Object.values(itensExtras ?? {})) {
    const k = normalizar(extra.n);
    if (k && !mapa.has(k)) mapa.set(k, { n: extra.n, u: extra.u, f: 0 });
  }
  return Array.from(mapa.values());
}

/**
 * Resolve nomes de fornecedor contra o catálogo sem pedir trabalho humano item a item.
 * Só aceita automaticamente quando o melhor candidato é forte E claramente melhor
 * que o segundo colocado; ambiguidade continua explícita em vez de contaminar preços.
 */
export function sugerirItemCotacao(
  nome: string,
  itensExtras?: Record<string, { n: string; u: string }>,
): SugestaoItemCotacao {
  const n = tokensComparaveis(nome).join(' ');
  if (!n) return { item: null, unid: null, confianca: 0, motivo: 'sem-match' };

  for (const [re, alvo] of ALIASES) {
    if (!re.test(n)) continue;
    const alvoDados = candidatosCatalogo(itensExtras).find((it) => normalizar(it.n) === normalizar(alvo));
    return { item: alvo, unid: alvoDados?.u ?? null, confianca: 1, motivo: 'alias' };
  }

  const consultaNorm = normalizar(nome);
  const consultaTokens = new Set(tokensComparaveis(nome));
  const avaliados = candidatosCatalogo(itensExtras).map((it) => {
    const candidatoNorm = normalizar(it.n);
    if (candidatoNorm === consultaNorm) return { ...it, score: 1 };

    const candTokens = new Set(tokensComparaveis(it.n));
    if (candTokens.size === 0 || consultaTokens.size === 0) return { ...it, score: 0 };
    let inter = 0;
    candTokens.forEach((t) => { if (consultaTokens.has(t)) inter += 1; });
    if (inter === 0) return { ...it, score: 0 };

    const dice = (2 * inter) / (candTokens.size + consultaTokens.size);
    const coberturaCandidato = inter / candTokens.size;
    const coberturaConsulta = inter / consultaTokens.size;
    let score = dice;

    // Nome do fornecedor contém todo o nome canônico + qualificadores/embalagem.
    if (candTokens.size >= 2 && coberturaCandidato === 1) {
      score = Math.max(score, 0.94 - Math.min(0.08, Math.max(0, consultaTokens.size - candTokens.size) * 0.02));
    }
    // Fornecedor usa uma forma mais curta, mas todos os seus tokens apontam ao candidato.
    if (consultaTokens.size >= 2 && coberturaConsulta === 1) score = Math.max(score, 0.88);
    // Plural/singular de item de uma palavra é seguro após normalização conservadora.
    if (consultaTokens.size === 1 && candTokens.size === 1 && inter === 1) score = 0.98;

    // Frequência histórica só desempata; não transforma semelhança ruim em match.
    score += Math.min(it.f, 100) / 100000;
    return { ...it, score: Math.min(score, 1) };
  }).sort((a, b) => b.score - a.score || a.n.localeCompare(b.n, 'pt-BR'));

  const melhor = avaliados[0];
  const segundo = avaliados[1];
  if (!melhor || melhor.score < 0.82) {
    return { item: null, unid: null, confianca: melhor?.score ?? 0, motivo: 'sem-match' };
  }
  const margem = melhor.score - (segundo?.score ?? 0);
  const seguro = (melhor.score >= 0.94 && margem >= 0.04) || (melhor.score >= 0.86 && margem >= 0.08);
  if (!seguro) {
    return { item: null, unid: null, confianca: melhor.score, motivo: 'ambiguo' };
  }
  return {
    item: melhor.n,
    unid: melhor.u || null,
    confianca: melhor.score,
    motivo: melhor.score >= 0.98 ? 'exato' : 'tokens',
  };
}

/** Casa um nome de cotação com um item conhecido (ou null). */
export function casarItem(nome: string): string | null {
  return sugerirItemCotacao(nome).item;
}
'''
replace_once(cotacao, old_matcher, new_matcher)

old_agrupar = '''  for (const bruta of linhas) {
    // itens cadastrados pelo usuário em cotações anteriores são conhecidos
    const extra = !bruta.item ? itensExtras?.[normalizar(bruta.nome)] : undefined;
    const l = extra ? { ...bruta, item: extra.n } : bruta;
    if (!l.item) {
      soltos.push(l);
      continue;
    }
    const atual = porItem.get(l.item);
    if (!atual) {
      porItem.set(l.item, {
        item: l.item,
        unid: unidadeDoItem.get(l.item) ?? extra?.u ?? l.unid ?? '',
'''
new_agrupar = '''  for (const bruta of linhas) {
    // 1) alias já aprendido/exato; 2) matcher automático conservador contra
    // catálogo base + itens extras. Match novo é revalidado antes de aplicar preço.
    const extra = !bruta.item ? itensExtras?.[normalizar(bruta.nome)] : undefined;
    const sugestao = !bruta.item && !extra ? sugerirItemCotacao(bruta.nome, itensExtras) : null;
    const itemAuto = extra?.n ?? sugestao?.item ?? null;
    const unidadeAuto = extra?.u ?? sugestao?.unid ?? null;
    const l = itemAuto ? validarLinha({ ...bruta, item: itemAuto }) : bruta;
    if (!l.item) {
      soltos.push(l);
      continue;
    }
    const atual = porItem.get(l.item);
    if (!atual) {
      porItem.set(l.item, {
        item: l.item,
        unid: unidadeDoItem.get(l.item) ?? unidadeAuto ?? l.unid ?? '',
'''
replace_once(cotacao, old_agrupar, new_agrupar)

# 2) Cotação UI: criação em lote para itens realmente novos que já trazem unidade.
aba_cot = 'src/components/cardapio/AbaCotacao.tsx'
old_after_relacionar = '''  const alternar = (item: string) =>
    setIgnorados((s) => {
      const novo = new Set(s);
      if (novo.has(item)) novo.delete(item);
      else novo.add(item);
      return novo;
    });
'''
new_after_relacionar = '''  const novosComUnidade = soltos.filter((s) => {
    const idx = lido?.indexOf(s) ?? -1;
    return idx >= 0 && !cadastrados.has(idx) && !!(unidades[idx] ?? s.unid);
  });

  const assimilarNovosSeguros = () => {
    novosComUnidade.forEach((s) => {
      const idx = lido?.indexOf(s) ?? -1;
      if (idx >= 0) cadastrarNovo(idx, s);
    });
  };

  const alternar = (item: string) =>
    setIgnorados((s) => {
      const novo = new Set(s);
      if (novo.has(item)) novo.delete(item);
      else novo.add(item);
      return novo;
    });
'''
replace_once(aba_cot, old_after_relacionar, new_after_relacionar)

old_soltos_header = '''                <h3 className="font-display text-lg font-semibold">{soltos.length} nomes ainda não relacionados</h3>
                <p className="mt-1 text-xs leading-5 text-texto-suave">
                  Cotação não vira catálogo automaticamente. Relacione o nome do fornecedor a um item que já existe ou crie um item novo escolhendo a unidade explicitamente.
                </p>
              </div>
'''
new_soltos_header = '''                <h3 className="font-display text-lg font-semibold">{soltos.length} itens pedindo revisão</h3>
                <p className="mt-1 text-xs leading-5 text-texto-suave">
                  O House já tenta assimilar sozinho nomes, plurais, aliases e variações do fornecedor. Aqui ficam só os casos sem correspondência segura. Itens realmente novos que já trazem unidade podem ser criados de uma vez.
                </p>
                {novosComUnidade.length > 0 && (
                  <button
                    onClick={assimilarNovosSeguros}
                    className="mt-3 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-700"
                  >
                    Assimilar automaticamente {novosComUnidade.length} item{novosComUnidade.length === 1 ? '' : 'ns'} com unidade confirmada
                  </button>
                )}
              </div>
'''
replace_once(aba_cot, old_soltos_header, new_soltos_header)

# 3) Planner: remover obrigação de 3–4 frangos e buscar variedade real.
planner = 'src/lib/cardapio/planejador-multiobjetivo.ts'
old_viavel = '''function viavelAposAdicionar(cont: Record<Proteina, number>, faltam: number): boolean {
  if (cont.frango > 4 || cont.bovina > 3 || cont.suina > 2) return false;
  const precisaFrango = Math.max(0, 3 - cont.frango);
  const precisaBovina = Math.max(0, 2 - cont.bovina);
  return precisaFrango + precisaBovina <= faltam;
}
'''
new_viavel = '''function viavelAposAdicionar(cont: Record<Proteina, number>): boolean {
  // Nenhuma proteína deve dominar a semana. Três é apenas teto de fallback;
  // a seleção final tenta primeiro no máximo duas ocorrências por proteína.
  return cont.frango <= 3
    && cont.bovina <= 3
    && cont.suina <= 3
    && cont.peixe <= 3
    && cont.ovo <= 3;
}
'''
replace_once(planner, old_viavel, new_viavel)
replace_once(planner, '''        const faltam = 6 - dia;
        if (!viavelAposAdicionar(contagem, faltam)) continue;
''', '''        if (!viavelAposAdicionar(contagem)) continue;
''')
replace_once(planner, '''        const diversidade = !estado.tecnicas.has(sinal.tecnica) ? 5 : tecnicaQtd > 2 ? -10 : -2;
        const bonusProteinaNova = estado.contagem[sinal.proteina] === 0 ? 3 : 0;

        proximos.push({
          pratos: [...estado.pratos, sinal.nome],
          score: estado.score + scorePrato(sinal, modo, pessoas[dia], mediaPessoas, diasBase[dia]?.principal ?? '') + diversidade + bonusProteinaNova,
''', '''        const diversidade = !estado.tecnicas.has(sinal.tecnica) ? 5 : tecnicaQtd > 2 ? -10 : -2;
        const repeticoesProteina = estado.contagem[sinal.proteina];
        const bonusProteinaNova = repeticoesProteina === 0 ? 9 : 0;
        const penalidadeProteina = sinal.proteina === 'outros' ? 0 : repeticoesProteina * 9;

        proximos.push({
          pratos: [...estado.pratos, sinal.nome],
          score: estado.score + scorePrato(sinal, modo, pessoas[dia], mediaPessoas, diasBase[dia]?.principal ?? '') + diversidade + bonusProteinaNova - penalidadeProteina,
''')
replace_once(planner, '''  const final = feixe.find((e) => e.contagem.frango >= 3 && e.contagem.frango <= 4 && e.contagem.bovina >= 2 && e.contagem.bovina <= 3 && e.contagem.suina <= 2);
  return final?.pratos ?? null;
''', '''  const categorias = (e: EstadoBusca) => Object.values(e.contagem).filter((n) => n > 0).length;
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
''')

# 4) História da casa: confluir histórico legado com contagem operacional atual.
refeicoes = 'src/lib/cardapio/refeicoes.ts'
replace_once(refeicoes, '''function getDados(): Raw {
  return { ...(HISTORICO as unknown as Raw), ...getLocal() };
}
''', '''function getContagensOperacionais(): Raw {
  if (typeof window === 'undefined') return {};
  try {
    const lista = JSON.parse(localStorage.getItem('cardapio.v1.contagemRefeicoes') ?? '[]') as Array<{
      data?: string;
      almoco?: number;
      jantar?: number;
    }>;
    if (!Array.isArray(lista)) return {};
    const out: Raw = {};
    for (const r of lista) {
      if (!r?.data) continue;
      const almoco = Number(r.almoco ?? 0);
      const jantar = Number(r.jantar ?? 0);
      if (!Number.isFinite(almoco) || !Number.isFinite(jantar) || almoco + jantar <= 0) continue;
      out[r.data] = [almoco, jantar, almoco + jantar];
    }
    return out;
  } catch {
    return {};
  }
}

function getDados(): Raw {
  // Ordem de autoridade: seed histórico < legado local < operação atual.
  // Assim uma contagem registrada hoje no fluxo oficial substitui a fotografia antiga.
  return { ...(HISTORICO as unknown as Raw), ...getLocal(), ...getContagensOperacionais() };
}
''')

linha_tempo = 'src/components/cardapio/LinhaTempoCasa.tsx'
replace_once(linha_tempo, "import { linhaDoTempoCasa } from '@/lib/cardapio/refeicoes';\n", "import { linhaDoTempoCasa } from '@/lib/cardapio/refeicoes';\nimport { useContagemRefeicoes } from '@/lib/cardapio/estado';\n")
replace_once(linha_tempo, '''export function LinhaTempoCasa() {
  const lt = useMemo(() => linhaDoTempoCasa(), []);
  if (!lt || lt.capitulos.length === 0) return null;
''', '''export function LinhaTempoCasa() {
  const { contagens } = useContagemRefeicoes();
  const lt = useMemo(() => linhaDoTempoCasa(), [contagens]);
  if (!lt || lt.capitulos.length === 0) return null;
''')
replace_once(linha_tempo, '''          desde {lt.inicio} · {lt.totalDias} dias de operação registrados
''', '''          desde {lt.inicio} · {lt.totalDias} dias de operação registrados · histórico + operação atual
''')

# 5) Gastos: trocar zero "morto" por verdade financeira viva + proveniência.
aba_gastos = r''' 'use client';

import { useMemo } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import { converterParaUnidadeBase, formatarReais, linhasDoDia } from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import {
  useGastos,
  serieMensal,
  topItens as calcularTopItens,
  mesCorrente,
  ULTIMO_MES_PLANILHA,
} from '@/lib/cardapio/gastos';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function rotuloMes(mes: string, curto = false): string {
  const [ano, m] = mes.split('-');
  const nome = MES_NOME[Number(m) - 1] ?? mes;
  return curto ? nome : `${nome}/${ano.slice(2)}`;
}

export function AbaGastos({
  estado,
  semanaId,
  precos,
  fatores,
}: {
  estado: EstadoSemana;
  semanaId: string;
  precos: Record<string, number>;
  fatores?: Record<string, number>;
}) {
  const { lancamentos } = useGastos();
  const { estimativas } = useEstimativas();

  const serie = serieMensal(lancamentos);
  const top = calcularTopItens(lancamentos);
  const maxItem = top[0]?.t ?? 1;
  const maxMes = Math.max(...serie.map((m) => m.total), 1);
  const totalGeral = serie.reduce((s, m) => s + m.total, 0);
  const media = totalGeral / Math.max(1, serie.length);

  const mesAtual = mesCorrente();
  const lancamentosMes = lancamentos.filter((l) => l.data.startsWith(mesAtual));
  const nfsMes = lancamentosMes.filter((l) => l.origem === 'nf');
  const manuaisMes = lancamentosMes.filter((l) => l.origem === 'manual');
  const totalNfMes = nfsMes.reduce((s, l) => s + l.total, 0);
  const totalManualMes = manuaisMes.reduce((s, l) => s + l.total, 0);
  const mesesVivos = serie.filter((m) => m.fonte === 'app').length;

  const operacaoSemana = useMemo(() => {
    let planejado = 0;
    let comprasComPrecoPago = 0;
    let comprasComEstimativa = 0;
    let itensComprados = 0;
    let itensComPrecoPago = 0;

    for (let di = 0; di < 7; di += 1) {
      for (const linha of linhasDoDia(estado, di, fatores)) {
        const resolvido = resolverPreco(linha.chave, precos, estimativas);
        if (resolvido.valor > 0) {
          planejado += resolvido.valor * converterParaUnidadeBase(linha.qtd, linha.unid);
        }
        if (!linha.status.compradoEm) continue;
        itensComprados += 1;
        const qtd = linha.status.compradoQtd ?? linha.qtd;
        const qtdBase = converterParaUnidadeBase(qtd, linha.unid);
        if ((linha.status.precoPago ?? 0) > 0) {
          comprasComPrecoPago += linha.status.precoPago! * qtdBase;
          itensComPrecoPago += 1;
        } else if (resolvido.valor > 0) {
          comprasComEstimativa += resolvido.valor * qtdBase;
        }
      }
    }

    const comprasRegistradas = comprasComPrecoPago + comprasComEstimativa;
    const coberturaPrecoReal = itensComprados > 0 ? itensComPrecoPago / itensComprados : 0;
    return { planejado, comprasRegistradas, comprasComPrecoPago, comprasComEstimativa, itensComprados, itensComPrecoPago, coberturaPrecoReal };
  }, [estado, fatores, precos, estimativas, semanaId]);

  const ultimaAtualizacao = useMemo(() => {
    const marcas = [
      ...lancamentos.map((l) => l.em),
      ...Object.values(estado.status).map((s) => s.compradoEm).filter((v): v is string => !!v),
    ].filter(Boolean).sort();
    const iso = marcas[marcas.length - 1];
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [lancamentos, estado.status]);

  return (
    <div className="space-y-4">
      <Cartao className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Financeiro vivo · {rotuloMes(mesAtual)}</p>
            <p className="font-display text-3xl font-bold leading-tight tabular-nums">{formatarReais(totalNfMes)}</p>
            <p className="mt-1 text-xs font-semibold text-carvao-600 dark:text-areia-200">NF comprovadas no mês</p>
          </div>
          <Pilula tom={totalNfMes > 0 ? 'verde' : 'ouro'}>{totalNfMes > 0 ? `${nfsMes.length} NF` : 'mês em formação'}</Pilula>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-carvao-50 p-3 dark:bg-carvao-800/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Compras registradas · semana</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatarReais(operacaoSemana.comprasRegistradas)}</p>
            <p className="text-[10px] text-texto-suave">{operacaoSemana.itensComprados} itens · {Math.round(operacaoSemana.coberturaPrecoReal * 100)}% com preço pago</p>
          </div>
          <div className="rounded-2xl bg-carvao-50 p-3 dark:bg-carvao-800/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Planejado · semana</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatarReais(operacaoSemana.planejado)}</p>
            <p className="text-[10px] text-texto-suave">custo calculado com a melhor evidência disponível</p>
          </div>
        </div>
        <p className="text-[11px] leading-5 text-texto-suave">
          {totalNfMes === 0 && operacaoSemana.itensComprados > 0
            ? 'Há operação de compra nesta semana, mas nenhuma NF comprovada no mês ainda. O painel não transforma ausência de NF em ausência de gasto.'
            : totalNfMes === 0
              ? 'Ainda não há NF comprovada neste mês. Valores operacionais aparecem assim que compras/preços forem registrados.'
              : `Comprovado por ${nfsMes.length} NF(s) neste mês${totalManualMes > 0 ? ` · ${formatarReais(totalManualMes)} em lançamentos manuais separados` : ''}.`}
          {ultimaAtualizacao ? ` · Última atualização ${ultimaAtualizacao}.` : ''}
        </p>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { r: 'NF comprovada', v: formatarReais(totalNfMes), sub: `${nfsMes.length} no mês` },
          { r: 'Preço pago', v: formatarReais(operacaoSemana.comprasComPrecoPago), sub: `${operacaoSemana.itensComPrecoPago}/${operacaoSemana.itensComprados} compras` },
          { r: 'Estimado na compra', v: formatarReais(operacaoSemana.comprasComEstimativa), sub: 'onde falta preço pago' },
          { r: 'Histórico acumulado', v: formatarReais(totalGeral), sub: `${serie.length} meses` },
        ].map((k) => (
          <Cartao key={k.r} className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">{k.r}</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums leading-tight">{k.v}</p>
            <p className="text-caption text-texto-suave">{k.sub}</p>
          </Cartao>
        ))}
      </div>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">Evolução mensal</p>
          <Pilula tom="ouro">histórico + app</Pilula>
        </div>
        <div className="space-y-2">
          {serie.map((m, idx) => {
            const pct = (m.total / maxMes) * 100;
            const isMaior = m.total === maxMes;
            const anterior = serie[idx - 1];
            const variacao = anterior && anterior.total > 0 ? ((m.total - anterior.total) / anterior.total) * 100 : null;
            return (
              <div key={m.mes} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-[11px] font-bold text-texto-suave">{rotuloMes(m.mes, true)}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 22 }}>
                  <div className={`h-full rounded-full transition-all ${isMaior ? 'bg-ouro-400' : m.fonte === 'app' ? 'bg-brand-600' : 'bg-brand-400 dark:bg-brand-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs font-bold tabular-nums">
                  {formatarReais(m.total)}
                  {variacao !== null && <span className={`ml-1 text-[10px] font-normal ${variacao > 0 ? 'text-perigo' : 'text-brand-600'}`}>{variacao > 0 ? '▲' : '▼'}{Math.abs(Math.round(variacao))}%</span>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-texto-suave">
          Verde forte = mês com dados do app. Verde claro = planilha histórica até {rotuloMes(ULTIMO_MES_PLANILHA)}. Histórico é contexto; o bloco acima mostra a operação atual e sua cobertura.
        </p>
      </Cartao>

      {top.length > 0 && (
        <Cartao className="space-y-3">
          <p className="text-sm font-bold">Itens que mais pesam no histórico financeiro</p>
          <div className="space-y-2">
            {top.map((item, idx) => {
              const pct = (item.t / maxItem) * 100;
              return (
                <div key={item.n} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-right text-[10px] text-texto-suave">{idx + 1}</span>
                  <span className="w-32 shrink-0 truncate text-xs font-semibold capitalize">{item.n}</span>
                  <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 16 }}>
                    <div className="h-full rounded-full bg-brand-300 dark:bg-brand-600" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums">{formatarReais(item.t)}</span>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      {lancamentosMes.length > 0 && (
        <Cartao className="space-y-2">
          <p className="text-sm font-bold">Lançamentos deste mês</p>
          {lancamentosMes.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-carvao-100 pb-1.5 last:border-0 dark:border-carvao-700/50">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{l.fornecedor}</p>
                <p className="text-[10px] text-texto-suave">{l.data.split('-').reverse().join('/')} · {l.origem === 'nf' ? 'NF comprovada' : 'manual'} · {l.itens.length} item(ns)</p>
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums">{formatarReais(l.total)}</span>
            </div>
          ))}
        </Cartao>
      )}

      {mesesVivos === 0 && (
        <p className="px-1 text-[11px] leading-5 text-texto-suave">O histórico anterior continua disponível, mas ainda não há mês fechado pelo app. Isso não bloqueia a leitura operacional da semana acima.</p>
      )}
    </div>
  );
}
'''.lstrip()
write('src/components/cardapio/AbaGastos.tsx', aba_gastos)

# Propaga estado vivo para Gastos sem criar uma segunda fonte de verdade.
page = 'src/app/page.tsx'
replace_once(page, "                {abaRelatorios === 'gastos' && <AbaGastos />}\n", "                {abaRelatorios === 'gastos' && (\n                  <AbaGastos estado={estado} semanaId={semanaId} precos={precos} fatores={fatores} />\n                )}\n")

# 6) Testes de regressão.
test_cot = 'src/lib/cardapio/cotacao.test.ts'
s = read(test_cot)
s = s.replace("import { parsearCotacao, agruparCotacao, ehRemetenteInterno, bloquearRemetente } from './cotacao';", "import { parsearCotacao, agruparCotacao, ehRemetenteInterno, bloquearRemetente, sugerirItemCotacao } from './cotacao';")
s += r'''

describe('cotação — assimilação automática conservadora', () => {
  it('resolve plural simples sem pedir relacionamento manual', () => {
    const sugestao = sugerirItemCotacao('ABACAXIS');
    expect(sugestao.item?.toLowerCase()).toContain('abacaxi');
    expect(sugestao.confianca).toBeGreaterThanOrEqual(0.9);
  });

  it('usa itens extras já aprendidos mesmo com qualificadores do fornecedor', () => {
    const extras = { 'molho especial': { n: 'Molho especial', u: 'lt' } };
    const agrupado = agruparCotacao([
      { nome: 'Molho especial casa', preco: 19.9, marca: 'Fornecedor X', unid: 'lt', item: null },
    ], extras);
    expect(agrupado.soltos).toHaveLength(0);
    expect(agrupado.casados[0]?.item).toBe('Molho especial');
  });

  it('não força match quando a evidência lexical é fraca', () => {
    const sugestao = sugerirItemCotacao('Produto promocional código ZXQ');
    expect(sugestao.item).toBeNull();
  });
});
'''
write(test_cot, s)

planner_test = 'src/lib/cardapio/planejador-multiobjetivo.test.ts'
s = read(planner_test)
s = s.replace("import { normalizar } from './motor';", "import { normalizar, proteinaDoPrato } from './motor';")
needle = '''  it('expõe carga operacional normalizada e usa receita real quando disponível', () => {'''
insert = '''  it('não obriga frango a dominar a semana e preserva diversidade de proteína', () => {
    const cenarios = gerarCenariosMultiobjetivo(contexto());
    for (const cenario of cenarios) {
      const proteinas = cenario.dias.map((d) => proteinaDoPrato(d.principal));
      const frangos = proteinas.filter((p) => p === 'frango').length;
      const maiorConcentracao = Math.max(...Array.from(new Set(proteinas)).map((p) => proteinas.filter((x) => x === p).length));
      expect(frangos).toBeLessThanOrEqual(3);
      expect(maiorConcentracao).toBeLessThanOrEqual(3);
      for (let i = 1; i < proteinas.length; i += 1) {
        if (proteinas[i] !== 'outros') expect(proteinas[i]).not.toBe(proteinas[i - 1]);
      }
    }
  }, 15_000);

'''
if needle not in s:
    raise RuntimeError('Ponto de inserção do teste do planner não encontrado')
s = s.replace(needle, insert + needle, 1)
write(planner_test, s)

print('Confluência live patch aplicado.')
