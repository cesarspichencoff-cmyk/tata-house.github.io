'use client';

import { useMemo, useState } from 'react';
import { Botao, Cartao, Pilula, Stepper, Disclosure } from '@/components/ui';
import { Icone } from '@/components/Icones';
import {
  DADOS,
  DIAS_SEMANA,
  PESSOAS_PADRAO,
  proteinaDoPrato,
  ROTULO_PROTEINA,
  sugerirSemana,
  sugerirSemanaCriativa,
  sugerirSemanaHistorica,
  temHistoricoExato,
  validarSemana,
  listaDoDia,
  linhasDoDia,
  fonteIngredientes,
  formatarReais,
  normalizar,
} from '@/lib/cardapio/motor';
import { custoTipado, resolverPreco } from '@/lib/cardapio/precos';
import { RECEITAS_POR_CATEGORIA, GUARNICOES_FIXAS } from '@/lib/cardapio/receitas';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { useAceitacao, semanasComConteudo, lerSemana, useMostrarBasicos } from '@/lib/cardapio/estado';
import type { Aceitacao, DiaCardapio, EstadoSemana, Proteina } from '@/lib/cardapio/tipos';
import { SeletorPrato } from './SeletorPrato';
import { OperacaoDia } from './OperacaoDia';
import { PrevisaoPresenca } from './PrevisaoPresenca';
import { ComoFazer } from './ComoFazer';
import { HistoricoSemana } from './HistoricoSemana';
import { custoDaSemana } from '@/lib/cardapio/custo-semana';
import { NutricaoPrato } from './NutricaoPrato';
import { AntiMonotonia } from './AntiMonotonia';
import { TermometroAlmoco } from './TermometroAlmoco';
import { IndicadorNutricional } from './IndicadorNutricional';
import { AbaPrecos } from './AbaPrecos';
import { AbaCotacao } from './AbaCotacao';

/** Mescla receitas da biblioteca com histórico do dados.json, sem duplicatas. */
function mesclarOpcoes(receitas: string[], historico: string[]): string[] {
  const vistos = new Set(receitas.map(normalizar));
  return [...receitas, ...historico.filter((o) => !vistos.has(normalizar(o)))];
}

const OPC_PRINCIPAIS = mesclarOpcoes(RECEITAS_POR_CATEGORIA.principal, DADOS.listas.principais);
const OPC_GUARNICOES = mesclarOpcoes(RECEITAS_POR_CATEGORIA.guarnicao, DADOS.listas.guarnicoes);
const OPC_SALADAS = mesclarOpcoes(RECEITAS_POR_CATEGORIA.salada, DADOS.listas.saladas);
const OPC_SOBREMESAS = mesclarOpcoes(RECEITAS_POR_CATEGORIA.sobremesa, DADOS.listas.sobremesas);

const COR_PROTEINA: Record<string, string> = {
  bovina: 'bg-bovina/10 text-bovina ring-bovina/25 dark:text-bovina-claro',
  frango: 'bg-frango/10 text-frango-escuro ring-frango/25 dark:text-frango-claro',
  suina: 'bg-suina/10 text-suina-escuro ring-suina/25 dark:text-suina-claro',
  peixe: 'bg-peixe/10 text-peixe ring-peixe/25 dark:text-peixe-claro',
  ovo: 'bg-ouro-400/10 text-ouro-600 ring-ouro-400/25 dark:text-ouro-300',
  outros: 'bg-carvao-400/10 text-carvao-500 ring-carvao-400/25 dark:text-carvao-300',
};

/** Cor sólida do acento lateral por proteína. */
const ACENTO_PROTEINA: Record<Proteina, string> = {
  bovina: '#8a3b34',
  frango: '#b07c1e',
  suina: '#b05a7e',
  peixe: '#2d6f8e',
  ovo: '#c8a96b',
  outros: '#aab0b9',
};

