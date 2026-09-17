'use client';

import { useMemo } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import { converterParaUnidadeBase, formatarReais, linhasDoDia } from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import {
  useGastos,
  serieMensal,
  topItens as calcularTopItens,
  mesCorrente,
  ULTIMO_MES_PLANILHA,
} from '@/lib/cardapio/gastos';
import type { EstadoSemana } from '@/lib/cardapio/tipos';

const MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function rotuloMes(mes: string, curto = false): string {
  const [ano, m] = mes.split('-');
  const nome = MES_NOME[Number(m) - 1] ?? mes;
  return curto ? nome : `${nome}/${ano.slice(2)}`;
}

export function AbaGastos({
  estado,
  semanaId,
  precos,
  fatores,
}: {
  estado: EstadoSemana;
  semanaId: string;
  precos: Record<string, number>;
  fatores?: Record<string, number>;
}) {
  const { lancamentos } = useGastos();
  const { estimativas } = useEstimativas();

  const serie = serieMensal(lancamentos);
  const top = calcularTopItens(lancamentos);
  const maxItem = top[0]?.t ?? 1;
  const maxMes = Math.max(...serie.map((m) => m.total), 1);
  const totalGeral = serie.reduce((s, m) => s + m.total, 0);
  const media = totalGeral / Math.max(1, serie.length);

  const mesAtual = mesCorrente();
  const lancamentosMes = lancamentos.filter((l) => l.data.startsWith(mesAtual));
  const nfsMes = lancamentosMes.filter((l) => l.origem === 'nf');
  const manuaisMes = lancamentosMes.filter((l) => l.origem === 'manual');
  const totalNfMes = nfsMes.reduce((s, l) => s + l.total, 0);
  const totalManualMes = manuaisMes.reduce((s, l) => s + l.total, 0);
  const mesesVivos = serie.filter((m) => m.fonte === 'app').length;

  const operacaoSemana = useMemo(() => {
    let planejado = 0;
    let comprasComPrecoPago = 0;
    let comprasComEstimativa = 0;
    let itensComprados = 0;
    let itensComPrecoPago = 0;

    for (let di = 0; di < 7; di += 1) {
      for (const linha of linhasDoDia(estado, di, fatores)) {
        const resolvido = resolverPreco(linha.chave, precos, estimativas);
        if (resolvido.valor > 0) {
          planejado += resolvido.valor * converterParaUnidadeBase(linha.qtd, linha.unid);
        }
        if (!linha.status.compradoEm) continue;
        itensComprados += 1;
        const qtd = linha.status.compradoQtd ?? linha.qtd;
        const qtdBase = converterParaUnidadeBase(qtd, linha.unid);
        if ((linha.status.precoPago ?? 0) > 0) {
          comprasComPrecoPago += linha.status.precoPago! * qtdBase;
          itensComPrecoPago += 1;
        } else if (resolvido.valor > 0) {
          comprasComEstimativa += resolvido.valor * qtdBase;
        }
      }
    }

    const comprasRegistradas = comprasComPrecoPago + comprasComEstimativa;
    const coberturaPrecoReal = itensComprados > 0 ? itensComPrecoPago / itensComprados : 0;
    return { planejado, comprasRegistradas, comprasComPrecoPago, comprasComEstimativa, itensComprados, itensComPrecoPago, coberturaPrecoReal };
  }, [estado, fatores, precos, estimativas, semanaId]);

  const ultimaAtualizacao = useMemo(() => {
    const marcas = [
      ...lancamentos.map((l) => l.em),
      ...Object.values(estado.status)
        .flatMap((dia) => Object.values(dia))
        .map((s) => s.compradoEm)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ].filter(Boolean).sort();
    const iso = marcas[marcas.length - 1];
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [lancamentos, estado.status]);

  return (
    <div className="space-y-4">
      <Cartao className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Financeiro vivo · {rotuloMes(mesAtual)}</p>
            <p className="font-display text-3xl font-bold leading-tight tabular-nums">{formatarReais(totalNfMes)}</p>
            <p className="mt-1 text-xs font-semibold text-carvao-600 dark:text-areia-200">NF comprovadas no mês</p>
          </div>
          <Pilula tom={totalNfMes > 0 ? 'verde' : 'ouro'}>{totalNfMes > 0 ? `${nfsMes.length} NF` : 'mês em formação'}</Pilula>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-carvao-50 p-3 dark:bg-carvao-800/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Compras registradas · semana</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatarReais(operacaoSemana.comprasRegistradas)}</p>
            <p className="text-[10px] text-texto-suave">{operacaoSemana.itensComprados} itens · {Math.round(operacaoSemana.coberturaPrecoReal * 100)}% com preço pago</p>
          </div>
          <div className="rounded-2xl bg-carvao-50 p-3 dark:bg-carvao-800/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">Planejado · semana</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatarReais(operacaoSemana.planejado)}</p>
            <p className="text-[10px] text-texto-suave">custo calculado com a melhor evidência disponível</p>
          </div>
        </div>
        <p className="text-[11px] leading-5 text-texto-suave">
          {totalNfMes === 0 && operacaoSemana.itensComprados > 0
            ? 'Há operação de compra nesta semana, mas nenhuma NF comprovada no mês ainda. O painel não transforma ausência de NF em ausência de gasto.'
            : totalNfMes === 0
              ? 'Ainda não há NF comprovada neste mês. Valores operacionais aparecem assim que compras/preços forem registrados.'
              : `Comprovado por ${nfsMes.length} NF(s) neste mês${totalManualMes > 0 ? ` · ${formatarReais(totalManualMes)} em lançamentos manuais separados` : ''}.`}
          {ultimaAtualizacao ? ` · Última atualização ${ultimaAtualizacao}.` : ''}
        </p>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { r: 'NF comprovada', v: formatarReais(totalNfMes), sub: `${nfsMes.length} no mês` },
          { r: 'Preço pago', v: formatarReais(operacaoSemana.comprasComPrecoPago), sub: `${operacaoSemana.itensComPrecoPago}/${operacaoSemana.itensComprados} compras` },
          { r: 'Estimado na compra', v: formatarReais(operacaoSemana.comprasComEstimativa), sub: 'onde falta preço pago' },
          { r: 'Histórico acumulado', v: formatarReais(totalGeral), sub: `${serie.length} meses` },
        ].map((k) => (
          <Cartao key={k.r} className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">{k.r}</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums leading-tight">{k.v}</p>
            <p className="text-caption text-texto-suave">{k.sub}</p>
          </Cartao>
        ))}
      </div>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">Evolução mensal</p>
          <Pilula tom="ouro">histórico + app</Pilula>
        </div>
        <div className="space-y-2">
          {serie.map((m, idx) => {
            const pct = (m.total / maxMes) * 100;
            const isMaior = m.total === maxMes;
            const anterior = serie[idx - 1];
            const variacao = anterior && anterior.total > 0 ? ((m.total - anterior.total) / anterior.total) * 100 : null;
            return (
              <div key={m.mes} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-[11px] font-bold text-texto-suave">{rotuloMes(m.mes, true)}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 22 }}>
                  <div className={`h-full rounded-full transition-all ${isMaior ? 'bg-ouro-400' : m.fonte === 'app' ? 'bg-brand-600' : 'bg-brand-400 dark:bg-brand-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs font-bold tabular-nums">
                  {formatarReais(m.total)}
                  {variacao !== null && <span className={`ml-1 text-[10px] font-normal ${variacao > 0 ? 'text-perigo' : 'text-brand-600'}`}>{variacao > 0 ? '▲' : '▼'}{Math.abs(Math.round(variacao))}%</span>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-texto-suave">
          Verde forte = mês com dados do app. Verde claro = planilha histórica até {rotuloMes(ULTIMO_MES_PLANILHA)}. Histórico é contexto; o bloco acima mostra a operação atual e sua cobertura.
        </p>
      </Cartao>

      {top.length > 0 && (
        <Cartao className="space-y-3">
          <p className="text-sm font-bold">Itens que mais pesam no histórico financeiro</p>
          <div className="space-y-2">
            {top.map((item, idx) => {
              const pct = (item.t / maxItem) * 100;
              return (
                <div key={item.n} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-right text-[10px] text-texto-suave">{idx + 1}</span>
                  <span className="w-32 shrink-0 truncate text-xs font-semibold capitalize">{item.n}</span>
                  <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 16 }}>
                    <div className="h-full rounded-full bg-brand-300 dark:bg-brand-600" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums">{formatarReais(item.t)}</span>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      {lancamentosMes.length > 0 && (
        <Cartao className="space-y-2">
          <p className="text-sm font-bold">Lançamentos deste mês</p>
          {lancamentosMes.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-carvao-100 pb-1.5 last:border-0 dark:border-carvao-700/50">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{l.fornecedor}</p>
                <p className="text-[10px] text-texto-suave">{l.data.split('-').reverse().join('/')} · {l.origem === 'nf' ? 'NF comprovada' : 'manual'} · {l.itens.length} item(ns)</p>
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums">{formatarReais(l.total)}</span>
            </div>
          ))}
        </Cartao>
      )}

      {mesesVivos === 0 && (
        <p className="px-1 text-[11px] leading-5 text-texto-suave">O histórico anterior continua disponível, mas ainda não há mês fechado pelo app. Isso não bloqueia a leitura operacional da semana acima.</p>
      )}
    </div>
  );
}
