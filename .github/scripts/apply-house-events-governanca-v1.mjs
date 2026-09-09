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
    "import type { DiaCardapio, EstadoSemana, RegistroDesperdicio } from './tipos';",
    "import type { DiaCardapio, EstadoSemana, EventoDemanda, RegistroDesperdicio } from './tipos';",
    'tipo EventoDemanda',
  ],
  [
    "  semelhanteA?: ModoCenarioGovernanca;\n}",
    "  semelhanteA?: ModoCenarioGovernanca;\n  demanda: { eventosAplicados: number; eventosRevisao: number; ajustesHumanosPreservados: number };\n}",
    'metadata demanda cenario',
  ],
  [
    "  baselineAutomatico?: number[];\n}",
    "  baselineAutomatico?: number[];\n  /** Eventos manuais já existentes no House; fator segue a semântica do módulo de previsão. */\n  eventos?: EventoDemanda[];\n  /** Datas ISO (yyyy-mm-dd), 0=segunda … 6=domingo, da semana autorizada. */\n  datasSemana?: string[];\n}",
    'contexto eventos',
  ],
  [
    "    fingerprint: fingerprintDias(dias),\n  };",
    "    fingerprint: fingerprintDias(dias),\n    demanda: { eventosAplicados: 0, eventosRevisao: 0, ajustesHumanosPreservados: 0 },\n  };",
    'default demanda',
  ],
  [
    "export function podeCalibrarDemandaAutomaticamente(\n  pessoasAtual: number,\n  indice: number,\n  baselineAutomatico?: number[],\n): boolean {\n  const aprendido = baselineAutomatico?.[indice];\n  if (typeof aprendido === 'number' && Number.isFinite(aprendido) && aprendido > 0) {\n    return pessoasAtual === Math.round(aprendido);\n  }\n  return pessoasAtual === PESSOAS_PADRAO[indice];\n}\n\nfunction contextoComInteligenciaOficial(",
    "export function podeCalibrarDemandaAutomaticamente(\n  pessoasAtual: number,\n  indice: number,\n  baselineAutomatico?: number[],\n): boolean {\n  const aprendido = baselineAutomatico?.[indice];\n  if (typeof aprendido === 'number' && Number.isFinite(aprendido) && aprendido > 0) {\n    return pessoasAtual === Math.round(aprendido);\n  }\n  return pessoasAtual === PESSOAS_PADRAO[indice];\n}\n\nexport interface ResultadoEventosDemandaGovernanca {\n  dias: DiaCardapio[];\n  eventosAplicados: number;\n  eventosRevisao: number;\n  ajustesHumanosPreservados: number;\n  mensagens: string[];\n}\n\n/**\n * Reusa a semântica de EventoDemanda já existente no House: fator multiplica demanda.\n * No comparador, porém, evento nunca atropela ajuste humano e fator=0 (fechado)\n * exige decisão explícita porque o modelo atual ainda mantém sete pratos na semana.\n */\nexport function aplicarEventosDemandaGovernanca(args: {\n  dias: DiaCardapio[];\n  diasOriginais: DiaCardapio[];\n  eventos?: EventoDemanda[];\n  datasSemana?: string[];\n  baselineAutomatico?: number[];\n}): ResultadoEventosDemandaGovernanca {\n  const dias = clonarDias(args.dias);\n  const mensagens: string[] = [];\n  let eventosAplicados = 0;\n  let eventosRevisao = 0;\n  let ajustesHumanosPreservados = 0;\n  if (!Array.isArray(args.datasSemana) || args.datasSemana.length !== 7) {\n    return { dias, eventosAplicados, eventosRevisao, ajustesHumanosPreservados, mensagens };\n  }\n  const eventos = Array.isArray(args.eventos) ? args.eventos : [];\n  dias.forEach((dia, i) => {\n    const data = args.datasSemana?.[i];\n    const doDia = eventos.filter((e) => e.data === data);\n    if (!doDia.length) return;\n    if (doDia.length > 1) {\n      eventosRevisao += 1;\n      mensagens.push(`${data}: há ${doDia.length} eventos cadastrados para o mesmo dia; nenhum fator foi aplicado automaticamente.`);\n      return;\n    }\n    const evento = doDia[0];\n    const fator = Number(evento.fator);\n    if (!Number.isFinite(fator) || fator < 0) {\n      eventosRevisao += 1;\n      mensagens.push(`${data}: o evento “${evento.rotulo}” tem fator inválido e foi mantido somente para revisão.`);\n      return;\n    }\n    if (fator === 0) {\n      eventosRevisao += 1;\n      mensagens.push(`${data}: “${evento.rotulo}” marca dia fechado (fator 0). O comparador não cria fechamento sozinho; exige decisão humana.`);\n      return;\n    }\n    const original = args.diasOriginais[i];\n    if (!original || !podeCalibrarDemandaAutomaticamente(original.pessoas, i, args.baselineAutomatico)) {\n      ajustesHumanosPreservados += 1;\n      mensagens.push(`${data}: “${evento.rotulo}” não sobrescreveu a quantidade ajustada manualmente pelo gestor.`);\n      return;\n    }\n    dia.pessoas = Math.max(1, Math.round(dia.pessoas * fator));\n    eventosAplicados += 1;\n    mensagens.push(`${data}: “${evento.rotulo}” aplicou fator ${fator.toFixed(2)} sobre a demanda automática.`);\n  });\n  return { dias, eventosAplicados, eventosRevisao, ajustesHumanosPreservados, mensagens };\n}\n\nfunction contextoComInteligenciaOficial(",
    'helper eventos',
  ],
  [
    "): { contexto: ContextoCenariosGovernanca; usouDemanda: number; amostraOficial: number; resumo: ReturnType<typeof resumoOperacionalOficial> } {",
    "): { contexto: ContextoCenariosGovernanca; usouDemanda: number; amostraOficial: number; resumo: ReturnType<typeof resumoOperacionalOficial>; eventos: Omit<ResultadoEventosDemandaGovernanca, 'dias'> } {",
    'retorno contexto integrado',
  ],
  [
    "  const dias = contexto.estado.dias.map((dia, i) => {",
    "  const diasCalibrados = contexto.estado.dias.map((dia, i) => {",
    'rename dias calibrados',
  ],
  [
    "  return {\n    contexto: {\n      ...contexto,\n      estado: { ...contexto.estado, dias },\n      aceitacao,\n    },\n    usouDemanda,\n    amostraOficial: evidencia?.principais.reduce((s, p) => s + p.amostraAvaliacoes, 0) ?? 0,\n    resumo: resumoOperacionalOficial(evidencia),\n  };",
    "  const eventosAplicados = aplicarEventosDemandaGovernanca({\n    dias: diasCalibrados,\n    diasOriginais: contexto.estado.dias,\n    eventos: contexto.eventos,\n    datasSemana: contexto.datasSemana,\n    baselineAutomatico: contexto.baselineAutomatico,\n  });\n\n  return {\n    contexto: {\n      ...contexto,\n      estado: { ...contexto.estado, dias: eventosAplicados.dias },\n      aceitacao,\n    },\n    usouDemanda,\n    amostraOficial: evidencia?.principais.reduce((s, p) => s + p.amostraAvaliacoes, 0) ?? 0,\n    resumo: resumoOperacionalOficial(evidencia),\n    eventos: {\n      eventosAplicados: eventosAplicados.eventosAplicados,\n      eventosRevisao: eventosAplicados.eventosRevisao,\n      ajustesHumanosPreservados: eventosAplicados.ajustesHumanosPreservados,\n      mensagens: eventosAplicados.mensagens,\n    },\n  };",
    'aplicar eventos integrado',
  ],
  [
    "      const porques = [...cenario.porques];",
    "      const porques = [...cenario.porques];\n      integrado.eventos.mensagens.forEach((m) => porques.unshift(`Evento de demanda: ${m}`));",
    'porques eventos',
  ],
  [
    "      return { ...cenario, porques };",
    "      return {\n        ...cenario,\n        porques,\n        demanda: {\n          eventosAplicados: integrado.eventos.eventosAplicados,\n          eventosRevisao: integrado.eventos.eventosRevisao,\n          ajustesHumanosPreservados: integrado.eventos.ajustesHumanosPreservados,\n        },\n      };",
    'metadata eventos cenario',
  ],
]);

