import { describe, expect, it } from 'vitest';
import { cardapioFixoParaSemana } from './cardapio-fixo-2026';
import { listaDoDia, proteinaDoPrato, validarSemana } from './motor';

const comPessoas = (semana: NonNullable<ReturnType<typeof cardapioFixoParaSemana>>) =>
  semana.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => ({
    pessoas: 65,
    ...d,
  }));

describe('cardápio fixo out-dez/2026', () => {
  it('inicia em 05/10/2026 e repete o ciclo a cada 4 semanas', () => {
    const s41 = cardapioFixoParaSemana('2026-S41');
    const s45 = cardapioFixoParaSemana('2026-S45');

    expect(s41).not.toBeNull();
    expect(s45).toEqual(s41);
    expect(s41?.[0]?.principal).toBe('Cubos de frango no molho');
  });
  it('termina em 31/12 sem criar cardápio para janeiro', () => {
    const s53 = cardapioFixoParaSemana('2026-S53');

    expect(s53?.slice(0, 4).every(Boolean)).toBe(true);
    expect(s53?.slice(4)).toEqual([null, null, null]);
    expect(cardapioFixoParaSemana('2027-S01')).toBeNull();
  });

  it('não produz erros de rotação nas 12 semanas completas', () => {
    for (let semana = 41; semana <= 52; semana++) {
      const fixo = cardapioFixoParaSemana(`2026-S${semana}`);
      expect(fixo).not.toBeNull();
      const avisos = validarSemana(comPessoas(fixo!));
      expect(avisos.filter((a) => a.nivel === 'erro')).toEqual([]);
    }
  });
  it('gera lista de compras para todos os 28 dias do ciclo', () => {
    for (let semana = 41; semana <= 44; semana++) {
      const fixo = cardapioFixoParaSemana(`2026-S${semana}`)!;
      const dias = comPessoas(fixo);

      expect(dias).toHaveLength(7);
      for (const dia of dias) {
        const itens = listaDoDia(dia);
        expect(itens.length).toBeGreaterThan(0);
        expect(itens.every((i) => i.qtd > 0)).toBe(true);

        const familia = proteinaDoPrato(dia.principal);
        if (familia !== 'outros') {
          const linhasDaProteina = itens.filter((i) => proteinaDoPrato(i.item) === familia);
          expect(linhasDaProteina).toHaveLength(1);
        }
      }
    }
  });
});
