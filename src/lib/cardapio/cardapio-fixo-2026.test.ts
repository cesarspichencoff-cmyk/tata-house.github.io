import { describe, expect, it, vi } from 'vitest';
import { cardapioFixoParaSemana, semanaUsaBagLeiteCondensado } from './cardapio-fixo-2026';
import { aplicarCardapioFixoSeVazio, idsSemanas, semanaVazia } from './estado';
import { listaDoDia, PESSOAS_PADRAO, proteinaDoPrato, validarSemana } from './motor';
import { resolverPreco } from './precos';

const comPessoas = (semana: NonNullable<ReturnType<typeof cardapioFixoParaSemana>>) =>
  semana.flatMap((d, i) => d ? [{ pessoas: PESSOAS_PADRAO[i], ...d }] : []);

describe('cardápio fixo out-dez/2026', () => {
  it('inicia em 05/10/2026 e repete o ciclo a cada 4 semanas', () => {
    const s41 = cardapioFixoParaSemana('2026-S41');
    const s45 = cardapioFixoParaSemana('2026-S45');

    expect(s41).not.toBeNull();
    expect(s45).toEqual(s41);
    expect(s41?.[0]?.principal).toBe('Carne de panela com batatas');
  });
  it('termina em 31/12 sem criar cardápio para janeiro', () => {
    const s53 = cardapioFixoParaSemana('2026-S53');

    expect(s53?.slice(0, 4).every(Boolean)).toBe(true);
    expect(s53?.slice(0, 4).map((d) => d?.sobremesa)).toEqual([
      'Fruta', 'Fruta', 'Pudim de baunilha', 'Gelatina colorida',
    ]);
    expect(s53?.slice(4)).toEqual([null, null, null]);
    expect(semanaUsaBagLeiteCondensado('2026-S53')).toBe(false);
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

  it('varia a família de proteína para quem trabalha sempre no mesmo dia', () => {
    const ciclo = [41, 42, 43, 44].map((semana) =>
      cardapioFixoParaSemana(`2026-S${semana}`)!,
    );

    for (let dia = 0; dia < 7; dia++) {
      const familias = new Set(ciclo.map((semana) => proteinaDoPrato(semana[dia]!.principal)));
      expect(familias.size).toBeGreaterThanOrEqual(2);
    }
  });
  it('preenche documento salvo vazio sem sobrescrever semana já iniciada', () => {
    const vazio = semanaVazia();
    const preenchido = aplicarCardapioFixoSeVazio('2026-S41', vazio);
    expect(preenchido.dias[0].principal).toBe('Carne de panela com batatas');

    const iniciado = semanaVazia();
    iniciado.dias[0].principal = 'Exceção operacional';
    const preservado = aplicarCardapioFixoSeVazio('2026-S41', iniciado);
    expect(preservado.dias[0].principal).toBe('Exceção operacional');
    expect(preservado.dias[1].principal).toBe('');
  });

  it('preserva qualquer edição manual de cardápio, mesmo sem prato principal', () => {
    const casos = [
      ['guarnicao', 'Guarnição manual'],
      ['salada', 'Salada manual'],
      ['sobremesa', 'Sobremesa manual'],
      ['guarnicaoFixa', 'Arroz integral e Feijão'],
    ] as const;

    for (const [campo, valor] of casos) {
      const iniciado = semanaVazia();
      iniciado.dias[2][campo] = valor;
      const preservado = aplicarCardapioFixoSeVazio('2026-S41', iniciado);

      expect(preservado.dias[2][campo]).toBe(valor);
      expect(preservado.dias[0].principal).toBe('');
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
          expect(linhasDaProteina.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('mantém exatamente duas feijoadas no ciclo, fora de segunda, quarta e sábado', () => {
    const ciclo = [41, 42, 43, 44].map((semana) =>
      cardapioFixoParaSemana(`2026-S${semana}`)!,
    );

    const feijoadas = ciclo
      .flat()
      .filter((dia) => dia?.principal.toLowerCase().includes('feijoada'));
    expect(feijoadas).toHaveLength(2);
    expect(ciclo[1][3]?.principal).toBe('Feijoada com costelinha');
    expect(ciclo[2][6]?.principal).toBe('Feijoada com costelinha');

    for (const semana of ciclo) {
      for (const idx of [0, 2, 5]) {
        expect(semana[idx]?.principal.toLowerCase()).not.toContain('feijoada');
      }
    }
  });

  it('usa a média histórica de pessoas por dia e fecha 474 refeições/semana', () => {
    expect(PESSOAS_PADRAO).toEqual([65, 58, 65, 65, 64, 66, 91]);
    expect(PESSOAS_PADRAO.reduce((soma, pessoas) => soma + pessoas, 0)).toBe(474);
  });

  it('expõe no seletor todas as semanas até o fechamento de dezembro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00-03:00'));
    try {
      const semanas = idsSemanas();
      expect(semanas).toContain('2026-S41');
      expect(semanas).toContain('2026-S53');
    } finally {
      vi.useRealTimers();
    }
  });

  it('mantém cotação real acima de qualquer referência histórica', () => {
    expect(resolverPreco('acem', { acem: 44.9 }, { acem: 20 })).toEqual({
      valor: 44.9,
      tipo: 'real',
    });
    const referencia = resolverPreco('acem', {}, {});
    expect(referencia.tipo).toBe('historico');
    expect(referencia.valor).toBeGreaterThan(0);
  });

  it('gera fruta genérica para Compras escolher a promoção da semana', () => {
    const diaFruta = comPessoas(cardapioFixoParaSemana('2026-S41')!)[1];
    const fruta = listaDoDia(diaFruta).find((i) => i.item === 'Fruta da semana');
    expect(fruta?.unid).toBe('kg');
    expect(fruta?.qtd).toBeGreaterThan(0);
  });

  it('concentra aproximadamente 5 L de leite condensado só nas semanas 1 e 3', () => {
    const litrosDaSemana = (id: string) =>
      comPessoas(cardapioFixoParaSemana(id)!)
        .flatMap((d) => listaDoDia(d))
        .filter((i) => i.item === 'Leite condensado' && i.unid === 'lt')
        .reduce((s, i) => s + i.qtd, 0);

    expect(litrosDaSemana('2026-S41')).toBeCloseTo(5, 1);
    expect(litrosDaSemana('2026-S43')).toBeCloseTo(5, 1);
    expect(litrosDaSemana('2026-S42')).toBe(0);
    expect(litrosDaSemana('2026-S44')).toBe(0);
    expect(semanaUsaBagLeiteCondensado('2026-S41')).toBe(true);
    expect(semanaUsaBagLeiteCondensado('2026-S42')).toBe(false);
  });
});
