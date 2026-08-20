'use client';

import { useEffect, useMemo, useState } from 'react';
import { Botao, Cartao } from '@/components/ui';
import { agruparCotacao, extrairRemetenteWhatsApp, parsearCotacao, parsearCotacaoComIA } from '@/lib/cardapio/cotacao';
import type { LinhaCotacao } from '@/lib/cardapio/cotacao';
import { DADOS, formatarReais, normalizar } from '@/lib/cardapio/motor';

const CHAVE_TEXTO        = 'cardapio.v1.cotacao.texto';
const CHAVE_GROQ         = 'cardapio.v1.groq.key';
const CHAVE_FORNECEDORES = 'cardapio.v1.fornecedores';

export function AbaCotacao({
  definirPreco,
  definirFornecedor,
  cadastrarItem,
  registrarOferta,
  itensExtras = {},
}: {
  definirPreco: (itemNorm: string, valor: number | null, nome?: string) => void;
  definirFornecedor?: (itemNorm: string, marca: string | null) => void;
  cadastrarItem?: (norm: string, nome: string, unid: string) => void;
  registrarOferta?: (itemNorm: string, fornecedor: string, preco: number) => void;
  itensExtras?: Record<string, { n: string; u: string }>;
}) {
  const [texto, setTexto]               = useState('');
  const [lido, setLido]                 = useState<LinhaCotacao[] | null>(null);
  const [ignorados, setIgnorados]       = useState<Set<string>>(new Set());
  const [unidades, setUnidades]         = useState<Record<number, string>>({});
  const [cadastrados, setCadastrados]   = useState<Set<number>>(new Set());
  const [aplicado, setAplicado]         = useState(0);
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [pdfCarregando, setPdfCarregando]   = useState(false);
  const [pdfErro, setPdfErro]           = useState('');

  // Fornecedores cadastrados
  const [fornecedoresList, setFornecedoresList] = useState<string[]>([]);
  const [novoForn, setNovoForn]                 = useState('');
  const [mostrarForn, setMostrarForn]           = useState(false);

  // IA
  const [groqKey, setGroqKey]           = useState('');
  const [keyRascunho, setKeyRascunho]   = useState('');
  const [mostrarConfigIA, setMostrarConfigIA] = useState(false);
  const [iaCarregando, setIaCarregando] = useState(false);
  const [iaErro, setIaErro]             = useState('');
  const [modoUsado, setModoUsado]       = useState<'combo' | 'logica' | null>(null);

  useEffect(() => {
    try {
      setTexto(localStorage.getItem(CHAVE_TEXTO) ?? '');
      const k = localStorage.getItem(CHAVE_GROQ) ?? '';
      setGroqKey(k);
      setKeyRascunho(k);
      try {
        const f = JSON.parse(localStorage.getItem(CHAVE_FORNECEDORES) ?? '[]');
        if (Array.isArray(f)) setFornecedoresList(f);
      } catch { /* ok */ }
    } catch { /* sem storage */ }
  }, []);

  const salvarFornecedores = (lista: string[]) => {
    setFornecedoresList(lista);
    try { localStorage.setItem(CHAVE_FORNECEDORES, JSON.stringify(lista)); } catch { /* ok */ }
  };

  const adicionarFornecedor = () => {
    const nome = novoForn.trim();
    if (!nome || fornecedoresList.includes(nome)) { setNovoForn(''); return; }
    salvarFornecedores([...fornecedoresList, nome]);
    setNovoForn('');
  };

  const removerFornecedor = (nome: string) =>
    salvarFornecedores(fornecedoresList.filter((f) => f !== nome));

  const salvarKey = () => {
    const k = keyRascunho.trim();
    setGroqKey(k);
    try { localStorage.setItem(CHAVE_GROQ, k); } catch { /* ok */ }
    setMostrarConfigIA(false);
  };

  /* helpers compartilhados */
  const resetarResultados = () => {
    setIgnorados(new Set());
    setUnidades({});
    setCadastrados(new Set());
    setAplicado(0);
    setIaErro('');
  };

  const detectarFornecedor = () => {
    const detectado = extrairRemetenteWhatsApp(texto);
    if (detectado && !fornecedorNome) setFornecedorNome(detectado);
  };

  const salvarTexto = () => {
    try { localStorage.setItem(CHAVE_TEXTO, texto); } catch { /* ok */ }
  };

  /* Leitura só com lógica */
  const ler = () => {
    salvarTexto();
    setLido(parsearCotacao(texto, fornecedoresList));
    setModoUsado('logica');
    resetarResultados();
    detectarFornecedor();
  };

  /* Leitura combo: lógica + IA */
  const lerComIA = async () => {
    salvarTexto();
    setIaCarregando(true);
    resetarResultados();
    const chaveEfetiva = (process.env.NEXT_PUBLIC_GROQ_KEY ?? '').trim() || groqKey.trim();
    try {
      const { linhas, comIA, erroIA } = await parsearCotacaoComIA(texto, chaveEfetiva, fornecedoresList);
      setLido(linhas);
      setModoUsado(comIA ? 'combo' : 'logica');
      if (erroIA) setIaErro(erroIA);
    } finally {
      setIaCarregando(false);
      detectarFornecedor();
    }
  };

  const { casados, soltos } = useMemo(
    () => (lido ? agruparCotacao(lido, itensExtras) : { casados: [], soltos: [] as LinhaCotacao[] }),
    [lido, itensExtras],
  );

  const selecionados = casados.filter((c) => !ignorados.has(c.item));

  // Fornecedor digitado no campo: remove um "Fornecedor:" que o usuário
  // tenha escrito junto e vale para todo item que não trouxe marca própria.
  const fornDigitado = fornecedorNome.trim().replace(/^fornecedor\s*[:\-–]?\s*/i, '').trim();

  const aplicar = () => {
    // Item com unidade incompatível (caixa cotada para item medido em kg, por
    // exemplo) NÃO entra: aplicar aqui inflava o custo em silêncio.
    selecionados.filter((c) => !c.bloqueado).forEach((c) => {
      const norm = normalizar(c.item);
      const forn = fornDigitado || c.marca;
      definirPreco(norm, c.preco, c.item);
      definirFornecedor?.(norm, forn);
      if (forn) registrarOferta?.(norm, forn, c.preco);
    });
    setAplicado(selecionados.filter((c) => !c.bloqueado).length);
  };

  const cadastrar = (idx: number, s: LinhaCotacao) => {
    const norm = normalizar(s.nome);
    const unid = unidades[idx] ?? s.unid ?? 'kg';
    cadastrarItem?.(norm, s.nome, unid);
    definirPreco(norm, s.preco, s.nome);
    const forn = fornDigitado || s.marca;
    definirFornecedor?.(norm, forn);
    if (forn) registrarOferta?.(norm, forn, s.preco);
    setCadastrados((c) => new Set(c).add(idx));
  };

  const cadastrarTodos = () => {
    if (!lido) return;
    const novos = new Set(cadastrados);
    soltos.forEach((s) => {
      const idx = lido.indexOf(s);
      if (novos.has(idx)) return;
      cadastrar(idx, s);
      novos.add(idx);
    });
    setCadastrados(novos);
  };

  const alternar = (item: string) =>
    setIgnorados((s) => {
      const novo = new Set(s);
      if (novo.has(item)) novo.delete(item);
      else novo.add(item);
      return novo;
    });

  /* Extrai texto de PDF via pdfjs-dist */
  const lerPdf = async (file: File) => {
    setPdfCarregando(true);
    setPdfErro('');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const paginas: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        paginas.push(content.items.map((it) => ('str' in it ? (it as { str: string }).str : '')).join(' '));
      }
      setTexto((prev) => (prev ? prev + '\n' + paginas.join('\n') : paginas.join('\n')));
    } catch {
      setPdfErro('Não foi possível ler o PDF. Confira se o arquivo não está protegido por senha.');
    } finally {
      setPdfCarregando(false);
    }
  };

  const importarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.pdf')) { await lerPdf(file); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const conteudo = ev.target?.result as string;
      if (!conteudo) return;
      const linhas = conteudo.split(/\r?\n/).map((l) => l.replace(/\t|;/g, ' ').trim()).filter(Boolean);
      setTexto((prev) => (prev ? prev + '\n' + linhas.join('\n') : linhas.join('\n')));
    };
    reader.readAsText(file, 'UTF-8');
  };

  const temKey = !!(process.env.NEXT_PUBLIC_GROQ_KEY || groqKey.trim());

  return (
    <div className="space-y-4">
      <Cartao className="space-y-3">
        {/* Upload */}
        <div className="flex flex-wrap items-center gap-3">
          <label className={`cursor-pointer rounded-full border border-dashed px-4 py-2 text-rotulo font-bold transition ${pdfCarregando ? 'pointer-events-none border-carvao-200 text-carvao-300 dark:border-carvao-700' : 'border-carvao-300 text-carvao-500 hover:border-brand-400 hover:text-brand-600 dark:border-carvao-600 dark:text-texto-suave'}`}>
            {pdfCarregando ? 'Lendo PDF…' : 'Importar arquivo (CSV / TXT / PDF)'}
            <input type="file" accept=".csv,.txt,.tsv,.pdf" className="hidden" disabled={pdfCarregando} onChange={importarArquivo} />
          </label>
        </div>
        {pdfErro && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-caption font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40">
            {pdfErro}
          </p>
        )}

        <textarea
          rows={8}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Ex.:\n7,00 Frango inteiro RF\nAcém Resf - Ribeiro *31,90*\nTiras de carnes\t\tR$ 43,00'}
          className="w-full rounded-2xl border border-carvao-200 bg-white px-4 py-3 font-mono text-xs leading-relaxed dark:border-carvao-600 dark:bg-carvao-900"
        />

        <div>
          <label className="mb-1 block text-caption font-bold uppercase tracking-widest text-texto-suave">
            Fornecedor (detectado ou informe)
          </label>
          <input
            value={fornecedorNome}
            onChange={(e) => setFornecedorNome(e.target.value)}
            placeholder="Nome do fornecedor (ex: Distribuidora XYZ)"
            className="w-full rounded-2xl border border-carvao-200 bg-white px-4 py-2.5 text-sm dark:border-carvao-600 dark:bg-carvao-900"
          />
        </div>

        {/* Fornecedores — toggle inline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-texto-suave">
              {fornecedoresList.length > 0 ? `${fornecedoresList.length} fornecedor${fornecedoresList.length !== 1 ? 'es' : ''}` : 'Nenhum fornecedor'}
            </span>
            <button
              onClick={() => setMostrarForn((v) => !v)}
              className="text-xs font-bold text-brand-600 dark:text-brand-400"
            >
              Gerenciar {mostrarForn ? '↑' : '↓'}
            </button>
          </div>
          {mostrarForn && (
            <div className="space-y-2 pt-1">
              {fornecedoresList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fornecedoresList.map((nome) => (
                    <span
                      key={nome}
                      className="flex items-center gap-1 rounded-full bg-carvao-100 px-3 py-1 text-xs font-semibold text-carvao-700 dark:bg-carvao-700 dark:text-carvao-200"
                    >
                      {nome}
                      <button
                        onClick={() => removerFornecedor(nome)}
                        className="ml-1 text-texto-suave hover:text-red-500"
                        aria-label={`Remover ${nome}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={novoForn}
                  onChange={(e) => setNovoForn(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarFornecedor()}
                  placeholder="Nome do fornecedor"
                  className="min-w-0 flex-1 rounded-xl border border-carvao-200 bg-white px-3 py-2 text-xs dark:border-carvao-600 dark:bg-carvao-900"
                />
                <button
                  onClick={adicionarFornecedor}
                  className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chave Groq — toggle inline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-texto-suave">
              <span className={`h-1.5 w-1.5 rounded-full ${temKey ? 'bg-brand-500' : 'bg-carvao-300'}`} />
              {temKey ? 'IA Groq ativa' : 'IA Groq não configurada'}
            </span>
            <button
              onClick={() => setMostrarConfigIA((v) => !v)}
              className="text-xs font-bold text-brand-600 dark:text-brand-400"
            >
              {temKey ? 'Trocar chave' : 'Configurar'} {mostrarConfigIA ? '↑' : '↓'}
            </button>
          </div>
          {mostrarConfigIA && (
            <div className="flex gap-2 pt-1">
              <input
                type="password"
                value={keyRascunho}
                onChange={(e) => setKeyRascunho(e.target.value)}
                placeholder="gsk_…"
                className="min-w-0 flex-1 rounded-xl border border-carvao-200 bg-white px-3 py-2 text-xs font-mono dark:border-carvao-600 dark:bg-carvao-900"
              />
              <button
                onClick={salvarKey}
                className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                Salvar
              </button>
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div className={`grid gap-2 ${temKey ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {temKey && (
            <Botao
              variante="primario"
              className="w-full"
              disabled={!texto.trim() || iaCarregando}
              onClick={lerComIA}
            >
              {iaCarregando ? 'Analisando…' : 'Ler com IA ✦'}
            </Botao>
          )}
          <Botao
            variante={temKey ? 'secundario' : 'primario'}
            className="w-full"
            disabled={!texto.trim() || iaCarregando}
            onClick={ler}
          >
            {temKey ? 'Só lógica' : 'Ler cotação'}
          </Botao>
        </div>

        {iaErro && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-caption font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/40">
            IA indisponível ({iaErro}) — resultado gerado apenas pela lógica.
          </p>
        )}
      </Cartao>

      {lido && (
        <>
          {casados.length === 0 && soltos.length === 0 ? (
            <Cartao>
              <p className="text-sm text-texto-suave">
                Nenhum preço reconhecido. Confira se o texto tem valores no formato <code>12,34</code>.
              </p>
            </Cartao>
          ) : (
            <Cartao className="space-y-3 !p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
                <h3 className="font-display text-lg font-semibold">{casados.length} itens reconhecidos</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${modoUsado === 'combo' ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'bg-carvao-100 text-carvao-500 dark:bg-carvao-700 dark:text-texto-suave'}`}>
                  {modoUsado === 'combo' ? '✦ Combo IA + Lógica' : 'Lógica'}
                </span>
              </div>
              <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
                {casados.map((c) => {
                  const fora = ignorados.has(c.item);
                  const delta = c.deltaHistorico;
                  const deltaPct = delta != null ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%` : null;
                  const corDelta =
                    delta == null ? ''
                    : delta > 0.12 ? 'text-red-600 dark:text-red-400'
                    : delta < -0.12 ? 'text-brand-600 dark:text-brand-400'
                    : 'text-texto-suave';
                  const corConfianca =
                    c.confianca === 'alta' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : c.confianca === 'media' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                    : c.confianca === 'baixa' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-carvao-100 text-texto-suave dark:bg-carvao-700';
                  const labelConfianca =
                    c.confianca === 'alta' ? '● alta'
                    : c.confianca === 'media' ? '● média'
                    : c.confianca === 'baixa' ? '● baixa'
                    : '○ sem hist.';
                  return (
                    <li key={c.item} className={`px-5 py-2.5 ${fora ? 'opacity-40' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={!fora}
                            onChange={() => alternar(c.item)}
                            className="h-4 w-4 shrink-0 accent-brand-600"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{c.item}</span>
                            <span className="block text-caption text-texto-suave">
                              {c.marca ? `${c.marca} · ` : ''}
                              {c.ofertas > 1 ? `melhor de ${c.ofertas} ofertas` : '1 oferta'}
                              {c.origemHistorico ? ` · ${c.origemHistorico}` : ''}
                            </span>
                          </span>
                        </label>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-bold">
                            {formatarReais(c.preco)}
                            <span className="font-normal text-texto-suave">/{c.unid}</span>
                          </span>
                          <div className="mt-0.5 flex items-center justify-end gap-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-micro font-bold ${corConfianca}`}>
                              {labelConfianca}
                            </span>
                            {c.precoHistorico != null && deltaPct && (
                              <span className={`text-micro font-semibold ${corDelta}`}>
                                {deltaPct} hist. {formatarReais(c.precoHistorico)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {c.alerta && (
                        <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-micro font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                          ⚠ {c.alerta}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-2 px-5 pb-4">
                <Botao variante="sucesso" className="w-full" disabled={selecionados.length === 0} onClick={aplicar}>
                  Aplicar {selecionados.length} preços à tabela
                </Botao>
                {aplicado > 0 && (
                  <p className="text-center text-xs font-semibold text-brand-600">
                    ✓ {aplicado} preços aplicados! Agora vá em Cardápio e toque em "Sugerir" — a sugestão
                    vai priorizar o melhor custo-benefício desta cotação.
                  </p>
                )}
              </div>
            </Cartao>
          )}

          {soltos.length > 0 && (
            <Cartao className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{soltos.length} produtos novos na cotação</h3>
                <button
                  onClick={cadastrarTodos}
                  className="rounded-full bg-brand-700 px-4 py-2 text-rotulo font-extrabold uppercase tracking-wide text-white shadow-suave hover:bg-brand-800"
                >
                  Cadastrar todos de uma vez
                </button>
              </div>
              <p className="text-xs text-texto-suave">
                Ainda não existem no catálogo. Cadastre todos com um toque ou um a um ajustando a unidade.
              </p>
              <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
                {soltos.map((s) => {
                  const idx = lido.indexOf(s);
                  const feito = cadastrados.has(idx);
                  return (
                    <li key={`${idx}-${s.nome}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{s.nome}</span>
                        <span className="block text-caption text-texto-suave">
                          {formatarReais(s.preco)}{s.marca ? ` · ${s.marca}` : ''}
                        </span>
                      </span>
                      {feito ? (
                        <span className="shrink-0 text-xs font-bold uppercase text-brand-600">✓ Cadastrado</span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <select
                            value={unidades[idx] ?? s.unid ?? 'kg'}
                            onChange={(e) => setUnidades((u) => ({ ...u, [idx]: e.target.value }))}
                            className="rounded-xl border border-carvao-200 bg-white px-2 py-1.5 text-xs font-bold dark:border-carvao-600 dark:bg-carvao-900"
                          >
                            {DADOS.unidades.map((u) => <option key={u}>{u}</option>)}
                          </select>
                          <button
                            onClick={() => cadastrar(idx, s)}
                            className="rounded-full bg-brand-700 px-3 py-1.5 text-caption font-extrabold uppercase tracking-wide text-white hover:bg-brand-800"
                          >
                            Cadastrar
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          )}
        </>
      )}
    </div>
  );
}
