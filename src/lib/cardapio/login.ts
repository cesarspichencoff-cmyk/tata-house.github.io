'use client';

/* =====================================================================
   Login por perfil (controle de acesso). Três perfis: Gerência (completo),
   Compras (cotação/compras/estoque/preços/inventário) e Cozinha/Conferência
   (operacional). Cada perfil mapeia para um papel (matriz de permissões em
   org.ts) e para o conjunto de abas visíveis.

   Observação: é um portão simples por PIN (suficiente para uso interno).
   Autenticação real (Supabase Auth) fica para a fase de banco de dados.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import type { Papel } from './tipos';

const PREFIXO = 'cardapio.v1.';

function ler<T>(chave: string, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    const raw = localStorage.getItem(PREFIXO + chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível */
  }
}

export type PerfilLogin = 'gerencia' | 'compras' | 'cozinha';
export type AbaId = 'agora' | 'cardapio' | 'compras' | 'relatorios' | 'ajustes';

export interface DefPerfil {
  id: PerfilLogin;
  rotulo: string;
  descricao: string;
  icone: string;
  papel: Papel;
  abas: AbaId[];
  pinPadrao: string;
}

export const PERFIS: DefPerfil[] = [
  {
    id: 'gerencia',
    rotulo: 'Gerência',
    descricao: 'Acesso completo: hoje, planejamento, abastecimento, análise e gestão',
    icone: '',
    papel: 'administrador',
    abas: ['agora', 'cardapio', 'compras', 'relatorios', 'ajustes'],
    pinPadrao: '1234',
  },
  {
    id: 'compras',
    rotulo: 'Compras',
    descricao: 'Abastecimento: necessidades, estoque, preços, notas e pedidos',
    icone: '',
    papel: 'compras',
    abas: ['compras', 'relatorios'],
    pinPadrao: '1111',
  },
  {
    id: 'cozinha',
    rotulo: 'Cozinha / Conferência',
    descricao: 'Execução: cardápio da semana, conferência, recebimento e feedback',
    icone: '',
    papel: 'cozinha',
    abas: ['agora', 'cardapio', 'compras'],
    pinPadrao: '2222',
  },
];

export function perfilDe(id: PerfilLogin | null): DefPerfil | null {
  return PERFIS.find((p) => p.id === id) ?? null;
}

/** Abas visíveis para um papel (navegação muda conforme o login). */
export function abasDoPapel(papel: Papel): AbaId[] {
  const mapa: Record<Papel, AbaId[]> = {
    administrador: ['agora', 'cardapio', 'compras', 'relatorios', 'ajustes'],
    gestor:        ['agora', 'cardapio', 'compras', 'relatorios', 'ajustes'],
    compras:       ['compras', 'relatorios'],
    cozinha:       ['agora', 'cardapio', 'compras'],
    recebimento:   ['compras'],
  };
  return mapa[papel] ?? ['agora'];
}

/* ── Hash de PIN (SHA-256 + sal fixo) ───────────────────────────────────
   Os PINs personalizados são guardados como hash — nunca em texto puro no
   localStorage nem na nuvem (que é espelhada). Não é autenticação de banco,
   mas tira o PIN de circulação em claro. Auth real (Supabase Auth + RLS) é
   o próximo nível, documentado em supabase/functions. */
const ehHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

async function hashPin(pin: string): Promise<string> {
  const dados = new TextEncoder().encode('tata-house:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confere o PIN contra o esperado (hash do custom, ou o padrão em claro). */
async function pinConfere(id: PerfilLogin, pin: string): Promise<boolean> {
  const custom = ler<Record<string, string>>('login.pins', {});
  const stored = custom[id];
  if (stored) {
    // custom hasheado → compara hash; legado em claro → compara direto (migra ao trocar)
    return ehHash(stored) ? (await hashPin(pin)) === stored : pin === stored;
  }
  return pin === (perfilDe(id)?.pinPadrao ?? '');
}

export function useLogin() {
  const [perfilId, setPerfilId] = useState<PerfilLogin | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setPerfilId(ler<PerfilLogin | null>('login.perfil', null));
    setPronto(true);
  }, []);

  const entrar = useCallback(async (id: PerfilLogin, pin: string): Promise<boolean> => {
    if (!(await pinConfere(id, pin))) return false;
    const perfil = perfilDe(id);
    if (!perfil) return false;
    gravar('login.perfil', id);
    gravar('papel', perfil.papel); // alimenta o pode() já existente
    setPerfilId(id);
    return true;
  }, []);

  const sair = useCallback(() => {
    gravar('login.perfil', null);
    setPerfilId(null);
  }, []);

  const definirPin = useCallback(async (id: PerfilLogin, pin: string) => {
    const novo = { ...ler<Record<string, string>>('login.pins', {}), [id]: await hashPin(pin) };
    gravar('login.pins', novo);
  }, []);

  return { perfilId, perfil: perfilDe(perfilId), pronto, entrar, sair, definirPin };
}
