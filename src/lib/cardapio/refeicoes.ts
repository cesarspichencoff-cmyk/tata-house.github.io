'use client';

/**
 * Contador de refeições — histórico pré-carregado do WhatsApp (set/2023–jun/2026)
 * mais entradas novas registradas no app e salvas em localStorage.
 * Formato: date ISO -> [almoco, jantar, total]
 */

import HISTORICO from './historico-refeicoes.json';

type Raw = Record<string, [number, number, number]>;

const CHAVE = 'cardapio.v1.refeicoes';

function getLocal(): Raw {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}'); } catch { return {}; }
}

function getContagensOperacionais(): Raw {
  if (typeof window === 'undefined') return {};
  try {
    const lista = JSON.parse(localStorage.getItem('cardapio.v1.contagemRefeicoes') ?? '[]') as Array<{
      data?: string;
      almoco?: number;
      jantar?: number;
    }>;
    if (!Array.isArray(lista)) return {};
    const out: Raw = {};
    for (const r of lista) {
      if (!r?.data) continue;
      const almoco = Number(r.almoco ?? 0);
      const jantar = Number(r.jantar ?? 0);
      if (!Number.isFinite(almoco) || !Number.isFinite(jantar) || almoco + jantar <= 0) continue;
      out[r.data] = [almoco, jantar, almoco + jantar];
    }
    return out;
  } catch {
    return {};
  }
}

function getDados(): Raw {
  // Ordem de autoridade: seed histórico < legado local < operação atual.
  // Assim uma contagem registrada hoje no fluxo oficial substitui a fotografia antiga.
  return { ...(HISTORICO as unknown as Raw), ...getLocal(), ...getContagensOperacionais() };
}

export function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function registrarDia(data: string, almoco: number, jantar: number): void {
  const local = getLocal();
  local[data] = [almoco, jantar, almoco + jantar];
  try { localStorage.setItem(CHAVE, JSON.stringify(local)); } catch { /* ok */ }
}

export interface DiaRefeicoes {
  almoco: number;
  jantar: number;
  total: number;
}

export interface StatsRefeicoes {
  hoje: DiaRefeicoes | null;
  semana: number;         // segunda a hoje
  anoAtual: number;
  anoPassado: number;
  totalHistorico: number;
  diasRegistrados: number;
}

export interface MesTendencia {
  mes: string;   // "Jan", "Fev" …
  total: number;
}

export function calcularTendenciaMensal(): MesTendencia[] {
  const dados = getDados();
  const agora = new Date();
  const meses: MesTendencia[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const prefixo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    let total = 0;
    for (const [key, val] of Object.entries(dados as Raw)) {
      if (key.startsWith(prefixo)) total += val[2];
    }
    meses.push({ mes: NOMES[d.getMonth()], total });
  }

  return meses;
}

/* ── Linha do tempo da casa ──────────────────────────────────────────
   Conta a história real da operação: cada ano vira um capítulo com os
   números verdadeiros (refeições servidas, dias, ritmo) + o mês recorde.
   Sem inventar nada — só dá voz ao que o WhatsApp registrou. */

export interface CapituloCasa {
  ano: string;
  titulo: string;
  refeicoes: number;
  dias: number;
  mediaDia: number;
  destaque: string;
}

export interface ConquistaCasa {
  icone: string;
  titulo: string;
  valor: string;
}

export interface LinhaTempoCasa {
  capitulos: CapituloCasa[];
  totalRefeicoes: number;
  totalDias: number;
  inicio: string; // "set/2024"
  mesRecorde: { rotulo: string; total: number } | null;
  sparkline: number[]; // volume mensal normalizado, ordem cronológica
  conquistas: ConquistaCasa[];
}

const DIA_SEMANA_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function dataPorExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MES_NOME[m - 1]}/${String(y).slice(2)}`;
}

const MES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MES_NOME[Number(m) - 1]}/${y.slice(2)}`;
}

