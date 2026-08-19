import { describe, it, expect } from 'vitest';
import { mesclarSemana } from './merge-semana';
import type { EstadoSemana } from './tipos';

function semana(parcial: Partial<EstadoSemana> = {}): EstadoSemana {
  return {
    versao: 1,
    orcamento: null,
    etapa: 'rascunho',
    historico: [],
    ajustes: {},
    manuais: {},
    status: {},
    obsCozinha: '',
    dias: Array.from({ length: 7 }, () => ({
      pessoas: 60,
      principal: '',
      guarnicaoFixa: 'Arroz e Feijão',
      guarnicao: '',
      salada: '',
      sobremesa: '',
    })),
    ...parcial,
  };
}

/** Clona e aplica uma mutação — simula uma edição a partir de um snapshot. */
function editar(b: EstadoSemana, fn: (e: EstadoSemana) => void): EstadoSemana {
  const c = JSON.parse(JSON.stringify(b)) as EstadoSemana;
  fn(c);
  return c;
}

describe('mesclarSemana — merge 3-vias', () => {
  it('cross-role: compras marca recebido e cozinha troca prato — ambos sobrevivem', () => {
    const base = semana();
    const local = editar(base, (e) => { e.status[2] = { arroz: { recebidoOk: true } }; }); // compras
    const remote = editar(base, (e) => { e.dias[2].principal = 'Feijoada'; }); // cozinha

    const m = mesclarSemana(base, local, remote);
    expect(m.status[2].arroz.recebidoOk).toBe(true); // mudança do compras preservada
    expect(m.dias[2].principal).toBe('Feijoada'); // mudança da cozinha preservada
  });

  it('só o local mudou um campo (remote == base) → mantém o local', () => {
    const base = semana();
    const local = editar(base, (e) => { e.dias[0].principal = 'Strogonoff'; });
    const remote = editar(base, () => {});
    const m = mesclarSemana(base, local, remote);
    expect(m.dias[0].principal).toBe('Strogonoff');
  });

  it('só o remote mudou um campo (local == base) → aplica o remote', () => {
    const base = semana();
    const local = editar(base, () => {});
    const remote = editar(base, (e) => { e.dias[0].principal = 'Lasanha'; });
    const m = mesclarSemana(base, local, remote);
    expect(m.dias[0].principal).toBe('Lasanha');
  });

  it('conflito real no mesmo campo → vence o remote (last-write-wins)', () => {
    const base = semana();
    const local = editar(base, (e) => { e.dias[0].principal = 'Frango'; });
    const remote = editar(base, (e) => { e.dias[0].principal = 'Peixe'; });
    const m = mesclarSemana(base, local, remote);
    expect(m.dias[0].principal).toBe('Peixe');
  });

  it('adições em chaves distintas de status no mesmo dia → união', () => {
    const base = semana();
    const local = editar(base, (e) => { e.status[1] = { arroz: { compradoEm: '2026-06-01' } }; });
    const remote = editar(base, (e) => { e.status[1] = { feijao: { compradoEm: '2026-06-02' } }; });
    const m = mesclarSemana(base, local, remote);
    expect(m.status[1].arroz.compradoEm).toBe('2026-06-01');
    expect(m.status[1].feijao.compradoEm).toBe('2026-06-02');
  });

  it('remoção é honrada quando o outro lado não tocou na chave', () => {
    const base = semana({ status: { 0: { arroz: { recebidoOk: true } } } });
    const local = editar(base, (e) => { delete e.status[0].arroz; }); // removeu
    const remote = editar(base, () => {}); // não tocou
    const m = mesclarSemana(base, local, remote);
    expect(m.status[0]?.arroz).toBeUndefined();
  });

  it('histórico de etapas é unido e deduplicado', () => {
    const reg = (etapa: EstadoSemana['etapa'], em: string) => ({ etapa, em, papel: 'gestor' as const });
    const base = semana({ historico: [reg('rascunho', '2026-06-01T10:00:00Z')] });
    const local = editar(base, (e) => { e.historico.push(reg('cozinha', '2026-06-02T10:00:00Z')); });
    const remote = editar(base, (e) => { e.historico.push(reg('compras', '2026-06-03T10:00:00Z')); });
    const m = mesclarSemana(base, local, remote);
    expect(m.historico).toHaveLength(3);
    expect(m.historico.map((h) => h.etapa)).toEqual(['rascunho', 'cozinha', 'compras']);
  });

  it('é convergente: re-mesclar o resultado com o remote não muda nada', () => {
    const base = semana();
    const local = editar(base, (e) => { e.dias[2].principal = 'Feijoada'; e.status[2] = { arroz: { recebidoOk: true } }; });
    const remote = editar(base, (e) => { e.dias[4].principal = 'Moqueca'; });
    const m1 = mesclarSemana(base, local, remote);
    // outro aparelho recebe m1 como remote, tendo remote como base e local
    const m2 = mesclarSemana(remote, remote, m1);
    expect(m2.dias[2].principal).toBe('Feijoada');
    expect(m2.dias[4].principal).toBe('Moqueca');
    expect(m2.status[2].arroz.recebidoOk).toBe(true);
  });

  it('sem base: união preserva edições em dias diferentes (best-effort)', () => {
    const local = semana({ status: { 0: { arroz: { recebidoOk: true } } } });
    const remote = semana({ status: { 1: { feijao: { recebidoOk: true } } } });
    const m = mesclarSemana(null, local, remote);
    expect(m.status[0].arroz.recebidoOk).toBe(true);
    expect(m.status[1].feijao.recebidoOk).toBe(true);
  });

  it('sem base: conflito no mesmo campo mantém o LOCAL, não apaga a edição recém-feita', () => {
    // Ex.: aparelho novo (ou dados locais limpos) edita a semana antes de ter
    // uma base gravada; a nuvem já tem outro valor (antigo/de outro aparelho)
    // para o mesmo campo. Sem base não dá pra saber quem é mais recente — o
    // que acabou de ser digitado neste aparelho não pode sumir silenciosamente.
    const local = semana();
    local.dias[0].principal = 'Frango à parmegiana';
    const remote = semana();
    remote.dias[0].principal = 'Peixe assado';
    const m = mesclarSemana(null, local, remote);
    expect(m.dias[0].principal).toBe('Frango à parmegiana');
  });
});
