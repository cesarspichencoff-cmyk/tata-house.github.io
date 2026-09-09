import fs from 'node:fs';

const path = 'src/components/cardapio/PosterSemana.tsx';
let s = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error('anchor ausente: ' + label);
  s = s.replace(from, to);
}

// Canvas / PNG: cabeçalho editorial, sem pílula de UI.
rep(
`      ctx.textAlign = 'left';
      ctx.fillStyle = '#92713a';
      ctx.font = \`700 20px \${SANS}, sans-serif\`;
      ctx.fillText('TATÁ HOUSE', M, 74);
      ctx.fillStyle = '#055d2f';
      ctx.font = \`700 52px \${DISPLAY}, serif\`;
      ctx.fillText('Cardápio da semana', M, 130);
      // pílula do período
      ctx.font = \`700 20px \${SANS}, sans-serif\`;
      const pw = ctx.measureText(periodo.toUpperCase()).width + 36;
      ctx.fillStyle = '#007638';
      rrect(M, 152, pw, 38, 19); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(periodo.toUpperCase(), M + 18, 178);`,
`      ctx.textAlign = 'left';
      ctx.fillStyle = '#92713a';
      ctx.font = \`700 17px \${SANS}, sans-serif\`;
      ctx.fillText('TATÁ HOUSE · REFEITÓRIO DO TATÁ SUSHI', M, 72);
      ctx.fillStyle = '#055d2f';
      ctx.font = \`700 54px \${DISPLAY}, serif\`;
      ctx.fillText('Cardápio da semana', M, 132);
      ctx.fillStyle = '#92713a';
      ctx.font = \`700 18px \${SANS}, sans-serif\`;
      ctx.fillText(('SEMANA · ' + periodo).toUpperCase(), M, 174);`,
'canvas header'
);

// QR ganha moldura própria no impresso.
rep(
`        const qrSize = logo ? 110 : 170;
        ctx.drawImage(qr, qrAreaX + (170 - qrSize) / 2, nextY, qrSize, qrSize);`,
`        const qrSize = logo ? 110 : 150;
        const qrX = qrAreaX + (170 - qrSize) / 2;
        const qrPad = 10;
        ctx.fillStyle = '#ffffff';
        rrect(qrX - qrPad, nextY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, 16); ctx.fill();
        ctx.strokeStyle = '#e8e1d3'; ctx.lineWidth = 1.5;
        rrect(qrX - qrPad, nextY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, 16); ctx.stroke();
        ctx.drawImage(qr, qrX, nextY, qrSize, qrSize);`,
'canvas qr frame'
);

// Canvas: dias viram cartões editoriais claros; cor da proteína vira acento lateral.
rep(
`      estado.dias.forEach((dia, i) => {
        const fim = i >= 5;
        ctx.fillStyle = fim ? '#055d2f' : '#007638';
        rrect(x0, y, cw, cardH, 18); ctx.fill();

        // Acento dourado à esquerda nos fins de semana
        if (fim) {
          ctx.fillStyle = '#c8a96b';
          ctx.fillRect(x0, y + 18, 6, cardH - 36);
        }

        // dia + data
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';`,
`      estado.dias.forEach((dia, i) => {
        const fim = i >= 5;
        const prot = dia.principal ? proteinaDoPrato(dia.principal) : 'outros';
        ctx.fillStyle = fim ? '#f3efe7' : '#ffffff';
        rrect(x0, y, cw, cardH, 18); ctx.fill();
        ctx.strokeStyle = fim ? '#dcc492' : '#e8e1d3';
        ctx.lineWidth = 1.5;
        rrect(x0, y, cw, cardH, 18); ctx.stroke();
        ctx.fillStyle = COR_PROTEINA[prot];
        ctx.fillRect(x0, y + 18, 6, cardH - 36);

        // dia + data
        ctx.textAlign = 'center';
        ctx.fillStyle = '#055d2f';`,
'canvas day surface'
);
rep("        ctx.fillStyle = '#c9f5da';\n        ctx.font = `600 15px ${SANS}, sans-serif`;", "        ctx.fillStyle = '#92713a';\n        ctx.font = `700 14px ${SANS}, sans-serif`;", 'canvas date');
rep("        ctx.strokeStyle = 'rgba(255,255,255,0.2)';", "        ctx.strokeStyle = '#e8e1d3';", 'canvas divider');
rep("          ctx.fillStyle = '#ffffff';\n          ctx.font = `800 25px ${SANS}, sans-serif`;", "          ctx.fillStyle = '#15171b';\n          ctx.font = `700 26px ${DISPLAY}, serif`;", 'canvas principal');
rep("            ctx.fillStyle = '#c9f5da';\n            ctx.font = `600 17px ${SANS}, sans-serif`;", "            ctx.fillStyle = '#41454e';\n            ctx.font = `600 16px ${SANS}, sans-serif`;", 'canvas guarn');
rep("            ctx.fillStyle = 'rgba(255,255,255,0.85)';\n            ctx.font = `500 15px ${SANS}, sans-serif`;", "            ctx.fillStyle = '#565c66';\n            ctx.font = `500 14px ${SANS}, sans-serif`;", 'canvas extras');
rep("            ctx.fillStyle = 'rgba(255,255,255,0.6)';", "            ctx.fillStyle = '#7c828c';", 'canvas kcal label');
rep("            ctx.fillStyle = 'rgba(255,255,255,0.85)';\n            ctx.font = `600 14px ${SANS}, sans-serif`;", "            ctx.fillStyle = '#41454e';\n            ctx.font = `600 13px ${SANS}, sans-serif`;", 'canvas protein metric');
rep("          ctx.fillStyle = 'rgba(255,255,255,0.55)';", "          ctx.fillStyle = '#a3906c';", 'canvas empty');

