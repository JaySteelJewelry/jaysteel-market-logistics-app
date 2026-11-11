/* JAY STEEL Logistics service worker: app shell cached for offline; data is network-first. */
const CACHE = "jsl-v36"; /* v32 Nov 9: navigationPreload + external image cache (Products/Research photos offline) */ /* v31 Nov 9: sources panel last-good fallback */ /* v30 Nov 9: Products tab mobile-first + photo on every item row */ /* v29 Nov 9: Find markets Florida-only, sources fixed, footer shows scan date */ /* v28 Nov 7: Products tab (products.js + products.css, encrypted data/products.enc.json) */ /* v27: Max fee no longer opens the Filters panel */ /* v26 Nov 6: Find markets merges data/opportunities_vetted.json (daily auto-vetted events), Max fee + Sort row, Verified/score chips */ /* v25 Nov 6: Map route planner + GA campuses on the map */ /* v24 Nov 6: showInToPay flag (Eagle Landing back on To pay) */ /* v23 Nov 6: statewide FL + Georgia campus vendor days + GA guide in Find markets */ /* v22 Nov 6: pull-to-refresh + auto-refresh (foreground / every 4 min), To pay = confirmed + unpaid only */ /* v21 Nov 6: one clean menu map, no repeated sections/links */ /* v19 Nov 6: date-only deadlines no longer clear a day early */ /* v14 Nov 6 2026: Steel redesign + Map + HQ tab, checklist removed */ /* v11 Oct 25 2026: web build standard pass */ /* v8 Oct 22 2026: Market Day redesign */
const IMG_CACHE = "jsl-img-v1"; /* external supplier photos, size-capped (see fetch handler) */
const SHELL = ["./", "index.html", "styles.css?v=28", "app.js?v=33", "manifest.json", "data/events.json",
  "assets/js-icon.webp", "assets/js-icon.png", "assets/icon-192.png", "assets/fonts/montserrat.woff2", "assets/geo.json"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
    /* speed up navigations where the browser supports it; ignored everywhere else */
    self.registration.navigationPreload && self.registration.navigationPreload.enable().catch(() => {}),
  ]));
});

/* the same rules as before, as a function so the preload path can fall back to it:
   data (json/js/css/html) is network-first; everything else is cache-first with a runtime fill. */
async function answer(req) {
  const url = new URL(req.url);
  const key = url.pathname.endsWith(".json") ? url.origin + url.pathname : req;
  const isData = url.pathname.endsWith(".json") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isData) {
    // network first, fall back to cache (so edits show up right away, offline still works)
    // data/*.json is stored under its plain URL (no ?t=…), so refreshes don't pile up copies in the cache
    return fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || caches.match(req, { ignoreSearch: true })));
  }
  return caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }));
}

/* bounded cache of external supplier photos (Products/Research work offline; drop the oldest entry past 300) */
async function putImage(cache, req, res) {
  await cache.put(req, res);
  const keys = await cache.keys();
  if (keys.length > 300) await cache.delete(keys[0]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.indexOf("/pp/") !== -1) return;   /* pages: product page previews (video range requests) go straight to the network */
  /* supplier-hosted item photos: stale-while-revalidate into IMG_CACHE (opaque responses are fine to cache) */
  if (e.request.destination === "image" && url.origin !== location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(e.request);
      const refresh = fetch(e.request).then((r) => { if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); putImage(cache, e.request, copy).catch(() => {}); } return r; }).catch(() => hit);
      if (hit) { refresh.catch(() => {}); return hit; }
      return refresh;
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  /* navigations: prefer navigationPreload for the shell, fall back to the normal path on any failure */
  const pre = (e.request.mode === "navigate" && e.preloadResponse) ? e.preloadResponse : null;
  e.respondWith(pre
    ? pre.then((r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; } throw new Error("no preload"); }).catch(() => answer(e.request))
    : answer(e.request));
});
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
