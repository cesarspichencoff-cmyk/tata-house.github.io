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

export function lerVersoes(semanaId: string): VersaoSemana[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(chaveHist(semanaId));
    return raw ? (JSON.parse(raw) as VersaoSemana[]) : [];
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
  if (typeof window === 'undefined' || !temConteudo(anterior)) return;
  try {
    const versoes = lerVersoes(semanaId);
    const serializado = JSON.stringify(anterior);
    // Um "marco" é um ponto de retorno pedido pela pessoa: registra mesmo
    // que nada tenha mudado desde a última foto.
    if (origem !== 'marco' && versoes[0] && JSON.stringify(versoes[0].estado) === serializado) return;
    const nova: VersaoSemana = {
      em: new Date().toISOString(),
      origem,
      estado: JSON.parse(serializado) as EstadoSemana,
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
