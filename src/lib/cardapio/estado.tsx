'use client';

/* =====================================================================
   Estado do Cardápio da equipe — persistido em localStorage (protótipo).
   Cada semana é um documento independente; preços são globais.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { supabaseHabilitado, aguardarBootNuvem } from './supabase';
import { definirArmazenamentoLocalCheio } from './aviso-armazenamento';
import { gravarComRecuperacaoDeQuota } from './armazenamento-local-seguro';
import { registrarVersao } from './historico-semana';
import { linhasDoDia, normalizar, PESSOAS_PADRAO } from './motor';
import { PRECOS_COMPRAS } from './precos-compras';
import historicoPlanilhaJson from './historico-planilha.json';
import {
  fatorEfetivo,
  registrarRazao,
  registrarValor,
  valorEfetivo,
  ajustesRelevantes,
  type RegistroAprendizado,
  type AjusteAprendido,
} from './memoria';
import { calcularDna, freqBaseDosDados, TOTAL_DIAS_HISTORICO, type DnaAlimentar } from './dna';
import { ehRemetenteInterno } from './cotacao';
import {
  PERFIS_FORNECEDORES_SEED,
  MAPA_FORNECEDORES_SEED,
  PRECOS_COTACAO_SEED,
  FUNCIONARIOS_SEED,
} from './dados-seed';
import { montarDossie, type DossieIA } from './dossie';
import type {
  Aceitacao,
  AvaliacaoFornecedor,
  ChefFeedback,
  ContagemRefeicoesDia,
  Estoque,
  EventoDemanda,
  Funcionario,
  HistoricoPrecos,
  ItemEstoque,
  MovEstoque,
  EstadoSemana,
  Papel,
  PerfilFornecedor,
  RegistroAceitacao,
  RegistroAuditoria,
  RegistroDesperdicio,
} from './tipos';

const PREFIXO = 'cardapio.v1.';

export function semanaVazia(): EstadoSemana {
  // curva real aprendida com as contagens de refeições (quando existir)
  const medias = lerLocal<Record<number, RegistroAprendizado>>('mediaRefeicoes', {});
  return {
    versao: 1,
    orcamento: null,
    dias: PESSOAS_PADRAO.map((pessoas, i) => ({
      pessoas: valorEfetivo(medias[i]) ? Math.round(valorEfetivo(medias[i])!) : pessoas,
      principal: '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
  };
}

function lerLocal<T>(chave: string, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    const raw = localStorage.getItem(PREFIXO + chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave: string, valor: unknown) {
  try {
    const resultado = gravarComRecuperacaoDeQuota(
      localStorage,
      PREFIXO + chave,
      JSON.stringify(valor),
    );
    definirArmazenamentoLocalCheio(!resultado.ok);
  } catch {
    // Falha fora do fluxo normal de quota: mantém o aviso e nunca finge que salvou.
    definirArmazenamentoLocalCheio(true);
  }
}

/* =====================================================================
   Reatividade a mudanças externas (nuvem/outra aba). Quando o BootNuvem
   aplica um valor vindo do Supabase — ou outra aba do mesmo navegador grava
   no localStorage — os hooks re-leem a chave e atualizam o estado React,
   SEM recarregar a página. É o que torna a colaboração ao vivo fluida.
   ===================================================================== */

const EVENTO_CHAVE = 'tata:chave-externa';

/** Avisa os hooks que uma chave mudou por fora (chamado pelo BootNuvem). */
export function notificarChaveExterna(chave: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_CHAVE, { detail: { chave } }));
}

/** Público: roda um efeito quando a chave muda por fora (nuvem/outra aba).
   Útil para avisar o usuário ("atualizado em outro aparelho") sem mexer no
   estado — a reconciliação do valor já é feita pelos hooks de dados. */
export function useMudancaExterna(chave: string, aoMudar: () => void) {
  useReleituraExterna(chave, aoMudar);
}

/** Re-executa `recarregar` quando a `chave` muda por fora (nuvem/outra aba).
   O evento nativo `storage` só dispara em OUTRAS abas, então a aba que está
   editando nunca re-lê o próprio texto — o foco e o cursor ficam intactos. */
function useReleituraExterna(chave: string, recarregar: () => void) {
  useEffect(() => {
    const onExterno = (e: Event) => {
      const det = (e as CustomEvent<{ chave?: string }>).detail;
      if (det?.chave === chave) recarregar();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFIXO + chave) recarregar();
    };
    window.addEventListener(EVENTO_CHAVE, onExterno);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENTO_CHAVE, onExterno);
      window.removeEventListener('storage', onStorage);
    };
  }, [chave, recarregar]);
}

/* =====================================================================
   Auditoria global (Módulo 9) — qualquer parte do app registra ações
   relevantes aqui; a aba de Auditoria escuta via assinatura simples.
   ===================================================================== */

let cacheAuditoria: RegistroAuditoria[] | null = null;
const ouvintesAuditoria = new Set<() => void>();

function carregarAuditoria(): RegistroAuditoria[] {
  if (cacheAuditoria === null) cacheAuditoria = lerLocal<RegistroAuditoria[]>('auditoria', []);
  return cacheAuditoria;
}

/** Papel ativo no momento (mantido em sincronia por usePapel) p/ carimbar logs. */
let papelAtual: Papel = 'gestor';

export function registrarAuditoria(reg: Omit<RegistroAuditoria, 'em' | 'papel'> & { em?: string; papel?: Papel }) {
  const completo: RegistroAuditoria = {
    em: reg.em ?? new Date().toISOString(),
    papel: reg.papel ?? papelAtual,
    acao: reg.acao,
    alvo: reg.alvo,
    de: reg.de,
    para: reg.para,
    semana: reg.semana,
  };
  const lista = [completo, ...carregarAuditoria()].slice(0, 800);
  cacheAuditoria = lista;
  gravarLocal('auditoria', lista);
  ouvintesAuditoria.forEach((f) => f());
}