patchFile('src/components/cardapio/CenariosGovernanca.tsx', [
  [
    "import type { Aceitacao, EstadoSemana, RegistroDesperdicio } from '@/lib/cardapio/tipos';",
    "import type { Aceitacao, EstadoSemana, EventoDemanda, RegistroDesperdicio } from '@/lib/cardapio/tipos';",
    'tipo evento UI',
  ],
  [
    "        <Metric\n          label=\"Repetição recente\"",
    "        <Metric\n          label=\"Demanda\"\n          value={mDemand(cenario)}\n          hint={hDemand(cenario)}\n        />\n        <Metric\n          label=\"Repetição recente\"",
    'metric demanda UI',
  ],
  [
    "function CardCenario({",
    "function mDemand(cenario: CenarioGovernanca): string {\n  if (cenario.demanda.eventosRevisao > 0) return `${cenario.demanda.eventosRevisao} para revisar`;\n  if (cenario.demanda.eventosAplicados > 0) return `${cenario.demanda.eventosAplicados} ajustado${cenario.demanda.eventosAplicados === 1 ? '' : 's'}`;\n  return 'Sem ajuste';\n}\n\nfunction hDemand(cenario: CenarioGovernanca): string {\n  if (cenario.demanda.eventosRevisao > 0) return 'evento fechado/ambíguo exige decisão humana';\n  if (cenario.demanda.ajustesHumanosPreservados > 0) return `${cenario.demanda.ajustesHumanosPreservados} ajuste(s) humano(s) preservado(s)`;\n  return cenario.demanda.eventosAplicados > 0 ? 'fator aplicado só sobre baseline automático' : 'demanda automática preservada';\n}\n\nfunction CardCenario({",
    'helpers demanda UI',
  ],
  [
    "  baselineAutomatico,\n}: {",
    "  baselineAutomatico,\n  eventos,\n  datasSemana,\n}: {",
    'props eventos UI',
  ],
  [
    "  baselineAutomatico: number[];\n}) {",
    "  baselineAutomatico: number[];\n  eventos: EventoDemanda[];\n  datasSemana: string[];\n}) {",
    'tipos props eventos UI',
  ],
  [
    "      baselineAutomatico,\n    });",
    "      baselineAutomatico,\n      eventos,\n      datasSemana,\n    });",
    'passar eventos gerador',
  ],
  [
    "            Compare propostas com custo, restrições, desperdício, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    "            Compare propostas com custo, restrições, desperdício, demanda, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.",
    'copy demanda',
  ],
]);

