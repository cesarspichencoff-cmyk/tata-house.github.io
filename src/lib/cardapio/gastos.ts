'use client';

/* =====================================================================
   Livro-caixa de compras — o gasto REAL da casa, mês a mês.

   Toda nota lida vira lançamento e qualquer gravação notifica as demais
   superfícies da mesma aba. O evento nativo `storage` só dispara em outras
   abas; sem esta notificação, Relatórios/Gastos podia ficar visualmente
   congelado mesmo depois de uma NF ser registrada no próprio app.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import gastosJson from './gastos-mensais.json';
import { normalizar } from './motor';

const PREFIXO = 'cardapio.v1.';
const CHAVE = 'gastos';
const EVENTO_CHAVE = 'tata:chave-externa';

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

function notificarMudanca() {
  if (typeof window === 'undefined') return;
  const emitir = () => window.dispatchEvent(new CustomEvent(EVENTO_CHAVE, { detail: { chave: CHAVE } }));
  if (typeof queueMicrotask === 'function') queueMicrotask(emitir);
  else window.setTimeout(emitir, 0);
}

function gravar(lista: LancamentoGasto[]): boolean {
  try {
    // setItem continua espelhado pela camada de sincronização da casa.
    localStorage.setItem(PREFIXO + CHAVE, JSON.stringify(lista));
    notificarMudanca();
    return true;
  } catch {
    // Não emite evento nem finge atualização persistida quando a escrita falha.
    return false;
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

  // Reage a gravações da própria aba e também de outra aba/aparelho depois da
  // reconciliação. Assim gasto, relatório e inteligência financeira não ficam
  // defasados até um reload manual.
  useEffect(() => {
    const onExterno = (e: Event) => {
      const chave = (e as CustomEvent<{ chave?: string }>).detail?.chave;
      if (chave === CHAVE) recarregar();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFIXO + CHAVE) recarregar();
    };
    window.addEventListener(EVENTO_CHAVE, onExterno);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENTO_CHAVE, onExterno);
      window.removeEventListener('storage', onStorage);
    };
  }, [recarregar]);

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
      return gravar(lista) ? lista : atual;
    });
  }, []);

  const remover = useCallback((id: string): void => {
    setLancamentos((atual) => {
      const lista = atual.filter((x) => x.id !== id);
      return gravar(lista) ? lista : atual;
    });
  }, []);

  return { lancamentos, registrar, remover, recarregar };
}
