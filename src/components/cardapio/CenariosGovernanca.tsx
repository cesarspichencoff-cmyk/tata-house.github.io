'use client';

import { useState } from 'react';
import { DIAS_SEMANA, formatarReais } from '@/lib/cardapio/motor';
import {
  aplicarCenarioAoEstado,
  gerarCenariosGovernanca,
  type CenarioGovernanca,
} from '@/lib/cardapio/governanca-candidatos';
import type { Aceitacao, EstadoSemana } from '@/lib/cardapio/tipos';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-carvao-50 px-3 py-2.5 dark:bg-carvao-800/80">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-texto-suave">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-carvao-900 dark:text-areia-100">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-4 text-texto-suave">{hint}</p>}
    </div>
  );
}

function CardCenario({
  cenario,
  aplicado,
  aoAplicar,
}: {
  cenario: CenarioGovernanca;
  aplicado: boolean;
  aoAplicar: () => void;
}) {
  const m = cenario.metricas;
  const regras = m.erros > 0 ? `${m.erros} erro${m.erros === 1 ? '' : 's'}` : m.alertas > 0 ? `${m.alertas} alerta${m.alertas === 1 ? '' : 's'}` : 'Sem quebra';
  return (
    <article
      data-testid={`cenario-${cenario.id}`}
      className={`flex min-w-0 flex-col rounded-2xl border p-4 transition ${
        aplicado
          ? 'border-brand-400 bg-brand-50/70 ring-2 ring-brand-200 dark:border-brand-600 dark:bg-brand-950/20 dark:ring-brand-900'
          : 'border-carvao-100 bg-white dark:border-carvao-800 dark:bg-carvao-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-carvao-900 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white dark:bg-areia-100 dark:text-carvao-900">
            {cenario.selo}
          </span>
          <h3 className="mt-2 font-display text-lg font-bold tracking-tight">{cenario.titulo}</h3>
          <p className="mt-1 text-xs leading-5 text-texto-suave">{cenario.descricao}</p>
        </div>
        {aplicado && <span className="shrink-0 text-xs font-extrabold text-brand-700 dark:text-brand-300">Aplicado</span>}
      </div>

      {cenario.semelhanteA && (
        <div className="mt-3 rounded-xl border border-ouro-200 bg-ouro-50 px-3 py-2 text-[11px] leading-4 text-ouro-800 dark:border-ouro-800 dark:bg-ouro-950/20 dark:text-ouro-200">
          Esta saída ficou muito semelhante ao cenário {cenario.semelhanteA}. O sistema sinaliza isso em vez de fingir diversidade.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric
          label="Custo / refeição"
          value={m.custoPorRefeicao === null ? 'Incompleto' : formatarReais(m.custoPorRefeicao)}
          hint={m.itensSemPreco > 0 ? `${m.itensSemPreco} item(ns) sem preço` : m.itensEstimados > 0 ? `${m.itensEstimados} estimado(s)` : 'fonte única de custo'}
        />
        <Metric
          label="Aceitação"
          value={m.aceitacaoMedia === null ? 'Sem amostra' : `${m.aceitacaoMedia.toFixed(1)}/5`}
          hint={`${m.pratosComAceitacao}/7 principais · ${m.votosAceitacao} voto(s)`}
        />
        <Metric
          label="Repetição recente"
          value={`${m.pratosRecentes}/7`}
          hint={`${m.ocorrenciasRecentes} ocorrência(s) no recorte`}
        />
        <Metric
          label="Regras"
          value={regras}
          hint={m.erros > 0 ? `${m.alertas} alerta(s) adicional(is)` : `${m.proteinasDistintas} proteínas distintas`}
        />
        <Metric label="Nutrição" value={`${m.nutricaoMedia}/100`} hint="heurística existente do House" />
        <Metric label="Cobertura de dados" value={`${m.coberturaDadosPct}%`} hint={`${m.coberturaPrecoPct}% cobertura de preço`} />
      </div>

      <div className="mt-4 rounded-xl border border-carvao-100 bg-areia-50/60 p-3 dark:border-carvao-800 dark:bg-carvao-950/30">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-texto-suave">Semana proposta</p>
        <div className="mt-2 space-y-1.5">
          {cenario.dias.map((dia, i) => (
            <div key={`${cenario.id}-${i}`} className="grid grid-cols-[54px_1fr] gap-2 text-xs leading-4">
              <span className="font-extrabold text-carvao-400 dark:text-carvao-500">{DIAS_SEMANA[i]?.slice(0, 3)}</span>
              <span className="min-w-0 font-semibold text-carvao-800 dark:text-areia-100">{dia.principal || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-carvao-100 px-3 py-2 dark:border-carvao-800">
        <summary className="cursor-pointer text-xs font-extrabold text-carvao-600 dark:text-carvao-200">Por que este cenário?</summary>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-texto-suave">
          {cenario.porques.map((porque) => <li key={porque}>• {porque}</li>)}
        </ul>
      </details>

      <button
        type="button"
        data-testid={`aplicar-${cenario.id}`}
        onClick={aoAplicar}
        className="mt-4 rounded-xl bg-carvao-900 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-carvao-700 dark:bg-areia-100 dark:text-carvao-900 dark:hover:bg-white"
      >
        {m.erros > 0 ? 'Aplicar e corrigir no rascunho' : 'Aplicar este cenário'}
      </button>
    </article>
  );
}

export function CenariosGovernanca({
  estado,
  atualizar,
  precos,
  estimativas,
  fatores,
  mostrarBasicos,
  aceitacao,
  frequencia,
  estoque,
}: {
  estado: EstadoSemana;
  atualizar: (fn: (estado: EstadoSemana) => EstadoSemana) => void;
  precos: Record<string, number>;
  estimativas: Record<string, number>;
  fatores?: Record<string, number>;
  mostrarBasicos?: boolean;
  aceitacao: Aceitacao;
  frequencia: Record<string, number>;
  estoque: Record<string, number>;
}) {
  const [cenarios, setCenarios] = useState<CenarioGovernanca[]>([]);
  const [aplicado, setAplicado] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState('');

  const gerar = () => {
    const novos = gerarCenariosGovernanca({
      estado,
      precos,
      estimativas,
      fatores,
      mostrarBasicos,
      aceitacao,
      frequencia,
      estoque,
    });
    setCenarios(novos);
    setAplicado(null);
    setMensagem(
      novos.length === 3
        ? 'Três estratégias prontas. Compare antes de mudar o rascunho.'
        : `O motor conseguiu formar ${novos.length} cenário(s) válido(s) com os dados carregados.`,
    );
  };

  const aplicar = (cenario: CenarioGovernanca) => {
    const temDerivados = Object.keys(estado.ajustes).length > 0
      || Object.keys(estado.manuais).length > 0
      || Object.keys(estado.status).length > 0
      || Object.keys(estado.refeicoes ?? {}).length > 0
      || Object.keys(estado.notas ?? {}).length > 0
      || (estado.notasFiscais?.length ?? 0) > 0;
    if (temDerivados && typeof window !== 'undefined') {
      const ok = window.confirm(
        'Aplicar este cenário substitui a composição local da semana e limpa ajustes, status, contagens e notas operacionais ligados ao cardápio anterior. O histórico de auditoria é preservado. Continuar?',
      );
      if (!ok) return;
    }
    atualizar((atual) => aplicarCenarioAoEstado(atual, cenario.dias));
    setAplicado(cenario.id);
    setMensagem('Cenário aplicado somente ao rascunho local. Revise e ajuste os dias antes de enviar para a Governança.');
  };

  return (
    <section data-testid="comparador-cenarios" className="rounded-3xl border border-carvao-100 bg-gradient-to-b from-white to-areia-50/50 p-4 shadow-sm dark:border-carvao-800 dark:from-carvao-900 dark:to-carvao-950/40 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">Decisão antes da edição</p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Compare 3 estratégias para a mesma semana</h2>
          <p className="mt-2 text-sm leading-6 text-texto-suave">
            O House usa o motor real e mede cada proposta com as mesmas fontes de custo, regras, aceitação e histórico. Nenhum cenário vira cardápio sozinho.
          </p>
        </div>
        <button
          type="button"
          data-testid="gerar-cenarios"
          onClick={gerar}
          className="shrink-0 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700"
        >
          {cenarios.length ? 'Gerar 3 novos cenários' : 'Comparar 3 cenários'}
        </button>
      </div>

      {mensagem && <p data-testid="mensagem-cenarios" className="mt-3 text-xs font-semibold text-carvao-500 dark:text-carvao-300">{mensagem}</p>}

      {cenarios.length > 0 && (
        <div data-testid="lista-cenarios" className="mt-5 grid gap-3 lg:grid-cols-3">
          {cenarios.map((cenario) => (
            <CardCenario
              key={`${cenario.id}-${cenario.fingerprint}`}
              cenario={cenario}
              aplicado={aplicado === cenario.id}
              aoAplicar={() => aplicar(cenario)}
            />
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-dashed border-carvao-200 px-4 py-3 text-xs leading-5 text-texto-suave dark:border-carvao-700">
        Aplicar = trocar apenas o <strong>rascunho local</strong>. Publicação oficial, Supabase e aprovação automática continuam bloqueados.
      </div>
    </section>
  );
}
