'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AbaCardapio } from './AbaCardapio';
import { CardapioOrientadoDados } from './CardapioOrientadoDados';
import { CenariosGovernanca } from './CenariosGovernanca';
import {
  datasDaSemana,
  lerDesperdicio,
  lerSemana,
  semanaVazia,
  semanasComConteudo,
  useAceitacao,
  useAprendizado,
  useEstoque,
  useEventos,
  useFornecedores,
  useFuncionarios,
  useHistoricoPrecos,
  useItensExtras,
  useOfertas,
  usePrecos,
  useSemana,
} from '@/lib/cardapio/estado';
import { useEstimativas } from '@/lib/cardapio/estimativas';
import { normalizar } from '@/lib/cardapio/motor';
import {
  avaliarProntidaoPlanejamento,
  construirDraftPlanejamentoGovernanca,
  enviarDraftPlanejamentoGovernanca,
  instalarHandoffPlanejadorGovernanca,
  type PlanejadorContextoGovernancaV1,
} from '@/lib/cardapio/governanca-planejador';
import {
  frequenciaOficial4Semanas,
  instalarHandoffEvidenciaReadOnly,
  type EvidenciaGovernancaReadOnlyV1,
} from '@/lib/cardapio/governanca-readonly';
import {
  instalarHandoffRestricoesGovernanca,
  itensDaSemanaParaRestricoes,
  restricoesLocaisAgregadas,
  solicitarRestricoesGovernanca,
  type SnapshotRestricoesGovernancaV1,
} from '@/lib/cardapio/governanca-restricoes';

