from pathlib import Path

p = Path('src/lib/cardapio/inteligencia-viva.ts')
s = p.read_text()

# 1) Contrato de saída: comparação de demanda só sobre dias observados + reconciliações financeiras.
s = s.replace(
"""  refeicoesPrevistas: number;\n  refeicoesReais: number | null;\n  erroDemanda: number | null;\n  erroDemandaPct: number | null;\n  custoPlanejado: ValorComEvidencia;""",
"""  refeicoesPrevistas: number;\n  refeicoesPrevistasComparaveis: number | null;\n  refeicoesReais: number | null;\n  diasComReal: number;\n  coberturaDemandaPct: number;\n  erroDemanda: number | null;\n  erroDemandaPct: number | null;\n  custoPlanejado: ValorComEvidencia;""",
1,
)
s = s.replace(
"""  economiaCotacao: ValorComEvidencia;\n  pressaoPreco: ValorComEvidencia;\n  aceitacaoMedia: number | null;""",
"""  economiaCotacao: ValorComEvidencia;\n  pressaoPreco: ValorComEvidencia;\n  diferencaCompraConsumo: ValorComEvidencia;\n  diferencaNfPlanejado: ValorComEvidencia;\n  aceitacaoMedia: number | null;""",
1,
)

# 2) Demanda: não comparar 2 dias realizados contra 7 dias planejados.
old = """  const reaisDia = refeicoesReaisPorDia(entrada);\n  const previstas = entrada.estado.dias.reduce((s, d) => s + Math.max(0, d.pessoas), 0);\n  const diasComReal = reaisDia.filter((n): n is number => n != null);\n  const reais = diasComReal.length > 0 ? diasComReal.reduce((s, n) => s + n, 0) : null;"""
new = """  const reaisDia = refeicoesReaisPorDia(entrada);\n  const previstas = entrada.estado.dias.reduce((s, d) => s + Math.max(0, d.pessoas), 0);\n  const indicesComReal = reaisDia\n    .map((n, i) => n == null ? -1 : i)\n    .filter((i) => i >= 0);\n  const diasComReal = indicesComReal.length;\n  const reais = diasComReal > 0\n    ? indicesComReal.reduce((s, i) => s + (reaisDia[i] ?? 0), 0)\n    : null;\n  const previstasComparaveis = diasComReal > 0\n    ? indicesComReal.reduce((s, i) => s + Math.max(0, entrada.estado.dias[i]?.pessoas ?? 0), 0)\n    : null;\n  const coberturaDemandaPct = pct(diasComReal, entrada.estado.dias.length);"""
assert old in s, 'bloco de demanda não encontrado'
s = s.replace(old, new, 1)

old = """  const aceit = aceitacaoSemana(entrada);\n  const erroDemanda = reais == null ? null : reais - previstas;\n  const erroDemandaPct = erroDemanda == null || previstas <= 0 ? null : (erroDemanda / previstas) * 100;"""
new = """  const aceit = aceitacaoSemana(entrada);\n  const erroDemanda = reais == null || previstasComparaveis == null ? null : reais - previstasComparaveis;\n  const erroDemandaPct = erroDemanda == null || !(previstasComparaveis > 0)\n    ? null\n    : (erroDemanda / previstasComparaveis) * 100;"""
assert old in s, 'erro de demanda não encontrado'
s = s.replace(old, new, 1)

