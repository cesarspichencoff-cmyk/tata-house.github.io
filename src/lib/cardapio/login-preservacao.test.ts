import { describe, expect, it } from 'vitest';
import { PERFIS, abasDoPapel } from './login';

describe('preservação de autorização do House', () => {
  it('mantém perfil, papel, abas e PIN-base do House canônico', () => {
    expect(
      PERFIS.map(({ id, papel, abas, pinPadrao }) => ({ id, papel, abas, pinPadrao })),
    ).toEqual([
      {
        id: 'gerencia',
        papel: 'administrador',
        abas: ['agora', 'cardapio', 'compras', 'relatorios', 'ajustes'],
        pinPadrao: '1234',
      },
      {
        id: 'compras',
        papel: 'compras',
        abas: ['compras', 'relatorios'],
        pinPadrao: '1111',
      },
      {
        id: 'cozinha',
        papel: 'cozinha',
        abas: ['agora', 'cardapio', 'compras'],
        pinPadrao: '2222',
      },
    ]);
  });

  it('mantém a matriz de abas por papel anterior à integração', () => {
    expect(abasDoPapel('administrador')).toEqual([
      'agora',
      'cardapio',
      'compras',
      'relatorios',
      'ajustes',
    ]);
    expect(abasDoPapel('gestor')).toEqual([
      'agora',
      'cardapio',
      'compras',
      'relatorios',
      'ajustes',
    ]);
    expect(abasDoPapel('compras')).toEqual(['compras', 'relatorios']);
    expect(abasDoPapel('cozinha')).toEqual(['agora', 'cardapio', 'compras']);
    expect(abasDoPapel('recebimento')).toEqual(['compras']);
  });
});