export function useAuditoria() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((x) => x + 1);
    ouvintesAuditoria.add(f);
    f(); // garante leitura no cliente
    return () => {
      ouvintesAuditoria.delete(f);
    };
  }, []);
  // mudança vinda da nuvem/outra aba: invalida o cache e re-renderiza
  const recarregar = useCallback(() => {
    cacheAuditoria = null;
    forcar((x) => x + 1);
  }, []);
  useReleituraExterna('auditoria', recarregar);
  const limpar = useCallback(() => {
    cacheAuditoria = [];
    gravarLocal('auditoria', []);
    ouvintesAuditoria.forEach((f) => f());
  }, []);
  return { registros: carregarAuditoria(), limpar };
}

function ddmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Período da semana: "09/06 a 15/06" (sempre segunda → domingo). */
export function periodoSemana(id: string): string {
  const datas = datasDaSemana(id);
  return `${ddmm(datas[0])} a ${ddmm(datas[6])}`;
}

/** Rótulo amigável: "Semana 1 · 09/06 a 15/06". */
export function rotuloSemana(id: string, numero?: number): string {
  const base = numero ? `Semana ${numero} · ` : '';
  return `${base}${periodoSemana(id)}`;
}

export function idsSemanas(): string[] {
  const hoje = new Date();
  const ids: string[] = [];
  // semana atual + 7 semanas à frente (planejamento sempre de seg a dom)
  for (let off = 0; off <= 7; off++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + off * 7);
    ids.push(idSemanaIso(d));
  }
  return ids;
}

/** Datas (segunda → domingo) da semana ISO "2026-S24". */
export function datasDaSemana(id: string): Date[] {
  const [anoS, semS] = id.split('-S');
  const ano = Number(anoS);
  const sem = Number(semS);
  // 4 de janeiro está sempre na semana ISO 1
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const diaSem = jan4.getUTCDay() || 7;
  const segunda = new Date(jan4);
  segunda.setUTCDate(jan4.getUTCDate() - diaSem + 1 + (sem - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setUTCDate(segunda.getUTCDate() + i);
    return d;
  });
}

