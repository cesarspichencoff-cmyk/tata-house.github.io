import { describe, expect, it } from 'vitest';
import {
  impactoRestricoesLocais,
  itensDaSemanaParaRestricoes,
  normalizarSnapshotRestricoesGovernanca,
  restricoesLocaisAgregadas,
} from './governanca-restricoes';
import type { DiaCardapio, Funcionario } from './tipos';

const dias: DiaCardapio[] = Array.from({ length: 7 }, (_, i) => ({
  pessoas: 60,
  principal: i === 0 ? 'Frango com creme de leite' : i === 1 ? 'Lombo assado' : 'Peixe grelhado',
  guarnicaoFixa: 'Arroz e Feijão',
  guarnicao: i === 0 ? 'Purê de batata' : 'Legumes',
  salada: 'Folhas',
  sobremesa: 'Fruta',
}));

const funcionarios: Funcionario[] = [
  {
    id: '1', nome: 'Ana', setor: 'Salão', turno: 'almoco', ativo: true, criadoEm: '2026-01-01T00:00:00Z',
    restricoes: [{ tipo: 'alergia', alimento: 'creme de leite' }],
  },
  {
    id: '2', nome: 'Bia', setor: 'Cozinha', turno: 'ambos', ativo: true, criadoEm: '2026-01-01T00:00:00Z',
    restricoes: [{ tipo: 'religioso', alimento: 'lombo' }, { tipo: 'preferencia', alimento: 'creme de leite' }],
  },
  {
    id: '3', nome: 'Caio', setor: 'Bar', turno: 'jantar', ativo: false, criadoEm: '2026-01-01T00:00:00Z',
    restricoes: [{ tipo: 'preferencia', alimento: 'peixe' }],
  },
];

describe('governanca-restricoes', () => {
  it('agrega somente pessoas ativas e não duplica o mesmo termo por pessoa', () => {
    expect(restricoesLocaisAgregadas(funcionarios)).toEqual({
      'creme de leite': 2,
      lombo: 1,
    });
  });

  it('transforma restrições em impacto real do cardápio sem alterar os dias', () => {
    const impacto = impactoRestricoesLocais(dias, restricoesLocaisAgregadas(funcionarios));
    expect(impacto).toEqual({ ocorrencias: 2, pessoasSomadas: 3 });
    expect(dias[0].principal).toBe('Frango com creme de leite');
  });

  it('deduplica itens enviados à Governança e mantém a composição completa', () => {
    const itens = itensDaSemanaParaRestricoes(dias);
    expect(itens).toContain('Frango com creme de leite');
    expect(itens).toContain('Arroz e Feijão');
    expect(itens.filter((x) => x === 'Arroz e Feijão')).toHaveLength(1);
  });

  it('aceita somente snapshot minimizado, da unidade esperada pelo próprio payload', () => {
    const snapshot = {
      contrato: 'tata-house-governanca-restricoes',
      versao: 1,
      modo: 'read-only',
      origem: 'lideres',
      fonte: 'tata_plus.restricoes_do_cardapio',
      carregadoEm: '2026-09-09T08:00:00Z',
      unidade: 'Itaim',
      semanaId: '2026-S37',
      itensConsultados: 4,
      conflitos: [{ nome: 'Pessoa A', unidade: 'Itaim', itens: ['Creme de leite'] }],
    };
    expect(normalizarSnapshotRestricoesGovernanca(snapshot)).toEqual(snapshot);
    expect(normalizarSnapshotRestricoesGovernanca({ ...snapshot, token: 'proibido' })).toBeNull();
    expect(normalizarSnapshotRestricoesGovernanca({ ...snapshot, conflitos: [{ ...snapshot.conflitos[0], matricula: 7 }] })).toBeNull();
    expect(normalizarSnapshotRestricoesGovernanca({ ...snapshot, conflitos: [{ nome: 'Pessoa A', unidade: 'Pinheiros', itens: ['Creme de leite'] }] })).toBeNull();
  });
});
