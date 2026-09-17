import { describe, expect, it } from 'vitest';
import {
  aplicarMemoriaComposicaoCompras,
  construirMemoriaComposicaoCompras,
  resolverAprendizadoCompra,
} from './aprendizado-compras';
import { normalizar, type LinhaCompra } from './motor';
import type { EstadoSemana } from './tipos';

function estadoSemana(args: {
  principal?: string;
  guarnicao?: string;
  pessoas?: number;
  removidos?: string[];
  manuais?: { item: string; unid: string; qtd: number }[];
} = {}): EstadoSemana {
  const principal = args.principal ?? 'Bife acebolado';
  const guarnicao = args.guarnicao ?? 'Legumes';
  const pessoas = args.pessoas ?? 50;
  const dias = Array.from({ length: 7 }, (_, i) => ({
    pessoas,
    principal: i === 0 ? principal : '',
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: i === 0 ? guarnicao : '',
    salada: i === 0 ? 'Salada verde' : '',
    sobremesa: i === 0 ? 'Fruta' : '',
  }));
  const ajustes: EstadoSemana['ajustes'] = {};
  if (args.removidos?.length) {
    ajustes[0] = Object.fromEntries(args.removidos.map((x) => [normalizar(x), { removido: true }]));
  }
  return {
    versao: 1,
    listaInteligenciaVersao: 2,
    orcamento: null,
    dias,
    etapa: 'concluido',
    historico: [],
    ajustes,
    manuais: args.manuais?.length ? { 0: args.manuais } : {},
    status: {},
    obsCozinha: '',
  };
}

const fraca = (item = 'Tomate'): LinhaCompra => ({
  chave: normalizar(item), item, unid: 'kg', sugerida: 2, qtd: 2,
  manual: false, fonte: 'receita', status: {},
});

const operacional = (item = 'Tomate'): LinhaCompra => ({
  chave: normalizar(item), item, unid: 'kg', sugerida: 2, qtd: 2,
  manual: false, fonte: 'operacional_mapa', status: {},
});

describe('aprendizado de composição da lista de compras', () => {
  it('lista já existente permanece congelada mesmo quando há aprendizado forte', () => {
    const legado = estadoSemana();
    delete legado.listaInteligenciaVersao;
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S22', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S23', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const base = [fraca()];
    const antes = JSON.stringify(base);
    const linhas = aplicarMemoriaComposicaoCompras(base, legado, 0, memoria);
    expect(JSON.stringify(linhas)).toBe(antes);
    expect(linhas.map((x) => x.chave)).toEqual(['tomate']);
  });

  it('uma correção isolada não vira regra automática', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    expect(resolverAprendizadoCompra(atual.dias[0], memoria).removidos.has('tomate')).toBe(false);
  });

  it('duas semanas do mesmo cardápio suprimem item fraco repetidamente removido', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    const linhas = aplicarMemoriaComposicaoCompras([fraca()], atual, 0, memoria);
    expect(linhas.find((l) => l.chave === 'tomate')).toBeUndefined();
  });

  it('nunca apaga combo/mapa operacional por aprendizado automático', () => {
    const atual = estadoSemana();
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ removidos: ['Tomate'] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ removidos: ['Tomate'] }) },
    ]);
    const linhas = aplicarMemoriaComposicaoCompras([operacional()], atual, 0, memoria);
    expect(linhas.find((l) => l.chave === 'tomate')).toBeDefined();
  });

  it('item extra repetido entra como aprendido e escala pela quantidade de pessoas', () => {
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ pessoas: 50, manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ pessoas: 50, manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const atual = estadoSemana({ pessoas: 60 });
    const linhas = aplicarMemoriaComposicaoCompras([], atual, 0, memoria);
    const banana = linhas.find((l) => l.chave === 'banana');
    expect(banana?.fonte).toBe('aprendido_app');
    expect(banana?.qtd).toBe(12);
  });

  it('não duplica item que já foi adicionado manualmente na semana atual', () => {
    const memoria = construirMemoriaComposicaoCompras([
      { semanaId: '2026-S20', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
      { semanaId: '2026-S21', estado: estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 10 }] }) },
    ]);
    const atual = estadoSemana({ manuais: [{ item: 'Banana', unid: 'un', qtd: 11 }] });
    const manual: LinhaCompra = {
      chave: 'manual:0:banana', item: 'Banana', unid: 'un', sugerida: null,
      qtd: 11, manual: true, fonte: 'manual', status: {},
    };
    const linhas = aplicarMemoriaComposicaoCompras([manual], atual, 0, memoria);
    expect(linhas.filter((l) => normalizar(l.item) === 'banana')).toHaveLength(1);
  });
});
