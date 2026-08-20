'use client';

import { useMemo, useState } from 'react';
import { PERGUNTAS_SUGERIDAS, insightProativo, resumoEstrategico, responder, responderAsync, type ContextoAssistente } from '@/lib/cardapio/assistente';
import { montarDossieCompleto } from '@/lib/cardapio/estado';
import { Icone } from '@/components/Icones';
import { InteligenciaCard } from './InteligenciaCard';
import { ChefIA } from './ChefIA';

interface Fala {
  de: 'voce' | 'assistente';
  texto: string;
  itens?: string[];
}

type Aba = 'chat' | 'chefia' | 'objetivos';

export function Assistente({
  contexto,
  aberto: abertoProp,
  aoMudarAberto,
}: {
  contexto: ContextoAssistente;
  aberto?: boolean;
  aoMudarAberto?: (v: boolean) => void;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const aberto = abertoProp !== undefined ? abertoProp : abertoInterno;
  const setAberto = (v: boolean) => {
    if (aoMudarAberto) aoMudarAberto(v);
    else setAbertoInterno(v);
  };
  const [aba, setAba] = useState<Aba>('chat');
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [falas, setFalas] = useState<Fala[]>([
    { de: 'assistente', texto: 'Pode me perguntar qualquer coisa sobre a operação — ou tocar numa sugestão abaixo.' },
  ]);

  const proativo = useMemo(() => insightProativo(contexto), [contexto]);
  const estrategia = useMemo(() => resumoEstrategico(contexto), [contexto]);

  const perguntar = async (pergunta: string) => {
    const p = pergunta.trim();
    if (!p || pensando) return;
    setAba('chat');
    setFalas((f) => [...f, { de: 'voce', texto: p }]);
    setEntrada('');
    setPensando(true);
    try {
      const dossie = montarDossieCompleto({
        semanaId: contexto.semanaId,
        estado: contexto.estado,
        precos: contexto.precos,
        aceitacao: contexto.aceitacao,
        estoque: contexto.estoque,
        historico: contexto.historico,
        fornecedores: contexto.fornecedores,
      });
      const r = await responderAsync(p, contexto, dossie);
      setFalas((f) => [...f, { de: 'assistente', texto: r.texto, itens: r.itens }]);
    } catch {
      const r = responder(p, contexto);
      setFalas((f) => [...f, { de: 'assistente', texto: r.texto, itens: r.itens }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(!aberto)}
        aria-label="Inteligência Tatá House"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-flutuante transition hover:scale-105 active:scale-95 lg:bottom-5 lg:right-5 print:hidden"
      >
        <Icone nome={aberto ? 'fechar' : 'chefIA'} tam={24} />
        {proativo && !aberto && (
          <span className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-ouro-400 ring-2 ring-white" aria-hidden />
        )}
      </button>

      {aberto && (
        <div className="fixed bottom-36 right-4 z-50 flex max-h-[80vh] w-[min(96vw,420px)] flex-col overflow-hidden rounded-3xl bg-white shadow-flutuante ring-1 ring-carvao-200 animate-subir lg:bottom-24 lg:right-5 dark:bg-carvao-850 dark:ring-carvao-700 print:hidden">
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-brand-800 to-brand-600 px-4 py-3 text-white">
            <Icone nome="chefIA" tam={20} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold tracking-wide">Inteligência Tatá House</p>
              <p className="text-micro uppercase tracking-wider text-brand-200">análise local · sem dados externos</p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex border-b border-carvao-100 dark:border-carvao-700">
            {(['chat', 'chefia', 'objetivos'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={`flex-1 py-2.5 text-nota font-semibold transition ${
                  aba === a
                    ? 'border-b-2 border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                    : 'text-texto-suave hover:text-carvao-700 dark:text-carvao-500'
                }`}
              >
                {a === 'chat' ? 'Perguntar' : a === 'chefia' ? 'Chef IA' : 'Objetivos'}
              </button>
            ))}
          </div>

          {/* Conteúdo Chat */}
          {aba === 'chat' && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {estrategia ? (
                  <div className="rounded-2xl bg-gradient-to-br from-carvao-900 via-carvao-850 to-brand-900 p-3.5 text-white">
                    <p className="text-sm font-semibold leading-snug">{estrategia.titulo}</p>
                    <ul className="mt-2 space-y-1.5">
                      {estrategia.itens.map((it, j) => (
                        <li key={j} className="flex gap-2 text-nota text-areia-50/90">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ouro-400" />
                          <span className="leading-snug">{it}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => perguntar('Como reduzir o custo da próxima semana?')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ouro-400 px-3.5 py-1.5 text-caption font-bold text-carvao-900 transition hover:bg-ouro-300"
                    >
                      Montar plano de economia <Icone nome="proximo" tam={12} />
                    </button>
                  </div>
                ) : proativo ? (
                  <div className="rounded-2xl bg-ouro-300/15 p-3 ring-1 ring-ouro-400/30">
                    <p className="text-sm text-carvao-700 dark:text-areia-100">{proativo.texto}</p>
                    {proativo.itens && (
                      <ul className="mt-1 space-y-0.5 text-nota">
                        {proativo.itens.map((it, j) => (
                          <li key={j} className="flex gap-1.5">
                            <span className="text-ouro-500">•</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
                {falas.map((f, i) => (
                  <div key={i} className={f.de === 'voce' ? 'text-right' : ''}>
                    <div
                      className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        f.de === 'voce'
                          ? 'bg-brand-600 text-white'
                          : 'bg-areia-100 text-carvao-700 dark:bg-carvao-700 dark:text-areia-100'
                      }`}
                    >
                      <p>{f.texto}</p>
                      {f.itens && (
                        <ul className="mt-1.5 space-y-1 text-left text-nota">
                          {f.itens.map((it, j) => (
                            <li key={j} className="flex gap-1.5">
                              <span className="text-brand-400">•</span>
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
                {pensando && (
                  <div>
                    <div className="inline-block rounded-2xl bg-areia-100 px-3 py-2 dark:bg-carvao-700">
                      <span className="inline-flex gap-1 text-texto-suave">
                        <span className="animate-pulse">●</span>
                        <span className="animate-pulse [animation-delay:150ms]">●</span>
                        <span className="animate-pulse [animation-delay:300ms]">●</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sugestões rápidas */}
              <div className="flex gap-1.5 overflow-x-auto border-t border-carvao-100 px-3 py-2 dark:border-carvao-700">
                {PERGUNTAS_SUGERIDAS.slice(0, 4).map((p) => (
                  <button
                    key={p}
                    onClick={() => perguntar(p)}
                    className="shrink-0 whitespace-nowrap rounded-full bg-brand-50 px-3 py-1 text-caption font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-carvao-700 dark:text-brand-300"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); perguntar(entrada); }}
                className="flex gap-2 border-t border-carvao-100 p-3 dark:border-carvao-700"
              >
                <input
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  disabled={pensando}
                  placeholder="Pergunte algo sobre a operação…"
                  className="min-h-10 flex-1 rounded-2xl border border-carvao-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-carvao-600 dark:bg-carvao-900"
                />
                <button
                  type="submit"
                  disabled={pensando}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-700 text-white transition hover:bg-brand-800 disabled:opacity-60"
                  aria-label="Enviar"
                >
                  <Icone nome="proximo" tam={18} />
                </button>
              </form>
            </>
          )}

          {/* Conteúdo Chef IA — recomendações da semana, centralizadas aqui */}
          {aba === 'chefia' && (
            <div className="flex-1 overflow-y-auto p-4">
              <ChefIA estado={contexto.estado} precos={contexto.precos} semanaId={contexto.semanaId} expandido />
            </div>
          )}

          {/* Conteúdo Objetivos */}
          {aba === 'objetivos' && (
            <div className="flex-1 overflow-y-auto p-4">
              <InteligenciaCard
                estado={contexto.estado}
                semanaId={contexto.semanaId}
                precos={contexto.precos}
                aceitacao={contexto.aceitacao}
                estoque={contexto.estoque}
                historico={contexto.historico}
                fornecedores={contexto.fornecedores}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
