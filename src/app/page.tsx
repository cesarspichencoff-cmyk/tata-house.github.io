'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlternadorTema } from '@/components/AlternadorTema';
import { IndicadorNuvem } from '@/components/IndicadorNuvem';
import { BottomNav, GRUPOS } from '@/components/BottomNav';
import { ToastHost, toast } from '@/components/Toast';
import { Icone } from '@/components/Icones';
import { BottomSheet, Skeleton, Kpi } from '@/components/ui';
import { resumoSemana } from '@/lib/cardapio/indicadores';
import { formatarReais } from '@/lib/cardapio/motor';

/* Tela de Início (visão padrão pós-login) — eager para não piscar no
   primeiro paint. */
import { AbaAgora } from '@/components/cardapio/AbaAgora';
import { BriefingCard } from '@/components/cardapio/BriefingCard';
import { PainelDiretor } from '@/components/cardapio/PainelDiretor';

/* Demais abas — carregadas sob demanda (code-splitting). Cada uma vira um
   chunk separado, baixado só quando o usuário abre aquela aba. Isso tira do
   First Load o peso de Cardápio (≈6 mil linhas de receitas), Compras,
   Relatórios e Ajustes. */
const Carregando = ({ h }: { h: string }) => <Skeleton className={h} />;

const AbaAceitacao = dynamic(() => import('@/components/cardapio/AbaAceitacao').then((m) => ({ default: m.AbaAceitacao })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const PlaquinhaQR = dynamic(() => import('@/components/cardapio/PlaquinhaQR').then((m) => ({ default: m.PlaquinhaQR })), { ssr: false, loading: () => null });
const AbaCardapio = dynamic(() => import('@/components/cardapio/AbaCardapio').then((m) => ({ default: m.AbaCardapio })), { ssr: false, loading: () => <Carregando h="h-96" /> });
const AbaCompras = dynamic(() => import('@/components/cardapio/AbaCompras').then((m) => ({ default: m.AbaCompras })), { ssr: false, loading: () => <Carregando h="h-96" /> });
const AbaDesperdicio = dynamic(() => import('@/components/cardapio/AbaDesperdicio').then((m) => ({ default: m.AbaDesperdicio })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaEstoque = dynamic(() => import('@/components/cardapio/AbaEstoque').then((m) => ({ default: m.AbaEstoque })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaFluxo = dynamic(() => import('@/components/cardapio/AbaFluxo').then((m) => ({ default: m.AbaFluxo })), { ssr: false, loading: () => <Carregando h="h-48" /> });
const AbaRadar = dynamic(() => import('@/components/cardapio/AbaRadar').then((m) => ({ default: m.AbaRadar })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const CentralGerencial = dynamic(() => import('@/components/cardapio/CentralGerencial').then((m) => ({ default: m.CentralGerencial })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const Configuracoes = dynamic(() => import('@/components/cardapio/Configuracoes').then((m) => ({ default: m.Configuracoes })), { ssr: false, loading: () => <Carregando h="h-48" /> });
const Assistente = dynamic(() => import('@/components/cardapio/Assistente').then((m) => ({ default: m.Assistente })), { ssr: false, loading: () => null });
const PosterSemana = dynamic(() => import('@/components/cardapio/PosterSemana').then((m) => ({ default: m.PosterSemana })), { ssr: false, loading: () => null });
const AbaAuditoria = dynamic(() => import('@/components/cardapio/AbaAuditoria').then((m) => ({ default: m.AbaAuditoria })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const DnaCard = dynamic(() => import('@/components/cardapio/DnaCard').then((m) => ({ default: m.DnaCard })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const LinhaTempoCasa = dynamic(() => import('@/components/cardapio/LinhaTempoCasa').then((m) => ({ default: m.LinhaTempoCasa })), { ssr: false, loading: () => <Carregando h="h-48" /> });
const PrevisaoCard = dynamic(() => import('@/components/cardapio/PrevisaoCard').then((m) => ({ default: m.PrevisaoCard })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const RoiCard = dynamic(() => import('@/components/cardapio/RoiCard').then((m) => ({ default: m.RoiCard })), { ssr: false, loading: () => <Carregando h="h-48" /> });
const AbaFuncionarios = dynamic(() => import('@/components/cardapio/AbaFuncionarios').then((m) => ({ default: m.AbaFuncionarios })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaContagem = dynamic(() => import('@/components/cardapio/AbaContagem').then((m) => ({ default: m.AbaContagem })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaNF = dynamic(() => import('@/components/cardapio/AbaNF').then((m) => ({ default: m.AbaNF })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AlertaProteinaDia = dynamic(() => import('@/components/cardapio/AlertaProteinaDia').then((m) => ({ default: m.AlertaProteinaDia })), { ssr: false, loading: () => null });
const AbaCustoPrato = dynamic(() => import('@/components/cardapio/AbaCustoPrato').then((m) => ({ default: m.AbaCustoPrato })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaFornecedorIntel = dynamic(() => import('@/components/cardapio/AbaFornecedorIntel').then((m) => ({ default: m.AbaFornecedorIntel })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const AbaPedido = dynamic(() => import('@/components/cardapio/AbaPedido').then((m) => ({ default: m.AbaPedido })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const CardapioOrientadoDados = dynamic(() => import('@/components/cardapio/CardapioOrientadoDados').then((m) => ({ default: m.CardapioOrientadoDados })), { ssr: false, loading: () => <Carregando h="h-64" /> });
const CopilotoSemana = dynamic(() => import('@/components/cardapio/CopilotoSemana').then((m) => ({ default: m.CopilotoSemana })), { ssr: false, loading: () => null });
const AbaGastos = dynamic(() => import('@/components/cardapio/AbaGastos').then((m) => ({ default: m.AbaGastos })), { ssr: false, loading: () => <Carregando h="h-64" /> });
import {
  deslocarSemana,
  idSemanaIso,
  lerSemana,
  periodoSemana,
  rotuloSemana,
  semanasComConteudo,
  useAceitacao,
  useAprendizado,
  useContagemRefeicoes,
  useDesperdicio,
  useEstoque,
  useEventos,
  useMudancaExterna,
  useFuncionarios,
  useFornecedores,
  useFornecedorPerfis,
  useHistoricoPrecos,
  useItensExtras,
  useOfertas,
  usePapel,
  usePrecos,
  useSemana,
} from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { useLogo } from '@/lib/cardapio/logo';
import { useLogin, abasDoPapel } from '@/lib/cardapio/login';
import { Login } from '@/components/Login';
import { TourOnboarding } from '@/components/TourOnboarding';
import { pode } from '@/lib/cardapio/org';
import type { Etapa } from '@/lib/cardapio/tipos';

/* ── abas ────────────────────────────────────────────────── */

const ABAS = [
  { id: 'agora',      rotulo: 'Hoje'      },
  { id: 'cardapio',   rotulo: 'Planejar'  },
  { id: 'compras',    rotulo: 'Abastecer' },
  { id: 'relatorios', rotulo: 'Analisar'  },
  { id: 'ajustes',    rotulo: 'Gestão'    },
] as const;
type AbaId = (typeof ABAS)[number]['id'];

const AREA_META: Record<AbaId, { kicker: string; titulo: string; descricao: string }> = {
  agora: {
    kicker: 'Visão da semana',
    titulo: 'Hoje',
    descricao: 'Prioridades, alertas e decisões que precisam de atenção agora.',
  },
  cardapio: {
    kicker: 'Do plano à aprendizagem',
    titulo: 'Planejamento',
    descricao: 'Componha a semana, acompanhe a execução e feche o ciclo com feedback.',
  },
  compras: {
    kicker: 'Abastecimento',
    titulo: 'Compras e estoque',
    descricao: 'Transforme o plano em necessidades, pedidos, recebimento e controle de estoque.',
  },
  relatorios: {
    kicker: 'Leitura gerencial',
    titulo: 'Resultados',
    descricao: 'Entenda custo, aceitação, desperdício, tendências e oportunidades de melhoria.',
  },
  ajustes: {
    kicker: 'Administração',
    titulo: 'Gestão do House',
    descricao: 'Organize pessoas, restrições e acessos sem misturar isso com a operação diária.',
  },
};

/* ── badge de etapa ──────────────────────────────────────── */

const ROTULO_ETAPA: Record<Etapa, string> = {
  rascunho:    'Rascunho',
  cozinha:     'Na cozinha',
  compras:     'Em compra',
  recebimento: 'Recebendo',
  concluido:   'Concluída',
};

const COR_ETAPA_TEXTO: Record<Etapa, string> = {
  rascunho:    'text-texto-suave',
  cozinha:     'text-ouro-600 dark:text-ouro-400',
  compras:     'text-info dark:text-info-claro',
  recebimento: 'text-ouro-600 dark:text-ouro-400',
  concluido:   'text-brand-600 dark:text-brand-400',
};

const COR_ETAPA_PONTO: Record<Etapa, string> = {
  rascunho:    'bg-carvao-300',
  cozinha:     'bg-ouro-400 animate-pulse',
  compras:     'bg-info',
  recebimento: 'bg-ouro-400 animate-pulse',
  concluido:   'bg-brand-500',
};

/* ── mini-stepper de etapas — espinha dorsal visível em todas as telas ── */

const SEQ_ETAPAS: Etapa[] = ['rascunho', 'cozinha', 'compras', 'recebimento', 'concluido'];

function MiniEtapas({ etapa, sufixo }: { etapa: Etapa; sufixo?: string }) {
  const atual = SEQ_ETAPAS.indexOf(etapa);
  const proxima = atual >= 0 && atual < SEQ_ETAPAS.length - 1 ? SEQ_ETAPAS[atual + 1] : null;
  return (
    <div className="space-y-1.5" aria-label={`Etapa: ${ROTULO_ETAPA[etapa]}`}>
      <div className="flex items-center gap-1.5">
        {SEQ_ETAPAS.map((e, i) => (
          <span
            key={e}
            className={`h-1.5 rounded-full transition-all ${
              i === atual ? 'w-7 bg-brand-600' : i < atual ? 'w-4 bg-brand-600/50' : 'w-4 bg-carvao-200 dark:bg-carvao-700'
            }`}
            title={ROTULO_ETAPA[e]}
          />
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-rotulo font-semibold">
        <span className={`inline-flex items-center gap-1.5 ${COR_ETAPA_TEXTO[etapa]}`}>
          <span className={`h-2 w-2 rounded-full ${COR_ETAPA_PONTO[etapa]}`} />
          {ROTULO_ETAPA[etapa]}
        </span>
        {sufixo && <span className="font-normal text-texto-suave">· {sufixo}</span>}
        {proxima && (
          <span className="font-normal text-texto-suave">
            · próximo: <span className="font-semibold text-carvao-500 dark:text-carvao-300">{ROTULO_ETAPA[proxima]}</span>
          </span>
        )}
      </p>
    </div>
  );
}

/* ── busca global ────────────────────────────────────────── */

interface ResultadoBusca {
  tipo: 'cardapio' | 'compra' | 'fornecedor' | 'relatorio' | 'acao';
  titulo: string;
  subtitulo?: string;
  acao: () => void;
}

interface AcoesPaleta {
  irPara: (aba: AbaId) => void;
  abrirPoster: () => void;
  abrirPlaquinha: () => void;
  duplicarSemana: () => void;
  irSemana: (delta: number) => void;
}

function useBuscaGlobal(
  estado: ReturnType<typeof useSemana>['estado'],
  precos: Record<string, number>,
  fornecedores: Record<string, string>,
  acoes: AcoesPaleta,
) {
  const { irPara } = acoes;
  // Ações (paleta de comando) — verbos que EXECUTAM, não só apontam
  const ACOES: { titulo: string; sub: string; chaves: string; run: () => void }[] = [
    { titulo: 'Abrir planejamento',       sub: 'Compor a semana',       chaves: 'gerar cardapio criar montar planejar semana', run: () => irPara('cardapio') },
    { titulo: 'Revisar preços',           sub: 'Custos do planejamento', chaves: 'cotacao preco precos catalogo custo',         run: () => irPara('cardapio') },
    { titulo: 'Ver necessidades',         sub: 'Lista para abastecimento', chaves: 'lista compras comprar necessidade',         run: () => irPara('compras') },
    { titulo: 'Abrir estoque',            sub: 'Saldos e mínimos',       chaves: 'estoque inventario saldo',                   run: () => irPara('compras') },
    { titulo: 'Preparar pedidos',         sub: 'Pedidos por fornecedor', chaves: 'pedido fornecedor encomenda',                run: () => irPara('compras') },
    { titulo: 'Analisar resultados',      sub: 'Custos, qualidade e tendências', chaves: 'relatorio analisar exportar csv dna ranking', run: () => irPara('relatorios') },
    { titulo: 'Abrir pôster da semana',   sub: 'Material de comunicação', chaves: 'poster cartaz imprimir mural',              run: acoes.abrirPoster },
    { titulo: 'Abrir QR de feedback',     sub: 'Avaliação da refeição',  chaves: 'plaquinha qr avaliar mesa feedback',          run: acoes.abrirPlaquinha },
    { titulo: 'Duplicar semana anterior', sub: 'Usar como ponto de partida', chaves: 'duplicar copiar semana anterior',         run: acoes.duplicarSemana },
    { titulo: 'Próxima semana',           sub: 'Avançar',               chaves: 'proxima semana avancar',                      run: () => acoes.irSemana(1) },
    { titulo: 'Semana anterior',          sub: 'Voltar',                chaves: 'anterior semana voltar',                      run: () => acoes.irSemana(-1) },
  ];

  return (termo: string): ResultadoBusca[] => {
    const t = termo.toLowerCase().trim();
    // Estado vazio: paleta mostra as ações rápidas (estilo Raycast/Linear)
    if (t.length < 2) {
      return ACOES.map((a) => ({ tipo: 'acao' as const, titulo: a.titulo, subtitulo: a.sub, acao: a.run }));
    }
    const res: ResultadoBusca[] = [];

    ACOES.forEach((a) => {
      if (a.titulo.toLowerCase().includes(t) || a.chaves.includes(t)) {
        res.push({ tipo: 'acao', titulo: a.titulo, subtitulo: a.sub, acao: a.run });
      }
    });

    // pratos da semana atual
    const DIAS_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    estado.dias.forEach((d, i) => {
      [d.principal, d.guarnicaoFixa, d.guarnicao, d.salada, d.sobremesa]
        .filter(Boolean)
        .forEach((prato) => {
          if (prato!.toLowerCase().includes(t)) {
            res.push({
              tipo: 'cardapio',
              titulo: prato!,
              subtitulo: DIAS_PT[i] + ' · semana atual',
              acao: () => irPara('cardapio'),
            });
          }
        });
    });

    // itens da lista de compras (via preços)
    Object.entries(precos).forEach(([item, preco]) => {
      if (item.toLowerCase().includes(t)) {
        res.push({
          tipo: 'compra',
          titulo: item,
          subtitulo: preco ? `R$ ${preco.toFixed(2)}` : 'sem preço',
          acao: () => irPara('compras'),
        });
      }
    });

    // fornecedores
    Object.entries(fornecedores).forEach(([item, marca]) => {
      if (marca.toLowerCase().includes(t) || item.toLowerCase().includes(t)) {
        res.push({
          tipo: 'fornecedor',
          titulo: marca,
          subtitulo: item,
          acao: () => irPara('relatorios'),
        });
      }
    });

    // relatórios
    ['Custo semanal', 'Aceitação', 'Desperdício', 'Exportar CSV', 'Auditoria'].forEach((r) => {
      if (r.toLowerCase().includes(t)) {
        res.push({ tipo: 'relatorio', titulo: r, acao: () => irPara('relatorios') });
      }
    });

    return res.slice(0, 12);
  };
}

const ICONE_TIPO: Record<ResultadoBusca['tipo'], React.ReactNode> = {
  cardapio:   <Icone nome="cardapio"  tam={14} />,
  compra:     <Icone nome="compras"   tam={14} />,
  fornecedor: <Icone nome="usuario"   tam={14} />,
  relatorio:  <Icone nome="insights"  tam={14} />,
  acao:       <Icone nome="raio"      tam={14} />,
};

const ROTULO_GRUPO: Record<ResultadoBusca['tipo'], string> = {
  acao:       'Ações',
  cardapio:   'Planejamento',
  compra:     'Abastecimento',
  fornecedor: 'Fornecedores',
  relatorio:  'Análise',
};

const ORDEM_GRUPO: ResultadoBusca['tipo'][] = ['acao', 'cardapio', 'compra', 'fornecedor', 'relatorio'];

/* ── componente busca ────────────────────────────────────── */

function BuscaGlobal({
  buscar,
  aoFechar,
}: {
  buscar: (t: string) => ResultadoBusca[];
  aoFechar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscar(termo), [buscar, termo]);

  // Resultados ordenados por grupo — a navegação por teclado segue esta ordem
  const ordenados = useMemo(() => {
    const out: ResultadoBusca[] = [];
    ORDEM_GRUPO.forEach((g) => resultados.filter((r) => r.tipo === g).forEach((r) => out.push(r)));
    return out;
  }, [resultados]);

  useEffect(() => { setSel(0); }, [termo]);

  // Foco só na montagem — separado do handler para não re-focar a cada tecla
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { aoFechar(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(ordenados.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') {
        const alvo = ordenados[sel];
        if (alvo) { alvo.acao(); aoFechar(); }
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [aoFechar, ordenados, sel]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-sm" onClick={aoFechar}>
      <div
        className="mx-auto mt-16 w-full max-w-lg px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* campo de busca */}
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-2xl ring-1 ring-carvao-200 dark:bg-carvao-900 dark:ring-carvao-600">
          <Icone nome="busca" tam={18} className="shrink-0 text-texto-suave" />
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar planejamento, ingrediente, fornecedor, análise…"
            className="flex-1 bg-transparent text-subtitulo text-carvao-800 outline-none placeholder:text-texto-suave dark:text-areia-100"
          />
          {termo && (
            <button onClick={() => setTermo('')} className="text-texto-suave hover:text-carvao-600">
              <Icone nome="fechar" tam={16} />
            </button>
          )}
          <kbd className="hidden rounded bg-carvao-100 px-1.5 py-0.5 text-caption font-semibold text-texto-suave sm:block dark:bg-carvao-700">
            esc
          </kbd>
        </div>

        {/* resultados — agrupados por seção, navegáveis por teclado */}
        {ordenados.length > 0 && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-white py-1.5 shadow-2xl ring-1 ring-carvao-200 dark:bg-carvao-900 dark:ring-carvao-600">
            {ORDEM_GRUPO.filter((g) => resultados.some((r) => r.tipo === g)).map((g) => (
              <div key={g} className="px-1.5 pb-1">
                <p className="px-3 pb-1 pt-2 text-micro font-bold uppercase tracking-[0.12em] text-texto-suave">
                  {ROTULO_GRUPO[g]}
                </p>
                {resultados.filter((r) => r.tipo === g).map((r) => {
                  const idx = ordenados.indexOf(r);
                  const ativo = idx === sel;
                  return (
                    <button
                      key={idx}
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => { r.acao(); aoFechar(); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        ativo ? 'bg-brand-50 dark:bg-carvao-800' : ''
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        ativo
                          ? 'bg-brand-600 text-white'
                          : 'bg-carvao-100 text-carvao-500 dark:bg-carvao-700 dark:text-carvao-300'
                      }`}>
                        {ICONE_TIPO[r.tipo]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-corpo font-semibold text-carvao-800 dark:text-areia-100">{r.titulo}</p>
                        {r.subtitulo && <p className="truncate text-caption text-texto-suave">{r.subtitulo}</p>}
                      </div>
                      {ativo && (
                        <kbd className="hidden shrink-0 rounded bg-white px-1.5 py-0.5 text-micro font-semibold text-texto-suave ring-1 ring-carvao-200 sm:block dark:bg-carvao-900 dark:ring-carvao-600">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {termo.trim().length >= 2 && ordenados.length === 0 && (
          <div className="mt-2 rounded-2xl bg-white px-4 py-6 text-center shadow-xl ring-1 ring-carvao-200 dark:bg-carvao-900 dark:ring-carvao-600">
            <p className="text-sm text-texto-suave">Nenhum resultado para "{termo}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── navegação sincronizada com a URL (deep-link + botão Voltar) ────────
   A aba ativa e a sub-aba vivem no hash (#aba=cardapio&sub=operacao). Trocar
   de aba dá pushState (vira entrada no histórico → Voltar volta de aba);
   trocar de sub-aba dá replaceState (não polui o histórico). Recarregar a
   página mantém onde você estava; é possível compartilhar o link de uma aba.
   ───────────────────────────────────────────────────────────────────── */

type CardapioSeg = 'montar' | 'operacao' | 'avaliacao';
type ComprasSeg = 'lista' | 'estoque' | 'nf' | 'fornecedores' | 'pedido';
type RelatoriosSeg = 'gerencial' | 'custos' | 'rankings' | 'previsao' | 'fornecedores' | 'auditoria' | 'gastos';

function lerHashNav(): { aba?: AbaId; sub?: string } {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return { aba: (p.get('aba') as AbaId) || undefined, sub: p.get('sub') || undefined };
}

function subInicial(qualAba: AbaId, padrao: string): string {
  const { aba, sub } = lerHashNav();
  return aba === qualAba && sub ? sub : padrao;
}

function useNavegacao() {
  const [aba, setAba] = useState<AbaId>(() => lerHashNav().aba || 'agora');
  const [abaCardapioSeg, setAbaCardapioSeg] = useState<CardapioSeg>(() => subInicial('cardapio', 'montar') as CardapioSeg);
  const [abaCompras, setAbaCompras] = useState<ComprasSeg>(() => subInicial('compras', 'lista') as ComprasSeg);
  const [abaRelatorios, setAbaRelatorios] = useState<RelatoriosSeg>(() => subInicial('relatorios', 'gerencial') as RelatoriosSeg);

  const subAtual =
    aba === 'cardapio' ? abaCardapioSeg : aba === 'compras' ? abaCompras : aba === 'relatorios' ? abaRelatorios : '';

  // Voltar/Avançar do navegador: aplica o estado vindo do hash.
  useEffect(() => {
    const aplicar = () => {
      const { aba: a, sub } = lerHashNav();
      if (a) setAba(a);
      if (sub) {
        const alvo = a ?? 'agora';
        if (alvo === 'cardapio') setAbaCardapioSeg(sub as CardapioSeg);
        else if (alvo === 'compras') setAbaCompras(sub as ComprasSeg);
        else if (alvo === 'relatorios') setAbaRelatorios(sub as RelatoriosSeg);
      }
    };
    window.addEventListener('popstate', aplicar);
    return () => window.removeEventListener('popstate', aplicar);
  }, []);

  // Estado → URL. Troca de aba empurra histórico; sub-aba só substitui.
  const abaAnterior = useRef<AbaId | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('aba', aba);
    if (subAtual) params.set('sub', subAtual);
    const novoHash = '#' + params.toString();
    if (novoHash !== window.location.hash) {
      if (abaAnterior.current !== null && aba !== abaAnterior.current) {
        window.history.pushState(null, '', novoHash);
      } else {
        window.history.replaceState(null, '', novoHash);
      }
    }
    abaAnterior.current = aba;
  }, [aba, subAtual]);

  return { aba, setAba, abaCardapioSeg, setAbaCardapioSeg, abaCompras, setAbaCompras, abaRelatorios, setAbaRelatorios };
}

/* ── componente principal ────────────────────────────────── */

export default function PaginaCardapios() {
  const [semanaId, setSemanaId] = useState(() => idSemanaIso(new Date()));
  const { aba, setAba, abaCardapioSeg, setAbaCardapioSeg, abaCompras, setAbaCompras, abaRelatorios, setAbaRelatorios } = useNavegacao();
  const [posterAberto, setPosterAberto] = useState(false);
  const [plaquinhaAberta, setPlaquinhaAberta] = useState(false);
  const [semanaSheet, setSemanaSheet] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [iaAberta, setIaAberta] = useState(false);

  const { estado, atualizar, pronto } = useSemana(semanaId);
  const { precos, definirPreco } = usePrecos();
  const { estimativas } = useEstimativas();
  const { fornecedores, definirFornecedor, renomearFornecedor } = useFornecedores();
  const { ofertas, registrarOferta } = useOfertas();
  const { itensExtras, cadastrarItem } = useItensExtras();
  const { fatores, aprenderDeSemana } = useAprendizado();
  const { papel } = usePapel();
  const { perfil, perfilId, pronto: loginPronto, sair } = useLogin();
  const { logo } = useLogo();
  const { estoque, movimentar, definirMinimo, definirSaldo } = useEstoque();
  const { aceitacao, avaliar } = useAceitacao();
  const { eventos, adicionar: addEvento, remover: rmEvento } = useEventos();
  const { registros: desperdicio, adicionar: addDesperdicio, remover: rmDesperdicio } = useDesperdicio(semanaId);
  const historico = useHistoricoPrecos();
  const { funcionarios, salvar: salvarFuncionario, atualizarFuncionario, removerFuncionario } = useFuncionarios();
  const { contagens, registrar: registrarContagem } = useContagemRefeicoes();
  const { perfis: perfisFornecedores, salvarPerfil: salvarPerfilFornecedor, adicionarAvaliacao: adicionarAvaliacaoFornecedor } = useFornecedorPerfis();

  const semanaAtualId = idSemanaIso(new Date());

  // Sincronização entre aparelhos: a semana do calendário pode estar vazia
  // enquanto o cardápio ativo está em outra semana já sincronizada (ex.: montado
  // no celular na semana passada). Quando os dados chegam da nuvem, abre a semana
  // que tem cardápio — uma única vez e só se o usuário não navegou/deep-linkou,
  // para nunca atrapalhar quem está começando uma semana nova.
  const jaAbriuSemanaCheia = useRef(false);
  useEffect(() => {
    if (jaAbriuSemanaCheia.current) return;
    if (lerHashNav().sub) { jaAbriuSemanaCheia.current = true; return; }
    const abrirSeVazia = () => {
      if (jaAbriuSemanaCheia.current) return;
      const atual = lerSemana(semanaId);
      if (atual.dias?.some((d) => d.principal)) { jaAbriuSemanaCheia.current = true; return; }
      const comConteudo = semanasComConteudo();
      const alvo = comConteudo[comConteudo.length - 1]; // mais recente com cardápio
      if (alvo && alvo !== semanaId) {
        jaAbriuSemanaCheia.current = true;
        setSemanaId(alvo);
        toast('Abrindo o cardápio sincronizado de outro aparelho');
      }
    };
    abrirSeVazia();
    const onExterno = (e: Event) => {
      const chave = (e as CustomEvent<{ chave?: string }>).detail?.chave;
      if (chave?.startsWith('semana.')) abrirSeVazia();
    };
    window.addEventListener('tata:chave-externa', onExterno);
    return () => window.removeEventListener('tata:chave-externa', onExterno);
  }, [semanaId]);

  const abasPermitidas = useMemo(() => abasDoPapel(papel), [papel]);
  const gruposVisiveis = useMemo(
    () => GRUPOS.filter((g) => g.abas.some((a) => abasPermitidas.includes(a as AbaId))),
    [abasPermitidas],
  );
  const grupoAtivo = GRUPOS.find((g) => g.abas.includes(aba)) ?? GRUPOS[0];
  const areaMeta = AREA_META[aba];

  const irSemana = (delta: number) => setSemanaId(deslocarSemana(semanaId, delta));
  const irPara = (alvo: AbaId) => {
    if (abasPermitidas.includes(alvo)) setAba(alvo);
  };

  const listaSemanas = useMemo(() => {
    const set = new Set<string>();
    for (let i = -2; i <= 8; i++) set.add(deslocarSemana(semanaAtualId, i));
    semanasComConteudo().forEach((id) => set.add(id));
    set.add(semanaId);
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaId, semanaAtualId, semanaSheet]);

  const duplicarSemanaAnterior = () => {
    const origem = lerSemana(deslocarSemana(semanaId, -1));
    if (!origem.dias.some((d) => d.principal)) {
      toast('A semana anterior está vazia', 'erro');
      return;
    }
    atualizar((e) => ({
      ...e,
      dias: e.dias.map((d, i) => ({
        ...d,
        principal:     origem.dias[i]?.principal     ?? '',
        guarnicaoFixa: origem.dias[i]?.guarnicaoFixa ?? d.guarnicaoFixa,
        guarnicao:     origem.dias[i]?.guarnicao     ?? '',
        salada:        origem.dias[i]?.salada        ?? '',
        sobremesa:     origem.dias[i]?.sobremesa     ?? '',
      })),
      ajustes: {},
    }));
    toast('Cardápio duplicado da semana anterior');
    setSemanaSheet(false);
  };

  const podeEditarCardapio = pode(papel, 'cardapio:editar') && (estado.etapa === 'rascunho' || estado.etapa === 'cozinha');
  const podeEstoque = pode(papel, 'estoque:gerenciar');
  const podeAvaliar = pode(papel, 'cardapio:editar');

  const buscarFn = useBuscaGlobal(estado, precos, fornecedores, {
    irPara,
    abrirPoster: () => setPosterAberto(true),
    abrirPlaquinha: () => setPlaquinhaAberta(true),
    duplicarSemana: duplicarSemanaAnterior,
    irSemana,
  });

  // KPIs-herói do topo de Relatórios — leitura gerencial de 5 segundos
  const kpisRelatorios = useMemo(() => {
    const r = resumoSemana(estado, precos, fatores, estimativas);
    const custoSemana = r.custoReal || r.custoEstimado;
    const custoRef = r.custoRefReal ?? r.custoRefEstimado;
    let somaNotas = 0, nNotas = 0;
    Object.values(aceitacao).forEach((a) => { if (a.n > 0) { somaNotas += a.somaNotas; nNotas += a.n; } });
    const mediaAceit = nNotas > 0 ? somaNotas / nNotas : null;
    let prod = 0, sobra = 0;
    desperdicio.forEach((d) => { if (d.produzido > 0) { prod += d.produzido; sobra += Math.max(0, d.produzido - d.consumido); } });
    const desperdicioPct = prod > 0 ? (sobra / prod) * 100 : null;
    return { custoSemana, custoRef, mediaAceit, desperdicioPct };
  }, [estado, precos, fatores, estimativas, aceitacao, desperdicio]);

  // atalho de teclado ⌘K / Ctrl+K
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setBuscaAberta(true); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // Aviso de colaboração: a semana ativa mudou em outro aparelho. A mudança já
  // foi mesclada (merge 3-vias) e reconciliada na tela; aqui só damos ciência.
  const montadoEm = useRef(Date.now());
  const ultimoAvisoSync = useRef(0);
  useMudancaExterna(
    'semana.' + semanaId,
    useCallback(() => {
      const agora = Date.now();
      if (agora - montadoEm.current < 3000) return;   // ignora a sincronização inicial
      if (agora - ultimoAvisoSync.current < 6000) return; // sem repetição em rajada
      ultimoAvisoSync.current = agora;
      toast('Cardápio atualizado em outro aparelho');
    }, []),
  );

  // redireciona para primeira aba permitida se a atual for bloqueada
  useEffect(() => {
    if (!abasPermitidas.includes(aba)) setAba(abasPermitidas[0] as AbaId);
  }, [abasPermitidas, aba, setAba]);

  if (!loginPronto) return null;
  if (!perfilId) return <Login />;

  if (posterAberto) {
    return <PosterSemana estado={estado} semanaId={semanaId} aoFechar={() => setPosterAberto(false)} />;
  }

  return (
    <>
      {/* ── Plaquinha QR ─────────────────────────────────── */}
      <PlaquinhaQR
        aberto={plaquinhaAberta}
        aoFechar={() => setPlaquinhaAberta(false)}
        url={(typeof window !== 'undefined' ? window.location.origin : '') + '/avaliar'}
      />

      {/* ── Busca global (overlay) ───────────────────────── */}
      {buscaAberta && (
        <BuscaGlobal buscar={buscarFn} aoFechar={() => setBuscaAberta(false)} />
      )}

      {/* ── Cabeçalho ────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-carvao-100 bg-white print:hidden dark:border-carvao-800 dark:bg-carvao-950">
        <div className="h-[3px] w-full bg-brand-600" />
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">

          {/* Marca */}
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" height={32} className="h-8 w-auto max-w-[110px] shrink-0 object-contain" fetchPriority="high" />
            ) : (
              <span className="h-7 w-0.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-[16px] font-bold tracking-[0.18em] text-carvao-900 dark:text-white sm:text-[18px]">
                TATÁ&nbsp;HOUSE
              </div>
              <div className="hidden truncate text-micro font-semibold uppercase tracking-[0.28em] text-texto-suave sm:block">
                Refeitório · planejamento, operação e inteligência
              </div>
            </div>
          </div>

          {/* Busca — barra central */}
          <button
            onClick={() => setBuscaAberta(true)}
            className="mx-auto hidden max-w-sm flex-1 items-center gap-2 rounded-xl border border-carvao-200 bg-carvao-50 px-4 py-2 text-sm text-texto-suave transition hover:border-carvao-300 hover:bg-carvao-100 sm:flex dark:border-carvao-700 dark:bg-carvao-900 dark:text-carvao-500"
          >
            <Icone nome="busca" tam={14} />
            <span>Buscar…</span>
            <kbd className="ml-auto text-caption font-semibold text-carvao-300 dark:text-carvao-600">⌘K</kbd>
          </button>

          {/* Ações do header */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <button
              onClick={() => setBuscaAberta(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-carvao-500 transition hover:bg-carvao-100 sm:hidden dark:text-texto-suave dark:hover:bg-carvao-800"
              aria-label="Buscar"
            >
              <Icone nome="busca" tam={17} />
            </button>
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-carvao-500 sm:flex lg:hidden dark:text-texto-suave">
              <Icone nome="usuario" tam={13} />
              {perfil?.rotulo ?? 'Perfil'}
            </span>
            <button
              onClick={() => { sair(); if (typeof window !== 'undefined') window.location.reload(); }}
              className="rounded-lg border border-carvao-200 px-3 py-1.5 text-xs font-semibold text-carvao-500 transition hover:border-carvao-300 hover:text-carvao-700 lg:hidden dark:border-carvao-700 dark:text-texto-suave"
            >
              Sair
            </button>
            <IndicadorNuvem />
            <AlternadorTema />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-0 lg:px-4">

        {/* ── Sidebar desktop — mesma lógica de grupos do menu mobile ─── */}
        <aside className="sticky top-[59px] hidden h-[calc(100vh-59px)] w-52 shrink-0 flex-col gap-1 border-r border-carvao-100 py-6 pr-3 lg:flex dark:border-carvao-800 print:hidden">
          {gruposVisiveis.map((g) => {
            const ativo = g.id === grupoAtivo.id;
            return (
              <button
                key={g.id}
                onClick={() => setAba(g.abas[0] as AbaId)}
                aria-current={ativo ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-subtitulo font-semibold transition ${
                  ativo
                    ? 'bg-brand-50 text-brand-700 dark:bg-carvao-800 dark:text-brand-300'
                    : 'text-carvao-500 hover:bg-carvao-50 hover:text-carvao-800 dark:text-texto-suave dark:hover:bg-carvao-800/60'
                }`}
              >
                <Icone nome={g.id} tam={19} />
                {g.rotulo}
              </button>
            );
          })}

          {/* Rodapé — identidade do perfil e sair (alma do workspace) */}
          <div className="mt-auto border-t border-carvao-100 pt-3 dark:border-carvao-800">
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-carvao-800 dark:text-brand-300">
                <Icone nome="usuario" tam={16} />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-rotulo font-bold text-carvao-700 dark:text-areia-100">{perfil?.rotulo ?? 'Perfil'}</p>
                <button
                  onClick={() => { sair(); if (typeof window !== 'undefined') window.location.reload(); }}
                  className="text-caption font-semibold text-texto-suave transition hover:text-perigo"
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        </aside>

      <main className="min-w-0 flex-1 space-y-4 px-4 pb-28 pt-5 lg:max-w-5xl lg:pb-8">

        {/* ── Barra de semana ─────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carvao-100 pb-5 dark:border-carvao-800">
          <div>
            <h1 className="font-display text-2xl font-bold text-carvao-900 dark:text-white sm:text-3xl">
              {periodoSemana(semanaId)}
            </h1>
            <div className="mt-2 max-w-xs">
              <MiniEtapas
                etapa={estado.etapa}
                sufixo={semanaId === semanaAtualId ? 'semana atual' : 'semana planejada'}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => irSemana(-1)}
              aria-label="Semana anterior"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-texto-suave transition hover:bg-carvao-100 hover:text-carvao-700 dark:hover:bg-carvao-800"
            >
              <Icone nome="anterior" tam={17} />
            </button>
            <button
              onClick={() => setSemanaSheet(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-carvao-700 tabular-nums transition hover:bg-carvao-100 dark:text-areia-200 dark:hover:bg-carvao-800"
            >
              <Icone nome="calendario" tam={14} className="text-texto-suave" />
              {periodoSemana(semanaId)}
            </button>
            <button
              onClick={() => irSemana(1)}
              aria-label="Próxima semana"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-texto-suave transition hover:bg-carvao-100 hover:text-carvao-700 dark:hover:bg-carvao-800"
            >
              <Icone nome="proximo" tam={17} />
            </button>
          </div>
        </div>

        {/* Desktop: navegação na sidebar à esquerda. Mobile: BottomNav inferior. */}

        {/* ── Contexto da área: uma hierarquia única para todo o produto ── */}
        <section className="flex flex-col gap-3 rounded-2xl border border-carvao-100 bg-white px-4 py-4 shadow-sm dark:border-carvao-800 dark:bg-carvao-900 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-micro font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">{areaMeta.kicker}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-carvao-900 dark:text-white sm:text-2xl">{areaMeta.titulo}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-texto-suave">{areaMeta.descricao}</p>
          </div>
          {aba === 'cardapio' && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={() => setPosterAberto(true)}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
              >
                <Icone nome="imagem" tam={16} /> Pôster
              </button>
              {podeAvaliar && (
                <button
                  onClick={() => setPlaquinhaAberta(true)}
                  className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
                >
                  <Icone nome="cotacao" tam={16} /> QR de feedback
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Conteúdo ─────────────────────────────────────── */}
        {!pronto ? (
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-24" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {/* ── INÍCIO ────────────────────────────────────── */}
            {aba === 'agora' && (
              <div className="space-y-4">
                {/* Painel do Diretor — leitura de 5s, só para gestão */}
                {(papel === 'gestor' || papel === 'administrador') && (
                  <>
                    <PainelDiretor
                      nome={perfil?.rotulo ?? 'Gestor'}
                      precos={precos}
                      historico={historico}
                      fornecedores={fornecedores}
                      perfis={perfisFornecedores}
                      aceitacao={aceitacao}
                      estoque={estoque}
                    />
                    <div className="h-px bg-gradient-to-r from-transparent via-carvao-200 to-transparent dark:via-carvao-700" />
                  </>
                )}
                <BriefingCard
                  estado={estado}
                  semanaId={semanaId}
                  precos={precos}
                  aceitacao={aceitacao}
                  estoque={estoque}
                  historico={historico}
                  fornecedores={fornecedores}
                  onOpenIA={() => setIaAberta(true)}
                  nomeUsuario={perfil?.rotulo}
                />
                {/* Copiloto — o que fazer nesta semana, com número. Fica no
                    Início de propósito: escondido numa aba de painel flutuante
                    ninguém via, e o app parecia não ter mudado. */}
                <CopilotoSemana
                  estado={estado}
                  semanaId={semanaId}
                  precos={precos}
                  estimativas={estimativas}
                  onAbrirTudo={() => setIaAberta(true)}
                />

                <AbaAgora
                  estado={estado}
                  precos={precos}
                  aceitacao={aceitacao}
                  fatores={fatores}
                  papel={papel}
                  irPara={(alvo) => irPara(alvo as AbaId)}
                />
              </div>
            )}

            {/* ── CARDÁPIO ──────────────────────────────────── */}
            {aba === 'cardapio' && (
              <div className="space-y-4">
                {/* Categorias — Montar / Operação / Avaliação */}
                <div className="flex gap-4 border-b border-carvao-100 dark:border-carvao-800">
                  {([
                    { id: 'montar' as const,    rotulo: 'Planejamento' },
                    { id: 'operacao' as const,  rotulo: 'Execução' },
                    ...(podeAvaliar ? [{ id: 'avaliacao' as const, rotulo: 'Feedback' }] : []),
                  ]).map((seg) => (
                    <button
                      key={seg.id}
                      onClick={() => setAbaCardapioSeg(seg.id)}
                      className={`relative whitespace-nowrap pb-3 text-sm font-semibold transition ${
                        abaCardapioSeg === seg.id
                          ? 'text-brand-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-brand-600 dark:text-brand-400'
                          : 'text-texto-suave hover:text-carvao-600 dark:text-carvao-500'
                      }`}
                    >
                      {seg.rotulo}
                    </button>
                  ))}
                </div>

                {abaCardapioSeg === 'montar' && (
                  <div className="space-y-6">
                    <AlertaProteinaDia dias={estado.dias} estoque={estoque} funcionarios={funcionarios} />
                    <AbaCardapio
                      estado={estado}
                      atualizar={atualizar}
                      semanaId={semanaId}
                      fatores={fatores}
                      podeEditar={podeEditarCardapio}
                      precos={precos}
                      definirPreco={definirPreco}
                      definirFornecedor={definirFornecedor}
                      cadastrarItem={cadastrarItem}
                      registrarOferta={registrarOferta}
                      fornecedores={fornecedores}
                      itensExtras={itensExtras}
                    />
                  </div>
                )}

                {abaCardapioSeg === 'operacao' && (
                  <div className="space-y-6">
                    <AbaContagem
                      contagens={contagens}
                      onRegistrar={registrarContagem}
                      estado={estado}
                      atualizar={atualizar}
                      precos={precos}
                      fatores={fatores}
                      papel={papel}
                    />
                    {/* Registrar sobra do dia — tarefa operacional diária */}
                    <AbaDesperdicio
                      estado={estado}
                      precos={precos}
                      fatores={fatores}
                      registros={desperdicio}
                      adicionar={addDesperdicio}
                      remover={rmDesperdicio}
                      podeEditar={podeEstoque}
                    />
                    <AbaFluxo
                      estado={estado}
                      atualizar={atualizar}
                      papel={papel}
                      precos={precos}
                      fatores={fatores}
                      aprenderDeSemana={aprenderDeSemana}
                      irPara={(alvo) => irPara(alvo as AbaId)}
                    />
                  </div>
                )}

                {abaCardapioSeg === 'avaliacao' && podeAvaliar && (
                  <div className="space-y-6">
                    <AbaAceitacao
                      estado={estado}
                      aceitacao={aceitacao}
                      avaliar={avaliar}
                      eventos={eventos}
                      addEvento={addEvento}
                      rmEvento={rmEvento}
                      desperdicio={desperdicio}
                      podeEditar={podeAvaliar}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── COMPRAS ───────────────────────────────────── */}
            {aba === 'compras' && (
              <div className="space-y-4">
                {/* segmento Lista / Estoque / NF / Fornecedores / Pedido */}
                <div className="flex gap-4 overflow-x-auto border-b border-carvao-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-carvao-800">
                  {(['lista', 'estoque', 'nf', 'fornecedores', 'pedido'] as const).map((seg) => (
                    <button
                      key={seg}
                      onClick={() => setAbaCompras(seg)}
                      className={`relative shrink-0 whitespace-nowrap pb-3 text-sm font-semibold transition ${
                        abaCompras === seg
                          ? 'text-brand-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-brand-600 dark:text-brand-400'
                          : 'text-texto-suave hover:text-carvao-600 dark:text-carvao-500'
                      }`}
                    >
                      {seg === 'lista' ? (
                        <><span className="sm:hidden">Lista</span><span className="hidden sm:inline">Necessidades</span></>
                      ) : seg === 'estoque' ? 'Estoque'
                      : seg === 'nf' ? (
                        <><span className="sm:hidden">NF</span><span className="hidden sm:inline">Notas fiscais</span></>
                      ) : seg === 'fornecedores' ? (
                        <><span className="sm:hidden">Forn.</span><span className="hidden sm:inline">Fornecedores</span></>
                      ) : 'Pedidos'}
                    </button>
                  ))}
                </div>

                {abaCompras === 'lista' && (
                  <AbaCompras
                    estado={estado}
                    atualizar={atualizar}
                    semanaId={semanaId}
                    papel={papel}
                    precos={precos}
                    fornecedores={fornecedores}
                    ofertas={ofertas}
                    historico={historico}
                    fatores={fatores}
                    definirPreco={definirPreco}
                    definirFornecedor={definirFornecedor}
                    registrarOferta={registrarOferta}
                  />
                )}

                {abaCompras === 'estoque' && (
                  <AbaEstoque
                    estado={estado}
                    fatores={fatores}
                    estoque={estoque}
                    movimentar={movimentar}
                    definirMinimo={definirMinimo}
                    definirSaldo={definirSaldo}
                    podeEditar={podeEstoque}
                    semanaId={semanaId}
                  />
                )}

                {abaCompras === 'nf' && (
                  <AbaNF
                    precos={precos}
                    onAplicarPrecos={(itens) => {
                      itens.forEach(({ norm, valor, nome }) => definirPreco(norm, valor, nome));
                    }}
                    onRegistrarFornecedor={(nome, cnpj, itens) => {
                      salvarPerfilFornecedor(nome, { obs: cnpj ? `CNPJ: ${cnpj}` : undefined });
                      itens?.forEach((i) => definirFornecedor(i.norm, nome));
                    }}
                  />
                )}

                {abaCompras === 'fornecedores' && (
                  <AbaFornecedorIntel
                    fornecedores={fornecedores}
                    perfis={perfisFornecedores}
                    precos={precos}
                    onSalvarPerfil={salvarPerfilFornecedor}
                    onAdicionarAvaliacao={adicionarAvaliacaoFornecedor}
                    onRenomear={renomearFornecedor}
                  />
                )}

                {abaCompras === 'pedido' && (
                  <AbaPedido
                    estado={estado}
                    semanaId={semanaId}
                    fatores={fatores}
                    fornecedores={fornecedores}
                    perfis={perfisFornecedores}
                    precos={precos}
                    papel={papel}
                  />
                )}
              </div>
            )}

            {/* ── RELATÓRIOS ────────────────────────────────── */}
            {aba === 'relatorios' && (
              <div className="space-y-6">
                {/* KPIs — leitura gerencial em 4 blocos compactos */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi
                    rotulo="Custo da semana"
                    valor={kpisRelatorios.custoSemana > 0 ? formatarReais(kpisRelatorios.custoSemana) : '—'}
                    tom="neutro"
                  />
                  <Kpi
                    rotulo="Custo / refeição"
                    valor={kpisRelatorios.custoRef ? formatarReais(kpisRelatorios.custoRef) : '—'}
                    tom="verde"
                  />
                  <Kpi
                    rotulo="Aceitação média"
                    valor={kpisRelatorios.mediaAceit !== null ? `${kpisRelatorios.mediaAceit.toFixed(1)}★` : '—'}
                    tom="ouro"
                  />
                  <Kpi
                    rotulo="Desperdício"
                    valor={kpisRelatorios.desperdicioPct !== null ? `${Math.round(kpisRelatorios.desperdicioPct)}%` : '—'}
                    tom={kpisRelatorios.desperdicioPct !== null && kpisRelatorios.desperdicioPct >= 15 ? 'vermelho' : 'neutro'}
                  />
                </div>
                {/* sub-abas por TEMA — navegação por assunto, não dump vertical */}
                <div className="flex gap-1 overflow-x-auto rounded-2xl bg-carvao-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-carvao-800">
                  {([
                    { id: 'gerencial',    rotulo: 'Resumo',          curto: 'Resumo' },
                    { id: 'custos',       rotulo: 'Custos',          curto: 'Custos' },
                    { id: 'rankings',     rotulo: 'Qualidade & DNA', curto: 'Qualid.' },
                    { id: 'previsao',     rotulo: 'Previsão',        curto: 'Prev.' },
                    { id: 'fornecedores', rotulo: 'Fornecedores',    curto: 'Forn.' },
                    { id: 'gastos',       rotulo: 'Gastos',           curto: 'Gastos' },
                    ...(pode(papel, 'auditoria:ver') ? [{ id: 'auditoria', rotulo: 'Auditoria', curto: 'Audit.' }] : []),
                  ] as { id: typeof abaRelatorios; rotulo: string; curto: string }[]).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setAbaRelatorios(s.id)}
                      className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-rotulo font-semibold transition ${
                        abaRelatorios === s.id
                          ? 'bg-white shadow-sm dark:bg-carvao-700'
                          : 'text-carvao-500 hover:text-carvao-700 dark:text-texto-suave'
                      }`}
                    >
                      <span className="sm:hidden">{s.curto}</span>
                      <span className="hidden sm:inline">{s.rotulo}</span>
                    </button>
                  ))}
                </div>

                {abaRelatorios === 'gerencial' && (
                  <CentralGerencial
                    estado={estado}
                    semanaId={semanaId}
                    precos={precos}
                    historico={historico}
                    aceitacao={aceitacao}
                    fornecedores={fornecedores}
                    fatores={fatores}
                  />
                )}

                {abaRelatorios === 'custos' && (
                  <>
                    <CardapioOrientadoDados
                      dias={estado.dias}
                      precos={precos}
                      aceitacao={aceitacao}
                      historico={historico}
                    />
                    <AbaCustoPrato dias={estado.dias} precos={precos} />
                    <RoiCard precos={precos} historico={historico} fatores={fatores} />
                  </>
                )}

                {abaRelatorios === 'rankings' && (
                  <div className="space-y-6">
                    <LinhaTempoCasa />
                    <DnaCard />
                  </div>
                )}

                {abaRelatorios === 'previsao' && (
                  <PrevisaoCard
                    semanaId={semanaId}
                    onPessoasAtualizadas={
                      podeEditarCardapio
                        ? (pessoas) => {
                            atualizar((e) => ({
                              ...e,
                              dias: e.dias.map((d, i) =>
                                pessoas[i] != null ? { ...d, pessoas: pessoas[i] } : d,
                              ),
                            }));
                            toast('Previsão aplicada às refeições da semana');
                          }
                        : undefined
                    }
                  />
                )}

                {abaRelatorios === 'fornecedores' && (
                  <AbaRadar precos={precos} historico={historico} fornecedores={fornecedores} />
                )}

                {abaRelatorios === 'gastos' && <AbaGastos />}

                {abaRelatorios === 'auditoria' && pode(papel, 'auditoria:ver') && (
                  <AbaAuditoria papel={papel} />
                )}
              </div>
            )}

            {/* ── AJUSTES ───────────────────────────────────── */}
            {aba === 'ajustes' && (
              <div className="space-y-8">
                {/* Equipe e restrições alimentares */}
                <SecaoAjuste titulo="Pessoas e restrições">
                  <AbaFuncionarios
                    funcionarios={funcionarios}
                    dias={estado.dias}
                    onSalvar={salvarFuncionario}
                    onAtualizar={atualizarFuncionario}
                    onRemover={removerFuncionario}
                  />
                </SecaoAjuste>

                {/* Configurações (PINs etc) — só gerência */}
                {(papel === 'administrador' || papel === 'gestor') && (
                  <SecaoAjuste titulo="Acessos e permissões">
                    <Configuracoes />
                  </SecaoAjuste>
                )}
              </div>
            )}
          </>
        )}
      </main>
      </div>

      {/* ── Sheet: Seletor de semana ─────────────────────── */}
      <BottomSheet titulo="Escolher semana" aberto={semanaSheet} aoFechar={() => setSemanaSheet(false)}>
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={duplicarSemanaAnterior}
              disabled={!podeEditarCardapio}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-carvao-200 px-3 py-2.5 text-nota font-semibold text-carvao-700 transition hover:bg-carvao-50 disabled:opacity-40 dark:border-carvao-600 dark:text-areia-200"
            >
              <Icone nome="somar" tam={16} /> Duplicar anterior
            </button>
            <button
              onClick={() => { setSemanaId(deslocarSemana(semanaId, 1)); setSemanaSheet(false); }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-carvao-200 px-3 py-2.5 text-nota font-semibold text-carvao-700 transition hover:bg-carvao-50 dark:border-carvao-600 dark:text-areia-200"
            >
              <Icone nome="proximo" tam={16} /> Próxima semana
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-carvao-200 px-3 py-2 dark:border-carvao-600">
            <Icone nome="calendario" tam={16} className="shrink-0 text-texto-suave" />
            <span className="shrink-0 text-nota font-semibold text-carvao-500">Ir para a semana de</span>
            <input
              type="date"
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split('-').map(Number);
                setSemanaId(idSemanaIso(new Date(y, m - 1, d)));
                setSemanaSheet(false);
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:[color-scheme:dark]"
            />
          </label>
        </div>
        <div className="space-y-1">
          {listaSemanas.map((id) => (
            <button
              key={id}
              onClick={() => { setSemanaId(id); setSemanaSheet(false); }}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold tabular-nums transition ${
                id === semanaId
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-500/30 dark:bg-carvao-700 dark:text-brand-300'
                  : 'hover:bg-carvao-50 dark:hover:bg-carvao-800'
              }`}
            >
              <span>{rotuloSemana(id)}</span>
              {id === semanaAtualId && (
                <span className="text-caption font-bold text-brand-600 dark:text-brand-400">atual</span>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomNav
        grupos={gruposVisiveis}
        grupoAtivo={grupoAtivo.id}
        aoSelecionar={(g) => {
          const grupo = GRUPOS.find((x) => x.id === g);
          if (grupo) setAba(grupo.abas[0] as AbaId);
        }}
      />
      <Assistente
        contexto={{ estado, semanaId, precos, historico, fornecedores, aceitacao, estoque, fatores }}
        aberto={iaAberta}
        aoMudarAberto={setIaAberta}
      />
      <ToastHost />
      <TourOnboarding />
    </>
  );
}

/* ── Seção de Ajustes ────────────────────────────────────── */

function SecaoAjuste({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-micro font-bold uppercase tracking-[0.16em] text-texto-suave">{titulo}</p>
      {children}
    </div>
  );
}
