'use client';

import {
  confirmarEventosGovernanca,
  criarPacoteGovernanca,
  listarPendenciasGovernanca,
  type PacoteGovernancaV1,
} from './governanca-outbox';

export interface ResultadoEnvioGovernancaV1 {
  confirmados: string[];
  rejeitados?: Array<{ id: string; motivo?: string }>;
}

/**
 * Fronteira do transporte. Supabase, HTTP, arquivo, worker ou qualquer outro
 * mecanismo futuro implementa somente esta interface.
 */
export interface TransporteGovernancaV1 {
  enviarAvaliacoes(pacote: PacoteGovernancaV1): Promise<ResultadoEnvioGovernancaV1>;
}

export interface ResultadoSincronizacaoGovernanca {
  tentados: number;
  confirmados: number;
  pendentes: number;
}

/**
 * Sincroniza a outbox sem conhecer o backend.
 *
 * Segurança de estado:
 * - pacote vazio não chama transporte;
 * - somente IDs que estavam no pacote enviado podem ser confirmados;
 * - confirmação parcial remove apenas os eventos aceitos;
 * - exceção do transporte preserva toda a fila para nova tentativa.
 */
export async function sincronizarPendenciasGovernanca(
  transporte: TransporteGovernancaV1,
): Promise<ResultadoSincronizacaoGovernanca> {
  const pacote = criarPacoteGovernanca();
  if (pacote.eventos.length === 0) {
    return { tentados: 0, confirmados: 0, pendentes: 0 };
  }

  const idsEnviados = new Set(pacote.eventos.map((evento) => evento.id));
  const resposta = await transporte.enviarAvaliacoes(pacote);
  const confirmadosValidos = Array.from(
    new Set((resposta.confirmados ?? []).filter((id) => idsEnviados.has(id))),
  );

  const confirmados = confirmarEventosGovernanca(confirmadosValidos);
  return {
    tentados: pacote.eventos.length,
    confirmados,
    pendentes: listarPendenciasGovernanca().length,
  };
}
