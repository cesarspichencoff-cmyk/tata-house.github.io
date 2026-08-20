import { describe, it, expect } from 'vitest';
import {
  nutricaoDoPratoMontado,
  macrosProteina,
  PORCAO_PRATO_G,
  PORCAO_PROTEINA_G,
  gramasDaPorcao,
} from './nutricao-prato';
import { infoNutricional } from './nutricional';
import type { DiaCardapio } from './tipos';

const dia = (p: Partial<DiaCardapio>): DiaCardapio => ({
  pessoas: 60,
  principal: '',
  guarnicaoFixa: 'Arroz e Feijão',
  guarnicao: '',
  salada: '',
  sobremesa: '',
  ...p,
});

describe('nutrição do prato montado (recomendações do nutricionista)', () => {
  it('porção de referência é o prato de ~500 g', () => {
    expect(PORCAO_PRATO_G).toBe(500);
  });

  it('proteína é servida em 3 colheres de servir (120 g)', () => {
    expect(PORCAO_PROTEINA_G).toBe(120);
  });

  it('CARBO: arroz e feijão entram na conta — o antigo dava ~0 g no frango grelhado', () => {
    const d = dia({ principal: 'File de Frango Grelhado' });

    // Como era antes: só a proteína — carboidrato praticamente nulo,
    // irreal para um almoço servido com arroz e feijão.
    const soProteina = infoNutricional(d.principal)!;
    expect(soProteina.carboidratos).toBeLessThan(5);

    const prato = nutricaoDoPratoMontado(d)!;
    // Arroz (150 g) + feijão (80 g) já trazem ~53 g de carboidrato.
    expect(prato.carb).toBeGreaterThan(45);
    expect(prato.carb).toBeLessThan(75);
  });

  it('GORDURA: deixa de ser quase todo o prato ao entrar arroz, feijão e salada', () => {
    const d = dia({ principal: 'Costelinha de porco', salada: 'Alface e tomate' });
    const soProteina = infoNutricional(d.principal)!; // 220 g → 32 g de gordura
    const prato = nutricaoDoPratoMontado(d)!;

    // A porção de proteína cai para 120 g, então a gordura absoluta cai...
    expect(prato.gord).toBeLessThan(soProteina.gorduras);
    // ...e passa a ser uma fração menor das calorias do prato.
    const fracaoAntes = (soProteina.gorduras * 9) / soProteina.kcal;
    const fracaoDepois = (prato.gord * 9) / prato.kcal;
    expect(fracaoDepois).toBeLessThan(fracaoAntes);
  });

  it('a proteína é reescalada da porção da tabela para 3 colheres', () => {
    const info = infoNutricional('File de Frango Grelhado')!;
    const gramasTabela = gramasDaPorcao(info.porcao) ?? 200;
    const m = macrosProteina('File de Frango Grelhado')!;
    expect(m.prot).toBeCloseTo(info.proteinas * (PORCAO_PROTEINA_G / gramasTabela), 1);
  });

  it('guarnição e salada somam ao prato', () => {
    const semGuarnicao = nutricaoDoPratoMontado(dia({ principal: 'Frango grelhado' }))!;
    const comGuarnicao = nutricaoDoPratoMontado(
      dia({ principal: 'Frango grelhado', guarnicao: 'Batata frita', salada: 'Alface' }),
    )!;
    expect(comGuarnicao.kcal).toBeGreaterThan(semGuarnicao.kcal);
    expect(comGuarnicao.carb).toBeGreaterThan(semGuarnicao.carb);
  });

  it('um almoço completo fica numa faixa calórica plausível', () => {
    const prato = nutricaoDoPratoMontado(
      dia({ principal: 'File de Frango Grelhado', guarnicao: 'Purê de batata', salada: 'Alface e tomate' }),
    )!;
    expect(prato.kcal).toBeGreaterThan(450);
    expect(prato.kcal).toBeLessThan(900);
    expect(prato.prot).toBeGreaterThan(20); // proteína continua adequada
  });

  it('sem prato principal não há análise', () => {
    expect(nutricaoDoPratoMontado(dia({ principal: '' }))).toBeNull();
  });

  it('proteína desconhecida ainda soma os acompanhamentos e se declara', () => {
    const prato = nutricaoDoPratoMontado(dia({ principal: 'Prato inventado xyz' }))!;
    expect(prato.proteinaDesconhecida).toBe(true);
    expect(prato.carb).toBeGreaterThan(40); // arroz e feijão continuam contando
  });
});
