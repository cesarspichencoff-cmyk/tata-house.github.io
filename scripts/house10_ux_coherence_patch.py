from pathlib import Path
import re

page = Path('src/app/page.tsx')
s = page.read_text()

# 1) Início: uma única camada de orientação. Preserva os motores antigos no
# repositório, mas deixa Briefing + AbaAgora como superfície operacional.
s = s.replace("import { PainelDiretor } from '@/components/cardapio/PainelDiretor';\n", "")
s = s.replace("const CopilotoSemana = dynamic(() => import('@/components/cardapio/CopilotoSemana').then((m) => ({ default: m.CopilotoSemana })), { ssr: false, loading: () => null });\n", "")

s, n1 = re.subn(
    r"\n\s*\{/\* Painel do Diretor — leitura de 5s, só para gestão \*/\}[\s\S]*?\n\s*<BriefingCard",
    "\n                <BriefingCard",
    s,
    count=1,
)
if n1 != 1:
    raise SystemExit('Não foi possível localizar PainelDiretor no Início')

s, n2 = re.subn(
    r"\n\s*\{/\* Copiloto — o que fazer nesta semana, com número\.[\s\S]*?<CopilotoSemana[\s\S]*?/>\n\s*\n\s*<AbaAgora",
    "\n\n                <AbaAgora",
    s,
    count=1,
)
if n2 != 1:
    raise SystemExit('Não foi possível localizar CopilotoSemana no Início')

# 2) Relatórios: deixa explícito que a primeira visão é a inteligência viva.
s = s.replace(
    "{ id: 'gerencial',    rotulo: 'Visão geral',   curto: 'Visão' },",
    "{ id: 'gerencial',    rotulo: 'Inteligência viva', curto: 'Viva' },",
    1,
)

# Pequena explicação permanente: relatório não é arquivo estático.
needle = """                </div>\n\n                {abaRelatorios === 'gerencial' && (\n"""
replacement = """                </div>\n\n                <p className=\"text-xs leading-5 text-texto-suave\">\n                  Atualiza com a operação: compras, notas fiscais, refeições, estoque, desperdício, preços, ofertas e aceitação entram na leitura sem precisar gerar um relatório novo.\n                </p>\n\n                {abaRelatorios === 'gerencial' && (\n"""
if needle not in s:
    raise SystemExit('Não foi possível localizar navegação de Relatórios')
s = s.replace(needle, replacement, 1)
page.write_text(s)

# 3) Início: cria um caminho direto para a leitura gerencial sem duplicar painéis.
agora = Path('src/components/cardapio/AbaAgora.tsx')
a = agora.read_text()
needle = """      {/* Números de apoio — etapas intermediárias */}\n"""
cta = """      {(papel === 'gestor' || papel === 'administrador') && (\n        <button\n          type=\"button\"\n          onClick={() => irPara('relatorios')}\n          className=\"flex w-full items-center justify-between rounded-2xl border border-carvao-100 bg-carvao-50 px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50 dark:border-carvao-800 dark:bg-carvao-900 dark:hover:border-brand-900 dark:hover:bg-brand-950/20\"\n        >\n          <span>\n            <span className=\"block text-sm font-bold text-carvao-900 dark:text-white\">Inteligência da semana</span>\n            <span className=\"mt-0.5 block text-xs text-texto-suave\">Cruza compra, NF, refeições, estoque, desperdício, preços e aceitação.</span>\n          </span>\n          <Icone nome=\"proximo\" tam={15} className=\"shrink-0 text-brand-600\" />\n        </button>\n      )}\n\n      {/* Números de apoio — etapas intermediárias */}\n"""
if needle not in a:
    raise SystemExit('Não foi possível localizar apoio do AbaAgora')
a = a.replace(needle, cta, 1)
agora.write_text(a)

# 4) Prova de coerência: protege o princípio de uma camada de orientação no Início.
test = Path('src/lib/cardapio/ux-coerencia.test.ts')
test.write_text("""import { describe, expect, it } from 'vitest';\nimport { readFileSync } from 'node:fs';\n\ndescribe('coerência da experiência 10/10', () => {\n  const page = readFileSync('src/app/page.tsx', 'utf8');\n  const agora = readFileSync('src/components/cardapio/AbaAgora.tsx', 'utf8');\n\n  it('mantém uma única camada principal de orientação no Início', () => {\n    expect(page).toContain('<BriefingCard');\n    expect(page).toContain('<AbaAgora');\n    expect(page).not.toContain('<PainelDiretor');\n    expect(page).not.toContain('<CopilotoSemana');\n  });\n\n  it('expõe a inteligência viva como destino gerencial', () => {\n    expect(page).toContain("rotulo: 'Inteligência viva'");\n    expect(page).toContain('Atualiza com a operação');\n    expect(agora).toContain("irPara('relatorios')");\n    expect(agora).toContain('Inteligência da semana');\n  });\n});\n""")
