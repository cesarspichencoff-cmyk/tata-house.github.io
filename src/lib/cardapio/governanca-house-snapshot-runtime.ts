'use client';

import { MAPA_FORNECEDORES_SEED, PRECOS_COTACAO_SEED } from './dados-seed';
import { PRECOS_COMPRAS } from './precos-compras';
import { ehRemetenteInterno } from './cotacao';
import {
  datasDaSemana,
  lerContagemRefeicoes,
  lerDesperdicio,
  lerSemana,
} from './estado';
import { lerPontosRefeicaoDia } from './pontos-refeicao-storage';
import { aguardarBootNuvem } from './supabase';
import type { Aceitacao, Estoque } from './tipos';
import {
  SECOES_HOUSE_GOVERNANCA,
  construirHouseGovernancaSnapshotV2,
  type HouseGovernancaSnapshotV2,
  type SecaoHouseGovernanca,
} from './governanca-house-snapshot';

const PREFIXO = 'cardapio.v1.';
const SEMANA_RE = /^\d{4}-S(?:0[1-9]|[1-4]\d|5[0-3])$/;

function lerLocal<T>(chave: string, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    const raw = window.localStorage.getItem(PREFIXO + chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function precosEfetivos(): Record<string, number> {
  const local = lerLocal<Record<string, number>>('precos', {});
  return { ...PRECOS_COMPRAS, ...PRECOS_COTACAO_SEED, ...local };
}

function fornecedoresEfetivos(): Record<string, string> {
  const bruto = lerLocal<unknown>('fornecedores', {});
  const local = bruto && typeof bruto === 'object' && !Array.isArray(bruto)
    ? (bruto as Record<string, string>)
    : {};
  const merge = { ...MAPA_FORNECEDORES_SEED, ...local };
  for (const chave of Object.keys(merge)) {
    if (!merge[chave]?.trim() || ehRemetenteInterno(merge[chave])) delete merge[chave];
  }
  return merge;
}

function secoesPermitidas(secoes?: readonly string[]): SecaoHouseGovernanca[] {
  const permitidas = new Set<string>(SECOES_HOUSE_GOVERNANCA);
  if (!secoes?.length) return [...SECOES_HOUSE_GOVERNANCA];
  return [...new Set(secoes.filter((secao): secao is SecaoHouseGovernanca => permitidas.has(secao)))];
}

export function semanaGovernancaValida(semanaId: string): boolean {
  if (!SEMANA_RE.test(semanaId)) return false;
  const datas = datasDaSemana(semanaId);
  const [ano] = semanaId.split('-S').map(Number);
  const quinta = new Date(datas[3]);
  return quinta.getUTCFullYear() === ano;
}

/**
 * Lê somente o estado operacional necessário depois que o BootNuvem terminou.
 * Não acessa PIN, perfis, funcionários, contatos, notas fiscais nem auditoria.
 */
export async function lerHouseGovernancaSnapshotV2(opcoes: {
  semanaId: string;
  secoes?: readonly string[];
}): Promise<HouseGovernancaSnapshotV2> {
  const semanaId = opcoes.semanaId.trim();
  if (!semanaGovernancaValida(semanaId)) throw new Error('Semana House inválida.');

  await aguardarBootNuvem();

  const datas = datasDaSemana(semanaId).map((data) => data.toISOString().slice(0, 10));
  const secoes = secoesPermitidas(opcoes.secoes);
  const pontosPorData = Object.fromEntries(
    datas.map((data) => {
      const registro = lerPontosRefeicaoDia(data);
      return [data, registro ? { servido: registro.porPonto } : undefined];
    }),
  );

  return construirHouseGovernancaSnapshotV2({
    semanaId,
    datas,
    estado: lerSemana(semanaId),
    contagens: lerContagemRefeicoes(),
    pontosPorData,
    desperdicio: lerDesperdicio(semanaId),
    estoque: lerLocal<Estoque>('estoque', {}),
    precos: precosEfetivos(),
    fornecedores: fornecedoresEfetivos(),
    aceitacao: lerLocal<Aceitacao>('aceitacao', {}),
    secoes,
  });
}
