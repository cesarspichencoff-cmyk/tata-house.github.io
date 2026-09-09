import fs from 'node:fs';

function patchFile(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (s.includes(to)) continue;
    if (!s.includes(from)) throw new Error(`anchor ausente em ${path}: ${label}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s);
}

patchFile('src/lib/cardapio/governanca-candidatos.ts', [
  [
    "import type { DiaCardapio, EstadoSemana } from './tipos';",
    "import type { DiaCardapio, EstadoSemana, RegistroDesperdicio } from './tipos';",
    'tipo desperdicio',
  ],
  [
    "  pessoasRestricaoSomadas: number;\n  nutricaoMedia: number;",
    "  pessoasRestricaoSomadas: number;\n  desperdicioMedioPct: number | null;\n  pratosComDesperdicio: number;\n  amostraDesperdicio: number;\n  nutricaoMedia: number;",
    'metricas desperdicio',
  ],
  [
    "  restricoesEquipe?: Record<string, number>;\n}",
    "  restricoesEquipe?: Record<string, number>;\n  desperdicioHistorico?: RegistroDesperdicio[];\n}",
    'contexto desperdicio',
  ],
  [
    "function fingerprintDias(dias: DiaCardapio[]): string {",
    "export interface DesperdicioPratoPlanejamento { taxaMedia: number; n: number; }\n\n/** Taxa adimensional por prato. Cada registro é normalizado dentro da própria unidade\n * (kg ou porções), portanto nunca somamos quantidades incompatíveis. */\nexport function agregarDesperdicioHistorico(registros: RegistroDesperdicio[]): Record<string, DesperdicioPratoPlanejamento> {\n  const acc: Record<string, { soma: number; n: number }> = {};\n  registros.forEach((r) => {\n    if (!(r.produzido > 0) || !Number.isFinite(r.consumido)) return;\n    const chave = normalizar(r.prato);\n    if (!chave) return;\n    const taxa = Math.max(0, Math.min(1, (r.produzido - r.consumido) / r.produzido));\n    const atual = acc[chave] ?? { soma: 0, n: 0 };\n    atual.soma += taxa;\n    atual.n += 1;\n    acc[chave] = atual;\n  });\n  return Object.fromEntries(Object.entries(acc).map(([chave, v]) => [chave, { taxaMedia: v.soma / v.n, n: v.n }]));\n}\n\nfunction fingerprintDias(dias: DiaCardapio[]): string {",
    'helper desperdicio',
  ],
  [
    "  restricoesEquipe?: Record<string, number>;\n}): MetricasCenarioGovernanca {",
    "  restricoesEquipe?: Record<string, number>;\n  desperdicioHistorico?: RegistroDesperdicio[];\n}): MetricasCenarioGovernanca {",
    'args desperdicio',
  ],
  [
    "  const impactoRestricoes = impactoRestricoesLocais(args.dias, args.restricoesEquipe ?? {});\n\n  return {",
    "  const impactoRestricoes = impactoRestricoesLocais(args.dias, args.restricoesEquipe ?? {});\n  const desperdicio = agregarDesperdicioHistorico(args.desperdicioHistorico ?? []);\n  let somaTaxasDesperdicio = 0;\n  let amostraDesperdicio = 0;\n  let pratosComDesperdicio = 0;\n  args.dias.forEach((dia) => {\n    const d = desperdicio[normalizar(dia.principal)];\n    if (!d || d.n <= 0) return;\n    somaTaxasDesperdicio += d.taxaMedia * d.n;\n    amostraDesperdicio += d.n;\n    pratosComDesperdicio += 1;\n  });\n  const desperdicioMedioPct = amostraDesperdicio > 0\n    ? Math.round((somaTaxasDesperdicio / amostraDesperdicio) * 100)\n    : null;\n\n  return {",
    'calculo desperdicio',
  ],
  [
    "    pessoasRestricaoSomadas: impactoRestricoes.pessoasSomadas,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    "    pessoasRestricaoSomadas: impactoRestricoes.pessoasSomadas,\n    desperdicioMedioPct,\n    pratosComDesperdicio,\n    amostraDesperdicio,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    'retorno desperdicio',
  ],
  [
    "  else itens.push('Nenhum conflito foi encontrado nas restrições cadastradas no módulo de funcionários do House.');\n  if (m.itensSemPreco > 0)",
    "  else itens.push('Nenhum conflito foi encontrado nas restrições cadastradas no módulo de funcionários do House.');\n  if (m.desperdicioMedioPct !== null) itens.push(`Histórico House dos principais deste cenário: desperdício médio ${m.desperdicioMedioPct}% em ${m.amostraDesperdicio} registro(s), cobrindo ${m.pratosComDesperdicio}/7 prato(s). A taxa é normalizada dentro de cada registro; kg e porções nunca são somados.`);\n  else itens.push('Ainda não há amostra de desperdício House para os principais deste cenário; o sistema não inventa penalidade.');\n  if (m.itensSemPreco > 0)",
    'porque desperdicio',
  ],
  [
    "    restricoesEquipe: contexto.restricoesEquipe,\n  });",
    "    restricoesEquipe: contexto.restricoesEquipe,\n    desperdicioHistorico: contexto.desperdicioHistorico,\n  });",
    'montar metricas desperdicio',
  ],
  [
    "function gerarComMenorImpacto(gerador: () => DiaCardapio[] | null, restricoes: Record<string, number>): DiaCardapio[] | null {",
    "function gerarComMenorImpacto(\n  gerador: () => DiaCardapio[] | null,\n  restricoes: Record<string, number>,\n  desperdicioHistorico: RegistroDesperdicio[],\n): DiaCardapio[] | null {",
    'wrapper assinatura desperdicio',
  ],
  [
    "    const impacto = impactoRestricoesLocais(dias, restricoes);\n    const peso = impacto.pessoasSomadas * 100 + impacto.ocorrencias;",
    "    const impacto = impactoRestricoesLocais(dias, restricoes);\n    const desp = agregarDesperdicioHistorico(desperdicioHistorico);\n    let penalidadeDesperdicio = 0;\n    dias.forEach((dia) => {\n      const d = desp[normalizar(dia.principal)];\n      // Só influencia escolha automática com pelo menos 2 registros; amostra unitária fica apenas visível.\n      if (d && d.n >= 2) penalidadeDesperdicio += d.taxaMedia * 100;\n    });\n    // Restrição humana domina completamente o desempate; desperdício só refina candidatos equivalentes.\n    const peso = impacto.pessoasSomadas * 10000 + impacto.ocorrencias * 1000 + penalidadeDesperdicio;",
    'peso desperdicio',
  ],
  [
    "  const restricoes = ctx.restricoesEquipe ?? {};\n  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [\n    ['historico', gerarComMenorImpacto(() => sugerirSemanaHistorica(pessoas, ctx.precos, opts), restricoes)],\n    ['equilibrado', gerarComMenorImpacto(() => sugerirSemana(pessoas, ctx.precos, opts), restricoes)],\n    ['criativo', gerarComMenorImpacto(() => sugerirSemanaCriativa(pessoas, ctx.precos, opts), restricoes)],\n  ];",
    "  const restricoes = ctx.restricoesEquipe ?? {};\n  const desperdicioHistorico = ctx.desperdicioHistorico ?? [];\n  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [\n    ['historico', gerarComMenorImpacto(() => sugerirSemanaHistorica(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],\n    ['equilibrado', gerarComMenorImpacto(() => sugerirSemana(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],\n    ['criativo', gerarComMenorImpacto(() => sugerirSemanaCriativa(pessoas, ctx.precos, opts), restricoes, desperdicioHistorico)],\n  ];",
    'geradores desperdicio',
  ],
]);

patchFile('src/components/cardapio/CenariosGovernanca.tsx', [
  [
    "import type { Aceitacao, EstadoSemana } from '@/lib/cardapio/tipos';",
    "import type { Aceitacao, EstadoSemana, RegistroDesperdicio } from '@/lib/cardapio/tipos';",
    'tipo UI desperdicio',
  ],
  [
    "        <Metric\n          label=\"Repetição recente\"",
    "        <Metric\n          label=\"Desperdício\"\n          value={m.desperdicioMedioPct === null ? 'Sem amostra' : `${m.desperdicioMedioPct}%`}\n          hint={m.desperdicioMedioPct === null ? 'histórico House ainda insuficiente' : `${m.pratosComDesperdicio}/7 principais · ${m.amostraDesperdicio} registro(s)`}\n        />\n        <Metric\n          label=\"Repetição recente\"",
    'metric UI desperdicio',
  ],
  [
    "  restricoesEquipe,\n}: {",
    "  restricoesEquipe,\n  desperdicioHistorico,\n}: {",
    'prop UI desperdicio',
  ],
  [
    "  restricoesEquipe: Record<string, number>;\n}) {",
    "  restricoesEquipe: Record<string, number>;\n  desperdicioHistorico: RegistroDesperdicio[];\n}) {",
    'tipo prop desperdicio',
  ],
  [
    "      restricoesEquipe,\n    });",
    "      restricoesEquipe,\n      desperdicioHistorico,\n    });",
    'passar desperdicio',
  ],
  [
    "            Compare propostas com custo, restrições, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    "            Compare propostas com custo, restrições, desperdício, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    'copy desperdicio',
  ],
]);

patchFile('src/components/cardapio/PlanejadorGovernanca.tsx', [
  [
    "  lerSemana,\n  semanasComConteudo,",
    "  lerDesperdicio,\n  lerSemana,\n  semanasComConteudo,",
    'import ler desperdicio',
  ],
  [
    "  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);\n\n  const prontidao",
    "  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);\n  const desperdicioHistorico = semanasComConteudo().flatMap((sid) => lerDesperdicio(sid));\n\n  const prontidao",
    'carregar desperdicio',
  ],
  [
    "              restricoesEquipe={restricoesEquipe}\n            />",
    "              restricoesEquipe={restricoesEquipe}\n              desperdicioHistorico={desperdicioHistorico}\n            />",
    'passar desperdicio UI',
  ],
]);

patchFile('src/lib/cardapio/governanca-candidatos.test.ts', [
  [
    "  analisarCenarioGovernanca,\n  aplicarCenarioAoEstado,",
    "  agregarDesperdicioHistorico,\n  analisarCenarioGovernanca,\n  aplicarCenarioAoEstado,",
    'import helper test',
  ],
  [
    "import type { Aceitacao, DiaCardapio, EstadoSemana } from './tipos';",
    "import type { Aceitacao, DiaCardapio, EstadoSemana, RegistroDesperdicio } from './tipos';",
    'tipo test desperdicio',
  ],
  [
    "const restricoesEquipe = {\n  [normalizar('Frango grelhado')]: 2,\n  [normalizar('Lombo suíno')]: 1,\n};",
    "const restricoesEquipe = {\n  [normalizar('Frango grelhado')]: 2,\n  [normalizar('Lombo suíno')]: 1,\n};\n\nconst desperdicioHistorico: RegistroDesperdicio[] = [\n  { id: 'd1', dia: 0, prato: 'Frango grelhado', produzido: 10, consumido: 8, unid: 'porções', em: '2026-08-01T00:00:00Z' },\n  { id: 'd2', dia: 0, prato: 'Frango grelhado', produzido: 5, consumido: 4, unid: 'kg', em: '2026-08-08T00:00:00Z' },\n  { id: 'd3', dia: 1, prato: 'Bife acebolado', produzido: 100, consumido: 95, unid: 'porções', em: '2026-08-09T00:00:00Z' },\n];",
    'fixture desperdicio',
  ],
  [
    "describe('governanca-candidatos', () => {",
    "describe('governanca-candidatos', () => {\n  it('normaliza desperdício por registro sem somar kg com porções', () => {\n    const mapa = agregarDesperdicioHistorico(desperdicioHistorico);\n    expect(mapa[normalizar('Frango grelhado')].n).toBe(2);\n    expect(mapa[normalizar('Frango grelhado')].taxaMedia).toBeCloseTo(0.2, 6);\n    expect(mapa[normalizar('Bife acebolado')].taxaMedia).toBeCloseTo(0.05, 6);\n  });",
    'teste normalizacao',
  ],
  [
    "      restricoesEquipe,\n    });",
    "      restricoesEquipe,\n      desperdicioHistorico,\n    });",
    'metric args test',
  ],
  [
    "    expect(metricas.pessoasRestricaoSomadas).toBe(3);\n    expect(metricas.proteinasDistintas)",
    "    expect(metricas.pessoasRestricaoSomadas).toBe(3);\n    expect(metricas.desperdicioMedioPct).toBe(15);\n    expect(metricas.pratosComDesperdicio).toBe(2);\n    expect(metricas.amostraDesperdicio).toBe(3);\n    expect(metricas.proteinasDistintas)",
    'assert metricas desperdicio',
  ],
  [
    "      restricoesEquipe,\n    });\n\n    expect(cenarios.length)",
    "      restricoesEquipe,\n      desperdicioHistorico,\n    });\n\n    expect(cenarios.length)",
    'geracao args desperdicio',
  ],
  [
    "      expect(cenario.porques.some((p) => /restri/i.test(p))).toBe(true);\n      expect(cenario.fingerprint",
    "      expect(cenario.porques.some((p) => /restri/i.test(p))).toBe(true);\n      expect(cenario.porques.some((p) => /desperd[ií]cio/i.test(p))).toBe(true);\n      expect(cenario.fingerprint",
    'porque desperdicio test',
  ],
]);

console.log('HOUSE_WASTE_INTELLIGENCE_PATCH=PASS');
