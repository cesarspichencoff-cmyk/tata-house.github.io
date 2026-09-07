import { SECOES_HOUSE_GOVERNANCA, type SecaoHouseGovernanca } from './governanca-house-snapshot';

export const ORIGEM_GOVERNANCA_HOUSE_V2 = 'https://lideres.tatasushi.tech' as const;
export const GOV_HOUSE_SNAPSHOT_REQUEST_V2 = 'tata-house:governanca:snapshot:request:v2' as const;
export const GOV_HOUSE_SNAPSHOT_RESPONSE_V2 = 'tata-house:governanca:snapshot:response:v2' as const;

const CORRELATION_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const SEMANA_RE = /^\d{4}-S(?:0[1-9]|[1-4]\d|5[0-3])$/;

export interface RequisicaoHouseSnapshotV2 {
  type: typeof GOV_HOUSE_SNAPSHOT_REQUEST_V2;
  correlationId: string;
  semanaId: string;
  secoes?: SecaoHouseGovernanca[];
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

export function normalizarRequisicaoHouseSnapshotV2(
  origem: string,
  dados: unknown,
): RequisicaoHouseSnapshotV2 | null {
  if (origem !== ORIGEM_GOVERNANCA_HOUSE_V2 || !dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return null;
  }

  const bruto = dados as Record<string, unknown>;
  const campos = new Set(['type', 'correlationId', 'semanaId', 'secoes']);
  if (Object.keys(bruto).some((chave) => !campos.has(chave))) return null;
  if (bruto.type !== GOV_HOUSE_SNAPSHOT_REQUEST_V2) return null;

  const correlationId = texto(bruto.correlationId);
  const semanaId = texto(bruto.semanaId);
  if (!CORRELATION_RE.test(correlationId) || !SEMANA_RE.test(semanaId)) return null;

  let secoes: SecaoHouseGovernanca[] | undefined;
  if (bruto.secoes !== undefined) {
    if (!Array.isArray(bruto.secoes) || bruto.secoes.length === 0 || bruto.secoes.length > SECOES_HOUSE_GOVERNANCA.length) {
      return null;
    }
    const permitidas = new Set<string>(SECOES_HOUSE_GOVERNANCA);
    const normalizadas = bruto.secoes.map(texto);
    if (normalizadas.some((secao) => !permitidas.has(secao))) return null;
    secoes = Array.from(new Set(normalizadas)) as SecaoHouseGovernanca[];
  }

  return {
    type: GOV_HOUSE_SNAPSHOT_REQUEST_V2,
    correlationId,
    semanaId,
    ...(secoes ? { secoes } : {}),
  };
}
