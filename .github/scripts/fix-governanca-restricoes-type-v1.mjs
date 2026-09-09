import fs from 'node:fs';

const path = 'src/lib/cardapio/governanca-restricoes.ts';
let s = fs.readFileSync(path, 'utf8');
const from = "  const itens = Array.from(new Map(opcoes.itens.map((i) => [normalizar(i), texto(i, 120)]).filter(([k, v]) => !!k && !!v)).values()).slice(0, MAX_ITENS);";
const to = `  const vistos = new Set<string>();\n  const itens: string[] = [];\n  for (const bruto of opcoes.itens) {\n    const item = texto(bruto, 120);\n    const chave = normalizar(item);\n    if (!item || !chave || vistos.has(chave)) continue;\n    vistos.add(chave);\n    itens.push(item);\n    if (itens.length >= MAX_ITENS) break;\n  }`;
if (s.includes(from)) s = s.replace(from, to);
else if (!s.includes(to)) throw new Error('anchor de deduplicação não encontrado');
fs.writeFileSync(path, s);
console.log('RESTRICOES_TYPE_FIX=PASS');
