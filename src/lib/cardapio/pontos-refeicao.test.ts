import { describe, expect, it } from 'vitest';
import {
  conciliarPlanejamentoPorPonto,
  conciliarRefeicoesPorPonto,
  somarPlanejamentoPorPonto,
  somarRefeicoesPorPonto,
} from './pontos-refeicao';

describe('pontos de refeição — Itaim e Pinheiros', () => {
  it('não inventa distribuição quando ela não foi informada', () => {
    expect(conciliarPlanejamentoPorPonto(120, undefined)).toEqual({
      status: 'sem_distribuicao',
      total: 120,
      distribuido: 0,
      diferenca: -120,
    });

    expect(conciliarRefeicoesPorPonto(
      { almoco: 80, jantar: 30, marmitas: 10 },
      undefined,
    ).status).toBe('sem_distribuicao');
  });

  it('aceita distribuição planejada somente quando a soma bate com o total', () => {
    expect(somarPlanejamentoPorPonto({ itaim: 70, pinheiros: 50 })).toBe(120);
    expect(conciliarPlanejamentoPorPonto(120, { itaim: 70, pinheiros: 50 }).status).toBe('conciliado');
    expect(conciliarPlanejamentoPorPonto(120, { itaim: 70, pinheiros: 40 })).toMatchObject({
      status: 'divergente',
      distribuido: 110,
      diferenca: -10,
    });
  });

  it('concilia almoço, jantar e marmitas independentemente', () => {
    const porPonto = {
      itaim: { almoco: 50, jantar: 20, marmitas: 5 },
      pinheiros: { almoco: 30, jantar: 10, marmitas: 5 },
    };

    expect(somarRefeicoesPorPonto(porPonto)).toEqual({ almoco: 80, jantar: 30, marmitas: 10 });
    expect(conciliarRefeicoesPorPonto(
      { almoco: 80, jantar: 30, marmitas: 10 },
      porPonto,
    ).status).toBe('conciliado');
  });

  it('expõe divergência sem corrigir silenciosamente os valores', () => {
    const resultado = conciliarRefeicoesPorPonto(
      { almoco: 80, jantar: 30, marmitas: 10 },
      {
        itaim: { almoco: 50, jantar: 20, marmitas: 5 },
        pinheiros: { almoco: 20, jantar: 10, marmitas: 5 },
      },
    );

    expect(resultado.status).toBe('divergente');
    expect(resultado.total).toEqual({ almoco: 80, jantar: 30, marmitas: 10 });
    expect(resultado.distribuido).toEqual({ almoco: 70, jantar: 30, marmitas: 10 });
    expect(resultado.diferenca).toEqual({ almoco: -10, jantar: 0, marmitas: 0 });
  });
});
