import { describe, expect, it } from 'vitest';
import {
  aplicarTrocaGovernanca,
  diaTemDerivadosOperacionais,
  podeAplicarTrocaGovernanca,
  principaisElegiveisGovernanca,
  ranquearTrocasGovernanca,
} from './governanca-trocas';
import { normalizar, proteinaDoPrato } from './motor';
import type { Aceitacao, DiaCardapio, EstadoSemana, SubstituicaoRegistro } from './tipos';

function escolher(proteina: string, qtd: number, excluir = new Set<string>()): string[] {
  const arr = principaisElegiveisGovernanca()
    .filter((n) => proteinaDoPrato(n) === proteina && !excluir.has(normalizar(n)));
  expect(arr.length).toBeGreaterThanOrEqual(qtd);
  return arr.slice(0, qtd);
}

function estadoBase(): EstadoSemana {
  const usados = new Set<string>();
  const frangos = escolher('frango', 4, usados); frangos.forEach((n) => usados.add(normalizar(n)));
  const bovinos = escolher('bovina', 2, usados); bovinos.forEach((n) => usados.add(normalizar(n)));
  const suino = escolher('suina', 1, usados)[0];
  const principais = [frangos[0], bovinos[0], frangos[1], suino, frangos[2], bovinos[1], frangos[3]];
  const pessoas = [55, 55, 65, 65, 80, 80, 80];
  const dias: DiaCardapio[] = principais.map((principal, i) => ({
    pessoas: pessoas[i],
    principal,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: '',
    salada: '',
    sobremesa: '',
  }));
  return {
    versao: 1,
    orcamento: 4200,
    dias,
    etapa: 'rascunho',
    historico: [{ etapa: 'cozinha', em: '2026-09-01T12:00:00.000Z', papel: 'gestor' }],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: 'preservar',
  };
}

function aceitacaoDe(nome: string, media: number, n = 10): Aceitacao {
  return {
    [normalizar(nome)]: {
      prato: nome,
      bom: 0,
      ok: 0,
      ruim: 0,
      somaNotas: media * n,
      n,
      atualizadoEm: '2026-09-01T12:00:00.000Z',
    },
  };
}

describe('trocas inteligentes da Governança', () => {
  it('bloqueia troca quando o dia já tem evidência operacional', () => {
    const estado = estadoBase();
    estado.ajustes = { 0: { sal: { qtd: 1 } } };
    expect(diaTemDerivadosOperacionais(estado, 0)).toBe(true);
    expect(podeAplicarTrocaGovernanca(estado, 0).ok).toBe(false);
  });

  it('aplica somente o principal e preserva o restante do rascunho', () => {
    const estado = estadoBase();
    const atual = estado.dias[0].principal;
    const alternativa = principaisElegiveisGovernanca().find((n) =>
      normalizar(n) !== normalizar(atual) &&
      !estado.dias.slice(1).some((d) => normalizar(d.principal) === normalizar(n)),
    );
    expect(alternativa).toBeTruthy();
    const novo = aplicarTrocaGovernanca(estado, 0, alternativa!);
    expect(novo).not.toBe(estado);
    expect(novo.dias[0].principal).toBe(alternativa);
    expect(novo.dias[0].pessoas).toBe(estado.dias[0].pessoas);
    expect(novo.dias[1]).toEqual(estado.dias[1]);
    expect(novo.orcamento).toBe(4200);
    expect(novo.historico).toEqual(estado.historico);
    expect(novo.obsCozinha).toBe('preservar');
  });

  it('não oferece o prato atual nem pratos já usados nos outros dias', () => {
    const estado = estadoBase();
    const resultados = ranquearTrocasGovernanca({
      estado,
      diaIndice: 0,
      precos: {},
      aceitacao: {},
      frequencia: {},
    }, 12);
    const proibidos = new Set(estado.dias.map((d) => normalizar(d.principal)));
    expect(resultados.length).toBeGreaterThan(0);
    resultados.forEach((r) => expect(proibidos.has(r.norm)).toBe(false));
  });

  it('não transforma ausência de aceitação em nota zero', () => {
    const estado = estadoBase();
    const resultados = ranquearTrocasGovernanca({
      estado,
      diaIndice: 0,
      precos: {},
      aceitacao: {},
      frequencia: {},
    }, 6);
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados.every((r) => r.aceitacao === null)).toBe(true);
    expect(resultados[0].motivos.some((m) => /não inventa nota/i.test(m))).toBe(true);
  });

  it('prioriza boa aceitação real sobre baixa aceitação quando regras equivalem', () => {
    const estado = estadoBase();
    const atuais = new Set(estado.dias.map((d) => normalizar(d.principal)));
    const extras = principaisElegiveisGovernanca().filter((n) => !atuais.has(normalizar(n)));
    let par: [string, string] | null = null;
    for (let i = 0; i < extras.length && !par; i++) {
      for (let j = i + 1; j < extras.length; j++) {
        if (proteinaDoPrato(extras[i]) === proteinaDoPrato(extras[j])) {
          par = [extras[i], extras[j]];
          break;
        }
      }
    }
    expect(par).toBeTruthy();
    const [bom, ruim] = par!;
    const aceitacao: Aceitacao = {
      ...aceitacaoDe(bom, 4.8, 10),
      ...aceitacaoDe(ruim, 2.2, 10),
    };
    const resultados = ranquearTrocasGovernanca({
      estado,
      diaIndice: 0,
      precos: {},
      aceitacao,
      frequencia: {},
    }, 12);
    const ib = resultados.findIndex((r) => r.norm === normalizar(bom));
    const ir = resultados.findIndex((r) => r.norm === normalizar(ruim));
    if (ib >= 0 && ir >= 0 && resultados[ib].deltaErros === resultados[ir].deltaErros && resultados[ib].familiaRepetida === resultados[ir].familiaRepetida) {
      expect(ib).toBeLessThan(ir);
    }
  });

  it('usa memória real de substituição sem torná-la aprovação automática', () => {
    const estado = estadoBase();
    const original = estado.dias[0].principal;
    const usados = new Set(estado.dias.map((d) => normalizar(d.principal)));
    const substituto = principaisElegiveisGovernanca().find((n) => !usados.has(normalizar(n)))!;
    const registros: SubstituicaoRegistro[] = [0, 1, 2, 3].map((i) => ({
      id: `s-${i}`,
      semanaId: `2026-S${30 + i}`,
      dia: 0,
      nomeOriginal: original,
      nomeSubstituto: substituto,
      normOriginal: normalizar(original),
      normSubstituto: normalizar(substituto),
      motivo: 'variedade',
      registradoEm: `2026-08-${10 + i}T12:00:00.000Z`,
      aceitacaoSubstituto: 4.5,
      desperdicioSubstituto: 0.05,
    }));
    const resultados = ranquearTrocasGovernanca({
      estado,
      diaIndice: 0,
      precos: {},
      aceitacao: {},
      frequencia: {},
      substituicoes: registros,
    }, 12);
    const aprendido = resultados.find((r) => r.norm === normalizar(substituto));
    expect(aprendido?.aprendizado?.confianca).toBe('alta');
    expect(aprendido?.motivos.some((m) => /registrou esta substituição 4×/i.test(m))).toBe(true);
    expect(typeof aprendido?.bloqueada).toBe('boolean');
  });
});
