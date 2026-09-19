'use client';

import { useState } from 'react';
import { Botao } from '@/components/ui';
import { toast } from '@/components/Toast';
import {
  arquivoPacoteNotasBenchmark,
  coletarPacoteNotasBenchmark,
  entregarArquivoNotasBenchmark,
} from '@/lib/cardapio/exportar-notas-benchmark';

export function ExportadorNotasBenchmark() {
  const [ocupado, setOcupado] = useState(false);
  const [ultimoTotal, setUltimoTotal] = useState<number | null>(null);

  const exportar = async () => {
    setOcupado(true);
    try {
      const pacote = await coletarPacoteNotasBenchmark();
      setUltimoTotal(pacote.notes.length);

      if (pacote.notes.length === 0) {
        toast('Nenhuma foto de nota fiscal encontrada neste aparelho', 'erro');
        return;
      }

      const arquivo = arquivoPacoteNotasBenchmark(pacote);
      await entregarArquivoNotasBenchmark(arquivo);
      toast(`${pacote.notes.length} nota(s) preparada(s) em arquivo local`);
    } catch {
      toast('Não foi possível preparar as notas neste aparelho', 'erro');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-brand-200/70 bg-brand-50/60 p-4 dark:border-brand-800/50 dark:bg-brand-950/20">
      <div>
        <p className="text-sm font-extrabold text-carvao-900 dark:text-white">Notas para benchmark de leitura</p>
        <p className="mt-1 text-xs leading-relaxed text-carvao-500 dark:text-areia-400">
          Lê somente as fotos de notas guardadas neste aparelho e prepara um arquivo local.
          Não altera cardápio, compras, estoque ou nuvem e não envia nada automaticamente.
        </p>
      </div>
      <Botao onClick={exportar} disabled={ocupado}>
        {ocupado ? 'Preparando…' : 'Exportar fotos das notas'}
      </Botao>
      {ultimoTotal !== null && (
        <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">
          Última leitura: {ultimoTotal} foto{ultimoTotal === 1 ? '' : 's'} encontrada{ultimoTotal === 1 ? '' : 's'}.
        </p>
      )}
      <p className="text-micro text-carvao-400">
        O arquivo contém apenas imagem da nota, semana/dias vinculados, data de anexação quando disponível e hash técnico para remover duplicatas.
      </p>
    </div>
  );
}
