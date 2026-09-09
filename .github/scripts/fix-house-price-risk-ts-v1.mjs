import fs from 'node:fs';
const path = 'src/lib/cardapio/governanca-candidatos.ts';
let s = fs.readFileSync(path, 'utf8');
const from = 'Math.round(Math.max(...altasUsadas.values()) * 100)';
const to = 'Math.round(Math.max(...Array.from(altasUsadas.values())) * 100)';
if (s.includes(from)) s = s.replace(from, to);
else if (!s.includes(to)) throw new Error('anchor do MapIterator não encontrado');
fs.writeFileSync(path, s);
console.log('HOUSE_PRICE_RISK_TS_FIX=PASS');
