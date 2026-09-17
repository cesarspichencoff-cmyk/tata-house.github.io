/* =====================================================================
   IA do TATÁ House — cliente seguro.

   Regra: o navegador nunca recebe chave de Gemini/Groq/OpenAI/Anthropic.
   Toda chamada passa pela Edge Function `llm`, que guarda os secrets no
   servidor. Se o proxy não estiver configurado ou falhar, o produto cai para
   as regras locais e deixa isso explícito em vez de expor credenciais.
   ===================================================================== */

import type { DossieIA } from './dossie';

export type ModoIA = 'briefing' | 'decisao' | 'alerta' | 'pergunta';

export interface RespostaIA {
  texto: string;
  itens?: string[];
  offline?: boolean;
}

export interface ImagemIAEdge {
  base64: string;
  mimeType: string;
}

const SYSTEM = `Você é o assistente operacional do Tatá House, um restaurante corporativo brasileiro.
Você recebe um dossiê com dados reais pré-calculados pelo sistema (custos, estoque, aceitação, etc.).

REGRAS ABSOLUTAS:
1. Nunca invente números. Use APENAS os valores do dossiê fornecido.
2. Responda em português brasileiro, de forma direta e prática.
3. Limite sua resposta a no máximo 4 frases ou 5 itens de lista — seja conciso.
4. Quando houver dados insuficientes, diga claramente que faltam dados.
5. Foque em ações concretas que o gestor pode tomar hoje.

Formato de resposta: JSON com { "texto": "...", "itens": ["...", "..."] }
O campo "itens" é opcional — use só quando listar claramente melhora a leitura.`;

function promptParaModo(modo: ModoIA, tarefa: string, dossie: DossieIA): string {
  const dados = JSON.stringify(dossie, null, 2);
  switch (modo) {
    case 'briefing':
      return `Gere um briefing matinal do restaurante para hoje. Destaque o mais urgente em no máximo 3 pontos.\nDOSSIÊ: ${dados}`;
    case 'decisao':
      return `O gestor precisa de uma recomendação. Situação: "${tarefa}"\nAnalise o dossiê e dê UMA recomendação clara com o impacto esperado.\nDOSSIÊ: ${dados}`;
    case 'alerta':
      return `Analise os alertas do dossiê e classifique: qual é o mais urgente e por quê?\nDOSSIÊ: ${dados}`;
    case 'pergunta':
    default:
      return `Pergunta do gestor: "${tarefa}"\nResponda usando SOMENTE os dados do dossiê. Se a pergunta não puder ser respondida com os dados disponíveis, diga que faltam dados.\nDOSSIÊ: ${dados}`;
  }
}

const SYSTEM_RESTRICOES = `Analise esta conversa e extraia restrições alimentares de funcionários.
Retorne SOMENTE JSON (array, mesmo que vazio):
[{ "nome": "Nome", "setor": "setor ou null", "turno": "almoco|jantar|ambos",
   "restricoes": [{ "tipo": "alergia|preferencia|religioso", "alimento": "alimento", "obs": "obs ou null" }] }]
Tipos: alergia=médica/intolerância, preferencia=pessoal/não gosta, religioso=halal/kosher/crença.
Turno padrão: "almoco". Retorne [] se nada encontrado. Não invente.`;

/** URL da função `llm` quando ativada (NEXT_PUBLIC_IA_EDGE=1 + Supabase). */
function urlEdgeLLM(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ativo = process.env.NEXT_PUBLIC_IA_EDGE;
  if (!url || !ativo || ativo === '0') return null;
  return `${url.replace(/\/$/, '')}/functions/v1/llm`;
}

export function iaEdgeAtivo(): boolean {
  return urlEdgeLLM() !== null;
}

/** Chama a Edge Function. A anon/publishable key do Supabase é pública por design. */
export async function chamarEdge(
  provider: 'gemini' | 'groq',
  system: string,
  prompt: string,
  comoJson: boolean,
  imagem?: ImagemIAEdge,
): Promise<string> {
  const fnUrl = urlEdgeLLM();
  if (!fnUrl) throw new Error('IA segura não configurada');
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!anon) throw new Error('Chave pública do Supabase ausente');
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
    body: JSON.stringify({ provider, system, prompt, json: comoJson, ...(imagem ? { image: imagem } : {}) }),
  });
  if (!res.ok) throw new Error(`edge ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.text as string) ?? '';
}

/** Extrai o primeiro objeto JSON de um texto (LLMs às vezes envolvem em prosa). */
function extrairJson(texto: string): RespostaIA {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return { texto };
  try {
    return JSON.parse(match[0]) as RespostaIA;
  } catch {
    return { texto };
  }
}

export async function extrairRestricoesDaConversa(
  texto: string,
): Promise<{ nome: string; setor: string | null; turno: string; restricoes: { tipo: string; alimento: string; obs: string | null }[] }[]> {
  if (!iaEdgeAtivo()) return [];
  try {
    const txt = await chamarEdge('gemini', SYSTEM_RESTRICOES, texto, true);
    const data = JSON.parse(txt || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function chamarIACliente(
  tarefa: string,
  dossie: DossieIA,
  modo: ModoIA = 'pergunta',
): Promise<RespostaIA> {
  if (!iaEdgeAtivo()) return { offline: true, texto: '' };
  const prompt = promptParaModo(modo, tarefa, dossie);
  try {
    return extrairJson(await chamarEdge('gemini', SYSTEM, prompt, true));
  } catch {
    return { offline: true, texto: '' };
  }
}
