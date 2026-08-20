/* =====================================================================
   Service worker gerado no build (não é mais um arquivo estático em
   public/). O nome do cache carrega a versão do build — cada deploy vira
   um cache novo, e o `activate` do próprio worker apaga o anterior.

   Por que isso importa: antes, o nome do cache era fixo ('tata-house-v1')
   pra sempre. Um deploy novo não invalidava nada automaticamente — só um
   "limpar dados do site" manual resolvia um aparelho que ficasse preso
   num estado antigo. Isso não é aceitável para a equipe (baixa
   familiaridade com celular, não dá pra pedir "limpa o cache" toda
   semana). Agora a limpeza é automática, a cada deploy, sem ação humana.
   ===================================================================== */

export const dynamic = 'force-static';

const VERSAO_BUILD = process.env.GITHUB_SHA ?? String(Date.now());

function gerarServiceWorker(versao: string): string {
  return `/* Gerado no build — versão ${versao}. Não editar direto; edite src/app/sw.js/route.ts */

const CACHE = 'tata-house-${versao}';
const ESSENCIAIS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
    return;
  }

  e.respondWith(
    caches.match(request).then(
      (cacheado) =>
        cacheado ||
        fetch(request)
          .then((resp) => {
            if (resp && resp.status === 200 && resp.type === 'basic') {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(request, copia)).catch(() => {});
            }
            return resp;
          })
          .catch(() => cacheado),
    ),
  );
});
`;
}

export function GET() {
  return new Response(gerarServiceWorker(VERSAO_BUILD), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
