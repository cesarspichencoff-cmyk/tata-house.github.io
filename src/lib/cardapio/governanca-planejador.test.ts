import { describe, expect, it } from 'vitest';
import type { DiaCardapio } from './tipos';
import {
  avaliarProntidaoPlanejamento,
  construirDraftPlanejamentoGovernanca,
  datasDaSemanaIso,
  normalizarContextoPlanejadorGovernanca,
  processarMensagemContextoPlanejador,
  semanaIsoValida,
  validarDraftPlanejamentoGovernanca,
  GOV_PLANEJADOR_CONTEXT_V1,
  ORIGEM_GOVERNANCA_PLANEJADOR_V1,
} from './governanca-planejador';

function semanaCompleta(): DiaCardapio[] {
  const principais = [
    'Frango assado',
    'Picadinho bovino',
    'Frango grelhado',
    'Carne de panela',
    'Frango xadrez',
    'Lombo suíno',
    'Frango ao molho',
  ];
  return principais.map((principal) => ({
    pessoas: 70,
    principal,
    guarnicaoFixa: 'Arroz e Feijão',
    guarnicao: 'Legumes',
    salada: 'Folhas',
    sobremesa: 'Fruta',
  }));
}

const contexto = {
  contrato: 'tata-house-governanca' as const,
  versao: 1 as const,
  tipo: 'planejamento.semana.contexto' as const,
  origem: 'governanca' as const,
  correlationId: 'corr-123',
  semanaId: '2026-S37',
  unidadeFonte: 'Itaim',
  unidadeAlvo: 'tata-house' as const,
};

describe('governanca-planejador', () => {
  it('valida semana ISO real e deriva exatamente sete datas', () => {
    expect(semanaIsoValida('2026-S37')).toBe(true);
    expect(semanaIsoValida('2026-S54')).toBe(false);
    expect(datasDaSemanaIso('2026-S37')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('aceita somente contexto canônico completo', () => {
    expect(normalizarContextoPlanejadorGovernanca(contexto)).toEqual(contexto);
    expect(normalizarContextoPlanejadorGovernanca({ ...contexto, semanaId: '2026-S54' })).toBeNull();
    expect(normalizarContextoPlanejadorGovernanca({ ...contexto, unidadeFonte: '  ' })).toBeNull();
  });

  it('falha fechado para origem cross-origin diferente', () => {
    const dados = { type: GOV_PLANEJADOR_CONTEXT_V1, payload: contexto };
    expect(processarMensagemContextoPlanejador('https://evil.example', dados)).toEqual({
      tratado: false,
      aceito: false,
    });
    expect(processarMensagemContextoPlanejador(ORIGEM_GOVERNANCA_PLANEJADOR_V1, dados).aceito).toBe(true);
  });

  it('bloqueia envio se algum dia não tiver principal', () => {
    const dias = semanaCompleta();
    dias[3] = { ...dias[3], principal: '' };
    const prontidao = avaliarProntidaoPlanejamento(dias, {});
    expect(prontidao.podeEnviar).toBe(false);
    expect(prontidao.bloqueios.some((x) => x.includes('Dia 4'))).toBe(true);
  });

  it('bloqueia regra operacional marcada como erro pelo motor', () => {
    const dias = semanaCompleta().map((d, i) => ({
      ...d,
      principal: i < 5 ? `Frango ${i}` : d.principal,
    }));
    const prontidao = avaliarProntidaoPlanejamento(dias, {});
    expect(prontidao.podeEnviar).toBe(false);
    expect(prontidao.bloqueios.some((x) => /Frango \d+×/.test(x))).toBe(true);
  });

  it('constrói e revalida draft semanal canônico sem extras', () => {
    const dias = semanaCompleta();
    const prontidao = avaliarProntidaoPlanejamento(dias, {});
    expect(prontidao.podeEnviar).toBe(true);

    const draft = construirDraftPlanejamentoGovernanca(
      contexto,
      dias,
      prontidao,
      'prop-123',
      '2026-09-06T15:00:00-03:00',
    );
    expect(draft.dias).toHaveLength(7);
    expect(draft.dias[0]).toMatchObject({ data: '2026-09-07', principal: 'Frango assado' });
    expect(validarDraftPlanejamentoGovernanca({ ...draft, extra: 'descartar' })).toEqual(draft);
  });

  it('rejeita draft com data adulterada ou principal vazio', () => {
    const dias = semanaCompleta();
    const draft = construirDraftPlanejamentoGovernanca(
      contexto,
      dias,
      avaliarProntidaoPlanejamento(dias, {}),
      'prop-123',
      '2026-09-06T15:00:00-03:00',
    );
    const alterado = {
      ...draft,
      dias: draft.dias.map((d, i) => (i === 0 ? { ...d, data: '2026-09-08' } : d)),
    };
    expect(validarDraftPlanejamentoGovernanca(alterado)).toBeNull();
    expect(validarDraftPlanejamentoGovernanca({
      ...draft,
      dias: draft.dias.map((d, i) => (i === 1 ? { ...d, principal: '' } : d)),
    })).toBeNull();
  });
});
