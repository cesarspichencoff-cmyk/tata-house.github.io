'use client';

import { useMemo } from 'react';
import { Icone } from '@/components/Icones';
import { resumoSemana } from '@/lib/cardapio/indicadores';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { formatarReais } from '@/lib/cardapio/motor';
import type { EstadoSemana, Aceitacao, Etapa } from '@/lib/cardapio/tipos';
import type { Papel } from '@/lib/cardapio/tipos';

const ETAPAS = [
  { id: 'rascunho',    rotulo: 'Rascunho'   },
  { id: 'cozinha',     rotulo: 'Cozinha'     },
  { id: 'compras',     rotulo: 'Compras'     },
  { id: 'recebimento', rotulo: 'Recebimento' },
  { id: 'concluido',   rotulo: 'Concluída'   },
] as const;

const DIAS_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

function idxEtapa(e: Etapa) {
  return ETAPAS.findIndex((x) => x.id === e);
}

function mediaAceitacaoGlobal(aceitacao: Aceitacao): number | null {
  let soma = 0, n = 0;
  Object.values(aceitacao).forEach((r) => {
    if (r.n > 0) { soma += r.somaNotas; n += r.n; }
  });
  return n > 0 ? soma / n : null;
}

function sugestoesParaCardapio(aceitacao: Aceitacao): { prato: string; nota: number }[] {
  return Object.values(aceitacao)
    .filter((r) => r.n >= 2 && r.somaNotas / r.n >= 3.5)
    .map((r) => ({ prato: r.prato, nota: r.somaNotas / r.n }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 4);
}

/* ── Progresso de etapa — linha simples ─────────────────── */

function EtapaProgress({ etapa }: { etapa: Etapa }) {
  const ativo = idxEtapa(etapa);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {ETAPAS.map((e, i) => (
          <div key={e.id} className="flex flex-1 items-center gap-1">
            <div
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i < ativo
                  ? 'bg-brand-600'
                  : i === ativo
                  ? 'bg-brand-600'
                  : 'bg-carvao-100 dark:bg-carvao-800'
              }`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {ETAPAS.map((e, i) => (
          <span
            key={e.id}
            className={`text-micro font-semibold ${
              i === ativo
                ? 'text-brand-600 dark:text-brand-400'
                : i < ativo
                ? 'text-texto-suave'
                : 'text-carvao-300 dark:text-carvao-700'
            }`}
          >
            {e.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Barra de progresso linear ───────────────────────────── */

function BarraProgresso({ valor, total, rotulo }: { valor: number; total: number; rotulo: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-carvao-500 dark:text-texto-suave">{rotulo}</span>
        <span className="font-display text-lg font-bold text-carvao-900 dark:text-white">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-carvao-100 dark:bg-carvao-800">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-texto-suave">
        {valor} de {total} {valor === 1 ? 'item' : 'itens'}
      </p>
    </div>
  );
}

/* ── Botão primário único ────────────────────────────────── */

function BotaoPrimario({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function BotaoSecundario({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-carvao-200 px-6 py-3 text-sm font-semibold text-carvao-700 transition hover:bg-carvao-50 dark:border-carvao-700 dark:text-areia-200 dark:hover:bg-carvao-800"
    >
      {children}
    </button>
  );
}

/* ── Props ───────────────────────────────────────────────── */

interface Props {
  estado: EstadoSemana;
  precos: Record<string, number>;
  aceitacao: Aceitacao;
  fatores: Record<string, number>;
  papel: Papel;
  irPara: (aba: string) => void;
}

/* ── Componente principal ────────────────────────────────── */

export function AbaAgora({ estado, precos, aceitacao, fatores, papel, irPara }: Props) {
  const { estimativas } = useEstimativas();
  const resumo = useMemo(() => resumoSemana(estado, precos, fatores, estimativas), [estado, precos, fatores, estimativas]);
  const etapa = estado.etapa;
  const media = useMemo(() => mediaAceitacaoGlobal(aceitacao), [aceitacao]);
  const podeEditar = papel === 'gestor' || papel === 'administrador' || papel === 'cozinha';

  return (
    <div className="space-y-10">

      {/* Progresso da semana */}
      <EtapaProgress etapa={etapa} />

      {/* Conteúdo contextual — um objetivo por vez */}
      <div className="space-y-6">

        {/* ── RASCUNHO ──────────────────────────────────── */}
        {etapa === 'rascunho' && (
          <>
            <div>
              <p className="text-xs font-bold text-texto-suave">Próximo passo</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-carvao-900 dark:text-white">
                Monte o cardápio
              </h2>
              <p className="mt-2 text-base leading-relaxed text-carvao-500 dark:text-texto-suave">
                Defina os pratos e a lista de compras é gerada automaticamente.
              </p>
            </div>

            {/* Sugestões — pratos aprovados pela equipe */}
            {(() => {
              const sugs = sugestoesParaCardapio(aceitacao);
              if (sugs.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-texto-suave">Aprovados pela equipe</p>
                  <div className="flex flex-wrap gap-2">
                    {sugs.map((s) => (
                      <span
                        key={s.prato}
                        className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-rotulo font-semibold text-brand-700 dark:bg-carvao-800 dark:text-brand-300"
                      >
                        {s.prato}
                        <span className="text-caption font-bold text-brand-400 dark:text-brand-500">
                          {s.nota.toFixed(1)}★
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {podeEditar && (
              <BotaoPrimario onClick={() => irPara('cardapio')}>
                Montar cardápio <Icone nome="proximo" tam={15} />
              </BotaoPrimario>
            )}
          </>
        )}

        {/* ── COZINHA ───────────────────────────────────── */}
        {etapa === 'cozinha' && (
          <>
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-ouro-600 dark:text-ouro-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ouro-500" />
                Com a cozinha
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-carvao-900 dark:text-white">
                Aguardando revisão
              </h2>
            </div>
            <div className="space-y-0 divide-y divide-carvao-50 dark:divide-carvao-800/40">
              {estado.dias.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <span className="w-8 shrink-0 text-xs font-bold text-texto-suave">{DIAS_PT[i]}</span>
                  <span className={`text-sm ${d.principal ? 'font-medium text-carvao-800 dark:text-areia-100' : 'text-carvao-300 dark:text-carvao-700'}`}>
                    {d.principal || '—'}
                  </span>
                </div>
              ))}
            </div>
            <BotaoPrimario onClick={() => irPara('cardapio')}>
              {papel === 'cozinha' ? 'Revisar cardápio' : 'Ver cardápio'} <Icone nome="proximo" tam={15} />
            </BotaoPrimario>
          </>
        )}

        {/* ── COMPRAS ───────────────────────────────────── */}
        {etapa === 'compras' && (
          <>
            <div>
              <p className="text-xs font-bold text-texto-suave">Em andamento</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-carvao-900 dark:text-white">
                Lista de compras
              </h2>
            </div>
            <BarraProgresso
              valor={resumo.itensComprados}
              total={resumo.itensTotal}
              rotulo="itens comprados"
            />
            <BotaoPrimario onClick={() => irPara('compras')}>
              Continuar compras <Icone nome="proximo" tam={15} />
            </BotaoPrimario>
          </>
        )}

        {/* ── RECEBIMENTO ───────────────────────────────── */}
        {etapa === 'recebimento' && (
          <>
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-ouro-600 dark:text-ouro-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ouro-500" />
                Aguardando entrega
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-carvao-900 dark:text-white">
                Conferir recebimento
              </h2>
            </div>
            <BarraProgresso
              valor={resumo.itensRecebidos}
              total={resumo.itensTotal}
              rotulo="itens recebidos"
            />
            <BotaoPrimario onClick={() => irPara('compras')}>
              Conferir na lista <Icone nome="proximo" tam={15} />
            </BotaoPrimario>
          </>
        )}

        {/* ── CONCLUÍDO ─────────────────────────────────── */}
        {etapa === 'concluido' && (
          <>
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-brand-600 dark:text-brand-400">
                <Icone nome="check" tam={12} />
                Semana concluída
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-carvao-900 dark:text-white">
                {media !== null && media >= 4
                  ? 'Semana excelente'
                  : (resumo.refeicoesReais || resumo.refeicoesPrevistas)
                  ? 'Semana fechada'
                  : 'Operação concluída'}
              </h2>
            </div>
            <div className="grid grid-cols-3 divide-x divide-carvao-100 dark:divide-carvao-800">
              <div className="pr-6">
                <p className="font-display text-2xl font-bold text-carvao-900 dark:text-white">
                  {resumo.refeicoesReais || resumo.refeicoesPrevistas || '—'}
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">refeições</p>
              </div>
              <div className="px-6">
                <p className="font-display text-2xl font-bold text-carvao-900 dark:text-white">
                  {resumo.custoRefReal
                    ? formatarReais(resumo.custoRefReal)
                    : resumo.custoRefEstimado
                    ? formatarReais(resumo.custoRefEstimado)
                    : '—'}
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">por refeição</p>
              </div>
              <div className="pl-6">
                <p className="font-display text-2xl font-bold text-carvao-900 dark:text-white">
                  {media !== null ? `${media.toFixed(1)}★` : '—'}
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">aceitação</p>
              </div>
            </div>
            <BotaoSecundario onClick={() => irPara('cardapio')}>
              Avaliar pratos e registrar sobras <Icone nome="proximo" tam={15} />
            </BotaoSecundario>
          </>
        )}
      </div>

      {(papel === 'gestor' || papel === 'administrador') && (
        <button
          type="button"
          onClick={() => irPara('relatorios')}
          className="flex w-full items-center justify-between rounded-2xl border border-carvao-100 bg-carvao-50 px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50 dark:border-carvao-800 dark:bg-carvao-900 dark:hover:border-brand-900 dark:hover:bg-brand-950/20"
        >
          <span>
            <span className="block text-sm font-bold text-carvao-900 dark:text-white">Inteligência da semana</span>
            <span className="mt-0.5 block text-xs text-texto-suave">Cruza compra, NF, refeições, estoque, desperdício, preços e aceitação.</span>
          </span>
          <Icone nome="proximo" tam={15} className="shrink-0 text-brand-600" />
        </button>
      )}

      {/* Números de apoio — etapas intermediárias */}
      {(etapa === 'cozinha' || etapa === 'compras' || etapa === 'recebimento') &&
        (resumo.refeicoesPrevistas > 0 || resumo.custoRefEstimado) && (
          <div className="grid grid-cols-2 divide-x divide-carvao-100 border-t border-carvao-100 pt-8 dark:divide-carvao-800 dark:border-carvao-800">
            {resumo.refeicoesPrevistas > 0 && (
              <div className="pr-6">
                <p className="font-display text-2xl font-bold text-carvao-900 dark:text-white">
                  {resumo.refeicoesPrevistas}
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">refeições previstas</p>
              </div>
            )}
            <div className={resumo.refeicoesPrevistas > 0 ? 'pl-6' : ''}>
              {resumo.custoRefEstimado ? (
                <>
                  <p className="font-display text-2xl font-bold text-carvao-900 dark:text-white">
                    {formatarReais(resumo.custoRefEstimado)}
                  </p>
                  <p className="mt-0.5 text-xs text-texto-suave">estimado / refeição</p>
                </>
              ) : (
                <p className="text-sm text-texto-suave">Lance preços para ver o custo estimado</p>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
