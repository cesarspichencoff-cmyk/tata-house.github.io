import fs from 'node:fs';

function patchFile(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!s.includes(from)) {
      if (s.includes(to)) continue;
      throw new Error(`anchor ausente em ${path}: ${label}`);
    }
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s);
}

patchFile('src/lib/cardapio/governanca-candidatos.ts', [
  [
    "} from './governanca-readonly';\nimport type { DiaCardapio, EstadoSemana } from './tipos';",
    "} from './governanca-readonly';\nimport { impactoRestricoesLocais } from './governanca-restricoes';\nimport type { DiaCardapio, EstadoSemana } from './tipos';",
    'import restricoes',
  ],
  [
    "  ocorrenciasRecentes: number;\n  nutricaoMedia: number;",
    "  ocorrenciasRecentes: number;\n  ocorrenciasRestricao: number;\n  pessoasRestricaoSomadas: number;\n  nutricaoMedia: number;",
    'metricas restricoes',
  ],
  [
    "  frequencia: Record<string, number>;\n  estoque?: Record<string, number>;\n}",
    "  frequencia: Record<string, number>;\n  estoque?: Record<string, number>;\n  restricoesEquipe?: Record<string, number>;\n}",
    'contexto restricoes',
  ],
  [
    "  aceitacao: AceitacaoPlanejamento;\n  frequencia: Record<string, number>;\n}): MetricasCenarioGovernanca {",
    "  aceitacao: AceitacaoPlanejamento;\n  frequencia: Record<string, number>;\n  restricoesEquipe?: Record<string, number>;\n}): MetricasCenarioGovernanca {",
    'args analisar restricoes',
  ],
  [
    "  const coberturaDadosPct = Math.round(((coberturaAceitacao + coberturaPreco) / 2) * 100);\n\n  return {",
    "  const coberturaDadosPct = Math.round(((coberturaAceitacao + coberturaPreco) / 2) * 100);\n  const impactoRestricoes = impactoRestricoesLocais(args.dias, args.restricoesEquipe ?? {});\n\n  return {",
    'calculo impacto',
  ],
  [
    "    pratosRecentes,\n    ocorrenciasRecentes,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    "    pratosRecentes,\n    ocorrenciasRecentes,\n    ocorrenciasRestricao: impactoRestricoes.ocorrencias,\n    pessoasRestricaoSomadas: impactoRestricoes.pessoasSomadas,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    'retorno impacto',
  ],
  [
    "  if (m.pratosRecentes > 0) itens.push(`${m.pratosRecentes}/7 principais apareceram nas semanas recentes (${m.ocorrenciasRecentes} ocorrência(s) somadas).`);\n  else itens.push('Nenhum principal deste cenário aparece no recorte recente carregado.');",
    "  if (m.pratosRecentes > 0) itens.push(`${m.pratosRecentes}/7 principais apareceram nas semanas recentes (${m.ocorrenciasRecentes} ocorrência(s) somadas).`);\n  else itens.push('Nenhum principal deste cenário aparece no recorte recente carregado.');\n  if (m.ocorrenciasRestricao > 0) itens.push(`O cadastro de funcionários do House detectou ${m.ocorrenciasRestricao} conflito(s) de restrição (${m.pessoasRestricaoSomadas} impacto(s) pessoa-dia). O cenário exige correção antes da decisão.`);\n  else itens.push('Nenhum conflito foi encontrado nas restrições cadastradas no módulo de funcionários do House.');",
    'porque restricoes',
  ],
  [
    "    aceitacao: contexto.aceitacao,\n    frequencia: contexto.frequencia,\n  });",
    "    aceitacao: contexto.aceitacao,\n    frequencia: contexto.frequencia,\n    restricoesEquipe: contexto.restricoesEquipe,\n  });",
    'montar metricas restricoes',
  ],
  [
    "/**\n * Gera três estratégias com o motor existente. A camada não reimplementa o",
    "function gerarComMenorImpacto(gerador: () => DiaCardapio[] | null, restricoes: Record<string, number>): DiaCardapio[] | null {\n  let melhor: DiaCardapio[] | null = null;\n  let melhorPeso = Number.POSITIVE_INFINITY;\n  for (let i = 0; i < 4; i += 1) {\n    const dias = gerador();\n    if (!Array.isArray(dias) || dias.length !== 7) continue;\n    const impacto = impactoRestricoesLocais(dias, restricoes);\n    const peso = impacto.pessoasSomadas * 100 + impacto.ocorrencias;\n    if (peso < melhorPeso) {\n      melhor = dias;\n      melhorPeso = peso;\n    }\n    if (peso === 0) break;\n  }\n  return melhor;\n}\n\n/**\n * Gera três estratégias com o motor existente. A camada não reimplementa o",
    'helper menor impacto',
  ],
  [
    "  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [\n    ['historico', sugerirSemanaHistorica(pessoas, ctx.precos, opts)],\n    ['equilibrado', sugerirSemana(pessoas, ctx.precos, opts)],\n    ['criativo', sugerirSemanaCriativa(pessoas, ctx.precos, opts)],\n  ];",
    "  const restricoes = ctx.restricoesEquipe ?? {};\n  const gerados: Array<[ModoCenarioGovernanca, DiaCardapio[] | null]> = [\n    ['historico', gerarComMenorImpacto(() => sugerirSemanaHistorica(pessoas, ctx.precos, opts), restricoes)],\n    ['equilibrado', gerarComMenorImpacto(() => sugerirSemana(pessoas, ctx.precos, opts), restricoes)],\n    ['criativo', gerarComMenorImpacto(() => sugerirSemanaCriativa(pessoas, ctx.precos, opts), restricoes)],\n  ];",
    'geracao menor impacto',
  ],
]);

