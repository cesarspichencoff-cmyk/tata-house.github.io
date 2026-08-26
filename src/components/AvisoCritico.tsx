'use client';

/* =====================================================================
   Avisos críticos, sempre visíveis — nada aqui fica escondido atrás de um
   ícone pequenino no cabeçalho (o indicador discreto continua existindo
   para o estado normal; isto é para quando algo realmente não está sendo
   salvo e a pessoa precisa saber AGORA, não descobrir depois que sumiu).

   1) Armazenamento do aparelho cheio: a última gravação local falhou —
      a mudança nem existe fora da memória, a nuvem não tem como ajudar.
   2) Nuvem em erro por tempo suficiente para não ser só um soluço de
      rede: as mudanças deste aparelho não estão chegando aos outros.
   ===================================================================== */

import { useEffect, useState } from 'react';
import { useArmazenamentoLocalCheio } from '@/lib/cardapio/aviso-armazenamento';
import { useStatusNuvem } from '@/lib/cardapio/supabase';

/** Só vira banner depois de ficar em erro por tempo suficiente — evita
   piscar aviso a cada soluço de rede de 1-2s, que se resolve sozinho. */
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
        Não foi possível salvar — o armazenamento deste aparelho está cheio. A última alteração
        pode não ter sido gravada. Libere espaço no aparelho e tente de novo.
      </Banner>
    );
  }

  // Nuvem desligada (site publicado sem as credenciais). O app continua
  // funcionando, mas SÓ neste aparelho: nada é enviado nem recebido, e cada
  // pessoa enxerga apenas o que digitou. Isso precisa ser gritante — o
  // silêncio aqui é o que fez uma equipe inteira acreditar, por semanas, que
  // estava trabalhando no mesmo cardápio quando eram ilhas separadas.
  if (status === 'desligado') {
    return (
      <Banner cor="bg-perigo">
        Este aparelho NÃO está sincronizando — o que você digitar fica só aqui e ninguém mais vê.
        Confira em Ajustes → “A sincronização está funcionando?”.
      </Banner>
    );
  }

  if (status === 'erro' && erroSustentado) {
    return (
      <Banner cor="bg-alerta">
        Sem conexão com a nuvem{pendentes > 0 ? ` — ${pendentes} alteração(ões) deste aparelho ainda não chegou(aram) aos outros` : ''}.
        Está salvo aqui; verifique a internet para sincronizar.
      </Banner>
    );
  }

  return null;
}

function Banner({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      // Fica no fluxo normal (nem `fixed`, nem `sticky`): o cabeçalho do app
      // já é sticky em top-0, e uma faixa presa no topo acabava cobrindo a
      // busca e o botão "Sair". Aqui ela aparece no alto ao abrir — que é
      // quando precisa ser vista — sem disputar espaço com os controles.
      className={`${cor} px-4 py-2 text-center text-caption font-semibold text-white shadow-md print:hidden`}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      {children}
    </div>
  );
}