function novoId(prefixo: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefixo}-${crypto.randomUUID()}`;
    }
  } catch {}
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function EstadoConexao() {
  return (
    <main className="min-h-screen bg-areia-50 px-4 py-10 text-carvao-800 dark:bg-carvao-950 dark:text-areia-100">
      <div className="mx-auto max-w-xl rounded-3xl border border-carvao-100 bg-white p-7 shadow-sm dark:border-carvao-800 dark:bg-carvao-900">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-600">TATÁ House × Governança</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Planejamento assistido</h1>
        <p className="mt-3 text-sm leading-6 text-texto-suave">
          Esta superfície só libera o planejamento depois de receber um contexto válido do Portal Líderes.
          Abra pelo módulo de Governança do TATÁ House.
        </p>
        <div className="mt-6 rounded-2xl bg-carvao-50 px-4 py-3 text-sm dark:bg-carvao-800">
          Aguardando unidade e semana autorizadas…
        </div>
      </div>
    </main>
  );
}

function FaixaStatus({
  contexto,
  podeEnviar,
  bloqueios,
  alertas,
}: {
  contexto: PlanejadorContextoGovernancaV1;
  podeEnviar: boolean;
  bloqueios: string[];
  alertas: string[];
}) {
  const temBloqueioPrincipal = bloqueios.some((item) => /prato principal.*não definido/i.test(item));
  const alertasUteis = alertas.filter((item) => !(temBloqueioPrincipal && /sem prato principal definido/i.test(item)));
  const bloqueiosVisiveis = bloqueios.slice(0, 6);
  const bloqueiosRestantes = Math.max(0, bloqueios.length - bloqueiosVisiveis.length);
  const alertasVisiveis = alertasUteis.slice(0, 6);
  const alertasRestantes = Math.max(0, alertasUteis.length - alertasVisiveis.length);
  return (
    <section className="rounded-3xl border border-carvao-100 bg-white p-5 shadow-sm dark:border-carvao-800 dark:bg-carvao-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">Planejamento da semana</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{contexto.unidadeFonte} · {contexto.semanaId}</h1>
          <p className="mt-1 text-sm text-texto-suave">O House compara opções. Você revisa a semana e decide antes de enviar.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
          podeEnviar
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        }`}>
          {podeEnviar ? 'Pronto para revisão' : `${bloqueios.length} bloqueio${bloqueios.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {(bloqueios.length > 0 || alertasUteis.length > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {bloqueios.length > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50/80 p-4 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-xs font-extrabold uppercase tracking-wider text-red-700 dark:text-red-300">Corrigir antes de enviar</p>
              <ul className="mt-2 space-y-1.5 text-sm text-red-800 dark:text-red-200">
                {bloqueiosVisiveis.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              {bloqueiosRestantes > 0 && (
                <p className="mt-2 text-xs font-bold text-red-700 dark:text-red-300">+{bloqueiosRestantes} bloqueio{bloqueiosRestantes === 1 ? '' : 's'} adicional{bloqueiosRestantes === 1 ? '' : 'is'}</p>
              )}
            </div>
          )}
          {alertasUteis.length > 0 && (
            <div className="rounded-2xl border border-ouro-200 bg-ouro-50/70 p-4 dark:border-ouro-800 dark:bg-ouro-950/20">
              <p className="text-xs font-extrabold uppercase tracking-wider text-ouro-700 dark:text-ouro-300">Pontos para decidir</p>
              <ul className="mt-2 space-y-1.5 text-sm text-carvao-700 dark:text-carvao-200">
                {alertasVisiveis.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              {alertasRestantes > 0 && (
                <p className="mt-2 text-xs font-bold text-ouro-700 dark:text-ouro-300">+{alertasRestantes} ponto{alertasRestantes === 1 ? '' : 's'} adicional{alertasRestantes === 1 ? '' : 'is'}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlanejadorAutorizado({ contexto }: { contexto: PlanejadorContextoGovernancaV1 }) {
  const [aba, setAba] = useState<'montar' | 'decisao'>('montar');
  const [envio, setEnvio] = useState<'ocioso' | 'enviando' | 'confirmado' | 'erro'>('ocioso');
  const [mensagemEnvio, setMensagemEnvio] = useState('');
  const [evidenciaReadOnly, setEvidenciaReadOnly] = useState<EvidenciaGovernancaReadOnlyV1 | null>(null);
  const [restricoesOficiais, setRestricoesOficiais] = useState<SnapshotRestricoesGovernancaV1 | null>(null);
  const proposalIdPendente = useRef<string | null>(null);

  const { estado, atualizar, pronto } = useSemana(contexto.semanaId);
  const { precos, definirPreco } = usePrecos();
  const { fornecedores, definirFornecedor } = useFornecedores();
  const { registrarOferta } = useOfertas();
  const { itensExtras, cadastrarItem } = useItensExtras();
  const { fatores } = useAprendizado();
  const { aceitacao } = useAceitacao();
  const { estoque } = useEstoque();
  const { eventos } = useEventos();
  const { funcionarios } = useFuncionarios();
  const { estimativas } = useEstimativas();
  const historico = useHistoricoPrecos();

  const frequenciaRecente = useMemo(() => {
    const cont: Record<string, number> = {};
    const ids = semanasComConteudo()
      .filter((sid) => sid !== contexto.semanaId)
      .sort()
      .slice(-4);
    ids.forEach((sid) => {
      lerSemana(sid).dias.forEach((dia) => {
        if (!dia.principal) return;
        const chave = normalizar(dia.principal);
        cont[chave] = (cont[chave] ?? 0) + 1;
      });
    });
    const oficial = frequenciaOficial4Semanas(evidenciaReadOnly);
    Object.entries(oficial).forEach(([chave, qtd]) => {
      cont[chave] = Math.max(cont[chave] ?? 0, qtd);
    });
    return cont;
  }, [contexto.semanaId, evidenciaReadOnly]);

  const estoqueQuantidade = useMemo(() => Object.fromEntries(
    Object.entries(estoque).map(([chave, item]) => [chave, item.qtd]),
  ), [estoque]);

  const restricoesEquipe = useMemo(() => restricoesLocaisAgregadas(funcionarios), [funcionarios]);
  const baselineAutomatico = useMemo(() => semanaVazia().dias.map((d) => d.pessoas), []);
  const datasSemana = useMemo(() => datasDaSemana(contexto.semanaId).map((d) => d.toISOString().slice(0, 10)), [contexto.semanaId]);
  const desperdicioHistorico = semanasComConteudo().flatMap((sid) => lerDesperdicio(sid));

  const prontidao = useMemo(
    () => avaliarProntidaoPlanejamento(estado.dias, precos),
    [estado.dias, precos],
  );

  useEffect(() => instalarHandoffEvidenciaReadOnly({
    unidadeEsperada: contexto.unidadeFonte,
    semanaEsperada: contexto.semanaId,
    aoEvidencia: setEvidenciaReadOnly,
  }), [contexto.semanaId, contexto.unidadeFonte]);

  useEffect(() => instalarHandoffRestricoesGovernanca({
    unidadeEsperada: contexto.unidadeFonte,
    semanaEsperada: contexto.semanaId,
    aoSnapshot: setRestricoesOficiais,
  }), [contexto.semanaId, contexto.unidadeFonte]);

  useEffect(() => {
    const itens = itensDaSemanaParaRestricoes(estado.dias);
    if (!itens.length) { setRestricoesOficiais(null); return; }
    const timer = window.setTimeout(() => {
      solicitarRestricoesGovernanca({ unidade: contexto.unidadeFonte, semanaId: contexto.semanaId, itens });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [contexto.semanaId, contexto.unidadeFonte, estado.dias]);

  useEffect(() => instalarHandoffPlanejadorGovernanca({
    aoContexto: () => {},
    aoAckRascunho: (ack) => {
      if (!proposalIdPendente.current || ack.proposalId !== proposalIdPendente.current) return;
      setEnvio(ack.ok ? 'confirmado' : 'erro');
      setMensagemEnvio(
        ack.ok
          ? 'Rascunho recebido pela Governança. Ele ainda precisa de decisão humana para virar cardápio oficial.'
          : 'A Governança rejeitou o rascunho. Revise o contexto e tente novamente.',
      );
      if (ack.ok) proposalIdPendente.current = null;
    },
  }), []);

  const enviarParaGovernanca = () => {
    if (!prontidao.podeEnviar) return;
    const id = novoId('planejamento');
    const draft = construirDraftPlanejamentoGovernanca(contexto, estado.dias, prontidao, id);
    proposalIdPendente.current = id;
    setEnvio('enviando');
    setMensagemEnvio('Enviando rascunho para revisão na Governança…');
    const enviado = enviarDraftPlanejamentoGovernanca(draft);
    if (!enviado) {
      proposalIdPendente.current = null;
      setEnvio('erro');
      setMensagemEnvio('Não encontrei a janela da Governança para receber este rascunho.');
    }
  };

  if (!pronto) {
    return (
      <main className="min-h-screen bg-areia-50 px-4 py-10 dark:bg-carvao-950">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 text-sm text-texto-suave shadow-sm dark:bg-carvao-900">
          Carregando estado operacional da semana…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-areia-50 px-3 py-4 text-carvao-800 dark:bg-carvao-950 dark:text-areia-100 md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <FaixaStatus
          contexto={contexto}
          podeEnviar={prontidao.podeEnviar}
          bloqueios={prontidao.bloqueios}
          alertas={prontidao.alertas}
        />

        {restricoesOficiais && (
          <section data-testid="restricoes-oficiais-plus" className={`rounded-2xl border px-4 py-3 text-sm ${restricoesOficiais.conflitos.length > 0 ? 'border-red-200 bg-red-50/80 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200' : 'border-brand-100 bg-brand-50/70 text-brand-900 dark:border-brand-900 dark:bg-brand-950/20 dark:text-brand-100'}`}>
            <strong>Restrições oficiais do TATÁ Plus:</strong> {restricoesOficiais.conflitos.length > 0 ? `${restricoesOficiais.conflitos.length} pessoa(s) com conflito na composição atual. Revise antes de aprovar.` : 'nenhum conflito encontrado na composição atual.'}
          </section>
        )}

        {evidenciaReadOnly && (
          <section data-testid="evidencia-readonly-lideres" className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950/20 dark:text-brand-100">
            <strong>Histórico oficial carregado:</strong> {evidenciaReadOnly.dias.length} dia(s) · {evidenciaReadOnly.principais.length} principal(is) agregados · {evidenciaReadOnly.periodo.de.split('-').reverse().join('/')} a {evidenciaReadOnly.periodo.ate.split('-').reverse().join('/')}. Usado somente para analisar esta semana.
          </section>
        )}

        <div className="sticky top-2 z-20 flex items-center gap-2 rounded-2xl border border-carvao-100 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-carvao-800 dark:bg-carvao-900/95">
          <button
            type="button"
            onClick={() => setAba('montar')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              aba === 'montar'
                ? 'bg-carvao-900 text-white dark:bg-areia-100 dark:text-carvao-900'
                : 'text-carvao-500 hover:bg-carvao-50 dark:text-carvao-300 dark:hover:bg-carvao-800'
            }`}
          >
            1. Comparar e compor
          </button>
          <button
            type="button"
            onClick={() => setAba('decisao')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              aba === 'decisao'
                ? 'bg-carvao-900 text-white dark:bg-areia-100 dark:text-carvao-900'
                : 'text-carvao-500 hover:bg-carvao-50 dark:text-carvao-300 dark:hover:bg-carvao-800'
            }`}
          >
            2. Validar decisão
          </button>
        </div>

        {aba === 'montar' ? (
          <div className="space-y-4">
            <CenariosGovernanca
              estado={estado}
              atualizar={atualizar}
              precos={precos}
              estimativas={estimativas}
              fatores={fatores}
              aceitacao={aceitacao}
              frequencia={frequenciaRecente}
              estoque={estoqueQuantidade}
              restricoesEquipe={restricoesEquipe}
              desperdicioHistorico={desperdicioHistorico}
              historicoPrecos={historico}
              baselineAutomatico={baselineAutomatico}
              eventos={eventos}
              datasSemana={datasSemana}
            />

            <section className="rounded-3xl border border-carvao-100 bg-white p-3 shadow-sm dark:border-carvao-800 dark:bg-carvao-900 md:p-5">
              <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:bg-brand-900/20 dark:text-brand-200">
                <strong>Ajuste fino:</strong> depois de comparar os cenários, altere qualquer dia manualmente. Os geradores antigos continuam disponíveis como ferramenta secundária, mas não substituem a comparação acima.
              </div>
              <AbaCardapio
                estado={estado}
                atualizar={atualizar}
                semanaId={contexto.semanaId}
                fatores={fatores}
                podeEditar={true}
                precos={precos}
                definirPreco={definirPreco}
                definirFornecedor={definirFornecedor}
                cadastrarItem={cadastrarItem}
                registrarOferta={registrarOferta}
                fornecedores={fornecedores}
                itensExtras={itensExtras}
              />
            </section>
          </div>
        ) : (
          <section className="rounded-3xl border border-carvao-100 bg-white p-3 shadow-sm dark:border-carvao-800 dark:bg-carvao-900 md:p-5">
            <div className="mb-4 rounded-2xl bg-carvao-50 px-4 py-3 text-sm text-carvao-600 dark:bg-carvao-800 dark:text-carvao-200">
              Esta leitura cruza custo por porção, aceitação, histórico e tendência de preços. Ela orienta a decisão; não aprova nada sozinha.
            </div>
            <CardapioOrientadoDados
              dias={estado.dias}
              precos={precos}
              aceitacao={aceitacao}
              historico={historico}
            />
          </section>
        )}

        <section className="rounded-3xl border border-carvao-100 bg-white p-5 shadow-sm dark:border-carvao-800 dark:bg-carvao-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-texto-suave">Próxima etapa</p>
              <h2 className="mt-1 text-lg font-bold">Enviar proposta para revisão</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-texto-suave">
                Isso não publica nem aprova automaticamente. A Governança recebe uma proposta versionada para revisão humana.
              </p>
              {mensagemEnvio && (
                <p className={`mt-2 text-sm font-semibold ${
                  envio === 'confirmado' ? 'text-brand-700 dark:text-brand-300' :
                  envio === 'erro' ? 'text-red-700 dark:text-red-300' : 'text-carvao-500 dark:text-carvao-300'
                }`}>
                  {mensagemEnvio}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={enviarParaGovernanca}
              disabled={!prontidao.podeEnviar || envio === 'enviando'}
              className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {envio === 'enviando' ? 'Enviando…' : 'Enviar proposta'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export function PlanejadorGovernanca() {
  const [contexto, setContexto] = useState<PlanejadorContextoGovernancaV1 | null>(null);

  useEffect(() => instalarHandoffPlanejadorGovernanca({ aoContexto: setContexto }), []);

  if (!contexto) return <EstadoConexao />;
  return <PlanejadorAutorizado key={`${contexto.correlationId}:${contexto.semanaId}`} contexto={contexto} />;
}