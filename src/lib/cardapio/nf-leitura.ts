'use client';

/* =====================================================================
   Leitura de nota fiscal por foto — IA multimodal via Edge Function segura.
   O navegador envia somente a imagem comprimida e nunca recebe segredo de
   Gemini/Groq/OpenAI/Anthropic.
   ===================================================================== */

import { chamarEdge, iaEdgeAtivo } from './ia-cliente';

export interface ItemNotaExtraido {
  produto: string;
  qtd: number;
  unid: string;
  precoUnit: number;
  precoTotal: number;
}

export interface ResultadoLeituraNF {
  fornecedor?: string;
  cnpj?: string;
  data?: string;
  itens: ItemNotaExtraido[];
  totalNF?: number;
  erro?: string;
}


const PROMPT_NF = `Você é um sistema OCR especializado em notas fiscais brasileiras (NF-e, Cupom Fiscal, NF de produtor rural).
Extraia os dados estruturados da imagem e retorne APENAS JSON neste formato:
{
  "fornecedor": "nome do fornecedor ou emitente",
  "cnpj": "XX.XXX.XXX/XXXX-XX ou CPF",
  "data": "yyyy-mm-dd",
  "totalNF": 0.00,
  "itens": [
    { "produto": "nome do produto conforme NF", "qtd": 0.0, "unid": "KG|UN|L|CX|PCT|SC|FD", "precoUnit": 0.00, "precoTotal": 0.00 }
  ]
}
Regras:
- Normalize unidades: quilograma → KG, unidade/peça → UN, litro → L, caixa → CX, pacote → PCT, saco → SC, fardo → FD.
- Se a unidade for g (gramas), converta para KG dividindo quantidade e preço unitário por 1000.
- Preserve o nome do produto exatamente como aparece na NF para rastreabilidade.
- Se não conseguir ler um campo, omita-o (não invente).
- Retorne apenas o JSON, sem explicações nem markdown.`;

export async function lerNotaFiscalViaIA(
  base64: string,
  mimeType: string,
): Promise<ResultadoLeituraNF> {
  if (!iaEdgeAtivo()) {
    return { itens: [], erro: 'IA segura do servidor não configurada.' };
  }
  if (!base64 || !/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
    return { itens: [], erro: 'Imagem inválida para leitura da nota fiscal.' };
  }

  try {
    const texto = await chamarEdge('gemini', '', PROMPT_NF, true, { base64, mimeType });
    let dados: ResultadoLeituraNF;
    try {
      dados = JSON.parse(texto) as ResultadoLeituraNF;
    } catch {
      const match = texto.match(/\{[\s\S]*\}/);
      dados = match ? (JSON.parse(match[0]) as ResultadoLeituraNF) : { itens: [] };
    }

    const itens = Array.isArray(dados.itens)
      ? dados.itens
          .filter((it) => !!it && typeof it.produto === 'string' && Number(it.qtd) >= 0 && Number(it.precoUnit) >= 0 && Number(it.precoTotal) >= 0)
          .map((it) => ({
            produto: it.produto.trim(),
            qtd: Number(it.qtd) || 0,
            unid: String(it.unid || 'UN').toUpperCase(),
            precoUnit: Number(it.precoUnit) || 0,
            precoTotal: Number(it.precoTotal) || 0,
          }))
      : [];

    return { ...dados, itens };
  } catch (e) {
    return { itens: [], erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Comprime uma imagem para base64 com limite de qualidade. */
export function comprimirImagem(
  file: File,
  maxWidth = 1600,
  quality = 0.82,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataURL = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataURL.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
