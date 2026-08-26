import type { HistoricoPrecos, RegistroAuditoria } from './tipos';
import { serializarCanonico } from './sync-util';

export const CHAVE_AUDITORIA_V2 = '__v2.auditoria';
export const CHAVE_HISTORICO_V2 = '__v2.historicoPrecos';

export interface AuditoriaV2 {
  versao: 2;
  limpoAte: string | null;
  registros: RegistroAuditoria[];
}

export interface HistoricoPrecosV2 {
  versao: 2;
  historico: HistoricoPrecos;
}

export const AUDITORIA_VAZIA: AuditoriaV2 = { versao: 2, limpoAte: null, registros: [] };
export const HISTORICO_VAZIO: HistoricoPrecosV2 = { versao: 2, historico: {} };

export function ehChaveEstadoGrande(chave: string): boolean {
  return (
    chave === 'auditoria' ||
    chave === 'historicoPrecos' ||
    chave === CHAVE_AUDITORIA_V2 ||
    chave === CHAVE_HISTORICO_V2
  );
}

export function ehAuditoriaV2(valor: unknown): valor is AuditoriaV2 {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Partial<AuditoriaV2>;
  return v.versao === 2 && Array.isArray(v.registros) && (typeof v.limpoAte === 'string' || v.limpoAte === null);
}

export function ehHistoricoV2(valor: unknown): valor is HistoricoPrecosV2 {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Partial<HistoricoPrecosV2>;
  return v.versao === 2 && !!v.historico && typeof v.historico === 'object' && !Array.isArray(v.historico);
}

export function auditoriaDeLegado(valor: unknown): AuditoriaV2 {
  return {
    versao: 2,
    limpoAte: null,
    registros: Array.isArray(valor) ? (valor as RegistroAuditoria[]) : [],
  };
}

export function historicoDeLegado(valor: unknown): HistoricoPrecosV2 {
  const historico =
    valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as HistoricoPrecos)
      : {};
  return { versao: 2, historico };
}

function maisNovo(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function assinaturaAuditoria(r: RegistroAuditoria): string {
  return serializarCanonico({
    em: r.em,
    papel: r.papel,
    acao: r.acao,
    alvo: r.alvo,
    de: r.de ?? null,
    para: r.para ?? null,
    semana: r.semana ?? null,
    contexto: r.contexto ?? null,
  });
}

function compararTextoDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

function compararAuditoria(x: RegistroAuditoria, y: RegistroAuditoria): number {
  const porTempo = compararTextoDesc(x.em, y.em);
  if (porTempo !== 0) return porTempo;

  return compararTextoDesc(assinaturaAuditoria(x), assinaturaAuditoria(y));
}

export function mesclarAuditoria(a: AuditoriaV2, b: AuditoriaV2): AuditoriaV2 {
  const limpoAte = maisNovo(a.limpoAte, b.limpoAte);
  const porId = new Map<string, RegistroAuditoria>();

  for (const r of [...a.registros, ...b.registros]) {
    if (!r || typeof r.em !== 'string') continue;
    if (limpoAte && r.em <= limpoAte) continue;
    porId.set(assinaturaAuditoria(r), r);
  }

  const registros = Array.from(porId.values())
    .sort(compararAuditoria)
    .slice(0, 800);

  return { versao: 2, limpoAte, registros };
}

export function adicionarAuditoria(
  atual: AuditoriaV2,
  registro: RegistroAuditoria,
): AuditoriaV2 {
  return mesclarAuditoria(atual, {
    versao: 2,
    limpoAte: atual.limpoAte,
    registros: [registro],
  });
}

export function limparAuditoria(atual: AuditoriaV2, em: string): AuditoriaV2 {
  return mesclarAuditoria(atual, { versao: 2, limpoAte: em, registros: [] });
}

function assinaturaPonto(p: { valor: number; em: string }): string {
  return `${p.em}\u0000${String(p.valor)}`;
}

export function mesclarHistorico(
  a: HistoricoPrecosV2,
  b: HistoricoPrecosV2,
): HistoricoPrecosV2 {
  const chaves = new Set([...Object.keys(a.historico), ...Object.keys(b.historico)]);
  const historico: HistoricoPrecos = {};

  for (const item of Array.from(chaves)) {
    const porId = new Map<string, { valor: number; em: string }>();
    for (const p of [...(a.historico[item] ?? []), ...(b.historico[item] ?? [])]) {
      if (!p || typeof p.em !== 'string' || !Number.isFinite(p.valor)) continue;
      porId.set(assinaturaPonto(p), { valor: p.valor, em: p.em });
    }
    const serie = Array.from(porId.values())
      .sort((x, y) => x.em.localeCompare(y.em))
      .slice(-40);
    if (serie.length) historico[item] = serie;
  }

  return { versao: 2, historico };
}

export function adicionarPontoHistorico(
  atual: HistoricoPrecosV2,
  itemNorm: string,
  valor: number,
  em: string,
): HistoricoPrecosV2 {
  return mesclarHistorico(atual, {
    versao: 2,
    historico: { [itemNorm]: [{ valor, em }] },
  });
}