export function linhaDoTempoCasa(): LinhaTempoCasa | null {
  const dados = getDados() as Raw;
  const datas = Object.keys(dados).filter((k) => (dados[k]?.[2] ?? 0) > 0).sort();
  if (datas.length === 0) return null;

  // Agrega por ano e por mês
  const porAno = new Map<string, { ref: number; dias: number }>();
  const porMes = new Map<string, number>();
  let total = 0;

  for (const k of datas) {
    const t = dados[k][2];
    total += t;
    const ano = k.slice(0, 4);
    const ym = k.slice(0, 7);
    const a = porAno.get(ano) ?? { ref: 0, dias: 0 };
    porAno.set(ano, { ref: a.ref + t, dias: a.dias + 1 });
    porMes.set(ym, (porMes.get(ym) ?? 0) + t);
  }

  // Mês recorde
  let mesRecorde: { rotulo: string; total: number } | null = null;
  Array.from(porMes.entries()).forEach(([ym, v]) => {
    if (!mesRecorde || v > mesRecorde.total) mesRecorde = { rotulo: rotuloMes(ym), total: v };
  });

  // Capítulos por ano com narrativa derivada dos próprios números
  const anos = Array.from(porAno.keys()).sort();
  const capitulos: CapituloCasa[] = anos.map((ano, i) => {
    const { ref, dias } = porAno.get(ano)!;
    const mediaDia = Math.round(ref / dias);
    const anterior = i > 0 ? porAno.get(anos[i - 1]) : null;
    let titulo = 'Operação';
    let destaque = `${ref.toLocaleString('pt-BR')} refeições em ${dias} dias`;

    if (i === 0) {
      titulo = 'O começo';
      destaque = `As primeiras ${ref.toLocaleString('pt-BR')} refeições da casa`;
    } else if (i === anos.length - 1 && ano === String(new Date().getFullYear())) {
      titulo = 'O ano em curso';
      destaque = `${ref.toLocaleString('pt-BR')} refeições até agora, ${mediaDia}/dia`;
    } else {
      const cresc = anterior && anterior.dias > 0
        ? Math.round((mediaDia / Math.round(anterior.ref / anterior.dias) - 1) * 100)
        : 0;
      titulo = ref >= (anterior?.ref ?? 0) ? 'Consolidação' : 'Operação';
      destaque = cresc > 5
        ? `Ritmo ${cresc}% maior — ${mediaDia} refeições/dia`
        : `${ref.toLocaleString('pt-BR')} refeições, ${mediaDia}/dia constante`;
    }

    return { ano, titulo, refeicoes: ref, dias, mediaDia, destaque };
  });

  // Sparkline mensal normalizado
  const mesesOrd = Array.from(porMes.keys()).sort();
  const max = Math.max(...mesesOrd.map((m) => porMes.get(m)!), 1);
  const sparkline = mesesOrd.map((m) => Math.round((porMes.get(m)! / max) * 100));

  // ── Conquistas da casa — marcos reais, extraídos das contagens ──
  const conquistas: ConquistaCasa[] = [];

  // Dia mais movimentado de toda a operação
  let diaRecorde: { data: string; total: number } | null = null;
  for (const k of datas) {
    const t = dados[k][2];
    if (!diaRecorde || t > diaRecorde.total) diaRecorde = { data: k, total: t };
  }

  // Marco de volume total (milhar redondo já alcançado)
  const marco = Math.floor(total / 1000) * 1000;
  if (marco >= 1000) {
    conquistas.push({ icone: '🍽️', titulo: 'Refeições servidas', valor: `+${marco.toLocaleString('pt-BR')}` });
  }
  if (mesRecorde) {
    const mr = mesRecorde as { rotulo: string; total: number };
    conquistas.push({ icone: '🏆', titulo: 'Mês recorde', valor: `${mr.rotulo} · ${mr.total.toLocaleString('pt-BR')}` });
  }
  if (diaRecorde) {
    const dow = new Date(diaRecorde.data + 'T12:00:00').getDay();
    conquistas.push({ icone: '🔥', titulo: 'Dia mais movimentado', valor: `${diaRecorde.total} refeições · ${DIA_SEMANA_NOME[dow]}, ${dataPorExtenso(diaRecorde.data)}` });
  }
  conquistas.push({ icone: '📅', titulo: 'Operação registrada', valor: `${datas.length} dias` });

  return {
    capitulos,
    totalRefeicoes: total,
    totalDias: datas.length,
    inicio: rotuloMes(datas[0].slice(0, 7)),
    mesRecorde,
    sparkline,
    conquistas,
  };
}

export function calcularStats(): StatsRefeicoes {
  const dados = getDados();
  const hoje = hojeISO();
  const anoAtual = hoje.slice(0, 4);
  const anoPassado = String(Number(anoAtual) - 1);

  // Início da semana (segunda-feira)
  const now = new Date();
  const dow = now.getDay(); // 0=Dom
  const diff = dow === 0 ? 6 : dow - 1;
  const seg = new Date(now);
  seg.setDate(now.getDate() - diff);
  const inicioSemana = seg.toISOString().split('T')[0];

  let semana = 0, anoA = 0, anoP = 0, total = 0, dias = 0;

  for (const [key, val] of Object.entries(dados as Raw)) {
    const t = val[2];
    if (t <= 0) continue;
    dias++;
    total += t;
    if (key.startsWith(anoAtual)) anoA += t;
    if (key.startsWith(anoPassado)) anoP += t;
    if (key >= inicioSemana && key <= hoje) semana += t;
  }

  const h = (dados as Raw)[hoje];
  return {
    hoje: h ? { almoco: h[0], jantar: h[1], total: h[2] } : null,
    semana,
    anoAtual: anoA,
    anoPassado: anoP,
    totalHistorico: total,
    diasRegistrados: dias,
  };
}
