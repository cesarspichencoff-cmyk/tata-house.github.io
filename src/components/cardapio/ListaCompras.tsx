'use client';

/* =====================================================================
   Lista de compras — modo compacto (item 15) + conferência cardápio ×
   compras (item 16). Agrupada por dia, com checkbox de conferência,
   cabeçalho mostrando o que será servido e o status do dia.

   Edição manual (item 4): com permissão, a equipe ajusta quantidade,
   unidade, remove itens, adiciona itens extras e deixa observação —
   direto aqui, sem precisar do modo detalhado. Toda alteração é
   registrada na auditoria pelos handlers recebidos.
   ===================================================================== */

import { useMemo, useState } from 'react';
import { Botao, Cartao, Modal, Pilula, estiloInput } from '@/components/ui';
import { Icone } from '@/components/Icones';
import { CampoQuantidadeCompra } from './CampoQuantidadeCompra';
import { DADOS, DIAS_SEMANA, formatarQtd, formatarReais, ingredienteBase, normalizar } from '@/lib/cardapio/motor';
import { linhasDoDiaComAprendizado } from '@/lib/cardapio/aprendizado-compras';
import { resolverPreco } from '@/lib/cardapio/precos';
import { ehRemetenteInterno } from '@/lib/cardapio/cotacao';
import comparativoJson from '@/lib/cardapio/comparativo-fornecedores.json';
import { confiancaPreco, COR_CONFIANCA } from '@/lib/cardapio/confianca';

/** Comparativo de fornecedores (planilha): item norm → cotações por preço. */
const COMPARATIVO = comparativoJson as Record<string, { f: string; p: number; u?: string }[]>;
import type { EstadoSemana, HistoricoPrecos } from '@/lib/cardapio/tipos';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Selo de confiança do preço — 🟢/🟡/🔴 com as evidências no title. */
function SeloConfianca({
  norm,
  historico,
  ofertas,
  temPreco,
}: {
  norm: string;
  historico: HistoricoPrecos;
  ofertas: Record<string, { fornecedor: string; preco: number }[]>;
  temPreco: boolean;
}) {
  const c = confiancaPreco(norm, historico, ofertas, temPreco);
  const cor = COR_CONFIANCA[c.nivel];
  return (
    <span
      className={`inline-flex items-center gap-1 ${cor.texto}`}
      title={`Confiança ${c.pct}% · baseado em ${c.baseado.join(', ')}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cor.ponto}`} />
      <span className="text-micro font-bold tabular-nums">{c.pct}%</span>
    </span>
  );
}