// DOM: período deixa de ser pílula e vira linha editorial.
rep(
`              <div className="mt-3 inline-flex items-center rounded-full bg-brand-700 px-5 py-1.5 text-[14px] font-bold uppercase tracking-[0.18em] text-white">
                {periodo}
              </div>`,
`              <div className="mt-4 flex items-center gap-3">
                <span className="h-px w-10 bg-ouro-500" aria-hidden />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ouro-600">Semana · {periodo}</span>
              </div>`,
'dom period'
);

// DOM: QR com moldura de papel.
rep(
`              <QrCode url={urlAvaliar} size={92} className="rounded-lg ring-1 ring-brand-200" />`,
`              <div className="rounded-2xl border border-areia-200 bg-white p-2 shadow-[0_2px_12px_rgba(14,16,19,.06)]">
                <QrCode url={urlAvaliar} size={88} />
              </div>`,
'dom qr frame'
);

// DOM: linhas do cardápio deixam de parecer cards de aplicativo.
rep(
`                className={\`relative grid grid-cols-[96px_1fr_auto] items-stretch gap-5 overflow-hidden rounded-2xl px-5 py-3 text-white \${
                  fimDeSemana
                    ? 'bg-brand-800 ring-1 ring-ouro-400/70'
                    : 'bg-brand-700'
                }\`}
              >
                {fimDeSemana && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-ouro-400" aria-hidden />
                )}`,
`                className={\`relative grid grid-cols-[96px_1fr_auto] items-stretch gap-5 overflow-hidden rounded-2xl border px-5 py-3 text-carvao-900 shadow-[0_1px_0_rgba(14,16,19,.03)] \${
                  fimDeSemana
                    ? 'border-ouro-300/70 bg-areia-100'
                    : 'border-areia-200 bg-white'
                }\`}
                style={{ borderLeftWidth: 4, borderLeftColor: COR_PROTEINA[prot] }}
              >`,
'dom day surface'
);
rep('className="flex flex-col items-center justify-center border-r border-white/20 pr-4 text-center"', 'className="flex flex-col items-center justify-center border-r border-areia-200 pr-4 text-center"', 'dom day divider');
rep('className="font-display text-[15px] font-black leading-tight"', 'className="font-display text-[15px] font-black leading-tight text-brand-800"', 'dom day label');
rep('className="mt-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand-100"', 'className="mt-1 rounded-full bg-areia-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-ouro-600 ring-1 ring-areia-200"', 'dom date');
rep(
`                      <p className="flex items-center gap-2 text-[16px] font-extrabold leading-snug">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white/50"
                          style={{ backgroundColor: COR_PROTEINA[prot] }}
                          aria-hidden
                        />
                        <span className="min-w-0">{dia.principal}</span>
                      </p>`,
`                      <p className="font-display text-[18px] font-bold leading-snug tracking-[-0.01em] text-carvao-900">
                        {dia.principal}
                      </p>`,
'dom principal'
);
rep('className="mt-1 pl-5 text-[11.5px] font-semibold text-brand-100"', 'className="mt-1 text-[11.5px] font-semibold text-carvao-600"', 'dom guarn');
rep('className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-5 text-[11px] text-white/85"', 'className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-carvao-500"', 'dom extras');
rep('className="font-bold text-ouro-300"', 'className="font-bold text-brand-700"', 'dom label salada');
// segunda ocorrência para sobremesa após a primeira substituição
if (s.includes('className="font-bold text-ouro-300"')) s = s.replace('className="font-bold text-ouro-300"', 'className="font-bold text-brand-700"');
rep('className="font-display text-[22px] font-black leading-none text-ouro-300 tabular-nums"', 'className="font-display text-[22px] font-black leading-none text-ouro-600 tabular-nums"', 'dom kcal');
rep('className="text-[9px] font-bold uppercase tracking-wide text-white/60"', 'className="text-[9px] font-bold uppercase tracking-wide text-carvao-400"', 'dom kcal label');
rep('className="mt-1 text-[11px] font-semibold text-white/85 tabular-nums"', 'className="mt-1 text-[11px] font-semibold text-carvao-500 tabular-nums"', 'dom protein metric');
rep('className="py-2 text-sm font-bold italic text-white/55"', 'className="py-2 text-sm font-bold italic text-carvao-400"', 'dom empty');
rep('className="text-[10px] text-white/30"', 'className="text-[10px] text-carvao-300"', 'dom empty nut');

// Remove legenda de proteínas: o acento lateral já comunica sem cara de dashboard.
const legendStart = `        {/* Legenda de proteínas */}`;
const legendEnd = `        {/* Informação nutricional média — só os números, sem score */}`;
if (s.includes(legendStart)) {
  const a = s.indexOf(legendStart);
  const b = s.indexOf(legendEnd, a);
  if (b < 0) throw new Error('fim legenda ausente');
  s = s.slice(0, a) + legendEnd + s.slice(b + legendEnd.length);
}

rep('Média por prato principal · cuidamos do que você come', 'Média do prato montado (~500 g) · cuidamos do que você come', 'nutrition copy');

fs.writeFileSync(path, s);
console.log('HOUSE_PRINT_EDITORIAL_PATCH=PASS');
