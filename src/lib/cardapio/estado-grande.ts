'use client';

import { definirArmazenamentoLocalCheio } from './aviso-armazenamento';
import {
  adicionarAuditoria,
  adicionarPontoHistorico,
  AUDITORIA_VAZIA,
  auditoriaDeLegado,
  CHAVE_AUDITORIA_V2,
  CHAVE_HISTORICO_V2,
  ehAuditoriaV2,
  ehChaveEstadoGrande,
  ehHistoricoV2,
  HISTORICO_VAZIO,
  historicoDeLegado,
  limparAuditoria,
  mesclarAuditoria,
  mesclarHistorico,
  type AuditoriaV2,
  type HistoricoPrecosV2,
} from './estado-grande-merge';
import { serializarCanonico } from './sync-util';
import { idbGravar, idbLer } from './idb';
import { armazenamentoSupabase } from './supabase/armazenamento';
import { PREFIXO_LOCAL, supabaseHabilitado } from './supabase/config';
import { definirPendentesNuvem, definirStatusNuvem } from './supabase/status';
import type { HistoricoPrecos, RegistroAuditoria } from './tipos';

const CHAVE_PENDENTES = '__pendentes.estado-grande';
const FONTE_PENDENTES = 'estado-grande';

let auditoria: AuditoriaV2 = { ...AUDITORIA_VAZIA };
let historico: HistoricoPrecosV2 = { ...HISTORICO_VAZIO, historico: {} };

const ouvintesAuditoria = new Set<() => void>();
const ouvintesHistorico = new Set<() => void>();
const pendentes = new Set<string>();
const confirmadas = new Set<string>();

let revisaoAuditoria = 0;
let revisaoHistorico = 0;
let legadoAuditoriaLocal = false;
let legadoHistoricoLocal = false;
let remotoLiberado = false;
let inicializacao: Promise<void> | null = null;
let filaPersistencia: Promise<void> = Promise.resolve();
let timerFlush: ReturnType<typeof setTimeout> | null = null;
let flushEmAndamento: Promise<void> | null = null;

function notificarAuditoria() {
  ouvintesAuditoria.forEach((f) => f());
}

function notificarHistorico() {
  ouvintesHistorico.forEach((f) => f());
}

function lerLocalJson(chave: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIXO_LOCAL + chave);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistirEstadoAtual(): Promise<void> {
  filaPersistencia = filaPersistencia.then(async () => {
    await idbGravar('estado', CHAVE_AUDITORIA_V2, auditoria);
    await idbGravar('estado', CHAVE_HISTORICO_V2, historico);
    await idbGravar('estado', CHAVE_PENDENTES, Array.from(pendentes));
  });
  return filaPersistencia;
}

function atualizarPendentes() {
  definirPendentesNuvem(supabaseHabilitado() ? pendentes.size : 0, FONTE_PENDENTES);
}

function revisaoDa(chave: string): number {
  return chave === CHAVE_AUDITORIA_V2 ? revisaoAuditoria : revisaoHistorico;
}

function incrementarRevisao(chave: string) {
  if (chave === CHAVE_AUDITORIA_V2) revisaoAuditoria += 1;
  else if (chave === CHAVE_HISTORICO_V2) revisaoHistorico += 1;
}

function marcarPendente(chave: string, novaRevisao = true) {
  if (novaRevisao) incrementarRevisao(chave);
  pendentes.add(chave);
  atualizarPendentes();
  void persistirEstadoAtual();
  if (remotoLiberado) agendarFlush();
}

function removerPendenteSeMesmaRevisao(chave: string, revisaoEnviada: number) {
  if (revisaoDa(chave) === revisaoEnviada) pendentes.delete(chave);
  atualizarPendentes();
}

function temAuditoria(): boolean {
  return auditoria.registros.length > 0 || auditoria.limpoAte !== null;
}

function temHistorico(): boolean {
  return Object.keys(historico.historico).length > 0;
}

async function limparLegadosConfirmados() {
  if (typeof window === 'undefined') return;
  await persistirEstadoAtual();

  let removeu = false;
  try {
    if (legadoAuditoriaLocal && confirmadas.has(CHAVE_AUDITORIA_V2) && !pendentes.has(CHAVE_AUDITORIA_V2)) {
      localStorage.removeItem(PREFIXO_LOCAL + 'auditoria');
      legadoAuditoriaLocal = false;
      removeu = true;
    }
    if (legadoHistoricoLocal && confirmadas.has(CHAVE_HISTORICO_V2) && !pendentes.has(CHAVE_HISTORICO_V2)) {
      localStorage.removeItem(PREFIXO_LOCAL + 'historicoPrecos');
      legadoHistoricoLocal = false;
      removeu = true;
    }
  } catch {
    /* remoção é best-effort; a cópia canônica já foi confirmada na nuvem */
  }
  if (removeu) definirArmazenamentoLocalCheio(false);
}

export function snapshotAuditoria(): RegistroAuditoria[] {
  return auditoria.registros;
}

export function snapshotHistoricoPrecos(): HistoricoPrecos {
  return historico.historico;
}

