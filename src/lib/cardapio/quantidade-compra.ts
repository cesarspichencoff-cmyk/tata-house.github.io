export function textoQuantidadeCompra(valor: number): string {
  if (!Number.isFinite(valor)) return '';
  return String(valor).replace('.', ',');
}

/**
 * Quantidade só vira estado compartilhado quando a edição termina.
 * Zero, vazio e texto inválido não são quantidade de compra: para retirar
 * um item, a interface já oferece a ação explícita de exclusão.
 */
export function interpretarQuantidadeCompra(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (!normalizado) return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