export function idSemanaIso(data: Date): string {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(semana).padStart(2, '0')}`;
}

/** Desloca uma semana ISO em N semanas (negativo = passado). Uso contínuo, sem limite. */
export function deslocarSemana(id: string, deltaSemanas: number): string {
  const seg = datasDaSemana(id)[0];
  const d = new Date(seg);
  d.setUTCDate(d.getUTCDate() + deltaSemanas * 7);
  return idSemanaIso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Semanas que já têm cardápio (algum principal preenchido) — histórico real. */
export function semanasComConteudo(): string[] {
  if (typeof window === 'undefined') return [];
  const prefixo = PREFIXO + 'semana.';
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefixo)) continue;
      const raw = localStorage.getItem(k);
      if (raw && /"principal":"[^"]+"/.test(raw)) ids.push(k.slice(prefixo.length));
    }
  } catch {
    /* indisponível */
  }
  return ids.sort();
}

/** Grava o documento de uma semana arbitrária (usado ao duplicar). */
export function gravarSemana(id: string, estado: EstadoSemana) {
  gravarLocal('semana.' + id, estado);
}

/** Lê o documento de uma semana sem montar hook (para indicadores mensais). */
export function lerSemana(semanaId: string): EstadoSemana {
  return lerLocal('semana.' + semanaId, semanaVazia());
}

export function useSemana(semanaId: string) {
  const [estado, setEstado] = useState<EstadoSemana>(semanaVazia);
  const [pronto, setPronto] = useState(false);

  const recarregar = useCallback(() => {
    setEstado(lerLocal('semana.' + semanaId, semanaVazia()));
  }, [semanaId]);

  useEffect(() => {
    let cancelado = false;
    recarregar();

    // Se este aparelho já tem QUALQUER coisa gravada localmente para esta
    // semana, mostra na hora — não há por que esperar a nuvem. Mas se não
    // tem nada (aparelho novo, sessão limpa, semana nunca aberta aqui), um
    // documento vazio pode só significar "a nuvem ainda não respondeu", não
    // "não existe cardápio". Espera a primeira reconciliação da nuvem antes
    // de mostrar isso como definitivo — senão um cardápio real "some" por
    // alguns instantes toda vez que alguém abre o app num aparelho/sessão novos.
    const jaTemAlgoLocal =
      typeof window !== 'undefined' && localStorage.getItem(PREFIXO + 'semana.' + semanaId) != null;

    if (!supabaseHabilitado() || jaTemAlgoLocal) {
      setPronto(true);
    } else {
      aguardarBootNuvem().then(() => {
        if (cancelado) return;
        recarregar();
        setPronto(true);
      });
    }

    return () => {
      cancelado = true;
    };
  }, [recarregar, semanaId]);

  useReleituraExterna('semana.' + semanaId, recarregar);

  const atualizar = useCallback(
    (fn: (atual: EstadoSemana) => EstadoSemana) => {
      setEstado((atual) => {
        const novo = fn(atual);
        // Foto do que existia ANTES desta alteração — é o que o botão
        // "Restaurar" oferece de volta.
        registrarVersao('semana.' + semanaId, atual, 'local');
        gravarLocal('semana.' + semanaId, novo);
        return novo;
      });
    },
    [semanaId],
  );

  return { estado, atualizar, pronto };
}

export function usePrecos() {
  const [precos, setPrecos] = useState<Record<string, number>>({});

  const recarregar = useCallback(() => {
    // PRECOS_COMPRAS + PRECOS_COTACAO_SEED como base; entradas manuais têm prioridade.
    const local = lerLocal('precos', {});
    setPrecos({ ...PRECOS_COMPRAS, ...PRECOS_COTACAO_SEED, ...local });
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('precos', recarregar);

  const definirPreco = useCallback((itemNorm: string, valor: number | null, nome?: string) => {
    setPrecos((atual) => {
      const anterior = atual[itemNorm];
      const novo = { ...atual };
      if (valor === null || Number.isNaN(valor) || valor <= 0) delete novo[itemNorm];
      else novo[itemNorm] = valor;
      gravarLocal('precos', novo);

      // só registra quando o valor realmente mudou
      if (valor !== null && valor > 0 && valor !== anterior) {
        // histórico para o radar de preços (Módulo 5)
        const hist = lerLocal<HistoricoPrecos>('historicoPrecos', {});
        const serie = hist[itemNorm] ?? [];
        serie.push({ valor, em: new Date().toISOString() });
        hist[itemNorm] = serie.slice(-40);
        gravarLocal('historicoPrecos', hist);
        // trilha de auditoria (Módulo 9)
        registrarAuditoria({
          acao: 'alterou preço',
          alvo: nome ?? itemNorm,
          de: anterior ?? null,
          para: valor,
        });
      }
      return novo;
    });
  }, []);

  return { precos, definirPreco };
}

/** Série temporal de preços por item (alimenta o radar). */
export function useHistoricoPrecos() {
  const [historico, setHistorico] = useState<HistoricoPrecos>({});
  const recarregar = useCallback(() => setHistorico(lerLocal('historicoPrecos', {})), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('historicoPrecos', recarregar);
  return historico;
}

/**
 * Semente única do histórico de compras jan–mai/2026.
 * Roda apenas uma vez por dispositivo (flag 'historicoSeedV1').
 * Não sobrescreve entradas manuais: só adiciona pontos que ainda não existem.
 */
export function useSeedHistoricoPlanilha() {
  useEffect(() => {
    if (lerLocal('historicoSeedV1', false)) return;
    const seed = historicoPlanilhaJson as HistoricoPrecos;
    const atual = lerLocal<HistoricoPrecos>('historicoPrecos', {});
    const merged: HistoricoPrecos = { ...atual };
    for (const [item, pontos] of Object.entries(seed)) {
      if (!merged[item]) {
        merged[item] = pontos;
      } else {
        // Append only points not already in the serie (dedupe by em)
        const emsExistentes = new Set(merged[item].map((p) => p.em));
        const novos = pontos.filter((p) => !emsExistentes.has(p.em));
        if (novos.length) merged[item] = [...merged[item], ...novos].sort((a, b) => a.em.localeCompare(b.em));
      }
    }
    gravarLocal('historicoPrecos', merged);
    gravarLocal('historicoSeedV1', true);
  }, []);
}

/* ------------------- itens novos vindos da cotação -------------------- */

export interface ItemExtra {
  n: string; // nome como veio da cotação
  u: string; // unidade de compra
}

/**
 * Itens que não existiam no histórico e foram cadastrados direto da
 * cotação — a cotação é a guia: tudo que chega cotado pode virar item.
 */
export function useItensExtras() {
  const [itensExtras, setItensExtras] = useState<Record<string, ItemExtra>>({});

  const recarregar = useCallback(() => setItensExtras(lerLocal('itensExtras', {})), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('itensExtras', recarregar);

  const cadastrarItem = useCallback((norm: string, nome: string, unid: string) => {
    setItensExtras((atual) => {
      const novo = { ...atual, [norm]: { n: nome, u: unid } };
      gravarLocal('itensExtras', novo);
      return novo;
    });
  }, []);

  return { itensExtras, cadastrarItem };
}

/** Fornecedor/marca mais barato por item (vem da cotação aplicada). */
export function useFornecedores() {
  const [fornecedores, setFornecedores] = useState<Record<string, string>>({});

  const recarregar = useCallback(() => {
    // MAPA_FORNECEDORES_SEED como base; mapeamentos do usuário têm prioridade.
    const local = lerLocal<Record<string, string>>('fornecedores', {});
    const merge = { ...MAPA_FORNECEDORES_SEED, ...local };
    // Remove remetentes internos (Erika etc.) que possam ter sido salvos antes.
    for (const k of Object.keys(merge)) if (ehRemetenteInterno(merge[k])) delete merge[k];
    setFornecedores(merge);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('fornecedores', recarregar);

  const definirFornecedor = useCallback((itemNorm: string, marca: string | null) => {
    // Remetente interno (Erika etc.) nunca vira fornecedor de um item.
    if (marca && ehRemetenteInterno(marca)) return;
    setFornecedores((atual) => {
      const anterior = atual[itemNorm];
      const novo = { ...atual };
      if (!marca) delete novo[itemNorm];
      else novo[itemNorm] = marca;
      gravarLocal('fornecedores', novo);
      if (marca && marca !== anterior) {
        registrarAuditoria({ acao: 'definiu fornecedor', alvo: itemNorm, de: anterior ?? null, para: marca });
      }
      return novo;
    });
  }, []);

  /** Renomeia um fornecedor em todos os itens de uma vez (inclui localStorage raw). */
  const renomearFornecedor = useCallback((antigo: string, novo: string) => {
    const novoNome = novo.trim();
    if (!novoNome || ehRemetenteInterno(novoNome)) return;
    setFornecedores((atual) => {
      const atualizado = { ...atual };
      Object.keys(atualizado).forEach((k) => {
        if (atualizado[k] === antigo) atualizado[k] = novoNome;
      });
      // Também corrige os itens que estavam salvos com "Erika" no localStorage bruto.
      const raw = lerLocal<Record<string, string>>('fornecedores', {});
      Object.keys(raw).forEach((k) => { if (raw[k] === antigo) raw[k] = novoNome; });
      gravarLocal('fornecedores', raw);
      registrarAuditoria({ acao: 'renomeou fornecedor', alvo: antigo, para: novoNome });
      return atualizado;
    });
  }, []);

  return { fornecedores, definirFornecedor, renomearFornecedor };
}

/* ------------------- ofertas por fornecedor --------------------------- */

export interface Oferta {
  fornecedor: string;
  preco: number;
}

/** chave = item normalizado → lista de ofertas (um preço por fornecedor). */
export type Ofertas = Record<string, Oferta[]>;

/**
 * Preços por fornecedor de cada item. Acumula as cotações aplicadas (e
 * adições manuais) para que a compra possa trocar de fornecedor na lista
 * e o custo acompanhe o preço daquele fornecedor.
 */
export function useOfertas() {
  const [ofertas, setOfertas] = useState<Ofertas>({});

  const recarregar = useCallback(() => {
    // Limpa ofertas de remetentes internos (Érika / Tatá Sushi Compras) que
    // tenham sido gravadas antes desta regra — nunca são fornecedores.
    const bruto = lerLocal<Ofertas>('ofertas', {});
    let mudou = false;
    const limpo: Ofertas = {};
    for (const [item, lista] of Object.entries(bruto)) {
      const filtrada = (lista ?? []).filter((o) => !ehRemetenteInterno(o.fornecedor));
      if (filtrada.length !== (lista ?? []).length) mudou = true;
      if (filtrada.length) limpo[item] = filtrada;
    }
    if (mudou) gravarLocal('ofertas', limpo);
    setOfertas(limpo);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('ofertas', recarregar);

  /** Insere/atualiza o preço de um fornecedor para um item (dedupe por nome). */
  const registrarOferta = useCallback((itemNorm: string, fornecedor: string, preco: number) => {
    const nome = fornecedor.trim();
    if (!nome || !(preco > 0)) return;
    // Remetente interno (Érika / Tatá Sushi Compras) nunca vira oferta.
    if (ehRemetenteInterno(nome)) return;
    setOfertas((atual) => {
      const lista = atual[itemNorm] ?? [];
      const i = lista.findIndex((o) => o.fornecedor.toLowerCase() === nome.toLowerCase());
      const nova = i >= 0
        ? lista.map((o, j) => (j === i ? { fornecedor: nome, preco } : o))
        : [...lista, { fornecedor: nome, preco }];
      const novo = { ...atual, [itemNorm]: nova };
      gravarLocal('ofertas', novo);
      return novo;
    });
  }, []);

  /** Remove a oferta de um fornecedor para um item. */
  const removerOferta = useCallback((itemNorm: string, fornecedor: string) => {
    setOfertas((atual) => {
      const lista = (atual[itemNorm] ?? []).filter((o) => o.fornecedor.toLowerCase() !== fornecedor.toLowerCase());
      const novo = { ...atual };
      if (lista.length) novo[itemNorm] = lista;
      else delete novo[itemNorm];
      gravarLocal('ofertas', novo);
      return novo;
    });
  }, []);

  return { ofertas, registrarOferta, removerOferta };
}

/* ------------------- aprendizado de quantidades ----------------------- */

/**
 * Memória operacional permanente: toda semana concluída, os ajustes de
 * quantidade feitos pela cozinha viram um fator por item que corrige as
 * próximas sugestões. Usa mediana sobre janela móvel (robusta a outliers)
 * com guarda de confiança — ver ./memoria.
 */
export function useAprendizado() {
  const [registros, setRegistros] = useState<Record<string, RegistroAprendizado>>({});

  const recarregar = useCallback(() => setRegistros(lerLocal('aprendizado', {})), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('aprendizado', recarregar);

  // fatores prontos para usar na lista (mediana + confiança, limitados)
  const fatores: Record<string, number> = {};
  for (const [k, r] of Object.entries(registros)) {
    fatores[k] = fatorEfetivo(r);
  }

  const aprenderDeSemana = useCallback((estado: EstadoSemana) => {
    setRegistros((atual) => {
      const novo = { ...atual };
      estado.dias.forEach((_, di) => {
        // compara com a sugestão BASE (sem fatores) para o aprendizado não compor
        for (const l of linhasDoDia(estado, di)) {
          if (l.manual || l.sugerida === null || l.sugerida <= 0) continue;
          if (l.qtd === l.sugerida || l.qtd <= 0) continue;
          novo[l.chave] = registrarRazao(novo[l.chave], l.qtd / l.sugerida);
        }
      });
      gravarLocal('aprendizado', novo);
      return novo;
    });

    // a contagem real de refeições refina a curva de pessoas das próximas semanas
    const medias = lerLocal<Record<number, RegistroAprendizado>>('mediaRefeicoes', {});
    let mudou = false;
    Object.entries(estado.refeicoes ?? {}).forEach(([diS, qtd]) => {
      const di = Number(diS);
      if (!(qtd > 0)) return;
      medias[di] = registrarValor(medias[di], qtd);
      mudou = true;
    });
    if (mudou) gravarLocal('mediaRefeicoes', medias);
  }, []);

  // resumo da memória para o assistente/dossiê: itens que a casa
  // consistentemente compra acima/abaixo da sugestão do motor
  const ajustesAprendidos: AjusteAprendido[] = ajustesRelevantes(registros);

  return {
    fatores,
    aprenderDeSemana,
    ajustesAprendidos,
    totalAprendido: Object.keys(registros).length,
  };
}

export function usePapel() {
  const [papel, setPapelEstado] = useState<Papel>('gestor');

  useEffect(() => {
    const p = lerLocal<Papel>('papel', 'gestor');
    papelAtual = p;
    setPapelEstado(p);
  }, []);

  const setPapel = useCallback((p: Papel) => {
    papelAtual = p;
    setPapelEstado(p);
    gravarLocal('papel', p);
  }, []);

  return { papel, setPapel };
}

/* =====================================================================
   Módulo 2 — Estoque inteligente (saldo global por item + movimentos).
   ===================================================================== */

export function useEstoque() {
  const [estoque, setEstoque] = useState<Estoque>({});
  const [pronto, setPronto] = useState(false);

  const recarregar = useCallback(() => setEstoque(lerLocal('estoque', {})), []);
  useEffect(() => {
    recarregar();
    setPronto(true);
  }, [recarregar]);
  useReleituraExterna('estoque', recarregar);

  /** Aplica um movimento (entrada +, baixa −, ajuste/recebimento) e audita. */
  const movimentar = useCallback((mov: Omit<MovEstoque, 'em' | 'papel'>) => {
    setEstoque((atual) => {
      const k = mov.norm;
      const prev: ItemEstoque = atual[k] ?? {
        item: mov.item,
        unid: mov.unid,
        qtd: 0,
        minimo: 0,
        atualizadoEm: new Date().toISOString(),
      };
      const novoSaldo = Math.max(0, Math.round((prev.qtd + mov.delta) * 1000) / 1000);
      const novo: Estoque = {
        ...atual,
        [k]: { ...prev, item: mov.item || prev.item, unid: mov.unid || prev.unid, qtd: novoSaldo, atualizadoEm: new Date().toISOString() },
      };
      gravarLocal('estoque', novo);

      const log = lerLocal<MovEstoque[]>('estoqueMov', []);
      log.unshift({ ...mov, em: new Date().toISOString(), papel: papelAtual });
      gravarLocal('estoqueMov', log.slice(0, 600));

      registrarAuditoria({
        acao: mov.motivo === 'baixa' ? 'baixa de estoque' : 'movimentou estoque',
        alvo: mov.item,
        de: prev.qtd,
        para: novoSaldo,
      });
      return novo;
    });
  }, []);

  const definirMinimo = useCallback((norm: string, item: string, unid: string, minimo: number) => {
    setEstoque((atual) => {
      const prev = atual[norm] ?? { item, unid, qtd: 0, minimo: 0, atualizadoEm: new Date().toISOString() };
      const novo = { ...atual, [norm]: { ...prev, item, unid, minimo: Math.max(0, minimo), atualizadoEm: new Date().toISOString() } };
      gravarLocal('estoque', novo);
      return novo;
    });
  }, []);

  /** Define o saldo absoluto (contagem física), registrando a diferença. */
  const definirSaldo = useCallback((norm: string, item: string, unid: string, saldo: number) => {
    setEstoque((atual) => {
      const prev = atual[norm];
      const anterior = prev?.qtd ?? 0;
      const novoSaldo = Math.max(0, saldo);
      const novo: Estoque = {
        ...atual,
        [norm]: { item, unid, qtd: novoSaldo, minimo: prev?.minimo ?? 0, atualizadoEm: new Date().toISOString() },
      };
      gravarLocal('estoque', novo);
      if (novoSaldo !== anterior) {
        registrarAuditoria({ acao: 'ajustou estoque', alvo: item, de: anterior, para: novoSaldo });
      }
      return novo;
    });
  }, []);

  return { estoque, pronto, movimentar, definirMinimo, definirSaldo };
}

/* =====================================================================
   Módulo 3 — Controle de desperdício (registros por semana).
   ===================================================================== */

export function useDesperdicio(semanaId: string) {
  const [registros, setRegistros] = useState<RegistroDesperdicio[]>([]);

  const recarregar = useCallback(() => setRegistros(lerLocal('desperdicio.' + semanaId, [])), [semanaId]);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('desperdicio.' + semanaId, recarregar);

  const adicionar = useCallback(
    (r: Omit<RegistroDesperdicio, 'id' | 'em'>) => {
      setRegistros((atual) => {
        const novo = [
          ...atual,
          { ...r, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, em: new Date().toISOString() },
        ];
        gravarLocal('desperdicio.' + semanaId, novo);
        registrarAuditoria({ acao: 'registrou desperdício', alvo: r.prato, para: Math.max(0, r.produzido - r.consumido), semana: semanaId });
        return novo;
      });
    },
    [semanaId],
  );

  const remover = useCallback(
    (id: string) => {
      setRegistros((atual) => {
        const novo = atual.filter((r) => r.id !== id);
        gravarLocal('desperdicio.' + semanaId, novo);
        return novo;
      });
    },
    [semanaId],
  );

  return { registros, adicionar, remover };
}

/** Lê os registros de desperdício de qualquer semana (para indicadores). */
export function lerDesperdicio(semanaId: string): RegistroDesperdicio[] {
  return lerLocal('desperdicio.' + semanaId, []);
}

/**
 * Calcula o DNA alimentar da casa a partir de tudo que está persistido:
 * histórico de cardápios + aceitação global + desperdício de cada semana.
 * Função pura (lê localStorage) — pode rodar fora de componente.
 */
export function montarDnaAlimentar(): DnaAlimentar {
  const ids = semanasComConteudo();
  const semanas = ids.map((id) => ({ semanaId: id, estado: lerSemana(id) }));
  const aceitacao = lerLocal<Aceitacao>('aceitacao', {});
  const desperdicio = ids.flatMap((id) => lerDesperdicio(id));

  // Base histórica: frequência real de cada prato nos anos de operação (dados.json)
  const freqBase = freqBaseDosDados();

  // Média de pessoas/dia calculada das semanas registradas no app
  let somaPessoas = 0;
  let nDiasPessoas = 0;
  semanas.forEach(({ estado }) => {
    estado.dias.forEach((d) => {
      if (d.principal && d.pessoas > 0) { somaPessoas += d.pessoas; nDiasPessoas++; }
    });
  });
  const mediaPessoas = nDiasPessoas > 0 ? Math.round(somaPessoas / nDiasPessoas) : null;

  return calcularDna(semanas, aceitacao, desperdicio, freqBase, TOTAL_DIAS_HISTORICO, mediaPessoas);
}

/** Hook do DNA alimentar — recalcula no cliente quando monta. */
export function useDna() {
  const [dna, setDna] = useState<DnaAlimentar | null>(null);

  const recalcular = useCallback(() => setDna(montarDnaAlimentar()), []);

  useEffect(() => { recalcular(); }, [recalcular]);
  // votos do QR e mudanças de aceitação chegam por fora — recalcula o DNA
  useReleituraExterna('aceitacao', recalcular);

  return { dna, recalcular };
}

/**
 * Monta o dossiê completo para o LLM, reunindo tudo que está persistido:
 * estado da semana, custos, aceitação, estoque, histórico de preços,
 * desperdício, semanas anteriores, memória operacional e DNA alimentar.
 */
export function montarDossieCompleto(args: {
  semanaId: string;
  estado: EstadoSemana;
  precos: Record<string, number>;
  aceitacao: Aceitacao;
  estoque: Estoque;
  historico: HistoricoPrecos;
  fornecedores: Record<string, string>;
}): DossieIA {
  const { semanaId, estado, precos, aceitacao, estoque, historico, fornecedores } = args;
  const ids = semanasComConteudo();
  const anteriores = ids
    .filter((id) => id < semanaId)
    .sort()
    .slice(-4)
    .map((id) => ({ semanaId: id, estado: lerSemana(id) }));
  const desperdicio = ids.flatMap((id) => lerDesperdicio(id));
  const registros = lerLocal<Record<string, RegistroAprendizado>>('aprendizado', {});
  const ajustes = ajustesRelevantes(registros);
  const dna = montarDnaAlimentar();
  return montarDossie(
    semanaId,
    estado,
    precos,
    aceitacao,
    estoque,
    historico,
    fornecedores,
    desperdicio,
    anteriores,
    ajustes,
    dna,
  );
}

/* =====================================================================
   Módulo 4 — Índice de aceitação dos pratos (global por prato).
   ===================================================================== */

export function useAceitacao() {
  const [aceitacao, setAceitacao] = useState<Aceitacao>({});

  const recarregar = useCallback(() => setAceitacao(lerLocal('aceitacao', {})), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('aceitacao', recarregar);

  const avaliar = useCallback((prato: string, voto: 'bom' | 'ok' | 'ruim') => {
    const k = normalizar(prato);
    if (!k) return;
    const nota = voto === 'bom' ? 5 : voto === 'ok' ? 3 : 1;
    setAceitacao((atual) => {
      const prev: RegistroAceitacao = atual[k] ?? { prato, bom: 0, ok: 0, ruim: 0, somaNotas: 0, n: 0, atualizadoEm: '' };
      const novo: Aceitacao = {
        ...atual,
        [k]: {
          prato,
          bom: prev.bom + (voto === 'bom' ? 1 : 0),
          ok: prev.ok + (voto === 'ok' ? 1 : 0),
          ruim: prev.ruim + (voto === 'ruim' ? 1 : 0),
          somaNotas: prev.somaNotas + nota,
          n: prev.n + 1,
          atualizadoEm: new Date().toISOString(),
        },
      };
      gravarLocal('aceitacao', novo);
      return novo;
    });
  }, []);

  return { aceitacao, avaliar };
}

/** Zera as avaliações de prato (aceitação) para começar a operar do zero.
    O estado vazio é gravado localmente e espelhado na nuvem — os outros
    aparelhos recebem o reset ao sincronizar. Não mexe no histórico/DNA da casa
    (que vem dos dados de operação), só nos votos bom/ok/ruim registrados aqui. */
export function zerarAvaliacoesPratos() {
  gravarLocal('aceitacao', {});
  notificarChaveExterna('aceitacao');
}

/* =====================================================================
   Preferência: mostrar/ocultar insumos básicos na lista de compras.
   ===================================================================== */

export function useMostrarBasicos() {
  const [mostrarBasicos, setMostrarBasicosEstado] = useState(false);

  useEffect(() => {
    setMostrarBasicosEstado(lerLocal('mostrarBasicos', false));
  }, []);

  const setMostrarBasicos = useCallback((v: boolean) => {
    setMostrarBasicosEstado(v);
    gravarLocal('mostrarBasicos', v);
  }, []);

  return { mostrarBasicos, setMostrarBasicos };
}

/* =====================================================================
   Pesquisa de satisfação detalhada — qualidade, variedade, atendimento
   e comentário livre. Separada do índice de aceitação (que mede prato).
   ===================================================================== */

export interface RegistroSatisfacao {
  id: string;
  prato: string;
  qualidade: 'bom' | 'ok' | 'ruim';
  variedade: 'bom' | 'ok' | 'ruim';
  atendimento: 'bom' | 'ok' | 'ruim';
  comentario?: string;
  em: string;
}

export function registrarSatisfacao(r: Omit<RegistroSatisfacao, 'id' | 'em'>) {
  const registro: RegistroSatisfacao = {
    ...r,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    em: new Date().toISOString(),
  };
  const lista = [registro, ...lerLocal<RegistroSatisfacao[]>('satisfacao', [])].slice(0, 1000);
  gravarLocal('satisfacao', lista);
  return registro;
}

export function lerSatisfacao(): RegistroSatisfacao[] {
  return lerLocal<RegistroSatisfacao[]>('satisfacao', []);
}

export function useSatisfacao() {
  const [lista, setLista] = useState<RegistroSatisfacao[]>([]);
  const recarregar = useCallback(() => setLista(lerLocal('satisfacao', [])), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('satisfacao', recarregar);
  return lista;
}

/* =====================================================================
   Módulo 6 — Eventos de demanda (manuais / feriados configuráveis).
   ===================================================================== */

export function useEventos() {
  const [eventos, setEventos] = useState<EventoDemanda[]>([]);

  const recarregar = useCallback(() => setEventos(lerLocal('eventos', [])), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('eventos', recarregar);

  const adicionar = useCallback((e: Omit<EventoDemanda, 'id'>) => {
    setEventos((atual) => {
      const novo = [...atual, { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
      gravarLocal('eventos', novo);
      return novo;
    });
  }, []);

  const remover = useCallback((id: string) => {
    setEventos((atual) => {
      const novo = atual.filter((e) => e.id !== id);
      gravarLocal('eventos', novo);
      return novo;
    });
  }, []);

  return { eventos, adicionar, remover };
}

export function lerEventos(): EventoDemanda[] {
  return lerLocal('eventos', []);
}

/** Média de refeições aprendida por dia da semana (0=seg … 6=dom). */
export function lerMediaRefeicoes(): Record<number, { f: number; n: number }> {
  return lerLocal('mediaRefeicoes', {});
}

/* =====================================================================
   Módulo 11 — Ações comprometidas + rastreamento de resultados.
   ===================================================================== */

import type { AcaoComprometida, ResultadoAcao } from './tipos';

export function useAcoesComprometidas() {
  const [acoes, setAcoes] = useState<AcaoComprometida[]>([]);

  useEffect(() => {
    setAcoes(lerLocal<AcaoComprometida[]>('acoesComprometidas', []));
  }, []);

  const comprometer = useCallback((acao: Omit<AcaoComprometida, 'id' | 'comprometidaEm'>) => {
    setAcoes((atual) => {
      const nova: AcaoComprometida = {
        ...acao,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        comprometidaEm: new Date().toISOString(),
      };
      const novo = [nova, ...atual].slice(0, 200);
      gravarLocal('acoesComprometidas', novo);
      return novo;
    });
  }, []);

  const registrarResultado = useCallback((id: string, resultado: ResultadoAcao) => {
    setAcoes((atual) => {
      const novo = atual.map((a) => (a.id === id ? { ...a, resultado } : a));
      gravarLocal('acoesComprometidas', novo);
      return novo;
    });
  }, []);

  const acoesAtivas = useCallback(
    (semanaId: string) => acoes.filter((a) => a.semanaId === semanaId && !a.resultado),
    [acoes],
  );

  return { acoes, comprometer, registrarResultado, acoesAtivas };
}

export function lerAcoesComprometidas(): AcaoComprometida[] {
  return lerLocal<AcaoComprometida[]>('acoesComprometidas', []);
}

/* =====================================================================
   Módulo 12 — Inteligência de substituição.
   ===================================================================== */

import type { SubstituicaoRegistro } from './tipos';

export function useSubstituicoes() {
  const [registros, setRegistros] = useState<SubstituicaoRegistro[]>([]);

  useEffect(() => {
    setRegistros(lerLocal<SubstituicaoRegistro[]>('substituicoes', []));
  }, []);

  const registrar = useCallback((sub: Omit<SubstituicaoRegistro, 'id' | 'registradoEm'>) => {
    setRegistros((atual) => {
      // evita duplicata na mesma semana + dia
      const existente = atual.find(
        (r) => r.semanaId === sub.semanaId && r.dia === sub.dia && r.normOriginal === sub.normOriginal,
      );
      if (existente) return atual;
      const novo: SubstituicaoRegistro = {
        ...sub,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        registradoEm: new Date().toISOString(),
      };
      const lista = [novo, ...atual].slice(0, 1000);
      gravarLocal('substituicoes', lista);
      return lista;
    });
  }, []);

  const enriquecer = useCallback(
    (semanaId: string, normSubstituto: string, aceitacao?: number, desperdicio?: number) => {
      setRegistros((atual) => {
        const novo = atual.map((r) =>
          r.semanaId === semanaId && r.normSubstituto === normSubstituto
            ? {
                ...r,
                ...(aceitacao != null ? { aceitacaoSubstituto: aceitacao } : {}),
                ...(desperdicio != null ? { desperdicioSubstituto: desperdicio } : {}),
              }
            : r,
        );
        gravarLocal('substituicoes', novo);
        return novo;
      });
    },
    [],
  );

  return { registros, registrar, enriquecer };
}

export function lerSubstituicoes(): SubstituicaoRegistro[] {
  return lerLocal<SubstituicaoRegistro[]>('substituicoes', []);
}

/* =====================================================================
   Módulo: Funcionários e restrições alimentares
   ===================================================================== */

export function useFuncionarios() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  const recarregar = useCallback(() => {
    const local = lerLocal<Funcionario[]>('funcionarios', []);
    // Se o usuário não cadastrou ninguém ainda, usa o seed das conversas reais.
    // Se já há dados, mescla: seed fornece registros cujos IDs não existem localmente.
    if (local.length === 0) {
      setFuncionarios(FUNCIONARIOS_SEED);
    } else {
      const idsLocais = new Set(local.map((f) => f.id));
      const novos = FUNCIONARIOS_SEED.filter((f) => !idsLocais.has(f.id));
      setFuncionarios([...local, ...novos]);
    }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('funcionarios', recarregar);

  const salvar = useCallback((f: Omit<Funcionario, 'id' | 'criadoEm'>) => {
    setFuncionarios((atual) => {
      const novo: Funcionario = {
        ...f,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        criadoEm: new Date().toISOString(),
      };
      const lista = [...atual, novo];
      gravarLocal('funcionarios', lista);
      registrarAuditoria({ acao: 'cadastrou funcionário', alvo: f.nome });
      return lista;
    });
  }, []);

  const atualizarFuncionario = useCallback((id: string, f: Partial<Funcionario>) => {
    setFuncionarios((atual) => {
      const novo = atual.map((x) => (x.id === id ? { ...x, ...f } : x));
      gravarLocal('funcionarios', novo);
      return novo;
    });
  }, []);

  const removerFuncionario = useCallback((id: string) => {
    setFuncionarios((atual) => {
      const f = atual.find((x) => x.id === id);
      const novo = atual.filter((x) => x.id !== id);
      gravarLocal('funcionarios', novo);
      if (f) registrarAuditoria({ acao: 'removeu funcionário', alvo: f.nome });
      return novo;
    });
  }, []);

  return { funcionarios, salvar, atualizarFuncionario, removerFuncionario };
}

export function lerFuncionarios(): Funcionario[] {
  return lerLocal<Funcionario[]>('funcionarios', []);
}

/* =====================================================================
   Módulo: Contagem de refeições por dia
   ===================================================================== */

export function useContagemRefeicoes() {
  const [contagens, setContagens] = useState<ContagemRefeicoesDia[]>([]);

  const recarregar = useCallback(() => setContagens(lerLocal<ContagemRefeicoesDia[]>('contagemRefeicoes', [])), []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('contagemRefeicoes', recarregar);

  const registrar = useCallback((c: Omit<ContagemRefeicoesDia, 'registradoEm'>) => {
    setContagens((atual) => {
      const sem = atual.filter((x) => x.data !== c.data);
      const novo = [{ ...c, registradoEm: new Date().toISOString() }, ...sem]
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 365);
      gravarLocal('contagemRefeicoes', novo);
      registrarAuditoria({ acao: 'registrou contagem', alvo: c.data, para: c.almoco + c.jantar });
      return novo;
    });
  }, []);

  return { contagens, registrar };
}

export function lerContagemRefeicoes(): ContagemRefeicoesDia[] {
  return lerLocal<ContagemRefeicoesDia[]>('contagemRefeicoes', []);
}

/* =====================================================================
   Módulo: Perfis de fornecedor (inteligência além do preço)
   ===================================================================== */

export function useFornecedorPerfis() {
  const [perfis, setPerfis] = useState<Record<string, PerfilFornecedor>>({});

  const recarregar = useCallback(() => {
    // PERFIS_FORNECEDORES_SEED como base; perfis editados pelo usuário têm prioridade.
    const local = lerLocal<Record<string, PerfilFornecedor>>('fornecedorPerfis', {});
    const merge = { ...PERFIS_FORNECEDORES_SEED, ...local };
    // Remove perfis de remetentes internos (Erika etc.) salvos por engano.
    for (const k of Object.keys(merge)) if (ehRemetenteInterno(k)) delete merge[k];
    setPerfis(merge);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useReleituraExterna('fornecedorPerfis', recarregar);

  const salvarPerfil = useCallback((nome: string, dados: Partial<Omit<PerfilFornecedor, 'nome' | 'avaliacoes'>>) => {
    // Não cria perfil de fornecedor para quem só encaminha as cotações (Erika).
    if (ehRemetenteInterno(nome)) return;
    setPerfis((atual) => {
      const prev = atual[nome] ?? { nome, avaliacoes: [] };
      const novo = { ...atual, [nome]: { ...prev, ...dados, nome } };
      gravarLocal('fornecedorPerfis', novo);
      return novo;
    });
  }, []);

  const adicionarAvaliacao = useCallback((nome: string, av: Omit<AvaliacaoFornecedor, 'em'>) => {
    setPerfis((atual) => {
      const prev = atual[nome] ?? { nome, avaliacoes: [] };
      const novaAv: AvaliacaoFornecedor = { ...av, em: new Date().toISOString() };
      const novo = {
        ...atual,
        [nome]: { ...prev, avaliacoes: [novaAv, ...prev.avaliacoes].slice(0, 50) },
      };
      gravarLocal('fornecedorPerfis', novo);
      registrarAuditoria({ acao: 'avaliou fornecedor', alvo: nome, para: av.qualidade });
      return novo;
    });
  }, []);

  return { perfis, salvarPerfil, adicionarAvaliacao };
}

export function lerFornecedorPerfis(): Record<string, PerfilFornecedor> {
  return lerLocal('fornecedorPerfis', {});
}

/* =====================================================================
   Chef IA — feedback das sugestões (/) + histórico de recomendações
   ===================================================================== */

export function useChefFeedback() {
  const [feedbacks, setFeedbacks] = useState<ChefFeedback[]>([]);

  useEffect(() => {
    setFeedbacks(lerLocal('chefFeedback', []));
  }, []);

  const registrar = useCallback((fb: Omit<ChefFeedback, 'id' | 'em'>) => {
    setFeedbacks((atual) => {
      const novo = [
        { ...fb, id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, em: new Date().toISOString() },
        ...atual,
      ].slice(0, 300);
      gravarLocal('chefFeedback', novo);
      return novo;
    });
  }, []);

  const vetados = new Set(
    feedbacks.filter((f) => f.voto === 'ruim').map((f) => f.hash),
  );

  return { feedbacks, registrar, vetados };
}