function BadgeProteina({ prato }: { prato: string }) {
  if (!prato) return null;
  const p = proteinaDoPrato(prato);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide ring-1 ${COR_PROTEINA[p]}`}
    >
      {ROTULO_PROTEINA[p]}
    </span>
  );
}

function PratoIntel({
  prato,
  aceitacao,
  frequencia,
  custo,
  pessoas,
}: {
  prato: string;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
  custo: { total: number; itensSemPreco: number; itensEstimados: number };
  pessoas: number;
}) {
  const norm = normalizar(prato);
  const av = aceitacao[norm];
  const nota = av && av.n >= 2 ? av.somaNotas / av.n : null;
  const freq = frequencia[norm] ?? 0;
  const custoPessoa = custo.total > 0 && pessoas > 0 ? custo.total / pessoas : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-rotulo">
      {nota !== null ? (
        <span className={nota >= 4 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : nota >= 3 ? 'font-semibold text-ouro-600 dark:text-ouro-300' : 'font-semibold text-perigo'}>
          {nota.toFixed(1)}★{' '}
          <span className="font-normal text-texto-suave">({av!.n})</span>
        </span>
      ) : (
        <span className="text-texto-suave">sem avaliações</span>
      )}
      {freq >= 2 && (
        <span className={freq >= 3 ? 'text-ouro-600 dark:text-ouro-300' : 'text-texto-suave'}>
          {freq}× recente
        </span>
      )}
      {custo.itensSemPreco > 0 ? (
        <span className="font-semibold text-perigo">preço incompleto</span>
      ) : custo.itensEstimados > 0 && custoPessoa ? (
        <span className="text-ouro-600 dark:text-ouro-300">≈ {formatarReais(custoPessoa)}/pessoa</span>
      ) : custoPessoa ? (
        <span className="text-carvao-500 dark:text-areia-400">{formatarReais(custoPessoa)}/pessoa</span>
      ) : null}
    </div>
  );
}

export function AbaCardapio({
  estado,
  atualizar,
  semanaId,
  fatores,
  podeEditar,
  precos,
  definirPreco,
  definirFornecedor,
  cadastrarItem,
  registrarOferta,
  fornecedores = {},
  itensExtras = {},
}: {
  estado: EstadoSemana;
  atualizar: (fn: (e: EstadoSemana) => EstadoSemana) => void;
  semanaId: string;
  fatores?: Record<string, number>;
  podeEditar: boolean;
  precos: Record<string, number>;
  definirPreco?: (itemNorm: string, valor: number | null, nome?: string) => void;
  definirFornecedor?: (itemNorm: string, marca: string | null) => void;
  cadastrarItem?: (norm: string, nome: string, unid: string) => void;
  registrarOferta?: (itemNorm: string, fornecedor: string, preco: number) => void;
  fornecedores?: Record<string, string>;
  itensExtras?: Record<string, { n: string; u: string }>;
}) {
  const { estimativas, gerarEstimativas } = useEstimativas();
  // MESMA preferência da lista de compras — se os conjuntos de itens
  // divergirem, os custos das duas telas voltam a discordar.
  const { mostrarBasicos } = useMostrarBasicos();
  const { aceitacao } = useAceitacao();
  const [opDia, setOpDia] = useState(false);
  const [gerarAberto, setGerarAberto] = useState(false);
  const [formPersonAberto, setFormPersonAberto] = useState(false);
  const [explicacao, setExplicacao] = useState<{ titulo: string; itens: string[] } | null>(null);
  const [cotacaoAberta, setCotacaoAberta] = useState(false);
  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [personalizado, setPersonalizado] = useState({
    eventos: '',
    proteinasPrefer: [] as string[],
    proteinasEvitar: [] as string[],
    publico: '',
    limCusto: '',
    restricoes: '',
    regras: '',
  });
  const avisos = validarSemana(estado.dias, precos);
  const temPrecos = Object.keys(precos).length > 0;

  // Frequência de uso dos pratos nas últimas 4 semanas — alimenta a IA para
  // evitar repetir na geração automática (anti-monotonia entre semanas).
  const frequencia = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const sid of semanasComConteudo().slice(-4)) {
      lerSemana(sid).dias.forEach((d) => {
        if (d.principal) {
          const k = normalizar(d.principal);
          cont[k] = (cont[k] ?? 0) + 1;
        }
      });
    }
    return cont;
  }, []);

  const setDia = (i: number, patch: Partial<DiaCardapio>) =>
    atualizar((e) => ({
      ...e,
      dias: e.dias.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    }));

  const temAceitacao = Object.keys(aceitacao).length > 0;
  const temFrequencia = Object.keys(frequencia).length > 0;

  const gerar = (modo: 'historica' | 'economica' | 'criativa') => {
    const fn =
      modo === 'historica' ? sugerirSemanaHistorica
      : modo === 'criativa' ? sugerirSemanaCriativa
      : sugerirSemana;
    const sugestao = fn(
      estado.dias.map((d) => d.pessoas),
      precos,
      { aceitacao, frequencia },
    );
    if (!sugestao) {
      setExplicacao({ titulo: 'Não foi possível gerar', itens: ['Faltam dados de histórico ou preços para esse modo. Tente outro modo ou complete a cotação.'] });
      return;
    }
    atualizar((e) => ({ ...e, dias: sugestao }));
    // Por que esse cardápio? — transparência da decisão
    const porques: Record<typeof modo, { titulo: string; itens: string[] }> = {
      historica: {
        titulo: 'Base histórica — critérios usados',
        itens: [
          'Priorizei combinações que já apareceram no histórico da operação.',
          temAceitacao ? 'Dei preferência aos pratos com melhor aceitação registrada.' : 'Ainda não há notas de aceitação — usei a frequência de uso.',
          'Mantive a rotação de proteínas dentro das regras da casa (frango 3–4, bovina 2–3, suína ≤2).',
        ],
      },
      economica: {
        titulo: 'Equilíbrio — critérios usados',
        itens: [
          'Equilibrei pratos tradicionais com variações para evitar monotonia.',
          temFrequencia ? 'Evitei repetir o que saiu nas últimas 4 semanas.' : 'Sem semanas anteriores para comparar — foquei na variedade interna.',
          Object.keys(precos).length > 0 ? 'Com a cotação aplicada, busquei o melhor custo dentro das opções aceitas.' : 'Sem cotação: aplique os preços para eu otimizar custo.',
        ],
      },
      criativa: {
        titulo: 'Exploração — critérios usados',
        itens: [
          'Explorei combinações inéditas mantendo a distribuição de proteínas da casa.',
          Object.keys(precos).length > 0 ? 'Puxei para as proteínas mais baratas da cotação atual.' : 'Aplique a cotação para eu priorizar as proteínas mais econômicas.',
          'Respeitei as regras de rotação para não estourar nenhuma proteína.',
        ],
      },
    };
    setExplicacao(porques[modo]);
  };

  const gerarPersonalizado = () => {
    const lim = parseFloat(personalizado.limCusto.replace(',', '.'));
    if (!isNaN(lim) && lim > 0) atualizar((e) => ({ ...e, orcamento: lim }));
    const sugestao = sugerirSemanaCriativa(
      estado.dias.map((d) => d.pessoas),
      precos,
      { aceitacao, frequencia, criativo: true },
    );
    if (sugestao) atualizar((e) => ({ ...e, dias: sugestao }));
    // Monta a explicação a partir dos parâmetros informados
    const itens: string[] = [];
    if (personalizado.proteinasPrefer.length) itens.push(`Priorizei as proteínas: ${personalizado.proteinasPrefer.join(', ')}.`);
    if (personalizado.proteinasEvitar.length) itens.push(`Evitei as proteínas: ${personalizado.proteinasEvitar.join(', ')}.`);
    if (personalizado.publico) itens.push(`Ajustei o perfil dos pratos para o público ${personalizado.publico}.`);
    if (!isNaN(lim) && lim > 0) itens.push(`Defini o orçamento em R$ ${lim.toFixed(2)} por refeição.`);
    if (personalizado.eventos.trim()) itens.push(`Considerei o evento: "${personalizado.eventos.trim()}".`);
    if (personalizado.restricoes.trim()) itens.push(`Levei em conta as restrições: ${personalizado.restricoes.trim()}.`);
    if (personalizado.regras.trim()) itens.push(`Apliquei as regras: ${personalizado.regras.trim()}.`);
    if (itens.length === 0) itens.push('Nenhum parâmetro específico — gerei um cardápio criativo dentro das regras da casa.');
    itens.push('Revise os dias abaixo: ajuste manualmente o que não fizer sentido para a sua operação.');
    setExplicacao({ titulo: 'Personalizado — critérios usados', itens });
    setGerarAberto(false);
    setFormPersonAberto(false);
  };

  const toggleProtein = (lista: 'proteinasPrefer' | 'proteinasEvitar', p: string) =>
    setPersonalizado((prev) => {
      const cur = prev[lista];
      return { ...prev, [lista]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] };
    });

  // FONTE ÚNICA de custo (custo-semana.ts): as MESMAS quantidades da lista
  // de compras — com ajustes da cozinha, itens removidos, itens manuais e
  // fatores de aprendizado — e o preço resolvido em todas as camadas.
  // Antes esta tela somava a lista BASE, então mostrava o custo de uma
  // lista que ninguém ia comprar.
  const custoSemana = custoDaSemana(estado, precos, estimativas, { fatores, mostrarBasicos });

  // medidor de regras (rotação de proteínas)
  const prots = estado.dias.map((d) => (d.principal ? proteinaDoPrato(d.principal) : null));
  const frango = prots.filter((p) => p === 'frango').length;
  const bovina = prots.filter((p) => p === 'bovina').length;
  const suina = prots.filter((p) => p === 'suina').length;
  const diasMontados = prots.filter(Boolean).length;
  const erros = avisos.filter((a) => a.nivel === 'erro').length;
  const alertas = avisos.filter((a) => a.nivel === 'alerta').length;

  const totalPessoas = custoSemana.totalPessoas;
  const custoRef = custoSemana.porRefeicao;
  const dentroOrcamento = estado.orcamento ? custoSemana.total <= estado.orcamento : null;

  // classifica os itens da semana por tipo de preço: real / estimado / sem
  const { semPreco, qtdEstimados, normsSemana } = (() => {
    const sem = new Map<string, { item: string; unid: string }>();
    const est = new Set<string>();
    const todos = new Set<string>();
    estado.dias.forEach((d, di) => {
      if (!d.principal) return;
      // Mesma base do custo (custo-semana.ts): quantidades reais, com
      // ajustes/manuais/fatores — senão a lista de "sem preço" descreveria
      // um conjunto de itens diferente do que foi somado.
      linhasDoDia(estado, di, fatores, { mostrarBasicos }).forEach((l) => {
        const norm = normalizar(l.item);
        todos.add(norm);
        const tipo = resolverPreco(norm, precos, estimativas).tipo;
        if (tipo === 'sem') sem.set(norm, { item: l.item, unid: l.unid });
        else if (tipo === 'historico' || tipo === 'estimado') est.add(norm);
      });
    });
    return { semPreco: Array.from(sem.entries()), qtdEstimados: est.size, normsSemana: Array.from(todos) };
  })();

  return (
    <div className="space-y-4">
      <OperacaoDia aberto={opDia} aoFechar={() => setOpDia(false)} estado={estado} atualizar={atualizar} />

      {/* Atalho operacional: útil, mas subordinado ao planejamento desta tela. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-carvao-200 bg-white px-4 py-3 dark:border-carvao-700 dark:bg-carvao-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-micro font-bold uppercase tracking-[0.14em] text-texto-suave">Atalho operacional</p>
          <p className="mt-1 text-sm font-semibold text-carvao-800 dark:text-areia-100">Produção, recebimento e compras de hoje.</p>
        </div>
        <button
          onClick={() => setOpDia(true)}
          className="shrink-0 rounded-xl bg-carvao-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-carvao-700 dark:bg-areia-100 dark:text-carvao-900 dark:hover:bg-white"
        >
          Abrir operação do dia
        </button>
      </div>

      {/* Resumo vivo — acompanha a rolagem dos dias */}
      <div className="sticky top-[60px] z-30 -mx-4 bg-areia-50/85 px-4 py-2 backdrop-blur-md dark:bg-carvao-950/85">
        <Cartao className="!p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-micro font-semibold uppercase tracking-wider text-texto-suave">Custo / refeição</p>
                <p className="font-display text-2xl font-bold leading-none tabular-nums text-carvao-900 dark:text-areia-50">
                  {custoRef ? formatarReais(custoRef) : '—'}
                </p>
              </div>
              {custoSemana.total > 0 && (
                <p className="text-xs font-semibold text-texto-suave">
                  semana {formatarReais(custoSemana.total)}
                  {dentroOrcamento !== null && (
                    <span className={dentroOrcamento ? 'text-brand-600' : 'font-bold text-perigo'}>
                      {' '}
                      · {dentroOrcamento ? 'no orçamento' : 'acima'}
                    </span>
                  )}
                </p>
              )}
            </div>
            {podeEditar && (
              <button
                onClick={() => { setGerarAberto((a) => !a); setFormPersonAberto(false); }}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-carvao-200 bg-white px-3 py-1.5 text-rotulo font-semibold text-carvao-600 transition hover:bg-areia-100 dark:border-carvao-600 dark:bg-carvao-800 dark:text-areia-200"
              >
                <Icone nome="controles" tam={14} /> Criar sugestão
              </button>
            )}
          </div>
          {/* medidor de regras */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Pilula tom={frango >= 3 && frango <= 4 ? 'verde' : frango > 4 ? 'vermelho' : 'ouro'}>Frango {frango}/4</Pilula>
            <Pilula tom={bovina >= 2 && bovina <= 3 ? 'verde' : bovina > 3 ? 'vermelho' : 'ouro'}>Bovina {bovina}/3</Pilula>
            <Pilula tom={suina <= 2 ? 'verde' : 'vermelho'}>Suína {suina}/2</Pilula>
            {diasMontados > 0 &&
              (semPreco.length > 0 ? (
                <Pilula tom="vermelho">{semPreco.length} sem preço</Pilula>
              ) : qtdEstimados > 0 ? (
                <Pilula tom="ouro">{qtdEstimados} estimado(s)</Pilula>
              ) : custoSemana.total > 0 ? (
                <Pilula tom="verde">✓ Preços ok</Pilula>
              ) : null)}
            {erros > 0 ? (
              <Pilula tom="vermelho">
                {erros} {erros === 1 ? 'erro' : 'erros'}
              </Pilula>
            ) : alertas > 0 ? (
              <Pilula tom="ouro">
                {alertas} {alertas === 1 ? 'alerta' : 'alertas'}
              </Pilula>
            ) : diasMontados === 7 ? (
              <Pilula tom="verde">✓ Regras ok</Pilula>
            ) : (
              <Pilula tom="neutro">{diasMontados}/7 dias</Pilula>
            )}
          </div>
        </Cartao>
      </div>

      {/* Painel de geração — 4 modos */}
      {podeEditar && gerarAberto && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900 dark:bg-carvao-900">
          <p className="mb-3 text-caption font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">Estratégia da sugestão</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              { id: 'historica', icone: 'calendario' as const, titulo: 'Base histórica', desc: 'Recupera combinações que já funcionaram' },
              { id: 'economica', icone: 'gerencial' as const,  titulo: 'Equilíbrio', desc: 'Combina histórico, variedade, aceitação e custo' },
              { id: 'criativa', icone: 'raio' as const,        titulo: 'Exploração', desc: 'Busca novidades sem romper as regras da casa' },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => { gerar(m.id); setGerarAberto(false); }}
                className="flex items-start gap-2.5 rounded-xl border border-carvao-200 bg-white p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:border-carvao-700 dark:bg-carvao-800"
              >
                <span className="mt-0.5 text-brand-600 dark:text-brand-300"><Icone nome={m.icone} tam={20} /></span>
                <div>
                  <p className="text-sm font-bold text-carvao-800 dark:text-areia-100">{m.titulo}</p>
                  <p className="text-caption text-carvao-500 dark:text-texto-suave">{m.desc}</p>
                </div>
              </button>
            ))}
            {/* Personalizado — expande formulário */}
            <button
              onClick={() => setFormPersonAberto((a) => !a)}
              className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${
                formPersonAberto
                  ? 'border-brand-400 bg-brand-100 dark:border-brand-500 dark:bg-brand-950/60'
                  : 'border-brand-300 bg-brand-50 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/30'
              }`}
            >
              <span className="mt-0.5 leading-none text-brand-600 dark:text-brand-300"><Icone nome="controles" tam={20} /></span>
              <div>
                <p className="text-sm font-bold text-brand-800 dark:text-brand-200">Personalizado</p>
                <p className="text-caption text-brand-600 dark:text-brand-400">Aplique restrições, metas e preferências</p>
              </div>
            </button>
          </div>

          {/* Formulário personalizado */}
          {formPersonAberto && <div className="mt-4 space-y-3 border-t border-brand-200 pt-4 dark:border-brand-800">
            <p className="text-caption font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">Configurar geração personalizada</p>

            {/* Proteínas preferidas */}
            <div>
              <p className="mb-1 text-caption font-semibold text-carvao-500">Proteínas para priorizar</p>
              <div className="flex flex-wrap gap-1.5">
                {(['bovina', 'frango', 'suína', 'peixe', 'ovo'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => toggleProtein('proteinasPrefer', p)}
                    className={`rounded-full px-3 py-1 text-caption font-semibold transition ${
                      personalizado.proteinasPrefer.includes(p)
                        ? 'bg-brand-600 text-white'
                        : 'bg-carvao-100 text-carvao-600 hover:bg-carvao-200 dark:bg-carvao-700 dark:text-carvao-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Proteínas a evitar */}
            <div>
              <p className="mb-1 text-caption font-semibold text-carvao-500">Proteínas a evitar</p>
              <div className="flex flex-wrap gap-1.5">
                {(['bovina', 'frango', 'suína', 'peixe', 'ovo'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => toggleProtein('proteinasEvitar', p)}
                    className={`rounded-full px-3 py-1 text-caption font-semibold transition ${
                      personalizado.proteinasEvitar.includes(p)
                        ? 'bg-perigo text-white'
                        : 'bg-carvao-100 text-carvao-600 hover:bg-carvao-200 dark:bg-carvao-700 dark:text-carvao-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Público */}
              <div>
                <label className="mb-1 block text-caption font-semibold text-carvao-500">Público</label>
                <select
                  value={personalizado.publico}
                  onChange={(e) => setPersonalizado((p) => ({ ...p, publico: e.target.value }))}
                  className="w-full rounded-xl border border-carvao-200 bg-white px-2 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-800"
                >
                  <option value="">Geral</option>
                  <option value="executivo">Executivo</option>
                  <option value="operacional">Operacional</option>
                  <option value="misto">Misto</option>
                </select>
              </div>
              {/* Limite de custo */}
              <div>
                <label className="mb-1 block text-caption font-semibold text-carvao-500">Limite custo/refeição (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="ex: 18,50"
                  value={personalizado.limCusto}
                  onChange={(e) => setPersonalizado((p) => ({ ...p, limCusto: e.target.value }))}
                  className="w-full rounded-xl border border-carvao-200 bg-white px-2 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-800"
                />
              </div>
            </div>

            {/* Eventos */}
            <div>
              <label className="mb-1 block text-caption font-semibold text-carvao-500">Eventos / datas especiais</label>
              <input
                type="text"
                placeholder="ex: Festa de aniversário na sexta"
                value={personalizado.eventos}
                onChange={(e) => setPersonalizado((p) => ({ ...p, eventos: e.target.value }))}
                className="w-full rounded-xl border border-carvao-200 bg-white px-3 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-800"
              />
            </div>

            {/* Restrições */}
            <div>
              <label className="mb-1 block text-caption font-semibold text-carvao-500">Restrições alimentares do grupo</label>
              <input
                type="text"
                placeholder="ex: sem glúten, sem lactose"
                value={personalizado.restricoes}
                onChange={(e) => setPersonalizado((p) => ({ ...p, restricoes: e.target.value }))}
                className="w-full rounded-xl border border-carvao-200 bg-white px-3 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-800"
              />
            </div>

            {/* Regras livres */}
            <div>
              <label className="mb-1 block text-caption font-semibold text-carvao-500">Regras específicas (opcional)</label>
              <textarea
                rows={2}
                placeholder="ex: Evitar frituras na segunda; priorizar proteína vegetal às quintas"
                value={personalizado.regras}
                onChange={(e) => setPersonalizado((p) => ({ ...p, regras: e.target.value }))}
                className="w-full resize-none rounded-xl border border-carvao-200 bg-white px-3 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-800"
              />
            </div>

            <Botao variante="sucesso" className="w-full" onClick={gerarPersonalizado}>
              Criar sugestão personalizada
            </Botao>
          </div>}
        </div>
      )}

      {/* Por que este cardápio? — transparência da IA, sem caixa-preta */}
      {explicacao && (
        <div className="rounded-2xl border border-brand-200 bg-white p-4 shadow-suave dark:border-brand-900 dark:bg-carvao-900">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
              <span aria-hidden></span> {explicacao.titulo}
            </p>
            <button
              onClick={() => setExplicacao(null)}
              aria-label="Fechar explicação"
              className="shrink-0 text-texto-suave transition hover:text-carvao-700 dark:hover:text-areia-200"
            >
              <Icone nome="fechar" tam={15} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {explicacao.itens.map((it, i) => (
              <li key={i} className="flex gap-2 text-nota text-carvao-600 dark:text-areia-200">
                <span className="mt-0.5 text-brand-400">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detalhe das regras quebradas */}
      {avisos.some((a) => a.nivel !== 'ok') && (
        <Cartao className="space-y-1.5 !py-3">
          {avisos
            .filter((a) => a.nivel !== 'ok')
            .map((a, i) => (
              <p
                key={i}
                className={`flex items-start gap-2 text-sm font-medium ${
                  a.nivel === 'erro' ? 'text-perigo' : 'text-[#9a6c17] dark:text-[#e3b45c]'
                }`}
              >
                <span aria-hidden>{a.nivel === 'erro' ? '' : ''}</span>
                {a.msg}
              </p>
            ))}
        </Cartao>
      )}

      {/* Dias — protagonistas da tela */}
      <div className="grid gap-3 lg:grid-cols-2">
        {estado.dias.map((dia, i) => {
          const lista = dia.principal ? listaDoDia(dia) : [];
          const custo = custoTipado(
            lista.map((s) => ({ norm: normalizar(s.item), qtd: s.qtd, unid: s.unid })),
            precos,
            estimativas,
          );
          const prot = dia.principal ? proteinaDoPrato(dia.principal) : 'outros';
          const fonte = fonteIngredientes(dia);
          return (
            <Cartao key={i} className="space-y-2.5 overflow-hidden">
              <div
                className="-mx-5 -mt-5 h-1.5"
                style={{ background: dia.principal ? ACENTO_PROTEINA[prot] : 'transparent' }}
                aria-hidden
              />
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{DIAS_SEMANA[i]}</h3>
                <div className="flex items-center gap-1.5">
                  <Icone nome="usuario" tam={15} className="text-texto-suave" />
                  <Stepper
                    valor={dia.pessoas}
                    min={1}
                    passo={5}
                    aoMudar={(v) => podeEditar && setDia(i, { pessoas: v || PESSOAS_PADRAO[i] })}
                  />
                </div>
              </div>

              <SeletorPrato
                rotulo="Principal"
                valor={dia.principal}
                opcoes={OPC_PRINCIPAIS}
                aoEscolher={(v) => setDia(i, { principal: v })}
                desabilitado={!podeEditar}
                destaque={<BadgeProteina prato={dia.principal} />}
              />
              <div className="grid grid-cols-2 gap-2">
                <SeletorPrato
                  rotulo="Guarnição fixa"
                  valor={dia.guarnicaoFixa}
                  opcoes={GUARNICOES_FIXAS}
                  aoEscolher={(v) => setDia(i, { guarnicaoFixa: v })}
                  desabilitado={!podeEditar}
                />
                <SeletorPrato
                  rotulo="Guarnição"
                  valor={dia.guarnicao}
                  opcoes={OPC_GUARNICOES}
                  aoEscolher={(v) => setDia(i, { guarnicao: v })}
                  desabilitado={!podeEditar}
                />
                <SeletorPrato
                  rotulo="Salada"
                  valor={dia.salada}
                  opcoes={OPC_SALADAS}
                  aoEscolher={(v) => setDia(i, { salada: v })}
                  desabilitado={!podeEditar}
                />
                <SeletorPrato
                  rotulo="Sobremesa"
                  valor={dia.sobremesa}
                  opcoes={OPC_SOBREMESAS}
                  aoEscolher={(v) => setDia(i, { sobremesa: v })}
                  desabilitado={!podeEditar}
                />
              </div>

              {dia.principal && (
                <>
                  <PratoIntel
                    prato={dia.principal}
                    aceitacao={aceitacao}
                    frequencia={frequencia}
                    custo={custo}
                    pessoas={dia.pessoas}
                  />
                  {fonte === 'estimado' && (
                    <p className="rounded-xl bg-perigo/10 px-2.5 py-1.5 text-caption font-semibold text-perigo ring-1 ring-perigo/20">
                      Este prato não tem receita cadastrada — os ingredientes são um chute. Escolha um prato com
                      receita ou complete os itens na lista de compras.
                    </p>
                  )}
                  <div>
                    <ComoFazer prato={dia.principal} />
                  </div>
                  {/* Nutrição por prato — visão principal (item 1) */}
                  <NutricaoPrato dia={dia} />
                </>
              )}
            </Cartao>
          );
        })}
      </div>

      {/* Análise da semana — leitura de apoio, recolhida para os dias dominarem */}
      <Disclosure
        icone="insights"
        titulo="Análise da semana"
        subtitulo="Termômetro, monotonia, nutrição e previsão de presença"
        aberto={analiseAberta}
        aoAlternar={() => setAnaliseAberta((a) => !a)}
      >
        <TermometroAlmoco estado={estado} />
        <AntiMonotonia estado={estado} />
        <IndicadorNutricional dias={estado.dias} />
        <PrevisaoPresenca estado={estado} atualizar={atualizar} podeEditar={podeEditar} />
      </Disclosure>

      {/* Desfazer: volta a semana a uma versão anterior deste aparelho */}
      <HistoricoSemana
        semanaId={semanaId}
        estado={estado}
        podeEditar={podeEditar}
        aoRestaurar={(anterior) => atualizar(() => anterior)}
      />

      {/* Orçamento + itens sem preço */}
      <Cartao className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-caption font-bold uppercase tracking-wider text-texto-suave">
            Orçamento da semana (R$)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            disabled={!podeEditar}
            value={estado.orcamento ?? ''}
            placeholder="Informado pelo setor de compras"
            onChange={(e) => atualizar((s) => ({ ...s, orcamento: e.target.value ? Number(e.target.value) : null }))}
            className="w-full min-h-12 rounded-2xl border border-carvao-200 bg-white px-4 py-3 text-base tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
          />
        </label>
        {!temPrecos && (
          <p className="text-xs text-texto-suave">
            Cole a cotação da semana em <strong>Ajustes → Catálogo de preços</strong> ou edite item a item em{' '}
            <strong>Compras → Preços</strong> para ver o custo estimado e otimizar a sugestão.
          </p>
        )}
        {temPrecos && semPreco.length > 0 && (
          <div className="rounded-2xl bg-ouro-300/15 p-3 ring-1 ring-ouro-400/30">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-ouro-600">
                {semPreco.length} itens da semana ainda sem preço — complete para o custo cobrir tudo:
              </p>
              {podeEditar && (
                <Botao
                  variante="secundario"
                  className="!min-h-8 !px-3 !py-1 text-caption"
                  onClick={() => gerarEstimativas(normsSemana.map((n) => ({ norm: n })), precos)}
                >
                  <Icone nome="raio" tam={13} /> Estimar por mercado
                </Botao>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {semPreco.slice(0, 16).map(([norm, s]) => (
                <span
                  key={norm}
                  className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-caption font-semibold ring-1 ring-carvao-200 dark:bg-carvao-800 dark:ring-carvao-600"
                >
                  {s.item}
                  <span className="text-texto-suave">R$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v > 0) definirPreco?.(norm, v);
                    }}
                    className="w-14 rounded-md border border-carvao-200 bg-white px-1 py-0.5 text-right text-caption font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                  />
                  <span className="text-texto-suave">/{s.unid}</span>
                </span>
              ))}
              {semPreco.length > 16 && (
                <button
                  onClick={() => setCotacaoAberta(true)}
                  className="self-center text-caption font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                >
                  +{semPreco.length - 16} na cotação completa ↓
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-texto-suave">
          <strong>Antigo</strong>: combinações que a equipe já aprovou no histórico. <strong>Mesclado</strong>: equilibra
          tradição e variedade. <strong>Novo</strong>: inventa combinações inéditas e, com a cotação aplicada, puxa para as
          proteínas mais baratas. <strong>Personalizado</strong>: você define proteínas, público, custo, eventos e regras.
        </p>
      </Cartao>

      {/* Cotação completa — fonte única de preços (catálogo + histórico) */}
      {definirPreco && (
        <Disclosure
          icone="cotacao"
          titulo="Cotação — catálogo de preços"
          subtitulo="Preço, histórico e variação de cada item · fonte única da semana"
          aberto={cotacaoAberta}
          aoAlternar={() => setCotacaoAberta((a) => !a)}
        >
          {/* Colar cotação da semana (WhatsApp / arquivo) */}
          <AbaCotacao
            definirPreco={definirPreco}
            definirFornecedor={definirFornecedor}
            cadastrarItem={cadastrarItem}
            registrarOferta={registrarOferta}
            itensExtras={itensExtras}
          />
          {/* Catálogo item a item — histórico e variação */}
          <div className="border-t border-carvao-200 pt-4 dark:border-carvao-700">
            <AbaPrecos
              precos={precos}
              definirPreco={definirPreco}
              fornecedores={fornecedores}
              itensExtras={itensExtras}
            />
          </div>
        </Disclosure>
      )}
    </div>
  );
}
