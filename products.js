/* JAY STEEL · Products (Nov 7 2026) — supplier importer, pricing rules, review, exports, orders.
   Luis: "build me an app or tab that is or does this" (ProductUpload.ai Copy Products) + "build me a product better than this" (DSers) + TikTok Shop / Square exports.
   Data: data/products.enc.json — the catalog Tab's importer builds on its box (files/product_importer), encrypted with the same key the
   app password already unlocks (AES-256-GCM, PBKDF2-SHA256 600k, HQ salt). Supplier costs and links are never in a public plain file.
   Edits (prices, rules, picks, review decisions, tracking) are saved on this device; "Send to Tab" hands them to Tab on WhatsApp.
   Nothing here publishes to Shopify/TikTok or buys anything: pushes are drafts only, through Tab, after you tap send. */
(function () {
  "use strict";
  const ROOT = (window.JSL && window.JSL.root) || "";
  const TAB_WA = "12512765320";
  const KEY_STORE = "jshq_key_v1", ST_KEY = "jsp.state.v1";
  const app = document.getElementById("app");
  if (!document.getElementById("prd-css")) { const l = document.createElement("link"); l.id = "prd-css"; l.rel = "stylesheet"; l.href = ROOT + "products.css?v=2"; document.head.appendChild(l); }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2000); };
  const b64u = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64s = (u) => { let t = ""; new Uint8Array(u).forEach((x) => { t += String.fromCharCode(x); }); return btoa(t); };
  const $ = (id) => document.getElementById(id);
  const usd = (n) => (n == null || isNaN(n) ? "—" : "$" + Number(n).toFixed(2));
  const wa = (text) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(text);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch (_) { return ""; } };
  /* photos (Nov 9 2026, Luis: "i dont have images along with items"): the variant's own supplier photo when the catalog has one, else the product's main photo */
  const imgOf = (p, key) => { if (!p) return ""; const v = key && (p.variants || []).find((x) => ((x.options || []).join("|") || "default") === key); return (v && v.image) || (p.images && p.images[0]) || ""; };
  const thumb = (u, cls) => `<span class="prd-thumb${cls ? " " + cls : ""}">${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
  if (app && !app.dataset.prdImgErr) { app.dataset.prdImgErr = "1"; app.addEventListener("error", (e) => { const t = e.target; if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("prd-thumb")) t.remove(); }, true); }

  /* ---------- local state (this device) ---------- */
  const S = (() => { try { return Object.assign({ sel: {}, ov: {}, rule: {}, rules: [], useRw: {}, status: {}, dec: {}, sentDec: {}, track: {}, undo: [], hidden: {}, defRule: null }, JSON.parse(localStorage.getItem(ST_KEY) || "{}")); } catch (_) { return { sel: {}, ov: {}, rule: {}, rules: [], useRw: {}, status: {}, dec: {}, sentDec: {}, track: {}, undo: [], hidden: {}, defRule: null }; } })();
  const save = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(S)); } catch (_) { toast("Couldn't save on this phone"); } };

  /* ---------- data: decrypt the catalog with the app's key ---------- */
  let CAT = null, LOADING = null, NEEDKEY = false, LOADERR = "";
  async function openBlob(blob, raw) {
    const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    let pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u(blob.iv) }, k, b64u(blob.ct));
    if (blob.z === "gzip") pt = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function load(pw, fresh) {
    const r = await fetch(ROOT + "data/products.enc.json" + (fresh ? "?t=" + Date.now() : ""), { cache: fresh ? "no-store" : "no-cache" });
    if (r.status === 404) { CAT = { products: [], rules: [], changes: [], alternatives: {}, orders: [], imports: [] }; return CAT; }
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
    NEEDKEY = false; CAT = d; return d;
  }
  function ensure(fresh) {
    if (CAT && !fresh) return Promise.resolve(CAT);
    if (!LOADING) LOADING = load(null, fresh).catch((e) => { LOADERR = String(e.message || e); return null; }).finally(() => { LOADING = null; });
    return LOADING;
  }

  /* ---------- pricing (same math as the engine's core.py) ---------- */
  const r4 = (x) => Math.round(x * 10000) / 10000;
  function endPrice(x, e) {
    if (x == null || isNaN(x)) return null;
    if (e === ".99") return Math.round((Math.ceil(r4(x + 0.01)) - 0.01) * 100) / 100;
    if (e === ".95") return Math.round((Math.ceil(r4(x + 0.05)) - 0.05) * 100) / 100;
    if (e === ".00") return Math.ceil(r4(x));
    return Math.round(x * 100) / 100;
  }
  function priceWith(rule, cost, ship, supCmp) {
    if (cost == null) return [null, null];
    const base = rule.basis === "landed" ? cost + (ship || 0) : cost;
    const p = endPrice(Math.max(base * +rule.mult + (+rule.add || 0), +rule.min || 0), rule.ending);
    let c = null;
    if (rule.compare === "mult" && +rule.compare_mult) c = endPrice(p * +rule.compare_mult, rule.ending);
    else if (rule.compare === "supplier" && supCmp && supCmp > p) c = Math.round(supCmp * 100) / 100;
    return [p, c];
  }
  const rules = () => { const m = new Map(); (CAT.rules || []).forEach((r) => m.set(r.id, r)); (S.rules || []).forEach((r) => m.set(r.id, r)); return [...m.values()]; };
  const ruleBy = (id) => rules().find((r) => r.id === id) || rules()[0];
  const vk = (v) => (v.options || []).join("|") || "default";
  const shipOf = (p) => (p.shipping && p.shipping.cost) || 0;
  /* effective values = engine data + this phone's edits + applied review decisions */
  function costOf(p, v) { const o = (S.ov[p.id] || {})[vk(v)]; return o && o.cost != null ? o.cost : v.cost; }
  function eff(p, v) {
    const o = (S.ov[p.id] || {})[vk(v)];
    return { price: o && o.price != null ? o.price : v.price, compare_at: o && "compare_at" in o ? o.compare_at : v.compare_at, cost: costOf(p, v) };
  }
  const title = (p) => (S.useRw[p.id] !== false && p.rewrite && p.rewrite.title) || p.title;
  const visible = () => (CAT.products || []).filter((p) => !S.hidden[p.id]);
  const selected = () => visible().filter((p) => S.sel[p.id]);
  const margin = (price, cost) => (price && cost != null ? Math.round(((price - cost) / price) * 100) : null);

  /* ---------- undo ---------- */
  function snapshot(ids, label) {
    S.undo.push({ label, at: Date.now(), ov: Object.fromEntries(ids.map((id) => [id, S.ov[id] ? JSON.parse(JSON.stringify(S.ov[id])) : null])), rule: Object.fromEntries(ids.map((id) => [id, S.rule[id] || null])), status: Object.fromEntries(ids.map((id) => [id, S.status[id] || null])) });
    if (S.undo.length > 25) S.undo.shift();
  }
  function undo() {
    const u = S.undo.pop(); if (!u) return toast("Nothing to undo");
    Object.keys(u.ov).forEach((id) => { if (u.ov[id]) S.ov[id] = u.ov[id]; else delete S.ov[id]; if (u.rule[id]) S.rule[id] = u.rule[id]; else delete S.rule[id]; if (u.status[id]) S.status[id] = u.status[id]; else delete S.status[id]; });
    save(); toast("Undone: " + u.label); render();
  }
  function applyRuleTo(ps, rid) {
    const r = ruleBy(rid); snapshot(ps.map((p) => p.id), r.name + " on " + ps.length);
    ps.forEach((p) => { S.rule[p.id] = r.id; const o = S.ov[p.id] = S.ov[p.id] || {}; p.variants.forEach((v) => { const [pr, c] = priceWith(r, costOf(p, v), shipOf(p), v.supplier_compare_at); o[vk(v)] = Object.assign({}, o[vk(v)], { price: pr, compare_at: c }); }); });
    save();
  }

  /* ---------- exports ---------- */
  const csvCell = (x) => { const s = x == null ? "" : String(x); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = (cols, rows) => "\ufeff" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
  function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const handle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const skuOf = (p, i, v) => (v.sku && String(v.sku).trim()) || "JS-" + p.id.slice(2) + "-" + (i + 1);
  const SHOPIFY_COLS = ["Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title", "SEO Description", "Variant Image", "Variant Weight Unit", "Cost per item", "Status"];
  function shopifyRows(p) {
    const rw = (S.useRw[p.id] !== false && p.rewrite) || {}; const t = title(p); const h = handle(t) + "-" + p.id.slice(2, 6);
    const opts = p.options || [], imgs = p.images || [], rows = [];
    p.variants.forEach((v, i) => {
      const e = eff(p, v), r = Object.fromEntries(SHOPIFY_COLS.map((c) => [c, ""])); r.Handle = h;
      if (i === 0) Object.assign(r, { Title: t, "Body (HTML)": rw.body_html || p.body_html || "", Vendor: "JAY STEEL JEWELRY", Type: rw.product_type || p.product_type || "", Tags: (rw.tags || p.tags || []).slice(0, 8).join(", "), Published: "FALSE", "Gift Card": "FALSE", "SEO Title": rw.seo_title || "", "SEO Description": rw.seo_description || "", Status: S.status[p.id] || "draft" }, imgs[0] ? { "Image Src": imgs[0], "Image Position": 1, "Image Alt Text": t } : {});
      if (opts.length) opts.slice(0, 3).forEach((o, k) => { if (i === 0) r["Option" + (k + 1) + " Name"] = o.name; r["Option" + (k + 1) + " Value"] = (v.options || [])[k] || ""; });
      else { if (i === 0) r["Option1 Name"] = "Title"; r["Option1 Value"] = "Default Title"; }
      Object.assign(r, { "Variant SKU": skuOf(p, i, v), "Variant Grams": Math.round(v.weight_g || 0), "Variant Inventory Policy": "deny", "Variant Fulfillment Service": "manual", "Variant Price": e.price != null ? e.price.toFixed(2) : "", "Variant Compare At Price": e.compare_at ? e.compare_at.toFixed(2) : "", "Variant Requires Shipping": "TRUE", "Variant Taxable": "TRUE", "Variant Image": v.image || "", "Variant Weight Unit": "g", "Cost per item": e.cost != null ? e.cost.toFixed(2) : "" });
      rows.push(r);
    });
    imgs.slice(1).forEach((im, n) => { const r = Object.fromEntries(SHOPIFY_COLS.map((c) => [c, ""])); Object.assign(r, { Handle: h, "Image Src": im, "Image Position": n + 2, "Image Alt Text": t }); rows.push(r); });
    return rows;
  }
  const EXPORTERS = {
    shopify: { label: "Shopify CSV", note: "Shopify admin → Products → Import. Imports as drafts unless you set Active.", run(ps) { download("jaysteel-shopify-" + new Date().toISOString().slice(0, 10) + ".csv", toCSV(SHOPIFY_COLS, ps.flatMap(shopifyRows))); } }
  };

  /* Square item library import (Luis Nov 7: "add a square store export button"; locked tab only). Square Dashboard → Items → Import.
     Required per Square's help page: Token (blank), Item Name, Variation Name, Description, SKU. Square's import has no image column. */
  const SQUARE_COLS = ["Token", "Item Name", "Variation Name", "Unit and Precision", "SKU", "Description", "Category", "SEO Title", "SEO Description", "Permalink", "GTIN", "Square Online Item Visibility", "Item Type", "Weight (lb)", "Shipping Enabled", "Self-serve Ordering Enabled", "Delivery Enabled", "Pickup Enabled", "Price", "Online Sale Price", "Archived", "Sellable", "Contains Alcohol", "Stockable", "Skip Detail Screen in POS", "Option Name 1", "Option Value 1", "Option Name 2", "Option Value 2", "Option Name 3", "Option Value 3", "Default Unit Cost", "Default Vendor Name", "Default Vendor Code"];
  const plain = (h) => { const d = document.createElement("div"); d.innerHTML = h || ""; d.querySelectorAll("p").forEach((p) => p.append("\n")); d.querySelectorAll("li").forEach((li) => { li.prepend("• "); li.append("\n"); }); return d.textContent.replace(/\n{3,}/g, "\n\n").trim(); };
  EXPORTERS.square = { label: "Square item import", note: "Square Dashboard → Items → Import (CSV). Imported hidden from your Square Online site. Square's import has no photo column — add photos in Square.", run(ps) {
    const rows = [];
    ps.forEach((p) => { const rw = (S.useRw[p.id] !== false && p.rewrite) || {}; const t = title(p), opts = p.options || [];
      p.variants.forEach((v, i) => { const e = eff(p, v); const r = Object.fromEntries(SQUARE_COLS.map((c) => [c, ""]));
        Object.assign(r, { "Item Name": t, "Variation Name": opts.length ? (v.options || []).join(", ") : "Regular", SKU: skuOf(p, i, v), Description: plain(rw.body_html || p.body_html), Category: rw.product_type || p.product_type || "Jewelry", "SEO Title": rw.seo_title || "", "SEO Description": rw.seo_description || "", "Square Online Item Visibility": "Hidden", "Item Type": "Physical good", "Weight (lb)": v.weight_g ? (v.weight_g / 453.592).toFixed(3) : "", "Shipping Enabled": "Y", "Pickup Enabled": "Y", Price: e.price != null ? e.price.toFixed(2) : "", Archived: "N", Sellable: "Y", "Contains Alcohol": "N", Stockable: "Y", "Skip Detail Screen in POS": "N", "Default Unit Cost": e.cost != null ? e.cost.toFixed(2) : "", "Default Vendor Name": p.source.supplier || "", "Default Vendor Code": v.sku || "" });
        opts.slice(0, 3).forEach((o, k) => { r["Option Name " + (k + 1)] = o.name; r["Option Value " + (k + 1)] = (v.options || [])[k] || ""; });
        rows.push(r); }); });
    download("jaysteel-square-items-" + new Date().toISOString().slice(0, 10) + ".csv", toCSV(SQUARE_COLS, rows)); } };

  /* TikTok Shop bulk listing (Luis Nov 7: "add the option to export straight to tiktok shop"). TikTok only accepts its own per-category
     template (Seller Center → Products → Bulk action → Bulk listing → pick the leaf category → Download template). This sheet has the same
     columns in the US template's order, one row per SKU, Product Status = Draft, so it pastes straight into that template from the first data row.
     Steel/plated jewelry belongs in Fashion Accessories › Costume Jewelry & Accessories (not the invite-only fine-jewelry category). */
  const TT_COLS = ["Category", "Brand", "Product Name", "Product Description", "Main Product Image", "Product Image 2", "Product Image 3", "Product Image 4", "Product Image 5", "Product Image 6", "Product Image 7", "Product Image 8", "Product Image 9", "Identifier Code Type", "Identifier Code", "Primary variation name", "Primary variation value", "Primary variation image 1", "Secondary variation name", "Secondary variation value", "Package Weight(lb)", "Package Length(inch)", "Package Width(inch)", "Package Height(inch)", "Delivery options", "Retail Price (Local Currency)", "Quantity in U.S Pickup Warehouse", "Seller SKU", "Size Chart", "Product Status"];
  const TT_LEAF = (t) => { t = (t || "").toLowerCase(); return "Fashion Accessories/Costume Jewelry & Accessories/" + (/neck|chain|pendant/.test(t) ? "Necklaces" : /brace|bangle|cuff/.test(t) ? "Bracelets & Bangles" : /ear|stud|hoop/.test(t) ? "Earrings" : /ring/.test(t) ? "Rings" : /anklet/.test(t) ? "Anklets" : /set/.test(t) ? "Jewelry Sets" : /body|pierc/.test(t) ? "Body Jewelry" : /charm/.test(t) ? "Charms & Pendants" : "Necklaces"); };
  const ttClean = (s) => String(s || "").replace(/\b(best ?seller|sale|discount|cheap|hand[- ]?made|wholesale)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  EXPORTERS.tiktok = { label: "TikTok Shop sheet", note: "Same columns as TikTok's bulk-listing template, one row per SKU, status Draft. Paste into the template you download for that category — or send the template to Tab and Tab fills it.", run(ps) {
    const rows = [];
    ps.forEach((p) => { const rw = (S.useRw[p.id] !== false && p.rewrite) || {}; const t = ttClean(title(p)).slice(0, 255), opts = p.options || [], imgs = (p.images || []).slice(0, 9);
      p.variants.slice(0, 100).forEach((v, i) => { const e = eff(p, v); const r = Object.fromEntries(TT_COLS.map((c) => [c, ""]));
        Object.assign(r, { Category: TT_LEAF((rw.product_type || "") + " " + (p.product_type || "") + " " + p.title), "Product Name": t, "Product Description": ttClean(plain(rw.body_html || p.body_html)).slice(0, 9500), "Primary variation name": opts[0] ? opts[0].name : "", "Primary variation value": opts[0] ? (v.options || [])[0] || "" : "", "Primary variation image 1": opts[0] ? v.image || "" : "", "Secondary variation name": opts[1] ? opts[1].name : "", "Secondary variation value": opts[1] ? (v.options || [])[1] || "" : "", "Package Weight(lb)": 1, "Package Length(inch)": 6, "Package Width(inch)": 4, "Package Height(inch)": 2, "Retail Price (Local Currency)": e.price != null ? e.price.toFixed(2) : "", "Quantity in U.S Pickup Warehouse": v.available === false ? 0 : v.stock != null ? Math.min(v.stock, 999999) : 10, "Seller SKU": skuOf(p, i, v).slice(0, 50), "Product Status": "Draft" });
        imgs.forEach((u, k) => { r[k === 0 ? "Main Product Image" : "Product Image " + (k + 1)] = u; });
        rows.push(r); }); });
    download("jaysteel-tiktok-shop-" + new Date().toISOString().slice(0, 10) + ".csv", toCSV(TT_COLS, rows)); } };
  window.JSLProductsExporters = EXPORTERS;   /* tiktok + square exporters register here (products-export.js) */

  /* ---------- WhatsApp hand-offs to Tab ---------- */
  function pushMsg(ps) {
    return "Products: push to Shopify as DRAFTS (" + ps.length + ")\n" + ps.map((p) => p.id + " " + (S.status[p.id] === "active" ? "A " : "") + (S.useRw[p.id] === false ? "orig " : "") + p.variants.map((v) => { const e = eff(p, v); return (e.price != null ? e.price.toFixed(2) : "-") + (e.compare_at ? "/" + e.compare_at.toFixed(2) : ""); }).join(",")).join("\n");
  }

  /* ---------- sheet ---------- */
  function sheet(html, onMount) {
    const old = $("prdsheet"); if (old) old.remove();
    const w = document.createElement("div"); w.className = "sheet-wrap"; w.id = "prdsheet";
    w.innerHTML = `<div class="sheet prd-sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(w); document.body.classList.add("sheet-open");
    const close = () => { w.remove(); document.body.classList.remove("sheet-open"); document.removeEventListener("keydown", k); };
    const k = (e) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", k);
    w.addEventListener("click", (e) => { if (e.target === w || e.target.closest("[data-close]")) close(); });
    if (onMount) onMount(w, close);
    return close;
  }

  /* ---------- views ---------- */
  let seg = "products", q = "", supF = "", onlySel = false, limit = 40;
  const show = (html) => { app.innerHTML = `<div class="view prd">${html}</div>`; fitBar(); };
  /* sticky section bar sits right under the app's top bar; the selected tab is scrolled into view so it never hides off-screen */
  function fitBar() {
    const top = document.querySelector(".top"); if (top) document.documentElement.style.setProperty("--prd-top", Math.round(top.getBoundingClientRect().height) + "px");
    requestAnimationFrame(() => { const b = document.querySelector('.prd-seg [aria-selected="true"]'); if (b) { const bar = b.parentNode; bar.scrollLeft = Math.max(0, b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2); } });
  }
  function setTab() {
    document.querySelectorAll(".menu a").forEach((a) => a.toggleAttribute("aria-current", false));
    const a = document.querySelector('.menu a[data-tab="products"]'); if (a) a.setAttribute("aria-current", "page");
    const pn = $("page-name"); if (pn) pn.textContent = "Products";
  }
  const pendingChanges = () => (CAT.changes || []).filter((c) => c.status === "pending" && !S.dec[c.id] && !S.hidden[c.pid]);
  const unsentDec = () => Object.keys(S.dec).filter((id) => !S.sentDec[id]);

  function head() {
    const nP = visible().length, nR = pendingChanges().length, nO = (CAT.orders || []).length;
    const b = (k, t) => `<button type="button" role="tab" data-seg="${k}" aria-selected="${seg === k}">${t}</button>`;
    return `<div class="pagehead"><h1>Products</h1></div>
      <div class="seg full prd-seg" role="tablist" aria-label="Products sections">${b("products", "Products" + (nP ? `<i class="prd-n">${nP}</i>` : ""))}${b("review", "Review" + (nR ? `<i class="prd-n prd-n--hot">${nR}</i>` : ""))}${b("pricing", "Pricing")}${b("orders", "Orders" + (nO ? `<i class="prd-n">${nO}</i>` : ""))}</div>
      ${seg !== "products" ? "" : `<form class="card prd-import" id="pimp" autocomplete="off">
        <label for="purl"><b>Import from a supplier</b><small>Paste a store, collection or product link, or a CSV / Google Sheet link</small></label>
        <div class="prd-import__row"><input id="purl" type="url" inputmode="url" placeholder="https://supplier.com/collections/necklaces" required><button class="btn primary" type="submit">Import</button></div>
        <p class="prd-fine">Works with Shopify stores, Trendsi, NewFrescos, WooCommerce and most product pages${CAT.sources_note ? " · " + esc(CAT.sources_note) : ""}. Tab imports it and it shows up here.</p>
      </form>`}`;
  }
  function wireHead() {
    if ($("pimp")) $("pimp").addEventListener("submit", (e) => { e.preventDefault(); const u = $("purl").value.trim(); if (!/^https?:\/\//i.test(u)) return toast("Paste a full link (https://…)");
      window.open(wa("Products: import " + u), "_blank", "noopener"); toast("Opening WhatsApp — send it and Tab imports"); });
    document.querySelectorAll("[data-seg]").forEach((x) => x.addEventListener("click", () => { seg = x.dataset.seg; location.hash = seg === "products" ? "#/products" : "#/products/" + seg; }));
  }

  function rowHTML(p) {
    const v0 = p.variants[0] || {}, e = eff(p, v0), m = margin(e.price, e.cost);
    const prices = p.variants.map((v) => eff(p, v).price).filter((x) => x != null), lo = Math.min(...prices), hi = Math.max(...prices);
    const oos = p.variants.every((v) => v.available === false);
    const nv = p.variants.length, opt = (p.options || []).map((o) => o.values.length + " " + o.name.toLowerCase() + (o.values.length === 1 ? "" : "s")).join(" · ");
    const alt = (CAT.alternatives || {})[p.id];
    return `<div class="prd-row${S.sel[p.id] ? " is-sel" : ""}${oos ? " is-oos" : ""}">
      <label class="prd-ck"><input type="checkbox" data-sel="${esc(p.id)}"${S.sel[p.id] ? " checked" : ""} aria-label="Select ${esc(title(p))}"><span aria-hidden="true"></span></label>
      <a class="prd-row__a" href="#/products/p/${encodeURIComponent(p.id)}">
        ${thumb(imgOf(p))}
        <span class="prd-row__t"><b>${esc(title(p))}</b>
          <small>${esc(p.source.supplier || host(p.source.url))}${opt ? " · " + esc(opt) : nv > 1 ? " · " + nv + " variants" : ""}${oos ? " · <em>out of stock</em>" : ""}${alt && alt.length ? " · " + alt.length + " other suppliers" : ""}</small>
          <span class="prd-money"><b>${prices.length ? (lo === hi ? usd(lo) : usd(lo) + "–" + usd(hi)) : "—"}</b>${e.compare_at ? `<s>${usd(e.compare_at)}</s>` : ""}<i>cost ${usd(e.cost)}${m != null ? " · " + m + "%" : ""}</i></span></span>
        <span class="chev" aria-hidden="true">›</span></a></div>`;
  }

  function viewProducts() {
    const all = visible(); const sups = [...new Set(all.map((p) => p.source.supplier || host(p.source.url)))].sort();
    let list = all.filter((p) => (!supF || (p.source.supplier || host(p.source.url)) === supF) && (!onlySel || S.sel[p.id]) && (!q || (title(p) + " " + p.title + " " + (p.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase())));
    const nSel = selected().length;
    const last = (CAT.imports || []).slice(-1)[0];
    show(head() + `
      ${all.length ? `<div class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input class="search" type="search" id="pq" placeholder="Search imported products…" value="${esc(q)}" aria-label="Search products"></div>
      <div class="chips" role="group" aria-label="Filter"><button class="chip" id="pall" aria-pressed="${!onlySel && !supF}">All<span class="n">${all.length}</span></button><button class="chip" id="psel" aria-pressed="${onlySel}">Picked<span class="n">${nSel}</span></button>${sups.length > 1 ? sups.map((s) => `<button class="chip" data-sup="${esc(s)}" aria-pressed="${supF === s}">${esc(s)}</button>`).join("") : ""}</div>
      <div class="prd-bulk card${nSel ? " on" : ""}" id="pbulk">
        <div class="prd-bulk__top"><label class="prd-ck"><input type="checkbox" id="pselall"${list.length && list.every((p) => S.sel[p.id]) ? " checked" : ""} aria-label="Pick all shown"><span aria-hidden="true"></span></label><b>${nSel ? nSel + " picked" : "Pick products to price + export"}</b>${S.undo.length ? `<button class="btn small" id="pundo" type="button">↶ Undo</button>` : ""}</div>
        ${nSel ? `<div class="prd-bulk__acts"><button class="btn small" id="prule" type="button">Price rule</button><button class="btn small" id="pstat" type="button">Status</button><button class="btn small primary" id="pexp" type="button">Export</button><button class="btn small" id="ppush" type="button">Push drafts</button><button class="btn small" id="phide" type="button">Remove</button></div>` : ""}
      </div>
      <div class="prd-list" id="plist">${list.slice(0, limit).map(rowHTML).join("") || '<p class="empty">No products match.</p>'}</div>
      ${list.length > limit ? `<button class="btn full" id="pmore" type="button">Show ${Math.min(40, list.length - limit)} more</button>` : ""}
      ${last ? `<p class="prd-fine center">Last import ${esc(new Date(last.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${esc(host(last.src) || "file")}${last.ok === false ? " · " + esc(last.error || "failed") : " · " + (last.added || 0) + " new"}</p>` : ""}`
      : `<div class="card prd-empty"><p><b>No products yet.</b></p><p class="prd-fine">Paste a supplier link above (or text it to Tab). Tab pulls titles, photos, every colour/size, cost and compare-at, rewrites the listing in your voice and prices it with your rule. Then pick what you want and export to Shopify or TikTok Shop.</p></div>`}`);
    wireHead();
    const rer = () => { const y = window.scrollY; viewProducts(); window.scrollTo(0, y); };
    const pq = $("pq"); if (pq) pq.addEventListener("input", debounce(() => { q = pq.value; limit = 40; const y = window.scrollY; viewProducts(); window.scrollTo(0, y); const n = $("pq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
    on("pall", () => { onlySel = false; supF = ""; rer(); }); on("psel", () => { onlySel = !onlySel; rer(); });
    document.querySelectorAll("[data-sup]").forEach((b) => b.addEventListener("click", () => { supF = supF === b.dataset.sup ? "" : b.dataset.sup; rer(); }));
    document.querySelectorAll("[data-sel]").forEach((c) => c.addEventListener("change", () => { if (c.checked) S.sel[c.dataset.sel] = true; else delete S.sel[c.dataset.sel]; save(); rer(); }));
    const sa = $("pselall"); if (sa) sa.addEventListener("change", () => { list.forEach((p) => { if (sa.checked) S.sel[p.id] = true; else delete S.sel[p.id]; }); save(); rer(); });
    on("pmore", () => { limit += 40; rer(); }); on("pundo", undo);
    on("prule", () => ruleSheet(selected(), rer)); on("pexp", () => exportSheet(selected())); on("ppush", () => pushSheet(selected())); on("pstat", () => statusSheet(selected(), rer));
    on("phide", () => { const ps = selected(); if (!confirm("Remove " + ps.length + " product(s) from this list? (Tab keeps a copy; you can ask to restore.)")) return; ps.forEach((p) => { S.hidden[p.id] = true; delete S.sel[p.id]; }); save(); rer(); toast("Removed " + ps.length); });
  }
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function ruleOptions(cur) { return rules().map((r) => `<option value="${esc(r.id)}"${r.id === cur ? " selected" : ""}>${esc(r.name)}</option>`).join(""); }
  const ruleText = (r) => (r.basis === "landed" ? "(cost + shipping)" : "cost") + " × " + r.mult + (+r.add ? " + $" + r.add : "") + (r.ending && r.ending !== "none" ? ", ends " + r.ending : "") + (r.compare === "mult" ? ", compare-at × " + r.compare_mult : r.compare === "supplier" ? ", compare-at = supplier MSRP" : ", no compare-at") + (+r.min ? ", min $" + r.min : "");
  function ruleSheet(ps, rer) {
    const cur = S.defRule || CAT.default_rule || rules()[0].id;
    const prev = (rid) => { const r = ruleBy(rid); let n = 0; const rows = []; ps.forEach((p) => p.variants.forEach((v) => { const e = eff(p, v); const [np, nc] = priceWith(r, e.cost, shipOf(p), v.supplier_compare_at); if (np !== e.price || nc !== e.compare_at) n++; if (rows.length < 6) rows.push(`<tr><td><span class="prd-tcell">${thumb(imgOf(p, vk(v)), "prd-thumb--xs")}<span>${esc(title(p).slice(0, 38))}${p.variants.length > 1 ? " <small>" + esc((v.options || []).join(" / ")) + "</small>" : ""}</span></span></td><td>${usd(e.cost)}</td><td>${usd(e.price)}</td><td><b>${usd(np)}</b>${nc ? `<small> / ${usd(nc)}</small>` : ""}</td></tr>`); })); return `<p class="sheet-note">${esc(ruleText(r))}</p><table class="prd-tbl"><thead><tr><th>Product</th><th>Cost</th><th>Now</th><th>New</th></tr></thead><tbody>${rows.join("")}</tbody></table><p class="prd-fine">${n} price${n === 1 ? "" : "s"} change across ${ps.length} product${ps.length === 1 ? "" : "s"}. Undo puts them back.</p>`; };
    sheet(`<p class="eyebrow">Bulk price</p><h3>${ps.length} product${ps.length === 1 ? "" : "s"}</h3>
      <select id="rsel" aria-label="Pricing rule">${ruleOptions(cur)}</select><div id="rprev">${prev(cur)}</div>
      <div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" id="rgo" type="button">Apply</button></div>`, (w, close) => {
      $("rsel").addEventListener("change", () => { $("rprev").innerHTML = prev($("rsel").value); });
      $("rgo").addEventListener("click", () => { applyRuleTo(ps, $("rsel").value); close(); toast("Prices updated · Undo is on the list"); rer(); });
    });
  }
  function statusSheet(ps, rer) {
    sheet(`<p class="eyebrow">Status in the export</p><h3>${ps.length} product${ps.length === 1 ? "" : "s"}</h3><p class="sheet-note">Draft = imported hidden so you can check it in Shopify first. Active = live as soon as you import the file yourself. Tab's own pushes are always drafts.</p>
      <div class="actions"><button class="btn" id="sdr" type="button">Draft</button><button class="btn" id="sac" type="button">Active</button></div>`, (w, close) => {
      const set = (v) => { snapshot(ps.map((p) => p.id), "status → " + v); ps.forEach((p) => { if (v === "draft") delete S.status[p.id]; else S.status[p.id] = v; }); save(); close(); rer(); toast(ps.length + " set to " + v); };
      $("sdr").onclick = () => set("draft"); $("sac").onclick = () => set("active");
    });
  }
  function exportSheet(ps) {
    const ex = window.JSLProductsExporters;
    sheet(`<p class="eyebrow">Export</p><h3>${ps.length} product${ps.length === 1 ? "" : "s"} · ${(() => { const n = ps.reduce((m, p) => m + p.variants.length, 0); return n + " variant" + (n === 1 ? "" : "s"); })()}</h3>
      <div class="prd-exp">${Object.entries(ex).sort((a, b) => ["shopify", "tiktok", "square"].indexOf(a[0]) - ["shopify", "tiktok", "square"].indexOf(b[0])).map(([k, e]) => `<button class="prd-excard" type="button" data-ex="${k}"><span><b>${esc(e.label)}</b><small>${esc(e.note)}</small></span><span aria-hidden="true">⬇︎</span></button>`).join("")}</div>
      <div class="actions"><button class="btn" type="button" data-close>Close</button></div>`, (w) => {
      w.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { try { ex[b.dataset.ex].run(ps); toast("Downloaded " + ex[b.dataset.ex].label); } catch (e) { toast("Export failed: " + e.message); } }));
    });
  }
  function pushSheet(ps) {
    const sh = CAT.shopify || {};
    sheet(`<p class="eyebrow">Push to Shopify</p><h3>${ps.length} product${ps.length === 1 ? "" : "s"} as drafts</h3>
      <p class="sheet-note">${sh.connected ? "Tab creates them in your Shopify as <b>drafts</b> with these prices — nothing goes live until you publish them in Shopify." : "Shopify isn't connected to Tab yet. Send this anyway and Tab pushes the drafts the moment you connect — or use Export → Shopify CSV now."}</p>
      <div class="actions"><button class="btn" type="button" data-close>Cancel</button><a class="btn primary" id="pgo" href="${esc(wa(pushMsg(ps)))}" target="_blank" rel="noopener">Send to Tab</a></div>`, (w, close) => { $("pgo").addEventListener("click", () => setTimeout(close, 60)); });
  }

  function viewDetail(id) {
    const p = (CAT.products || []).find((x) => x.id === id);
    if (!p) { show(`<a class="back" href="#/products">‹ Products</a><p class="empty">That product isn't in the catalog anymore.</p>`); return; }
    const rw = p.rewrite || {}, useRw = S.useRw[p.id] !== false && !!p.rewrite, r = ruleBy(S.rule[p.id] || p.rule);
    const alts = (CAT.alternatives || {})[p.id] || [];
    const opts = p.options || [];
    const vrow = (v, i) => { const e = eff(p, v); const m = margin(e.price, e.cost); return `<tr${v.available === false ? ' class="oos"' : ""}><td><span class="prd-tcell">${thumb(v.image || (p.images || [])[0], "prd-thumb--xs")}<span>${opts.length ? esc((v.options || []).join(" / ")) : "—"}<small>${esc(skuOf(p, i, v))}</small></span></span></td><td>${usd(e.cost)}${v.supplier_compare_at ? `<small>MSRP ${usd(v.supplier_compare_at)}</small>` : ""}</td>
      <td><input class="prd-in" type="number" step="0.01" min="0" inputmode="decimal" data-vp="${i}" value="${e.price != null ? e.price.toFixed(2) : ""}" aria-label="Price"></td><td><input class="prd-in" type="number" step="0.01" min="0" inputmode="decimal" data-vc="${i}" value="${e.compare_at ? e.compare_at.toFixed(2) : ""}" aria-label="Compare-at price"></td>
      <td>${v.available === false ? "Out" : v.stock != null ? v.stock : "✓"}<small>${m != null ? m + "%" : ""}</small></td></tr>`; };
    show(`<a class="back" href="#/products">‹ Products</a>
      <div class="prd-gal">${(p.images || []).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("") || '<div class="prd-noimg">No photos</div>'}</div>
      <p class="eyebrow">${esc(p.source.supplier || host(p.source.url))} · ${esc(p.source.platform)}</p>
      <h1 class="prd-h">${esc(title(p))}</h1>
      ${p.rewrite ? `<div class="seg prd-rw" role="radiogroup" aria-label="Listing text"><button type="button" data-rw="1" aria-pressed="${useRw}">Your voice (AI)</button><button type="button" data-rw="0" aria-pressed="${!useRw}">Supplier original</button></div>` : ""}
      <div class="card prd-copy">${useRw ? `<div class="prd-body">${rw.body_html || ""}</div><p class="prd-seo"><b>SEO</b> ${esc(rw.seo_title || "")}<br><small>${esc(rw.seo_description || "")}</small></p>${rw.tags && rw.tags.length ? `<p class="prd-fine">Tags: ${esc(rw.tags.join(", "))}</p>` : ""}` : `<p><b>${esc(p.title)}</b></p><div class="prd-body">${p.body_html || ""}</div>`}</div>
      <p class="month">Variants + prices</p>
      <div class="prd-rulebar"><select id="dr" aria-label="Pricing rule">${ruleOptions(r.id)}</select><button class="btn small" id="drgo" type="button">Re-price</button>${S.undo.length ? `<button class="btn small" id="dundo" type="button">↶ Undo</button>` : ""}</div>
      <div class="prd-tblwrap"><table class="prd-tbl prd-vt"><thead><tr><th>${esc(opts.map((o) => o.name).join(" / ") || "Variant")}</th><th>Cost</th><th>Price</th><th>Compare-at</th><th>Stock</th></tr></thead><tbody>${p.variants.map(vrow).join("")}</tbody></table></div>
      ${p.shipping && (p.shipping.cost != null || p.shipping.days) ? `<p class="prd-fine">Supplier shipping: ${p.shipping.cost != null ? usd(p.shipping.cost) : "?"}${p.shipping.days ? " · " + esc(p.shipping.days) : ""}${p.shipping.moq > 1 ? " · min order " + p.shipping.moq : ""}</p>` : ""}
      <p class="month">Cheaper / faster suppliers</p>
      <div class="card">${alts.length ? `<table class="prd-tbl"><thead><tr><th>Supplier</th><th>Cost</th><th>Ships</th><th></th></tr></thead><tbody>${alts.slice(0, 8).map((a) => `<tr><td>${esc(a.platform)}${a.us ? ' <span class="pill s-approved"><i></i>US</span>' : ""}<small>${esc((a.title || "").slice(0, 60))}</small></td><td>${usd(a.price)}${a.landed != null ? `<small>landed ${usd(a.landed)}</small>` : ""}</td><td>${esc(a.ship_days || "?")}${a.moq > 1 ? `<small>MOQ ${a.moq}</small>` : ""}${a.rating ? `<small>★ ${a.rating}</small>` : ""}</td><td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Open</a>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="prd-fine">Not searched yet.</p>`}
        <a class="btn small" href="${esc(wa("Products: find cheaper " + p.id + " (" + title(p).slice(0, 60) + ")"))}" target="_blank" rel="noopener">${alts.length ? "Search again" : "Ask Tab to find cheaper suppliers"}</a></div>
      <div class="actions"><a class="btn" href="${esc(p.source.url)}" target="_blank" rel="noopener">Supplier page ↗</a><button class="btn" id="dsel" type="button">${S.sel[p.id] ? "✓ Picked" : "Pick for export"}</button></div>
      <p class="prd-fine">Imported ${esc((p.imported_at || "").slice(0, 10))} · supplier checked ${esc((p.checked_at || "").slice(0, 10))}${p.status === "supplier_removed" ? " · <b>supplier removed this listing</b>" : ""}</p>`);
    const rer = () => { const y = window.scrollY; viewDetail(id); window.scrollTo(0, y); };
    document.querySelectorAll("[data-rw]").forEach((b) => b.addEventListener("click", () => { S.useRw[p.id] = b.dataset.rw === "1"; if (S.useRw[p.id]) delete S.useRw[p.id]; save(); rer(); }));
    const setV = (i, key, val) => { snapshot([p.id], "edit price"); const v = p.variants[i]; const o = S.ov[p.id] = S.ov[p.id] || {}; o[vk(v)] = Object.assign({}, o[vk(v)], { [key]: val === "" ? null : Math.round(parseFloat(val) * 100) / 100 }); save(); };
    document.querySelectorAll("[data-vp]").forEach((inp) => inp.addEventListener("change", () => { setV(+inp.dataset.vp, "price", inp.value); toast("Price saved"); }));
    document.querySelectorAll("[data-vc]").forEach((inp) => inp.addEventListener("change", () => { setV(+inp.dataset.vc, "compare_at", inp.value); toast("Compare-at saved"); }));
    on("drgo", () => { applyRuleTo([p], $("dr").value); rer(); toast("Re-priced"); }); on("dundo", undo);
    on("dsel", () => { if (S.sel[p.id]) delete S.sel[p.id]; else S.sel[p.id] = true; save(); rer(); });
  }

  function viewReview() {
    const ch = pendingChanges(), byP = {};
    ch.forEach((c) => { (byP[c.pid] = byP[c.pid] || []).push(c); });
    const prod = (id) => (CAT.products || []).find((p) => p.id === id);
    const line = (c) => {
      const pp = prod(c.pid), vl = c.vkey && c.vkey !== "default" ? c.vkey.split("|").map((x, k) => (pp && pp.options && pp.options[k] ? pp.options[k].name + " " : "") + x).join(" / ") : "";
      const dir = c.field === "cost" && c.new > c.old ? "up" : c.field === "cost" ? "down" : "";
      const L = (k, v) => `<p class="prd-ch__l"><span>${k}</span><span>${v}</span></p>`;
      let rows = "";
      if (c.field === "cost") {
        rows = L("Cost", `${usd(c.old)} → <b class="prd-nv">${usd(c.new)}</b>`);
        if (c.proposed) { const pr = c.proposed, same = pr.old_price === pr.price;
          rows += L("Price", `${same ? `<b>${usd(pr.price)}</b>` : `${usd(pr.old_price)} → <b>${usd(pr.price)}</b>`}${pr.compare_at ? ` <span class="prd-ch__cmp">/ compare ${usd(pr.compare_at)}</span>` : ""}`); }
      } else rows = `<p class="prd-ch__l prd-ch__l--one">${c.field === "available" ? (c.new ? "Back in stock" : "<b>Out of stock</b> at supplier") : c.field === "stock" ? `Stock ${esc(c.old)} → <b>${esc(c.new)}</b>` : c.field === "listing" ? "<b>Supplier removed this listing</b>" : c.new === "added" ? "New variant at supplier" : "<b>Variant removed</b> at supplier"}</p>`;
      return `<li class="prd-ch ${dir}">
        <div class="prd-ch__top">${thumb(imgOf(pp, c.vkey))}<div class="prd-ch__t"><b>${esc(vl || (pp ? title(pp) : "Whole product"))}</b><small>${esc(new Date(c.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}${dir ? " · cost " + (dir === "up" ? "up" : "down") : ""}</small></div></div>
        <div class="prd-ch__rows">${rows}</div>
        <div class="prd-ch__b"><button class="btn primary" data-ap="${esc(c.id)}" type="button">Apply</button><button class="btn" data-ig="${esc(c.id)}" type="button">Ignore</button></div></li>`;
    };
    const uns = unsentDec();
    show(head() + `<p class="sub">Supplier price + stock changes Tab found. Nothing changes until you apply it. Cost changes come with a new price from that product's rule.</p>
      ${uns.length ? `<div class="card prd-send"><span><b>${uns.length} decision${uns.length === 1 ? "" : "s"} saved on this phone</b><small>Send them so Tab updates the master copy (and Shopify drafts, once connected).</small></span><a class="btn small primary" id="rsend" href="${esc(wa("Products: review\n" + (uns.filter((id) => S.dec[id] === "applied").length ? "apply " + uns.filter((id) => S.dec[id] === "applied").join(" ") + "\n" : "") + (uns.filter((id) => S.dec[id] === "ignored").length ? "ignore " + uns.filter((id) => S.dec[id] === "ignored").join(" ") : "")))}" target="_blank" rel="noopener">Send to Tab</a></div>` : ""}
      ${ch.length ? `<button class="btn full prd-rall" id="rall" type="button">Apply all ${ch.length}</button>` + Object.keys(byP).map((pid) => { const p = prod(pid), n = byP[pid].length; return `<div class="card prd-rv"><a class="prd-rv__h" href="#/products/p/${encodeURIComponent(pid)}">${thumb(imgOf(p))}<span class="prd-rv__t"><b>${esc(p ? title(p) : pid)}</b><small>${n} change${n === 1 ? "" : "s"}${p ? " · " + esc(p.source.supplier || host(p.source.url)) : ""}</small></span><span class="chev" aria-hidden="true">›</span></a><ul>${byP[pid].map(line).join("")}</ul></div>`; }).join("")
        : `<p class="empty">No supplier changes to review. ${CAT.monitor ? "Last check " + esc(new Date(CAT.monitor.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + "." : ""}</p>`}`);
    wireHead();
    const decide = (id, how) => {
      const c = (CAT.changes || []).find((x) => x.id === id); if (!c) return; S.dec[id] = how;
      if (how === "applied") { const p = prod(c.pid); const v = p && p.variants.find((x) => vk(x) === c.vkey);
        if (p && v && c.field === "cost") { snapshot([p.id], "apply cost change"); const o = S.ov[p.id] = S.ov[p.id] || {}; o[vk(v)] = Object.assign({}, o[vk(v)], { cost: c.new }, c.proposed ? { price: c.proposed.price, compare_at: c.proposed.compare_at } : {}); } }
    };
    document.querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", () => { decide(b.dataset.ap, "applied"); save(); viewReview(); toast("Applied"); }));
    document.querySelectorAll("[data-ig]").forEach((b) => b.addEventListener("click", () => { decide(b.dataset.ig, "ignored"); save(); viewReview(); }));
    on("rall", () => { ch.forEach((c) => decide(c.id, "applied")); save(); viewReview(); toast("Applied " + ch.length); });
    const rs = $("rsend"); if (rs) rs.addEventListener("click", () => { uns.forEach((id) => { S.sentDec[id] = Date.now(); }); save(); setTimeout(viewReview, 300); });
  }

  function viewPricing() {
    const def = S.defRule || CAT.default_rule;
    const usedBy = (r) => { const ps = visible().filter((p) => (S.rule[p.id] || p.rule || def) === r.id); if (!ps.length) return '<p class="prd-fine">Not on any product yet.</p>';
      return `<div class="prd-used">${ps.slice(0, 5).map((p) => `<a href="#/products/p/${encodeURIComponent(p.id)}" aria-label="${esc(title(p))}">${thumb(imgOf(p), "prd-thumb--xs")}</a>`).join("")}<small>${ps.length > 5 ? "+" + (ps.length - 5) + " · " : ""}on ${ps.length} product${ps.length === 1 ? "" : "s"}</small></div>`; };
    const ex = (r) => [2, 5, 10].map((c) => { const [p, cmp] = priceWith(r, c, 0, null); return usd(c) + " → " + usd(p) + (cmp ? " (" + usd(cmp) + ")" : ""); }).join(" · ");
    show(head() + `<p class="sub">Named pricing rules. Use them on many products at once (Products → pick → Price rule). When a supplier's cost changes, Tab proposes the new price from the product's rule in Review — you approve it.</p>
      ${rules().map((r) => `<div class="card prd-rule"><div class="prd-rule__h"><b>${esc(r.name)}</b>${r.id === def ? '<span class="pill s-approved"><i></i>Default</span>' : `<button class="btn small" data-def="${esc(r.id)}" type="button">Make default</button>`}</div><p class="prd-fine">${esc(ruleText(r))}</p><p class="prd-fine">${esc(ex(r))}</p>${usedBy(r)}<button class="btn small" data-edit="${esc(r.id)}" type="button">Edit</button></div>`).join("")}
      <button class="btn full" id="rnew" type="button">+ New rule</button>`);
    wireHead();
    document.querySelectorAll("[data-def]").forEach((b) => b.addEventListener("click", () => { S.defRule = b.dataset.def; save(); viewPricing(); }));
    document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => ruleEditor(ruleBy(b.dataset.edit))));
    on("rnew", () => ruleEditor(null));
  }
  function ruleEditor(r) {
    const x = Object.assign({ id: "", name: "", mult: 3, add: 0, ending: ".99", compare: "mult", compare_mult: 1.4, min: 0, basis: "cost" }, r || {});
    sheet(`<p class="eyebrow">${r ? "Edit rule" : "New rule"}</p><form id="rf" class="form prd-rf">
      <label class="full">Name<input id="rn" value="${esc(x.name)}" placeholder="Steel basics" required maxlength="40"></label>
      <label>Based on<select id="rb"><option value="cost"${x.basis === "cost" ? " selected" : ""}>Supplier cost</option><option value="landed"${x.basis === "landed" ? " selected" : ""}>Cost + shipping</option></select></label>
      <label>Multiply by<input id="rm" type="number" step="0.05" min="0.5" value="${esc(x.mult)}" inputmode="decimal"></label>
      <label>Then add $<input id="ra" type="number" step="0.5" min="0" value="${esc(x.add)}" inputmode="decimal"></label>
      <label>Ending<select id="re">${[[".99", ".99"], [".95", ".95"], [".00", "Whole dollar"], ["none", "Exact"]].map(([v, t]) => `<option value="${v}"${x.ending === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Compare-at<select id="rc"><option value="mult"${x.compare === "mult" ? " selected" : ""}>Price × …</option><option value="supplier"${x.compare === "supplier" ? " selected" : ""}>Supplier's MSRP</option><option value="none"${x.compare === "none" ? " selected" : ""}>None</option></select></label>
      <label>Compare × <input id="rcm" type="number" step="0.05" min="1" value="${esc(x.compare_mult || 1.3)}" inputmode="decimal"></label>
      <label>Minimum price $<input id="rmin" type="number" step="1" min="0" value="${esc(x.min || 0)}" inputmode="decimal"></label>
      <p class="full prd-fine" id="rx"></p>
      <div class="full actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`, (w, close) => {
      const read = () => ({ id: x.id || ($("rn").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rule-" + Date.now()), name: $("rn").value.trim() || "My rule", basis: $("rb").value, mult: +$("rm").value || 1, add: +$("ra").value || 0, ending: $("re").value, compare: $("rc").value, compare_mult: +$("rcm").value || 0, min: +$("rmin").value || 0 });
      const px = () => { const rr = read(); $("rx").textContent = "Cost $2 → " + usd(priceWith(rr, 2, 0)[0]) + " · $5 → " + usd(priceWith(rr, 5, 0)[0]) + " · $10 → " + usd(priceWith(rr, 10, 0)[0]); };
      w.querySelectorAll("input,select").forEach((i) => i.addEventListener("input", px)); px();
      $("rf").addEventListener("submit", (e) => { e.preventDefault(); const rr = read(); S.rules = (S.rules || []).filter((q2) => q2.id !== rr.id).concat([rr]); save(); close(); viewPricing();
        toast("Rule saved on this phone"); setTimeout(() => { if (confirm("Send this rule to Tab too, so supplier cost changes are re-priced with it?")) window.open(wa("Products: rule " + JSON.stringify(rr)), "_blank", "noopener"); }, 300); });
    });
  }

  function viewOrders() {
    const sh = CAT.shopify || {}, orders = CAT.orders || [];
    const prodBy = {}; (CAT.products || []).forEach((p) => { prodBy[p.id] = p; });
    show(head() + (orders.length ? `<p class="sub">Shopify orders mapped to the supplier product + variant. You place supplier orders yourself — Tab never buys.</p>
      <div class="actions"><button class="btn small primary" id="osheet" type="button">⬇︎ Supplier order sheet (CSV)</button></div>
      ${orders.map((o) => `<div class="card prd-ord"><div class="prd-ord__h"><b>${esc(o.name)}</b><small>${esc((o.created_at || "").slice(0, 10))} · ${esc(o.customer || "")} · ${esc(o.financial_status || "")}</small></div>
        <ul>${(o.lines || []).map((l) => { const p = prodBy[l.pid]; const vkey = p && l.variant ? ((p.variants || []).find((v) => [(v.options || []).join(" / "), (v.options || []).join(", "), (v.options || []).join("|")].includes(l.variant)) || {}).options : null; return `<li>${thumb(l.image || imgOf(p, vkey ? vkey.join("|") : ""))}<span><b>${esc(l.qty)}×</b> ${esc(l.title)}${l.variant ? " · " + esc(l.variant) : ""}<small>${p ? `→ ${esc(p.source.supplier || "")} · cost ${usd(l.cost)} · <a href="${esc(p.source.url)}" target="_blank" rel="noopener">supplier page</a>` : "<em>not matched to a supplier product</em>"}</small></span></li>`; }).join("")}</ul>
        <div class="prd-track"><input id="tr-${esc(o.id)}" placeholder="Tracking number" value="${esc((S.track[o.id] || {}).num || "")}"><select id="tc-${esc(o.id)}">${["USPS", "UPS", "FedEx", "DHL", "YunExpress", "4PX", "Other"].map((c) => `<option${(S.track[o.id] || {}).carrier === c ? " selected" : ""}>${c}</option>`).join("")}</select><button class="btn small" data-tsave="${esc(o.id)}" type="button">Save</button></div></div>`).join("")}
      ${Object.keys(S.track).length ? `<a class="btn full" href="${esc(wa("Products: tracking\n" + Object.entries(S.track).map(([id, t]) => (orders.find((o) => o.id === id) || {}).name + " " + t.carrier + " " + t.num).join("\n")))}" target="_blank" rel="noopener">Send tracking to Tab</a>` : ""}`
      : `<div class="card prd-empty"><p><b>${sh.connected ? "No open orders." : "Orders show up here once Shopify is connected to Tab."}</b></p><p class="prd-fine">Each Shopify order is matched to the supplier product and variant it came from, with the customer's shipping address, so you get a ready supplier order sheet (link, variant, qty, address). You place and pay supplier orders yourself — Tab never buys. Paste tracking numbers here and Tab adds them to the Shopify order as a fulfillment after you say go.</p></div>`));
    wireHead();
    on("osheet", () => { const cols = ["Order", "Date", "Customer", "Ship to", "Product", "Variant", "Qty", "Supplier", "Supplier link", "Supplier SKU", "Unit cost", "Line cost", "Tracking"]; const rows = []; orders.forEach((o) => (o.lines || []).forEach((l) => { const p = prodBy[l.pid]; rows.push({ Order: o.name, Date: (o.created_at || "").slice(0, 10), Customer: o.customer, "Ship to": o.ship_to, Product: l.title, Variant: l.variant, Qty: l.qty, Supplier: p ? p.source.supplier : "", "Supplier link": p ? p.source.url : "", "Supplier SKU": l.supplier_sku || "", "Unit cost": l.cost, "Line cost": l.cost != null ? (l.cost * l.qty).toFixed(2) : "", Tracking: (S.track[o.id] || {}).num || "" }); })); download("jaysteel-supplier-orders-" + new Date().toISOString().slice(0, 10) + ".csv", toCSV(cols, rows)); });
    document.querySelectorAll("[data-tsave]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.tsave; const num = $("tr-" + id).value.trim(); if (num) S.track[id] = { num, carrier: $("tc-" + id).value }; else delete S.track[id]; save(); viewOrders(); toast("Saved on this phone"); }));
  }

  function keyGate() {
    show(`<div class="pagehead"><h1>Products</h1></div><form class="card prd-key" id="pkey"><p><b>Unlock products</b></p><p class="prd-fine">Supplier costs are encrypted. Enter the app password once on this phone.</p><input id="pkpw" type="password" autocomplete="current-password" placeholder="App password" required><button class="btn primary full" type="submit">Unlock</button><p class="prd-fine" id="pkerr"></p></form>`);
    $("pkey").addEventListener("submit", async (e) => { e.preventDefault(); $("pkerr").textContent = "Unlocking…"; try { await load($("pkpw").value.trim(), true); render(); } catch (_) { $("pkerr").textContent = "That password didn't unlock it."; } });
  }

  let curHash = "products";
  function render(h) {
    if (h != null) curHash = h;
    setTab();
    if (!CAT) {
      if (NEEDKEY) return keyGate();
      show(`<div class="skel" aria-label="Loading products"><i></i><i></i><i></i></div>`);
      ensure().then(() => { if (!location.hash.startsWith("#/products")) return; if (CAT || NEEDKEY) render(); else show(`<div class="pagehead"><h1>Products</h1></div><p class="empty">Couldn't load products (${esc(LOADERR)}). Pull down to refresh.</p>`); });
      return;
    }
    const parts = curHash.split("/");
    if (parts[1] === "p" && parts[2]) return viewDetail(decodeURIComponent(parts.slice(2).join("/")));
    seg = ["review", "pricing", "orders"].includes(parts[1]) ? parts[1] : "products";
    if (seg === "review") return viewReview();
    if (seg === "pricing") return viewPricing();
    if (seg === "orders") return viewOrders();
    return viewProducts();
  }
  window.JSLProducts = { render, reload: () => ensure(true), refresh: () => ensure(true).then(() => { if (location.hash.startsWith("#/products")) render(); }) };
})();