export function assinarAuditoria(fn: () => void): () => void {
  ouvintesAuditoria.add(fn);
  return () => ouvintesAuditoria.delete(fn);
}

export function assinarHistoricoPrecos(fn: () => void): () => void {
  ouvintesHistorico.add(fn);
  return () => ouvintesHistorico.delete(fn);
}

export function inicializarEstadoGrandeLocal(): Promise<void> {
  if (inicializacao) return inicializacao;

  inicializacao = (async () => {
    const [audIdb, histIdb, pendIdb] = await Promise.all([
      idbLer<unknown>('estado', CHAVE_AUDITORIA_V2, null),
      idbLer<unknown>('estado', CHAVE_HISTORICO_V2, null),
      idbLer<unknown>('estado', CHAVE_PENDENTES, []),
    ]);

    if (ehAuditoriaV2(audIdb)) auditoria = mesclarAuditoria(auditoria, audIdb);
    if (ehHistoricoV2(histIdb)) historico = mesclarHistorico(historico, histIdb);
    if (Array.isArray(pendIdb)) {
      for (const k of pendIdb) {
        if (k === CHAVE_AUDITORIA_V2 || k === CHAVE_HISTORICO_V2) pendentes.add(k);
      }
    }

    const audLegado = lerLocalJson('auditoria');
    if (Array.isArray(audLegado) && audLegado.length > 0) {
      auditoria = mesclarAuditoria(auditoria, auditoriaDeLegado(audLegado));
      legadoAuditoriaLocal = true;
      marcarPendente(CHAVE_AUDITORIA_V2);
    }

    const histLegado = lerLocalJson('historicoPrecos');
    if (histLegado && typeof histLegado === 'object' && !Array.isArray(histLegado)) {
      historico = mesclarHistorico(historico, historicoDeLegado(histLegado));
      legadoHistoricoLocal = true;
      marcarPendente(CHAVE_HISTORICO_V2);
    }

    await persistirEstadoAtual();
    atualizarPendentes();
    notificarAuditoria();
    notificarHistorico();
  })();

  return inicializacao;
}

export function registrarAuditoriaPersistente(registro: RegistroAuditoria) {
  void inicializarEstadoGrandeLocal();
  const novo = adicionarAuditoria(auditoria, registro);
  if (serializarCanonico(novo) === serializarCanonico(auditoria)) return;
  auditoria = novo;
  notificarAuditoria();
  marcarPendente(CHAVE_AUDITORIA_V2);
}

export function limparAuditoriaPersistente() {
  void inicializarEstadoGrandeLocal();
  auditoria = limparAuditoria(auditoria, new Date().toISOString());
  notificarAuditoria();
  marcarPendente(CHAVE_AUDITORIA_V2);
}

export function registrarPontoPrecoPersistente(itemNorm: string, valor: number, em: string) {
  if (!itemNorm || !Number.isFinite(valor) || valor <= 0) return;
  void inicializarEstadoGrandeLocal();
  const novo = adicionarPontoHistorico(historico, itemNorm, valor, em);
  if (serializarCanonico(novo) === serializarCanonico(historico)) return;
  historico = novo;
  notificarHistorico();
  marcarPendente(CHAVE_HISTORICO_V2);
}

export async function mesclarSeedHistoricoPersistente(seed: HistoricoPrecos): Promise<void> {
  await inicializarEstadoGrandeLocal();
  const novo = mesclarHistorico(historico, { versao: 2, historico: seed });
  if (serializarCanonico(novo) === serializarCanonico(historico)) return;
  historico = novo;
  notificarHistorico();
  marcarPendente(CHAVE_HISTORICO_V2);
}

export function absorverEstadoGrandeLocal(chave: string, valor: unknown): boolean {
  if (!ehChaveEstadoGrande(chave)) return false;
  void inicializarEstadoGrandeLocal();

  if (chave === 'auditoria' || chave === CHAVE_AUDITORIA_V2) {
    const entrada = ehAuditoriaV2(valor) ? valor : auditoriaDeLegado(valor);
    const novo = mesclarAuditoria(auditoria, entrada);
    if (serializarCanonico(novo) !== serializarCanonico(auditoria)) {
      auditoria = novo;
      notificarAuditoria();
      marcarPendente(CHAVE_AUDITORIA_V2);
    }
    return true;
  }

  const entrada = ehHistoricoV2(valor) ? valor : historicoDeLegado(valor);
  const novo = mesclarHistorico(historico, entrada);
  if (serializarCanonico(novo) !== serializarCanonico(historico)) {
    historico = novo;
    notificarHistorico();
    marcarPendente(CHAVE_HISTORICO_V2);
  }
  return true;
}

