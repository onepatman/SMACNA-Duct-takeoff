const CACHE_NAME = "smacna-takeoff-v2";
const PRECACHE_URLS = [
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./calc.js",
  "./app.js",
  "./export.js",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for everything: the core calculator (geometry/gauge/material math)
// needs zero network access once installed. The one exception is the SheetJS
// (xlsx) library loaded from cdnjs for the "Download Excel" button — that is
// cached opportunistically below on first successful fetch, so Excel export
// also works offline after the app has been opened online at least once.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => cached);
    })
  );
});
