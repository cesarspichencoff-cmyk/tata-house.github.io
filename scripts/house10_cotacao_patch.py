from pathlib import Path

p = Path('src/lib/cardapio/cotacao.ts')
s = p.read_text()

if "formato canônico estruturado" not in s:
    marker = "export function parsearCotacao(texto: string, fornecedoresCustom: string[] = []): LinhaCotacao[] {"
    assert marker in s
    helper = r'''
function unidadeEstruturada(valor: string | undefined): string | null {
  const n = normalizar(valor ?? '').replace(/\s+/g, ' ');
  if (!n || n === 'nao informado' || n === 'nao informada' || n === 'n/a') return null;
  const mapa: Record<string, string> = {
    und: 'un', unid: 'un', unidade: 'un', bdj: 'bd', bandeja: 'bd', pacote: 'pct',
    pcte: 'pct', litro: 'lt', litros: 'lt', l: 'lt', caixa: 'cx', saco: 'sc',
    maco: 'mc', peca: 'pc',
  };
  const u = mapa[n] ?? n;
  return UNIDADES.has(u) ? u : null;
}

function precoEstruturado(valor: string | undefined): number {
  if (!valor) return 0;
  const limpo = valor.replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!limpo) return 0;
  if (/,\d{1,2}$/.test(limpo)) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  const n = Number(limpo.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function conservacaoEstruturada(valor: string | undefined): 'resfriado' | 'congelado' | null {
  const n = normalizar(valor ?? '');
  if (/^(rf|resf|resfriado|resfriada)$/.test(n)) return 'resfriado';
  if (/^(cg|cong|congelado|congelada|congelados)$/.test(n)) return 'congelado';
  return null;
}

/** formato canônico estruturado: metadado nunca vira nome de produto. */
function parsearLinhaEstruturada(
  linha: string,
  fornecedorConhecido: (s: string) => string | null,
): LinhaCotacao | null {
  const campos: Record<string, string> = {};
  for (const parte of linha.split('|')) {
    const pos = parte.indexOf('=');
    if (pos <= 0) continue;
    const chave = normalizar(parte.slice(0, pos)).replace(/\s+/g, '_');
    const valor = parte.slice(pos + 1).trim();
    if (chave && valor) campos[chave] = valor;
  }

  const produto = (campos.produto ?? campos.item ?? campos.nome ?? '').trim();
  const preco = precoEstruturado(campos.preco);
  if (!produto || !(preco > 0)) return null;

  const fornecedorRaw = (campos.fornecedor ?? '').trim();
  const marcaRaw = (campos.marca ?? '').trim();
  let marca: string | null = null;
  if (fornecedorRaw && !ehRemetenteInterno(fornecedorRaw)) marca = fornecedorConhecido(fornecedorRaw) ?? fornecedorRaw;
  else if (marcaRaw && !ehRemetenteInterno(marcaRaw)) marca = fornecedorConhecido(marcaRaw) ?? marcaRaw;

  const unid = unidadeEstruturada(campos.unidade_preco ?? campos.unidade ?? campos.unid);
  const conservacao = conservacaoEstruturada(campos.conservacao ?? campos.estado);
  return validarLinha({ nome: produto, preco, marca, unid, item: casarItem(produto), conservacao, origem: 'estruturado' });
}

'''
    s = s.replace(marker, helper + marker, 1)

    old_iface = "  origemHistorico?: string | null;\n}"
    new_iface = "  origemHistorico?: string | null;\n  conservacao?: 'resfriado' | 'congelado' | null;\n  origem?: 'texto' | 'estruturado' | 'ia';\n}"
    assert old_iface in s
    s = s.replace(old_iface, new_iface, 1)

    anchor = "    const linhaLimpa = limparLinha(bruta);\n    if (!linhaLimpa || linhaLimpa.length < 2) continue;\n\n    // Quebra linhas multi-item"
    replacement = "    const linhaLimpa = limparLinha(bruta);\n    if (!linhaLimpa || linhaLimpa.length < 2) continue;\n\n    if (/^(importante|legenda|observa(?:cao|ção)|obs)\\s*[:\\-]/i.test(linhaLimpa)) continue;\n\n    const pareceEstruturada = /(?:^|\\|)\\s*(?:id|fornecedor|produto|item|nome|preco|unidade_preco|conservacao|estado)\\s*=/i.test(linhaLimpa);\n    if (pareceEstruturada) {\n      const estruturada = parsearLinhaEstruturada(linhaLimpa, fornecedorConhecido);\n      if (estruturada) linhas.push(estruturada);\n      continue;\n    }\n\n    // Quebra linhas multi-item"
    assert anchor in s
    s = s.replace(anchor, replacement, 1)

    old_newline = "    const novaLinha: LinhaCotacao = { nome, preco, marca, unid, item: casarItem(nome) };\n    linhas.push(validarLinha(novaLinha));"
    new_newline = "    const brutoConservacao = normalizar(linhaItem);\n    const conservacao = /\\b(rf|resf|resfriado|resfriada)\\b/.test(brutoConservacao)\n      ? 'resfriado' as const\n      : /\\b(cg|cong|congelado|congelada|congelados)\\b/.test(brutoConservacao)\n        ? 'congelado' as const\n        : null;\n    nome = nome.replace(/\\b(RF|CG|RESF|RESFRIAD[OA]|CONG|CONGELAD[OA]S?)\\b/gi, '').replace(/\\s+/g, ' ').trim();\n    const novaLinha: LinhaCotacao = { nome, preco, marca, unid, item: casarItem(nome), conservacao, origem: 'texto' };\n    linhas.push(validarLinha(novaLinha));"
    assert old_newline in s
    s = s.replace(old_newline, new_newline, 1)

    old_merge = "      item: l.item || par?.item || null,\n    };"
    new_merge = "      item: l.item || par?.item || null,\n      conservacao: l.conservacao ?? par?.conservacao ?? null,\n      origem: l.origem ?? par?.origem ?? 'texto',\n    };"
    assert old_merge in s
    s = s.replace(old_merge, new_merge, 1)

    old_ai_map = "        unid: null,\n        item: casarItem(it.nome),\n      };"
    new_ai_map = "        unid: null,\n        item: casarItem(it.nome),\n        conservacao: null,\n        origem: 'ia' as const,\n      };"
    assert old_ai_map in s
    s = s.replace(old_ai_map, new_ai_map, 1)

    old_group = """    } else {\n      atual.ofertas++;\n      if (l.preco < atual.preco) {\n        atual.preco = l.preco;\n        atual.marca = l.marca;\n        atual.precoHistorico = l.precoHistorico;\n        atual.deltaHistorico = l.deltaHistorico;\n        atual.confianca = l.confianca;\n        atual.alerta = l.alerta;\n        atual.bloqueado = l.bloqueado;\n        atual.origemHistorico = l.origemHistorico;\n      }\n    }\n"""
    new_group = """    } else {\n      atual.ofertas++;\n      const atualBloqueado = !!atual.bloqueado;\n      const novoBloqueado = !!l.bloqueado;\n      const deveTrocar = (atualBloqueado && !novoBloqueado)\n        || (atualBloqueado === novoBloqueado && l.preco < atual.preco);\n      if (deveTrocar) {\n        atual.preco = l.preco;\n        atual.marca = l.marca;\n        atual.precoHistorico = l.precoHistorico;\n        atual.deltaHistorico = l.deltaHistorico;\n        atual.confianca = l.confianca;\n        atual.alerta = l.alerta;\n        atual.bloqueado = l.bloqueado;\n        atual.origemHistorico = l.origemHistorico;\n      }\n    }\n"""
    assert old_group in s
    s = s.replace(old_group, new_group, 1)

    s = s.replace("unid: unidadeDoItem.get(l.item) ?? extra?.u ?? l.unid ?? 'kg',", "unid: unidadeDoItem.get(l.item) ?? extra?.u ?? l.unid ?? '',", 1)

p.write_text(s)

t = Path('src/lib/cardapio/cotacao.test.ts')
ts = t.read_text()
if "formato estruturado e seleção dimensional segura" not in ts:
    ts = ts.replace(
        "import { parsearCotacao, ehRemetenteInterno, bloquearRemetente } from './cotacao';",
        "import { parsearCotacao, agruparCotacao, ehRemetenteInterno, bloquearRemetente } from './cotacao';",
        1,
    )
    ts += r'''

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
'''
    t.write_text(ts)