# 3) Reconciliação: diferença é pista a explicar, nunca chamada automaticamente de perda.
anchor = """  const pressaoPreco: ValorComEvidencia = {\n    valor: pressao.comparados > 0 ? arred(pressao.total) : null,\n    classe: pressao.comparados > 0 ? 'estimado' : 'indisponivel',\n    coberturaPct: pressao.comparados > 0 ? 100 : 0,\n    descricao: 'efeito aproximado de aumentos recentes de preço sobre as quantidades planejadas',\n  };\n\n  const drivers: DriverGerencial[] = ["""
insert = """  const pressaoPreco: ValorComEvidencia = {\n    valor: pressao.comparados > 0 ? arred(pressao.total) : null,\n    classe: pressao.comparados > 0 ? 'estimado' : 'indisponivel',\n    coberturaPct: pressao.comparados > 0 ? 100 : 0,\n    descricao: 'efeito aproximado de aumentos recentes de preço sobre as quantidades planejadas',\n  };\n\n  const diferencaCompraConsumo: ValorComEvidencia = {\n    valor: comprasRegistradas.valor != null && consumoEstimado.valor != null\n      ? arred(comprasRegistradas.valor - consumoEstimado.valor)\n      : null,\n    classe: comprasRegistradas.valor != null && consumoEstimado.valor != null ? 'estimado' : 'indisponivel',\n    coberturaPct: Math.min(comprasRegistradas.coberturaPct, consumoEstimado.coberturaPct),\n    descricao: 'compras registradas − consumo estimado; é valor a explicar, não perda comprovada (pode incluir estoque e diferença de período)',\n  };\n\n  const diferencaNfPlanejado: ValorComEvidencia = {\n    valor: notasFiscais.valor != null && custoPlanejado.valor != null\n      ? arred(notasFiscais.valor - custoPlanejado.valor)\n      : null,\n    classe: notasFiscais.valor != null && custoPlanejado.valor != null ? 'estimado' : 'indisponivel',\n    coberturaPct: Math.min(notasFiscais.coberturaPct, custoPlanejado.coberturaPct),\n    descricao: 'notas fiscais da semana − custo planejado; compras podem abastecer outras semanas, então a diferença não é classificada como desperdício',\n  };\n\n  const drivers: DriverGerencial[] = ["""
assert anchor in s, 'âncora financeira não encontrada'
s = s.replace(anchor, insert, 1)

# 4) Alertas deixam explícita a cobertura parcial de demanda.
old = """  const alertas: string[] = [];\n  if (erroDemandaPct != null && erroDemandaPct <= -10) alertas.push(`A demanda real está ${Math.abs(Math.round(erroDemandaPct))}% abaixo do planejado; revise produção e compra antes de repetir o padrão.`);"""
new = """  const alertas: string[] = [];\n  if (diasComReal > 0 && diasComReal < entrada.estado.dias.length) {\n    alertas.push(`Demanda comparada em ${diasComReal}/7 dia(s); os dias sem contagem real não entram no desvio.`);\n  }\n  if (erroDemandaPct != null && erroDemandaPct <= -10) alertas.push(`Nos dias já medidos, a demanda real está ${Math.abs(Math.round(erroDemandaPct))}% abaixo do planejado; revise produção e compra antes de repetir o padrão.`);"""
assert old in s, 'alerta demanda não encontrado'
s = s.replace(old, new, 1)
s = s.replace(
"if (erroDemandaPct != null && erroDemandaPct >= 10) alertas.push(`A demanda real está ${Math.round(erroDemandaPct)}% acima do planejado; há risco de falta ou compra emergencial.`);",
"if (erroDemandaPct != null && erroDemandaPct >= 10) alertas.push(`Nos dias já medidos, a demanda real está ${Math.round(erroDemandaPct)}% acima do planejado; há risco de falta ou compra emergencial.`);",
1,
)

# 5) Retorno.
s = s.replace(
"""    refeicoesPrevistas: previstas,\n    refeicoesReais: reais,\n    erroDemanda,\n    erroDemandaPct,""",
"""    refeicoesPrevistas: previstas,\n    refeicoesPrevistasComparaveis: previstasComparaveis,\n    refeicoesReais: reais,\n    diasComReal,\n    coberturaDemandaPct,\n    erroDemanda,\n    erroDemandaPct,""",
1,
)
s = s.replace(
"""    economiaCotacao,\n    pressaoPreco,\n    aceitacaoMedia: aceit.media,""",
"""    economiaCotacao,\n    pressaoPreco,\n    diferencaCompraConsumo,\n    diferencaNfPlanejado,\n    aceitacaoMedia: aceit.media,""",
1,
)
p.write_text(s)

