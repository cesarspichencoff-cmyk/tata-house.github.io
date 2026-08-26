export interface EcoRecente {
  ts: number;
  valor: unknown;
}

/**
 * Um evento Realtime só é considerado eco da própria escrita quando:
 * - existe um envio recente desta chave;
 * - está dentro da janela;
 * - o VALOR recebido é exatamente o mesmo valor enviado.
 *
 * Assim, outra pessoa pode editar a mesma chave logo depois e a atualização
 * dela NÃO é descartada só porque aconteceu dentro de 8 segundos.
 */
export function ehEcoProprio(
  eco: EcoRecente | undefined,
  valorRecebido: unknown,
  agora = Date.now(),
  janelaMs = 8000,
): boolean {
  if (!eco) return false;
  if (agora - eco.ts >= janelaMs) return false;
  return JSON.stringify(eco.valor) === JSON.stringify(valorRecebido);
}
