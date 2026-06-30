const CACHE_NAME = "projeto-escola-v4";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/offline.html",
  "/simbolo.webp",
  "/logo-horizontal.png",
  "/logo-horizontal-dark.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(async () => (await caches.match("/offline.html")) || new Response("Sem conexão.", { status: 503 }))
    );
    return;
  }

  const cacheableStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    ["image", "font", "style", "script", "manifest"].includes(request.destination);

  if (!cacheableStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
