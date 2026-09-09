import { describe, expect, it } from 'vitest';
import {
  estoqueOficialParaPlanejamento,
  MAX_IDADE_CONTAGEM_ESTOQUE_DIAS,
  normalizarSnapshotEstoqueGovernanca,
} from './governanca-estoque-oficial';

const base = {
  contrato: 'tata-house-governanca-estoque-readonly',
  versao: 1,
  modo: 'read-only',
  origem: 'lideres',
  fonte: 'public.inventario_minimo+public.inventario_contagem',
  carregadoEm: '2026-09-09T12:00:00Z',
  unidade: 'Itaim',
  semanaId: '2026-S37',
  itensConsultados: 4,
  itens: [
    { item: 'Arroz', chave: 'arroz', departamento: 'Cozinha', unidadeMedida: 'kg', estoqueAtual: 18, dataContagem: '2026-09-08' },
    { item: 'Feijão', chave: 'feijao', departamento: 'Cozinha', unidadeMedida: 'kg', estoqueAtual: 9, dataContagem: '2026-08-20' },
  ],
  ambiguos: ['Óleo'],
  semContagem: ['Sal'],
} as const;

describe('governanca-estoque-oficial', () => {
  it('aceita somente o snapshot minimizado e rejeita campos extras', () => {
    expect(normalizarSnapshotEstoqueGovernanca(base)?.unidade).toBe('Itaim');
    expect(normalizarSnapshotEstoqueGovernanca({ ...base, token: 'proibido' })).toBeNull();
  });

  it('usa somente item unívoco e contagem recente da unidade exata', () => {
    const estoque = estoqueOficialParaPlanejamento(base as any, 'Itaim', new Date('2026-09-09T12:00:00Z'));
    expect(estoque).toEqual({ arroz: 18 });
    expect(estoqueOficialParaPlanejamento(base as any, 'Pinheiros', new Date('2026-09-09T12:00:00Z'))).toEqual({});
  });

  it('trata contagem mais antiga que a janela semanal como stale', () => {
    expect(MAX_IDADE_CONTAGEM_ESTOQUE_DIAS).toBe(8);
    const estoque = estoqueOficialParaPlanejamento(base as any, 'Itaim', new Date('2026-09-18T12:00:00Z'));
    expect(estoque).toEqual({});
  });

  it('falha fechado quando item também aparece como ambíguo', () => {
    expect(normalizarSnapshotEstoqueGovernanca({ ...base, ambiguos: ['Arroz'] })).toBeNull();
  });
});
