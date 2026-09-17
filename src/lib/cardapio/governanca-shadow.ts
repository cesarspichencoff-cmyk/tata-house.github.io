import type { EstadoSemana } from './tipos';

/**
 * Cria um rascunho totalmente destacado da semana operacional.
 * A superfície de Governança pode ler o estado real como ponto de partida,
 * mas qualquer edição posterior permanece em memória até ser enviada como proposta.
 */
export function clonarSemanaParaRascunho(estado: EstadoSemana): EstadoSemana {
  return JSON.parse(JSON.stringify(estado)) as EstadoSemana;
}