export function ListaCompras({
  estado,
  fatores,
  atualizar,
  podeComprar,
  podeEditar = false,
  mostrarBasicos = false,
  precos = {},
  estimativas = {},
  fornecedores = {},
  ofertas = {},
  historico = {},
  podePreco = false,
  definirPreco,
  definirFornecedor,
  registrarOferta,
  onAjuste,
  onAddManual,
  onRmManual,
  onEditManual,
}: {
  estado: EstadoSemana;
  fatores?: Record<string, number>;
  atualizar: (fn: (e: EstadoSemana) => EstadoSemana) => void;
  podeComprar: boolean;
  podeEditar?: boolean;
  mostrarBasicos?: boolean;
  precos?: Record<string, number>;
  estimativas?: Record<string, number>;
  fornecedores?: Record<string, string>;
  ofertas?: Record<string, { fornecedor: string; preco: number }[]>;
  historico?: HistoricoPrecos;
  podePreco?: boolean;
  definirPreco?: (itemNorm: string, valor: number | null, nome?: string) => void;
  definirFornecedor?: (itemNorm: string, marca: string | null) => void;
  registrarOferta?: (itemNorm: string, fornecedor: string, preco: number) => void;
  onAjuste?: (dia: number, chave: string, qtd: number | null, removido?: boolean, obs?: string, unid?: string) => void;
  onAddManual?: (dia: number, item: string, unid: string, qtd: number) => void;
  onRmManual?: (dia: number, idx: number) => void;
  onEditManual?: (dia: number, idx: number, patch: { qtd?: number; unid?: string }) => void;
}) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(false);
  const [novoItemDia, setNovoItemDia] = useState<number | null>(null);
  const [obsAberta, setObsAberta] = useState<string | null>(null);
  const [addFornDe, setAddFornDe] = useState<string | null>(null);
  const [novoForn, setNovoForn] = useState('');
  const [novoPreco, setNovoPreco] = useState('');
  const n = normalizar(busca);

  const podeMexerPreco = podePreco && !!definirPreco;

  /** Opções de fornecedor de um item: ofertas salvas + o fornecedor atual. */
  const opcoesFornecedor = (chave: string): { fornecedor: string; preco: number }[] => {
    // Remetentes internos (Érika / Tatá Sushi Compras) nunca aparecem como opção.
    const lista = [...(ofertas[chave] ?? [])].filter((o) => !ehRemetenteInterno(o.fornecedor));
    const atualForn = fornecedores[chave];
    const atualPreco = precos[chave];
    if (atualForn && !ehRemetenteInterno(atualForn) && !lista.some((o) => o.fornecedor.toLowerCase() === atualForn.toLowerCase())) {
      lista.push({ fornecedor: atualForn, preco: atualPreco ?? 0 });
    }
    return lista.sort((a, b) => a.preco - b.preco);
  };

  /** Troca o fornecedor ativo de um item: o preço da semana segue a escolha. */
  const escolherFornecedor = (chave: string, item: string, fornecedor: string) => {
    const opc = opcoesFornecedor(chave).find((o) => o.fornecedor === fornecedor);
    if (!opc) return;
    definirFornecedor?.(chave, fornecedor);
    if (opc.preco > 0) definirPreco?.(chave, opc.preco, item);
  };

  const salvarNovoForn = (chave: string, item: string) => {
    const f = novoForn.trim();
    const p = Number(novoPreco.replace(',', '.'));
    if (!f || !(p > 0)) return;
    registrarOferta?.(chave, f, p);
    definirFornecedor?.(chave, f);
    definirPreco?.(chave, p, item);
    setAddFornDe(null);
    setNovoForn('');
    setNovoPreco('');
  };

  const podeMexer = podeEditar && !!onAjuste;

  const toggle = (di: number, chave: string, comprado: boolean) =>
    atualizar((e) => ({
      ...e,
      status: {
        ...e.status,
        [di]: {
          ...(e.status[di] ?? {}),
          [chave]: { ...(e.status[di]?.[chave] ?? {}), compradoEm: comprado ? undefined : hojeIso() },
        },
      },
    }));

  const dias = useMemo(
    () =>
      estado.dias.map((dia, di) => {
        const todas = linhasDoDiaComAprendizado(estado, di, fatores, { mostrarBasicos });
        const linhas = n ? todas.filter((l) => normalizar(l.item).includes(n)) : todas;
        const comprados = todas.filter((l) => l.status.compradoEm).length;
        const servido = [dia.principal, dia.guarnicaoFixa, dia.guarnicao, dia.salada, dia.sobremesa].filter(Boolean);
        return { di, dia, linhas, total: todas.length, comprados, servido };
      }),
    [estado, fatores, n, mostrarBasicos],
  );

  const algumDia = dias.some((d) => d.dia.principal || d.total > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 print:hidden">
        <input
          className={`${estiloInput} flex-1`}
          placeholder="Buscar item…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {podeMexer && (
          <button
            onClick={() => setEditando((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-nota font-bold ring-1 transition ${
              editando
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-brand-700 ring-brand-500/30 hover:bg-brand-50 dark:bg-carvao-800 dark:text-brand-300'
            }`}
          >
            <Icone nome={editando ? 'check' : 'raio'} tam={16} /> {editando ? 'Concluir' : 'Editar'}
          </button>
        )}
      </div>

      {editando && (
        <p className="rounded-xl bg-ouro-300/15 px-3 py-2 text-rotulo font-semibold text-ouro-600 ring-1 ring-ouro-400/30">
          Modo edição — ajuste quantidades, troque unidades, remova ou adicione itens. Tudo fica registrado no histórico.
        </p>
      )}

      {!algumDia && (
        <p className="text-sm text-texto-suave">Monte o cardápio para gerar a lista de compras.</p>
      )}

      {dias.map(({ di, dia, linhas, total, comprados, servido }) => {
        if (!dia.principal && total === 0) return null;
        const status = total === 0 ? 'vazio' : comprados === total ? 'completo' : comprados > 0 ? 'parcial' : 'pendente';
        return (
          <Cartao key={di} className="overflow-hidden !p-0">
            {/* Cabeçalho do dia — conferência (servido × status) */}
            <div className="bg-areia-100/70 px-4 py-2.5 dark:bg-carvao-800/60">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold">{DIAS_SEMANA[di]}</h3>
                {status === 'completo' ? (
                  <Pilula tom="verde">✓ completo</Pilula>
                ) : status === 'parcial' ? (
                  <Pilula tom="ouro">faltam {total - comprados}</Pilula>
                ) : status === 'pendente' ? (
                  <Pilula tom="neutro">a comprar</Pilula>
                ) : null}
              </div>
              {servido.length > 0 && (
                <p className="mt-0.5 text-caption text-carvao-500 dark:text-areia-200">
                  <span className="font-semibold">Cardápio:</span> {servido.join(' · ')}
                </p>
              )}
              {total > 0 && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-carvao-200 dark:bg-carvao-700">
                  <div
                    className={`h-full rounded-full transition-all ${comprados === total ? 'bg-brand-500' : 'bg-ouro-400'}`}
                    style={{ width: `${total > 0 ? Math.round((comprados / total) * 100) : 0}%` }}
                  />
                </div>
              )}
            </div>

            {/* Checklist compacto */}
            {linhas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-texto-suave">
                {total === 0 ? 'Monte o cardápio para gerar a lista automaticamente.' : 'Nenhum item encontrado na busca.'}
              </p>
            ) : (
              <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
                {linhas.map((l) => {
                  const comprado = !!l.status.compradoEm;
                  const unidAtual = estado.ajustes[di]?.[l.chave]?.unidOverride ?? l.unid;
                  const obs = estado.ajustes[di]?.[l.chave]?.obs;

                  if (editando && podeMexer) {
                    return (
                      <li key={l.chave} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-sm font-medium">
                            {l.item}
                            {l.manual && <span className="ml-1 text-micro font-bold uppercase text-ouro-600">extra</span>}
                            {l.fonte === 'aprendido_app' && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-brand-600">aprendido</span>}
                          </span>
                          <CampoQuantidadeCompra
                            valor={l.qtd}
                            ariaLabel={`Quantidade de ${l.item}`}
                            aoConfirmar={(qtd) =>
                              l.manual
                                ? onEditManual?.(di, Number(l.chave.split(':')[1]), { qtd })
                                : onAjuste!(di, l.chave, qtd)
                            }
                            className="h-9 w-16 rounded-lg border border-carvao-200 bg-white px-1.5 text-center font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                          />
                          <select
                            value={unidAtual}
                            onChange={(e) =>
                              l.manual
                                ? onEditManual?.(di, Number(l.chave.split(':')[1]), { unid: e.target.value })
                                : onAjuste!(di, l.chave, null, undefined, undefined, e.target.value)
                            }
                            className="h-9 rounded-lg border border-carvao-200 bg-white px-1 text-xs dark:border-carvao-600 dark:bg-carvao-900"
                          >
                            {DADOS.unidades.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setObsAberta(obsAberta === `${di}:${l.chave}` ? null : `${di}:${l.chave}`)}
                            aria-label="Observação"
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                              obs ? 'text-brand-600' : 'text-carvao-300 hover:text-brand-600'
                            }`}
                          >
                            <Icone nome="feedback" tam={15} />
                          </button>
                          <button
                            onClick={() =>
                              l.manual
                                ? onRmManual?.(di, Number(l.chave.split(':')[1]))
                                : onAjuste!(di, l.chave, null, true)
                            }
                            aria-label={`Remover ${l.item}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-carvao-300 hover:bg-perigo/10 hover:text-perigo"
                          >
                            <Icone nome="fechar" tam={15} />
                          </button>
                        </div>
                        {obsAberta === `${di}:${l.chave}` && (
                          <input
                            autoFocus
                            type="text"
                            defaultValue={obs ?? ''}
                            placeholder="Observação / justificativa (ex.: cozinha pediu mais 5 kg)"
                            onBlur={(e) => onAjuste!(di, l.chave, null, undefined, e.target.value)}
                            className="mt-2 w-full rounded-lg border border-carvao-200 bg-white px-2 py-1.5 text-rotulo dark:border-carvao-600 dark:bg-carvao-900"
                          />
                        )}
                        {obs && obsAberta !== `${di}:${l.chave}` && (
                          <p className="mt-1 text-caption italic text-texto-suave">{obs}</p>
                        )}
                      </li>
                    );
                  }

                  return (
                    <li key={l.chave}>
                      <button
                        type="button"
                        disabled={!podeComprar}
                        onClick={() => toggle(di, l.chave, comprado)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-areia-50 disabled:cursor-default dark:hover:bg-carvao-800/40"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-caption font-bold ${
                            comprado
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-carvao-300 text-transparent dark:border-carvao-500'
                          }`}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${comprado ? 'text-texto-suave line-through' : 'font-medium'}`}>
                            {l.item}
                            {l.manual && <span className="ml-1 text-micro font-bold uppercase text-ouro-600">extra</span>}
                            {l.fonte === 'aprendido_app' && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-brand-600">aprendido</span>}
                            {!l.manual && l.fonte === 'receita' && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-ouro-600/70">rcta</span>
                            )}
                            {!l.manual && l.fonte === 'fallback' && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">est.</span>
                            )}
                            {obs && <span className="ml-1 text-caption italic text-texto-suave">· </span>}
                          </span>
                          {!podeMexerPreco && (() => {
                            // Mesma engine do cardápio: mostra um preço de referência
                            // para todo item que o motor consegue precificar (real →
                            // histórico/planilha → estimado), não só os cotados na mão.
                            const pr = resolverPreco(l.chave, precos, estimativas);
                            const temDireto = precos[l.chave] > 0;
                            // Fornecedor: o atribuído → oferta mais barata → comparativo
                            // da planilha. Assim o item mostra fornecedor mesmo quando a
                            // cotação não gravou um explicitamente.
                            // Preparo (mandioca frita) usa o fornecedor do
                            // ingrediente base (mandioca) quando não tem o seu.
                            const base = ingredienteBase(l.chave);
                            const ofertaForn = (ch: string) =>
                              ofertas[ch]?.filter((o) => !ehRemetenteInterno(o.fornecedor)).sort((a, b) => a.preco - b.preco)[0]?.fornecedor;
                            const fornAtribuido = fornecedores[l.chave] || fornecedores[base];
                            const forn = fornAtribuido
                              || ofertaForn(l.chave) || ofertaForn(base)
                              || COMPARATIVO[l.chave]?.[0]?.f || COMPARATIVO[base]?.[0]?.f;
                            const fornDaPlanilha = !fornAtribuido && !!forn;
                            if (!forn && pr.valor <= 0) return null;
                            return (
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro font-semibold text-brand-600 dark:text-brand-300">
                                <span>
                                  {forn || 'fornecedor não informado'}
                                  {fornDaPlanilha && (
                                    <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">sug.</span>
                                  )}
                                  {pr.valor > 0 && (
                                    <span className="font-normal text-texto-suave">
                                      {' · '}{formatarReais(pr.valor)}/{unidAtual}
                                      {!temDireto && (
                                        <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">
                                          {pr.tipo === 'estimado' ? 'est.' : 'ref.'}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                                {pr.valor > 0 && (
                                  <SeloConfianca norm={l.chave} historico={historico} ofertas={ofertas} temPreco={temDireto} />
                                )}
                              </span>
                            );
                          })()}
                        </span>
                        <span className={`shrink-0 self-start text-sm font-bold tabular-nums ${comprado ? 'text-texto-suave' : ''}`}>
                          {formatarQtd(l.qtd)} {unidAtual}
                        </span>
                      </button>

                      {/* Seletor de fornecedor — o preço da semana segue a escolha */}
                      {podeMexerPreco && (() => {
                        const opcoes = opcoesFornecedor(l.chave);
                        const editandoForn = addFornDe === `${di}:${l.chave}`;
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5 pl-12 print:hidden">
                            
                            {opcoes.length > 0 ? (
                              <select
                                value={fornecedores[l.chave] ?? ''}
                                onChange={(e) => escolherFornecedor(l.chave, l.item, e.target.value)}
                                className="h-7 max-w-[60%] rounded-md border border-carvao-200 bg-white px-1.5 text-caption font-semibold text-brand-700 dark:border-carvao-600 dark:bg-carvao-900 dark:text-brand-300"
                              >
                                {!fornecedores[l.chave] && <option value="">escolher fornecedor…</option>}
                                {opcoes.map((o) => (
                                  <option key={o.fornecedor} value={o.fornecedor}>
                                    {o.fornecedor}{o.preco > 0 ? ` — ${formatarReais(o.preco)}/${unidAtual}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-caption text-texto-suave">sem fornecedor cadastrado</span>
                            )}
                            {editandoForn ? (
                              <span className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={novoForn}
                                  onChange={(e) => setNovoForn(e.target.value)}
                                  placeholder="fornecedor"
                                  className="h-7 w-24 rounded-md border border-carvao-200 bg-white px-1.5 text-caption dark:border-carvao-600 dark:bg-carvao-900"
                                />
                                <span className="text-micro text-texto-suave">R$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  value={novoPreco}
                                  onChange={(e) => setNovoPreco(e.target.value)}
                                  placeholder="0,00"
                                  className="h-7 w-16 rounded-md border border-carvao-200 bg-white px-1.5 text-right text-caption font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                                />
                                <button
                                  onClick={() => salvarNovoForn(l.chave, l.item)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white"
                                  aria-label="Salvar fornecedor"
                                >
                                  <Icone nome="check" tam={14} />
                                </button>
                                <button
                                  onClick={() => { setAddFornDe(null); setNovoForn(''); setNovoPreco(''); }}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-texto-suave hover:text-perigo"
                                  aria-label="Cancelar"
                                >
                                  <Icone nome="fechar" tam={14} />
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => { setAddFornDe(`${di}:${l.chave}`); setNovoForn(''); setNovoPreco(''); }}
                                className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-caption font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-carvao-800"
                              >
                                <Icone nome="somar" tam={12} /> outro
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            )}

            {editando && podeMexer && onAddManual && (
              <button
                onClick={() => setNovoItemDia(di)}
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-nota font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-carvao-800/40 print:hidden"
              >
                <Icone nome="somar" tam={16} /> Adicionar item extra
              </button>
            )}
          </Cartao>
        );
      })}

      {/* Modal de item extra */}
      {onAddManual && (
        <FormNovoItem
          diaIdx={novoItemDia}
          aoFechar={() => setNovoItemDia(null)}
          aoSalvar={(dia, item, unid, qtd) => {
            onAddManual(dia, item, unid, qtd);
            setNovoItemDia(null);
          }}
        />
      )}
    </div>
  );
}

