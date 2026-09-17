from pathlib import Path

branch_file = Path('src/components/cardapio/PlanejadorGovernanca.tsx')
s = branch_file.read_text(encoding='utf-8')

s = s.replace("  usePrecos,\n  useSemana,\n} from '@/lib/cardapio/estado';", "  usePrecos,\n} from '@/lib/cardapio/estado';", 1)
if "use-semana-governanca-shadow" not in s:
    s = s.replace("import { useEstimativas } from '@/lib/cardapio/estimativas';\n", "import { useEstimativas } from '@/lib/cardapio/estimativas';\nimport { useSemanaGovernancaShadow } from '@/lib/cardapio/use-semana-governanca-shadow';\n", 1)
s = s.replace("const { estado, atualizar, pronto } = useSemana(contexto.semanaId);", "const { estado, atualizar, pronto } = useSemanaGovernancaShadow(contexto.semanaId);", 1)
branch_file.write_text(s, encoding='utf-8')

Path('src/lib/cardapio/governanca-shadow.ts').write_text("""import type { EstadoSemana } from './tipos';

/**
 * Cria um rascunho totalmente destacado da semana operacional.
 * A superfície de Governança pode ler o estado real como ponto de partida,
 * mas qualquer edição posterior permanece em memória até ser enviada como proposta.
 */
export function clonarSemanaParaRascunho(estado: EstadoSemana): EstadoSemana {
  return JSON.parse(JSON.stringify(estado)) as EstadoSemana;
}
""", encoding='utf-8')

Path('src/lib/cardapio/use-semana-governanca-shadow.ts').write_text("""'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSemana } from './estado';
import { clonarSemanaParaRascunho } from './governanca-shadow';
import type { EstadoSemana } from './tipos';

/**
 * Wrapper de coexistência House → Líderes.
 * Lê a semana operacional somente como ponto de partida e destaca uma cópia em memória.
 * O atualizar retornado nunca chama o updater persistente de useSemana.
 */
export function useSemanaGovernancaShadow(semanaId: string) {
  const { estado: operacional, pronto: operacionalPronto } = useSemana(semanaId);
  const [rascunho, setRascunho] = useState<EstadoSemana | null>(null);
  const inicializado = useRef(false);

  useEffect(() => {
    if (!operacionalPronto || inicializado.current) return;
    inicializado.current = true;
    setRascunho(clonarSemanaParaRascunho(operacional));
  }, [operacionalPronto, operacional]);

  const atualizar = useCallback((fn: (atual: EstadoSemana) => EstadoSemana) => {
    setRascunho((atual) => (atual ? fn(atual) : atual));
  }, []);

  return {
    estado: rascunho ?? operacional,
    atualizar,
    pronto: operacionalPronto && rascunho !== null,
  };
}
""", encoding='utf-8')

Path('src/lib/cardapio/governanca-shadow.test.ts').write_text("""import { describe, expect, it } from 'vitest';
import { clonarSemanaParaRascunho } from './governanca-shadow';
import type { EstadoSemana } from './tipos';

function estadoFixture(): EstadoSemana {
  return {
    versao: 1,
    orcamento: 3500,
    dias: Array.from({ length: 7 }, (_, i) => ({
      pessoas: 60 + i,
      principal: i === 0 ? 'Frango grelhado' : '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    etapa: 'compras',
    historico: [{ etapa: 'cozinha', em: '2026-09-15T10:00:00.000Z', papel: 'gestor' }],
    ajustes: { 0: { frango: { qtd: 99 } } },
    manuais: { 0: [{ item: 'Item operacional', qtd: 2, unid: 'kg' }] },
    status: { 0: { frango: { compradoQtd: 4 } } },
    obsCozinha: 'estado em uso pelo House',
    refeicoes: { 0: 58 },
  };
}

describe('governanca-shadow', () => {
  it('destaca o rascunho do estado operacional antes de qualquer edição', () => {
    const operacional = estadoFixture();
    const rascunho = clonarSemanaParaRascunho(operacional);

    expect(rascunho).toEqual(operacional);
    expect(rascunho).not.toBe(operacional);
    expect(rascunho.dias).not.toBe(operacional.dias);
    expect(rascunho.ajustes).not.toBe(operacional.ajustes);
    expect(rascunho.manuais).not.toBe(operacional.manuais);

    rascunho.dias[0].principal = 'Bife acebolado';
    rascunho.ajustes = {};
    rascunho.manuais = {};
    rascunho.status = {};

    expect(operacional.dias[0].principal).toBe('Frango grelhado');
    expect(operacional.ajustes[0]?.frango?.qtd).toBe(99);
    expect(operacional.manuais[0]?.[0]?.item).toBe('Item operacional');
    expect(operacional.status[0]?.frango?.compradoQtd).toBe(4);
  });
});
""", encoding='utf-8')
