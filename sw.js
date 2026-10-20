/* JAY STEEL Logistics service worker: app shell cached for offline; data is network-first. */
const CACHE = "jsl-v5"; /* v5 Oct 20 2026: "Apply via Tab" buttons (WhatsApp hand-off to Tab) */
const SHELL = ["./", "index.html", "styles.css?v=5", "app.js?v=5", "manifest.json", "data/events.json",
  "assets/js-icon.webp", "assets/js-icon.png", "assets/icon-192.png", "assets/fonts/montserrat.woff2", "assets/fonts/cormorant.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isData = url.pathname.endsWith(".json") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isData) {
    // network first, fall back to cache (so edits show up right away, offline still works)
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
  }
});
