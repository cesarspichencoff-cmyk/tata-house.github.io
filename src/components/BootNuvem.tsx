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
  definirPendentesNuvem,
  marcarBootNuvemConcluido,
  aguardarBootNuvem,
} from '@/lib/cardapio/supabase';
import { notificarChaveExterna } from '@/lib/cardapio/estado';
import {
  absorverEstadoGrandeLocal,
  aplicarEstadoGrandeDaNuvem,
  inicializarEstadoGrandeLocal,
  liberarEstadoGrandeParaNuvem,
  reenviarEstadoGrandePendente,
} from '@/lib/cardapio/estado-grande';
import { ehChaveEstadoGrande } from '@/lib/cardapio/estado-grande-merge';
import { inicializarOutbox, listarOutbox, removerOutbox, salvarOutbox } from '@/lib/cardapio/sync-outbox';
import { adicionarEcoRecente, ehEcoProprio, type EcoRecente } from '@/lib/cardapio/sync-util';
import { mesclarSemana } from '@/lib/cardapio/merge-semana';
import { registrarVersao } from '@/lib/cardapio/historico-semana';
import {
  precisaReparo,
  aplicarReparo,
  SEMANA_REPARO,
  MARCA_REPARO,
} from '@/lib/cardapio/reparo-feijoada';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const PREFIXO = 'cardapio.v1.';
const ig = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function BootNuvem() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Hidrata IndexedDB/legado cedo. A liberação para ESCREVER na nuvem só
    // acontece depois que o boot tiver lido o remoto, evitando overwrite cego.
    void inicializarEstadoGrandeLocal();

    // 0) Service worker (PWA offline) — independe do Supabase.
    //
    // O nome do cache do worker carrega a versão do build (ver
    // src/app/sw.js/route.ts): cada deploy é um cache novo, e o próprio
    // worker apaga o anterior no `activate`. Falta só o lado do
    // navegador: sem isto, uma aba já aberta continua rodando o JS
    // ANTIGO em memória mesmo depois do novo worker assumir — só um
    // "limpar dados do site" manual resolvia. A equipe (baixa
    // familiaridade com celular) não pode depender disso. Então: assim
    // que um worker novo assume o controle, recarrega a página sozinho,
    // uma única vez, e verifica se há atualização sempre que a aba volta
    // a ficar visível (celular/tablet ligado o dia todo na cozinha).
    if ('serviceWorker' in navigator) {
      let jaRecarregou = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (jaRecarregou) return;
        jaRecarregou = true;
        window.location.reload();
      });
      navigator.serviceWorker
        .register('/sw.js')
        .then((registro) => {
          const verificarAtualizacao = () => {
            if (document.visibilityState === 'visible') registro.update().catch(() => {});
          };
          document.addEventListener('visibilitychange', verificarAtualizacao);
          window.addEventListener('focus', verificarAtualizacao);
        })
        .catch(() => {});
    }

    // Reparo pontual da semana 24–30/08 (põe a feijoada de volta na quarta,
    // desfazendo um estrago nosso). Espera a primeira reconciliação terminar
    // — com nuvem, isso é depois do download; sem nuvem, é imediato — para
    // corrigir o dado real em vez de ressuscitar uma cópia velha. Uma vez por
    // aparelho, e só se a semana ainda estiver no estado errado.
    void aguardarBootNuvem().then(() => {
      try {
        if (localStorage.getItem(MARCA_REPARO)) return;
        const bruto = localStorage.getItem(PREFIXO + SEMANA_REPARO);
        const semana = bruto ? (JSON.parse(bruto) as EstadoSemana) : null;
        if (semana && precisaReparo(semana)) {
          registrarVersao(SEMANA_REPARO, semana, 'local');
          // setItem espelha na nuvem quando ela está ligada — a correção
          // chega sozinha aos outros aparelhos.
          localStorage.setItem(PREFIXO + SEMANA_REPARO, JSON.stringify(aplicarReparo(semana)));
          notificarChaveExterna(SEMANA_REPARO);
        }
        localStorage.setItem(MARCA_REPARO, '1'); // chave "__": não vai à nuvem
      } catch {
        /* reparo é um extra: nunca atrapalha o resto */
      }
    });

    if (!supabaseHabilitado()) {
      definirStatusNuvem('desligado');
      marcarBootNuvemConcluido(); // sem nuvem, o localStorage já é a versão final
      return;
    }
    definirStatusNuvem('conectando');

    const orig = localStorage.setItem.bind(localStorage);

    // chaves que ESTE aparelho acabou de gravar — para ignorar o próprio eco
    // quando o Realtime devolver a mudança que nós mesmos fizemos.
    const recentes: Map<string, EcoRecente[]> =
      (window as unknown as { __nuvemRecentes?: Map<string, EcoRecente[]> }).__nuvemRecentes ??
      ((window as unknown as { __nuvemRecentes?: Map<string, EcoRecente[]> }).__nuvemRecentes = new Map());

    // Outbox offline: chaves cuja última subida à nuvem FALHOU (wifi caiu).
    // Persistem no localStorage e são reenviadas ao reconectar — sem isso,
    // uma edição feita offline nunca chegaria aos outros aparelhos.
    const PENDENTES = '__pending'; // legado: migra para IndexedDB e deixa de crescer aqui
    const lerPendentesLegado = (): string[] => {
      try { return JSON.parse(localStorage.getItem(PREFIXO + PENDENTES) || '[]'); } catch { return []; }
    };

    const pendentesConhecidos = new Set<string>(lerPendentesLegado());
    const revisoes = new Map<string, number>();
    const filasPorChave = new Map<string, Promise<void>>();

    const atualizarFilaVisual = () => {
      definirPendentesNuvem(pendentesConhecidos.size, 'boot');
    };

    // Enfileira por CHAVE para preservar ordem. Antes de tocar na rede, o
    // payload mais novo já está no IndexedDB: quota cheia + wifi caído deixa
    // de ser um buraco onde a alteração simplesmente desaparece.
    const subir = (k: string, valor: unknown): Promise<void> => {
      const revisao = (revisoes.get(k) ?? 0) + 1;
      revisoes.set(k, revisao);
      pendentesConhecidos.add(k);
      atualizarFilaVisual();
      definirStatusNuvem('sincronizando');

      const duravel = salvarOutbox(k, valor);
      const anterior = filasPorChave.get(k) ?? Promise.resolve();

      const tarefa = anterior
        .catch(() => {})
        .then(async () => {
          await duravel;
          recentes.set(k, adicionarEcoRecente(recentes.get(k), valor));
          try {
            await armazenamentoSupabase.gravar(k, valor);
            if (revisoes.get(k) === revisao) {
              pendentesConhecidos.delete(k);
              await removerOutbox(k);
            }
          } catch {
            if (revisoes.get(k) === revisao) {
              pendentesConhecidos.add(k);
              await salvarOutbox(k, valor);
              definirStatusNuvem('erro');
            }
          } finally {
            atualizarFilaVisual();
            if (pendentesConhecidos.size === 0) definirStatusNuvem('online');
          }
        });

      let rastreada: Promise<void>;
      rastreada = tarefa.finally(() => {
        if (filasPorChave.get(k) === rastreada) filasPorChave.delete(k);
      });
      filasPorChave.set(k, rastreada);
      return rastreada;
    };

    atualizarFilaVisual();

    // Reenvia a outbox durável. A chave guarda sempre o payload MAIS NOVO,
    // portanto várias edições offline do mesmo documento convergem para uma.
    const flush = () => {
      void listarOutbox().then((itens) => {
        for (const item of itens) {
          pendentesConhecidos.add(item.chave);
          if (!filasPorChave.has(item.chave)) void subir(item.chave, item.valor);
        }
        atualizarFilaVisual();
      });
    };

    // Migra a lista __pending das versões antigas para a outbox v2.
    void inicializarOutbox().then(async () => {
      for (const k of lerPendentesLegado()) {
        const raw = localStorage.getItem(PREFIXO + k);
        if (raw == null) continue;
        try { await salvarOutbox(k, JSON.parse(raw)); } catch { /* não-JSON */ }
      }
      try { localStorage.removeItem(PREFIXO + PENDENTES); } catch { /* ignore */ }
      const itens = await listarOutbox();
      pendentesConhecidos.clear();
      itens.forEach((x) => pendentesConhecidos.add(x.chave));
      atualizarFilaVisual();
      flush();
    });

    // 1) Espelha toda gravação local (cardapio.v1.*) na nuvem.
    if (!(window as unknown as { __nuvemPatched?: boolean }).__nuvemPatched) {
      localStorage.setItem = (chave: string, valor: string) => {
        const ehTata = typeof chave === 'string' && chave.startsWith(PREFIXO);
        const k = ehTata ? chave.slice(PREFIXO.length) : '';

        if (ehTata && ehChaveEstadoGrande(k)) {
          // Compatibilidade defensiva: código antigo que ainda tente escrever
          // os blobs grandes é redirecionado para memória/IndexedDB.
          try { absorverEstadoGrandeLocal(k, JSON.parse(valor)); } catch { /* não-JSON */ }
          return;
        }

        // A nuvem não pode depender da quota do cache. Tentamos o local, mas
        // mesmo quando ele lança QuotaExceededError o upload do valor JSON
        // ainda é disparado. Depois repropagamos o erro para o chamador poder
        // exibir o banner/recuperar cache sem fingir que a gravação local venceu.
        let erroLocal: unknown = null;
        try {
          orig(chave, valor);
        } catch (e) {
          erroLocal = e;
        }

        if (ehTata && !k.startsWith('__')) {
          try {
            subir(k, JSON.parse(valor));
          } catch {
            /* valor não-JSON: fica apenas local (ex.: chave Groq/texto bruto) */
          }
        }

        if (erroLocal) throw erroLocal;
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
      const base = lerBase(chave);
      const merged = mesclarSemana(base, local, remote);
      // Antes de deixar a nuvem alterar esta semana, guarda o que havia aqui.
      // É esta foto que salva a pessoa quando uma semana "muda sozinha".
      if (!ig(merged, local)) registrarVersao(chave, local, 'nuvem');
      gravarBase(chave, remote); // a base passa a ser o que a nuvem mandou
      const mudouLocal = !ig(merged, local);
      if (mudouLocal) {
        orig(PREFIXO + chave, JSON.stringify(merged));
        notificarChaveExterna(chave);
      }
      // Se o merge difere do que a nuvem tem, devolve o merge para convergir —
      // mas SÓ quando existe base. Sem base, o merge é um palpite sobre um
      // documento de idade desconhecida; publicá-lo deixa esse palpite valendo
      // para toda a equipe. Aqui o aparelho apenas se alinha à nuvem e volta a
      // ter base, e qualquer edição real feita depois sobe normalmente.
      if (base && !ig(merged, remote)) {
        subir(chave, merged);
      }
      return mudouLocal;
    };

    // Aplica um valor vindo da nuvem ao local e avisa os hooks para re-lerem,
    // atualizando o estado React in-place. Semanas passam pelo merge 3-vias.
    const aplicarLocal = (chave: string, valorNuvem: unknown): boolean => {
      if (valorNuvem === null || valorNuvem === undefined) return false;
      if (chave.startsWith('__')) return false; // marcadores/sondas: nunca vêm da nuvem
      if (ehChaveEstadoGrande(chave)) {
        void aplicarEstadoGrandeDaNuvem(chave, valorNuvem);
        return false;
      }
      if (chave.startsWith('semana.')) return aplicarSemana(chave, valorNuvem as EstadoSemana);
      const novo = JSON.stringify(valorNuvem);
      if (novo !== localStorage.getItem(PREFIXO + chave)) {
        orig(PREFIXO + chave, novo); // grava sem reenviar à nuvem
        notificarChaveExterna(chave); // reconcilia o estado React, sem reload
        return true;
      }
      return false;
    };

    // 2) A cada carregamento da página: traz a nuvem e reconcilia in-place.
    //
    // ⚠️ Aqui morava o pior defeito do app. A trava era `sessionStorage`
    // ('nuvem.boot'), gravada ANTES da busca sequer começar — e sessionStorage
    // sobrevive a recarregamentos da aba. Consequência: bastava a pessoa
    // atualizar a página (exatamente o que alguém faz quando a tela parece
    // errada) para que TODA busca na nuvem fosse pulada pelo resto da vida
    // daquela aba. Num aparelho com o armazenamento vazio — o da colega, ou
    // o de quem acabou de limpar os dados — a tela ficava vazia para sempre,
    // e atualizar de novo só reforçava o bloqueio. Os dados estavam na nuvem
    // o tempo todo; o app é que se recusava a buscá-los.
    //
    // A trava agora vive só na memória da página: um recarregamento é um
    // contexto novo, logo SEMPRE re-sincroniza (que é o que "atualizar"
    // deveria significar). Ela continua evitando busca dupla quando o React
    // remonta o componente dentro do mesmo carregamento.
    const janela = window as unknown as { __nuvemBootIniciado?: boolean };
    sessionStorage.removeItem('nuvem.boot'); // limpa a trava herdada de versões antigas

    const puxarDaNuvem = async () => {
      if (janela.__nuvemBootIniciado) return; // já buscando neste carregamento
      janela.__nuvemBootIniciado = true;
      {
        try {
          const chavesNuvem = await armazenamentoSupabase.listarChaves();
          const setNuvem = new Set(chavesNuvem);
          // Fase 1: migra/reconcilia PRIMEIRO os blobs grandes. Em aparelhos
          // que já estão no limite do localStorage, isso permite confirmar
          // a cópia v2 e remover o legado local ANTES de tentar materializar
          // qualquer outra chave remota no cache.
          for (const chave of chavesNuvem) {
            if (!ehChaveEstadoGrande(chave)) continue;
            const valorNuvem = await armazenamentoSupabase.ler<unknown>(chave, null);
            await aplicarEstadoGrandeDaNuvem(chave, valorNuvem);
          }
          await liberarEstadoGrandeParaNuvem(chavesNuvem);

          // Fase 2: com a quota liberada, reconcilia o restante do cache local.
          for (const chave of chavesNuvem) {
            if (ehChaveEstadoGrande(chave)) continue;
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
            if (k.startsWith('__') || ehChaveEstadoGrande(k) || setNuvem.has(k)) continue;
            const raw = localStorage.getItem(kFull);
            if (raw == null) continue;
            try {
              const aindaAusente = (await armazenamentoSupabase.ler<unknown>(k, null)) === null;
              if (!aindaAusente) continue; // não é lacuna de verdade — não empurra
              subir(k, JSON.parse(raw));
            } catch { /* não-JSON */ }
          }
          definirStatusNuvem('online');
          flush(); // reenvia o que ficou pendente de sessões offline anteriores
        } catch {
          // Falhou a busca: NÃO deixa o aparelho preso sem dados. Libera a
          // trava para que a próxima tentativa (voltar à aba, reconectar)
          // possa buscar de novo — antes, uma única falha condenava a aba.
          janela.__nuvemBootIniciado = false;
          definirStatusNuvem('erro');
        } finally {
          marcarBootNuvemConcluido();
        }
      }
    };

    void puxarDaNuvem();

    // 3) AO VIVO: escuta mudanças de outros aparelhos e aplica na hora.
    let canal: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const sb = await getSupabase();
        if (!sb) return;
        const cliente = sb as unknown as { channel: (nome: string) => unknown };
        const ch = cliente.channel('tata_estado_rt') as {
          on: (ev: string, cfg: unknown, cb: (p: { new?: { chave?: string; valor?: unknown } }) => void) => typeof ch;
          subscribe: (cb?: (status: string) => void) => { unsubscribe: () => void };
        };
        canal = ch
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tata_estado', filter: `espaco=eq.${ESPACO_DADOS}` },
            (payload) => {
              const linha = payload.new;
              if (!linha || typeof linha.chave !== 'string') return;
              if (ehChaveEstadoGrande(linha.chave)) {
                void aplicarEstadoGrandeDaNuvem(linha.chave, linha.valor);
                return;
              }

              let valorLocalAtual: unknown = null;
              try {
                const rawAtual = localStorage.getItem(PREFIXO + linha.chave);
                valorLocalAtual = rawAtual == null ? null : JSON.parse(rawAtual);
              } catch { /* valor local inválido: não tratamos como eco */ }

              const ecos = recentes.get(linha.chave);
              if (ehEcoProprio(ecos, linha.valor, valorLocalAtual)) return;
              aplicarLocal(linha.chave, linha.valor); // reconcilia in-place, sem reload
            },
          )
          // `subscribe()` retorna na hora, ANTES de saber se a conexão foi
          // aceita — declarar 'online' logo após era mentira: um aparelho sem
          // conseguir alcançar a nuvem mostrava a bolinha verde "Sincronizado"
          // do mesmo jeito. Agora o status vem do resultado real da inscrição.
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') definirStatusNuvem('online');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') definirStatusNuvem('erro');
          });
      } catch {
        /* realtime indisponível: segue com boot + espelhamento */
      }
    })();

    // 4) Ao reconectar ou voltar para a aba: reenvia a fila offline E, se a
    //    busca inicial tiver falhado, tenta baixar de novo. Sem esta segunda
    //    parte, um aparelho que abriu o app sem internet ficava vazio até
    //    alguém fechar e reabrir a aba — o pior momento possível para exigir
    //    isso de quem só quer ver o cardápio do dia.
    const sincronizar = () => {
      flush();
      void reenviarEstadoGrandePendente();
      void puxarDaNuvem(); // no-op se a busca deste carregamento já deu certo
    };
    const aoReconectar = () => sincronizar();
    const aoVoltar = () => { if (document.visibilityState === 'visible') sincronizar(); };
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
