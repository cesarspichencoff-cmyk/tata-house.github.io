'use client';

/* =====================================================================
   Radar de desperdício preditivo — aprende, semana a semana, quanto cada
   prato costuma sobrar e antecipa o desperdício dos pratos planejados para
   esta semana. Não é um relatório do passado: é uma previsão acionável.

   Integridade dimensional: registros em kg e porções nunca têm quantidades
   somadas. O padrão histórico usa a média das taxas de cada lançamento,
   que é adimensional e portanto comparável entre unidades.

   Integridade financeira: a economia prevista usa o custo por porção do
   próprio prato quando há cobertura culinária/preço suficiente. O House não
   aplica mais um custo médio genérico da semana a qualquer prato.
   ===================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { Cartao, Pilula, Secao } from '@/components/ui';
import { DIAS_SEMANA, formatarReais, normalizar } from '@/lib/cardapio/motor';
import { calcularCustoPrato } from '@/lib/cardapio/custo-prato';
import { taxaDesperdicioRegistro } from '@/lib/cardapio/desperdicio-metricas';
import { lerDesperdicio, semanasComConteudo } from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import type { EstadoSemana, RegistroDesperdicio } from '@/lib/cardapio/tipos';

interface Padrao {
  prato: string;
  ocasioes: number;
  somaTaxas: number;
  taxa: number;
}

interface Previsao {
  dia: number;
  prato: string;
  taxa: number;
  ocasioes: number;
  cortePct: number;
  custoEvitado: number | null;
  coberturaCusto: number;
}

export function RadarDesperdicio({
  estado,
  precos,
  fatores,
  registros,
}: {
  estado: EstadoSemana;
  precos: Record<string, number>;
  fatores?: Record<string, number>;
  registros: RegistroDesperdicio[];
}) {
  const [padroes, setPadroes] = useState<Map<string, Padrao>>(new Map());
  const { estimativas } = useEstimativas();

  // `fatores` permanece no contrato do componente porque o restante da tela
  // operacional já o fornece. O radar, porém, calcula custo diretamente da
  // receita do prato para não misturar um fator agregado com valor culinário.
  void fatores;

  // Aprende com todo o histórico, sem somar kg com porções. Cada lançamento
  // contribui com sua própria taxa de sobra (um percentual adimensional).
  useEffect(() => {
    const m = new Map<string, Padrao>();
    const semanas = semanasComConteudo();
    semanas.forEach((sid) => {
      lerDesperdicio(sid).forEach((r) => {
        const k = normalizar(r.prato);
        const taxa = taxaDesperdicioRegistro(r);
        if (!k || taxa == null) return;
        const prev = m.get(k) ?? { prato: r.prato, ocasioes: 0, somaTaxas: 0, taxa: 0 };
        prev.prato = r.prato;
        prev.ocasioes += 1;
        prev.somaTaxas += taxa;
        m.set(k, prev);
      });
    });
    m.forEach((p) => {
      p.taxa = p.ocasioes > 0 ? p.somaTaxas / p.ocasioes : 0;
    });
    setPadroes(m);
  }, [registros]);

  const previsoes = useMemo<Previsao[]>(() => {
    const out: Previsao[] = [];
    estado.dias.forEach((d, dia) => {
      if (!d.principal) return;
      const p = padroes.get(normalizar(d.principal));
      if (!p || p.ocasioes < 2 || p.taxa < 0.08) return;

      const cortePct = Math.min(40, Math.round(p.taxa * 100));
      const custo = calcularCustoPrato(d.principal, 'Principal', precos, d.pessoas, estimativas);
      const custoConfiavel = custo && custo.custoPorcao > 0 && custo.cobertura >= 0.4;

      out.push({
        dia,
        prato: d.principal,
        taxa: p.taxa,
        ocasioes: p.ocasioes,
        cortePct,
        custoEvitado: custoConfiavel ? custo.custoPorcao * d.pessoas * p.taxa : null,
        coberturaCusto: custo?.cobertura ?? 0,
      });
    });
    return out.sort((a, b) => b.taxa - a.taxa);
  }, [estado.dias, padroes, precos, estimativas]);

  const naSemana = new Set(estado.dias.map((d) => normalizar(d.principal)).filter(Boolean));
  const observar = useMemo(
    () =>
      Array.from(padroes.values())
        .filter((p) => p.ocasioes >= 2 && p.taxa >= 0.12 && !naSemana.has(normalizar(p.prato)))
        .sort((a, b) => b.taxa - a.taxa)
        .slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [padroes, estado.dias],
  );

  const previsoesValoradas = previsoes.filter((p) => p.custoEvitado != null);
  const custoEvitavel = previsoesValoradas.reduce((a, p) => a + (p.custoEvitado ?? 0), 0);

  if (padroes.size === 0) return null;

  const confianca = (n: number) => (n >= 5 ? 'alta' : n >= 3 ? 'média' : 'baixa');

  return (
    <Secao
      titulo="Radar preditivo de desperdício"
      acao={
        previsoesValoradas.length > 0 && custoEvitavel > 0 ? (
          <Pilula tom="verde">evita ≈ {formatarReais(custoEvitavel)}/sem</Pilula>
        ) : (
          <Pilula tom="azul">{padroes.size} pratos aprendidos</Pilula>
        )
      }
    >
      {previsoes.length === 0 ? (
        <Cartao className="space-y-1">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
            Nenhum risco previsto para os pratos desta semana.
          </p>
          <p className="text-caption text-texto-suave">
            O radar aprendeu com {padroes.size} prato(s) do histórico. Os pratos planejados não têm padrão de sobra relevante.
          </p>
        </Cartao>
      ) : (
        <div className="space-y-2">
          {previsoes.map((p) => (
            <Cartao key={p.dia} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  <span className="text-micro font-bold uppercase text-texto-suave">{DIAS_SEMANA[p.dia].slice(0, 3)}</span>{' '}
                  {p.prato}
                </p>
                <p className="text-rotulo text-carvao-500 dark:text-areia-200">
                  Costuma sobrar <strong>~{Math.round(p.taxa * 100)}%</strong> — produza{' '}
                  <strong>~{p.cortePct}% a menos</strong>
                  {p.custoEvitado != null ? <> e evite ≈ {formatarReais(p.custoEvitado)}</> : null}.
                </p>
                <p className="text-micro text-texto-suave">
                  confiança {confianca(p.ocasioes)} · {p.ocasioes} registro(s) · média de percentuais, sem somar kg e porções
                  {p.custoEvitado != null
                    ? ` · valor pelo custo do próprio prato (${Math.round(p.coberturaCusto * 100)}% de cobertura)`
                    : ' · valor em R$ omitido por falta de base de custo suficiente'}
                </p>
              </div>
              <Pilula tom={p.taxa >= 0.2 ? 'vermelho' : 'ouro'}>−{p.cortePct}%</Pilula>
            </Cartao>
          ))}
        </div>
      )}

      {observar.length > 0 && (
        <Cartao className="space-y-1.5 bg-areia-50/60 dark:bg-carvao-900/40">
          <p className="text-caption font-bold uppercase tracking-wider text-texto-suave">Vigiar quando voltarem</p>
          <ul className="space-y-1 text-rotulo">
            {observar.map((p) => (
              <li key={p.prato} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.prato}</span>
                <Pilula tom="ouro">~{Math.round(p.taxa * 100)}% de sobra</Pilula>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <p className="text-micro text-texto-suave">
        Previsões aprendidas dos seus lançamentos de sobra. Quanto mais você registrar, mais estável fica a estimativa. Valores em reais só aparecem quando a receita tem base de custo suficiente.
      </p>
    </Secao>
  );
}
