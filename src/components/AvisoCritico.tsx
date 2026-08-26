'use client';

import { useEffect, useState } from 'react';
import { useArmazenamentoLocalCheio } from '@/lib/cardapio/aviso-armazenamento';
import { useStatusNuvem } from '@/lib/cardapio/supabase';
import type { StatusNuvem } from '@/lib/cardapio/supabase/status';

const LIMIAR_ERRO_MS = 15_000;

function useErroSustentado(erroDesde: number | null): boolean {
  const [passouLimiar, setPassouLimiar] = useState(false);

  useEffect(() => {
    if (!erroDesde) {
      setPassouLimiar(false);
      return;
    }
    const decorrido = Date.now() - erroDesde;
    if (decorrido >= LIMIAR_ERRO_MS) {
      setPassouLimiar(true);
      return;
    }
    const t = setTimeout(() => setPassouLimiar(true), LIMIAR_ERRO_MS - decorrido);
    return () => clearTimeout(t);
  }, [erroDesde]);

  return passouLimiar;
}

export function mensagemArmazenamentoCheio(status: StatusNuvem, pendentes: number): string {
  const fila =
    pendentes > 0
      ? ` Há ${pendentes} alteração(ões) ainda aguardando confirmação.`
      : '';

  if (status === 'erro') {
    return (
      'O armazenamento local deste aparelho atingiu o limite e a nuvem também está com falha.' +
      fila +
      ' Estados grandes tentam usar o IndexedDB, mas a última alteração não está garantida até a nuvem confirmar. Evite fechar esta tela.'
    );
  }

  if (status === 'desligado') {
    return (
      'O armazenamento local deste aparelho atingiu o limite e este aparelho não está sincronizando.' +
      ' Estados grandes tentam usar o IndexedDB, mas a última alteração pode existir apenas nesta tela. Evite fechar antes de recuperar a sincronização.'
    );
  }

  return (
    'O armazenamento local deste aparelho atingiu o limite.' +
    fila +
    ' Estados grandes tentam usar o IndexedDB, mas uma alteração só deve ser considerada salva depois da confirmação da nuvem. Evite fechar esta tela enquanto houver pendências.'
  );
}

export function AvisoCritico() {
  const cheio = useArmazenamentoLocalCheio();
  const { status, erroDesde, pendentes } = useStatusNuvem();
  const erroSustentado = useErroSustentado(erroDesde);

  if (cheio) {
    return (
      <Banner cor="bg-perigo">
        {mensagemArmazenamentoCheio(status, pendentes)}
      </Banner>
    );
  }

  if (status === 'desligado') {
    return (
      <Banner cor="bg-perigo">
        Este aparelho NÃO está sincronizando — o que você digitar pode ficar só aqui.
        Confira em Ajustes → “A sincronização está funcionando?”.
      </Banner>
    );
  }

  if (status === 'erro' && erroSustentado) {
    return (
      <Banner cor="bg-alerta">
        Falha ao sincronizar com a nuvem
        {pendentes > 0 ? ` — ${pendentes} alteração(ões) ainda aguardam confirmação` : ''}.
        Abra Ajustes → “A sincronização está funcionando?” para separar rede, banco e cache local.
      </Banner>
    );
  }

  return null;
}

function Banner({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={`${cor} px-4 py-2 text-center text-caption font-semibold text-white shadow-md print:hidden`}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      {children}
    </div>
  );
}
