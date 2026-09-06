'use client';

import { Icone, type NomeIcone } from './Icones';

export interface Grupo {
  id: NomeIcone;
  rotulo: string;
  abas: string[];
}

export const GRUPOS: Grupo[] = [
  { id: 'painel',   rotulo: 'Hoje',      abas: ['agora']      },
  { id: 'cardapio', rotulo: 'Planejar',  abas: ['cardapio']   },
  { id: 'compras',  rotulo: 'Abastecer', abas: ['compras']    },
  { id: 'insights', rotulo: 'Analisar',  abas: ['relatorios'] },
  { id: 'ajustes',  rotulo: 'Gestão',    abas: ['ajustes']    },
];

export function BottomNav({
  grupoAtivo,
  aoSelecionar,
  grupos = GRUPOS,
}: {
  grupoAtivo: string;
  aoSelecionar: (grupoId: string) => void;
  grupos?: Grupo[];
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-carvao-100 bg-white lg:hidden dark:border-carvao-800 dark:bg-carvao-950 print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-between">
        {grupos.map((g) => {
          const ativo = g.id === grupoAtivo;
          return (
            <button
              key={g.id}
              onClick={() => aoSelecionar(g.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-1 pb-2 transition-colors ${
                ativo ? 'text-brand-600 dark:text-brand-400' : 'text-texto-suave dark:text-carvao-600'
              }`}
            >
              <span className={`h-[3px] w-5 rounded-full transition-all ${ativo ? 'bg-brand-600 dark:bg-brand-400' : 'bg-transparent'}`} />
              <span className="flex h-7 w-7 items-center justify-center">
                <Icone nome={g.id} tam={20} />
              </span>
              <span className="text-micro font-semibold">{g.rotulo}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
