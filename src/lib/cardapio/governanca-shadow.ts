import type { EstadoSemana } from './tipos';

/**
 * Cria um rascunho totalmente destacado da semana operacional.
 *
 * A superfície /planejar da Governança pode ler o estado real como ponto de
 * partida, mas qualquer edição posterior precisa permanecer somente em memória
 * até ser enviada como proposta. Nunca devolva aqui a mesma referência recebida.
 */
export function clonarSemanaParaRascunho(estado: EstadoSemana): EstadoSemana {
  return JSON.parse(JSON.stringify(estado)) as EstadoSemana;
}
