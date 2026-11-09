/* JAY STEEL · Research (Nov 9 2026) — product research runs shown item by item with photos, scores, prices, best supplier and profit.
   Luis, Nov 8 10:34 PM: "put this into my app" (the TikTok 316L research sheet) + "add images next to the items".
   Data: data/research.enc.json — written by Tab's research_publish.py on its box, encrypted with the same key the app password unlocks
   (AES-256-GCM, PBKDF2-SHA256 600k, HQ salt), so supplier names, costs and links are never in a public plain file. Photos: assets/r/<run>/.
   Lives under ☰ Products → Research (#/products/research). Import pre-writes "Products: import <link>" on WhatsApp, like the Products tab.
   Nothing here buys, orders or contacts anyone. Revert: delete research.js/research.css and the "Research" lines in app.js. */
(function () {
  "use strict";
  const ROOT = (window.JSL && window.JSL.root) || "";
  const TAB_WA = "12512765320", KEY_STORE = "jshq_key_v1", ST_KEY = "jsr.state.v1";
  const app = document.getElementById("app");
  if (!document.getElementById("rs-css")) { const l = document.createElement("link"); l.id = "rs-css"; l.rel = "stylesheet"; l.href = ROOT + "research.css?v=1"; document.head.appendChild(l); }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const b64u = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64s = (u) => { let t = ""; new Uint8Array(u).forEach((x) => { t += String.fromCharCode(x); }); return btoa(t); };
  const $ = (id) => document.getElementById(id);
  const n2 = (n) => (n == null || isNaN(n) ? null : Number(n));
  const usd = (n) => (n2(n) == null ? "—" : "$" + Number(n).toFixed(2));
  const pct = (n) => (n2(n) == null ? "" : Math.round(n * 100) + "%");
  const kfmt = (n) => (n2(n) == null ? "" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K" : String(Math.round(n)));
  const wa = (text) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(text);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch (_) { return ""; } };
  const clean = (s) => String(s || "").replace(/\b(hand[- ]?made|wholesale)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  const cost = (s) => !s || s.cost_low == null ? "—" : s.cost_high != null && s.cost_high !== s.cost_low ? usd(s.cost_low) + "–" + usd(s.cost_high).slice(1) : usd(s.cost_low);
  const supName = (s) => /wholesale jewelry website|\bWJW\b/i.test(String(s || "")) ? "WJW (US warehouse)" : clean(String(s || "").replace(/\s*\((WJW)\)/, "").replace(/,?\s*(Co\.,?\s*)?Ltd\.?$/i, "").replace(/\s+(Trading|Import And Export)$/i, ""));

  const S = (() => { try { return Object.assign({ run: null, seg: "ideas", sent: {} }, JSON.parse(localStorage.getItem(ST_KEY) || "{}")); } catch (_) { return { run: null, seg: "ideas", sent: {} }; } })();
  const save = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(S)); } catch (_) {} };

  /* ---------- data ---------- */
  let D = null, LOADING = null, NEEDKEY = false, LOADERR = "", EMPTY = false;
  async function openBlob(blob, raw) {
    const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    let pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u(blob.iv) }, k, b64u(blob.ct));
    if (blob.z === "gzip") pt = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function load(pw, fresh) {
    const r = await fetch(ROOT + "data/research.enc.json" + (fresh ? "?t=" + Date.now() : ""), { cache: fresh ? "no-store" : "no-cache" });
    if (r.status === 404) { EMPTY = true; D = { runs: [] }; return D; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.json();
    let raw = null;
    if (pw) {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
      raw = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64u(blob.salt), iterations: blob.iter, hash: "SHA-256" }, base, 256);
    } else {
      try { const s = JSON.parse(localStorage.getItem(KEY_STORE) || "null"); if (s && s.salt === blob.salt) raw = b64u(s.key).buffer; } catch (_) {}
    }
    if (!raw) { NEEDKEY = true; return null; }
    const d = await openBlob(blob, raw);
    if (pw) try { localStorage.setItem(KEY_STORE, JSON.stringify({ salt: blob.salt, key: b64s(raw) })); } catch (_) {}
    NEEDKEY = false; D = d; return d;
  }
  function ensure(fresh) {
    if (D && !fresh) return Promise.resolve(D);
    if (!LOADING) LOADING = load(null, fresh).catch((e) => { LOADERR = String(e.message || e); return null; }).finally(() => { LOADING = null; });
    return LOADING;
  }

  /* ---------- shell ---------- */
  const show = (html) => { app.innerHTML = `<div class="view prd rs">${html}</div>`; };
  function setTab() {
    document.querySelectorAll(".menu a").forEach((a) => a.toggleAttribute("aria-current", false));
    const a = document.querySelector('.menu a[data-tab="products"]'); if (a) a.setAttribute("aria-current", "page");
    const pn = $("page-name"); if (pn) pn.textContent = "Products";
  }
  function head() {
    const b = (k, t) => `<button type="button" role="tab" data-go="${k}" aria-selected="${k === "research"}">${t}</button>`;
    return `<div class="pagehead"><h1>Products</h1></div>
      <div class="seg full prd-seg" role="tablist" aria-label="Products sections">${b("products", "Products")}${b("review", "Review")}${b("pricing", "Pricing")}${b("orders", "Orders")}${b("research", "Research")}</div>`;
  }
  function wireHead() {
    document.querySelectorAll("[data-go]").forEach((x) => x.addEventListener("click", () => { const k = x.dataset.go; location.hash = k === "products" ? "#/products" : "#/products/" + k; }));
  }
  function keyGate() {
    show(`${head()}<form class="card prd-key" id="rkey"><p><b>Unlock research</b></p><p class="prd-fine">Supplier names and costs are encrypted. Enter the app password once on this phone.</p><input id="rkpw" type="password" autocomplete="current-password" placeholder="App password" required><button class="btn primary full" type="submit">Unlock</button><p class="prd-fine" id="rkerr"></p></form>`);
    wireHead();
    $("rkey").addEventListener("submit", async (e) => { e.preventDefault(); $("rkerr").textContent = "Unlocking…"; try { await load($("rkpw").value.trim(), true); render(); } catch (_) { $("rkerr").textContent = "That password didn't unlock it."; } });
  }

  /* ---------- views ---------- */
  const runOf = () => { const rs = (D && D.runs) || []; return rs.find((r) => r.id === S.run) || rs[0] || null; };
  const img = (p) => ROOT + p;
  const scoreBar = (v, cls) => `<span class="rs-bar ${cls}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(10, v || 0)) * 10}%"></i></span>`;
  function importBtn(url, label, key) {
    if (!url) return "";
    const sent = S.sent[url];
    return `<a class="btn small ${sent ? "" : "primary"} rs-imp" href="${esc(wa("Products: import " + url))}" target="_blank" rel="noopener" data-imp="${esc(url)}" aria-label="Import ${esc(label)} into Products">${sent ? "Sent ✓ · again" : "Import"}</a>`;
  }
  function itemCard(it, run) {
    const b = it.best, s = b && b.sup;
    const thumb = it.thumb || (it.images || [])[0];
    const photos = (it.images || []).length;
    const other = (it.options || []).filter((o) => b && o.label !== b.label);
    const rng = it.price_low != null && it.price_high != null ? `${usd(it.price_low)}–${usd(it.price_high).slice(1)}` : "";
    return `<article class="rs-item card" id="ri-${it.rank}">
      <div class="rs-top">
        ${thumb ? `<button type="button" class="rs-thumb" data-gal="${it.rank}" aria-label="See ${photos} photo${photos === 1 ? "" : "s"} of ${esc(it.name)}"><img src="${esc(img(thumb))}" alt="" loading="lazy" decoding="async" width="96" height="96">${photos > 1 ? `<i>${photos}</i>` : ""}</button>` : `<div class="rs-thumb rs-thumb--none" aria-hidden="true">#${it.rank}</div>`}
        <div class="rs-main">
          <p class="rs-rank">#${it.rank}${it.score != null ? ` · score ${it.score}` : ""}</p>
          <h3>${esc(clean(it.name))}</h3>
          <div class="rs-scores">
            <span>Demand <b>${it.demand ?? "—"}</b>${scoreBar(it.demand, "is-d")}</span>
            <span>Competition <b>${it.comp ?? "—"}</b>${scoreBar(it.comp, "is-c")}</span>
          </div>
        </div>
      </div>
      <dl class="rs-kv">
        <div><dt>TikTok</dt><dd>${usd(it.price)}${rng ? `<small>${rng}</small>` : ""}</dd></div>
        <div><dt>Profit/sale</dt><dd class="${b && b.profit != null ? (b.profit >= 4 ? "is-ok" : b.profit < 1.5 ? "is-low" : "") : ""}">${b && b.profit != null ? usd(b.profit) : "—"}${b && b.margin != null ? `<small>${pct(b.margin)} margin</small>` : ""}</dd></div>
        <div><dt>Sold</dt><dd>${it.units != null ? kfmt(it.units) : "—"}${it.yoy != null ? `<small>Google ${it.yoy >= 1 ? "+" : ""}${Math.round((it.yoy - 1) * 100)}% yoy</small>` : ""}</dd></div>
      </dl>
      ${b ? `<div class="rs-best">
        <p class="rs-lbl">Best supplier · ${esc(b.kind)}</p>
        <p class="rs-sup"><b>${esc(s ? supName(s.supplier) : b.label)}</b>${s && s.location ? `<span>${esc(s.location.replace(/\s*\(.*\)/, ""))}</span>` : ""}</p>
        ${s ? `<p class="rs-facts"><span>${esc(cost(s))}${it.pack > 1 ? "/pc" : ""}</span><span>MOQ ${esc(clean(s.moq) || "—")}</span></p><p class="rs-ship">${esc(s.ship || "")}</p>` : ""}
      </div>` : `<p class="prd-fine rs-nosup">No supplier pulled for this one yet. Ask Tab to source it.</p>`}
      <div class="rs-actions">
        ${s && s.url ? importBtn(s.url, it.name, it.rank) : ""}
        ${s && s.url ? `<a class="btn small" href="${esc(s.url)}" target="_blank" rel="noopener">Listing ↗</a>` : ""}
        <button type="button" class="btn small rs-more" data-more="${it.rank}" aria-expanded="false" aria-controls="rm-${it.rank}">Details</button>
      </div>
      <div class="rs-detail" id="rm-${it.rank}" hidden>
        ${it.demand_ev ? `<p><b>Demand</b> ${esc(clean(it.demand_ev))}</p>` : ""}
        ${it.comp_ev ? `<p><b>Competition</b> ${esc(clean(it.comp_ev))}</p>` : ""}
        ${it.notes ? `<p><b>At the booth</b> ${esc(clean(it.notes))}${it.booth_profit != null ? ` About ${usd(it.booth_profit)} profit per sale at a market (no TikTok fees or shipping).` : ""}</p>` : ""}
        ${other.map((o) => `<p class="rs-alt"><b>Other option · ${esc(o.kind)}</b> ${esc(o.sup ? supName(o.sup.supplier) : o.label)} · ${esc(o.sup ? cost(o.sup) : "")} · MOQ ${esc(o.sup ? clean(o.sup.moq) : "—")} → ${usd(o.profit)} profit/sale${o.margin != null ? " (" + pct(o.margin) + ")" : ""}${o.sup && o.sup.url ? ` · <a href="${esc(o.sup.url)}" target="_blank" rel="noopener">listing</a> · <a href="${esc(wa("Products: import " + o.sup.url))}" target="_blank" rel="noopener" data-imp="${esc(o.sup.url)}">import</a>` : ""}</p>`).join("")}
        ${s && (s.rating || s.years || s.l316) ? `<p class="rs-alt"><b>Supplier facts</b> ${[s.rating && "rating " + esc(s.rating), s.years && esc(s.years) + " yrs on platform", s.l316 && "316L stated: " + esc(s.l316)].filter(Boolean).join(" · ")}</p>` : ""}
        ${s && s.notes ? `<p class="rs-alt">${esc(clean(s.notes))}</p>` : ""}
      </div>
    </article>`;
  }
  function miniRow(it) {
    return `<li class="rs-mini"><span class="rs-mini__r">#${it.rank}</span><span class="rs-mini__n">${esc(clean(it.name))}<small>D ${it.demand ?? "—"} · C ${it.comp ?? "—"}${it.price != null ? " · TikTok " + usd(it.price) : ""}${it.units != null ? " · " + kfmt(it.units) + " sold" : ""}</small></span></li>`;
  }
  function estimates(run) {
    const a = run.assumptions || [];
    const v = (x) => (x.value != null && x.value < 1 && /fee|commission|duty|tariff|discount/i.test(x.label) ? pct(x.value) : usd(x.value));
    return `<details class="card rs-est"><summary><b>Estimates</b><span>Fee %, freight and duty are estimates, not checked figures. Tap to see the numbers behind profit.</span></summary>
      <ul>${a.map((x) => `<li><span>${esc(clean(x.label))}</span><b>${esc(v(x))}</b><small>${esc(clean(x.note))}</small></li>`).join("")}</ul>
      ${(run.margin_notes || []).map((t) => `<p class="prd-fine">${esc(clean(t))}</p>`).join("")}
      ${run.method ? `<p class="prd-fine">${esc(clean(run.method))}</p>` : ""}
      ${(run.notes || []).map((t) => `<p class="prd-fine">${esc(clean(t.replace(/^Notes:\s*/, "")))}</p>`).join("")}
    </details>`;
  }
  function viewIdeas(run) {
    const full = run.items.filter((i) => i.best || (i.images || []).length);
    const rest = run.items.filter((i) => !(i.best || (i.images || []).length));
    return `${estimates(run)}
      <div class="rs-list">${full.map((i) => itemCard(i, run)).join("")}</div>
      ${rest.length ? `<h2 class="rs-h2">More ideas <small>${rest.length} · no suppliers pulled yet</small></h2><ul class="card rs-minis">${rest.map(miniRow).join("")}</ul>` : ""}`;
  }
  function viewSuppliers(run) {
    const byRank = new Map();
    (run.suppliers || []).forEach((s) => { const k = s.rank || 0; if (!byRank.has(k)) byRank.set(k, []); byRank.get(k).push(s); });
    const name = (rk) => { const it = run.items.find((i) => i.rank === rk); return it ? clean(it.name) : "Other sources"; };
    const bestUrl = (rk) => { const it = run.items.find((i) => i.rank === rk); return it && it.best && it.best.sup ? it.best.sup.url : null; };
    const keys = [...byRank.keys()].sort((a, b) => (a || 999) - (b || 999));
    return `<p class="prd-fine rs-supnote">${(run.suppliers || []).length} suppliers, grouped by product. Costs are per unit as listed; shipping cost to you isn't included unless it says so.</p>` +
      keys.map((rk) => `<section class="rs-sgroup"><h2 class="rs-h2">${rk ? "#" + rk + " " : ""}${esc(name(rk))}</h2>
        ${byRank.get(rk).map((s) => `<div class="card rs-srow${bestUrl(rk) === s.url ? " is-best" : ""}">
          <div class="rs-srow__top"><b>${esc(supName(s.supplier))}</b>${bestUrl(rk) === s.url ? `<span class="pill">Best</span>` : ""}</div>
          <p class="rs-srow__m">${esc([s.platform, s.location].filter(Boolean).join(" · "))}</p>
          <p class="rs-facts"><span>${esc(cost(s))}</span><span>MOQ ${esc(clean(s.moq) || "—")}</span>${s.rating ? `<span>★ ${esc(s.rating)}</span>` : ""}${s.years ? `<span>${esc(s.years)} yrs</span>` : ""}</p>
          ${s.ship ? `<p class="rs-ship">${esc(s.ship)}</p>` : ""}
          ${s.title ? `<p class="rs-srow__t">${esc(clean(s.title))}</p>` : ""}
          ${s.url ? `<div class="rs-actions">${s.url && /\/products?\b|product-detail|item/i.test(s.url) ? importBtn(s.url, s.title || s.supplier) : ""}<a class="btn small" href="${esc(s.url)}" target="_blank" rel="noopener">${/wholesale/i.test(host(s.url)) ? "Listing" : esc(host(s.url) || "Listing")} ↗</a></div>` : ""}
        </div>`).join("")}</section>`).join("");
  }
  function render(h) {
    setTab();
    if (!D) {
      if (NEEDKEY) return keyGate();
      show(`${head()}<div class="skel" aria-label="Loading research"><i></i><i></i><i></i></div>`); wireHead();
      ensure().then(() => { if (!location.hash.startsWith("#/products/research")) return; if (D || NEEDKEY) render(); else { show(`${head()}<p class="empty">Couldn't load research (${esc(LOADERR)}). Pull down to refresh.</p>`); wireHead(); } });
      return;
    }
    const runs = D.runs || [], run = runOf();
    if (!run) { show(`${head()}<p class="empty">No research yet. Ask Tab to research a product category and it shows up here.</p>`); wireHead(); return; }
    const segB = (k, t) => `<button type="button" data-rseg="${k}" aria-pressed="${S.seg === k}">${t}</button>`;
    show(`${head()}
      ${runs.length > 1 ? `<div class="rs-runs" role="tablist" aria-label="Research runs">${runs.map((r) => `<button type="button" role="tab" data-run="${esc(r.id)}" aria-selected="${r.id === run.id}">${esc(r.title)}<small>${esc(r.date || "")}</small></button>`).join("")}</div>` : ""}
      <div class="rs-headline"><h2>${esc(clean(run.title))}</h2><p>${run.items.length} ideas ranked · ${(run.suppliers || []).length} suppliers · read ${esc(run.date || "")}</p></div>
      <div class="seg full rs-seg">${segB("ideas", "Ideas")}${segB("suppliers", "Suppliers")}</div>
      ${S.seg === "suppliers" ? viewSuppliers(run) : viewIdeas(run)}
      <p class="prd-fine center">Import sends the link to Tab on WhatsApp; it lands in Products as a draft. Nothing is ordered.</p>`);
    wireHead(); wire(run);
    const sel = document.querySelector('.prd-seg [data-go="research"]'); if (sel && sel.parentNode.scrollWidth > sel.parentNode.clientWidth) sel.parentNode.scrollLeft = sel.parentNode.scrollWidth;
  }
  function wire(run) {
    document.querySelectorAll("[data-run]").forEach((x) => x.addEventListener("click", () => { S.run = x.dataset.run; save(); render(); window.scrollTo(0, 0); }));
    document.querySelectorAll("[data-rseg]").forEach((x) => x.addEventListener("click", () => { S.seg = x.dataset.rseg; save(); render(); }));
    document.querySelectorAll("[data-more]").forEach((x) => x.addEventListener("click", () => {
      const d = $("rm-" + x.dataset.more); const open = d.hidden; d.hidden = !open; x.setAttribute("aria-expanded", String(open)); x.textContent = open ? "Less" : "Details"; }));
    document.querySelectorAll("[data-imp]").forEach((x) => x.addEventListener("click", () => { S.sent[x.dataset.imp] = Date.now(); save(); toast("Opening WhatsApp — send it and Tab imports"); setTimeout(() => render(), 400); }));
    document.querySelectorAll("[data-gal]").forEach((x) => x.addEventListener("click", () => gallery(run.items.find((i) => String(i.rank) === x.dataset.gal))));
  }

  /* ---------- photo viewer ---------- */
  function gallery(it) {
    if (!it || !(it.images || []).length) return;
    const old = $("rs-gal"); if (old) old.remove();
    const g = document.createElement("div"); g.id = "rs-gal"; g.className = "rs-gal"; g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-label", "Photos of " + clean(it.name));
    g.innerHTML = `<div class="rs-gal__bar"><b>#${it.rank} ${esc(clean(it.name))}</b><button type="button" class="iconbtn" id="rs-gal-x" aria-label="Close photos">×</button></div>
      <div class="rs-gal__strip" id="rs-gal-strip">${it.images.map((p, i) => `<figure><img src="${esc(img(p))}" alt="Photo ${i + 1} of ${it.images.length}" decoding="async"></figure>`).join("")}</div>
      <p class="rs-gal__n" id="rs-gal-n">1 / ${it.images.length} · swipe</p>`;
    document.body.appendChild(g); document.body.classList.add("sheet-open");
    const close = () => { g.remove(); document.body.classList.remove("sheet-open"); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    $("rs-gal-x").addEventListener("click", close); $("rs-gal-x").focus();
    const st = $("rs-gal-strip"); st.addEventListener("scroll", () => { const i = Math.round(st.scrollLeft / st.clientWidth) + 1; $("rs-gal-n").textContent = i + " / " + it.images.length + " · swipe"; }, { passive: true });
  }

  /* ---------- "Research" tab inside the Products section bar (products.js draws that bar; we add one button) ---------- */
  function promo() {
    const imp = document.getElementById("pimp");
    if (!imp || document.getElementById("rs-promo")) return;
    const a = document.createElement("a"); a.id = "rs-promo"; a.className = "card rs-promo"; a.href = "#/products/research";
    const fill = () => { const r = runOf(); a.innerHTML = `<span class="rs-promo__img">${r && r.items[0] && r.items[0].thumb ? `<img src="${esc(img(r.items[0].thumb))}" alt="" width="44" height="44">` : ""}</span><span class="rs-promo__t"><b>Research</b><small>${r ? esc(clean(r.title)) + " · " + r.items.length + " ideas with photos, suppliers, profit" : "Trending product ideas with photos, suppliers and profit"}</small></span><span class="rs-promo__go" aria-hidden="true">›</span>`; };
    fill(); imp.insertAdjacentElement("afterend", a);
    if (!D) ensure().then(() => { if (D && a.isConnected) fill(); });
  }
  function inject() {
    promo();
    const bar = document.querySelector(".prd-seg:not(.rs-seg)");
    if (!bar || bar.querySelector('[data-go="research"]')) return;
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.go = "research"; b.setAttribute("aria-selected", "false"); b.textContent = "Research";
    b.addEventListener("click", () => { location.hash = "#/products/research"; });
    bar.appendChild(b);
  }
  new MutationObserver(() => { if (location.hash.indexOf("#/products") === 0) inject(); }).observe(app, { childList: true, subtree: true });
  inject();

  window.JSLResearch = { render, reload: () => ensure(true), inject };
})();
