import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('coerência da experiência 10/10', () => {
  const page = readFileSync('src/app/page.tsx', 'utf8');
  const agora = readFileSync('src/components/cardapio/AbaAgora.tsx', 'utf8');

  it('mantém uma única camada principal de orientação no Início', () => {
    expect(page).toContain('<BriefingCard');
    expect(page).toContain('<AbaAgora');
    expect(page).not.toContain('<PainelDiretor');
    expect(page).not.toContain('<CopilotoSemana');
    expect(page).not.toContain('MiniEtapas');
  });

  it('expõe a inteligência viva como destino gerencial', () => {
    expect(page).toContain("rotulo: 'Inteligência viva'");
    expect(page).toContain('Atualiza com a operação');
    expect(agora).toContain("irPara('relatorios')");
    expect(agora).toContain('Inteligência da semana');
  });
});
