import fs from 'node:fs';

function patchFile(path, reps) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of reps) {
    if (s.includes(to)) continue;
    if (!s.includes(from)) throw new Error(`anchor ausente ${path}: ${label}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s);
}

patchFile('src/lib/cardapio/governanca-candidatos.ts', [
  [
    "  desperdicioHistorico?: RegistroDesperdicio[];\n}",
    "  desperdicioHistorico?: RegistroDesperdicio[];\n  /** Pessoas geradas automaticamente pelo próprio House antes de qualquer ajuste humano. */\n  baselineAutomatico?: number[];\n}",
    'context baseline',
  ],
  [
    "function contextoComInteligenciaOficial(\n  contexto: ContextoCenariosGovernanca,",
    "export function podeCalibrarDemandaAutomaticamente(\n  pessoasAtual: number,\n  indice: number,\n  baselineAutomatico?: number[],\n): boolean {\n  const aprendido = baselineAutomatico?.[indice];\n  if (typeof aprendido === 'number' && Number.isFinite(aprendido) && aprendido > 0) {\n    return pessoasAtual === Math.round(aprendido);\n  }\n  return pessoasAtual === PESSOAS_PADRAO[indice];\n}\n\nfunction contextoComInteligenciaOficial(\n  contexto: ContextoCenariosGovernanca,",
    'helper baseline',
  ],
  [
    "    // Só calibra automaticamente quando o valor ainda é o baseline padrão.\n    // Se o gestor já mexeu no número de pessoas, a decisão humana prevalece.\n    if (!ref || ref.amostra < 2 || dia.pessoas !== PESSOAS_PADRAO[i]) return { ...dia };",
    "    // O baseline automático pode já ter sido aprendido pelo próprio House e, portanto,\n    // ser diferente do PESSOAS_PADRAO. Só a alteração humana bloqueia a calibração oficial.\n    if (!ref || ref.amostra < 2 || !podeCalibrarDemandaAutomaticamente(dia.pessoas, i, contexto.baselineAutomatico)) return { ...dia };",
    'calibration condition',
  ],
  [
    "        porques.unshift(`Contagem real de refeições calibrou ${integrado.usouDemanda} dia(s) que ainda estavam no baseline padrão; ajustes manuais do gestor foram preservados.`);",
    "        porques.unshift(`Contagem real de refeições calibrou ${integrado.usouDemanda} dia(s) que ainda estavam no baseline automático do House; ajustes manuais do gestor foram preservados.`);",
    'copy baseline',
  ],
]);

patchFile('src/components/cardapio/CenariosGovernanca.tsx', [
  [
    "  desperdicioHistorico,\n}: {",
    "  desperdicioHistorico,\n  baselineAutomatico,\n}: {",
    'prop baseline',
  ],
  [
    "  desperdicioHistorico: RegistroDesperdicio[];\n}) {",
    "  desperdicioHistorico: RegistroDesperdicio[];\n  baselineAutomatico: number[];\n}) {",
    'type baseline',
  ],
  [
    "      desperdicioHistorico,\n    });",
    "      desperdicioHistorico,\n      baselineAutomatico,\n    });",
    'pass baseline',
  ],
]);

patchFile('src/components/cardapio/PlanejadorGovernanca.tsx', [
  [
    "  lerSemana,\n  semanasComConteudo,",
    "  lerSemana,\n  semanaVazia,\n  semanasComConteudo,",
    'import semanaVazia',
  ],
  [
    "  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);\n  const desperdicioHistorico",
    "  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);\n  const baselineAutomatico = useMemo(() => semanaVazia().dias.map((d) => d.pessoas), []);\n  const desperdicioHistorico",
    'memo baseline',
  ],
  [
    "              desperdicioHistorico={desperdicioHistorico}\n            />",
    "              desperdicioHistorico={desperdicioHistorico}\n              baselineAutomatico={baselineAutomatico}\n            />",
    'ui baseline',
  ],
]);

patchFile('src/lib/cardapio/governanca-candidatos.test.ts', [
  [
    "  gerarCenariosGovernanca,\n} from './governanca-candidatos';",
    "  gerarCenariosGovernanca,\n  podeCalibrarDemandaAutomaticamente,\n} from './governanca-candidatos';",
    'import helper baseline',
  ],
  [
    "describe('governanca-candidatos', () => {",
    "describe('governanca-candidatos', () => {\n  it('distingue baseline aprendido automaticamente de ajuste humano', () => {\n    expect(podeCalibrarDemandaAutomaticamente(72, 0, [72, 70, 70, 75, 80, 80, 80])).toBe(true);\n    expect(podeCalibrarDemandaAutomaticamente(74, 0, [72, 70, 70, 75, 80, 80, 80])).toBe(false);\n    expect(podeCalibrarDemandaAutomaticamente(55, 0)).toBe(true);\n    expect(podeCalibrarDemandaAutomaticamente(60, 0)).toBe(false);\n  });",
    'test helper baseline',
  ],
  [
    "      desperdicioHistorico,\n    });\n\n    expect(cenarios.length)",
    "      desperdicioHistorico,\n      baselineAutomatico: estadoFixture().dias.map((d) => d.pessoas),\n    });\n\n    expect(cenarios.length)",
    'scenario baseline',
  ],
]);

console.log('HOUSE_DEMAND_BASELINE_PATCH=PASS');
