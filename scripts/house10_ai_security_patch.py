from pathlib import Path
import re

# 1) Cliente IA: suporta imagem sem expor segredo do provedor.
p = Path('src/lib/cardapio/ia-cliente.ts')
s = p.read_text()
if 'export interface ImagemIAEdge' not in s:
    s = s.replace(
        "export interface RespostaIA {\n  texto: string;\n  itens?: string[];\n  offline?: boolean;\n}\n",
        "export interface RespostaIA {\n  texto: string;\n  itens?: string[];\n  offline?: boolean;\n}\n\nexport interface ImagemIAEdge {\n  base64: string;\n  mimeType: string;\n}\n",
        1,
    )
old = """export async function chamarEdge(\n  provider: 'gemini' | 'groq',\n  system: string,\n  prompt: string,\n  comoJson: boolean,\n): Promise<string> {"""
new = """export async function chamarEdge(\n  provider: 'gemini' | 'groq',\n  system: string,\n  prompt: string,\n  comoJson: boolean,\n  imagem?: ImagemIAEdge,\n): Promise<string> {"""
if old in s:
    s = s.replace(old, new, 1)
s = s.replace(
    "body: JSON.stringify({ provider, system, prompt, json: comoJson }),",
    "body: JSON.stringify({ provider, system, prompt, json: comoJson, ...(imagem ? { image: imagem } : {}) }),",
    1,
)
p.write_text(s)

# 2) NF: somente Edge Function; nenhuma chave/endpoint de provedor no browser.
p = Path('src/lib/cardapio/nf-leitura.ts')
s = p.read_text()
s = s.replace(
    "/* =====================================================================\n   Leitura de nota fiscal por foto — Groq Vision (llama-3.2-90b).\n   A chave é passada pelo chamador (nunca hardcoded nem em env vars).\n   ===================================================================== */",
    "/* =====================================================================\n   Leitura de nota fiscal por foto — IA multimodal via Edge Function segura.\n   O navegador envia somente a imagem comprimida e nunca recebe segredo de\n   Gemini/Groq/OpenAI/Anthropic.\n   ===================================================================== */\n\nimport { chamarEdge, iaEdgeAtivo } from './ia-cliente';",
    1,
)
s = re.sub(r"\nconst GROQ_VISION_MODELO = .*?;\n", "\n", s, count=1)
start = s.index('export async function lerNotaFiscalViaIA(')
end = s.index('/** Comprime uma imagem', start)
novo = '''export async function lerNotaFiscalViaIA(\n  base64: string,\n  mimeType: string,\n): Promise<ResultadoLeituraNF> {\n  if (!iaEdgeAtivo()) {\n    return { itens: [], erro: 'IA segura do servidor não configurada.' };\n  }\n  if (!base64 || !/^image\\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {\n    return { itens: [], erro: 'Imagem inválida para leitura da nota fiscal.' };\n  }\n\n  try {\n    const texto = await chamarEdge('gemini', '', PROMPT_NF, true, { base64, mimeType });\n    let dados: ResultadoLeituraNF;\n    try {\n      dados = JSON.parse(texto) as ResultadoLeituraNF;\n    } catch {\n      const match = texto.match(/\\{[\\s\\S]*\\}/);\n      dados = match ? (JSON.parse(match[0]) as ResultadoLeituraNF) : { itens: [] };\n    }\n\n    const itens = Array.isArray(dados.itens)\n      ? dados.itens\n          .filter((it) => !!it && typeof it.produto === 'string' && Number(it.qtd) >= 0 && Number(it.precoUnit) >= 0 && Number(it.precoTotal) >= 0)\n          .map((it) => ({\n            produto: it.produto.trim(),\n            qtd: Number(it.qtd) || 0,\n            unid: String(it.unid || 'UN').toUpperCase(),\n            precoUnit: Number(it.precoUnit) || 0,\n            precoTotal: Number(it.precoTotal) || 0,\n          }))\n      : [];\n\n    return { ...dados, itens };\n  } catch (e) {\n    return { itens: [], erro: e instanceof Error ? e.message : String(e) };\n  }\n}\n\n'''
s = s[:start] + novo + s[end:]
p.write_text(s)

