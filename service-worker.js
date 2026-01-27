/* service-worker.js */
const CACHE_VERSION = "v2.1"; // <-- aumente para v2, v3... quando atualizar
const CACHE_NAME = `geogame-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./locations.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Instala e guarda o essencial
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      await self.skipWaiting();
    })()
  );
});

// Ativa e limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Estratégia:
// - navegação (HTML): network-first (puxa novo, cai no cache se offline)
// - assets locais: cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só gerencia o que é do seu domínio (GitHub Pages)
  if (url.origin !== self.location.origin) return;

  // HTML: tenta rede primeiro
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("./index.html")) || (await cache.match("./"));
        }
      })()
    );
    return;
  }

  // Assets: cache first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      // cacheia arquivos locais “OK”
      if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});


