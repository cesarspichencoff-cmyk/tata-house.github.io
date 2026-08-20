'use client';

/* =====================================================================
   Botão "Restaurar" — volta a semana para uma versão anterior.
   Existe porque uma semana pode mudar sozinha (outro aparelho, uma
   reconciliação infeliz da nuvem) e redigitar tudo não é aceitável.
   ===================================================================== */

import { useEffect, useState } from 'react';
import { Botao } from '@/components/ui';
import { toast } from '@/components/Toast';
import { lerVersoes, registrarVersao, resumirVersao, type VersaoSemana } from '@/lib/cardapio/historico-semana';
import { supabaseHabilitado } from '@/lib/cardapio/supabase';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoricoSemana({
  semanaId,
  estado,
  aoRestaurar,
  podeEditar,
}: {
  semanaId: string;
  estado: EstadoSemana;
  aoRestaurar: (estado: EstadoSemana) => void;
  podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [versoes, setVersoes] = useState<VersaoSemana[]>([]);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  const recarregar = () => setVersoes(lerVersoes('semana.' + semanaId));

  useEffect(() => {
    if (aberto) recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, semanaId]);

  useEffect(() => {
    setAberto(false);
  }, [semanaId]);

  if (!podeEditar) return null;

  const restaurar = (v: VersaoSemana) => {
    aoRestaurar(v.estado);
    setAberto(false);
    toast(`Cardápio restaurado para a versão de ${quando(v.em)}`);
  };

  /**
   * "Salvar cardápio": confirma que está guardado e cria um ponto de retorno
   * nomeado. O app já salva sozinho a cada alteração — o valor daqui é a
   * confirmação explícita ("terminei, está salvo") e o marco para restaurar.
   * Regravar o documento também reempurra a semana para a nuvem.
   */
  const salvar = () => {
    registrarVersao('semana.' + semanaId, estado, 'marco');
    aoRestaurar(estado); // regrava o estado atual → sincroniza e confirma
    recarregar();
    const agora = new Date();
    setSalvoEm(agora.toISOString());
    toast(
      supabaseHabilitado()
        ? `Cardápio salvo às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — enviado para os outros aparelhos`
        : `Cardápio salvo às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} neste aparelho`,
    );
  };

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Botao onClick={salvar}>Salvar cardápio</Botao>
        {salvoEm && (
          <span className="text-caption font-semibold text-brand-700 dark:text-brand-300">
            ✓ salvo às {quando(salvoEm).split(' ').pop()}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        className="text-caption font-semibold text-carvao-500 underline underline-offset-2 hover:text-carvao-800 dark:text-texto-suave dark:hover:text-white"
      >
        {aberto ? 'Fechar histórico' : 'Restaurar versão anterior'}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-2xl bg-carvao-50 p-3 dark:bg-carvao-800/50">
          {versoes.length === 0 ? (
            <p className="text-xs text-carvao-500 dark:text-areia-400">
              Ainda não há versões guardadas desta semana neste aparelho. A partir de agora, toda
              alteração passa a guardar uma cópia do que existia antes.
            </p>
          ) : (
            versoes.map((v, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl bg-white p-2.5 dark:bg-carvao-900/60"
              >
                <div>
                  <p className="text-xs font-bold text-carvao-900 dark:text-white">
                    {quando(v.em)}{' '}
                    <span className="font-normal text-carvao-500 dark:text-areia-400">
                      · {v.origem === 'marco' ? 'salvo por você' : v.origem === 'nuvem' ? 'antes de mudar pela nuvem' : 'antes de uma edição aqui'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-carvao-600 dark:text-areia-300">
                    {resumirVersao(v) || '(sem pratos preenchidos)'}
                  </p>
                </div>
                <div>
                  <Botao variante="secundario" onClick={() => restaurar(v)}>
                    Restaurar esta
                  </Botao>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
