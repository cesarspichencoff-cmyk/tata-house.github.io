import { describe, expect, it } from 'vitest';
import {
  aceitacaoParaPlanejamento,
  demandaOficialPorDiaSemana,
  frequenciaOficial4Semanas,
  normalizarEvidenciaGovernancaReadOnly,
  processarMensagemEvidenciaGovernanca,
  resumoOperacionalOficial,
  GOV_PLANEJADOR_EVIDENCIA_V1,
  GOV_PLANEJADOR_EVIDENCIA_READY_V1,
  ORIGEM_GOVERNANCA_READONLY_V1,
} from './governanca-readonly';

const baseDia = {
  unidade: 'Itaim',
  status: 'finalizado',
  resumo: 'Frango grelhado e legumes',
  principal: 'Frango grelhado',
  custoTotal: 460,
  desperdicioTotal: 8,
  avaliacaoMedia: 4.8,
  nAvaliacoes: 5,
  almocoPlanejado: 62,
  jantarPlanejado: 18,
  marmitasPlanejado: 4,
  almocoServido: 61,
  jantarServido: 18,
  marmitasServido: 4,
  planejadoTotal: 84,
  servidoTotal: 83,
  indiceSaudavel: 88,
  kcal: 690,
  proteinaG: 40,
  carbG: 70,
  gorduraG: 18,
  fibraG: 10,
  porcaoG: 520,
};

const evidencia = {
  contrato: 'tata-house-governanca-readonly' as const,
  versao: 1 as const,
  modo: 'read-only' as const,
  origem: 'lideres' as const,
  fonte: 'tata_plus.refeicoes_relatorio_detalhado' as const,
  carregadoEm: '2026-09-06T07:30:00Z',
  unidade: 'Itaim',
  semanaId: '2026-S37',
  periodo: { de: '2026-07-13', ate: '2026-09-06' },
  dias: [
    { ...baseDia, data: '2026-08-24' },
    { ...baseDia, data: '2026-08-31', servidoTotal: 77, planejadoTotal: 82, desperdicioTotal: 0, indiceSaudavel: 82 },
  ],
  principais: [
    {
      nome: 'Frango grelhado',
      ocorrencias8Semanas: 3,
      ocorrencias4Semanas: 2,
      avaliacaoMedia: 4.67,
      amostraAvaliacoes: 15,
      custoMedioDia: 440,
      desperdicioMedioDia: 10,
      servidoMedioDia: 81,
      planejadoMedioDia: 83.5,
    },
  ],
};

describe('governanca-readonly', () => {
  it('versiona handshake próprio para evidência somente após receptor montado', () => {
    expect(GOV_PLANEJADOR_EVIDENCIA_READY_V1).toBe('tata-house:governanca:planejador:evidencia:ready:v1');
  });

  it('aceita contrato operacional minimizado e estrito', () => {
    expect(normalizarEvidenciaGovernancaReadOnly(evidencia)).toEqual(evidencia);
    expect(normalizarEvidenciaGovernancaReadOnly({ ...evidencia, token: 'proibido' })).toBeNull();
    expect(normalizarEvidenciaGovernancaReadOnly({
      ...evidencia,
      dias: [{ ...evidencia.dias[0], comentario: 'não pode entrar' }, evidencia.dias[1]],
    })).toBeNull();
    expect(normalizarEvidenciaGovernancaReadOnly({
      ...evidencia,
      dias: [{ ...evidencia.dias[0], indiceSaudavel: 101 }, evidencia.dias[1]],
    })).toBeNull();
  });

  it('rejeita unidade ou semana diferentes do contexto autorizado', () => {
    const msg = { type: GOV_PLANEJADOR_EVIDENCIA_V1, payload: evidencia };
    expect(processarMensagemEvidenciaGovernanca(
      ORIGEM_GOVERNANCA_READONLY_V1,
      msg,
      'Itaim',
      '2026-S37',
    )).toEqual(evidencia);
    expect(processarMensagemEvidenciaGovernanca(
      ORIGEM_GOVERNANCA_READONLY_V1,
      msg,
      'Pinheiros',
      '2026-S37',
    )).toBeNull();
    expect(processarMensagemEvidenciaGovernanca(
      ORIGEM_GOVERNANCA_READONLY_V1,
      msg,
      'Itaim',
      '2026-S38',
    )).toBeNull();
  });

  it('rejeita origem diferente e payload fora do tipo esperado', () => {
    const msg = { type: GOV_PLANEJADOR_EVIDENCIA_V1, payload: evidencia };
    expect(processarMensagemEvidenciaGovernanca('https://evil.example', msg, 'Itaim', '2026-S37')).toBeNull();
    expect(processarMensagemEvidenciaGovernanca(
      ORIGEM_GOVERNANCA_READONLY_V1,
      { type: 'outro', payload: evidencia },
      'Itaim',
      '2026-S37',
    )).toBeNull();
  });

  it('projeta frequência agregada de quatro semanas para o motor', () => {
    expect(frequenciaOficial4Semanas(evidencia)).toEqual({ 'frango grelhado': 2 });
    expect(frequenciaOficial4Semanas(null)).toEqual({});
  });

  it('usa avaliação oficial como prioridade sem somar duas vezes voto local', () => {
    const local = { 'frango grelhado': { n: 3, somaNotas: 9 }, 'picadinho': { n: 2, somaNotas: 8 } };
    const combinado = aceitacaoParaPlanejamento(local, evidencia);
    expect(combinado['frango grelhado'].n).toBe(15);
    expect(combinado['frango grelhado'].somaNotas).toBeCloseTo(70.05, 5);
    expect(combinado.picadinho).toEqual(local.picadinho);
  });

  it('calibra demanda somente com refeições efetivamente servidas', () => {
    const demanda = demandaOficialPorDiaSemana(evidencia);
    // 24/08 e 31/08/2026 são segundas-feiras.
    expect(demanda[0]?.amostra).toBe(2);
    expect(demanda[0]?.mediaServido).toBe(80);
    expect(demanda.slice(1).every((x) => x === null)).toBe(true);
  });

  it('resume operação oficial sem transformar desperdício em métrica inventada', () => {
    const resumo = resumoOperacionalOficial(evidencia);
    expect(resumo).toEqual({
      diasComContagemReal: 2,
      diasComDesperdicioRegistrado: 1,
      indiceSaudavelMedio: 85,
      avaliacoesOficiais: 15,
    });
  });
});
