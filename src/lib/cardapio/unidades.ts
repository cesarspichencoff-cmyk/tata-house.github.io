/* =====================================================================
   Conversão de unidade na cotação.

   O problema que isto resolve: quando o fornecedor cotava numa unidade
   diferente da unidade padrão do item, o app escrevia um alerta
   ("unidade X ≠ padrão Y — confirmar"), baixava a confiança… e aplicava
   o preço assim mesmo, como se estivesse na unidade certa. Se a cotação
   é por caixa e o padrão é quilo, o custo entra multiplicado pelo peso
   da caixa — e ninguém vê, porque o número simplesmente aparece.

   Regra nova, em três estados:
     • igual         → mesma unidade, aplica direto;
     • convertido    → dá para converter com exatidão (kg↔g, l↔ml);
     • incompativel  → caixa, pacote, fardo, saco, unidade… não dá para
                       converter sem saber o conteúdo da embalagem, então
                       NÃO se aplica preço nenhum. Fica bloqueado até
                       alguém informar quanto vem na embalagem.

   Preço com unidade duvidosa não deve entrar silenciosamente na conta.
   ===================================================================== */

export type StatusConversao = 'igual' | 'convertido' | 'incompativel';

export interface Conversao {
  valor: number;
  status: StatusConversao;
  /** Explicação curta para mostrar na tela quando não dá para converter. */
  motivo?: string;
}

/** Fator para 1 unidade base: kg e l valem 1; g e ml valem 1/1000. */
const FAMILIA: Record<string, { familia: 'massa' | 'volume'; porBase: number }> = {
  kg: { familia: 'massa', porBase: 1 },
  quilo: { familia: 'massa', porBase: 1 },
  quilograma: { familia: 'massa', porBase: 1 },
  g: { familia: 'massa', porBase: 0.001 },
  grama: { familia: 'massa', porBase: 0.001 },
  gramas: { familia: 'massa', porBase: 0.001 },
  l: { familia: 'volume', porBase: 1 },
  lt: { familia: 'volume', porBase: 1 },
  litro: { familia: 'volume', porBase: 1 },
  ml: { familia: 'volume', porBase: 0.001 },
};

/** Embalagens: só viram preço unitário se alguém disser o que vem dentro. */
const EMBALAGEM = new Set([
  'cx', 'caixa', 'pct', 'pacote', 'fd', 'fardo', 'sc', 'saco', 'bd', 'bdj',
  'bandeja', 'dz', 'duzia', 'un', 'und', 'unid', 'unidade', 'pc', 'peca', 'mc', 'mo',
]);

function limpar(u: string | null | undefined): string {
  return (u ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .trim();
}

/**
 * Converte um preço cotado em `unidCotada` para a `unidPadrao` do item.
 *
 * @param preco       valor cotado (por unidade cotada)
 * @param unidCotada  unidade que veio na cotação (pode faltar)
 * @param unidPadrao  unidade padrão do item no catálogo
 */
export function converterPreco(
  preco: number,
  unidCotada: string | null | undefined,
  unidPadrao: string | null | undefined,
): Conversao {
  const de = limpar(unidCotada);
  const para = limpar(unidPadrao);

  // Sem informação de unidade dos dois lados: nada a converter nem a acusar.
  if (!de || !para || de === para) return { valor: preco, status: 'igual' };

  const fDe = FAMILIA[de];
  const fPara = FAMILIA[para];

  if (fDe && fPara && fDe.familia === fPara.familia) {
    // Ex.: cotado por grama (R$0,032/g), padrão em kg → R$32,00/kg.
    return { valor: (preco / fDe.porBase) * fPara.porBase, status: 'convertido' };
  }

  if (EMBALAGEM.has(de) || EMBALAGEM.has(para)) {
    return {
      valor: preco,
      status: 'incompativel',
      motivo: `Cotado por ${de.toUpperCase()}, o item é medido em ${para.toUpperCase()}. Informe quanto vem na embalagem para calcular o preço por ${para.toUpperCase()}.`,
    };
  }

  return {
    valor: preco,
    status: 'incompativel',
    motivo: `Unidade "${de.toUpperCase()}" não converte para "${para.toUpperCase()}".`,
  };
}

/**
 * Preço por unidade padrão a partir de uma embalagem cujo conteúdo é
 * conhecido — ex.: caixa de 20 kg por R$ 240 → R$ 12,00/kg.
 */
export function precoPorEmbalagem(precoEmbalagem: number, conteudo: number): number | null {
  if (!(precoEmbalagem > 0) || !(conteudo > 0)) return null;
  return precoEmbalagem / conteudo;
}