# 3) NF UI: remove chave local/NEXT_PUBLIC e depende da Edge segura.
p = Path('src/components/cardapio/AbaNF.tsx')
s = p.read_text()
s = s.replace("import { useEffect, useRef, useState } from 'react';", "import { useRef, useState } from 'react';", 1)
if "iaEdgeAtivo" not in s:
    s = s.replace(
        "import type { ItemNotaExtraido, ResultadoLeituraNF } from '@/lib/cardapio/nf-leitura';",
        "import type { ItemNotaExtraido, ResultadoLeituraNF } from '@/lib/cardapio/nf-leitura';\nimport { iaEdgeAtivo } from '@/lib/cardapio/ia-cliente';",
        1,
    )
s = re.sub(r"\nconst CHAVE_GROQ = 'cardapio\.v1\.groq\.key';\n", "\n", s, count=1)
s = s.replace("  const [groqKey, setGroqKey] = useState('');\n", "", 1)
s = re.sub(r"\n  useEffect\(\(\) => \{\n    try \{ setGroqKey\(localStorage\.getItem\(CHAVE_GROQ\) \?\? ''\); \} catch \{ /\* ok \*/ \}\n  \}, \[\]\);\n", "\n", s, count=1)
s = s.replace(
    "      const chaveEfetiva = (process.env.NEXT_PUBLIC_GROQ_KEY ?? '').trim() || groqKey.trim();\n      const res = await lerNotaFiscalViaIA(fileData.base64, fileData.mimeType, chaveEfetiva);",
    "      const res = await lerNotaFiscalViaIA(fileData.base64, fileData.mimeType);",
    1,
)
s = s.replace(
    "  const temChave = !!(process.env.NEXT_PUBLIC_GROQ_KEY || groqKey.trim());",
    "  const iaSeguraAtiva = iaEdgeAtivo();",
    1,
)
s = s.replace("{!temChave && (", "{!iaSeguraAtiva && (", 1)
s = s.replace(
    "Configure a chave Groq na aba <strong>Cotação</strong> para habilitar leitura de NF por IA.",
    "A leitura de NF por IA exige a camada segura do servidor. Nenhuma chave privada é armazenada neste aparelho.",
    1,
)
s = s.replace("disabled={carregando || !fileData || !temChave}", "disabled={carregando || !fileData || !iaSeguraAtiva}", 1)
p.write_text(s)

# 4) Cotação: remove fallback direto de Groq e parâmetro de API key.
p = Path('src/lib/cardapio/cotacao.ts')
s = p.read_text()
s = re.sub(r"\nconst GROQ_MODELO = 'llama-3\.3-70b-versatile';\n", "\n", s, count=1)
s = re.sub(r"\nasync function chamarGroqDireto\([\s\S]*?\n}\n\n/\*\*\n \* Combina resultados", "\n/**\n * Combina resultados", s, count=1)
s = s.replace(
    "export async function parsearCotacaoComIA(\n  texto: string,\n  apiKey: string,\n  fornecedoresCustom: string[] = [],\n): Promise<{ linhas: LinhaCotacao[]; comIA: boolean; erroIA?: string }> {",
    "export async function parsearCotacaoComIA(\n  texto: string,\n  fornecedoresCustom: string[] = [],\n): Promise<{ linhas: LinhaCotacao[]; comIA: boolean; erroIA?: string }> {",
    1,
)
old = """  try {\n    // Edge Function (chave no servidor) quando ativada; senão, Groq direto.\n    const txt = iaEdgeAtivo()\n      ? await chamarEdge('groq', '', prompt, true)\n      : await chamarGroqDireto(prompt, apiKey);\n    return { linhas: combinarResultados(logica, parseItensIA(txt)), comIA: true };"""
new = """  if (!iaEdgeAtivo()) {\n    return { linhas: logica, comIA: false, erroIA: 'IA segura do servidor não configurada; leitura lógica preservada.' };\n  }\n  try {\n    const txt = await chamarEdge('groq', '', prompt, true);\n    return { linhas: combinarResultados(logica, parseItensIA(txt)), comIA: true };"""
assert old in s, 'bloco IA cotacao não encontrado'
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('src/components/cardapio/AbaCotacao.tsx')
s = p.read_text()
s = s.replace("parsearCotacaoComIA(texto, '', fornecedoresList)", "parsearCotacaoComIA(texto, fornecedoresList)", 1)
p.write_text(s)