export async function aplicarEstadoGrandeDaNuvem(chave: string, valor: unknown): Promise<boolean> {
  if (!ehChaveEstadoGrande(chave)) return false;
  await inicializarEstadoGrandeLocal();

  if (chave === 'auditoria') {
    const novo = mesclarAuditoria(auditoria, auditoriaDeLegado(valor));
    if (serializarCanonico(novo) !== serializarCanonico(auditoria)) {
      auditoria = novo;
      notificarAuditoria();
    }
    marcarPendente(CHAVE_AUDITORIA_V2);
    await persistirEstadoAtual();
    return true;
  }

  if (chave === 'historicoPrecos') {
    const novo = mesclarHistorico(historico, historicoDeLegado(valor));
    if (serializarCanonico(novo) !== serializarCanonico(historico)) {
      historico = novo;
      notificarHistorico();
    }
    marcarPendente(CHAVE_HISTORICO_V2);
    await persistirEstadoAtual();
    return true;
  }

  if (chave === CHAVE_AUDITORIA_V2 && ehAuditoriaV2(valor)) {
    const remoto = valor;
    const novo = mesclarAuditoria(auditoria, remoto);
    const precisaDevolver = serializarCanonico(novo) !== serializarCanonico(remoto);
    const mudouLocal = serializarCanonico(novo) !== serializarCanonico(auditoria);
    auditoria = novo;
    if (mudouLocal) notificarAuditoria();

    if (precisaDevolver) marcarPendente(CHAVE_AUDITORIA_V2);
    else {
      pendentes.delete(CHAVE_AUDITORIA_V2);
      confirmadas.add(CHAVE_AUDITORIA_V2);
      atualizarPendentes();
    }
    await persistirEstadoAtual();
    await limparLegadosConfirmados();
    return true;
  }

  if (chave === CHAVE_HISTORICO_V2 && ehHistoricoV2(valor)) {
    const remoto = valor;
    const novo = mesclarHistorico(historico, remoto);
    const precisaDevolver = serializarCanonico(novo) !== serializarCanonico(remoto);
    const mudouLocal = serializarCanonico(novo) !== serializarCanonico(historico);
    historico = novo;
    if (mudouLocal) notificarHistorico();

    if (precisaDevolver) marcarPendente(CHAVE_HISTORICO_V2);
    else {
      pendentes.delete(CHAVE_HISTORICO_V2);
      confirmadas.add(CHAVE_HISTORICO_V2);
      atualizarPendentes();
    }
    await persistirEstadoAtual();
    await limparLegadosConfirmados();
    return true;
  }

  return true;
}

async function flushInterno(): Promise<boolean> {
  if (!remotoLiberado || !supabaseHabilitado()) return false;
  await inicializarEstadoGrandeLocal();
  if (pendentes.size === 0) {
    atualizarPendentes();
    return false;
  }

  definirStatusNuvem('sincronizando');
  let houveErro = false;

  for (const chave of [CHAVE_AUDITORIA_V2, CHAVE_HISTORICO_V2]) {
    if (!pendentes.has(chave)) continue;
    const revisaoEnviada = revisaoDa(chave);
    const valor = chave === CHAVE_AUDITORIA_V2 ? auditoria : historico;

    try {
      await armazenamentoSupabase.gravar(chave, valor);
      confirmadas.add(chave);
      removerPendenteSeMesmaRevisao(chave, revisaoEnviada);
      await persistirEstadoAtual();
      await limparLegadosConfirmados();
    } catch {
      houveErro = true;
      pendentes.add(chave);
      atualizarPendentes();
      await persistirEstadoAtual();
    }
  }

  if (houveErro) definirStatusNuvem('erro');
  else if (pendentes.size === 0) definirStatusNuvem('online');
  return houveErro;
}

function agendarFlush() {
  if (!remotoLiberado || !supabaseHabilitado()) return;
  if (timerFlush) clearTimeout(timerFlush);
  timerFlush = setTimeout(() => {
    timerFlush = null;
    void reenviarEstadoGrandePendente();
  }, 350);
}

export function reenviarEstadoGrandePendente(): Promise<void> {
  if (flushEmAndamento) return flushEmAndamento;
  let falhou = false;
  flushEmAndamento = flushInterno()
    .then((x) => { falhou = x; })
    .finally(() => {
      flushEmAndamento = null;
      // Se uma nova edição aconteceu enquanto um envio BEM-SUCEDIDO estava
      // em voo, há uma revisão mais nova pendente e fazemos a segunda rodada.
      // Em falha de rede, não criamos loop agressivo: o BootNuvem tenta de
      // novo ao reconectar/voltar para a aba.
      if (pendentes.size > 0 && remotoLiberado && !falhou) agendarFlush();
    });
  return flushEmAndamento;
}

export async function liberarEstadoGrandeParaNuvem(chavesNuvem: string[]): Promise<void> {
  await inicializarEstadoGrandeLocal();

  if (!chavesNuvem.includes(CHAVE_AUDITORIA_V2) && temAuditoria()) {
    marcarPendente(CHAVE_AUDITORIA_V2, false);
  }
  if (!chavesNuvem.includes(CHAVE_HISTORICO_V2) && temHistorico()) {
    marcarPendente(CHAVE_HISTORICO_V2, false);
  }

  remotoLiberado = true;
  await reenviarEstadoGrandePendente();
}

export function estadoGrandePendente(): number {
  return pendentes.size;
}
