'use client';

/* =====================================================================
   Gastos — o quanto a casa está gastando, de verdade.

   Antes esta tela lia um arquivo estático de jan–mai/2026: entrava nota
   nova e o número não mexia. Agora ela soma duas fontes sem duplicar:
   a planilha histórica responde pelos meses que ela cobre, e as notas
   lidas no app respondem por tudo que veio depois.
   ===================================================================== */

import { Cartao, Pilula } from '@/components/ui';
import { formatarReais } from '@/lib/cardapio/motor';
import {
  useGastos,
  serieMensal,
  topItens as calcularTopItens,
  mesCorrente,
  ULTIMO_MES_PLANILHA,
} from '@/lib/cardapio/gastos';

const MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function rotuloMes(mes: string, curto = false): string {
  const [ano, m] = mes.split('-');
  const nome = MES_NOME[Number(m) - 1] ?? mes;
  return curto ? nome : `${nome}/${ano.slice(2)}`;
}

export function AbaGastos() {
  const { lancamentos } = useGastos();

  const serie = serieMensal(lancamentos);
  const top = calcularTopItens(lancamentos);
  const maxItem = top[0]?.t ?? 1;
  const maxMes = Math.max(...serie.map((m) => m.total), 1);
  const totalGeral = serie.reduce((s, m) => s + m.total, 0);
  const media = totalGeral / Math.max(1, serie.length);

  const mesAtual = mesCorrente();
  const doMesAtual = serie.find((m) => m.mes === mesAtual);
  const gastoMesAtual = doMesAtual?.total ?? 0;
  const vsMedia = media > 0 ? ((gastoMesAtual - media) / media) * 100 : 0;

  const mesesVivos = serie.filter((m) => m.fonte === 'app').length;
  const notasLidas = lancamentos.length;

  return (
    <div className="space-y-4">
      {/* Mês corrente em destaque — a pergunta operacional é "quanto já gastei?" */}
      <Cartao className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">
              Gasto de {rotuloMes(mesAtual)}
            </p>
            <p className="font-display text-3xl font-bold leading-tight tabular-nums">
              {formatarReais(gastoMesAtual)}
            </p>
          </div>
          {gastoMesAtual > 0 && (
            <Pilula tom={vsMedia > 10 ? 'vermelho' : vsMedia < -10 ? 'verde' : 'ouro'}>
              {vsMedia >= 0 ? '▲' : '▼'} {Math.abs(Math.round(vsMedia))}% vs média
            </Pilula>
          )}
        </div>
        <p className="text-[11px] text-texto-suave">
          {notasLidas > 0
            ? `${notasLidas} nota(s) lida(s) no app · média histórica ${formatarReais(media)}/mês`
            : 'Nenhuma nota lida ainda neste mês — leia uma NF na aba Notas para o gasto real aparecer aqui.'}
        </p>
      </Cartao>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { r: 'Total acumulado', v: formatarReais(totalGeral), sub: `${serie.length} meses` },
          { r: 'Média mensal', v: formatarReais(media), sub: 'todo o período' },
          { r: 'Maior mês', v: formatarReais(maxMes), sub: rotuloMes(serie.find((m) => m.total === maxMes)?.mes ?? '') },
          { r: 'Meses ao vivo', v: String(mesesVivos), sub: mesesVivos > 0 ? 'notas do app' : 'só planilha' },
        ].map((k) => (
          <Cartao key={k.r} className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">{k.r}</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums leading-tight">{k.v}</p>
            <p className="text-caption text-texto-suave">{k.sub}</p>
          </Cartao>
        ))}
      </div>

      {/* Gasto mensal */}
      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">Gasto mensal</p>
          <Pilula tom="ouro">{rotuloMes(serie[0]?.mes ?? '')} – {rotuloMes(serie[serie.length - 1]?.mes ?? '')}</Pilula>
        </div>
        <div className="space-y-2">
          {serie.map((m, idx) => {
            const pct = (m.total / maxMes) * 100;
            const isMaior = m.total === maxMes;
            const anterior = serie[idx - 1];
            const variacao = anterior && anterior.total > 0
              ? ((m.total - anterior.total) / anterior.total) * 100
              : null;
            return (
              <div key={m.mes} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-[11px] font-bold text-texto-suave">
                  {rotuloMes(m.mes, true)}
                </span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 22 }}>
                  <div
                    className={`h-full rounded-full transition-all ${
                      isMaior ? 'bg-ouro-400' : m.fonte === 'app' ? 'bg-brand-600' : 'bg-brand-400 dark:bg-brand-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs font-bold tabular-nums">
                  {formatarReais(m.total)}
                  {variacao !== null && (
                    <span className={`ml-1 text-[10px] font-normal ${variacao > 0 ? 'text-perigo' : 'text-brand-600'}`}>
                      {variacao > 0 ? '▲' : '▼'}{Math.abs(Math.round(variacao))}%
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-texto-suave">
          Barra escura = mês apurado pelas notas lidas no app. Barra clara = planilha histórica
          (até {rotuloMes(ULTIMO_MES_PLANILHA)}).
        </p>
      </Cartao>

      {/* Top itens por gasto total */}
      <Cartao className="space-y-3">
        <p className="text-sm font-bold">Itens que mais pesam no orçamento</p>
        <div className="space-y-2">
          {top.map((item, idx) => {
            const pct = (item.t / maxItem) * 100;
            const pctGasto = totalGeral > 0 ? (item.t / totalGeral) * 100 : 0;
            return (
              <div key={item.n} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-[10px] text-texto-suave">{idx + 1}</span>
                <span className="w-32 shrink-0 truncate text-xs font-semibold capitalize">{item.n}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-700/50" style={{ height: 16 }}>
                  <div className="h-full rounded-full bg-brand-300 dark:bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums">{formatarReais(item.t)}</span>
                <span className="w-8 shrink-0 text-right text-[10px] text-texto-suave">{pctGasto.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
        {top.length >= 2 && totalGeral > 0 && (
          <p className="text-[11px] text-texto-suave">
            <strong className="capitalize">{top[0].n}</strong> e{' '}
            <strong className="capitalize">{top[1].n}</strong> juntos representam{' '}
            <strong>{(((top[0].t + top[1].t) / totalGeral) * 100).toFixed(0)}%</strong> do gasto do período.
          </p>
        )}
      </Cartao>

      {/* Últimas notas lançadas */}
      {lancamentos.length > 0 && (
        <Cartao className="space-y-2">
          <p className="text-sm font-bold">Últimas notas lançadas</p>
          {lancamentos.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-carvao-100 pb-1.5 last:border-0 dark:border-carvao-700/50">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{l.fornecedor}</p>
                <p className="text-[10px] text-texto-suave">
                  {l.data.split('-').reverse().join('/')} · {l.itens.length} item(ns)
                </p>
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums">{formatarReais(l.total)}</span>
            </div>
          ))}
        </Cartao>
      )}
    </div>
  );
}
