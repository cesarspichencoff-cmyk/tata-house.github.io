'use client';

/* =====================================================================
   Chef IA — central de recomendações inteligentes.
   Regras antes de sugerir qualquer coisa:
   1. Nunca usa itens sem preço cotado válido para calcular economia
   2. Nunca sugere pratos da lista de veto operacional
   3. Considera aceitação histórica antes de recomendar alternativa
   4. Verifica frequência recente (janela de 4 semanas)
   5. Aprende com o feedback (/) do time
   ===================================================================== */

import { useMemo, useState } from 'react';
import { Cartao, Pilula } from '@/components/ui';
import {
  DADOS,
  DIAS_SEMANA,
  converterParaUnidadeBase,
  formatarReais,
  listaDoDia,
  normalizar,
  proteinaDoPrato,
} from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import { receitaDoPrato, RECEITAS_POR_CATEGORIA } from '@/lib/cardapio/receitas';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { useAceitacao, useChefFeedback, semanasComConteudo, lerSemana } from '@/lib/cardapio/estado';
import { EstudoOperacao } from './EstudoOperacao';
import type { DiaCardapio, EstadoSemana } from '@/lib/cardapio/tipos';

/* Pratos que nunca devem ser sugeridos como prato principal de almoço */
const VETO_PRINCIPAL = new Set([
  'ovos mexidos', 'omelete', 'omelete de queijo', 'omelete simples',
  'panquecas', 'crepioca', 'sanduiche', 'sopa', 'caldo',
  'miojo', 'macarrao instantaneo',
]);

type Tom = 'verde' | 'ouro' | 'vermelho' | 'azul' | 'roxo';

interface Dica {
  id: string;
  icone: string;
  titulo: string;
  texto: string;
  tom: Tom;
}

