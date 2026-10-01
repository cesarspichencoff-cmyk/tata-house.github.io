import type { DiaCardapio } from './tipos';

type DiaFixo = Omit<DiaCardapio, 'pessoas'>;

const BASE = 'Arroz e Feijão';

const dia = (principal: string, guarnicao: string, salada: string): DiaFixo => ({
  principal,
  guarnicaoFixa: BASE,
  guarnicao,
  salada,
  sobremesa: '',
});

const CICLO: DiaFixo[][] = [
  [
    dia('Cubos de frango no molho', 'Purê de batata', 'Alface / tomate'),
    dia('Acém ao molho de cebola', 'Abóbora refogada', 'Cenoura / Beterraba ralada'),
    dia('Bisteca Suína', 'Farofa de Cenoura', 'Repolho c/ alface'),
    dia('Strogonoff de frango', 'Batata palha', 'Alface / cenoura'),
    dia('Filé de peixe c/ crosta de ervas', 'Mandioca cozida', 'Mix de folhas c/ milho'),
    dia('Carne moída', 'Macarrão', 'Alface / tomate / Pepino'),
    dia('Coxa e sobrecoxa assada', 'Farofa simples', 'Repolho c/ manga'),
  ],
  [
    dia('Frango desfiado', 'Creme de milho', 'Alface e cebola roxa'),
    dia('Carne de panela c/ batatas', 'Abóbora refogada', 'Repolho roxo c/ alface'),
    dia('Lombo suíno', 'Purê de abóbora', 'Alface / tomate'),
    dia('Filé de frango à pizzaiolo', 'Macarrão', 'Cenoura e Batata cozida'),
    dia('Picadinho c/ legumes', 'Farofa simples', 'Mix de folhas'),
    dia('Linguiça acebolada', 'Mandioca cozida', 'Alface / tomate / Pepino'),
    dia('Strogonoff de Carne', 'Batata palha', 'Cenoura / Beterraba ralada'),
  ],
  [
    dia('Filé de coxa no molho de tomate', 'Purê de batata', 'Repolho c/ alface'),
    dia('Carne desfiada', 'Abóbora refogada', 'Mix de folhas c/ milho'),
    dia('Costelinha Suína', 'Farofa de banana', 'Alface / tomate'),
    dia('Filé de frango grelhado', 'Creme de milho', 'Alface / cenoura'),
    dia('Filé de peixe empanado', 'Mandioca cozida', 'Repolho c/ manga'),
    dia('Churrasco de panela', 'Farofa de Cenoura', 'Alface / tomate / Pepino'),
    dia('Filé de frango à parmegiana', 'Purê de batata', 'Mix de folhas'),
  ],
  [
    dia('Cubos de frango no molho', 'Purê de abóbora', 'Alface e cebola roxa'),
    dia('Carne assada na manteiga', 'Mandioca cozida', 'Repolho roxo c/ alface'),
    dia('Linguiça assada', 'Farofa simples', 'Cenoura / Beterraba ralada'),
    dia('Strogonoff de frango', 'Batata palha', 'Alface / tomate'),
    dia('Costela Bovina com mandioca', 'Farofa de Cenoura', 'Mix de folhas c/ milho'),
    dia('Filé de frango à milanesa', 'Creme de milho', 'Alface / tomate / Pepino'),
    dia('Carne de panela', 'Purê de abóbora', 'Repolho c/ manga'),
  ],
];

function numeroSemana(id: string): number | null {
  const m = /^2026-S(\d{2})$/.exec(id);
  if (!m) return null;
  return Number(m[1]);
}

export function cardapioFixoParaSemana(id: string): Array<DiaFixo | null> | null {
  const semana = numeroSemana(id);
  if (semana === null || semana < 41 || semana > 53) return null;
  const base = CICLO[(semana - 41) % CICLO.length].map((d) => ({ ...d }));
  if (semana === 53) return base.map((d, i) => (i <= 3 ? d : null));
  return base;
}
