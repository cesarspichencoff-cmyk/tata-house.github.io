import { describe, expect, it } from 'vitest';
import {
  frequenciaOficial4Semanas,
  normalizarEvidenciaGovernancaReadOnly,
  processarMensagemEvidenciaGovernanca,
  GOV_PLANEJADOR_EVIDENCIA_V1,
  ORIGEM_GOVERNANCA_READONLY_V1,
} from './governanca-readonly';

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
    {
      data: '2026-08-24',
      unidade: 'Itaim',
      status: 'finalizado',
      resumo: 'Frango grelhado e legumes',
      principal: 'Frango grelhado',
      custoTotal: 460,
      desperdicioTotal: 8,
      avaliacaoMedia: 4.8,
      nAvaliacoes: 5,
    },
  ],
  principais: [
    {
      nome: 'Frango grelhado',
      ocorrencias8Semanas: 3,
      ocorrencias4Semanas: 2,
      avaliacaoMedia: 4.67,
      amostraAvaliacoes: 15,
      custoMedioDia: 440,
    },
  ],
};

describe('governanca-readonly', () => {
  it('aceita somente o contrato minimizado e estrito', () => {
    expect(normalizarEvidenciaGovernancaReadOnly(evidencia)).toEqual(evidencia);
    expect(normalizarEvidenciaGovernancaReadOnly({ ...evidencia, token: 'proibido' })).toBeNull();
    expect(normalizarEvidenciaGovernancaReadOnly({
      ...evidencia,
      dias: [{ ...evidencia.dias[0], comentario: 'não pode entrar' }],
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

  it('projeta somente frequência agregada de quatro semanas para o motor', () => {
    expect(frequenciaOficial4Semanas(evidencia)).toEqual({ 'frango grelhado': 2 });
    expect(frequenciaOficial4Semanas(null)).toEqual({});
  });
});
