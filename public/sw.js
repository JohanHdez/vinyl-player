// Service worker de Vinyl Player: hace la app instalable (PWA) y la abre rápido.
//
// - Páginas: primero la red (así siempre llega la versión nueva y las vistas previas de
//   enlaces); sin conexión, la última copia guardada de la app.
// - Archivos propios (JS, CSS, íconos, fuentes): copia guardada al instante y se
//   actualiza por detrás. Los JS y CSS de Angular llevan hash en el nombre.
// - Nunca se guardan: la API (/api), las salas en tiempo real (/socket.io) ni nada de
//   YouTube: la música siempre viene en vivo.
//
// Al cambiar este archivo, sube VERSION para limpiar las copias viejas.

const VERSION = "v1";
const CACHE = `vinyl-${VERSION}`;
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("vinyl-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATIC = /\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|webmanifest)$/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Solo la página principal sin parámetros sirve de copia para abrir sin conexión.
          if (res.ok && url.pathname === "/" && !url.search) caches.open(CACHE).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
