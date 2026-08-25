const CACHE_NAME = "bijihou2-shell-v16";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./cloud-sync.js",
  "./app.js",
  "./admin.html",
  "./admin.css",
  "./admin.js",
  "./manifest.webmanifest",
  "./data/questions.csv",
  "./data/chapters.csv",
  "https://cdn.jsdelivr.net/npm/papaparse@5.5.3/papaparse.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((response) => response || caches.match("./index.html")))
  );
});
