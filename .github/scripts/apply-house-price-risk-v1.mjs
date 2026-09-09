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
    "  normalizar,\n  notaNutricaoPrato,",
    "  listaDoDia,\n  normalizar,\n  notaNutricaoPrato,",
    'import listaDoDia',
  ],
  [
    "} from './governanca-readonly';\nimport { impactoRestricoesLocais } from './governanca-restricoes';",
    "} from './governanca-readonly';\nimport { impactoRestricoesLocais } from './governanca-restricoes';\nimport { analisarRadar } from './radar';",
    'import radar',
  ],
  [
    "import type { DiaCardapio, EstadoSemana, EventoDemanda, RegistroDesperdicio } from './tipos';",
    "import type { DiaCardapio, EstadoSemana, EventoDemanda, HistoricoPrecos, RegistroDesperdicio } from './tipos';",
    'tipo historico preco',
  ],
  [
    "  amostraDesperdicio: number;\n  nutricaoMedia: number;",
    "  amostraDesperdicio: number;\n  itensPrecoAlta: number;\n  maiorAltaPrecoPct: number | null;\n  nutricaoMedia: number;",
    'metricas risco preco',
  ],
  [
    "  desperdicioHistorico?: RegistroDesperdicio[];\n  /** Pessoas geradas automaticamente",
    "  desperdicioHistorico?: RegistroDesperdicio[];\n  historicoPrecos?: HistoricoPrecos;\n  /** Pessoas geradas automaticamente",
    'contexto historico preco',
  ],
  [
    "  desperdicioHistorico?: RegistroDesperdicio[];\n}): MetricasCenarioGovernanca {",
    "  desperdicioHistorico?: RegistroDesperdicio[];\n  historicoPrecos?: HistoricoPrecos;\n}): MetricasCenarioGovernanca {",
    'args historico preco',
  ],
  [
    "  const desperdicioMedioPct = amostraDesperdicio > 0\n    ? Math.round((somaTaxasDesperdicio / amostraDesperdicio) * 100)\n    : null;\n\n  return {",
    "  const desperdicioMedioPct = amostraDesperdicio > 0\n    ? Math.round((somaTaxasDesperdicio / amostraDesperdicio) * 100)\n    : null;\n\n  // O custo já usa o preço atual. O radar entra somente como risco visível,\n  // sem uma segunda penalização no score do cenário. Reutiliza o limiar oficial\n  // do módulo radar (alta anormal >=15% desde a última cotação).\n  const altas = new Map(\n    analisarRadar(args.precos, args.historicoPrecos ?? {})\n      .filter((r) => r.alerta === 'alta' && r.variacao !== null)\n      .map((r) => [r.norm, r]),\n  );\n  const altasUsadas = new Map<string, number>();\n  args.dias.forEach((dia) => {\n    listaDoDia(dia, args.fatores, { mostrarBasicos: args.mostrarBasicos }).forEach((item) => {\n      const chave = normalizar(item.item);\n      const alta = altas.get(chave);\n      if (alta?.variacao !== null && alta?.variacao !== undefined) altasUsadas.set(chave, alta.variacao);\n    });\n  });\n  const maiorAltaPrecoPct = altasUsadas.size\n    ? Math.round(Math.max(...altasUsadas.values()) * 100)\n    : null;\n\n  return {",
    'calcular risco preco',
  ],
  [
    "    amostraDesperdicio,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    "    amostraDesperdicio,\n    itensPrecoAlta: altasUsadas.size,\n    maiorAltaPrecoPct,\n    nutricaoMedia: Math.round(nutricaoMedia),",
    'retorno risco preco',
  ],
  [
    "  else itens.push('Ainda não há amostra de desperdício House para os principais deste cenário; o sistema não inventa penalidade.');\n  if (m.itensSemPreco > 0)",
    "  else itens.push('Ainda não há amostra de desperdício House para os principais deste cenário; o sistema não inventa penalidade.');\n  if (m.itensPrecoAlta > 0) itens.push(`${m.itensPrecoAlta} insumo(s) desta proposta estão em alta anormal no radar de preços${m.maiorAltaPrecoPct !== null ? `; maior alta ${m.maiorAltaPrecoPct}%` : ''}. O custo atual já incorpora o preço vigente; a tendência é mostrada como risco e não é penalizada duas vezes.`);\n  else itens.push('Nenhum insumo desta proposta com histórico suficiente está em alta anormal no radar atual.');\n  if (m.itensSemPreco > 0)",
    'porque risco preco',
  ],
  [
    "    desperdicioHistorico: contexto.desperdicioHistorico,\n  });",
    "    desperdicioHistorico: contexto.desperdicioHistorico,\n    historicoPrecos: contexto.historicoPrecos,\n  });",
    'passar historico analise',
  ],
]);

