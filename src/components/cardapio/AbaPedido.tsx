'use client';

/* =====================================================================
   Pedido semanal — inspirado na planilha "Tata House Pedido 2025".
   Agrega todos os itens da semana, agrupa por fornecedor, e permite
   definir data prevista de chegada e confirmar recebimento.
   Botão "WhatsApp" gera mensagem pronta por fornecedor.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Botao, Cartao } from '@/components/ui';
import { Icone } from '@/components/Icones';
import {
  DIAS_SEMANA,
  converterParaUnidadeBase,
  formatarQtd,
  formatarReais,
  linhasDoDia,
} from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import { periodoSemana, useMostrarBasicos } from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import type { EstadoSemana, Papel, PerfilFornecedor } from '@/lib/cardapio/tipos';

/* ── tipos locais ─────────────────────────────────────────────────── */

interface ItemAgregado {
  chave: string;
  item: string;
  unid: string;
  qtd: number;
}

interface EstadoPedidoItem {
  previsao?: string;
  confirmado?: boolean;
  qtdOverride?: number;
}

type EstadoPedido = Record<string, EstadoPedidoItem>;

/* ── hook de persistência ─────────────────────────────────────────── */

function chaveStorage(semanaId: string) {
  return `cardapio.v1.pedido.${semanaId}`;
}

function usePedido(semanaId: string) {
  const [pedido, setPedidoRaw] = useState<EstadoPedido>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(chaveStorage(semanaId));
      setPedidoRaw(raw ? JSON.parse(raw) : {});
    } catch {
      setPedidoRaw({});
    }
  }, [semanaId]);

  const atualizar = useCallback(
    (fn: (p: EstadoPedido) => EstadoPedido) =>
      setPedidoRaw((prev) => {
        const novo = fn(prev);
        try {
          localStorage.setItem(chaveStorage(semanaId), JSON.stringify(novo));
        } catch {}
        return novo;
      }),
    [semanaId],
  );

  const setItem = useCallback(
    (chave: string, patch: Partial<EstadoPedidoItem>) =>
      atualizar((p) => ({ ...p, [chave]: { ...(p[chave] ?? {}), ...patch } })),
    [atualizar],
  );

  return { pedido, setItem };
}

/* ── helpers ──────────────────────────────────────────────────────── */

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function gerarMensagemWhatsApp(
  nomeFornecedor: string,
  itens: (ItemAgregado & { pedido: EstadoPedidoItem })[],
  semanaId: string,
): string {
  const periodo = periodoSemana(semanaId);
  const linhas = itens
    .map((i) => {
      const qtd = i.pedido.qtdOverride ?? i.qtd;
      const previsao = i.pedido.previsao ? ` (chegar até ${ddmm(i.pedido.previsao)})` : '';
      return `• ${i.item} — ${formatarQtd(qtd)} ${i.unid}${previsao}`;
    })
    .join('\n');
  return `Olá! Segue pedido *Tatá House* — semana ${periodo}:\n\n${linhas}\n\nAguardamos confirmação. Obrigado(a)! `;
}

