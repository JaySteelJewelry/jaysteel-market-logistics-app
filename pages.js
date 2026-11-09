/* JAY STEEL · Product pages (Nov 9 2026) — every imported product gets a real product page: reel, photo gallery, brand copy, price, options, CTA.
   Luis, Nov 8 10:13 PM: "i would like my app to be able to generate real product sites with any product link i paste into it".
   Tab's pages.py builds each page after an import and puts a PREVIEW at pp/<slug>/ (noindex, not linked from the public site).
   Publish = a WhatsApp message to Tab ("Products: publish page <slug>"); Tab then commits it to https://jaysteeljewelry.github.io/p/<slug>/.
   Lives under ☰ Products → Pages (#/products/pages) and on each product (#/products/p/<id> → "Product page").
   Nothing here buys, orders or contacts anyone. Revert: delete pages.js/pages.css and the lines marked "pages" in app.js + sw.js. */
(function () {
  "use strict";
  const ROOT = (window.JSL && window.JSL.root) || "";
  const TAB_WA = "12512765320", PUB = "https://jaysteeljewelry.github.io/p/";
  const app = document.getElementById("app");
  if (!document.getElementById("pg-css")) { const l = document.createElement("link"); l.id = "pg-css"; l.rel = "stylesheet"; l.href = ROOT + "pages.css?v=2"; document.head.appendChild(l); }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const wa = (text) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(text);
  const usd = (n) => (n == null || isNaN(n) ? "" : "$" + Number(n).toFixed(2));
  const show = (html) => { app.innerHTML = `<div class="view prd pg">${html}</div>`; };
  const SENT_KEY = "jsp.sent.v1";
  const sent = (() => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || "{}"); } catch (_) { return {}; } })();
  const mark = (k) => { sent[k] = Date.now(); try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch (_) {} };
  const recent = (k) => sent[k] && Date.now() - sent[k] < 6 * 3600e3;

  let IDX = null, LOADING = null;
  function ensure(fresh) {
    if (IDX && !fresh) return Promise.resolve(IDX);
    if (!LOADING) LOADING = fetch(ROOT + "pp/index.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : { pages: [] }))
      .catch(() => ({ pages: [] })).then((j) => { IDX = j; return j; }).finally(() => { LOADING = null; });
    return LOADING;
  }
  const bySlug = (s) => (IDX && IDX.pages || []).find((p) => p.slug === s);
  const byPid = (id) => (IDX && IDX.pages || []).find((p) => p.pid === id);
  function setTab() { document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-current", x.dataset.tab === "products" ? "page" : "false")); }
  const status = (p) => p.published_url ? `<span class="pg-st pg-st--live">Live</span>` : `<span class="pg-st">Preview</span>`;

  function head() {
    const b = (k, label) => `<button type="button" role="tab" data-go="${k}" aria-selected="${k === "pages"}">${label}</button>`;
    return `<div class="pagehead"><h1>Products</h1></div>
      <div class="seg full prd-seg pg-seg" style="overflow-x:auto" role="tablist" aria-label="Products sections">${b("products", "Products")}${b("review", "Review")}${b("pricing", "Pricing")}${b("orders", "Orders")}${b("research", "Research")}${b("pages", "Pages")}</div>`;
  }
  function wireHead() {
    const on = document.querySelector('.pg-seg [aria-selected="true"]'), bar = document.querySelector(".pg-seg"); const fit = () => { if (on && bar && on.isConnected) { const a = on.getBoundingClientRect(), c = bar.getBoundingClientRect(); bar.scrollLeft += a.left - c.left - (bar.clientWidth - a.width) / 2; } }; fit(); setTimeout(fit, 350);
    document.querySelectorAll(".pg-seg [data-go]").forEach((x) => x.addEventListener("click", () => { const g = x.dataset.go; location.hash = g === "products" ? "#/products" : "#/products/" + g; }));
  }

  function viewList() {
    const ps = (IDX && IDX.pages) || [];
    show(`${head()}
      <p class="pg-intro">A real product page for every product you import: video, photos, price, options and a “Shop + find us” button. Pages stay private here until you tap Publish.</p>
      ${ps.length ? `<div class="pg-list">${ps.map((p) => `<a class="card pg-row" href="#/products/page/${encodeURIComponent(p.slug)}">
        <img src="${esc(ROOT + p.thumb)}" alt="" width="64" height="64" loading="lazy">
        <span class="pg-row__t"><b>${esc(p.name)}</b><small>${esc(p.category || "")}${p.price_from != null ? " · from " + usd(p.price_from) : ""}${p.reel ? " · video" : ""}</small></span>
        ${status(p)}</a>`).join("")}</div>` : `<p class="empty">No product pages yet. Import a product and its page shows up here.</p>`}`);
    wireHead();
  }

  function viewPage(slug) {
    const p = bySlug(slug);
    if (!p) { show(`<a class="back" href="#/products/pages">‹ Pages</a><p class="empty">That page isn't built yet. Pull down to refresh in a minute.</p>`); return; }
    const src = ROOT + "pp/" + encodeURIComponent(slug) + "/";
    const live = p.published_url;
    const pubMsg = "Products: publish page " + slug + " (" + p.name + ")";
    show(`<a class="back" href="#/products/pages">‹ Pages</a>
      <div class="pg-h"><div><p class="eyebrow">${esc(p.category || "Product page")}</p><h1 class="prd-h">${esc(p.name)}</h1></div>${status(p)}</div>
      <div class="pg-frame"><iframe src="${esc(src)}" title="Product page preview: ${esc(p.name)}" loading="lazy"></iframe></div>
      <div class="actions pg-actions">
        ${live ? `<a class="btn primary" href="${esc(live)}" target="_blank" rel="noopener">Open live page</a><button class="btn" type="button" id="pgcopy">Copy link</button>`
               : `<a class="btn primary" id="pgpub" href="${esc(wa(pubMsg))}" target="_blank" rel="noopener">${recent("pub:" + slug) ? "Sent ✓ Tab is publishing" : "Publish to my site"}</a>`}
        <a class="btn" href="${esc(src)}" target="_blank" rel="noopener">Full screen</a>
        ${p.pid ? `<a class="btn" href="#/products/p/${encodeURIComponent(p.pid)}">Product details</a>` : ""}
      </div>
      <p class="pg-fine">${live ? `Live at ${esc(live.replace(/^https:\/\//, ""))}. To take it down, message Tab “Products: unpublish page ${esc(slug)}”.`
        : `Publishing puts this page on your public site at jaysteeljewelry.github.io/p/${esc(slug)}/. Nothing goes public until you send that message.`}</p>`);
    const pb = document.getElementById("pgpub"); if (pb) pb.addEventListener("click", () => { mark("pub:" + slug); toast("Opening WhatsApp — send it and Tab publishes"); setTimeout(() => { if (location.hash.indexOf("#/products/page/") === 0) viewPage(slug); }, 500); });
    const cp = document.getElementById("pgcopy"); if (cp) cp.addEventListener("click", () => { (navigator.clipboard ? navigator.clipboard.writeText(live) : Promise.reject()).then(() => toast("Link copied")).catch(() => toast(live)); });
  }

  function render(h) {
    setTab();
    const hh = (h || location.hash).replace(/^#\/?/, "");
    const go = () => { if (hh.indexOf("products/page/") === 0) viewPage(decodeURIComponent(hh.slice(14))); else viewList(); };
    if (IDX) return go();
    show('<div class="skel" aria-label="Loading pages"><i></i><i></i><i></i></div>');
    ensure().then(() => { if (location.hash.indexOf("#/products/page") === 0) go(); });
  }

  /* ---------- hooks into the Products screens (products.js draws them; we add a button) ---------- */
  function inject() {
    const h = location.hash;
    const bar = document.querySelector(".prd-seg:not(.pg-seg)");
    if (bar && !bar.querySelector('[data-go="pages"]')) {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.go = "pages"; b.setAttribute("aria-selected", "false"); b.textContent = "Pages";
      b.addEventListener("click", () => { location.hash = "#/products/pages"; });
      bar.appendChild(b);
    }
    const m = h.match(/^#\/products\/p\/([^/?#]+)/);
    const ttl = document.querySelector(".prd-h");
    if (m && ttl && !document.getElementById("pg-link")) {
      const pid = decodeURIComponent(m[1]);
      const put = () => {
        if (document.getElementById("pg-link") || !ttl.isConnected) return;
        const p = byPid(pid); const a = document.createElement("a"); a.id = "pg-link"; a.className = "card pg-promo";
        if (p) { a.href = "#/products/page/" + encodeURIComponent(p.slug); a.innerHTML = `<img src="${esc(ROOT + p.thumb)}" alt="" width="44" height="44"><span><b>Product page</b><small>${p.published_url ? "Live on your site" : "Preview · tap to see it, publish when you're happy"}</small></span>${status(p)}<i aria-hidden="true">›</i>`; }
        else { a.href = wa("Products: make page " + pid); a.target = "_blank"; a.rel = "noopener"; a.innerHTML = `<span><b>Make a product page</b><small>${recent("make:" + pid) ? "Sent ✓ Tab is building it" : "Video, photos, price + a Shop button. Opens WhatsApp, send it to Tab"}</small></span><i aria-hidden="true">›</i>`; a.addEventListener("click", () => { mark("make:" + pid); toast("Opening WhatsApp — send it and Tab builds the page"); }); }
        ttl.insertAdjacentElement("afterend", a);
      };
      if (IDX) put(); else ensure().then(put);
    }
  }
  new MutationObserver(() => { if (location.hash.indexOf("#/products") === 0 && location.hash.indexOf("#/products/page") !== 0) inject(); }).observe(app, { childList: true, subtree: true });
  ensure().then(inject);

  window.JSLPages = { render, reload: () => ensure(true), inject };
})();