patchFile('src/components/cardapio/PlanejadorGovernanca.tsx', [
  [
    "  lerDesperdicio,\n  lerSemana,",
    "  datasDaSemana,\n  lerDesperdicio,\n  lerSemana,",
    'import datas semana',
  ],
  [
    "  useEstoque,\n  useFornecedores,",
    "  useEstoque,\n  useEventos,\n  useFornecedores,",
    'import useEventos',
  ],
  [
    "  const { estoque } = useEstoque();\n  const { funcionarios } = useFuncionarios();",
    "  const { estoque } = useEstoque();\n  const { eventos } = useEventos();\n  const { funcionarios } = useFuncionarios();",
    'hook eventos',
  ],
  [
    "  const baselineAutomatico = useMemo(() => semanaVazia().dias.map((d) => d.pessoas), []);\n  const desperdicioHistorico = semanasComConteudo().flatMap((sid) => lerDesperdicio(sid));",
    "  const baselineAutomatico = useMemo(() => semanaVazia().dias.map((d) => d.pessoas), []);\n  const datasSemana = useMemo(() => datasDaSemana(contexto.semanaId).map((d) => d.toISOString().slice(0, 10)), [contexto.semanaId]);\n  const desperdicioHistorico = semanasComConteudo().flatMap((sid) => lerDesperdicio(sid));",
    'datas semana memo',
  ],
  [
    "              baselineAutomatico={baselineAutomatico}\n            />",
    "              baselineAutomatico={baselineAutomatico}\n              eventos={eventos}\n              datasSemana={datasSemana}\n            />",
    'passar eventos componente',
  ],
]);

