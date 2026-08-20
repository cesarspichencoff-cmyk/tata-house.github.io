'use client';

import { useMemo, useState } from 'react';
import { Botao, Cartao, Modal, Pilula, estiloInput } from '@/components/ui';
import { Icone } from '@/components/Icones';
import {
  DADOS,
  DIAS_SEMANA,
  converterParaUnidadeBase,
  formatarQtd,
  formatarReais,
  linhasDoDia,
} from '@/lib/cardapio/motor';
import { resolverPreco } from '@/lib/cardapio/precos';
import { custoDoDia } from '@/lib/cardapio/custo-semana';
import { registrarAuditoria, useMostrarBasicos } from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { pode } from '@/lib/cardapio/org';
import type { EstadoSemana, HistoricoPrecos, Papel, StatusItem } from '@/lib/cardapio/tipos';
import { ListaCompras } from './ListaCompras';
import { ConciliacaoSemana } from './ConciliacaoSemana';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Comprime a foto da nota para caber no armazenamento do navegador. */
function comprimirImagem(file: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const img = new Image();
    img.onload = () => {
      const max = 1100;
      const esc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc);
      c.height = Math.round(img.height * esc);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolver(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rejeitar;
    img.src = URL.createObjectURL(file);
  });
}

export function AbaCompras({
  estado,
  atualizar,
  papel,
  precos,
  fornecedores = {},
  ofertas = {},
  historico = {},
  fatores,
  definirPreco,
  definirFornecedor,
  registrarOferta,
}: {
  estado: EstadoSemana;
  atualizar: (fn: (e: EstadoSemana) => EstadoSemana) => void;
  papel: Papel;
  precos: Record<string, number>;
  fornecedores?: Record<string, string>;
  ofertas?: Record<string, { fornecedor: string; preco: number }[]>;
  historico?: HistoricoPrecos;
  fatores?: Record<string, number>;
  definirPreco?: (itemNorm: string, valor: number | null, nome?: string) => void;
  definirFornecedor?: (itemNorm: string, marca: string | null) => void;
  registrarOferta?: (itemNorm: string, fornecedor: string, preco: number) => void;
}) {
  const { mostrarBasicos, setMostrarBasicos } = useMostrarBasicos();
  // Mesma base de estimativas do cardápio — para o orçamento da lista bater
  // com o custo mostrado na aba Cardápio (real → histórico → estimado).
  const { estimativas } = useEstimativas();
  const [novoItemDia, setNovoItemDia] = useState<number | null>(null);
  const [fotoPendente, setFotoPendente] = useState<string | null>(null);
  const [diasDaNota, setDiasDaNota] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<'lista' | 'detalhado'>('lista');
  const [fornecedorNota, setFornecedorNota] = useState('');
  const [etapaModal, setEtapaModal] = useState<'dias' | 'dados'>('dias');
  const [itensNota, setItensNota] = useState<{ produto: string; qtd: string; unid: string; precoUnit: string }[]>([]);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'ok' | 'erro'>('idle');

  const enviarEmailNota = async (foto: string, itens: typeof itensNota, fornecedor: string) => {
    setEnviandoEmail(true);
    setEmailStatus('idle');
    try {
      const serviceId  = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
      const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
      const publicKey  = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
      if (!serviceId || !templateId || !publicKey) {
        setEmailStatus('erro');
        return;
      }

      const itensParsed = itens.filter((i) => i.produto.trim()).map((i) => ({
        produto: i.produto,
        qtd: Number(i.qtd) || 0,
        unid: i.unid,
        precoUnit: Number(i.precoUnit) || 0,
      }));
      const data = new Date().toLocaleDateString('pt-BR');
      const totalGeral =
        itensParsed.length > 0 && itensParsed.every((i) => i.qtd && i.precoUnit)
          ? `R$ ${itensParsed.reduce((s, i) => s + i.qtd * i.precoUnit, 0).toFixed(2)}`
          : '—';
      const itensTexto =
        itensParsed.length > 0
          ? itensParsed
              .map((i) => {
                const total = i.qtd && i.precoUnit ? `R$ ${(i.qtd * i.precoUnit).toFixed(2)}` : '—';
                return `${i.produto} — ${i.qtd} ${i.unid} × R$ ${i.precoUnit.toFixed(2)} = ${total}`;
              })
              .join('\n')
          : 'Nenhum item informado.';

      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          template_params: {
            fornecedor: fornecedor || '—',
            data,
            responsavel: papel,
            itens_texto: itensTexto,
            total: totalGeral,
            foto_base64: foto && foto.startsWith('data:image/') ? foto : '',
          },
        }),
      });
      setEmailStatus(res.ok ? 'ok' : 'erro');
    } catch {
      setEmailStatus('erro');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const podeAjustarQtd = papel === 'administrador' || papel === 'gestor' || papel === 'cozinha';
  const podeComprar = papel === 'compras' || papel === 'gestor' || papel === 'administrador';
  const podeReceber = papel === 'recebimento' || papel === 'gestor' || papel === 'administrador';
  const podePreco = pode(papel, 'precos:editar') && !!definirPreco;

  const setAjuste = (dia: number, chave: string, qtd: number | null, removido?: boolean, obs?: string, unidOverride?: string) => {
    if (qtd !== null) {
      registrarAuditoria({ acao: 'ajustou quantidade', alvo: chave, para: qtd });
    }
    if (removido) {
      registrarAuditoria({ acao: 'removeu item da lista', alvo: chave });
    }
    if (unidOverride !== undefined) {
      registrarAuditoria({ acao: 'alterou unidade', alvo: chave, para: unidOverride });
    }
    if (obs !== undefined && obs.trim()) {
      registrarAuditoria({ acao: 'observação no item', alvo: chave, para: obs.trim() });
    }
    atualizar((e) => ({
      ...e,
      ajustes: {
        ...e.ajustes,
        [dia]: {
          ...(e.ajustes[dia] ?? {}),
          [chave]: {
            ...(e.ajustes[dia]?.[chave] ?? {}),
            ...(qtd !== null ? { qtd } : {}),
            ...(removido !== undefined ? { removido } : {}),
            ...(obs !== undefined ? { obs } : {}),
            ...(unidOverride !== undefined ? { unidOverride } : {}),
          },
        },
      },
    }));
  };

  const setStatus = (dia: number, chave: string, patch: Partial<StatusItem>) =>
    atualizar((e) => ({
      ...e,
      status: {
        ...e.status,
        [dia]: { ...(e.status[dia] ?? {}), [chave]: { ...(e.status[dia]?.[chave] ?? {}), ...patch } },
      },
    }));

  const addManual = (dia: number, item: string, unid: string, qtd: number) => {
    registrarAuditoria({ acao: 'adicionou item extra', alvo: item, para: `${qtd} ${unid}` });
    atualizar((e) => ({
      ...e,
      manuais: { ...e.manuais, [dia]: [...(e.manuais[dia] ?? []), { item, unid, qtd }] },
    }));
  };

  const rmManual = (dia: number, idx: number) =>
    atualizar((e) => {
      const alvo = (e.manuais[dia] ?? [])[idx];
      if (alvo) registrarAuditoria({ acao: 'removeu item extra', alvo: alvo.item });
      return {
        ...e,
        manuais: { ...e.manuais, [dia]: (e.manuais[dia] ?? []).filter((_, i) => i !== idx) },
      };
    });

  const editManual = (dia: number, idx: number, patch: { qtd?: number; unid?: string }) =>
    atualizar((e) => {
      const lista = e.manuais[dia] ?? [];
      const alvo = lista[idx];
      if (!alvo) return e;
      if (patch.qtd !== undefined) registrarAuditoria({ acao: 'ajustou item extra', alvo: alvo.item, para: patch.qtd });
      if (patch.unid !== undefined) registrarAuditoria({ acao: 'alterou unidade (extra)', alvo: alvo.item, para: patch.unid });
      return {
        ...e,
        manuais: { ...e.manuais, [dia]: lista.map((m, i) => (i === idx ? { ...m, ...patch } : m)) },
      };
    });

  const missao = useMemo(() => {
    let total = 0, comprado = 0, recebido = 0, estimado = 0;
    DIAS_SEMANA.forEach((_, dia) => {
      linhasDoDia(estado, dia, fatores, { mostrarBasicos }).forEach((l) => {
        total++;
        if (l.status.compradoEm) comprado++;
        if (l.status.recebidoOk) recebido++;
        const preco = resolverPreco(l.chave, precos, estimativas).valor;
        estimado += preco * converterParaUnidadeBase(l.qtd, l.unid);
      });
    });
    return { total, aComprar: total - comprado, comprado, recebido, estimado };
  }, [estado, precos, estimativas, fatores, mostrarBasicos]);

  // ações em lote — sobre todos os itens do dia
  const comprarTudo = (dia: number) =>
    atualizar((e) => {
      const st = { ...(e.status[dia] ?? {}) };
      linhasDoDia(e, dia, fatores, { mostrarBasicos }).forEach((l) => {
        if (!st[l.chave]?.compradoEm) st[l.chave] = { ...(st[l.chave] ?? {}), compradoEm: hojeIso(), compradoQtd: l.qtd };
      });
      return { ...e, status: { ...e.status, [dia]: st } };
    });

  const receberTudo = (dia: number) =>
    atualizar((e) => {
      const st = { ...(e.status[dia] ?? {}) };
      linhasDoDia(e, dia, fatores, { mostrarBasicos }).forEach((l) => {
        const s = st[l.chave];
        if (s?.compradoEm && !s.recebidoOk)
          st[l.chave] = { ...s, recebidoOk: true, recebidoQtd: s.compradoQtd ?? l.qtd };
      });
      return { ...e, status: { ...e.status, [dia]: st } };
    });

  return (
    <div className="space-y-4">
      {/* Barra de missão */}
      {missao.total > 0 && (
        <div className="rounded-2xl bg-carvao-50 px-4 py-3 dark:bg-carvao-800/50 print:hidden">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-carvao-700 dark:text-carvao-200">
              {missao.aComprar === 0 ? 'Compras concluídas ✓' : `${missao.aComprar} iten${missao.aComprar !== 1 ? 's' : ''} para comprar`}
            </p>
            {missao.estimado > 0 && (
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400">{formatarReais(missao.estimado)}</p>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-carvao-200 dark:bg-carvao-700">
            <div
              className={`h-full rounded-full transition-all ${missao.aComprar === 0 ? 'bg-brand-500' : 'bg-ouro-400'}`}
              style={{ width: `${missao.total > 0 ? Math.round((missao.comprado / missao.total) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-1.5 flex gap-4 text-micro text-texto-suave">
            <span><strong className="text-carvao-700 dark:text-areia-200">{missao.comprado}</strong> comprado{missao.comprado !== 1 ? 's' : ''}</span>
            <span><strong className="text-carvao-700 dark:text-areia-200">{missao.recebido}</strong> recebido{missao.recebido !== 1 ? 's' : ''}</span>
            <span><strong className="text-carvao-700 dark:text-areia-200">{missao.total}</strong> no total</span>
          </div>
        </div>
      )}

      {/* Modo + ações */}
      <div className="flex items-center gap-2 print:hidden">
        <div className="flex flex-1 gap-1 rounded-2xl bg-carvao-100/70 p-1 dark:bg-carvao-800/70">
          {(['lista', 'detalhado'] as const).map((id) => {
            const rot = id === 'lista' ? 'Lista' : 'Detalhado';
            return (
              <button
                key={id}
                onClick={() => setModo(id)}
                className={`min-h-9 flex-1 rounded-xl px-3 text-nota font-semibold transition ${
                  modo === id
                    ? 'bg-white text-brand-700 shadow-suave dark:bg-carvao-700 dark:text-brand-300'
                    : 'text-carvao-500 dark:text-areia-200'
                }`}
              >
                {rot}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setMostrarBasicos(!mostrarBasicos)}
          className={`shrink-0 rounded-xl border px-3 py-2 text-caption font-bold transition ${
            mostrarBasicos
              ? 'border-ouro-400/40 bg-ouro-300/15 text-ouro-700 dark:text-ouro-300'
              : 'border-carvao-200 text-texto-suave hover:text-carvao-600 dark:border-carvao-600'
          }`}
          title={mostrarBasicos ? 'Ocultar sal, óleo, alho…' : 'Mostrar básicos'}
        >
          {mostrarBasicos ? 'Com básicos' : '+ Básicos'}
        </button>
        <Botao variante="secundario" onClick={() => window.print()} className="!min-h-10 shrink-0 !px-3 !py-2 text-sm">
          <Icone nome="exportar" tam={16} />
        </Botao>
      </div>

      {modo === 'lista' && (
        <ListaCompras
          estado={estado}
          fatores={fatores}
          atualizar={atualizar}
          podeComprar={podeComprar}
          podeEditar={podeAjustarQtd}
          mostrarBasicos={mostrarBasicos}
          precos={precos}
          estimativas={estimativas}
          fornecedores={fornecedores}
          ofertas={ofertas}
          historico={historico}
          podePreco={podePreco}
          definirPreco={definirPreco}
          definirFornecedor={definirFornecedor}
          registrarOferta={registrarOferta}
          onAjuste={(dia, chave, qtd, removido, obs, unid) => setAjuste(dia, chave, qtd, removido, obs, unid)}
          onAddManual={addManual}
          onRmManual={rmManual}
          onEditManual={editManual}
        />
      )}

      {/* Conciliação automática — preço vs histórico e quantidade vs cardápio */}
      <ConciliacaoSemana estado={estado} precos={precos} />

      {/* Notas fiscais da semana — uma compra pode cobrir vários dias */}
      {(podeComprar || podeReceber || (estado.notasFiscais ?? []).length > 0) && (
        <Cartao className="space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Notas fiscais</h3>
            {(podeComprar || podeReceber) && (
              <label className="cursor-pointer rounded-full bg-ouro-300/20 px-3.5 py-2 text-caption font-bold uppercase tracking-wide text-ouro-600 ring-1 ring-ouro-400/40 hover:bg-ouro-300/30">
                Foto da nota fiscal
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = '';
                    if (!f) return;
                    setFotoPendente(await comprimirImagem(f));
                    setDiasDaNota(new Set());
                    setFornecedorNota('');
                    setItensNota([{ produto: '', qtd: '', unid: 'kg', precoUnit: '' }]);
                    setEtapaModal('dias');
                  }}
                />
              </label>
            )}
          </div>
          {emailStatus === 'ok' && (
            <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-rotulo font-bold text-brand-700 ring-1 ring-brand-500/30">
              E-mail enviado para compras@tatasushi.com.br
            </p>
          )}
          {emailStatus === 'erro' && (
            <p className="rounded-xl bg-perigo/10 px-3 py-2 text-rotulo font-bold text-perigo ring-1 ring-perigo/25">
              Falha no envio do e-mail — verifique a configuração RESEND_API_KEY na Vercel.
            </p>
          )}
          {(estado.notasFiscais ?? []).length === 0 ? (
            <p className="text-xs text-texto-suave">
              Tire a foto da nota na hora do recebimento — o app pergunta a quais dias de compra ela se refere e
              deixa tudo conferível.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {(estado.notasFiscais ?? []).map((n, ni) => (
                <li
                  key={ni}
                  className="flex items-center gap-2.5 rounded-2xl bg-areia-100 p-2 pr-3 ring-1 ring-carvao-200 dark:bg-carvao-800 dark:ring-carvao-600"
                >
                  <a href={n.foto} target="_blank" rel="noreferrer" title="Abrir nota fiscal">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.foto} alt="Nota fiscal" width={56} height={56} loading="lazy" className="h-14 w-14 rounded-xl object-cover ring-2 ring-brand-500/50" />
                  </a>
                  <span>
                    <span className="block text-caption font-bold uppercase text-brand-600">
                      {n.dias.map((d) => DIAS_SEMANA[d].slice(0, 3)).join(' · ')}
                    </span>
                    <span className="block text-micro text-texto-suave">
                      anexada em {n.em.slice(8, 10)}/{n.em.slice(5, 7)}
                    </span>
                  </span>
                  {(podeComprar || podeReceber) && (
                    <button
                      onClick={() =>
                        atualizar((e) => ({ ...e, notasFiscais: (e.notasFiscais ?? []).filter((_, i) => i !== ni) }))
                      }
                      aria-label="Remover nota fiscal"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-carvao-300 hover:bg-perigo/10 hover:text-perigo"
                    >
                      <Icone nome="fechar" tam={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {/* Modal da nota fiscal — 2 etapas: dias → dados dos itens */}
      <Modal
        titulo={etapaModal === 'dias' ? 'Nota fiscal — a quais dias pertence?' : 'Nota fiscal — itens recebidos'}
        aberto={fotoPendente !== null}
        aoFechar={() => setFotoPendente(null)}
      >
        {fotoPendente && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoPendente} alt="Nota fiscal" loading="lazy" className="mx-auto max-h-36 rounded-2xl object-contain ring-1 ring-carvao-200" />

            {etapaModal === 'dias' ? (
              <>
                <p className="text-sm text-carvao-500 dark:text-carvao-300">
                  Uma compra pode cobrir mais de um dia — marque todos os dias que esta nota atende:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DIAS_SEMANA.map((nome, i) => (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ring-1 transition ${
                        diasDaNota.has(i)
                          ? 'bg-brand-600/10 text-brand-700 ring-brand-500/50 dark:text-brand-300'
                          : 'bg-white text-carvao-600 ring-carvao-200 dark:bg-carvao-800 dark:text-areia-200 dark:ring-carvao-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={diasDaNota.has(i)}
                        onChange={() =>
                          setDiasDaNota((s) => {
                            const novo = new Set(s);
                            if (novo.has(i)) novo.delete(i);
                            else novo.add(i);
                            return novo;
                          })
                        }
                        className="h-4 w-4 accent-brand-600"
                      />
                      {nome}
                    </label>
                  ))}
                </div>
                <Botao
                  variante="sucesso"
                  className="w-full"
                  disabled={diasDaNota.size === 0}
                  onClick={() => setEtapaModal('dados')}
                >
                  Próximo — informar itens →
                </Botao>
              </>
            ) : (
              <>
                <input
                  className="w-full rounded-xl border border-carvao-200 bg-white px-3 py-2 text-sm dark:border-carvao-600 dark:bg-carvao-900"
                  placeholder="Fornecedor / marca (opcional)"
                  value={fornecedorNota}
                  onChange={(e) => setFornecedorNota(e.target.value)}
                />
                <p className="text-rotulo font-semibold text-carvao-500">Itens da nota — preencha o que estiver na nota fiscal:</p>
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {itensNota.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 rounded-xl bg-areia-50 p-2 ring-1 ring-carvao-100 dark:bg-carvao-800/60">
                      <input
                        className="col-span-5 rounded-lg border border-carvao-200 bg-white px-2 py-1 text-rotulo dark:border-carvao-600 dark:bg-carvao-900"
                        placeholder="Produto"
                        value={item.produto}
                        onChange={(e) => {
                          const n = [...itensNota];
                          n[idx] = { ...n[idx], produto: e.target.value };
                          setItensNota(n);
                        }}
                        list="itens-conhecidos-nota"
                      />
                      <datalist id="itens-conhecidos-nota">
                        {DADOS.itens.slice(0, 100).map((i) => <option key={i.n} value={i.n} />)}
                      </datalist>
                      <input
                        type="number" min={0} step="0.1"
                        className="col-span-2 rounded-lg border border-carvao-200 bg-white px-1 py-1 text-center text-rotulo dark:border-carvao-600 dark:bg-carvao-900"
                        placeholder="Qtd"
                        value={item.qtd}
                        onChange={(e) => {
                          const n = [...itensNota];
                          n[idx] = { ...n[idx], qtd: e.target.value };
                          setItensNota(n);
                        }}
                      />
                      <select
                        className="col-span-2 rounded-lg border border-carvao-200 bg-white px-1 py-1 text-caption dark:border-carvao-600 dark:bg-carvao-900"
                        value={item.unid}
                        onChange={(e) => {
                          const n = [...itensNota];
                          n[idx] = { ...n[idx], unid: e.target.value };
                          setItensNota(n);
                        }}
                      >
                        {DADOS.unidades.map((u) => <option key={u}>{u}</option>)}
                      </select>
                      <input
                        type="number" min={0} step="0.01"
                        className="col-span-2 rounded-lg border border-carvao-200 bg-white px-1 py-1 text-right text-rotulo dark:border-carvao-600 dark:bg-carvao-900"
                        placeholder="R$/u"
                        value={item.precoUnit}
                        onChange={(e) => {
                          const n = [...itensNota];
                          n[idx] = { ...n[idx], precoUnit: e.target.value };
                          setItensNota(n);
                        }}
                      />
                      <button
                        onClick={() => setItensNota((p) => p.filter((_, i) => i !== idx))}
                        className="col-span-1 flex items-center justify-center rounded-lg text-carvao-300 hover:text-perigo"
                      >
                        <Icone nome="fechar" tam={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setItensNota((p) => [...p, { produto: '', qtd: '', unid: 'kg', precoUnit: '' }])}
                  className="flex items-center gap-1 text-nota font-semibold text-brand-600"
                >
                  <Icone nome="somar" tam={15} /> Adicionar item
                </button>
                <div className="flex gap-2">
                  <Botao variante="secundario" className="flex-1" onClick={() => setEtapaModal('dias')}>← Voltar</Botao>
                  <Botao
                    variante="sucesso"
                    className="flex-1"
                    onClick={async () => {
                      const dias = Array.from(diasDaNota).sort((a, b) => a - b);
                      atualizar((e) => ({
                        ...e,
                        notasFiscais: [...(e.notasFiscais ?? []), { foto: fotoPendente!, dias, em: new Date().toISOString() }],
                      }));
                      // Registra itens nos status
                      const itensValidos = itensNota.filter((it) => it.produto.trim() && Number(it.qtd) > 0);
                      if (itensValidos.length > 0 && dias.length > 0) {
                        const di = dias[0];
                        atualizar((e) => {
                          const novoStatus = { ...(e.status[di] ?? {}) };
                          itensValidos.forEach((it) => {
                            const chave = it.produto.toLowerCase().trim().replace(/\s+/g, ' ');
                            novoStatus[chave] = {
                              ...(novoStatus[chave] ?? {}),
                              compradoEm: new Date().toISOString().slice(0, 10),
                              compradoQtd: Number(it.qtd),
                              ...(it.precoUnit ? { precoPago: Number(it.precoUnit) } : {}),
                            };
                          });
                          return { ...e, status: { ...e.status, [di]: novoStatus } };
                        });
                      }
                      // Envia e-mail automaticamente
                      await enviarEmailNota(fotoPendente!, itensNota, fornecedorNota);
                      setFotoPendente(null);
                    }}
                  >
                    {enviandoEmail ? 'Enviando…' : '✓ Confirmar e enviar por e-mail'}
                  </Botao>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {modo === 'detalhado' &&
        estado.dias.map((dia, di) => {
        const linhas = linhasDoDia(estado, di, fatores, { mostrarBasicos });
        if (!dia.principal && linhas.length === 0) return null;
        // FONTE ÚNICA (custo-semana.ts). Antes usava custoDaLista, que só
        // olhava o mapa de preços cru: item sem preço direto entrava como
        // ZERO, sem estimativa nem fallback de ingrediente base — e ainda
        // montava a lista ignorando "mostrar básicos". Resultado: número
        // diferente do da tela do cardápio, e subestimado.
        const custo = custoDoDia(estado, di, precos, estimativas, { fatores, mostrarBasicos });
        const compradas = linhas.filter((l) => l.status.compradoEm).length;
        const recebidas = linhas.filter((l) => l.status.recebidoOk).length;
        const divergencias = linhas.filter(
          (l) =>
            (l.status.precoPago !== undefined && precos[l.chave] > 0 && l.status.precoPago > precos[l.chave] * 1.02) ||
            (l.status.recebidoOk &&
              l.status.recebidoQtd !== undefined &&
              l.status.compradoQtd !== undefined &&
              l.status.recebidoQtd < l.status.compradoQtd),
        ).length;
        const notasDoDia = (estado.notasFiscais ?? []).filter((n) => n.dias.includes(di)).length;

        return (
          <Cartao key={di} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">
                {DIAS_SEMANA[di]}{' '}
                <span className="text-sm font-normal text-texto-suave">
                  · {dia.principal || 'sem cardápio'} · {dia.pessoas} pessoas
                </span>
              </h3>
              <p className="text-xs font-semibold tabular-nums text-texto-suave">
                {compradas}/{linhas.length} comprados · {recebidas}/{linhas.length} recebidos
                {custo.itensReais + custo.itensEstimados > 0 && <> · ≈ {formatarReais(custo.total)}</>}
                {divergencias > 0 && <span className="font-extrabold text-perigo"> · {divergencias} divergências</span>}
                {notasDoDia > 0 && (
                  <span className="font-bold text-brand-600">
                    {' '}
                    · {notasDoDia} nota{notasDoDia > 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>

            {/* ações em lote */}
            {linhas.length > 0 && (podeComprar || podeReceber) && (
              <div className="flex flex-wrap gap-2 print:hidden">
                {podeComprar && compradas < linhas.length && (
                  <button
                    onClick={() => comprarTudo(di)}
                    className="flex items-center gap-1.5 rounded-full bg-carvao-900 px-3 py-1.5 text-rotulo font-bold text-white dark:bg-areia-100 dark:text-carvao-900"
                  >
                    <Icone nome="check" tam={15} /> Comprar tudo
                  </button>
                )}
                {podeReceber && compradas > 0 && recebidas < compradas && (
                  <button
                    onClick={() => receberTudo(di)}
                    className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-rotulo font-bold text-white hover:bg-brand-700"
                  >
                    <Icone nome="compras" tam={15} /> Receber tudo
                  </button>
                )}
              </div>
            )}

            {linhas.length === 0 ? (
              <p className="text-sm text-texto-suave">Escolha o cardápio na aba anterior para gerar a lista.</p>
            ) : (
              <div className="space-y-2">
                {linhas.map((l) => {
                  const acima =
                    l.status.precoPago !== undefined &&
                    precos[l.chave] > 0 &&
                    l.status.precoPago > precos[l.chave] * 1.02;
                  const veioMenos =
                    l.status.recebidoOk &&
                    l.status.recebidoQtd !== undefined &&
                    l.status.compradoQtd !== undefined &&
                    l.status.recebidoQtd < l.status.compradoQtd;
                  return (
                    <div
                      key={l.chave}
                      className="rounded-2xl bg-areia-50/70 p-3 ring-1 ring-carvao-100 dark:bg-carvao-900/40 dark:ring-carvao-700/60"
                    >
                      {/* item + quantidade + remover */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                            {l.item}
                            {l.manual && <Pilula tom="ouro">extra</Pilula>}
                            {l.sugerida !== null && l.qtd !== l.sugerida && (
                              <span className="text-micro font-normal text-texto-suave">(sugerido {formatarQtd(l.sugerida)})</span>
                            )}
                          </p>
                          {podePreco ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 print:hidden">
                              <span className="text-micro font-bold uppercase tracking-wide text-texto-suave">cotação</span>
                              <span className="text-micro text-texto-suave">R$</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                defaultValue={precos[l.chave] ?? ''}
                                placeholder="0,00"
                                title="Preço de cotação (atualiza o custo da semana)"
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  definirPreco!(l.chave, v === '' ? null : Number(v), l.item);
                                }}
                                className="h-7 w-16 rounded-md border border-carvao-200 bg-white px-1.5 text-right text-caption font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                              />
                              <span className="text-micro text-texto-suave">/{l.unid}</span>
                              <input
                                type="text"
                                defaultValue={fornecedores[l.chave] ?? ''}
                                placeholder="fornecedor"
                                title="Fornecedor mais barato deste item"
                                onBlur={(e) => definirFornecedor?.(l.chave, e.target.value.trim() || null)}
                                className="h-7 w-28 rounded-md border border-carvao-200 bg-white px-2 text-caption dark:border-carvao-600 dark:bg-carvao-900"
                              />
                            </div>
                          ) : (
                            fornecedores[l.chave] && (
                              <span className="block text-micro font-semibold text-brand-600">↓ mais barato: {fornecedores[l.chave]}</span>
                            )
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {podeAjustarQtd && !l.manual ? (
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={l.qtd}
                              onChange={(e) => setAjuste(di, l.chave, Number(e.target.value))}
                              className="h-9 w-16 rounded-lg border border-carvao-200 bg-white px-1.5 text-center font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                            />
                          ) : (
                            <strong className="tabular-nums">{formatarQtd(l.qtd)}</strong>
                          )}
                          {podeAjustarQtd && !l.manual ? (
                            <select
                              value={estado.ajustes[di]?.[l.chave]?.unidOverride ?? l.unid}
                              onChange={(e) => setAjuste(di, l.chave, null, undefined, undefined, e.target.value)}
                              className="h-9 rounded-lg border border-carvao-200 bg-white px-1 text-xs dark:border-carvao-600 dark:bg-carvao-900"
                            >
                              {DADOS.unidades.map((u) => <option key={u}>{u}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-texto-suave">{estado.ajustes[di]?.[l.chave]?.unidOverride ?? l.unid}</span>
                          )}
                          {podeAjustarQtd && (
                            <button
                              onClick={() =>
                                l.manual ? rmManual(di, Number(l.chave.split(':')[1])) : setAjuste(di, l.chave, null, true)
                              }
                              aria-label={`Remover ${l.item}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-carvao-300 hover:bg-perigo/10 hover:text-perigo print:hidden"
                            >
                              <Icone nome="fechar" tam={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Observação por item */}
                      {podeAjustarQtd && (
                        <div className="mt-1.5">
                          <input
                            type="text"
                            placeholder="Observação (ex: fornecedor preferencial, ajuste manual...)"
                            value={estado.ajustes[di]?.[l.chave]?.obs ?? ''}
                            onChange={(e) => setAjuste(di, l.chave, null, undefined, e.target.value)}
                            className="w-full rounded-lg border border-carvao-100 bg-white/60 px-2 py-1 text-caption text-carvao-500 placeholder-carvao-300 dark:border-carvao-700/60 dark:bg-carvao-900/40 print:hidden"
                          />
                        </div>
                      )}
                      {!podeAjustarQtd && estado.ajustes[di]?.[l.chave]?.obs && (
                        <p className="mt-1 text-caption italic text-texto-suave">
                          {estado.ajustes[di][l.chave].obs}
                        </p>
                      )}

                      {/* fluxo: comprado · previsão · recebido */}
                      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {/* Comprado */}
                        <div className="rounded-xl bg-white p-2 ring-1 ring-carvao-100 dark:bg-carvao-850 dark:ring-carvao-700/60">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">Comprado</p>
                          {l.status.compradoEm ? (
                            <div className="space-y-1">
                              <span className="text-xs font-bold text-brand-600">✓ {ddmm(l.status.compradoEm)}</span>
                              {podeComprar ? (
                                <div className="flex items-center gap-1 text-caption">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    value={l.status.compradoQtd ?? ''}
                                    placeholder="qtd"
                                    title="Quantidade pedida"
                                    onChange={(e) => setStatus(di, l.chave, { compradoQtd: Number(e.target.value) })}
                                    className="h-8 w-12 rounded-md border border-carvao-200 bg-white px-1 text-center font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                                  />
                                  <span className="text-texto-suave">R$</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={l.status.precoPago ?? ''}
                                    placeholder="pago"
                                    title="Preço pago por unidade"
                                    onChange={(e) =>
                                      setStatus(di, l.chave, { precoPago: e.target.value ? Number(e.target.value) : undefined })
                                    }
                                    className="h-8 w-14 rounded-md border border-carvao-200 bg-white px-1 text-right font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                                  />
                                </div>
                              ) : (
                                l.status.precoPago !== undefined && (
                                  <span className="block text-micro text-texto-suave">
                                    {formatarQtd(l.status.compradoQtd ?? l.qtd)} {l.unid} · {formatarReais(l.status.precoPago)}/{l.unid}
                                  </span>
                                )
                              )}
                              {acima && (
                                <span className="block text-micro font-extrabold text-perigo">
                                  ▲ acima do cotado ({formatarReais(precos[l.chave])})
                                </span>
                              )}
                            </div>
                          ) : podeComprar ? (
                            <button
                              onClick={() => setStatus(di, l.chave, { compradoEm: hojeIso(), compradoQtd: l.qtd })}
                              className="w-full rounded-lg bg-carvao-900 px-2 py-1.5 text-caption font-bold text-white dark:bg-areia-100 dark:text-carvao-900 print:hidden"
                            >
                              Marcar
                            </button>
                          ) : (
                            <span className="text-carvao-300">—</span>
                          )}
                        </div>

                        {/* Previsão */}
                        <div className="rounded-xl bg-white p-2 ring-1 ring-carvao-100 dark:bg-carvao-850 dark:ring-carvao-700/60">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">Previsão</p>
                          {podeComprar ? (
                            <input
                              type="date"
                              value={l.status.previsao ?? ''}
                              onChange={(e) => setStatus(di, l.chave, { previsao: e.target.value })}
                              className="h-8 w-full rounded-md border border-carvao-200 bg-white px-1.5 text-xs dark:border-carvao-600 dark:bg-carvao-900"
                            />
                          ) : l.status.previsao ? (
                            <span className="text-xs font-semibold">{ddmm(l.status.previsao)}</span>
                          ) : (
                            <span className="text-carvao-300">—</span>
                          )}
                        </div>

                        {/* Recebido */}
                        <div className="rounded-xl bg-white p-2 ring-1 ring-carvao-100 dark:bg-carvao-850 dark:ring-carvao-700/60">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-texto-suave">Recebido</p>
                          {l.status.recebidoOk ? (
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold text-brand-600">✓ OK</span>
                              {podeReceber && (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={l.status.recebidoQtd ?? ''}
                                  title="Quantidade conferida no recebimento"
                                  onChange={(e) => setStatus(di, l.chave, { recebidoQtd: Number(e.target.value) })}
                                  className="block h-8 w-12 rounded-md border border-carvao-200 bg-white px-1 text-center text-caption font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                                />
                              )}
                              {veioMenos && (
                                <span className="block text-micro font-extrabold text-[#d18a3a]">
                                  veio {formatarQtd(l.status.recebidoQtd!)} de {formatarQtd(l.status.compradoQtd!)}
                                </span>
                              )}
                            </div>
                          ) : podeReceber && l.status.compradoEm ? (
                            <button
                              onClick={() => setStatus(di, l.chave, { recebidoOk: true, recebidoQtd: l.status.compradoQtd ?? l.qtd })}
                              className="w-full rounded-lg bg-brand-600 px-2 py-1.5 text-caption font-bold text-white print:hidden"
                            >
                              Dar OK
                            </button>
                          ) : (
                            <span className="text-carvao-300">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {podeAjustarQtd && (
              <button
                onClick={() => setNovoItemDia(di)}
                className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 print:hidden"
              >
                <Icone nome="somar" tam={16} /> Adicionar item extra
              </button>
            )}
          </Cartao>
        );
      })}

      <FormNovoItem
        diaIdx={novoItemDia}
        aoFechar={() => setNovoItemDia(null)}
        aoSalvar={(dia, item, unid, qtd) => {
          addManual(dia, item, unid, qtd);
          setNovoItemDia(null);
        }}
      />
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
          list="itens-conhecidos"
        />
        <datalist id="itens-conhecidos">
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
