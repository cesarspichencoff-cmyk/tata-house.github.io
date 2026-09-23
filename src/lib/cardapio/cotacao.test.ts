import { describe, it, expect } from 'vitest';
import { parsearCotacao, agruparCotacao, classificarUnidadesCotacao, ehRemetenteInterno, bloquearRemetente, reconstruirLinhasPdfCotacao, sugerirItemCotacao } from './cotacao';

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


describe('cotação — formatos reais recebidos em 22/09/2026', () => {
  it('rótulo de fornecedor enviado depois da mensagem corrige retroativamente o bloco anterior', () => {
    const texto = [
      '[22/09/2026, 10:03:00] Tatá Sushi Compras - Érika: Tiras de carnes. R$ 39,98',
      'Tiras de Frangos R$ 19,98',
      'Bife R$ 44,98',
      '[22/09/2026, 10:03:07] Tatá Sushi Compras - Érika: WG👆🏾',
    ].join('\n');
    const linhas = parsearCotacao(texto);
    expect(linhas).toHaveLength(3);
    expect(linhas.every((l) => l.marca === 'WG')).toBe(true);
  });

  it('aceita a grafia operacional Apetitto no marcador retroativo', () => {
    const texto = [
      '[22/09/2026, 10:01:47] Tatá Sushi Compras - Érika: Acém 30,48',
      '[22/09/2026, 10:01:57] Tatá Sushi Compras - Érika: Apetitto👆🏾',
    ].join('\n');
    const [linha] = parsearCotacao(texto);
    expect(linha.marca).toBe('Apetito Foods');
  });

  it('preço declarado para RF e CG não inventa uma conservação única', () => {
    const [linha] = parsearCotacao('VITA FRANGO\n12,60 Asa RF e CG');
    expect(linha.marca).toBe('Vita Frango');
    expect(linha.conservacao).toBeNull();
  });

  it('unidade canônica do catálogo protege item mesmo sem unidade na tabela histórica de preços', () => {
    const linhas = parsearCotacao('ALHO CX 298,00\nALHO UN 2,98\nALHO KG 29,80');
    const item = agruparCotacao(linhas).casados.find((x) => x.item.toLowerCase() === 'alho');
    expect(item).toBeDefined();
    expect(item!.bloqueado).toBeFalsy();
    expect(item!.unid).toBe('kg');
    expect(item!.preco).toBeCloseTo(29.80, 2);
  });
});

describe('cotação — PDF tabular e assimilação em escala', () => {
  it('reconstrói uma linha visual de três colunas antes de separar os itens', () => {
    const linha = reconstruirLinhasPdfCotacao([
      { str: 'POLPA DE SERIGUELA', x: 10, y: 700 },
      { str: 'KG', x: 110, y: 700.6 },
      { str: '50,40', x: 135, y: 700.2 },
      { str: 'ALHO', x: 260, y: 700 },
      { str: 'CX', x: 330, y: 699.8 },
      { str: '298,00', x: 360, y: 700.3 },
      { str: 'OVOS DE GALINHA', x: 500, y: 700 },
      { str: 'CX', x: 610, y: 700.4 },
      { str: '281,20', x: 640, y: 700 },
    ]);
    expect(linha).toHaveLength(1);
    const itens = parsearCotacao(linha[0]);
    expect(itens).toHaveLength(3);
    expect(itens.map((x) => x.preco)).toEqual([50.4, 298, 281.2]);
  });

  it('não assimila automaticamente um produto novo quando o PDF oferece várias unidades', () => {
    const classificacao = classificarUnidadesCotacao([
      { nome: 'Banana Colorido', preco: 119.2, marca: null, unid: 'cx', item: null },
      { nome: 'Banana Colorido', preco: 1.49, marca: null, unid: 'un', item: null },
      { nome: 'Banana Colorido', preco: 7.89, marca: null, unid: 'kg', item: null },
      { nome: 'Produto X', preco: 10, marca: null, unid: 'kg', item: null },
    ]);
    expect(classificacao.nomesMultiUnidade.has('banana colorido')).toBe(true);
    expect(classificacao.nomesUnidadeUnica.has('banana colorido')).toBe(false);
    expect(classificacao.nomesUnidadeUnica.has('produto x')).toBe(true);
  });
});


describe('cotação — confluência de identidade e fornecedor', () => {
  it('preserva fornecedor explícito do bloco contra rótulo posterior conflitante', () => {
    const texto = [
      '[22/09/2026, 10:01:22] Tatá Sushi Compras - Érika: PROMOÇÕES SULBEEF',
      'Acém Pesado 31,20',
      '[22/09/2026, 10:01:29] Tatá Sushi Compras - Érika: Jampac👆🏾',
    ].join('\n');
    const [linha] = parsearCotacao(texto);
    expect(linha?.marca).toBe('Sulbeef');
  });

  it('prefere identidade exata do catálogo antes de alias amplo', () => {
    expect(sugerirItemCotacao('Filé de Peito').item).toBe('Filé de peito');
    expect(sugerirItemCotacao('Sassami').item).toBe('Filezinho sassami');
  });

  it('não funde variantes comerciais distintas em genéricos inseguros', () => {
    expect(sugerirItemCotacao('Bife Ancho').item).toBeNull();
    expect(sugerirItemCotacao('Lombinho Bovino').item).toBeNull();
    expect(sugerirItemCotacao('Costela Janela').item).toBeNull();
    expect(sugerirItemCotacao('Batata 9mm Surecrisp').item).toBeNull();
  });
});