patchFile('src/lib/cardapio/governanca-candidatos.test.ts', [
  [
    "  aplicarCenarioAoEstado,\n  gerarCenariosGovernanca,",
    "  aplicarCenarioAoEstado,\n  aplicarEventosDemandaGovernanca,\n  gerarCenariosGovernanca,",
    'import helper evento teste',
  ],
  [
    "import type { Aceitacao, DiaCardapio, EstadoSemana, RegistroDesperdicio } from './tipos';",
    "import type { Aceitacao, DiaCardapio, EstadoSemana, EventoDemanda, RegistroDesperdicio } from './tipos';",
    'tipo evento teste',
  ],
  [
    "describe('governanca-candidatos', () => {\n  it('distingue baseline aprendido automaticamente de ajuste humano', () => {",
    "describe('governanca-candidatos', () => {\n  it('aplica evento positivo somente sobre baseline automático e falha fechado para dia fechado/ambíguo', () => {\n    const base = diasFixture();\n    const datas = ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];\n    const baseline = base.map((d) => d.pessoas);\n    const evento: EventoDemanda = { id: 'e1', data: datas[0], rotulo: 'Treinamento', fator: 1.2 };\n    const aplicado = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [evento], datasSemana: datas, baselineAutomatico: baseline });\n    expect(aplicado.dias[0].pessoas).toBe(72);\n    expect(aplicado.eventosAplicados).toBe(1);\n    expect(aplicado.eventosRevisao).toBe(0);\n\n    const fechado = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [{ ...evento, fator: 0, rotulo: 'Fechado' }], datasSemana: datas, baselineAutomatico: baseline });\n    expect(fechado.dias[0].pessoas).toBe(60);\n    expect(fechado.eventosRevisao).toBe(1);\n    expect(fechado.mensagens.join(' ')).toMatch(/fechado/i);\n\n    const ambiguo = aplicarEventosDemandaGovernanca({ dias: base, diasOriginais: base, eventos: [evento, { ...evento, id: 'e2', rotulo: 'Outro' }], datasSemana: datas, baselineAutomatico: baseline });\n    expect(ambiguo.dias[0].pessoas).toBe(60);\n    expect(ambiguo.eventosRevisao).toBe(1);\n  });\n\n  it('evento não atropela ajuste humano de pessoas', () => {\n    const base = diasFixture();\n    const ajustado = base.map((d) => ({ ...d }));\n    ajustado[0].pessoas = 61;\n    const datas = ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];\n    const res = aplicarEventosDemandaGovernanca({\n      dias: ajustado,\n      diasOriginais: ajustado,\n      eventos: [{ id: 'e1', data: datas[0], rotulo: 'Evento', fator: 1.5 }],\n      datasSemana: datas,\n      baselineAutomatico: base.map((d) => d.pessoas),\n    });\n    expect(res.dias[0].pessoas).toBe(61);\n    expect(res.eventosAplicados).toBe(0);\n    expect(res.ajustesHumanosPreservados).toBe(1);\n  });\n\n  it('distingue baseline aprendido automaticamente de ajuste humano', () => {",
    'testes eventos',
  ],
  [
    "      baselineAutomatico: estadoFixture().dias.map((d) => d.pessoas),\n    });",
    "      baselineAutomatico: estadoFixture().dias.map((d) => d.pessoas),\n      eventos: [{ id: 'e1', data: '2026-09-07', rotulo: 'Treinamento', fator: 1.1 }],\n      datasSemana: ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'],\n    });",
    'geração com evento',
  ],
  [
    "      expect(cenario.porques.some((p) => /desperd[ií]cio/i.test(p))).toBe(true);\n      expect(cenario.fingerprint.length)",
    "      expect(cenario.porques.some((p) => /desperd[ií]cio/i.test(p))).toBe(true);\n      expect(cenario.porques.some((p) => /evento de demanda/i.test(p))).toBe(true);\n      expect(cenario.demanda.eventosAplicados).toBe(1);\n      expect(cenario.fingerprint.length)",
    'assert evento cenario',
  ],
]);

console.log('HOUSE_EVENTS_GOVERNANCE_PATCH=PASS');
