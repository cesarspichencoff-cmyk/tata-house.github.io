'use client';

import { validarSemana } from './motor';
import type { Aviso, DiaCardapio } from './tipos';

export const GOV_PLANEJADOR_READY_V1 = 'tata-house:governanca:planejador:ready:v1' as const;
export const GOV_PLANEJADOR_CONTEXT_V1 = 'tata-house:governanca:planejador:context:v1' as const;
export const GOV_PLANEJADOR_DRAFT_V1 = 'tata-house:governanca:planejador:draft:v1' as const;
export const GOV_PLANEJADOR_ACK_V1 = 'tata-house:governanca:planejador:ack:v1' as const;
export const ORIGEM_GOVERNANCA_PLANEJADOR_V1 = 'https://lideres.tatasushi.tech' as const;

const CONTRATO = 'tata-house-governanca' as const;
const UNIDADE_ALVO = 'tata-house' as const;
const SEMANA_RE = /^(\d{4})-S(\d{2})$/;
const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface PlanejadorContextoGovernancaV1 {
  contrato: typeof CONTRATO;
  versao: 1;
  tipo: 'planejamento.semana.contexto';
  origem: 'governanca';
  correlationId: string;
  semanaId: string;
  unidadeFonte: string;
  unidadeAlvo: typeof UNIDADE_ALVO;
}

export interface PlanejadorDiaDraftV1 {
  indice: number;
  data: string;
  pessoas: number;
  principal: string;
  guarnicaoFixa: string;
  guarnicao: string;
  salada: string;
  sobremesa: string;
}

export interface PlanejadorDraftGovernancaV1 {
  contrato: typeof CONTRATO;
  versao: 1;
  tipo: 'planejamento.semana.rascunho';
  origem: 'tata-house';
  proposalId: string;
  correlationId: string;
  criadoEm: string;
  semanaId: string;
  unidadeFonte: string;
  unidadeAlvo: typeof UNIDADE_ALVO;
  dias: PlanejadorDiaDraftV1[];
  diagnostico: {
    podeEnviar: boolean;
    bloqueios: string[];
    alertas: string[];
  };
}

export interface ProntidaoPlanejamento {
  podeEnviar: boolean;
  bloqueios: string[];
  alertas: string[];
  avisosMotor: Aviso[];
}

export interface ResultadoContextoPlanejador {
  tratado: boolean;
  aceito: boolean;
  contexto?: PlanejadorContextoGovernancaV1;
}

interface MensagemContextoV1 {
  type: typeof GOV_PLANEJADOR_CONTEXT_V1;
  payload?: unknown;
}

