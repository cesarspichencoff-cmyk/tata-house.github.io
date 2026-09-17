'use client';

import { useMemo } from 'react';
import { CenariosGovernanca } from './CenariosGovernanca';
import {
  datasDaSemana,
  lerDesperdicio,
  lerSemana,
  semanaVazia,
  semanasComConteudo,
  useAceitacao,
  useEstoque,
  useEventos,
  useFuncionarios,
  useHistoricoPrecos,
} from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { normalizar } from '@/lib/cardapio/motor';
import { restricoesLocaisAgregadas } from '@/lib/cardapio/governanca-restricoes';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

/**
 * Superfície canônica de planejamento do House standalone.
 * Usa o mesmo motor multiobjetivo do fluxo de Governança; a integração externa
 * pode acrescentar evidência oficial, mas não existe mais um "cérebro antigo"
 * diferente para a operação cotidiana.
 */
export function PlanejadorHouse({
  estado,
  atualizar,
  semanaId,
  precos,
  fatores,
}: {
  estado: EstadoSemana;
  atualizar: (fn: (estado: EstadoSemana) => EstadoSemana) => void;
  semanaId: string;
  precos: Record<string, number>;
  fatores?: Record<string, number>;
}) {
  const { estimativas } = useEstimativas();
  const { aceitacao } = useAceitacao();
  const { estoque } = useEstoque();
  const { eventos } = useEventos();
  const { funcionarios } = useFuncionarios();
  const historicoPrecos = useHistoricoPrecos();

  const frequencia = useMemo(() => {
    const cont: Record<string, number> = {};
    semanasComConteudo()
      .filter((sid) => sid !== semanaId)
      .sort()
      .slice(-4)
      .forEach((sid) => {
        lerSemana(sid).dias.forEach((dia) => {
          if (!dia.principal) return;
          const chave = normalizar(dia.principal);
          cont[chave] = (cont[chave] ?? 0) + 1;
        });
      });
    return cont;
  }, [semanaId, estado]);

  const estoqueQuantidade = useMemo(
    () => Object.fromEntries(Object.entries(estoque).map(([chave, item]) => [chave, item.qtd])),
    [estoque],
  );
  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);
  const baselineAutomatico = useMemo(() => semanaVazia().dias.map((d) => d.pessoas), []);
  const datasSemana = useMemo(() => datasDaSemana(semanaId).map((d) => d.toISOString().slice(0, 10)), [semanaId]);
  const desperdicioHistorico = useMemo(
    () => semanasComConteudo().flatMap((sid) => lerDesperdicio(sid)),
    [semanaId, estado],
  );

  return (
    <CenariosGovernanca
      estado={estado}
      atualizar={atualizar}
      precos={precos}
      estimativas={estimativas}
      fatores={fatores}
      aceitacao={aceitacao}
      frequencia={frequencia}
      estoque={estoqueQuantidade}
      restricoesEquipe={restricoesEquipe}
      desperdicioHistorico={desperdicioHistorico}
      historicoPrecos={historicoPrecos}
      baselineAutomatico={baselineAutomatico}
      eventos={eventos}
      datasSemana={datasSemana}
    />
  );
}