# 5) Edge Function: aceita imagem Gemini com limites explícitos.
p = Path('supabase/functions/llm/index.ts')
s = p.read_text()
s = s.replace(
    "  json?: boolean;\n}",
    "  json?: boolean;\n  image?: { base64?: string; mimeType?: string };\n}",
    1,
)
s = s.replace(
    "  const { provider = 'gemini', system, prompt, json: comoJson } = corpo;\n  if (!prompt) return json({ error: 'prompt ausente' }, 400);",
    "  const { provider = 'gemini', system, prompt, json: comoJson, image } = corpo;\n  if (!prompt) return json({ error: 'prompt ausente' }, 400);\n  if (image) {\n    if (provider !== 'gemini') return json({ error: 'imagem suportada apenas pelo provider multimodal aprovado' }, 400);\n    if (!image.base64 || !image.mimeType) return json({ error: 'imagem incompleta' }, 400);\n    if (!/^image\\/(jpeg|jpg|png|webp)$/i.test(image.mimeType)) return json({ error: 'tipo de imagem não suportado' }, 415);\n    if (image.base64.length > 8_000_000) return json({ error: 'imagem excede o limite seguro' }, 413);\n  }",
    1,
)
old = "contents: [{ parts: [{ text: prompt }] }],"
new = "contents: [{ parts: [...(image ? [{ inlineData: { mimeType: image.mimeType!, data: image.base64! } }] : []), { text: prompt }] }],"
assert old in s, 'contents gemini não encontrado'
s = s.replace(old, new, 1)
p.write_text(s)

# 6) Prova anti-regressão: nenhum segredo/end-point privado volta ao client.
t = Path('src/lib/cardapio/seguranca-ia.test.ts')
t.write_text("""import { describe, expect, it } from 'vitest';\nimport { readFileSync } from 'node:fs';\nimport { resolve } from 'node:path';\n\nconst ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');\n\ndescribe('segurança de IA no cliente', () => {\n  it('não permite chaves privadas ou chamadas diretas de provedor no src', () => {\n    const arquivos = [\n      'src/components/cardapio/AbaNF.tsx',\n      'src/components/cardapio/AbaCotacao.tsx',\n      'src/lib/cardapio/nf-leitura.ts',\n      'src/lib/cardapio/cotacao.ts',\n      'src/lib/cardapio/ia-cliente.ts',\n    ];\n    const fonte = arquivos.map(ler).join('\\n');\n    for (const proibido of [\n      'NEXT_PUBLIC_GROQ_KEY',\n      'NEXT_PUBLIC_GEMINI_API_KEY',\n      'cardapio.v1.groq.key',\n      'https://api.groq.com/openai/',\n      'generativelanguage.googleapis.com/v1beta/models',\n      'chamarGroqDireto',\n    ]) {\n      expect(fonte).not.toContain(proibido);\n    }\n  });\n\n  it('mantém imagem e segredo exclusivamente na Edge Function', () => {\n    const edge = ler('supabase/functions/llm/index.ts');\n    expect(edge).toContain("env('GEMINI_API_KEY')");\n    expect(edge).toContain('inlineData');\n    expect(edge).toContain('8_000_000');\n  });\n});\n""")
