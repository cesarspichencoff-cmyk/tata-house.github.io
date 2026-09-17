import type { RegistroDesperdicio } from './tipos';

export type UnidadeDesperdicio = RegistroDesperdicio['unid'];

export interface ResumoDesperdicioUnidade {
  produzido: number;
  consumido: number;
  sobra: number;
  taxa: number | null;
  registros: number;
}

function vazio(): ResumoDesperdicioUnidade {
  return { produzido: 0, consumido: 0, sobra: 0, taxa: null, registros: 0 };
}

/**
 * Resume desperdício preservando unidade física. Porções e kg nunca são
 * somados entre si; qualquer taxa é calculada apenas dentro da mesma unidade.
 */
export function resumirDesperdicioPorUnidade(registros: RegistroDesperdicio[]): Record<UnidadeDesperdicio, ResumoDesperdicioUnidade> {
  const resumo: Record<UnidadeDesperdicio, ResumoDesperdicioUnidade> = {
    'porções': vazio(),
    kg: vazio(),
  };

  for (const r of registros) {
    const alvo = resumo[r.unid];
    const produzido = Math.max(0, r.produzido);
    const consumido = Math.max(0, Math.min(r.consumido, produzido));
    alvo.produzido += produzido;
    alvo.consumido += consumido;
    alvo.sobra += Math.max(0, produzido - consumido);
    alvo.registros += 1;
  }

  (Object.keys(resumo) as UnidadeDesperdicio[]).forEach((unid) => {
    const item = resumo[unid];
    item.taxa = item.produzido > 0 ? item.sobra / item.produzido : null;
  });

  return resumo;
}