function FormNovoItem({
  diaIdx,
  aoFechar,
  aoSalvar,
}: {
  diaIdx: number | null;
  aoFechar: () => void;
  aoSalvar: (dia: number, item: string, unid: string, qtd: number) => void;
}) {
  const [item, setItem] = useState('');
  const [unid, setUnid] = useState('un');
  const [qtd, setQtd] = useState('1');

  if (diaIdx === null) return null;
  return (
    <Modal titulo={`Item extra — ${DIAS_SEMANA[diaIdx]}`} aberto aoFechar={aoFechar}>
      <div className="space-y-3">
        <input
          autoFocus
          className={estiloInput}
          placeholder="Nome do item"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          list="itens-conhecidos-lista"
        />
        <datalist id="itens-conhecidos-lista">
          {DADOS.itens.slice(0, 150).map((i) => (
            <option key={i.n} value={i.n} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step="0.1"
            className={estiloInput + ' !w-28'}
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
          <select className={estiloInput} value={unid} onChange={(e) => setUnid(e.target.value)}>
            {DADOS.unidades.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <Botao
          variante="sucesso"
          className="w-full"
          disabled={!item.trim() || !(Number(qtd) > 0)}
          onClick={() => aoSalvar(diaIdx, item.trim(), unid, Number(qtd))}
        >
          Adicionar
        </Botao>
      </div>
    </Modal>
  );
}
