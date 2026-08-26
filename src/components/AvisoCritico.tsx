'use client';

import { useEffect, useState } from 'react';
import { useArmazenamentoLocalCheio } from '@/lib/cardapio/aviso-armazenamento';
import { useStatusNuvem } from '@/lib/cardapio/supabase';

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

export function AvisoCritico() {
  const cheio = useArmazenamentoLocalCheio();
  const { status, erroDesde, pendentes } = useStatusNuvem();
  const erroSustentado = useErroSustentado(erroDesde);

  if (cheio) {
    return (
      <Banner cor="bg-perigo">
        O cache local deste aparelho atingiu o limite. Evite fechar esta tela até a sincronização
        terminar; o TATÁ House está preservando os estados grandes fora desse cache.
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
