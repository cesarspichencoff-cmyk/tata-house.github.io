'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';
import { Botao } from '@/components/ui';
import { PERFIS, useLogin } from '@/lib/cardapio/login';
import { zerarAvaliacoesPratos } from '@/lib/cardapio/estado';
import { DiagnosticoNuvem } from '@/components/cardapio/DiagnosticoNuvem';

export function Configuracoes() {
  const { definirPin } = useLogin();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [confirmarZerar, setConfirmarZerar] = useState(false);

  const zerar = () => {
    zerarAvaliacoesPratos();
    setConfirmarZerar(false);
    toast('Avaliações de prato zeradas — pronto para começar do zero');
  };

  const salvar = async (id: string, rotulo: string) => {
    const v = (pins[id] ?? '').trim();
    if (v.length < 4) {
      toast('Use um PIN de pelo menos 4 dígitos', 'erro');
      return;
    }
    await definirPin(id as never, v);
    toast(`PIN de ${rotulo} atualizado`);
    setPins((s) => ({ ...s, [id]: '' }));
  };

  return (
    <div className="space-y-4">
      <DiagnosticoNuvem />

      <div className="flex items-start gap-3 rounded-2xl bg-carvao-50 px-4 py-3.5 dark:bg-carvao-800/50">
        <span className="text-xl">🔒</span>
        <div>
          <p className="text-sm font-bold text-carvao-900 dark:text-white">Área segura</p>
          <p className="text-xs text-carvao-500 dark:text-areia-400">Substitua os PINs padrão. Compartilhe somente com quem precisa de acesso.</p>
        </div>
      </div>

      {PERFIS.map((p, i) => {
        const isPrimario = i === 0;
        return (
          <div
            key={p.id}
            className={`rounded-2xl p-4 ${
              isPrimario
                ? 'bg-brand-50 ring-1 ring-brand-200/60 dark:bg-carvao-800/80 dark:ring-brand-700/40'
                : 'bg-carvao-50 dark:bg-carvao-800/40'
            }`}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-extrabold ${isPrimario ? 'text-brand-800 dark:text-brand-300' : 'text-carvao-700 dark:text-areia-200'}`}>
                  {p.icone} {p.rotulo}
                </p>
                <span className="text-micro font-semibold text-carvao-400 dark:text-carvao-500">
                  padrão: {p.pinPadrao}
                </span>
              </div>
              {isPrimario && (
                <p className="mt-0.5 text-caption text-carvao-500 dark:text-areia-400">
                  Acesso total ao sistema — substitua o padrão antes de distribuir.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-caption font-semibold text-carvao-500">Novo PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pins[p.id] ?? ''}
                  onChange={(e) => setPins((s) => ({ ...s, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && salvar(p.id, p.rotulo)}
                  placeholder="mínimo 4 dígitos"
                  className="w-full rounded-xl border border-carvao-200 bg-white px-3 py-2.5 text-base font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal dark:border-carvao-600 dark:bg-carvao-900"
                />
              </div>
              <div className="flex items-end">
                <Botao
                  variante={isPrimario ? 'primario' : 'secundario'}
                  className="!min-h-[42px] !px-4 !py-2 text-sm"
                  onClick={() => salvar(p.id, p.rotulo)}
                >
                  Salvar
                </Botao>
              </div>
            </div>
          </div>
        );
      })}

      {/* Começar do zero — limpa as avaliações de teste */}
      <div className="rounded-2xl border border-perigo/25 bg-perigo/5 p-4">
        <p className="text-sm font-extrabold text-perigo">Começar do zero</p>
        <p className="mt-0.5 text-caption text-carvao-500 dark:text-areia-400">
          Zera as avaliações de prato (bom/ok/ruim) usadas nos testes. O histórico
          e o DNA da casa não são afetados. Sincroniza para todos os aparelhos.
        </p>
        <div className="mt-3">
          {!confirmarZerar ? (
            <Botao variante="secundario" className="!min-h-[42px] !px-4 !py-2 text-sm" onClick={() => setConfirmarZerar(true)}>
              Zerar avaliações
            </Botao>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-caption font-semibold text-carvao-600 dark:text-areia-300">Tem certeza?</span>
              <button onClick={zerar} className="rounded-xl bg-perigo px-4 py-2 text-sm font-bold text-white">
                Sim, zerar
              </button>
              <button onClick={() => setConfirmarZerar(false)} className="rounded-xl bg-carvao-100 px-3 py-2 text-sm dark:bg-carvao-700">
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
