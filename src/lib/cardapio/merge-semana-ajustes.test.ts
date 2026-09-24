import { describe, expect, it } from 'vitest';
import { mesclarSemana } from './merge-semana';
import type { EstadoSemana } from './tipos';

function semana(): EstadoSemana {
  return {
    versao: 1,
    orcamento: null,
    dias: Array.from({ length: 7 }, () => ({
      pessoas: 30,
      principal: 'Frango grelhado',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
  };
}

describe('merge de ajustes da lista de compras', () => {
  it('preserva exclusão local e quantidade remota quando mudam campos diferentes', () => {
    const base = semana();
    base.ajustes = { 0: { frango: { qtd: 5 } } };

    const local = structuredClone(base);
    local.ajustes[0].frango = { qtd: 5, removido: true };

    const remoto = structuredClone(base);
    remoto.ajustes[0].frango = { qtd: 6 };

    const mesclado = mesclarSemana(base, local, remoto);
    expect(mesclado.ajustes[0].frango).toEqual({ qtd: 6, removido: true });
  });
});
