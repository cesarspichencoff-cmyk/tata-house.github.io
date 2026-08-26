import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cardapio/aviso-armazenamento', () => ({
  useArmazenamentoLocalCheio: () => false,
}));

vi.mock('@/lib/cardapio/supabase', () => ({
  useStatusNuvem: () => ({ status: 'ok', erroDesde: null, pendentes: 0 }),
}));

import { mensagemArmazenamentoCheio } from './AvisoCritico';

describe('AvisoCritico', () => {
  it('nao promete preservacao quando cache cheio e nuvem falha', () => {
    const mensagem = mensagemArmazenamentoCheio('erro', 2);
    expect(mensagem).toContain('a nuvem também está com falha');
    expect(mensagem).toContain('2 alteração(ões) ainda aguardando confirmação');
    expect(mensagem).toContain('a última alteração não está garantida até a nuvem confirmar');
  });

  it('avisa que a alteracao pode ficar apenas na tela quando a nuvem esta desligada', () => {
    const mensagem = mensagemArmazenamentoCheio('desligado', 0);
    expect(mensagem).toContain('não está sincronizando');
    expect(mensagem).toContain('pode existir apenas nesta tela');
  });

  it('mesmo sem erro de nuvem exige confirmacao antes de chamar a alteracao de salva', () => {
    const mensagem = mensagemArmazenamentoCheio('sincronizando', 1);
    expect(mensagem).toContain('só deve ser considerada salva depois da confirmação da nuvem');
  });
});