patchFile('src/components/cardapio/CenariosGovernanca.tsx', [
  [
    "import type { Aceitacao, EstadoSemana, EventoDemanda, RegistroDesperdicio } from '@/lib/cardapio/tipos';",
    "import type { Aceitacao, EstadoSemana, EventoDemanda, HistoricoPrecos, RegistroDesperdicio } from '@/lib/cardapio/tipos';",
    'tipo historico UI',
  ],
  [
    "        <Metric\n          label=\"Demanda\"",
    "        <Metric\n          label=\"Preço em alta\"\n          value={m.itensPrecoAlta > 0 ? `${m.itensPrecoAlta} insumo${m.itensPrecoAlta === 1 ? '' : 's'}` : 'Sem alerta'}\n          hint={m.itensPrecoAlta > 0 && m.maiorAltaPrecoPct !== null ? `maior alta ${m.maiorAltaPrecoPct}% · sinal sem dupla penalização` : 'radar House · limiar de alta anormal'}\n        />\n        <Metric\n          label=\"Demanda\"",
    'metric risco preco UI',
  ],
  [
    "  desperdicioHistorico,\n  baselineAutomatico,",
    "  desperdicioHistorico,\n  historicoPrecos,\n  baselineAutomatico,",
    'prop historico UI',
  ],
  [
    "  desperdicioHistorico: RegistroDesperdicio[];\n  baselineAutomatico: number[];",
    "  desperdicioHistorico: RegistroDesperdicio[];\n  historicoPrecos: HistoricoPrecos;\n  baselineAutomatico: number[];",
    'tipo prop historico UI',
  ],
  [
    "      desperdicioHistorico,\n      baselineAutomatico,",
    "      desperdicioHistorico,\n      historicoPrecos,\n      baselineAutomatico,",
    'passar historico gerador',
  ],
  [
    "            Compare propostas com custo, restrições, desperdício, demanda, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    "            Compare propostas com custo, tendência de preço, restrições, desperdício, demanda, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    'copy risco preco',
  ],
]);

patchFile('src/components/cardapio/PlanejadorGovernanca.tsx', [
  [
    "              desperdicioHistorico={desperdicioHistorico}\n              baselineAutomatico={baselineAutomatico}",
    "              desperdicioHistorico={desperdicioHistorico}\n              historicoPrecos={historico}\n              baselineAutomatico={baselineAutomatico}",
    'passar historico UI',
  ],
]);

patchFile('src/lib/cardapio/governanca-candidatos.test.ts', [
  [
    "import type { Aceitacao, DiaCardapio, EstadoSemana, EventoDemanda, RegistroDesperdicio } from './tipos';",
    "import type { Aceitacao, DiaCardapio, EstadoSemana, EventoDemanda, HistoricoPrecos, RegistroDesperdicio } from './tipos';",
    'tipo historico teste',
  ],
  [
    "const desperdicioHistorico: RegistroDesperdicio[] = [",
    "const historicoPrecosAlta: HistoricoPrecos = {\n  [normalizar('Frango')]: [\n    { valor: 10, em: '2026-08-01T00:00:00Z' },\n    { valor: 12, em: '2026-08-08T00:00:00Z' },\n  ],\n};\n\nconst desperdicioHistorico: RegistroDesperdicio[] = [",
    'fixture historico preco',
  ],
  [
    "  it('analisa evidência sem inventar aceitação, conta repetição e mede impacto de restrições', () => {",
    "  it('mostra alta anormal de preço como risco sem alterar o custo por uma segunda penalização', () => {\n    const dias = diasFixture();\n    const precos = { [normalizar('Frango')]: 15 };\n    const comRadar = analisarCenarioGovernanca({\n      estadoBase: estadoFixture(),\n      dias,\n      precos,\n      aceitacao: aceitacaoFixture(),\n      frequencia: {},\n      historicoPrecos: historicoPrecosAlta,\n    });\n    const semRadar = analisarCenarioGovernanca({\n      estadoBase: estadoFixture(),\n      dias,\n      precos,\n      aceitacao: aceitacaoFixture(),\n      frequencia: {},\n      historicoPrecos: {},\n    });\n    expect(comRadar.itensPrecoAlta).toBeGreaterThanOrEqual(1);\n    expect(comRadar.maiorAltaPrecoPct).toBe(25);\n    expect(comRadar.custoTotal).toBe(semRadar.custoTotal);\n    expect(comRadar.custoPorRefeicao).toBe(semRadar.custoPorRefeicao);\n  });\n\n  it('analisa evidência sem inventar aceitação, conta repetição e mede impacto de restrições', () => {",
    'teste risco preco',
  ],
  [
    "      desperdicioHistorico,\n    });",
    "      desperdicioHistorico,\n      historicoPrecos: historicoPrecosAlta,\n    });",
    'analise fixture historico',
  ],
  [
    "    expect(metricas.amostraDesperdicio).toBe(3);\n    expect(metricas.proteinasDistintas)",
    "    expect(metricas.amostraDesperdicio).toBe(3);\n    expect(metricas.itensPrecoAlta).toBeGreaterThanOrEqual(0);\n    expect(metricas.proteinasDistintas)",
    'assert metrica risco',
  ],
  [
    "      desperdicioHistorico,\n      baselineAutomatico:",
    "      desperdicioHistorico,\n      historicoPrecos: historicoPrecosAlta,\n      baselineAutomatico:",
    'geracao historico preco',
  ],
  [
    "      expect(cenario.porques.some((p) => /evento de demanda/i.test(p))).toBe(true);\n      expect(cenario.demanda.eventosAplicados)",
    "      expect(cenario.porques.some((p) => /evento de demanda/i.test(p))).toBe(true);\n      expect(cenario.porques.some((p) => /radar|alta anormal/i.test(p))).toBe(true);\n      expect(cenario.demanda.eventosAplicados)",
    'assert porquê preço',
  ],
]);

console.log('HOUSE_PRICE_RISK_PATCH=PASS');
