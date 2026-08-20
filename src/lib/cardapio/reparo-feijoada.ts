/* =====================================================================
   Reparo pontual — semana 24–30/08/2026 (2026-S35).

   Conserta um estrago causado por uma regressão nossa: a semana tinha
   sido montada com a feijoada na quarta e voltou sozinha ao estado
   anterior, com a feijoada no domingo. Em vez de exigir que a equipe
   redigite, o próprio app desfaz — uma única vez, e só se o cardápio
   ainda estiver no estado errado.

   É deliberadamente conservador: se alguém já corrigiu na mão, ou se a
   semana não parece mais com o que descrevemos, não encosta em nada.
   ===================================================================== */

import type { EstadoSemana } from './tipos';

export const SEMANA_REPARO = 'semana.2026-S35';
export const MARCA_REPARO = 'cardapio.v1.__reparo.feijoada-quarta-2026-S35';

const QUARTA = 2;
const DOMINGO = 6;
const NOME_FEIJOADA = 'Feijoada com costelinha e lombo';

const ehFeijoada = (prato: string | undefined) => /feijoada/i.test(prato ?? '');

/**
 * Só repara quando a semana está exatamente no estado errado conhecido:
 * feijoada no domingo e nenhuma feijoada na quarta.
 */
export function precisaReparo(e: EstadoSemana | null | undefined): boolean {
  const dias = e?.dias;
  if (!dias || dias.length < 7) return false;
  return ehFeijoada(dias[DOMINGO]?.principal) && !ehFeijoada(dias[QUARTA]?.principal);
}

/**
 * Troca os pratos de quarta e domingo (a comida viaja, o número de
 * pessoas de cada dia fica onde está) e nomeia a feijoada como a Maria
 * pediu: com costelinha e lombo.
 */
export function aplicarReparo(e: EstadoSemana): EstadoSemana {
  const dias = e.dias.map((d) => ({ ...d }));
  const quarta = dias[QUARTA];
  const domingo = dias[DOMINGO];

  const comida = (d: typeof quarta) => ({
    principal: d.principal,
    guarnicaoFixa: d.guarnicaoFixa,
    guarnicao: d.guarnicao,
    salada: d.salada,
    sobremesa: d.sobremesa,
  });
  const daQuarta = comida(quarta);
  const doDomingo = comida(domingo);

  dias[QUARTA] = { ...quarta, ...doDomingo, principal: NOME_FEIJOADA };
  dias[DOMINGO] = { ...domingo, ...daQuarta };

  return { ...e, dias };
}
