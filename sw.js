/* JAY STEEL Logistics service worker: app shell cached for offline; data is network-first. */
const CACHE = "jsl-v28"; /* v28 Nov 7: Products tab (products.js + products.css, encrypted data/products.enc.json) */ /* v27: Max fee no longer opens the Filters panel */ /* v26 Nov 6: Find markets merges data/opportunities_vetted.json (daily auto-vetted events), Max fee + Sort row, Verified/score chips */ /* v25 Nov 6: Map route planner + GA campuses on the map */ /* v24 Nov 6: showInToPay flag (Eagle Landing back on To pay) */ /* v23 Nov 6: statewide FL + Georgia campus vendor days + GA guide in Find markets */ /* v22 Nov 6: pull-to-refresh + auto-refresh (foreground / every 4 min), To pay = confirmed + unpaid only */ /* v21 Nov 6: one clean menu map, no repeated sections/links */ /* v19 Nov 6: date-only deadlines no longer clear a day early */ /* v14 Nov 6 2026: Steel redesign + Map + HQ tab, checklist removed */ /* v11 Oct 25 2026: web build standard pass */ /* v8 Oct 22 2026: Market Day redesign */
const SHELL = ["./", "index.html", "styles.css?v=23", "app.js?v=26", "manifest.json", "data/events.json",
  "assets/js-icon.webp", "assets/js-icon.png", "assets/icon-192.png", "assets/fonts/montserrat.woff2", "assets/geo.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.indexOf("/pp/") !== -1) return;   /* pages: product page previews (video range requests) go straight to the network */
  const isData = url.pathname.endsWith(".json") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isData) {
    // network first, fall back to cache (so edits show up right away, offline still works)
    // data/*.json is stored under its plain URL (no ?t=…), so refreshes don't pile up copies in the cache
    const key = url.pathname.endsWith(".json") ? url.origin + url.pathname : e.request;
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
  }
});
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
