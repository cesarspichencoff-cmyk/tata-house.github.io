import { describe, expect, it } from 'vitest';
import {
  armazenamentoCheioMasConfirmadoNaNuvem,
  mensagemArmazenamentoCheio,
} from '@/lib/cardapio/aviso-critico';

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

  it('durante sincronizacao ainda exige confirmacao antes de chamar a alteracao de salva', () => {
    const mensagem = mensagemArmazenamentoCheio('sincronizando', 1);
    expect(mensagem).toContain('só deve ser considerada salva depois da confirmação da nuvem');
  });

  it('com nuvem online e zero pendencias informa que o dado operacional esta confirmado', () => {
    expect(armazenamentoCheioMasConfirmadoNaNuvem('online', 0)).toBe(true);
    const mensagem = mensagemArmazenamentoCheio('online', 0);
    expect(mensagem).toContain('alterações operacionais estão confirmadas na nuvem');
    expect(mensagem).toContain('modo offline');
    expect(mensagem).not.toContain('Evite fechar esta tela');
  });

  it('online com pendencia continua sendo risco e nao vira estado confirmado', () => {
    expect(armazenamentoCheioMasConfirmadoNaNuvem('online', 1)).toBe(false);
  });
});