# Teste: demanda parcial só é comparada nos mesmos dias.
t = Path('src/lib/cardapio/inteligencia-viva.test.ts')
ts = t.read_text()
old_test = """  it('compara demanda real disponível com a previsão sem inventar dias ausentes', () => {\n    const r = construirInteligenciaViva(entrada());\n    expect(r.refeicoesPrevistas).toBe(70);\n    expect(r.refeicoesReais).toBe(17);\n    expect(r.erroDemanda).toBe(-53);\n    expect(r.erroDemandaPct).toBeCloseTo(-75.714, 2);\n  });"""
new_test = """  it('compara demanda somente nos dias com realizado e explicita cobertura parcial', () => {\n    const r = construirInteligenciaViva(entrada());\n    expect(r.refeicoesPrevistas).toBe(70);\n    expect(r.refeicoesPrevistasComparaveis).toBe(20);\n    expect(r.refeicoesReais).toBe(17);\n    expect(r.diasComReal).toBe(2);\n    expect(r.coberturaDemandaPct).toBe(29);\n    expect(r.erroDemanda).toBe(-3);\n    expect(r.erroDemandaPct).toBeCloseTo(-15, 2);\n  });"""
assert old_test in ts, 'teste de demanda não encontrado'
ts = ts.replace(old_test, new_test, 1)
t.write_text(ts)

# UI: mostrar denominador comparável, cobertura e reconciliações sem chamar diferença de perda.
u = Path('src/components/cardapio/PainelInteligenciaViva.tsx')
us = u.read_text()
us = us.replace(
"""              {inteligencia.refeicoesReais == null ? 'sem realizado' : `${inteligencia.refeicoesReais} / ${inteligencia.refeicoesPrevistas}`}\n            </p>\n            {inteligencia.erroDemandaPct != null && (\n              <p className={`text-[11px] font-semibold ${Math.abs(inteligencia.erroDemandaPct) >= 10 ? 'text-ouro-700 dark:text-ouro-300' : 'text-texto-suave'}`}>\n                {inteligencia.erroDemandaPct > 0 ? '+' : ''}{Math.round(inteligencia.erroDemandaPct)}% vs planejado\n              </p>\n            )}""",
"""              {inteligencia.refeicoesReais == null\n                ? 'sem realizado'\n                : `${inteligencia.refeicoesReais} / ${inteligencia.refeicoesPrevistasComparaveis ?? '—'}`}\n            </p>\n            {inteligencia.refeicoesReais != null && (\n              <p className=\"text-[10px] text-texto-suave\">{inteligencia.diasComReal}/7 dias medidos · {inteligencia.coberturaDemandaPct}% cobertura</p>\n            )}\n            {inteligencia.erroDemandaPct != null && (\n              <p className={`text-[11px] font-semibold ${Math.abs(inteligencia.erroDemandaPct) >= 10 ? 'text-ouro-700 dark:text-ouro-300' : 'text-texto-suave'}`}>\n                {inteligencia.erroDemandaPct > 0 ? '+' : ''}{Math.round(inteligencia.erroDemandaPct)}% nos dias comparáveis\n              </p>\n            )}""",
1,
)
anchor_ui = """        <div className=\"mt-3 grid grid-cols-1 gap-3 md:grid-cols-2\">\n          <Dinheiro titulo=\"Pressão de alta de preços\" dado={inteligencia.pressaoPreco} />\n          <Dinheiro titulo=\"Economia potencial nas ofertas\" dado={inteligencia.economiaCotacao} />\n        </div>\n      </div>"""
new_ui = """        <div className=\"mt-3 grid grid-cols-1 gap-3 md:grid-cols-2\">\n          <Dinheiro titulo=\"Pressão de alta de preços\" dado={inteligencia.pressaoPreco} />\n          <Dinheiro titulo=\"Economia potencial nas ofertas\" dado={inteligencia.economiaCotacao} />\n        </div>\n\n        <div className=\"mt-3 rounded-2xl border border-carvao-100 bg-white/70 p-3 dark:border-carvao-800 dark:bg-carvao-900/50\">\n          <p className=\"text-[10px] font-extrabold uppercase tracking-[0.14em] text-texto-suave\">Reconciliação financeira</p>\n          <p className=\"mt-1 text-xs leading-5 text-texto-suave\">Diferença não significa perda. O House mostra o valor que ainda precisa ser explicado por consumo, estoque ou diferença de período.</p>\n          <div className=\"mt-3 grid grid-cols-1 gap-3 md:grid-cols-2\">\n            <Dinheiro titulo=\"Compra − consumo\" dado={inteligencia.diferencaCompraConsumo} />\n            <Dinheiro titulo=\"NF − planejado\" dado={inteligencia.diferencaNfPlanejado} />\n          </div>\n        </div>\n      </div>"""
assert anchor_ui in us, 'âncora UI não encontrada'
us = us.replace(anchor_ui, new_ui, 1)
u.write_text(us)
