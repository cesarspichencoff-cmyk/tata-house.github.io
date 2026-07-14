'use client';

/* =====================================================================
   Motor de sincronização automática com a nuvem (Supabase) + PWA.
   - Registra o service worker (app abre offline).
   - Toda gravação local é espelhada na nuvem (fire-and-forget).
   - Ao abrir, traz o que está na nuvem e reconcilia o estado na hora.
   - AO VIVO: escuta mudanças de outros aparelhos (Supabase Realtime) e
     aplica no estado React in-place — SEM recarregar a página. A aba que
     está editando nunca é interrompida; as demais atualizam suavemente.
   Quando o Supabase está desligado, só o service worker é registrado.
   ===================================================================== */

import { useEffect } from 'react';
import {
  armazenamentoSupabase,
  supabaseHabilitado,
  getSupabase,
  ESPACO_DADOS,
  definirStatusNuvem,
} from '@/lib/cardapio/supabase';
import { notificarChaveExterna } from '@/lib/cardapio/estado';
import { mesclarSemana } from '@/lib/cardapio/merge-semana';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const PREFIXO = 'cardapio.v1.';
const ig = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function BootNuvem() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 0) Service worker (PWA offline) — independe do Supabase.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (!supabaseHabilitado()) {
      definirStatusNuvem('desligado');
      return;
    }
    definirStatusNuvem('conectando');

    const orig = localStorage.setItem.bind(localStorage);

    // chaves que ESTE aparelho acabou de gravar — para ignorar o próprio eco
    // quando o Realtime devolver a mudança que nós mesmos fizemos.
    const recentes: Map<string, number> =
      (window as unknown as { __nuvemRecentes?: Map<string, number> }).__nuvemRecentes ??
      ((window as unknown as { __nuvemRecentes?: Map<string, number> }).__nuvemRecentes = new Map());

    // Outbox offline: chaves cuja última subida à nuvem FALHOU (wifi caiu).
    // Persistem no localStorage e são reenviadas ao reconectar — sem isso,
    // uma edição feita offline nunca chegaria aos outros aparelhos.
    const PENDENTES = '__pending';
    const lerPendentes = (): string[] => {
      try { return JSON.parse(localStorage.getItem(PREFIXO + PENDENTES) || '[]'); } catch { return []; }
    };
    const marcarPendente = (k: string, pendente: boolean) => {
      const arr = lerPendentes().filter((x) => x !== k);
      if (pendente) arr.push(k);
      try { orig(PREFIXO + PENDENTES, JSON.stringify(arr)); } catch { /* cheio */ }
    };

    // Sobe um valor à nuvem, atualizando status e a fila offline.
    const subir = (k: string, valor: unknown) => {
      definirStatusNuvem('sincronizando');
      return armazenamentoSupabase
        .gravar(k, valor)
        .then(() => { marcarPendente(k, false); definirStatusNuvem('online'); })
        .catch(() => { marcarPendente(k, true); definirStatusNuvem('erro'); });
    };

    // Reenvia tudo que ficou pendente (chamado ao reconectar / voltar à aba).
    const flush = () => {
      for (const k of lerPendentes()) {
        const raw = localStorage.getItem(PREFIXO + k);
        if (raw == null) { marcarPendente(k, false); continue; }
        try { subir(k, JSON.parse(raw)); } catch { marcarPendente(k, false); }
      }
    };

    // 1) Espelha toda gravação local (cardapio.v1.*) na nuvem.
    if (!(window as unknown as { __nuvemPatched?: boolean }).__nuvemPatched) {
      localStorage.setItem = (chave: string, valor: string) => {
        orig(chave, valor);
        if (typeof chave === 'string' && chave.startsWith(PREFIXO)) {
          const k = chave.slice(PREFIXO.length);
          if (k.startsWith('__')) return; // marcadores locais (base/pending) — não vão à nuvem
          recentes.set(k, Date.now());
          try {
            subir(k, JSON.parse(valor));
          } catch {
            /* valor não-JSON: ignora */
          }
        }
      };
      (window as unknown as { __nuvemPatched?: boolean }).__nuvemPatched = true;
    }

    // Base (ancestral comum) do merge de cada semana. SÓ avança quando algo
    // chega da nuvem — nunca nas gravações locais — senão o merge descartaria
    // a edição local. Persiste no localStorage (sobrevive entre sessões).
    const lerBase = (chave: string): EstadoSemana | null => {
      try {
        const r = localStorage.getItem(PREFIXO + '__base.' + chave);
        return r ? (JSON.parse(r) as EstadoSemana) : null;
      } catch {
        return null;
      }
    };
    const gravarBase = (chave: string, valor: unknown) => {
      try { orig(PREFIXO + '__base.' + chave, JSON.stringify(valor)); } catch { /* cheio */ }
    };

    // Semana: merge 3-vias (base, local, remote) em vez de sobrescrever.
    const aplicarSemana = (chave: string, remote: EstadoSemana): boolean => {
      const localRaw = localStorage.getItem(PREFIXO + chave);
      let local: EstadoSemana | null = null;
      try { local = localRaw ? (JSON.parse(localRaw) as EstadoSemana) : null; } catch { local = null; }
      if (!local) {
        orig(PREFIXO + chave, JSON.stringify(remote));
        gravarBase(chave, remote);
        notificarChaveExterna(chave);
        return true;
      }
      const merged = mesclarSemana(lerBase(chave), local, remote);
      gravarBase(chave, remote); // a base passa a ser o que a nuvem mandou
      const mudouLocal = !ig(merged, local);
      if (mudouLocal) {
        orig(PREFIXO + chave, JSON.stringify(merged));
        notificarChaveExterna(chave);
      }
      // Se o merge difere do que a nuvem tem, devolve o merge para convergir.
      if (!ig(merged, remote)) {
        recentes.set(chave, Date.now());
        subir(chave, merged);
      }
      return mudouLocal;
    };

    // Aplica um valor vindo da nuvem ao local e avisa os hooks para re-lerem,
    // atualizando o estado React in-place. Semanas passam pelo merge 3-vias.
    const aplicarLocal = (chave: string, valorNuvem: unknown): boolean => {
      if (valorNuvem === null || valorNuvem === undefined) return false;
      if (chave.startsWith('semana.')) return aplicarSemana(chave, valorNuvem as EstadoSemana);
      const novo = JSON.stringify(valorNuvem);
      if (novo !== localStorage.getItem(PREFIXO + chave)) {
        orig(PREFIXO + chave, novo); // grava sem reenviar à nuvem
        notificarChaveExterna(chave); // reconcilia o estado React, sem reload
        return true;
      }
      return false;
    };

    // 2) Uma vez por sessão: traz a nuvem e reconcilia o estado in-place.
    if (!sessionStorage.getItem('nuvem.boot')) {
      sessionStorage.setItem('nuvem.boot', '1');
      (async () => {
        try {
          const chavesNuvem = await armazenamentoSupabase.listarChaves();
          const setNuvem = new Set(chavesNuvem);
          for (const chave of chavesNuvem) {
            const valorNuvem = await armazenamentoSupabase.ler<unknown>(chave, null);
            aplicarLocal(chave, valorNuvem);
          }
          // Empurra o que existe SÓ neste aparelho e nunca subiu (ex.: o
          // cardápio da semana atual, fornecedores/ofertas de uma cotação
          // aplicada offline). Só preenche lacunas — nunca sobrescreve a nuvem.
          // Reconfere ponto-a-ponto antes de empurrar (2ª camada de segurança:
          // mesmo que `chavesNuvem` tenha vindo incompleta por algum motivo,
          // uma checagem direta da chave evita apagar dado real na nuvem).
          for (let i = 0; i < localStorage.length; i++) {
            const kFull = localStorage.key(i);
            if (!kFull || !kFull.startsWith(PREFIXO)) continue;
            const k = kFull.slice(PREFIXO.length);
            if (k.startsWith('__') || setNuvem.has(k)) continue;
            const raw = localStorage.getItem(kFull);
            if (raw == null) continue;
            try {
              const aindaAusente = (await armazenamentoSupabase.ler<unknown>(k, null)) === null;
              if (!aindaAusente) continue; // não é lacuna de verdade — não empurra
              recentes.set(k, Date.now());
              subir(k, JSON.parse(raw));
            } catch { /* não-JSON */ }
          }
          definirStatusNuvem('online');
          flush(); // reenvia o que ficou pendente de sessões offline anteriores
        } catch {
          /* offline/erro: segue com os dados locais */
          definirStatusNuvem('erro');
        }
      })();
    }

    // 3) AO VIVO: escuta mudanças de outros aparelhos e aplica na hora.
    let canal: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const sb = await getSupabase();
        if (!sb) return;
        const cliente = sb as unknown as { channel: (nome: string) => unknown };
        const ch = cliente.channel('tata_estado_rt') as {
          on: (ev: string, cfg: unknown, cb: (p: { new?: { chave?: string; valor?: unknown } }) => void) => typeof ch;
          subscribe: () => { unsubscribe: () => void };
        };
        canal = ch
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tata_estado', filter: `espaco=eq.${ESPACO_DADOS}` },
            (payload) => {
              const linha = payload.new;
              if (!linha || typeof linha.chave !== 'string') return;
              const ts = recentes.get(linha.chave);
              if (ts && Date.now() - ts < 8000) return; // eco da nossa própria escrita
              aplicarLocal(linha.chave, linha.valor); // reconcilia in-place, sem reload
            },
          )
          .subscribe();
        definirStatusNuvem('online');
      } catch {
        /* realtime indisponível: segue com boot + espelhamento */
      }
    })();

    // 4) Reenvia a fila offline ao reconectar ou voltar para a aba.
    const aoReconectar = () => flush();
    const aoVoltar = () => { if (document.visibilityState === 'visible') flush(); };
    window.addEventListener('online', aoReconectar);
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      try {
        canal?.unsubscribe();
      } catch {
        /* ignore */
      }
      window.removeEventListener('online', aoReconectar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  return null;
}