function hashDica(icone: string, texto: string): string {
  let h = 0;
  for (const c of icone + texto.slice(0, 60)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return String(Math.abs(h));
}

export function ChefIA({
  estado,
  precos,
  expandido = false,
  custoRefeicao,
}: {
  estado: EstadoSemana;
  precos: Record<string, number>;
  expandido?: boolean;
  /** Custo por refeição da semana aberta — dá valor em R$ aos achados. */
  custoRefeicao?: number | null;
}) {
  const { estimativas } = useEstimativas();
  const { aceitacao } = useAceitacao();
  const { vetados, registrar, feedbacks } = useChefFeedback();
  const [motivoAberto, setMotivoAberto] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');

  /* ---- pratos usados nas últimas 4 semanas (frequência recente) ---- */
  const frequenciaRecente = useMemo(() => {
    const cont: Record<string, number> = {};
    const semanas = semanasComConteudo().slice(-4);
    for (const sid of semanas) {
      const s = lerSemana(sid);
      s.dias.forEach((d) => {
        if (d.principal) {
          const k = normalizar(d.principal);
          cont[k] = (cont[k] ?? 0) + 1;
        }
      });
    }
    return cont;
  }, []);

  const dicas = useMemo<Dica[]>(() => {
    const base = DADOS.baseline || 65;

    const precoItem = (norm: string): number => {
      const r = resolverPreco(norm, precos, estimativas);
      return r.tipo !== 'sem' ? r.valor : 0;
    };

    const custoRefDe = (nome: string): number => {
      const dia: DiaCardapio = {
        pessoas: base, principal: nome,
        guarnicaoFixa: '', guarnicao: '', salada: '', sobremesa: '',
      };
      const total = listaDoDia(dia).reduce((t, s) => t + precoItem(normalizar(s.item)) * converterParaUnidadeBase(s.qtd, s.unid), 0);
      return total / base;
    };

    const pratoValido = (nome: string): boolean => {
      const n = normalizar(nome);
      if (VETO_PRINCIPAL.has(n)) return false;
      // só sugere pratos com receita completa e adequados ao refeitório
      const r = receitaDoPrato(nome);
      if (r && r.adequacaoRefeitorio < 60) return false;
      const ac = aceitacao[n];
      if (ac && ac.n >= 3 && ac.somaNotas / ac.n < 2) return false;
      return true;
    };

    const out: Dica[] = [];
    const comPrato = estado.dias.map((d, i) => ({ d, i })).filter((x) => x.d.principal);

    // 1) Economia — só sugere se a alternativa tem preço real e não está vetada
    if (comPrato.length > 0) {
      const usados = new Set(comPrato.map((x) => normalizar(x.d.principal)));
      const caro = comPrato
        .map((x) => ({ ...x, ref: custoRefDe(x.d.principal) }))
        .filter((x) => x.ref > 0)
        .sort((a, b) => b.ref - a.ref)[0];

      const alternativas = RECEITAS_POR_CATEGORIA.principal
        .filter((n) => !usados.has(normalizar(n)) && pratoValido(n))
        .map((n) => {
          const norm = normalizar(n);
          const preco = resolverPreco(norm, precos, estimativas);
          return { n, norm, ref: (preco.tipo === 'real' || preco.tipo === 'historico') ? custoRefDe(n) : 0 };
        })
        .filter((a) => a.ref > 0)
        .sort((a, b) => a.ref - b.ref);

      const alt = alternativas[0];
      if (caro && alt && caro.ref - alt.ref > 0.5) {
        const economia = (caro.ref - alt.ref) * caro.d.pessoas;
        const texto = `Trocar "${caro.d.principal}" (${DIAS_SEMANA[caro.i].slice(0, 3)}) por "${alt.n}" pode economizar ~${formatarReais(economia)} neste dia.`;
        out.push({ id: 'economia', icone: '', titulo: 'Oportunidade de economia', texto, tom: 'verde' });
      }
    }

    // 2) Pratos sem receita cadastrada
    const semReceita = comPrato.filter((x) => !receitaDoPrato(x.d.principal));
    if (semReceita.length > 0) {
      const texto = `${semReceita.length} prato(s) sem receita cadastrada — os ingredientes são estimados. Prefira pratos com receita ou revise os itens manualmente.`;
      out.push({ id: 'receita', icone: '', titulo: 'Ingredientes não confirmados', texto, tom: 'ouro' });
    }

    // 3) Baixa aceitação histórica (≥3 avaliações, nota < 3)
    comPrato.forEach((x) => {
      const a = aceitacao[normalizar(x.d.principal)];
      if (a && a.n >= 3 && a.somaNotas / a.n < 3) {
        const nota = (a.somaNotas / a.n).toFixed(1);
        const texto = `"${x.d.principal}" teve avaliação baixa (nota ${nota}/5 com ${a.n} registros). Considere substituir por um prato com maior aceitação.`;
        out.push({ id: `aceitacao-${x.i}`, icone: '', titulo: 'Baixa aceitação', texto, tom: 'vermelho' });
      }
    });

    // 4) Excesso de proteína (frango >4× ou suína >2×)
    const cont: Record<string, number> = {};
    comPrato.forEach((x) => {
      const p = proteinaDoPrato(x.d.principal);
      cont[p] = (cont[p] ?? 0) + 1;
    });
    if ((cont['frango'] ?? 0) > 4) {
      out.push({ id: 'frango', icone: '', titulo: 'Frango em excesso', texto: `Frango aparece ${cont['frango']}× nesta semana — acima do recomendado (máx. 4×). Varie as proteínas.`, tom: 'ouro' });
    }
    if ((cont['suina'] ?? 0) > 2) {
      out.push({ id: 'suina', icone: '', titulo: 'Carne suína em excesso', texto: `Carne suína ${cont['suina']}× — acima do recomendado (máx. 2×). Risco nutricional por excesso de gordura saturada.`, tom: 'vermelho' });
    }

    // 5) Prato repetido das últimas 4 semanas (frequência ≥3×)
    comPrato.forEach((x) => {
      const k = normalizar(x.d.principal);
      const freq = frequenciaRecente[k] ?? 0;
      if (freq >= 3) {
        out.push({ id: `freq-${x.i}`, icone: '', titulo: 'Alta repetição', texto: `"${x.d.principal}" apareceu ${freq}× nas últimas 4 semanas. A equipe pode estar com sensação de monotonia.`, tom: 'ouro' });
      }
    });

    // 6) Dias incompletos
    const vazios = estado.dias.filter((d) => !d.principal).length;
    if (vazios > 0 && vazios < 7) {
      out.push({ id: 'incompleto', icone: '', titulo: 'Semana incompleta', texto: `${vazios} dia(s) ainda sem prato principal. Use "Sugerir" para completar automaticamente.`, tom: 'azul' });
    }

    // 7) Itens sem preço na semana (impacto financeiro invisível)
    const semPrecoSet: string[] = [];
    comPrato.forEach((x) => {
      listaDoDia(x.d).forEach((s) => {
        const n = normalizar(s.item);
        const r = resolverPreco(n, precos, estimativas);
        if (r.tipo === 'sem') semPrecoSet.push(s.item);
      });
    });
    const unicos = Array.from(new Set(semPrecoSet));
    if (unicos.length > 2) {
      out.push({ id: 'sempreco', icone: '', titulo: 'Custo não visível', texto: `${unicos.length} ingredientes sem cotação (ex: ${unicos.slice(0, 2).join(', ')}). O custo real da semana pode ser maior.`, tom: 'roxo' });
    }

    // 8) Prato com alto desperdício histórico (se aceitacao.ruim > bom)
    comPrato.forEach((x) => {
      const k = normalizar(x.d.principal);
      const ac = aceitacao[k];
      if (ac && ac.n >= 5 && ac.ruim > ac.bom * 1.5) {
        out.push({ id: `ruim-${x.i}`, icone: '', titulo: 'Risco de desperdício', texto: `"${x.d.principal}" historicamente recebe mais negativos (${ac.ruim} ) que positivos (${ac.bom} ). Revise ou substitua.`, tom: 'vermelho' });
      }
    });

    // filtra sugestões vetadas pelo feedback do time
    return out
      .filter((d) => !vetados.has(hashDica(d.icone, d.texto)))
      .slice(0, expandido ? 10 : 5);
  }, [estado.dias, precos, estimativas, aceitacao, vetados, frequenciaRecente, expandido]);

  const darFeedback = (dica: Dica, voto: 'bom' | 'ruim') => {
    const hash = hashDica(dica.icone, dica.texto);
    if (voto === 'ruim') {
      setMotivoAberto(hash);
    } else {
      registrar({ hash, voto: 'bom' });
    }
  };

  const confirmarVeto = (hash: string) => {
    registrar({ hash, voto: 'ruim', motivo: motivoTexto.trim() || undefined });
    setMotivoAberto(null);
    setMotivoTexto('');
  };

  const COR: Record<Tom, string> = {
    verde: 'text-brand-700 dark:text-brand-300',
    ouro: 'text-[#9a6c17] dark:text-[#e3b45c]',
    vermelho: 'text-perigo',
    azul: 'text-carvao-600 dark:text-areia-200',
    roxo: 'text-[#7c5fa0] dark:text-[#b99cd8]',
  };
  const BG: Record<Tom, string> = {
    verde: 'bg-brand-500/5 ring-brand-500/20',
    ouro: 'bg-ouro-400/8 ring-ouro-400/20',
    vermelho: 'bg-perigo/5 ring-perigo/20',
    azul: 'bg-carvao-100/50 ring-carvao-200/60 dark:bg-carvao-800/40 dark:ring-carvao-600/40',
    roxo: 'bg-[#7c5fa0]/5 ring-[#7c5fa0]/20',
  };

  // O estudo da operação é o miolo do Chef IA: olha as semanas passadas,
  // as sobras, os votos e as notas. A lista de "dicas" abaixo dele é só a
  // conferência da semana aberta — útil, mas não é inteligência.
  const estudo = expandido ? <EstudoOperacao custoRefeicao={custoRefeicao} /> : null;

  if (dicas.length === 0) {
    return expandido ? (
      <div className="space-y-4">
      {estudo}
      <Cartao className="space-y-3 border-l-4 !border-l-brand-500">
        <div className="flex items-center gap-2">
          
          <h3 className="font-display text-sm font-bold">Chef IA</h3>
        </div>
        <div className="rounded-2xl bg-brand-500/5 px-4 py-6 text-center">
          
          <p className="mt-2 font-semibold text-brand-700 dark:text-brand-300">Semana bem planejada!</p>
          <p className="mt-1 text-sm text-texto-suave">Nenhuma recomendação no momento. Continue assim.</p>
        </div>
        {feedbacks.length > 0 && (
          <p className="text-caption text-texto-suave">{feedbacks.filter((f) => f.voto === 'ruim').length} sugestão(ões) descartada(s) pelo time.</p>
        )}
      </Cartao>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-4">
    {estudo}
    <Cartao className={`space-y-3 border-l-4 !border-l-brand-500 ${expandido ? '' : ''}`}>
      <div className="flex items-center gap-2">
        
        <h3 className="font-display text-sm font-bold">Chef IA</h3>
        <Pilula tom="azul">{dicas.length}</Pilula>
        <span className="text-caption text-texto-suave">
          {expandido ? 'recomendações baseadas em dados reais' : 'recomendações para esta semana'}
        </span>
      </div>

      <ul className="space-y-2">
        {dicas.map((d) => {
          const hash = hashDica(d.icone, d.texto);
          const jaDeuBom = feedbacks.some((f) => f.hash === hash && f.voto === 'bom');
          return (
            <li key={d.id} className={`rounded-xl p-3 ring-1 ${BG[d.tom]}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-base">{d.icone}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-caption font-extrabold uppercase tracking-wide ${COR[d.tom]}`}>{d.titulo}</p>
                  <p className={`mt-0.5 text-sm ${COR[d.tom]}`}>{d.texto}</p>
                </div>
                {/* Feedback */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => darFeedback(d, 'bom')}
                    title="Boa sugestão"
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-nota transition ${jaDeuBom ? 'bg-brand-500/20' : 'hover:bg-brand-500/10'}`}
                  >
                    
                  </button>
                  <button
                    onClick={() => darFeedback(d, 'ruim')}
                    title="Sugestão ruim — não mostrar mais"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-nota transition hover:bg-perigo/10"
                  >
                    
                  </button>
                </div>
              </div>
              {/* Mini-form de motivo quando veta */}
              {motivoAberto === hash && (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 rounded-lg border border-carvao-200 bg-white px-2 py-1 text-rotulo dark:border-carvao-600 dark:bg-carvao-900"
                    placeholder="Por que não é útil? (opcional)"
                    value={motivoTexto}
                    onChange={(e) => setMotivoTexto(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmarVeto(hash)}
                  />
                  <button
                    onClick={() => confirmarVeto(hash)}
                    className="rounded-lg bg-perigo px-3 py-1 text-rotulo font-bold text-white"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={() => { setMotivoAberto(null); setMotivoTexto(''); }}
                    className="rounded-lg bg-carvao-100 px-2 py-1 text-rotulo dark:bg-carvao-700"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {feedbacks.filter((f) => f.voto === 'ruim').length > 0 && (
        <p className="text-micro text-texto-suave">
          {feedbacks.filter((f) => f.voto === 'ruim').length} sugestão(ões) descartada(s) pelo time — o Chef IA aprendeu suas preferências.
        </p>
      )}
      <p className="text-micro text-texto-suave">Use para ensinar o Chef IA sobre o que não funciona na operação.</p>
    </Cartao>
    </div>
  );
}
