const CACHE_NAME = "yoin-ai-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/yoin-ai-icon.png",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API・外部リクエストはキャッシュしない
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  // ナビゲーション（ページ遷移）はネットワーク優先、失敗時にキャッシュ
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/")
      )
    );
    return;
  }

  // 静的アセットはキャッシュ優先
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request)
    )
  );
});
