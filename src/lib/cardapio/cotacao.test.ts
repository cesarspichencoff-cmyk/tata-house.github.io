import { describe, it, expect } from 'vitest';
import { parsearCotacao, agruparCotacao, ehRemetenteInterno, bloquearRemetente, sugerirItemCotacao } from './cotacao';

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


describe('cotação — formato estruturado e seleção dimensional segura', () => {
  it('lê campos estruturados sem transformar metadados em produto', () => {
    const [linha] = parsearCotacao('ID=0020 | FORNECEDOR=WG | CATEGORIA=BOVINOS | PRODUTO=Tiras de carnes | UNIDADE_PRECO=KG | PRECO=39,98 | CONSERVACAO=RF');
    expect(linha).toBeDefined();
    expect(linha.nome).toBe('Tiras de carnes');
    expect(linha.marca).toBe('WG');
    expect(linha.item).toBe('Tiras de Carne');
    expect(linha.unid).toBe('kg');
    expect(linha.conservacao).toBe('resfriado');
    expect(linha.origem).toBe('estruturado');
    expect(linha.preco).toBeCloseTo(39.98, 2);
  });

  it('ignora linha estruturada incompleta em vez de cadastrar metadata como produto', () => {
    expect(parsearCotacao('ID=0001 | FORNECEDOR=WG | PRECO=39,98')).toHaveLength(0);
  });

  it('ignora documentação com preço de exemplo', () => {
    expect(parsearCotacao('IMPORTANTE: exemplo de preço 39,98')).toHaveLength(0);
  });

  it('preserva RF/CG como atributo e não polui o nome canônico', () => {
    const [linha] = parsearCotacao('Frango inteiro RF 9,98');
    expect(linha.nome).toBe('Frango inteiro');
    expect(linha.conservacao).toBe('resfriado');
  });

  it('oferta incompatível mais barata não substitui oferta válida', () => {
    const linhas = parsearCotacao('ABACAXI CX 2,00\nABACAXI KG 7,40');
    const item = agruparCotacao(linhas).casados.find((x) => x.item.toLowerCase().includes('abacaxi'));
    expect(item).toBeDefined();
    expect(item!.ofertas).toBe(2);
    expect(item!.bloqueado).toBeFalsy();
    expect(item!.preco).toBeCloseTo(7.40, 2);
  });
});


describe('cotação — assimilação automática conservadora', () => {
  it('resolve plural simples sem pedir relacionamento manual', () => {
    const sugestao = sugerirItemCotacao('ABACAXIS');
    expect(sugestao.item?.toLowerCase()).toContain('abacaxi');
    expect(sugestao.confianca).toBeGreaterThanOrEqual(0.9);
  });

  it('usa itens extras já aprendidos mesmo com qualificadores do fornecedor', () => {
    const extras = { 'molho especial': { n: 'Molho especial', u: 'lt' } };
    const agrupado = agruparCotacao([
      { nome: 'Molho especial casa', preco: 19.9, marca: 'Fornecedor X', unid: 'lt', item: null },
    ], extras);
    expect(agrupado.soltos).toHaveLength(0);
    expect(agrupado.casados[0]?.item).toBe('Molho especial');
  });

  it('não força match quando a evidência lexical é fraca', () => {
    const sugestao = sugerirItemCotacao('Produto promocional código ZXQ');
    expect(sugestao.item).toBeNull();
  });
});