function abrirWhatsApp(telefone: string | undefined, texto: string) {
  const num = telefone
    ? telefone.replace(/\D/g, '')
    : '';
  const url = num
    ? `https://wa.me/55${num}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}

/* ── impressão do pedido ──────────────────────────────────────────── */

function ImpressaoPedido({
  aberto,
  aoFechar,
  grupos,
  semanaId,
  pedido,
  precos,
  estimativas,
}: {
  aberto: boolean;
  aoFechar: () => void;
  grupos: [string, ItemAgregado[]][];
  semanaId: string;
  pedido: EstadoPedido;
  precos: Record<string, number>;
  estimativas: Record<string, number>;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);

  if (!aberto) return null;

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const periodo = periodoSemana(semanaId);

  return (
    <div className="min-h-screen bg-carvao-100 py-6 dark:bg-carvao-950 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-2 px-4 print:hidden">
        <button onClick={aoFechar} className="text-sm font-bold uppercase tracking-wide text-carvao-500 hover:text-carvao-800 dark:text-areia-200">
          ← Voltar
        </button>
        <Botao variante="sucesso" onClick={() => window.print()} className="!min-h-10 !px-5 !py-2 text-sm">
          <Icone nome="exportar" tam={16} /> Imprimir
        </Botao>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
        {/* cabeçalho */}
        <div className="bg-brand-800 px-8 py-6 text-white print:py-5">
          <div className="h-0.5 w-10 rounded-full bg-ouro-400 mb-3" />
          <h1 className="font-display text-2xl font-black tracking-[0.12em]">TATÁ HOUSE</h1>
          <p className="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.3em] text-ouro-300">Pedido Semanal</p>
          <p className="mt-2 text-xs text-brand-200">{periodo} · emitido {hoje}</p>
        </div>

        {/* grupos por fornecedor */}
        <div className="divide-y divide-carvao-100 px-8">
          {grupos
            .filter(([nome]) => nome !== 'Sem fornecedor')
            .map(([nomeForn, itens]) => {
              const custoForn = itens.reduce((s, i) => {
                const qtd = pedido[i.chave]?.qtdOverride ?? i.qtd;
                return s + resolverPreco(i.chave, precos, estimativas).valor * converterParaUnidadeBase(qtd, i.unid);
              }, 0);
              return (
                <div key={nomeForn} className="py-5 print:break-inside-avoid">
                  <div className="mb-3 flex items-baseline justify-between">
                    <p className="font-display text-base font-bold text-carvao-900">{nomeForn}</p>
                    {custoForn > 0 && (
                      <p className="text-xs font-semibold text-carvao-400">≈ {formatarReais(custoForn)}</p>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-carvao-100">
                      {itens.map((item) => {
                        const qtdFinal = pedido[item.chave]?.qtdOverride ?? item.qtd;
                        const previsao = pedido[item.chave]?.previsao;
                        return (
                          <tr key={item.chave}>
                            <td className="py-2 pr-4 font-semibold text-carvao-800">{item.item}</td>
                            <td className="py-2 text-right font-bold text-brand-700">
                              {formatarQtd(qtdFinal)} {item.unid}
                            </td>
                            {previsao && (
                              <td className="py-2 pl-3 text-right text-xs text-texto-suave">
                                até {ddmm(previsao)}
                              </td>
                            )}
                            <td className="w-8 py-2 pl-3 text-right">
                              <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${pedido[item.chave]?.confirmado ? 'border-brand-500 bg-brand-500 text-white' : 'border-carvao-300'}`}>
                                {pedido[item.chave]?.confirmado && <span className="text-[10px]">✓</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>

        <div className="border-t border-carvao-100 px-8 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-carvao-300">
            Tatá House · Refeitório do Tatá Sushi
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── componente principal ─────────────────────────────────────────── */

export function AbaPedido({
  estado,
  semanaId,
  fatores,
  fornecedores = {},
  perfis = {},
  precos = {},
  papel,
}: {
  estado: EstadoSemana;
  semanaId: string;
  fatores?: Record<string, number>;
  fornecedores?: Record<string, string>;
  perfis?: Record<string, PerfilFornecedor>;
  precos?: Record<string, number>;
  papel: Papel;
}) {
  const { mostrarBasicos } = useMostrarBasicos();
  const { estimativas } = useEstimativas();
  const { pedido, setItem } = usePedido(semanaId);
  const [impAberto, setImpAberto] = useState(false);

  const podeEditar =
    papel === 'administrador' || papel === 'gestor' || papel === 'compras';

  /* agrega itens de todos os dias */
  const itensSemana = useMemo(() => {
    const acc = new Map<string, ItemAgregado>();
    estado.dias.forEach((_, di) => {
      linhasDoDia(estado, di, fatores, { mostrarBasicos }).forEach((l) => {
        const prev = acc.get(l.chave);
        if (prev) prev.qtd += l.qtd;
        else acc.set(l.chave, { chave: l.chave, item: l.item, unid: l.unid, qtd: l.qtd });
      });
    });

    // A operação compra leite condensado em bag de 5 L. A cozinha continua
    // vendo o consumo diário em litros, mas o pedido semanal compra embalagem inteira.
    const leite = acc.get('leite condensado');
    if (leite && leite.unid === 'lt' && leite.qtd > 0) {
      acc.delete('leite condensado');
      const chaveBag = 'leite condensado bag 5 l';
      acc.set(chaveBag, {
        chave: chaveBag,
        item: 'Leite condensado · bag 5 L',
        unid: 'bag',
        qtd: Math.ceil(leite.qtd / 5),
      });
    }

    return acc;
  }, [estado, fatores, mostrarBasicos]);

  /* agrupa por fornecedor */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemAgregado[]>();
    Array.from(itensSemana.values()).forEach((item) => {
      const forn = fornecedores[item.chave] ?? 'Sem fornecedor';
      if (!mapa.has(forn)) mapa.set(forn, []);
      mapa.get(forn)!.push(item);
    });
    return Array.from(mapa.entries()).sort(([a], [b]) => {
      if (a === 'Sem fornecedor') return 1;
      if (b === 'Sem fornecedor') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [itensSemana, fornecedores]);

  /* totais */
  const { totalItens, totalConfirmados, custoEstimado } = useMemo(() => {
    let totalItens = 0;
    let totalConfirmados = 0;
    let custoEstimado = 0;
    Array.from(itensSemana.values()).forEach((item) => {
      totalItens++;
      if (pedido[item.chave]?.confirmado) totalConfirmados++;
      const preco = resolverPreco(item.chave, precos, estimativas).valor;
      const qtd = pedido[item.chave]?.qtdOverride ?? item.qtd;
      if (preco > 0) custoEstimado += preco * converterParaUnidadeBase(qtd, item.unid);
    });
    return { totalItens, totalConfirmados, custoEstimado };
  }, [itensSemana, pedido, precos, estimativas]);

  if (itensSemana.size === 0) {
    return (
      <Cartao className="py-10 text-center">
        <p className="text-sm text-texto-suave">
          Nenhum item na lista de compras desta semana.
          <br />
          Defina o cardápio na aba <strong>Cardápio</strong> primeiro.
        </p>
      </Cartao>
    );
  }

  return (
    <>
      <ImpressaoPedido
        aberto={impAberto}
        aoFechar={() => setImpAberto(false)}
        grupos={grupos}
        semanaId={semanaId}
        pedido={pedido}
        precos={precos}
        estimativas={estimativas}
      />
    <div className="space-y-4">
      {/* resumo */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-carvao-50 px-4 py-3 ring-1 ring-carvao-100 dark:bg-carvao-900/40 dark:ring-carvao-700/50">
        <span className="text-nota font-semibold text-carvao-600 dark:text-areia-200">
          {(() => { const n = grupos.filter(([g]) => g !== 'Sem fornecedor').length; return `${n} fornecedor${n !== 1 ? 'es' : ''}`; })()}
        </span>
        <span className="text-carvao-300">·</span>
        <span className="text-nota font-semibold text-carvao-600 dark:text-areia-200">
          {totalConfirmados}/{totalItens} itens confirmados
        </span>
        {custoEstimado > 0 && (
          <>
            <span className="text-carvao-300">·</span>
            <span className="text-nota font-semibold text-carvao-600 dark:text-areia-200">
              ≈ {formatarReais(custoEstimado)} estimado
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-caption font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {periodoSemana(semanaId)}
          </span>
          <button
            onClick={() => setImpAberto(true)}
            className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white transition hover:bg-brand-700"
          >
            <Icone nome="exportar" tam={12} /> Imprimir
          </button>
        </div>
      </div>

      {/* grupos por fornecedor */}
      {grupos.map(([nomeForn, itens]) => {
        const perfil = perfis[nomeForn] ?? {};
        const itensComPedido = itens.map((i) => ({ ...i, pedido: pedido[i.chave] ?? {} }));
        const confirmados = itensComPedido.filter((i) => i.pedido.confirmado).length;
        const todos = itensComPedido.length;
        const tudo = confirmados === todos;
        const mensagem = gerarMensagemWhatsApp(nomeForn, itensComPedido, semanaId);

        return (
          <GrupoFornecedor
            key={nomeForn}
            nome={nomeForn}
            whatsapp={perfil.whatsapp}
            obs={perfil.obs}
            itens={itensComPedido}
            confirmados={confirmados}
            total={todos}
            tudo={tudo}
            podeEditar={podeEditar}
            onSetItem={setItem}
            mensagem={mensagem}
          />
        );
      })}
    </div>
    </>
  );
}

/* ── grupo por fornecedor ─────────────────────────────────────────── */

function GrupoFornecedor({
  nome,
  whatsapp,
  obs,
  itens,
  confirmados,
  total,
  tudo,
  podeEditar,
  onSetItem,
  mensagem,
}: {
  nome: string;
  whatsapp?: string;
  obs?: string;
  itens: (ItemAgregado & { pedido: EstadoPedidoItem })[];
  confirmados: number;
  total: number;
  tudo: boolean;
  podeEditar: boolean;
  onSetItem: (chave: string, patch: Partial<EstadoPedidoItem>) => void;
  mensagem: string;
}) {
  const [expandido, setExpandido] = useState(true);
  const naoConfirmados = total - confirmados;

  return (
    <Cartao className="space-y-0 p-0 overflow-hidden">
      {/* cabeçalho do grupo */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpandido((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
              tudo
                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
                : naoConfirmados > 0
                ? 'bg-ouro-300/20 text-ouro-600 dark:text-ouro-400'
                : 'bg-carvao-100 text-texto-suave dark:bg-carvao-800'
            }`}
          >
            {tudo ? '✓' : naoConfirmados}
          </span>
          <div className="min-w-0">
            <p className="font-display text-subtitulo font-bold text-carvao-900 dark:text-white">
              {nome}
            </p>
            {obs && (
              <p className="truncate text-caption text-texto-suave" title={obs}>
                {obs.slice(0, 80)}{obs.length > 80 ? '…' : ''}
              </p>
            )}
          </div>
          <span className="ml-auto text-rotulo font-semibold text-texto-suave">
            {confirmados}/{total}
          </span>
          <Icone
            nome={expandido ? 'anterior' : 'proximo'}
            tam={14}
            className="shrink-0 text-carvao-300"
          />
        </button>

        {/* botão WhatsApp */}
        {nome !== 'Sem fornecedor' && (
          <button
            onClick={() => abrirWhatsApp(whatsapp, mensagem)}
            title={`Enviar pedido para ${nome} pelo WhatsApp`}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3 text-rotulo font-bold text-[#128C7E] ring-1 ring-[#25D366]/30 transition hover:bg-[#25D366]/20 dark:text-[#25D366]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {whatsapp ? whatsapp.replace(/(\(\d{2}\))\s*(\d)\.?(\d{4})-?(\d{4})/, '$1 $2 $3-$4') : 'WhatsApp'}
          </button>
        )}
      </div>

      {/* itens do grupo */}
      {expandido && (
        <div className="border-t border-carvao-100 dark:border-carvao-800">
          {nome === 'Sem fornecedor' && (
            <p className="border-b border-ouro-100 bg-ouro-50 px-4 py-2.5 text-caption font-semibold text-ouro-700 dark:border-ouro-900/30 dark:bg-ouro-900/20 dark:text-ouro-300">
              → Atribua fornecedores em <strong>Compras → Lista</strong> para liberar o pedido pelo WhatsApp.
            </p>
          )}
          {podeEditar && !tudo && (
            <div className="flex justify-end border-b border-carvao-100 px-4 py-2 dark:border-carvao-800">
              <button
                onClick={() => itens.forEach((i) => !i.pedido.confirmado && onSetItem(i.chave, { confirmado: true }))}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Confirmar todos ✓
              </button>
            </div>
          )}

          <ul className="divide-y divide-carvao-100 dark:divide-carvao-800">
            {itens.map(({ chave, item, unid, qtd, pedido: p }) => {
              const qtdFinal = p.qtdOverride ?? qtd;
              return (
                <li
                  key={chave}
                  className={`flex items-center gap-3 px-4 py-2.5 ${p.confirmado ? 'opacity-50' : ''}`}
                >
                  <button
                    disabled={!podeEditar}
                    onClick={() => onSetItem(chave, { confirmado: !p.confirmado })}
                    title={p.confirmado ? 'Marcar como pendente' : 'Confirmar recebimento'}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition ${
                      p.confirmado
                        ? 'bg-brand-500 ring-brand-500/50 text-white'
                        : podeEditar
                        ? 'bg-white ring-carvao-200 text-transparent hover:ring-brand-400 dark:bg-carvao-800 dark:ring-carvao-600'
                        : 'bg-white ring-carvao-100 text-transparent dark:bg-carvao-800'
                    }`}
                  >
                    <Icone nome="check" tam={12} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold leading-snug ${p.confirmado ? 'line-through text-texto-suave' : 'text-carvao-800 dark:text-areia-100'}`}>
                      {item}
                    </p>
                    {!podeEditar && (
                      <p className="text-xs text-texto-suave tabular-nums">
                        {formatarQtd(qtdFinal)} {unid}
                        {p.previsao && ` · previsto ${ddmm(p.previsao)}`}
                      </p>
                    )}
                  </div>

                  {podeEditar && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={qtdFinal}
                        onChange={(e) => onSetItem(chave, { qtdOverride: Number(e.target.value) || qtd })}
                        className="h-8 w-14 rounded-lg border border-carvao-200 bg-white px-1.5 text-center text-rotulo font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                      />
                      <span className="text-xs text-texto-suave">{unid}</span>
                      <input
                        type="date"
                        value={p.previsao ?? ''}
                        onChange={(e) => onSetItem(chave, { previsao: e.target.value || undefined })}
                        className="h-8 w-[90px] rounded-lg border border-carvao-200 bg-white px-1 text-caption dark:border-carvao-600 dark:bg-carvao-900 dark:[color-scheme:dark]"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Cartao>
  );
}
