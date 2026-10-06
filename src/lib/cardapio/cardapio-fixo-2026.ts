import type { DiaCardapio } from './tipos';

type DiaFixo = Omit<DiaCardapio, 'pessoas'>;

const BASE = 'Arroz e Feijão';

const normalizarLocal = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function sobremesaSemFrutaAutomatica(sobremesa: string): string {
  return sobremesa.replace(/\s*\+\s*fruta\s*$/i, '').trim();
}

const dia = (
  principal: string,
  guarnicao: string,
  salada: string,
  sobremesa: string,
): DiaFixo => ({
  principal,
  guarnicaoFixa: BASE,
  guarnicao,
  salada,
  sobremesa,
});

const CICLO: DiaFixo[][] = [
  [
    dia('Carne de panela com batatas', 'Abóbora refogada', 'Alface e tomate', 'Arroz-doce'),
    dia('Lombo suíno', 'Mandioca cozida', 'Alface, tomate e pepino', 'Fruta'),
    dia('Filé de frango à pizzaiolo', 'Creme de milho', 'Beterraba cozida', 'Mousse de maracujá'),
    dia('Acém ao molho de cebola', 'Abóbora refogada', 'Repolho com alface', 'Gelatina cremosa'),
    dia('Cubos de frango no molho', 'Purê de abóbora', 'Cenoura e beterraba ralada', 'Fruta'),
    dia('Filé de peixe com crosta de ervas', 'Purê de batata', 'Mix de folhas', 'Fruta'),
    dia('Bisteca suína', 'Farofa de cenoura', 'Repolho com manga', 'Cocada cremosa'),
  ],
  [
    dia('Filé de coxa no molho de tomate', 'Mandioca cozida', 'Repolho com alface', 'Fruta'),
    dia('Carne moída', 'Purê de abóbora', 'Cenoura e beterraba ralada', 'Pudim de baunilha'),
    dia('Linguiça assada', 'Purê de abóbora', 'Repolho com manga', 'Salada de frutas'),
    dia('Feijoada com costelinha', 'Farofa de cenoura', 'Alface e tomate', 'Fruta'),
    dia('Filé de frango grelhado', 'Batata frita', 'Mix de folhas com milho', 'Fruta'),
    dia('Strogonoff de carne', 'Batata palha', 'Alface e tomate', 'Gelatina colorida'),
    dia('Frango desfiado', 'Creme de milho', 'Alface e cenoura', 'Curau'),
  ],
  [
    dia('Filé de peixe empanado', 'Purê de abóbora', 'Alface, tomate e pepino', 'Fruta'),
    dia('Coxa e sobrecoxa assada', 'Farofa simples', 'Cenoura e beterraba ralada', 'Arroz-doce'),
    dia('Picadinho com legumes', 'Purê de batata', 'Alface e cebola roxa', 'Gelatina cremosa'),
    dia('Strogonoff de frango', 'Batata palha', 'Mix de folhas', 'Mousse de morango'),
    dia('Churrasco de panela', 'Farofa de cenoura', 'Alface e tomate', 'Salada de frutas'),
    dia('Lombo suíno', 'Farofa de banana', 'Repolho com alface', 'Fruta'),
    dia('Feijoada com costelinha', 'Farofa simples', 'Cenoura e beterraba ralada', 'Cocada cremosa'),
  ],
  [
    dia('Acém ao molho de tomate', 'Mandioca cozida', 'Cenoura e beterraba ralada', 'Fruta'),
    dia('Filé de frango à parmegiana', 'Purê de abóbora', 'Alface e tomate', 'Fruta'),
    dia('Lombo suíno', 'Farofa de banana', 'Repolho com manga', 'Pudim de leite'),
    dia('Cubos de frango no molho', 'Purê de abóbora', 'Repolho com alface', 'Gelatina colorida'),
    dia('Bisteca suína', 'Creme de milho', 'Alface, tomate e pepino', 'Fruta'),
    dia('Tiras de frango com bacon', 'Abóbora refogada', 'Mix de folhas', 'Salada de frutas'),
    dia('Carne desfiada', 'Mandioca cozida', 'Alface, tomate e pepino', 'Pudim de baunilha'),
  ],
];

const FINAL_2026: DiaFixo[] = [
  { ...CICLO[0][0], sobremesa: 'Fruta' },
  { ...CICLO[0][1], sobremesa: 'Fruta' },
  { ...CICLO[0][2], sobremesa: 'Pudim de baunilha' },
  { ...CICLO[0][3], sobremesa: 'Gelatina colorida' },
];

const LC_LITROS_POR_PESSOA: Record<string, number> = {
  'arroz-doce': 0.0138,
  'mousse de maracuja': 0.02,
  'gelatina cremosa': 0.0123,
  'cocada cremosa': 0.022,
  'mousse de morango': 0.0215,
};

export function litrosLeiteCondensadoPorPessoa(sobremesa: string): number {
  const base = normalizarLocal(sobremesa).split(/\s*\+\s*/)[0];
  return LC_LITROS_POR_PESSOA[base] ?? 0;
}

function numeroSemana(id: string): number | null {
  const m = /^2026-S(\d{2})$/.exec(id);
  if (!m) return null;
  return Number(m[1]);
}

/** Semana de outubro usada como modelo de quantidade para as semanas
 *  completas de nov/dez que repetem exatamente o mesmo ciclo. */
export function semanaModeloOutubroPara(id: string): string | null {
  const semana = numeroSemana(id);
  if (semana === null || semana < 45 || semana > 52) return null;
  const fonte = 41 + ((semana - 41) % 4);
  return `2026-S${String(fonte).padStart(2, '0')}`;
}

export function semanaUsaBagLeiteCondensado(id: string): boolean {
  const semana = numeroSemana(id);
  if (semana === null || semana < 41 || semana > 52) return false;
  const posicao = (semana - 41) % 4;
  return posicao === 0 || posicao === 2;
}

export function cardapioFixoParaSemana(id: string): Array<DiaFixo | null> | null {
  const semana = numeroSemana(id);
  if (semana === null || semana < 41 || semana > 53) return null;
  if (semana === 53) {
    return Array.from({ length: 7 }, (_, i) =>
      i < FINAL_2026.length ? { ...FINAL_2026[i] } : null,
    );
  }
  return CICLO[(semana - 41) % CICLO.length].map((d) => ({ ...d }));
}
