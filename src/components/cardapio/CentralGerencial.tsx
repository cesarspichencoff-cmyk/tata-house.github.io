'use client';

/* =====================================================================
   Central Gerencial — visão executiva com exportação CSV.
   Não depende de nenhuma biblioteca externa: usa URL.createObjectURL
   com Blob para download de CSV (compatível com Excel / Sheets).
   ===================================================================== */

import { useMemo, useState } from 'react';
import { Cartao } from '@/components/ui';
import { Icone } from '@/components/Icones';
import {
  DIAS_SEMANA,
  converterParaUnidadeBase,
  formatarReais,
  linhasDoDia,
  normalizar,
} from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import {
  useAuditoria,
  semanasComConteudo,
  lerSemana,
  datasDaSemana,
  periodoSemana,
} from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { indiceNutricionalSemana } from '@/lib/cardapio/nutricao-prato';
import type { EstadoSemana, HistoricoPrecos, Aceitacao } from '@/lib/cardapio/tipos';

function baixarCsv(nome: string, linhas: string[][]) {
  const bom = '﻿'; // BOM para Excel reconhecer UTF-8
  const conteudo = bom + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CentralGerencial({
  estado,
  semanaId,
  precos,
  historico,
  aceitacao,
  fornecedores,
  fatores,
}: {
  estado: EstadoSemana;
  semanaId: string;
  precos: Record<string, number>;
  historico: HistoricoPrecos;
  aceitacao: Aceitacao;
  fornecedores: Record<string, string>;
  fatores?: Record<string, number>;
}) {
  const { registros: auditoria } = useAuditoria();
  const { estimativas } = useEstimativas();
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'tudo'>('semana');

  /* Semanas do período selecionado */
  const semanaIds = useMemo(() => {
    const todas = semanasComConteudo();
    if (periodo === 'semana') return [semanaId];
    if (periodo === 'mes') return todas.slice(-4);
    return todas;
  }, [periodo, semanaId]);

  /* KPIs agregados */
  const kpis = useMemo(() => {
    let custoTotal = 0;
    let itensComprados = 0;
    let itensRecebidos = 0;
    let totalRefeicoes = 0;

    for (const sid of semanaIds) {
      const s = lerSemana(sid);
      for (let di = 0; di < 7; di++) {
        const linhas = linhasDoDia(s, di, fatores);
        linhas.forEach((l) => {
          if (l.status.compradoEm) {
            itensComprados++;
            if (l.status.precoPago) {
              custoTotal += l.status.precoPago * converterParaUnidadeBase(l.status.compradoQtd ?? l.qtd, l.unid);
            } else {
              const preco = resolverPreco(l.chave, precos, estimativas).valor;
              if (preco > 0) custoTotal += preco * converterParaUnidadeBase(l.qtd, l.unid);
            }
          }
          if (l.status.recebidoOk) itensRecebidos++;
        });
        totalRefeicoes += s.refeicoes?.[di] ?? 0;
      }
    }

    return { custoTotal, itensComprados, itensRecebidos, totalRefeicoes, semanas: semanaIds.length };
  }, [semanaIds, precos, estimativas, fatores]);

  /* Índice nutricional da semana atual */
  const nutri = useMemo(() => indiceNutricionalSemana(estado.dias), [estado.dias]);

  /* ---- Funções de exportação ---- */

  const exportarCompras = () => {
    const rows: string[][] = [['Semana', 'Dia', 'Item', 'Qtd Sugerida', 'Unid', 'Qtd Comprada', 'Preço Pago', 'Qtd Recebida', 'OK', 'Observação']];
    for (const sid of semanaIds) {
      const s = lerSemana(sid);
      const per = periodoSemana(sid);
      for (let di = 0; di < 7; di++) {
        linhasDoDia(s, di, fatores).forEach((l) => {
          const adj = s.ajustes[di]?.[l.chave];
          rows.push([
            per, DIAS_SEMANA[di], l.item,
            String(l.sugerida ?? ''), l.unid,
            String(l.status.compradoQtd ?? ''),
            l.status.precoPago ? String(l.status.precoPago) : '',
            String(l.status.recebidoQtd ?? ''),
            l.status.recebidoOk ? 'Sim' : 'Não',
            adj?.obs ?? '',
          ]);
        });
      }
    }
    baixarCsv('compras', rows);
  };

  const exportarPrecos = () => {
    const rows: string[][] = [['Item (normalizado)', 'Preço Atual (R$)', 'Fornecedor', 'Histórico (últimos 5)']];
    const itens = Object.keys(precos).sort();
    for (const k of itens) {
      const hist = (historico[k] ?? []).slice(-5).map((p) => `${p.valor} (${p.em.slice(0, 10)})`).join(' | ');
      rows.push([k, String(precos[k]), fornecedores[k] ?? '', hist]);
    }
    baixarCsv('precos', rows);
  };

  const exportarAceitacao = () => {
    const rows: string[][] = [['Prato', 'Bom ', 'Ok ', 'Ruim ', 'Total', 'Nota Média (1-5)', 'Última Atualização']];
    for (const [, r] of Object.entries(aceitacao).sort((a, b) => b[1].n - a[1].n)) {
      rows.push([
        r.prato, String(r.bom), String(r.ok), String(r.ruim), String(r.n),
        r.n > 0 ? (r.somaNotas / r.n).toFixed(2) : '—',
        r.atualizadoEm.slice(0, 10),
      ]);
    }
    baixarCsv('aceitacao-pratos', rows);
  };

  const exportarCardapios = () => {
    const rows: string[][] = [['Semana', 'Período', 'Dia', 'Principal', 'Guarnicao', 'Salada', 'Sobremesa', 'Pessoas', 'Etapa']];
    for (const sid of semanaIds) {
      const s = lerSemana(sid);
      const per = periodoSemana(sid);
      s.dias.forEach((d, i) => {
        rows.push([sid, per, DIAS_SEMANA[i], d.principal, d.guarnicao, d.salada, d.sobremesa, String(d.pessoas), s.etapa]);
      });
    }
    baixarCsv('cardapios', rows);
  };

  const exportarAuditoria = () => {
    const rows: string[][] = [['Data/Hora', 'Papel', 'Ação', 'Alvo', 'De', 'Para', 'Semana']];
    const reg = periodo === 'semana' ? auditoria.slice(0, 200) : auditoria;
    for (const r of reg) {
      rows.push([r.em.replace('T', ' ').slice(0, 19), r.papel, r.acao, r.alvo, String(r.de ?? ''), String(r.para ?? ''), r.semana ?? '']);
    }
    baixarCsv('auditoria', rows);
  };

  const exportarNutricional = () => {
    const rows: string[][] = [['Semana', 'Score (%)', 'Classificação', 'Observações']];
    for (const sid of semanaIds) {
      const s = lerSemana(sid);
      const { score, rotulo, detalhes } = indiceNutricionalSemana(s.dias);
      rows.push([periodoSemana(sid), String(score), rotulo, detalhes.join(' | ')]);
    }
    baixarCsv('nutricional', rows);
  };

  const exportarCustos = () => {
    const rows: string[][] = [['Semana', 'Período', 'Custo Estimado (R$)', 'Custo Real (R$)', 'Refeições Previstas', 'Refeições Reais', 'Custo/Refeição (R$)']];
    for (const sid of semanaIds) {
      const s = lerSemana(sid);
      let custoEst = 0;
      let custoReal = 0;
      let pessoasPrev = 0;
      let pessoasReal = 0;
      for (let di = 0; di < 7; di++) {
        const linhas = linhasDoDia(s, di, fatores);
        linhas.forEach((l) => {
          const preco = resolverPreco(l.chave, precos, estimativas).valor;
          if (preco > 0) custoEst += preco * converterParaUnidadeBase(l.qtd, l.unid);
          if (l.status.precoPago && l.status.compradoQtd) {
            custoReal += l.status.precoPago * converterParaUnidadeBase(l.status.compradoQtd, l.unid);
          }
        });
        pessoasPrev += s.dias[di]?.pessoas ?? 0;
        pessoasReal += s.refeicoes?.[di] ?? 0;
      }
      const custoRef = pessoasReal > 0 ? custoReal / pessoasReal : pessoasPrev > 0 ? custoEst / pessoasPrev : 0;
      rows.push([sid, periodoSemana(sid), custoEst.toFixed(2), custoReal > 0 ? custoReal.toFixed(2) : '', String(pessoasPrev), pessoasReal > 0 ? String(pessoasReal) : '', custoRef > 0 ? custoRef.toFixed(2) : '']);
    }
    baixarCsv('custos', rows);
  };

  const GRUPOS_RELATORIOS = [
    {
      grupo: 'Cardápio & Operação',
      itens: [
        { id: 'cardapios', icone: '🍽️', titulo: 'Cardápios', desc: 'Pratos planejados por dia e semana', fn: exportarCardapios },
        { id: 'aceitacao', icone: '⭐', titulo: 'Aceitação dos Pratos', desc: 'Votos bom/ok/ruim e nota média por prato', fn: exportarAceitacao },
        { id: 'nutricional', icone: '🥗', titulo: 'Desempenho Nutricional', desc: 'Índice Nutricional Tata House por semana', fn: exportarNutricional },
      ],
    },
    {
      grupo: 'Compras & Custos',
      itens: [
        { id: 'compras', icone: '🛒', titulo: 'Compras e Recebimento', desc: 'Itens comprados, preços pagos e quantidades recebidas', fn: exportarCompras },
        { id: 'custos', icone: '💰', titulo: 'Custos', desc: 'Custo estimado vs. real, refeições e custo por refeição', fn: exportarCustos },
        { id: 'precos', icone: '📊', titulo: 'Tabela de Preços', desc: 'Preços atuais, fornecedores e histórico por item', fn: exportarPrecos },
      ],
    },
    {
      grupo: 'Auditoria',
      itens: [
        { id: 'auditoria', icone: '🔍', titulo: 'Auditoria', desc: 'Histórico de todas as ações realizadas no sistema', fn: exportarAuditoria },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho narrativo */}
      <div className="space-y-1">
        <p className="text-micro font-bold uppercase tracking-[0.18em] text-texto-suave">Central gerencial</p>
        <p className="text-lg font-extrabold text-carvao-900 dark:text-white">
          {kpis.semanas === 1
            ? 'Esta semana em números'
            : kpis.semanas <= 4
            ? `Últimas ${kpis.semanas} semanas`
            : 'Histórico completo'}
        </p>
        <p className="text-xs text-texto-suave">Exporte para Excel ou Google Sheets em CSV</p>
      </div>

      {/* Seletor de período */}
      <div className="flex gap-1 rounded-2xl bg-carvao-100/70 p-1 dark:bg-carvao-800/70">
        {([['semana', 'Esta semana'], ['mes', 'Último mês (4 sem.)'], ['tudo', 'Todo o histórico']] as const).map(([id, rot]) => (
          <button
            key={id}
            onClick={() => setPeriodo(id)}
            className={`min-h-9 flex-1 rounded-xl px-3 text-nota font-semibold transition ${periodo === id ? 'bg-white text-brand-700 shadow-suave dark:bg-carvao-700 dark:text-brand-300' : 'text-carvao-500 dark:text-areia-200'}`}
          >
            {rot}
          </button>
        ))}
      </div>

      {/* Stats inline */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <span><strong className="font-bold text-carvao-900 dark:text-white">{kpis.semanas}</strong> <span className="text-texto-suave">semana{kpis.semanas !== 1 ? 's' : ''}</span></span>
        <span><strong className="font-bold text-carvao-900 dark:text-white">{formatarReais(kpis.custoTotal)}</strong> <span className="text-texto-suave">em compras</span></span>
        <span><strong className="font-bold text-carvao-900 dark:text-white">{kpis.itensComprados}</strong> <span className="text-texto-suave">itens · {kpis.itensRecebidos} recebidos</span></span>
        {kpis.totalRefeicoes > 0 && <span><strong className="font-bold text-carvao-900 dark:text-white">{kpis.totalRefeicoes}</strong> <span className="text-texto-suave">refeições</span></span>}
        <span>
          <strong className={`font-bold ${nutri.score >= 70 ? 'text-brand-600 dark:text-brand-400' : 'text-ouro-600 dark:text-ouro-400'}`}>{nutri.score}%</strong>
          <span className="ml-1 text-texto-suave">nutricional</span>
        </span>
      </div>

      {/* Relatórios exportáveis — agrupados */}
      <div className="space-y-4">
        <h3 className="text-caption font-extrabold uppercase tracking-[0.2em] text-texto-suave">Exportar relatórios (CSV)</h3>
        {GRUPOS_RELATORIOS.map((g) => (
          <div key={g.grupo}>
            <p className="mb-2 px-1 text-micro font-bold uppercase tracking-[0.16em] text-texto-suave">{g.grupo}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.itens.map((r) => (
                <button
                  key={r.id}
                  onClick={r.fn}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-carvao-200 transition hover:bg-brand-50 hover:ring-brand-400/40 dark:bg-carvao-800 dark:ring-carvao-600 dark:hover:bg-carvao-700"
                >
                  <span className="shrink-0 text-xl leading-none">{r.icone}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{r.titulo}</p>
                    <p className="text-caption text-texto-suave">{r.desc}</p>
                  </div>
                  <Icone nome="exportar" tam={16} className="shrink-0 text-brand-400" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Últimas ações (auditoria resumida) */}
      {auditoria.length > 0 && (
        <Cartao className="space-y-2">
          <h3 className="font-display text-sm font-bold">Últimas ações registradas</h3>
          <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
            {auditoria.slice(0, 10).map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="shrink-0 text-caption tabular-nums text-texto-suave">{r.em.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-semibold">{r.acao}</strong>
                  {' — '}{r.alvo}
                  {r.de != null && r.para != null && (
                    <span className="text-texto-suave"> ({r.de} → {r.para})</span>
                  )}
                </span>
                <span className="shrink-0 text-micro text-texto-suave">{r.papel}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={exportarAuditoria}
            className="flex items-center gap-1.5 text-rotulo font-bold text-brand-600 hover:text-brand-700"
          >
            <Icone nome="exportar" tam={14} /> Exportar auditoria completa
          </button>
        </Cartao>
      )}

      {/* link para o manual */}
      <a
        href="/manual"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200/60 transition hover:bg-brand-100 dark:bg-carvao-800 dark:text-brand-300 dark:ring-carvao-600"
      >
        
        Manual do sistema — guia completo para funcionários
        <span className="text-brand-400">↗</span>
      </a>
    </div>
  );
}
