from pathlib import Path
import re

p = Path('src/app/page.tsx')
s = p.read_text()

s = s.replace("import { BottomSheet, Skeleton, Kpi } from '@/components/ui';", "import { BottomSheet, Skeleton } from '@/components/ui';")
s = s.replace("import { resumoSemana } from '@/lib/cardapio/indicadores';\n", "")
s = s.replace("import { PainelDiretor } from '@/components/cardapio/PainelDiretor';\n", "")

s = re.sub(
    r"\n  // KPIs-herói do topo de Relatórios — leitura gerencial de 5 segundos\n  const kpisRelatorios = useMemo\(\(\) => \{.*?\n  \}, \[estado, precos, fatores, estimativas, aceitacao, desperdicio\]\);\n",
    "\n",
    s,
    flags=re.S,
)

s = re.sub(
    r"\n                /\* Painel do Diretor — leitura de 5s, só para gestão \*/\n                \{\(papel === 'gestor' \|\| papel === 'administrador'\) && \(\n                  <>\n                    <PainelDiretor.*?\n                  </>\n                \)\}",
    "",
    s,
    flags=re.S,
)

inicio = """                {/* KPIs — leitura gerencial em 4 blocos compactos */}
"""
fim = """                {/* sub-abas por TEMA — navegação por assunto, não dump vertical */}
"""
if inicio in s and fim in s:
    antes, resto = s.split(inicio, 1)
    _, depois = resto.split(fim, 1)
    intro = """                <div className=\"space-y-1\">
                  <p className=\"text-micro font-bold uppercase tracking-[0.18em] text-brand-600\">Relatórios vivos</p>
                  <h2 className=\"font-display text-2xl font-bold tracking-tight text-carvao-900 dark:text-white\">O que aconteceu, quanto custou e o que merece atenção</h2>
                  <p className=\"max-w-3xl text-sm leading-6 text-texto-suave\">
                    Esta visão recalcula automaticamente quando entram compras, notas fiscais, estoque, contagens, sobras, avaliações e preços. Valores comprovados, registrados e estimados continuam separados.
                  </p>
                </div>
                {/* sub-abas por TEMA — navegação por assunto, não dump vertical */}
"""
    s = antes + intro + depois

s = s.replace("{ id: 'gerencial',    rotulo: 'Visão geral',   curto: 'Visão' },", "{ id: 'gerencial',    rotulo: 'Inteligência viva', curto: 'Viva' },")

# Ordem do Início: contexto/alerta → próximo passo → recomendações. Evita que
# o usuário precise atravessar um painel executivo antes de saber o que fazer.
copiloto = re.search(r"\n                /\* Copiloto —.*?\n                <CopilotoSemana.*?\n                />\n", s, flags=re.S)
agora = re.search(r"\n                <AbaAgora\n                  estado=\{estado\}.*?\n                />\n", s, flags=re.S)
if copiloto and agora and copiloto.start() < agora.start():
    bloco_copiloto = copiloto.group(0)
    bloco_agora = agora.group(0)
    s = s[:copiloto.start()] + bloco_agora + bloco_copiloto + s[agora.end():]

# Contraprovas simples: o patch precisa realmente reduzir duplicação.
assert 'PainelDiretor' not in s
assert 'kpisRelatorios' not in s
assert 'Relatórios vivos' in s
assert 'Inteligência viva' in s

p.write_text(s)
