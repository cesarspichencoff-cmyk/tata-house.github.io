import { describe, it, expect } from 'vitest';
import { parsearCotacao, ehRemetenteInterno, bloquearRemetente } from './cotacao';

describe('cotação — remetente interno (Erika) não é fornecedor', () => {
  it('ehRemetenteInterno reconhece a Erika em várias grafias', () => {
    expect(ehRemetenteInterno('Erika')).toBe(true);
    expect(ehRemetenteInterno('erika')).toBe(true);
    expect(ehRemetenteInterno('Erika Compras')).toBe(true);
    expect(ehRemetenteInterno('Vita Frango')).toBe(false);
    expect(ehRemetenteInterno('')).toBe(false);
  });

  it('mesmo cadastrada, Erika não é reconhecida como fornecedor', () => {
    const texto = [
      '[10:32] Erika: bom dia, segue a cotação',
      'Frango inteiro 7,00',
    ].join('\n');
    const linhas = parsearCotacao(texto, ['Erika']); // cadastrada por engano
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.marca !== 'Erika')).toBe(true);
  });

  it('encontra o fornecedor REAL no corpo, ignorando quem encaminhou', () => {
    const texto = [
      '[08:15] Erika: encaminhando',
      'Vita Frango',
      'Frango inteiro 7,00',
      'Coxa com sobrecoxa 9,50',
    ].join('\n');
    const linhas = parsearCotacao(texto);
    expect(linhas.length).toBe(2);
    expect(linhas.every((l) => l.marca === 'Vita Frango')).toBe(true);
  });

  it('bloquearRemetente estende a lista em runtime', () => {
    expect(ehRemetenteInterno('Joana')).toBe(false);
    bloquearRemetente('Joana');
    expect(ehRemetenteInterno('Joana')).toBe(true);
  });
});

describe('cotação — lê as muitas formas de colagem (celular e desktop)', () => {
  const preco = (txt: string) => {
    const l = parsearCotacao(txt);
    return l.length ? l[0].preco : 0;
  };

  it('preço em qualquer posição / com R$ / com barra / com unidade', () => {
    const formas = [
      'Acém 29,80', 'ACEM KG 29,80', '29,80 ACEM KG', 'Acém 29,80 KG',
      'Acém R$ 29,80', 'Acém - 29,80', 'Acém: 29,80', 'Acém R$29,80/kg',
      'Acém 29,80/kg', '- Acém 29,80', '• Acém 29,80', 'Acém (kg) 29,80',
      'Acém RF 29,80', 'Acém   29,80', '🍖 Acém 29,80', 'Acém kg R$ 29,80',
    ];
    for (const f of formas) expect(preco(f), f).toBeCloseTo(29.80, 2);
  });

  it('milhar com ponto e centavos com vírgula', () => {
    expect(preco('Costela 1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('linha multi-item (colunas coladas) vira vários itens com o preço certo', () => {
    const linhas = parsearCotacao('GENGIBRE KG 19,48 INHAME KG 11,59 JILO KG 20,30');
    expect(linhas.length).toBe(3);
    expect(linhas[0].preco).toBeCloseTo(19.48, 2);
    expect(linhas[1].preco).toBeCloseTo(11.59, 2);
    expect(linhas[2].preco).toBeCloseTo(20.30, 2);
  });

  it('cabeçalho de fornecedor real aplica a todos os itens abaixo', () => {
    const linhas = parsearCotacao('FLD\nTOMATE KG 6,99\nCENOURA KG 5,50');
    expect(linhas.length).toBe(2);
    expect(linhas.every((l) => l.marca === 'FLD')).toBe(true);
  });

  it('"Fornecedor: X" explícito, mesmo não cadastrado, marca a seção', () => {
    const linhas = parsearCotacao('Fornecedor Hortifruti\nCenoura 11,10\nChuchu 6,58');
    expect(linhas.length).toBe(2);
    expect(linhas.every((l) => l.marca === 'Hortifruti')).toBe(true);
  });

  it('WhatsApp encaminhado: usa o fornecedor real, ignora quem encaminhou', () => {
    const linhas = parsearCotacao('[08:15] Erika: segue\nMar Fish\nTilápia 18,90\nMerluza 22,00');
    expect(linhas.length).toBe(2);
    expect(linhas.every((l) => l.marca === 'Mar Fish')).toBe(true);
  });
});

describe('unidade da cotação não pode inflar o custo em silêncio', () => {
  it('caixa cotada para item medido em quilo é bloqueada, não aplicada', () => {
    // Cenário real: fornecedor manda "ABACAXI CX 240,00". O item é medido em
    // KG. Antes, o app aplicava R$ 240,00/kg e o custo da semana disparava.
    const linhas = parsearCotacao('ABACAXI CX 240,00');
    const abacaxi = linhas.find((l) => (l.item ?? l.nome).toLowerCase().includes('abacaxi'));
    expect(abacaxi).toBeDefined();
    expect(abacaxi!.bloqueado).toBe(true);
    expect(abacaxi!.alerta ?? '').toMatch(/embalagem|não converte/i);
  });

  it('cotação na unidade padrão continua passando normalmente', () => {
    const linhas = parsearCotacao('ABACAXI KG 7,40');
    const abacaxi = linhas.find((l) => (l.item ?? l.nome).toLowerCase().includes('abacaxi'));
    expect(abacaxi).toBeDefined();
    expect(abacaxi!.bloqueado).toBeFalsy();
    expect(abacaxi!.preco).toBeCloseTo(7.4, 2);
  });
});
