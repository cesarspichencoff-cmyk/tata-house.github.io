import { describe, it, expect } from 'vitest';
import { precisaReparo, aplicarReparo } from './reparo-feijoada';
import type { EstadoSemana } from './tipos';

/** Semana como ficou depois da regressão (feijoada caiu no domingo). */
function semanaErrada(): EstadoSemana {
  const dia = (principal: string, guarnicaoFixa: string, guarnicao: string, salada: string, sobremesa: string) => ({
    pessoas: 60,
    principal,
    guarnicaoFixa,
    guarnicao,
    salada,
    sobremesa,
  });
  return {
    versao: 1,
    orcamento: null,
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
    dias: [
      dia('Costelinha suína ao barbecue', 'Arroz e Feijão', 'Farofa Temperada', 'Salada de abobrinha', 'Cocada cremosa'),
      dia('File de Frango Grelhado', 'Arroz e Feijão', 'Purê de batata', 'Alface Lisa Tomate e Pepino', 'Melão'),
      dia('Pernil Assado com Abacaxi', 'Arroz e Feijão', 'Farofa', 'Repolho Roxo com cenoura', 'Pudim'),
      dia('Frango Cozido com legumes', 'Arroz e Feijão', 'Abóbora Refogada', 'Alface e Tomate', 'Melancia'),
      dia('Carne em Cubos ao Molho de Tomate', 'Arroz e Feijão', 'Batata Frita', 'Acelga com Tomate', 'Abacaxi'),
      dia('File de Frango Parmegiana', 'Arroz e Feijão', 'Batata Frita', 'Alface Americano com Tomate', 'Pudim de Leite'),
      dia('Feijoada Completa', 'Arroz branco', 'Farofa simples', 'Couve com Tomate', 'Abacaxi'),
    ],
  };
}

describe('reparo da semana 24–30/08 (feijoada na quarta)', () => {
  it('reconhece a semana no estado errado', () => {
    expect(precisaReparo(semanaErrada())).toBe(true);
  });

  it('põe a feijoada na quarta, com o nome pedido, levando os acompanhamentos', () => {
    const r = aplicarReparo(semanaErrada());
    expect(r.dias[2].principal).toBe('Feijoada com costelinha e lombo');
    expect(r.dias[2].guarnicaoFixa).toBe('Arroz branco');
    expect(r.dias[2].guarnicao).toBe('Farofa simples');
    expect(r.dias[2].salada).toBe('Couve com Tomate');
    expect(r.dias[2].sobremesa).toBe('Abacaxi');
  });

  it('manda o pernil (e seus acompanhamentos) para o domingo', () => {
    const r = aplicarReparo(semanaErrada());
    expect(r.dias[6].principal).toBe('Pernil Assado com Abacaxi');
    expect(r.dias[6].guarnicaoFixa).toBe('Arroz e Feijão');
    expect(r.dias[6].salada).toBe('Repolho Roxo com cenoura');
  });

  it('não mexe nos outros dias', () => {
    const antes = semanaErrada();
    const r = aplicarReparo(antes);
    for (const i of [0, 1, 3, 4, 5]) {
      expect(r.dias[i]).toEqual(antes.dias[i]);
    }
  });

  it('o número de pessoas continua pertencendo ao dia, não viaja com o prato', () => {
    const antes = semanaErrada();
    antes.dias[2].pessoas = 71;
    antes.dias[6].pessoas = 12;
    const r = aplicarReparo(antes);
    expect(r.dias[2].pessoas).toBe(71);
    expect(r.dias[6].pessoas).toBe(12);
  });

  it('não repara de novo depois de reparado (idempotente)', () => {
    const r = aplicarReparo(semanaErrada());
    expect(precisaReparo(r)).toBe(false);
  });

  it('não encosta numa semana já corrigida à mão', () => {
    const jaCerta = semanaErrada();
    jaCerta.dias[2].principal = 'Feijoada com costelinha e lombo';
    jaCerta.dias[6].principal = 'Pernil Assado com Abacaxi';
    expect(precisaReparo(jaCerta)).toBe(false);
  });

  it('ignora semana vazia ou incompleta', () => {
    expect(precisaReparo(null)).toBe(false);
    expect(precisaReparo({ dias: [] } as unknown as EstadoSemana)).toBe(false);
  });
});
