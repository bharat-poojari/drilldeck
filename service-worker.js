const SHELL_CACHE = "drilldeck-shell-v1";
const RUNTIME_CACHE = "drilldeck-runtime-v1";
const APP_SHELL = [
  "/",
  "/site.webmanifest",
  "/assets/drilldeck-mark.svg",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/css/style.css",
  "/css/exam.css",
  "/css/result.css",
  "/css/performance-insights.css",
  "/css/daily-challenge.css",
  "/css/revision.css",
  "/css/dashboard.css",
  "/css/theme.css",
  "/data/datasets.json",
  "/js/app.js",
  "/js/active-exam-store.js",
  "/js/community.js",
  "/js/daily-challenge.js",
  "/js/exam.js",
  "/js/explanation.js",
  "/js/performance-insights.js",
  "/js/practice.js",
  "/js/questions.js",
  "/js/results-store.js",
  "/js/results.js",
  "/js/revision.js",
  "/js/route-utils.js",
  "/js/scoring.js",
  "/js/timer.js",
  "/js/topic-selector.js"
];
const MAX_RUNTIME_ENTRIES = 80;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("drilldeck-") && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheResponse(request, response) {
  if (!response.ok || response.type === "opaque") return;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES))
    .map(key => cache.delete(key)));
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        event.waitUntil(cacheResponse(request, response.clone()).catch(error =>
          console.error("Could not store an offline copy of", request.url, error)
        ));
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const appShell = await caches.match("/");
        if (appShell) return appShell;
      }
      throw error;
    }
  })());
});
