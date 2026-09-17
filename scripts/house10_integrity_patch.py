from pathlib import Path

p = Path('src/app/page.tsx')
s = p.read_text(encoding='utf-8')

imp = "import { formatarReais } from '@/lib/cardapio/motor';\n"
novo_imp = imp + "import { taxaMediaDesperdicio } from '@/lib/cardapio/desperdicio-metricas';\n"
if "taxaMediaDesperdicio" not in s:
    if imp not in s:
        raise SystemExit('import anchor not found')
    s = s.replace(imp, novo_imp, 1)

antigo = """    let prod = 0, sobra = 0;\n    desperdicio.forEach((d) => { if (d.produzido > 0) { prod += d.produzido; sobra += Math.max(0, d.produzido - d.consumido); } });\n    const desperdicioPct = prod > 0 ? (sobra / prod) * 100 : null;\n"""
novo = """    // Taxa média por lançamento: percentual é adimensional, então pode\n    // atravessar kg/porções sem jamais somar quantidades físicas incompatíveis.\n    const taxaDesperdicio = taxaMediaDesperdicio(desperdicio);\n    const desperdicioPct = taxaDesperdicio == null ? null : taxaDesperdicio * 100;\n"""
if antigo in s:
    s = s.replace(antigo, novo, 1)
elif novo not in s:
    raise SystemExit('KPI waste block anchor not found')

p.write_text(s, encoding='utf-8')