interface MensagemAckV1 {
  type: typeof GOV_PLANEJADOR_ACK_V1;
  escopo?: unknown;
  correlationId?: unknown;
  proposalId?: unknown;
  ok?: unknown;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function ehDataCalendario(v: string): boolean {
  const m = DATA_RE.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function isoWeekIdFromDate(d: Date): string {
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((data.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${data.getUTCFullYear()}-S${String(semana).padStart(2, '0')}`;
}

export function semanaIsoValida(v: string): boolean {
  const m = SEMANA_RE.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const semana = Number(m[2]);
  if (!Number.isInteger(ano) || semana < 1 || semana > 53) return false;
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const diaJan4 = jan4.getUTCDay() || 7;
  const segunda = new Date(jan4);
  segunda.setUTCDate(jan4.getUTCDate() - diaJan4 + 1 + (semana - 1) * 7);
  return isoWeekIdFromDate(segunda) === v;
}

export function datasDaSemanaIso(semanaId: string): string[] {
  if (!semanaIsoValida(semanaId)) return [];
  const [anoS, semanaS] = semanaId.split('-S');
  const ano = Number(anoS);
  const semana = Number(semanaS);
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const diaJan4 = jan4.getUTCDay() || 7;
  const segunda = new Date(jan4);
  segunda.setUTCDate(jan4.getUTCDate() - diaJan4 + 1 + (semana - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setUTCDate(segunda.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function normalizarContextoPlanejadorGovernanca(
  entrada: unknown,
): PlanejadorContextoGovernancaV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  const correlationId = texto(e.correlationId);
  const semanaId = texto(e.semanaId);
  const unidadeFonte = texto(e.unidadeFonte);

  if (
    e.contrato !== CONTRATO ||
    e.versao !== 1 ||
    e.tipo !== 'planejamento.semana.contexto' ||
    e.origem !== 'governanca' ||
    e.unidadeAlvo !== UNIDADE_ALVO ||
    !correlationId ||
    !semanaIsoValida(semanaId) ||
    !unidadeFonte
  ) {
    return null;
  }

  return {
    contrato: CONTRATO,
    versao: 1,
    tipo: 'planejamento.semana.contexto',
    origem: 'governanca',
    correlationId,
    semanaId,
    unidadeFonte,
    unidadeAlvo: UNIDADE_ALVO,
  };
}

export function processarMensagemContextoPlanejador(
  origem: string,
  dados: unknown,
  origemEsperada: string = ORIGEM_GOVERNANCA_PLANEJADOR_V1,
): ResultadoContextoPlanejador {
  if (origem !== origemEsperada || !dados || typeof dados !== 'object') {
    return { tratado: false, aceito: false };
  }

  const msg = dados as Partial<MensagemContextoV1>;
  if (msg.type !== GOV_PLANEJADOR_CONTEXT_V1) {
    return { tratado: false, aceito: false };
  }

  const contexto = normalizarContextoPlanejadorGovernanca(msg.payload);
  return contexto
    ? { tratado: true, aceito: true, contexto }
    : { tratado: true, aceito: false };
}

export function avaliarProntidaoPlanejamento(
  dias: DiaCardapio[],
  precos: Record<string, number>,
): ProntidaoPlanejamento {
  const avisosMotor = validarSemana(dias, precos);
  const bloqueios: string[] = [];
  const alertas: string[] = [];

  dias.forEach((dia, i) => {
    if (!texto(dia.principal)) bloqueios.push(`Dia ${i + 1}: prato principal ainda não definido.`);
    if (!Number.isFinite(dia.pessoas) || dia.pessoas <= 0) {
      bloqueios.push(`Dia ${i + 1}: previsão de pessoas inválida.`);
    }
  });

  avisosMotor.forEach((aviso) => {
    if (aviso.nivel === 'erro') bloqueios.push(aviso.msg);
    else if (aviso.nivel === 'alerta') alertas.push(aviso.msg);
  });

  return {
    podeEnviar: bloqueios.length === 0,
    bloqueios: Array.from(new Set(bloqueios)),
    alertas: Array.from(new Set(alertas)),
    avisosMotor,
  };
}

export function construirDraftPlanejamentoGovernanca(
  contexto: PlanejadorContextoGovernancaV1,
  dias: DiaCardapio[],
  prontidao: ProntidaoPlanejamento,
  proposalId: string,
  criadoEm: string = new Date().toISOString(),
): PlanejadorDraftGovernancaV1 {
  const datas = datasDaSemanaIso(contexto.semanaId);
  if (datas.length !== 7) throw new Error('Semana ISO inválida no planejamento.');
  if (!proposalId.trim()) throw new Error('proposalId obrigatório.');
  if (dias.length !== 7) throw new Error('O planejamento semanal precisa conter 7 dias.');
  if (Number.isNaN(Date.parse(criadoEm))) throw new Error('criadoEm inválido.');

  return {
    contrato: CONTRATO,
    versao: 1,
    tipo: 'planejamento.semana.rascunho',
    origem: 'tata-house',
    proposalId: proposalId.trim(),
    correlationId: contexto.correlationId,
    criadoEm,
    semanaId: contexto.semanaId,
    unidadeFonte: contexto.unidadeFonte,
    unidadeAlvo: UNIDADE_ALVO,
    dias: dias.map((dia, indice) => ({
      indice,
      data: datas[indice],
      pessoas: Math.round(dia.pessoas),
      principal: texto(dia.principal),
      guarnicaoFixa: texto(dia.guarnicaoFixa),
      guarnicao: texto(dia.guarnicao),
      salada: texto(dia.salada),
      sobremesa: texto(dia.sobremesa),
    })),
    diagnostico: {
      podeEnviar: prontidao.podeEnviar,
      bloqueios: [...prontidao.bloqueios],
      alertas: [...prontidao.alertas],
    },
  };
}

export function instalarHandoffPlanejadorGovernanca(opcoes: {
  aoContexto: (contexto: PlanejadorContextoGovernancaV1) => void;
  aoAckRascunho?: (ack: { proposalId: string; ok: boolean }) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};

  const aoReceber = (event: MessageEvent<unknown>) => {
    if (event.origin !== ORIGEM_GOVERNANCA_PLANEJADOR_V1 || !event.data || typeof event.data !== 'object') {
      return;
    }

    const dados = event.data as Record<string, unknown>;
    if (dados.type === GOV_PLANEJADOR_ACK_V1 && dados.escopo === 'rascunho') {
      const proposalId = texto(dados.proposalId);
      if (proposalId) opcoes.aoAckRascunho?.({ proposalId, ok: dados.ok === true });
      return;
    }

    const resultado = processarMensagemContextoPlanejador(
      event.origin,
      event.data,
      ORIGEM_GOVERNANCA_PLANEJADOR_V1,
    );
    if (!resultado.tratado) return;

    const correlationId = resultado.contexto?.correlationId ?? null;
    try {
      (event.source as Window | null)?.postMessage(
        {
          type: GOV_PLANEJADOR_ACK_V1,
          escopo: 'contexto',
          correlationId,
          ok: resultado.aceito,
        },
        ORIGEM_GOVERNANCA_PLANEJADOR_V1,
      );
    } catch {
      // O contexto continua rejeitado/aceito localmente mesmo se o ACK falhar.
    }

    if (resultado.aceito && resultado.contexto) opcoes.aoContexto(resultado.contexto);
  };

  window.addEventListener('message', aoReceber);

  const ready = { type: GOV_PLANEJADOR_READY_V1, versao: 1 };
  try {
    window.opener?.postMessage(ready, ORIGEM_GOVERNANCA_PLANEJADOR_V1);
  } catch {}
  try {
    if (window.parent !== window) window.parent.postMessage(ready, ORIGEM_GOVERNANCA_PLANEJADOR_V1);
  } catch {}

  return () => window.removeEventListener('message', aoReceber);
}

export function enviarDraftPlanejamentoGovernanca(draft: PlanejadorDraftGovernancaV1): boolean {
  if (typeof window === 'undefined') return false;
  const msg = { type: GOV_PLANEJADOR_DRAFT_V1, payload: draft };
  let enviado = false;

  try {
    if (window.opener) {
      window.opener.postMessage(msg, ORIGEM_GOVERNANCA_PLANEJADOR_V1);
      enviado = true;
    }
  } catch {}

  try {
    if (window.parent !== window) {
      window.parent.postMessage(msg, ORIGEM_GOVERNANCA_PLANEJADOR_V1);
      enviado = true;
    }
  } catch {}

  return enviado;
}

export function validarDraftPlanejamentoGovernanca(entrada: unknown): PlanejadorDraftGovernancaV1 | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  const proposalId = texto(e.proposalId);
  const correlationId = texto(e.correlationId);
  const criadoEm = texto(e.criadoEm);
  const semanaId = texto(e.semanaId);
  const unidadeFonte = texto(e.unidadeFonte);
  const dias = Array.isArray(e.dias) ? e.dias : [];

  if (
    e.contrato !== CONTRATO ||
    e.versao !== 1 ||
    e.tipo !== 'planejamento.semana.rascunho' ||
    e.origem !== 'tata-house' ||
    e.unidadeAlvo !== UNIDADE_ALVO ||
    !proposalId ||
    !correlationId ||
    !unidadeFonte ||
    !semanaIsoValida(semanaId) ||
    Number.isNaN(Date.parse(criadoEm)) ||
    dias.length !== 7
  ) {
    return null;
  }

  const datasEsperadas = datasDaSemanaIso(semanaId);
  const diasNormalizados: PlanejadorDiaDraftV1[] = [];
  for (let i = 0; i < 7; i++) {
    const d = dias[i];
    if (!d || typeof d !== 'object') return null;
    const dia = d as Record<string, unknown>;
    const data = texto(dia.data);
    const principal = texto(dia.principal);
    const pessoas = Number(dia.pessoas);
    if (
      dia.indice !== i ||
      data !== datasEsperadas[i] ||
      !ehDataCalendario(data) ||
      !Number.isFinite(pessoas) ||
      pessoas <= 0 ||
      !principal
    ) {
      return null;
    }
    diasNormalizados.push({
      indice: i,
      data,
      pessoas: Math.round(pessoas),
      principal,
      guarnicaoFixa: texto(dia.guarnicaoFixa),
      guarnicao: texto(dia.guarnicao),
      salada: texto(dia.salada),
      sobremesa: texto(dia.sobremesa),
    });
  }

  const diagnosticoEntrada = e.diagnostico && typeof e.diagnostico === 'object'
    ? (e.diagnostico as Record<string, unknown>)
    : {};
  const bloqueios = Array.isArray(diagnosticoEntrada.bloqueios)
    ? diagnosticoEntrada.bloqueios.map(texto).filter(Boolean)
    : [];
  const alertas = Array.isArray(diagnosticoEntrada.alertas)
    ? diagnosticoEntrada.alertas.map(texto).filter(Boolean)
    : [];

  return {
    contrato: CONTRATO,
    versao: 1,
    tipo: 'planejamento.semana.rascunho',
    origem: 'tata-house',
    proposalId,
    correlationId,
    criadoEm,
    semanaId,
    unidadeFonte,
    unidadeAlvo: UNIDADE_ALVO,
    dias: diasNormalizados,
    diagnostico: {
      podeEnviar: diagnosticoEntrada.podeEnviar === true,
      bloqueios,
      alertas,
    },
  };
}