patchFile('src/components/cardapio/PlanejadorGovernanca.tsx', [
  [
    "  useEstoque,\n  useFornecedores,",
    "  useEstoque,\n  useFornecedores,\n  useFuncionarios,",
    'import useFuncionarios',
  ],
  [
    "} from '@/lib/cardapio/governanca-readonly';\n\nfunction novoId",
    "} from '@/lib/cardapio/governanca-readonly';\nimport {\n  instalarHandoffRestricoesGovernanca,\n  itensDaSemanaParaRestricoes,\n  restricoesLocaisAgregadas,\n  solicitarRestricoesGovernanca,\n  type SnapshotRestricoesGovernancaV1,\n} from '@/lib/cardapio/governanca-restricoes';\n\nfunction novoId",
    'import governanca restricoes',
  ],
  [
    "  const [evidenciaReadOnly, setEvidenciaReadOnly] = useState<EvidenciaGovernancaReadOnlyV1 | null>(null);\n  const proposalIdPendente",
    "  const [evidenciaReadOnly, setEvidenciaReadOnly] = useState<EvidenciaGovernancaReadOnlyV1 | null>(null);\n  const [restricoesOficiais, setRestricoesOficiais] = useState<SnapshotRestricoesGovernancaV1 | null>(null);\n  const proposalIdPendente",
    'state restricoes oficiais',
  ],
  [
    "  const { estoque } = useEstoque();\n  const { estimativas } = useEstimativas();",
    "  const { estoque } = useEstoque();\n  const { funcionarios } = useFuncionarios();\n  const { estimativas } = useEstimativas();",
    'hook funcionarios',
  ],
  [
    "  const estoqueQuantidade = useMemo(() => Object.fromEntries(\n    Object.entries(estoque).map(([chave, item]) => [chave, item.qtd]),\n  ), [estoque]);",
    "  const estoqueQuantidade = useMemo(() => Object.fromEntries(\n    Object.entries(estoque).map(([chave, item]) => [chave, item.qtd]),\n  ), [estoque]);\n\n  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);",
    'memo restricoes locais',
  ],
  [
    "  useEffect(() => instalarHandoffEvidenciaReadOnly({\n    unidadeEsperada: contexto.unidadeFonte,\n    semanaEsperada: contexto.semanaId,\n    aoEvidencia: setEvidenciaReadOnly,\n  }), [contexto.semanaId, contexto.unidadeFonte]);",
    "  useEffect(() => instalarHandoffEvidenciaReadOnly({\n    unidadeEsperada: contexto.unidadeFonte,\n    semanaEsperada: contexto.semanaId,\n    aoEvidencia: setEvidenciaReadOnly,\n  }), [contexto.semanaId, contexto.unidadeFonte]);\n\n  useEffect(() => instalarHandoffRestricoesGovernanca({\n    unidadeEsperada: contexto.unidadeFonte,\n    semanaEsperada: contexto.semanaId,\n    aoSnapshot: setRestricoesOficiais,\n  }), [contexto.semanaId, contexto.unidadeFonte]);\n\n  useEffect(() => {\n    const itens = itensDaSemanaParaRestricoes(estado.dias);\n    if (!itens.length) { setRestricoesOficiais(null); return; }\n    const timer = window.setTimeout(() => {\n      solicitarRestricoesGovernanca({ unidade: contexto.unidadeFonte, semanaId: contexto.semanaId, itens });\n    }, 120);\n    return () => window.clearTimeout(timer);\n  }, [contexto.semanaId, contexto.unidadeFonte, estado.dias]);",
    'effects restricoes oficiais',
  ],
  [
    "        {evidenciaReadOnly && (\n          <section data-testid=\"evidencia-readonly-lideres\"",
    "        {restricoesOficiais && (\n          <section data-testid=\"restricoes-oficiais-plus\" className={`rounded-2xl border px-4 py-3 text-sm ${restricoesOficiais.conflitos.length > 0 ? 'border-red-200 bg-red-50/80 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200' : 'border-brand-100 bg-brand-50/70 text-brand-900 dark:border-brand-900 dark:bg-brand-950/20 dark:text-brand-100'}`}>\n            <strong>Restrições oficiais do TATÁ Plus:</strong> {restricoesOficiais.conflitos.length > 0 ? `${restricoesOficiais.conflitos.length} pessoa(s) com conflito na composição atual. Revise antes de aprovar.` : 'nenhum conflito encontrado na composição atual.'}\n          </section>\n        )}\n\n        {evidenciaReadOnly && (\n          <section data-testid=\"evidencia-readonly-lideres\"",
    'banner restricoes oficiais',
  ],
  [
    "              estoque={estoqueQuantidade}\n            />",
    "              estoque={estoqueQuantidade}\n              restricoesEquipe={restricoesEquipe}\n            />",
    'passar restricoes cenarios',
  ],
]);

console.log('HOUSE_RESTRICOES_PATCH=PASS');
