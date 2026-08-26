export interface EcoRecente {
  em: number;
  assinatura: string;
}

export function serializarCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    const s = JSON.stringify(valor);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(valor)) {
    return `[${valor.map((v) => serializarCanonico(v)).join(',')}]`;
  }
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${serializarCanonico(obj[k])}`)
    .join(',')}}`;
}

export function criarEcoRecente(valor: unknown, em = Date.now()): EcoRecente {
  return { em, assinatura: serializarCanonico(valor) };
}

export function adicionarEcoRecente(
  atuais: readonly EcoRecente[] | undefined,
  valor: unknown,
  em = Date.now(),
  janelaMs = 8_000,
): EcoRecente[] {
  const validos = (atuais ?? []).filter((x) => em - x.em < janelaMs);
  return [...validos, criarEcoRecente(valor, em)].slice(-8);
}

/** Só é eco descartável se:
 * 1) este aparelho realmente enviou esse conteúdo há poucos segundos; E
 * 2) o conteúdo local atual ainda é o mesmo.
 * Assim, uma edição/reversão genuína de outro aparelho nunca é ignorada só
 * porque por acaso coincide com um valor antigo que nós também enviamos. */
export function ehEcoProprio(
  recentes: readonly EcoRecente[] | undefined,
  valorRecebido: unknown,
  valorLocalAtual: unknown,
  agora = Date.now(),
  janelaMs = 8_000,
): boolean {
  if (!recentes?.length) return false;
  const assinatura = serializarCanonico(valorRecebido);
  if (serializarCanonico(valorLocalAtual) !== assinatura) return false;
  return recentes.some((r) => agora - r.em < janelaMs && r.assinatura === assinatura);
}
