'use client';

import { useEffect, useMemo, useState } from 'react';
import { Botao, Cartao } from '@/components/ui';
import { agruparCotacao, extrairRemetenteWhatsApp, parsearCotacao, parsearCotacaoComIA } from '@/lib/cardapio/cotacao';
import type { LinhaCotacao } from '@/lib/cardapio/cotacao';
import { DADOS, formatarReais, normalizar } from '@/lib/cardapio/motor';
import { iaEdgeAtivo } from '@/lib/cardapio/ia-cliente';

const CHAVE_TEXTO = 'cardapio.v1.cotacao.texto';
const CHAVE_FORNECEDORES = 'cardapio.v1.cotacao.fornecedoresLista';
const CHAVE_FORNECEDORES_LEGADO = 'cardapio.v1.fornecedores';

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
  const [texto, setTexto] = useState('');
  const [lido, setLido] = useState<LinhaCotacao[] | null>(null);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());
  const [unidades, setUnidades] = useState<Record<number, string>>({});
  const [mapeamentos, setMapeamentos] = useState<Record<number, string>>({});
  const [cadastrados, setCadastrados] = useState<Set<number>>(new Set());
  const [aplicado, setAplicado] = useState(0);
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [pdfCarregando, setPdfCarregando] = useState(false);
  const [pdfErro, setPdfErro] = useState('');

  const [fornecedoresList, setFornecedoresList] = useState<string[]>([]);
  const [novoForn, setNovoForn] = useState('');
  const [mostrarForn, setMostrarForn] = useState(false);

  const [iaCarregando, setIaCarregando] = useState(false);
  const [iaErro, setIaErro] = useState('');
  const [modoUsado, setModoUsado] = useState<'combo' | 'logica' | null>(null);

  useEffect(() => {
    try {
      setTexto(localStorage.getItem(CHAVE_TEXTO) ?? '');
      let rawLista = localStorage.getItem(CHAVE_FORNECEDORES);
      if (rawLista == null) {
        const legado = localStorage.getItem(CHAVE_FORNECEDORES_LEGADO);
        try {
          const parsed = JSON.parse(legado ?? 'null');
          if (Array.isArray(parsed)) {
            rawLista = JSON.stringify(parsed);
            localStorage.setItem(CHAVE_FORNECEDORES, rawLista);
          }
        } catch { /* legado não era lista */ }
      }
      try {
        const f = JSON.parse(rawLista ?? '[]');
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

  const removerFornecedor = (nome: string) => salvarFornecedores(fornecedoresList.filter((f) => f !== nome));

  const resetarResultados = () => {
    setIgnorados(new Set());
    setUnidades({});
    setMapeamentos({});
    setCadastrados(new Set());
    setAplicado(0);
    setIaErro('');
  };

  const detectarFornecedor = () => {
    const detectado = extrairRemetenteWhatsApp(texto);
    if (detectado && !fornecedorNome) setFornecedorNome(detectado);
  };

  const salvarTexto = () => {
    try { localStorage.setItem(CHAVE_TEXTO, texto); } catch { /* cache descartável */ }
  };

  const ler = () => {
    salvarTexto();
    setLido(parsearCotacao(texto, fornecedoresList));
    setModoUsado('logica');
    resetarResultados();
    detectarFornecedor();
  };

  const lerComIA = async () => {
    salvarTexto();
    setIaCarregando(true);
    resetarResultados();
    try {
      // A IA de cotação só é habilitada pelo proxy seguro de servidor. O
      // navegador não guarda nem recebe chave privada de provedor.
      const { linhas, comIA, erroIA } = await parsearCotacaoComIA(texto, fornecedoresList);
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
  const fornDigitado = fornecedorNome.trim().replace(/^fornecedor\s*[:\-–]?\s*/i, '').trim();

  const aplicar = () => {
    selecionados.filter((c) => !c.bloqueado).forEach((c) => {
      const norm = normalizar(c.item);
      const forn = fornDigitado || c.marca;
      definirPreco(norm, c.preco, c.item);
      definirFornecedor?.(norm, forn);
      if (forn) registrarOferta?.(norm, forn, c.preco);
    });
    setAplicado(selecionados.filter((c) => !c.bloqueado).length);
  };

  /**
   * Produto realmente novo: exige unidade explícita. Nunca assume kg.
   * Oferta é dado de compra; virar item canônico é uma decisão separada.
   */
  const cadastrarNovo = (idx: number, s: LinhaCotacao) => {
    const unid = unidades[idx] ?? s.unid ?? '';
    if (!unid) return;
    const norm = normalizar(s.nome);
    cadastrarItem?.(norm, s.nome, unid);
    definirPreco(norm, s.preco, s.nome);
    const forn = fornDigitado || s.marca;
    definirFornecedor?.(norm, forn);
    if (forn) registrarOferta?.(norm, forn, s.preco);
    setCadastrados((c) => new Set(c).add(idx));
  };

  /**
   * Nome novo do fornecedor que na verdade é um item já conhecido. Guardamos
   * o alias bruto → item canônico para que a próxima cotação seja reconhecida
   * automaticamente, sem poluir o catálogo com duplicatas.
   */
  const relacionarExistente = (idx: number, s: LinhaCotacao) => {
    const alvoNome = mapeamentos[idx];
    const alvo = DADOS.itens.find((i) => i.n === alvoNome);
    if (!alvo) return;
    const rawNorm = normalizar(s.nome);
    const alvoNorm = normalizar(alvo.n);
    cadastrarItem?.(rawNorm, alvo.n, alvo.u);
    definirPreco(alvoNorm, s.preco, alvo.n);
    const forn = fornDigitado || s.marca;
    definirFornecedor?.(alvoNorm, forn);
    if (forn) registrarOferta?.(alvoNorm, forn, s.preco);
    setCadastrados((c) => new Set(c).add(idx));
  };

  const novosComUnidade = soltos.filter((s) => {
    const idx = lido?.indexOf(s) ?? -1;
    return idx >= 0 && !cadastrados.has(idx) && !!(unidades[idx] ?? s.unid);
  });

  const assimilarNovosSeguros = () => {
    novosComUnidade.forEach((s) => {
      const idx = lido?.indexOf(s) ?? -1;
      if (idx >= 0) cadastrarNovo(idx, s);
    });
  };

  const alternar = (item: string) =>
    setIgnorados((s) => {
      const novo = new Set(s);
      if (novo.has(item)) novo.delete(item);
      else novo.add(item);
      return novo;
    });

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

  const iaSeguraAtiva = iaEdgeAtivo();

  return (
    <div className="space-y-4">
      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`cursor-pointer rounded-full border border-dashed px-4 py-2 text-rotulo font-bold transition ${pdfCarregando ? 'pointer-events-none border-carvao-200 text-carvao-300 dark:border-carvao-700' : 'border-carvao-300 text-carvao-500 hover:border-brand-400 hover:text-brand-600 dark:border-carvao-600 dark:text-texto-suave'}`}>
            {pdfCarregando ? 'Lendo PDF…' : 'Importar arquivo (CSV / TXT / PDF)'}
            <input type="file" accept=".csv,.txt,.tsv,.pdf" className="hidden" disabled={pdfCarregando} onChange={importarArquivo} />
          </label>
        </div>
        {pdfErro && <p className="rounded-xl bg-red-50 px-3 py-2 text-caption font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40">{pdfErro}</p>}

        <textarea
          rows={8}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Ex.:\n7,00 Frango inteiro RF\nAcém Resf - Ribeiro *31,90*\nTiras de carnes\t\tR$ 43,00'}
          className="w-full rounded-2xl border border-carvao-200 bg-white px-4 py-3 font-mono text-xs leading-relaxed dark:border-carvao-600 dark:bg-carvao-900"
        />

        <div>
          <label className="mb-1 block text-caption font-bold uppercase tracking-widest text-texto-suave">Fornecedor (detectado ou informe)</label>
          <input
            value={fornecedorNome}
            onChange={(e) => setFornecedorNome(e.target.value)}
            placeholder="Nome do fornecedor (ex: Distribuidora XYZ)"
            className="w-full rounded-2xl border border-carvao-200 bg-white px-4 py-2.5 text-sm dark:border-carvao-600 dark:bg-carvao-900"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-texto-suave">{fornecedoresList.length > 0 ? `${fornecedoresList.length} fornecedor${fornecedoresList.length !== 1 ? 'es' : ''}` : 'Nenhum fornecedor'}</span>
            <button onClick={() => setMostrarForn((v) => !v)} className="text-xs font-bold text-brand-600 dark:text-brand-400">Gerenciar {mostrarForn ? '↑' : '↓'}</button>
          </div>
          {mostrarForn && (
            <div className="space-y-2 pt-1">
              {fornecedoresList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fornecedoresList.map((nome) => (
                    <span key={nome} className="flex items-center gap-1 rounded-full bg-carvao-100 px-3 py-1 text-xs font-semibold text-carvao-700 dark:bg-carvao-700 dark:text-carvao-200">
                      {nome}
                      <button onClick={() => removerFornecedor(nome)} className="ml-1 text-texto-suave hover:text-red-500" aria-label={`Remover ${nome}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={novoForn} onChange={(e) => setNovoForn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarFornecedor()} placeholder="Nome do fornecedor" className="min-w-0 flex-1 rounded-xl border border-carvao-200 bg-white px-3 py-2 text-xs dark:border-carvao-600 dark:bg-carvao-900" />
                <button onClick={adicionarFornecedor} className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">Adicionar</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-carvao-50 px-3 py-2 text-xs text-texto-suave dark:bg-carvao-800">
          <span className={`h-2 w-2 rounded-full ${iaSeguraAtiva ? 'bg-brand-500' : 'bg-carvao-300'}`} />
          {iaSeguraAtiva ? 'IA segura ativa pelo servidor' : 'IA de cotação indisponível — a leitura por regras continua funcionando'}
        </div>

        <div className={`grid gap-2 ${iaSeguraAtiva ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {iaSeguraAtiva && (
            <Botao variante="primario" className="w-full" disabled={!texto.trim() || iaCarregando} onClick={lerComIA}>
              {iaCarregando ? 'Analisando…' : 'Ler com IA ✦'}
            </Botao>
          )}
          <Botao variante={iaSeguraAtiva ? 'secundario' : 'primario'} className="w-full" disabled={!texto.trim() || iaCarregando} onClick={ler}>
            {iaSeguraAtiva ? 'Só lógica' : 'Ler cotação'}
          </Botao>
        </div>

        {iaErro && <p className="rounded-xl bg-amber-50 px-3 py-2 text-caption font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/40">IA indisponível ({iaErro}) — resultado gerado apenas pela lógica.</p>}
      </Cartao>

      {lido && (
        <>
          {casados.length === 0 && soltos.length === 0 ? (
            <Cartao><p className="text-sm text-texto-suave">Nenhum preço reconhecido. Confira se o texto tem valores no formato <code>12,34</code>.</p></Cartao>
          ) : (
            <Cartao className="space-y-3 !p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
                <h3 className="font-display text-lg font-semibold">{casados.length} itens reconhecidos</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${modoUsado === 'combo' ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'bg-carvao-100 text-carvao-500 dark:bg-carvao-700 dark:text-texto-suave'}`}>
                  {modoUsado === 'combo' ? '✦ IA + regras' : 'Regras'}
                </span>
              </div>
              <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
                {casados.map((c) => {
                  const fora = ignorados.has(c.item);
                  const delta = c.deltaHistorico;
                  const deltaPct = delta != null ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%` : null;
                  const corDelta = delta == null ? '' : delta > 0.12 ? 'text-red-600 dark:text-red-400' : delta < -0.12 ? 'text-brand-600 dark:text-brand-400' : 'text-texto-suave';
                  const corConfianca = c.confianca === 'alta' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : c.confianca === 'media' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : c.confianca === 'baixa' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-carvao-100 text-texto-suave dark:bg-carvao-700';
                  const labelConfianca = c.confianca === 'alta' ? '● alta' : c.confianca === 'media' ? '● média' : c.confianca === 'baixa' ? '● baixa' : '○ sem hist.';
                  return (
                    <li key={c.item} className={`px-5 py-2.5 ${fora ? 'opacity-40' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                          <input type="checkbox" checked={!fora} onChange={() => alternar(c.item)} className="h-4 w-4 shrink-0 accent-brand-600" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{c.item}</span>
                            <span className="block text-caption text-texto-suave">{c.marca ? `${c.marca} · ` : ''}{c.ofertas > 1 ? `melhor de ${c.ofertas} ofertas` : '1 oferta'}{c.origemHistorico ? ` · ${c.origemHistorico}` : ''}</span>
                          </span>
                        </label>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-bold">{formatarReais(c.preco)}<span className="font-normal text-texto-suave">/{c.unid}</span></span>
                          <div className="mt-0.5 flex items-center justify-end gap-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-micro font-bold ${corConfianca}`}>{labelConfianca}</span>
                            {c.precoHistorico != null && deltaPct && <span className={`text-micro font-semibold ${corDelta}`}>{deltaPct} hist. {formatarReais(c.precoHistorico)}</span>}
                          </div>
                        </div>
                      </div>
                      {c.alerta && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-micro font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">⚠ {c.alerta}</p>}
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-2 px-5 pb-4">
                <Botao variante="sucesso" className="w-full" disabled={selecionados.length === 0} onClick={aplicar}>Aplicar {selecionados.length} preços à tabela</Botao>
                {aplicado > 0 && <p className="text-center text-xs font-semibold text-brand-600">✓ {aplicado} preços aplicados. O planejamento e os relatórios já passam a recalcular com a nova cotação.</p>}
              </div>
            </Cartao>
          )}

          {soltos.length > 0 && (
            <Cartao className="space-y-3">
              <div>
                <h3 className="font-display text-lg font-semibold">{soltos.length} itens pedindo revisão</h3>
                <p className="mt-1 text-xs leading-5 text-texto-suave">
                  O House já tenta assimilar sozinho nomes, plurais, aliases e variações do fornecedor. Aqui ficam só os casos sem correspondência segura. Itens realmente novos que já trazem unidade podem ser criados de uma vez.
                </p>
                {novosComUnidade.length > 0 && (
                  <button
                    onClick={assimilarNovosSeguros}
                    className="mt-3 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-700"
                  >
                    Assimilar automaticamente {novosComUnidade.length} item{novosComUnidade.length === 1 ? '' : 'ns'} com unidade confirmada
                  </button>
                )}
              </div>
              <ul className="divide-y divide-carvao-100 dark:divide-carvao-700/60">
                {soltos.map((s) => {
                  const idx = lido.indexOf(s);
                  const feito = cadastrados.has(idx);
                  const unidadeNova = unidades[idx] ?? s.unid ?? '';
                  return (
                    <li key={`${idx}-${s.nome}`} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{s.nome}</span>
                          <span className="block text-caption text-texto-suave">{formatarReais(s.preco)}{s.marca ? ` · ${s.marca}` : ''}{s.unid ? ` · unidade informada ${s.unid}` : ' · unidade não informada'}</span>
                        </span>
                        {feito && <span className="shrink-0 text-xs font-bold uppercase text-brand-600">✓ Resolvido</span>}
                      </div>
                      {!feito && (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select value={mapeamentos[idx] ?? ''} onChange={(e) => setMapeamentos((m) => ({ ...m, [idx]: e.target.value }))} className="min-w-0 rounded-xl border border-carvao-200 bg-white px-3 py-2 text-xs dark:border-carvao-600 dark:bg-carvao-900">
                            <option value="">Relacionar a item existente…</option>
                            {DADOS.itens.slice().sort((a, b) => a.n.localeCompare(b.n, 'pt-BR')).map((i) => <option key={`${i.n}-${i.u}`} value={i.n}>{i.n} · {i.u}</option>)}
                          </select>
                          <button disabled={!mapeamentos[idx]} onClick={() => relacionarExistente(idx, s)} className="rounded-xl bg-carvao-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-areia-100 dark:text-carvao-900">Relacionar</button>
                        </div>
                      )}
                      {!feito && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-texto-suave">ou criar novo</span>
                          <select value={unidadeNova} onChange={(e) => setUnidades((u) => ({ ...u, [idx]: e.target.value }))} className="rounded-xl border border-carvao-200 bg-white px-2 py-1.5 text-xs font-bold dark:border-carvao-600 dark:bg-carvao-900">
                            <option value="">Escolha a unidade…</option>
                            {DADOS.unidades.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <button disabled={!unidadeNova} onClick={() => cadastrarNovo(idx, s)} className="rounded-xl border border-brand-300 px-3 py-1.5 text-xs font-bold text-brand-700 disabled:opacity-40 dark:text-brand-300">Criar item</button>
                        </div>
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
