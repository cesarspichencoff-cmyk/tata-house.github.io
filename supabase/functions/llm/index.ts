/* =====================================================================
   Edge Function "llm" — proxy seguro para os provedores de IA.

   Por que existe: o app é estático (GitHub Pages), então qualquer chave
   embutida no client (NEXT_PUBLIC_*) fica VISÍVEL no navegador. Esta função
   roda no servidor (Supabase/Deno) e guarda a chave como SECRET, fora do
   bundle. O client chama aqui com a anon key (que é pública por design) e
   nunca vê a chave do provedor.

   Deploy:
     supabase functions deploy llm --no-verify-jwt
     supabase secrets set GEMINI_API_KEY=AIza...   # e/ou GROQ_API_KEY=...
   Depois, no build do site: NEXT_PUBLIC_IA_EDGE=1 e REMOVA as chaves
   NEXT_PUBLIC_GEMINI_API_KEY / NEXT_PUBLIC_GROQ_KEY do GitHub.
   ===================================================================== */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

interface Corpo {
  provider?: 'gemini' | 'groq';
  system?: string;
  prompt?: string;
  json?: boolean;
  image?: { base64?: string; mimeType?: string };
}

// @ts-expect-error — Deno é o runtime da Edge Function (não tipado neste repo)
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  const { provider = 'gemini', system, prompt, json: comoJson, image } = corpo;
  if (!prompt) return json({ error: 'prompt ausente' }, 400);
  if (image) {
    if (provider !== 'gemini') return json({ error: 'imagem suportada apenas pelo provider multimodal aprovado' }, 400);
    if (!image.base64 || !image.mimeType) return json({ error: 'imagem incompleta' }, 400);
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(image.mimeType)) return json({ error: 'tipo de imagem não suportado' }, 415);
    if (image.base64.length > 8_000_000) return json({ error: 'imagem excede o limite seguro' }, 413);
  }

  // @ts-expect-error — Deno.env só existe no runtime da função
  const env = (n: string): string | undefined => Deno.env.get(n);

  try {
    if (provider === 'groq') {
      const key = env('GROQ_API_KEY');
      if (!key) return json({ error: 'GROQ_API_KEY não configurada no servidor' }, 500);
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          ...(comoJson ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message ?? `HTTP ${r.status}` }, r.status);
      return json({ text: d?.choices?.[0]?.message?.content ?? '' });
    }

    // gemini (padrão)
    const key = env('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY não configurada no servidor' }, 500);
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ parts: [...(image ? [{ inlineData: { mimeType: image.mimeType!, data: image.base64! } }] : []), { text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 800,
            ...(comoJson ? { responseMimeType: 'application/json' } : {}),
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    const d = await r.json();
    if (!r.ok) return json({ error: `Gemini ${r.status}` }, r.status);
    return json({ text: d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '' });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
