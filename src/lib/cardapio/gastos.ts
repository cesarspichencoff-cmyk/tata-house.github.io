'use client';

/* =====================================================================
   Livro-caixa de compras — o gasto REAL da casa, mês a mês.

   Por que existe: a leitura de nota fiscal já extraía fornecedor, data,
   total e todos os itens — e o app aproveitava só os preços, jogando o
   resto fora. A tela de Gastos lia um arquivo estático de jan–mai/26,
   congelado: entrava nota nova e o número não mexia. Quem opera olhava
   um gasto de meses atrás achando que era o de agora.

   Agora toda nota lida vira um lançamento aqui, e o histórico da
   planilha continua servindo aos meses anteriores ao app. O mês corrente
   passa a ser fato, não memória.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import gastosJson from './gastos-mensais.json';
import { normalizar } from './motor';

const PREFIXO = 'cardapio.v1.';
const CHAVE = 'gastos';

export interface ItemGasto {
  produto: string;
  norm: string;
  qtd: number;
  unid: string;
  precoUnit: number;
  precoTotal: number;
}

export interface LancamentoGasto {
  id: string;
  /** Data do documento (yyyy-mm-dd) — é ela que define o mês do gasto. */
  data: string;
  fornecedor: string;
  cnpj?: string;
  total: number;
  itens: ItemGasto[];
  origem: 'nf' | 'manual';
  /** Quando foi registrado no app (ISO). */
  em: string;
}

export interface ResumoMes {
  mes: string; // yyyy-mm
  total: number;
  entradas: number;
  fonte: 'planilha' | 'app';
}

/* --------------------------- persistência ---------------------------- */

function ler(): LancamentoGasto[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PREFIXO + CHAVE);
    return raw ? (JSON.parse(raw) as LancamentoGasto[]) : [];
  } catch {
    return [];
  }
}

function gravar(lista: LancamentoGasto[]): void {
  try {
    // setItem é espelhado na nuvem — o livro-caixa vale para a casa toda.
    localStorage.setItem(PREFIXO + CHAVE, JSON.stringify(lista));
  } catch {
    /* armazenamento cheio: o aviso global já cobre */
  }
}

/* ------------------------------ histórico ---------------------------- */

const HISTORICO = gastosJson as {
  meses: { total: number; entradas: number; mes: string }[];
  top: { n: string; t: number }[];
};

/** Último mês coberto pela planilha — a partir daí, quem manda é o app. */
export const ULTIMO_MES_PLANILHA = HISTORICO.meses
  .map((m) => m.mes)
  .sort()
  .slice(-1)[0] ?? '';

export function mesDe(data: string): string {
  return (data ?? '').slice(0, 7);
}

/* ----------------------------- agregações ---------------------------- */

/**
 * Série mensal combinando as duas fontes, sem dupla contagem: a planilha
 * responde pelos meses que ela cobre; o app, por tudo que veio depois.
 */
export function serieMensal(lancamentos: LancamentoGasto[]): ResumoMes[] {
  const daPlanilha: ResumoMes[] = HISTORICO.meses.map((m) => ({
    mes: m.mes,
    total: m.total,
    entradas: m.entradas,
    fonte: 'planilha',
  }));

  const porMes = new Map<string, { total: number; entradas: number }>();
  for (const l of lancamentos) {
    const mes = mesDe(l.data);
    if (!mes || mes <= ULTIMO_MES_PLANILHA) continue; // planilha já cobre
    const atual = porMes.get(mes) ?? { total: 0, entradas: 0 };
    atual.total += l.total;
    atual.entradas += l.itens.length || 1;
    porMes.set(mes, atual);
  }

  const doApp: ResumoMes[] = Array.from(porMes.entries()).map(([mes, v]) => ({
    mes,
    total: Math.round(v.total * 100) / 100,
    entradas: v.entradas,
    fonte: 'app',
  }));

  return [...daPlanilha, ...doApp].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Itens que mais pesam no bolso, somando planilha + notas do app. */
export function topItens(lancamentos: LancamentoGasto[], limite = 12): { n: string; t: number }[] {
  const soma = new Map<string, number>();
  for (const it of HISTORICO.top) {
    if (it.n === 'total') continue; // linha de total da planilha
    soma.set(it.n, (soma.get(it.n) ?? 0) + it.t);
  }
  for (const l of lancamentos) {
    if (mesDe(l.data) <= ULTIMO_MES_PLANILHA) continue;
    for (const it of l.itens) {
      const k = it.norm || normalizar(it.produto);
      soma.set(k, (soma.get(k) ?? 0) + it.precoTotal);
    }
  }
  return Array.from(soma.entries())
    .map(([n, t]) => ({ n, t: Math.round(t * 100) / 100 }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limite);
}

/** Gasto de um mês específico, já somando as duas fontes. */
export function totalDoMes(lancamentos: LancamentoGasto[], mes: string): number {
  return serieMensal(lancamentos).find((m) => m.mes === mes)?.total ?? 0;
}

/** Mês corrente no formato yyyy-mm. */
export function mesCorrente(hoje = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/* -------------------------------- hook ------------------------------- */

export function useGastos() {
  const [lancamentos, setLancamentos] = useState<LancamentoGasto[]>([]);

  const recarregar = useCallback(() => setLancamentos(ler()), []);
  useEffect(() => { recarregar(); }, [recarregar]);

  const registrar = useCallback((l: Omit<LancamentoGasto, 'id' | 'em'>): void => {
    setLancamentos((atual) => {
      // Mesma nota lida duas vezes não vira gasto dobrado.
      const duplicada = atual.some(
        (x) => x.data === l.data && x.fornecedor === l.fornecedor && Math.abs(x.total - l.total) < 0.01,
      );
      if (duplicada) return atual;
      const novo: LancamentoGasto = {
        ...l,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        em: new Date().toISOString(),
      };
      const lista = [novo, ...atual].slice(0, 500);
      gravar(lista);
      return lista;
    });
  }, []);

  const remover = useCallback((id: string): void => {
    setLancamentos((atual) => {
      const lista = atual.filter((x) => x.id !== id);
      gravar(lista);
      return lista;
    });
  }, []);

  return { lancamentos, registrar, remover, recarregar };
}
