'use client';

/* =====================================================================
   Histórico de versões da semana — o "desfazer" que faltava.

   Guarda uma foto do cardápio ANTES de cada alteração, seja ela feita
   aqui ou chegada da nuvem. Quando uma semana muda sozinha (outro
   aparelho, uma reconciliação infeliz), dá para voltar ao que estava com
   um toque, em vez de redigitar tudo ou depender de suporte.

   Fica SÓ neste aparelho, de propósito: as chaves começam com "__", que a
   sincronização ignora. Assim o histórico nunca entra em merge, nunca
   infla a nuvem e nunca vira mais uma coisa capaz de sobrescrever a
   semana de todo mundo. Restaurar, sim, publica normalmente.

   IMPORTANTE: anexos binários/base64 de NF não pertencem ao "desfazer" do
   cardápio. Copiá-los em cada snapshot multiplicava centenas de KB/MB e podia
   esgotar o localStorage mesmo com poucos documentos operacionais. O histórico
   guarda a semana sem `notas`/`notasFiscais`; ao restaurar, a UI preserva os
   anexos atuais da semana.
   ===================================================================== */

import type { EstadoSemana } from './tipos';

const PREFIXO = 'cardapio.v1.';
// O histórico é conveniência local, não dado operacional. Oito pontos por
// semana preservam um desfazer útil sem deixar snapshots completos crescerem
// indefinidamente até a quota do navegador.
const MAX_VERSOES = 8;

export interface VersaoSemana {
  em: string; // ISO
  /** 'marco' = ponto salvo de propósito pela pessoa (botão Salvar). */
  origem: 'local' | 'nuvem' | 'marco';
  estado: EstadoSemana;
}

function chaveHist(semanaId: string): string {
  return `${PREFIXO}__hist.${semanaId}`;
}

/**
 * Snapshot leve para desfazer cardápio. Mantém os campos operacionais, mas
 * exclui imagens de nota fiscal (base64), que já pertencem ao documento atual
 * e à nuvem. A função não altera o objeto recebido.
 */
export function estadoParaHistorico(estado: EstadoSemana): EstadoSemana {
  const clone = JSON.parse(JSON.stringify(estado)) as EstadoSemana;
  delete clone.notas;
  delete clone.notasFiscais;
  return clone;
}

function normalizarVersoes(versoes: VersaoSemana[]): VersaoSemana[] {
  return versoes.map((v) => ({ ...v, estado: estadoParaHistorico(v.estado) }));
}

export function lerVersoes(semanaId: string): VersaoSemana[] {
  if (typeof window === 'undefined') return [];
  try {
    const chave = chaveHist(semanaId);
    const raw = localStorage.getItem(chave);
    if (!raw) return [];
    const lidas = JSON.parse(raw) as VersaoSemana[];
    const normalizadas = normalizarVersoes(lidas);
    const compacto = JSON.stringify(normalizadas);

    // Migração oportunista: históricos antigos podem conter cópias enormes de
    // fotos. Substituí-los pela forma leve libera espaço sem tocar o cardápio
    // operacional, a nuvem, preços, fornecedores ou estoque.
    if (compacto !== raw) {
      try { localStorage.setItem(chave, compacto); } catch { /* best-effort */ }
    }
    return normalizadas;
  } catch {
    return [];
  }
}

/** Um cardápio "em branco" não vale como versão para restaurar. */
function temConteudo(e: EstadoSemana | null | undefined): boolean {
  return !!e?.dias?.some((d) => (d?.principal ?? '').trim() !== '');
}

/**
 * Guarda uma foto do estado ANTERIOR. Chamado antes de sobrescrever a
 * semana. Ignora repetição idêntica e documentos vazios.
 */
export function registrarVersao(
  semanaId: string,
  anterior: EstadoSemana | null | undefined,
  origem: VersaoSemana['origem'],
): void {
  if (typeof window === 'undefined') return;
  if (!anterior) return;
  if (!temConteudo(anterior)) return;

  try {
    const versoes = lerVersoes(semanaId);
    const leve = estadoParaHistorico(anterior);
    const serializado = JSON.stringify(leve);
    // Um "marco" é um ponto de retorno pedido pela pessoa: registra mesmo
    // que nada tenha mudado desde a última foto.
    if (origem !== 'marco' && versoes[0] && JSON.stringify(versoes[0].estado) === serializado) return;
    const nova: VersaoSemana = {
      em: new Date().toISOString(),
      origem,
      estado: leve,
    };
    const lista = [nova, ...versoes].slice(0, MAX_VERSOES);
    // Gravação crua: `__` nunca vai para a nuvem, e usar o setItem original
    // evitaria o espelhamento de qualquer forma.
    localStorage.setItem(chaveHist(semanaId), JSON.stringify(lista));
  } catch {
    /* armazenamento cheio: histórico é um extra, nunca bloqueia a edição */
  }
}

/** Resumo curto de uma versão, para a pessoa reconhecer qual é qual. */
export function resumirVersao(v: VersaoSemana): string {
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  return (v.estado.dias ?? [])
    .map((d, i) => (d?.principal ? `${DIAS[i]}: ${d.principal}` : null))
    .filter(Boolean)
    .join(' · ');
}
