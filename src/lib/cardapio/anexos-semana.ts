'use client';

import { idbGravar, idbLer, idbRemover } from './idb';
import type { EstadoSemana } from './tipos';

export interface AnexosSemana {
  notas?: EstadoSemana['notas'];
  notasFiscais?: EstadoSemana['notasFiscais'];
}

const PREFIXO_ANEXO = 'anexos.';

function temProp(obj: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, chave);
}

function chaveIdb(chaveSemana: string): string {
  return PREFIXO_ANEXO + chaveSemana;
}

/**
 * Documento leve para cache local. Fotos/dataURLs de NF não pertencem ao
 * localStorage: elas podem ter centenas de KB e fazem uma única semana ocupar
 * boa parte da quota pequena do Safari. O documento completo continua sendo o
 * payload de nuvem; os anexos ficam duráveis no IndexedDB deste aparelho.
 */
export function estadoSemAnexosSemana(estado: EstadoSemana): EstadoSemana {
  const clone = { ...estado };
  delete clone.notas;
  delete clone.notasFiscais;
  return clone;
}

export function extrairAnexosSemana(estado: EstadoSemana): AnexosSemana {
  const anexos: AnexosSemana = {};
  if (temProp(estado, 'notas')) anexos.notas = estado.notas;
  if (temProp(estado, 'notasFiscais')) anexos.notasFiscais = estado.notasFiscais;
  return anexos;
}

export function temCamposAnexoSemana(estado: EstadoSemana): boolean {
  return temProp(estado, 'notas') || temProp(estado, 'notasFiscais');
}

/**
 * Persiste somente quando o payload traz explicitamente campos de anexo.
 * Um documento compacto não apaga o arquivo já existente por acidente.
 */
export async function persistirAnexosSemana(chaveSemana: string, estado: EstadoSemana): Promise<boolean> {
  if (!temCamposAnexoSemana(estado)) return true;
  const anexos = extrairAnexosSemana(estado);
  const temNotas = !!anexos.notas && Object.keys(anexos.notas).length > 0;
  const temNfs = !!anexos.notasFiscais && anexos.notasFiscais.length > 0;
  if (!temNotas && !temNfs) return idbRemover('estado', chaveIdb(chaveSemana));
  return idbGravar('estado', chaveIdb(chaveSemana), anexos);
}

/** Reidrata anexos arquivados sem sobrescrever um campo explícito do estado. */
export async function hidratarAnexosSemana(chaveSemana: string, estado: EstadoSemana): Promise<EstadoSemana> {
  const anexos = await idbLer<AnexosSemana | null>('estado', chaveIdb(chaveSemana), null);
  if (!anexos) return estado;
  const out: EstadoSemana = { ...estado };
  if (!temProp(estado, 'notas') && anexos.notas && Object.keys(anexos.notas).length > 0) out.notas = anexos.notas;
  if (!temProp(estado, 'notasFiscais') && anexos.notasFiscais && anexos.notasFiscais.length > 0) out.notasFiscais = anexos.notasFiscais;
  return out;
}
