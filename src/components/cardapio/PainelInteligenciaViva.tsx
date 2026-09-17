'use client';

import { Cartao, Pilula } from '@/components/ui';
import { formatarReais } from '@/lib/cardapio/motor';
import type { ClasseValor, InteligenciaViva, ValorComEvidencia } from '@/lib/cardapio/inteligencia-viva';

const ROTULO_CLASSE: Record<ClasseValor, string> = {
  comprovado: 'comprovado',
  registrado: 'registrado',
  estimado: 'estimado',
  simulacao: 'simulação',
  indisponivel: 'sem base',
};

function tomClasse(classe: ClasseValor): 'verde' | 'ouro' | 'neutro' | 'vermelho' {
  if (classe === 'comprovado') return 'verde';
  if (classe === 'registrado') return 'neutro';
  if (classe === 'estimado' || classe === 'simulacao') return 'ouro';
  return 'neutro';
}

function Dinheiro({ titulo, dado, destaque }: { titulo: string; dado: ValorComEvidencia; destaque?: boolean }) {
  return (
    <Cartao className={destaque ? 'ring-1 ring-brand-300/60 dark:ring-brand-700/60' : ''}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-texto-suave">{titulo}</p>
        <Pilula tom={tomClasse(dado.classe)}>{ROTULO_CLASSE[dado.classe]}</Pilula>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-carvao-900 dark:text-white">
        {dado.valor == null ? '—' : `${dado.classe === 'estimado' || dado.classe === 'simulacao' ? '≈ ' : ''}${formatarReais(dado.valor)}`}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-texto-suave">
        {dado.descricao}
        {dado.coberturaPct < 100 && dado.classe !== 'indisponivel' ? ` · cobertura ${dado.coberturaPct}%` : ''}
      </p>
    </Cartao>
  );
}

function valorDriver(v: number | null, unidade: 'R$' | '%' | 'refeicoes' | 'nota'): string {
  if (v == null) return '—';
  if (unidade === 'R$') return formatarReais(v);
  if (unidade === '%') return `${v.toFixed(0)}%`;
  if (unidade === 'nota') return `${v.toFixed(1)}/5`;
  return `${v > 0 ? '+' : ''}${Math.round(v)}`;
}

export function PainelInteligenciaViva({ inteligencia }: { inteligencia: InteligenciaViva }) {
  return (
    <section data-testid="inteligencia-viva" className="space-y-4">
      <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-white via-white to-brand-50/60 p-4 shadow-sm dark:border-brand-900 dark:from-carvao-900 dark:via-carvao-900 dark:to-brand-950/20 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">Inteligência gerencial viva</p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Compra, consumo, sobra e dinheiro na mesma leitura</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-texto-suave">
              Este painel recalcula com os dados operacionais que já entram no House. Valores comprovados, estimados e cenários ficam separados para não criar falsa precisão.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-carvao-50 px-3 py-2 text-right dark:bg-carvao-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-texto-suave">Demanda</p>
            <p className="text-sm font-extrabold tabular-nums">
              {inteligencia.refeicoesReais == null ? 'sem realizado' : `${inteligencia.refeicoesReais} / ${inteligencia.refeicoesPrevistas}`}
            </p>
            {inteligencia.erroDemandaPct != null && (
              <p className={`text-[11px] font-semibold ${Math.abs(inteligencia.erroDemandaPct) >= 10 ? 'text-ouro-700 dark:text-ouro-300' : 'text-texto-suave'}`}>
                {inteligencia.erroDemandaPct > 0 ? '+' : ''}{Math.round(inteligencia.erroDemandaPct)}% vs planejado
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Dinheiro titulo="Notas fiscais da semana" dado={inteligencia.notasFiscais} destaque />
          <Dinheiro titulo="Compras registradas" dado={inteligencia.comprasRegistradas} />
          <Dinheiro titulo="Custo planejado" dado={inteligencia.custoPlanejado} />
          <Dinheiro titulo="Consumo estimado" dado={inteligencia.consumoEstimado} />
          <Dinheiro titulo="Valor da sobra" dado={inteligencia.desperdicio} />
          <Dinheiro titulo="Capital em estoque" dado={inteligencia.estoqueValorizado} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Dinheiro titulo="Pressão de alta de preços" dado={inteligencia.pressaoPreco} />
          <Dinheiro titulo="Economia potencial nas ofertas" dado={inteligencia.economiaCotacao} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <Cartao className="space-y-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-texto-suave">O que está puxando o resultado</p>
            <p className="mt-1 text-sm font-bold">Sinais cruzados da semana</p>
          </div>
          <div className="divide-y divide-carvao-100 dark:divide-carvao-800">
            {inteligencia.drivers.map((driver) => (
              <div key={driver.id} className="grid grid-cols-[1fr_auto] gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{driver.titulo}</p>
                    <Pilula tom={tomClasse(driver.classe)}>{ROTULO_CLASSE[driver.classe]}</Pilula>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-texto-suave">{driver.explicacao}</p>
                </div>
                <p className="shrink-0 text-right text-sm font-extrabold tabular-nums">{valorDriver(driver.valor, driver.unidade)}</p>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao className="space-y-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-texto-suave">Leitura automática</p>
            <p className="mt-1 text-sm font-bold">O que merece atenção</p>
          </div>
          {inteligencia.alertas.length > 0 ? (
            <ul className="space-y-2 text-sm leading-5 text-carvao-700 dark:text-carvao-200">
              {inteligencia.alertas.map((a) => (
                <li key={a} className="rounded-xl bg-carvao-50 px-3 py-2 dark:bg-carvao-800">{a}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-950/20 dark:text-brand-200">
              Nenhum desvio material detectado com a evidência disponível desta semana.
            </p>
          )}
          <p className="text-[11px] leading-4 text-texto-suave">
            O painel não soma sinais que podem se sobrepor. Ex.: excesso de previsão e desperdício podem descrever partes do mesmo fenômeno; por isso aparecem separados.
          </p>
        </Cartao>
      </div>
    </section>
  );
}
