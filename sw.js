const CACHE_NAME = "bijihou2-shell-v35";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./cloud-sync.js",
  "./supabase/functions/_shared/study-snapshot.js",
  "./app.js",
  "./weakness.js",
  "./data/jp-field-map.js",
  "./materials.html",
  "./materials.js",
  "./vendor/pdfjs/pdf.mjs",
  "./vendor/pdfjs/pdf.worker.mjs",
  "./data/whr-2026-materials.json",
  "./admin.html",
  "./admin.css",
  "./admin.js",
  "./manifest.webmanifest",
  "./data/questions.csv",
  "./data/chapters.csv",
  "./data/ibt-cbt-2-questions.csv",
  "./data/ibt-cbt-2-chapters.csv",
  "./data/ibt-cbt-4-questions.csv",
  "./data/ibt-cbt-4-chapters.csv",
  "./data/whr-field-2026-questions.csv",
  "./data/whr-field-2026-chapters.csv",
  "./data/whr-qa-2026-questions.csv",
  "./data/whr-qa-2026-chapters.csv",
  "./data/taiwan-bar-questions.csv",
  "./data/taiwan-bar-chapters.csv",
  "./data/ai-mocks-2026.json",
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
        if (response.status === 200 && new URL(event.request.url).origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((response) => response ||
        (event.request.mode === "navigate" && !new URL(event.request.url).pathname.endsWith(".pdf")
          ? caches.match("./index.html") : Response.error())))
  );
});
