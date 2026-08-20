'use client';

/* =====================================================================
   Painel "A sincronização está funcionando?" — dentro de Ajustes.
   Um botão, resposta em português. Serve para a equipe conferir sozinha
   e para mandar o resultado a quem dá suporte, sem abrir painel nenhum.
   ===================================================================== */

import { useState } from 'react';
import { Botao } from '@/components/ui';
import { toast } from '@/components/Toast';
import {
  rodarDiagnostico,
  formatarDiagnostico,
  type ResultadoDiagnostico,
  type Veredito,
} from '@/lib/cardapio/supabase/diagnostico';

const ESTILO: Record<Veredito, { fundo: string; icone: string; rotulo: string }> = {
  ok: { fundo: 'bg-brand-50 dark:bg-brand-900/20', icone: '✅', rotulo: 'Funcionando' },
  aviso: { fundo: 'bg-alerta/10', icone: '⚠️', rotulo: 'Atenção' },
  falha: { fundo: 'bg-perigo/10', icone: '⛔', rotulo: 'Problema' },
};

export function DiagnosticoNuvem() {
  const [resultado, setResultado] = useState<ResultadoDiagnostico | null>(null);
  const [rodando, setRodando] = useState(false);

  const executar = async () => {
    setRodando(true);
    try {
      setResultado(await rodarDiagnostico());
    } catch {
      toast('Não foi possível concluir o diagnóstico', 'erro');
    } finally {
      setRodando(false);
    }
  };

  const copiar = async () => {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(formatarDiagnostico(resultado));
      toast('Diagnóstico copiado — pode colar e enviar');
    } catch {
      toast('Não foi possível copiar neste aparelho', 'erro');
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-carvao-50 px-4 py-3.5 dark:bg-carvao-800/50">
      <div>
        <p className="text-sm font-bold text-carvao-900 dark:text-white">
          A sincronização está funcionando?
        </p>
        <p className="text-xs text-carvao-500 dark:text-areia-400">
          Confere se este aparelho realmente conversa com a nuvem — ou se está trabalhando sozinho.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao onClick={executar} disabled={rodando}>
          {rodando ? 'Verificando…' : 'Verificar agora'}
        </Botao>
        {resultado && (
          <Botao variante="secundario" onClick={copiar}>
            Copiar resultado
          </Botao>
        )}
      </div>

      {resultado && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-carvao-900 dark:text-white">{resultado.resumo}</p>
          {resultado.itens.map((item, i) => {
            const e = ESTILO[item.veredito];
            return (
              <div key={i} className={`rounded-xl px-3 py-2.5 ${e.fundo}`}>
                <p className="text-xs font-bold text-carvao-900 dark:text-white">
                  {e.icone} {item.titulo} — {e.rotulo}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-carvao-600 dark:text-areia-300">
                  {item.detalhe}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
