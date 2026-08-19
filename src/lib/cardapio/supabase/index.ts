/* =====================================================================
   Camada Supabase (opcional, desacoplada). Ponto único de import.
   Enquanto as variáveis de ambiente não estiverem definidas, tudo aqui é
   inerte e o app segue em localStorage.
   ===================================================================== */

export { supabaseConfig, supabaseHabilitado, ESPACO_DADOS } from './config';
export { getSupabase, resetSupabase, type ClienteSupabase } from './client';
export {
  armazenamentoLocal,
  armazenamentoSupabase,
  armazenamentoAtivo,
  type Armazenamento,
} from './armazenamento';
export { enviarTudo, baixarTudo, useSincronizacao, type EstadoSync } from './sync';
export {
  definirStatusNuvem,
  definirPendentesNuvem,
  lerStatusNuvem,
  useStatusNuvem,
  marcarBootNuvemConcluido,
  bootNuvemJaConcluido,
  aguardarBootNuvem,
  type StatusNuvem,
} from './status';
