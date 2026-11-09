/* JAY STEEL JEWELRY · Market Logistics — "Market Day" redesign (Oct 22 2026)
   Data: data/events.json (edit that one file to add/change markets).
   Checklists + sales/expense tally are saved on this device (localStorage).
   Oct 20 2026: "Apply via Tab" hands an application to Tab over WhatsApp (Tab's number only). */
(function () {
  "use strict";
  const TZ = "America/New_York";
  const STORE_URL = "https://jaysteeljewelry.github.io/links/";   /* Nov 6 2026: the brand links page (no third-party store link) */
  const EDIT_URL = "https://github.com/JaySteelJewelry/jaysteel-market-logistics-app/edit/main/data/events.json";
  const STATUS = {
    approved: { label: "Approved", icon: "✅" },
    agreement: { label: "Agreement sent", icon: "📝" },
    pending: { label: "Pending", icon: "⏳" },
    tentative: { label: "Tentative", icon: "❓" },
    booked: { label: "On my calendar", icon: "📌" },
    conditional: { label: "Conditional", icon: "❓" },
    declined: { label: "Declined", icon: "❌" }
  };
  const EMAIL = "jaysteeljewelry@gmail.com";
  const DEFAULT_PACK = [
    "10×10 tent + 4 weights (30 lb/leg)", "Table(s) + tablecloth", "Jewelry displays, busts + trays", "Mirror",
    "Inventory: necklaces, bracelets, rings, earrings", "Price tags / price sign", "Card reader + phone charged",
    "Power bank + cables", "Cash box + change ($100 in small bills)", "QR code sign (store / IG)",
    "Business cards", "Bags / pouches + gift boxes", "Banner + zip ties", "Polishing cloth", "Water + snacks",
    "Receipts / resale certificate copy", "Chair"
  ];
  const app = document.getElementById("app");
  const ROOT = (window.JSL && window.JSL.root) || "";            /* "../" in the /preview/ copy */
  const USE_SW = !!(window.JSL && window.JSL.sw);                 /* the preview never registers a service worker */
  let DATA = null, filter = "upcoming", query = "", calMonth = null, calSel = null;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const fmt = (iso, opts) => parse(iso).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts));
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const t12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`; };
  const timeRange = (e) => e.start ? (e.end ? `${t12(e.start)}–${t12(e.end)}` : t12(e.start)) : "Time TBD";
  const whenText = (e) => {
    const d = fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const multi = e.endDate ? ` – ${fmt(e.endDate, { weekday: "short", month: "short", day: "numeric" })}` : "";
    return `${d}${multi} · ${timeRange(e)}${e.endDate ? " nightly" : ""}`;
  };
  const lastDay = (e) => e.endDate || e.date;
  const badge = (s) => `<span class="badge s-${esc(s)}">${esc((STATUS[s] || { label: s }).label)}</span>`;
  const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toFixed(2).replace(/\.00$/, "");
  const maps = (a) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(a);
  const amaps = (a) => "https://maps.apple.com/?daddr=" + encodeURIComponent(a);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("jsj." + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("jsj." + k, JSON.stringify(v)); } catch (_) { toast("Couldn't save on this device"); } }
  };
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const show = (html) => { app.innerHTML = `<div class="view">${html}</div>`; };

  /* ---------- menu (Nov 6 2026): ☰ opens a slide-in menu; closes on tap outside, Esc, or picking an item ---------- */
  (function menu() {
    const btn = document.getElementById("menu-btn"), nav = document.getElementById("menu"), scrim = document.getElementById("menu-scrim"), x = document.getElementById("menu-close");
    if (!btn || !nav) return;
    const set = (open) => {
      btn.setAttribute("aria-expanded", String(open)); nav.setAttribute("aria-hidden", String(!open)); nav.classList.toggle("open", open);
      scrim.hidden = !open; document.body.classList.toggle("menu-open", open);
      nav.querySelectorAll("a,button").forEach((el) => { el.tabIndex = open ? 0 : -1; });
      if (open) { const f = nav.querySelector("[aria-current]") || nav.querySelector("a"); f && f.focus(); } else btn.focus({ preventScroll: true });
    };
    set(false); btn.blur();
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    scrim.addEventListener("click", () => set(false)); x.addEventListener("click", () => set(false));
    nav.querySelectorAll("a").forEach((l) => l.addEventListener("click", () => set(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) set(false); });
    const out = document.getElementById("logout");
    if (out) out.addEventListener("click", () => {
      if (!confirm("Log out on this device? You'll need the password to open the app again.")) return;
      try { localStorage.removeItem("jsl-auth"); localStorage.removeItem("jshq_key_v1"); } catch (_) {}
      location.replace(location.pathname);
    });
  })();

  /* Nov 6 2026: one dark "Steel" theme (tokens in styles.css :root); the light/dark toggle was retired. */


  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const byId = (id) => DATA.events.find((e) => e.id === id);

  /* ---------- Apply via Tab (Oct 20 2026) ----------
     Static site, so the hand-off is a prefilled WhatsApp message to Tab's own number. Tab submits the application and
     the real status comes back in data/events.json. Applying is remembered on this device ("applied", same as Mark applied). */
  const TAB_WA = "12512765320";
  const APPLY_OK = ["open", "lead", "not-applied", "not_applied", "notapplied", "unapplied", "idea", "prospect"];
  const canApplyStatus = (s) => !s || APPLY_OK.includes(String(s).toLowerCase());
  const canApplyEvent = (e) => !e.paid && canApplyStatus(e.status);
  const slug = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const nameKey = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  /* names of everything already applied to / booked / decided, so a Find card for the same market hides its button */
  function knownKeys() {
    const ks = [];
    (DATA.events || []).forEach((e) => { if (!canApplyEvent(e)) ks.push(nameKey(e.name)); });
    (DATA.openApplications || []).forEach((o) => { if (!canApplyStatus(o.status)) ks.push(nameKey(o.name)); });
    return ks.filter((k) => k.length >= 8);
  }
  const alreadyKnown = (title, ks) => { const t = nameKey(title); return t.length >= 8 && ks.some((k) => t === k || t.startsWith(k + " ") || k.startsWith(t + " ")); };
  const sentMap = () => store.get("sentToTab", {});
  const isSent = (id) => !!sentMap()[id];
  /* Oct 20 2026: tapping Apply in the sheet = the same state as "Mark applied" (store key "applied"), plus the sent-to-Tab note.
     Older "⏳ Sent to Tab" entries are migrated to applied at start-up. Undo = the "✓ Applied" toggle on the Find card. */
  const appliedMap = () => store.get("applied", {});
  const isApplied = (id) => !!appliedMap()[id];
  function markApplied(id, when) { const a = appliedMap(); if (!a[id]) { a[id] = when || todayISO(); store.set("applied", a); } }
  function unmarkApplied(id) { const a = appliedMap(); delete a[id]; store.set("applied", a); const s = sentMap(); if (s[id]) { delete s[id]; store.set("sentToTab", s); } }
  function migrateSent() { const s = sentMap(), a = appliedMap(); let ch = false; Object.keys(s).forEach((id) => { if (!a[id]) { a[id] = String(s[id] || "").slice(0, 10) || todayISO(); ch = true; } }); if (ch) store.set("applied", a); }
  const appliedLabel = (id) => (isSent(id) ? "✅ Applied · sent to Tab" : "✅ Applied");
  function applyMsg(x) {
    return `APPLY ✅ ${x.name} — ${x.dates} — id:${x.id}${x.link ? " — " + x.link : ""}\nLuis sent from the JAY STEEL logistics app.`;
  }
  const applyURL = (x) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(applyMsg(x));
  const eventDates = (e) => fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + (e.endDate ? " – " + fmt(e.endDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
  const APPLY_REG = {};
  function applyBtn(x) {
    APPLY_REG[x.id] = x;
    if (isApplied(x.id) || isSent(x.id)) return `<p class="sent-tab" role="status"><span class="badge s-agreement">${appliedLabel(x.id)}</span></p>`;
    return `<button type="button" class="btn small primary apply-tab" data-apply="${esc(x.id)}" aria-label="Apply via Tab: ${esc(x.name)}">Apply via Tab</button>`;
  }
  function wireApply(root, rerender) {
    (root || app).querySelectorAll("[data-apply]").forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); const x = APPLY_REG[b.dataset.apply]; if (x) applySheet(x, b, rerender); }));
  }
  function applySheet(x, opener, rerender) {
    const old = document.getElementById("applysheet"); if (old) old.remove();
    const wrap = document.createElement("div"); wrap.className = "sheet-wrap"; wrap.id = "applysheet";
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="as-t" aria-describedby="as-d">
      <p class="eyebrow">Apply via Tab</p><h3 id="as-t">${esc(x.name)}</h3><p class="sub">${esc(x.dates)}</p>
      <p id="as-d" class="sheet-note">Tab will fill out and submit this application in your name. Fees are never paid automatically.</p>
      <div class="actions"><button type="button" class="btn" id="as-no">Cancel</button><a class="btn primary" id="as-yes" href="${esc(applyURL(x))}" target="_blank" rel="noopener">Apply</a></div></div>`;
    document.body.appendChild(wrap); document.body.classList.add("sheet-open");
    const close = () => { wrap.remove(); document.body.classList.remove("sheet-open"); document.removeEventListener("keydown", onKey); if (opener && document.body.contains(opener)) opener.focus(); };
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", (ev) => { if (ev.target === wrap) close(); });
    document.getElementById("as-no").onclick = close;
    document.getElementById("as-yes").addEventListener("click", () => {
      const m = sentMap(); m[x.id] = new Date().toISOString(); store.set("sentToTab", m); markApplied(x.id);
      setTimeout(() => { close(); toast("✅ Applied · sent to Tab"); const y = window.scrollY; if (rerender) rerender(); window.scrollTo(0, y); }, 60);
    });
    document.getElementById("as-yes").focus();
  }

  /* ---------- tally + checklist state ---------- */
  const tally = (id) => store.get("tally." + id, []);
  const totals = (rows) => rows.reduce((t, r) => { if (r.type === "sale") t.sales += r.amount; else t.exp += r.amount; return t; }, { sales: 0, exp: 0 });
  function checklist(id) {
    const saved = store.get("check." + id, null);
    if (saved) return saved;
    const tpl = store.get("packTemplate", DEFAULT_PACK);
    return tpl.map((text) => ({ text, done: false }));
  }


  /* ---------- Market Day redesign: time + shared bits ---------- */
  const IS_APPLE = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const dirURL = (a) => (IS_APPLE ? amaps(a) : maps(a));
  function nyOffsetMin(ms) {
    const g = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).forEach((p) => { g[p.type] = p.value; });
    return (Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute, +g.second) - ms) / 60000;
  }
  /* a wall-clock time in Jacksonville -> epoch ms (DST-safe) */
  function nyMs(iso, hm) {
    const [y, m, d] = iso.split("-").map(Number); const [h, mi] = (hm || "00:00").split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi); let t = guess - nyOffsetMin(guess) * 60000;
    const o2 = nyOffsetMin(t); t = guess - o2 * 60000; return t;
  }
  const ended = (e, now) => { const ld = lastDay(e), today = todayISO(); if (ld > today) return false; if (ld < today) return true; return e.end ? nyMs(ld, e.end) <= now : false; };
  const started = (e, now) => !!e.start && nyMs(e.date, e.start) <= now;
  function nextMarket() {
    const now = Date.now();
    const live = DATA.events.filter((e) => e.status !== "declined" && !ended(e, now));
    return live.find((e) => e.status !== "pending" && e.status !== "tentative") || live[0] || null;
  }
  const packStat = (id) => { const l = checklist(id); const d = l.filter((i) => i.done).length; return { done: d, total: l.length, pct: l.length ? Math.round((d / l.length) * 100) : 0 }; };
  const ring = (pct, inner) => `<span class="ring" style="--p:${pct}"><span>${inner}</span></span>`;
  const sec = (t, extra) => `<div class="sec"><h2>${t}</h2>${extra || ""}</div>`;
  const I = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.6v.2"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></svg>',
    cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>'
  };
  const statusPill = (s) => `<span class="pill s-${esc(s)}"><i></i>${esc((STATUS[s] || { label: s }).label)}</span>`;
  const shortDate = (iso) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });

  /* ---------- views ---------- */
  /* Nov 6 2026 IA: Markets = List · Find (opportunities); Home = Today · HQ */
  const subnav = (items, cur) => `<nav class="subnav" aria-label="Sections">${items.map(([h, t, k]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
  /* Nov 6 2026 IA fix (Luis: "links and tabs repeatedly are redundant"): ONE map, each thing in exactly one place.
     ☰ Dashboard · Markets · Find markets · Map · Calendar · Payments · Shop & Links · Settings · Log Out. No sub-tabs. */
  const TAB_OF = { hq: "today", booth: "list" };
  const TAB_NAME = { today: "Dashboard", list: "Markets", opp: "Find markets", map: "Map", cal: "Calendar", money: "Payments", products: "Products", links: "Shop & Links", settings: "Settings" };
  function setTab(name) {
    name = TAB_OF[name] || name;
    document.querySelectorAll(".menu a").forEach((a) => a.toggleAttribute("aria-current", false));
    const a = document.querySelector(`.menu a[data-tab="${name}"]`); if (a) a.setAttribute("aria-current", "page");
    const pn = document.getElementById("page-name"); if (pn) pn.textContent = TAB_NAME[name] || "";
    document.body.classList.toggle("booth", name === "booth");
  }

  /* one market on the chain timeline */
  function rowHTML(e, today) {
    const past = lastDay(e) < today;
    const d = parse(e.date);
    const late = !past && toPay(e) && e.payBy < today;
    return `<a class="row${past ? " past" : ""} s-${esc(e.status)}" href="#/e/${encodeURIComponent(e.id)}">
      <div class="date"><small>${fmt(e.date, { month: "short" }).toUpperCase()}</small><b>${d.getUTCDate()}</b><i>${fmt(e.date, { weekday: "short" }).toUpperCase()}</i></div>
      <div class="t"><p class="n">${esc(e.name)}</p><p class="m">${esc(timeRange(e))}${e.endDate ? " · thru " + esc(shortDate(e.endDate)) : ""} · ${esc(e.venue || e.address || "")}</p>
      <p class="b">${statusPill(e.status)}${e.fee ? `<span class="fee">${esc(e.fee)}</span>` : ""}${e.paid ? '<span class="pill s-paid"><i></i>Paid</span>' : ""}${late ? ' <span class="pill s-due"><i></i>Past due</span>' : ""}</p></div>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }

  const UPCOMING_OK = ["approved", "agreement", "booked"];
  const WAITING = ["pending", "tentative", "conditional"];


  /* ===== HQ inside the app (Nov 6 2026 merge) =====
     Data: JAY STEEL HQ's encrypted files (gzip + AES-256-GCM, key = PBKDF2-SHA256(password, salt, 600k)), still built by
     files/hq/build.py into the jaysteel-hq repo. Decrypted only on this device; the derived key (never the password) is kept
     in this browser like HQ's "Remember this device". Answers + the Payment reminders switch go on HQ's same signed channel. */
  const HQ_DIR = (window.JSL && window.JSL.hqDir) || "../jaysteel-hq/preview/data/";
  const HQ_KEY = "jshq_key_v1", K_ANS = "jshq2_answers_v1", K_SENT = "jshq_answers_sent_v1", K_REM = "jshq3_rem_pending_v1";
  const INBOX = "https://formsubmit.co/ajax/porchlight+hq@mail.tab.bot";   /* Tab's WhatsApp (TAB_WA above) is the fallback */
  const b64u = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64s = (u) => { let t = ""; new Uint8Array(u).forEach((x) => { t += String.fromCharCode(x); }); return btoa(t); };
  const hex = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const HQ = { key: null, data: {}, at: 0, showAll: false };
  async function hqOpen(blob, raw) {
    const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    let pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u(blob.iv) }, k, b64u(blob.ct));
    if (blob.z === "gzip") pt = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(pt));
  }
  const hqBlob = (n) => fetch(HQ_DIR + n + "?t=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  async function hqLoad(pw) {
    const first = await hqBlob("needs_you.json");
    let raw = null;
    if (pw) {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
      raw = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64u(first.salt), iterations: first.iter, hash: "SHA-256" }, base, 256);
    } else { const s = ld(HQ_KEY, null); if (s && s.salt === first.salt) raw = b64u(s.key).buffer; }
    if (!raw) return null;
    const needs = await hqOpen(first, raw);   /* throws on a wrong key */
    if (pw) sv(HQ_KEY, { salt: first.salt, key: b64s(raw) });
    HQ.key = raw; HQ.data["needs_you.json"] = needs;
    await Promise.all(["schedule.json", "agents.json", "stats.json"].map((n) => hqBlob(n).then((b) => hqOpen(b, raw)).then((d) => { HQ.data[n] = d; }).catch(() => {})));
    HQ.at = Date.now();
    return HQ.data;
  }
  async function hqPost(lines, ids) {
    const k = await crypto.subtle.importKey("raw", HQ.key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const tok = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("jshq-inbox-v1")));
    const k2 = await crypto.subtle.importKey("raw", new TextEncoder().encode(tok), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = hex(await crypto.subtle.sign("HMAC", k2, new TextEncoder().encode(lines.join("\n"))));
    const body = { _subject: "HQ answer" + (ids.length > 1 ? "s (" + ids.length + ")" : "") + ": " + ids.join(", ").slice(0, 120), message: lines.join("\n") + "\n\n" + ids.length + " answer(s) tapped in HQ at " + new Date().toISOString() + "\nsig: " + sig, _template: "box", _captcha: "false" };
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(INBOX, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: ctl.signal, keepalive: true, referrerPolicy: "origin", credentials: "omit" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "HTTP " + r.status);
    } finally { clearTimeout(tm); }
    const S = ld(K_SENT, {}), now = Date.now(); ids.forEach((id) => { S[id] = now; }); sv(K_SENT, S);
  }
  const waURL = (lines) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(lines.join("\n"));
  const ansLine = (id, a) => "HQ " + id + " \u2014 " + a.t + ": " + a.o.join(" + ") + (a.n ? " \u2014 " + a.n : "");
  const sendTimers = {};
  function queueSend(id) {
    clearTimeout(sendTimers[id]);
    const st = document.querySelector(`.need[data-id="${CSS.escape(id)}"] .need__st`); if (st) st.textContent = "Sending to Tab in 3 s… tap again to change";
    sendTimers[id] = setTimeout(async () => {
      const A = ld(K_ANS, {}), a = A[id]; if (!a || !a.o.length) return;
      const L = [ansLine(id, a)];
      try { await hqPost(L, [id]); delete A[id]; sv(K_ANS, A); toast("✓ Sent to Tab"); paintHQ(); }
      catch (e) { const s2 = document.querySelector(`.need[data-id="${CSS.escape(id)}"] .need__st`); if (s2) s2.innerHTML = `Couldn't reach Tab. Saved here · <a href="${esc(waURL(L))}" target="_blank" rel="noopener">send on WhatsApp</a>`; }
    }, 3000);
  }
  const dueTxt = (it) => { if (it.deadline_note) return it.deadline_note; if (!it.deadline) return ""; const d = new Date(dueISO(it) + "T12:00:00Z"); return isNaN(d) ? "" : "Due " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }; /* same ET day as auto-clear (a midnight-UTC deadline is that date) */
  function needCard(it) {
    const A = ld(K_ANS, {}), a = A[it.id] || { o: [] }, S = ld(K_SENT, {});
    const opts = (it.answer && it.answer.options) || [], multi = !!(it.answer && it.answer.multi);
    const sent = S[it.id] && !A[it.id] ? "✓ Sent to Tab " + new Date(S[it.id]).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) : "";
    return `<article class="need${a.o.length ? " need--on" : ""}${it._st === "overdue" ? " need--late" : ""}" data-id="${esc(it.id)}">
      <div class="need__h"><b>${esc(it.short_title || it.title)}</b>${it.count > 1 ? `<span class="pill">×${it.count}</span>` : ""}</div>
      ${it.why1 || it.why ? `<p class="need__why">${esc(it.why1 || it.why)}</p>` : ""}
      <div class="need__chips">${it._st === "overdue" ? `<span class="pill s-due"><i></i>Overdue</span>` : ""}${dueTxt(it) && it._st !== "overdue" ? `<span class="pill${it.deadline && new Date(it.deadline) < Date.now() + 3 * 864e5 ? " s-due" : ""}"><i></i>${esc(dueTxt(it))}</span>` : ""}${it.amount ? `<span class="pill">${esc(money(it.amount))}</span>` : ""}</div>
      ${it.action ? `<details class="need__more"><summary>Details</summary><p>${esc(it.why || "")}</p><p><b>Next:</b> ${esc(it.action)}</p></details>` : ""}
      ${opts.length ? `<div class="need__opts" role="${multi ? "group" : "radiogroup"}" aria-label="Answer">${opts.map((o) => `<button type="button" class="opt" data-o="${esc(o)}" ${multi ? `aria-pressed="${a.o.includes(o)}"` : `role="radio" aria-checked="${a.o.includes(o)}"`}>${esc(o)}</button>`).join("")}</div>` : ""}
      <div class="need__foot"><span class="need__st">${a.o.length ? "Answer saved on this phone" : sent}</span>${it.link ? `<a class="btn small" href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.link_label || "Open")}</a>` : ""}</div>
    </article>`;
  }
  function wireNeeds(box, items) {
    box.querySelectorAll(".need").forEach((c) => {
      const id = c.dataset.id, it = items.find((x) => x.id === id); if (!it) return;
      const multi = !!(it.answer && it.answer.multi);
      c.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
        const A = ld(K_ANS, {}), cur = A[id] || { t: it.short_title || it.title, o: [] }; const o = b.dataset.o;
        if (multi) cur.o = cur.o.includes(o) ? cur.o.filter((x) => x !== o) : cur.o.concat(o); else cur.o = cur.o[0] === o ? [] : [o];
        cur.t = it.short_title || it.title;
        if (cur.o.length) A[id] = cur; else delete A[id]; sv(K_ANS, A);
        c.querySelectorAll(".opt").forEach((x) => { const on = cur.o.includes(x.dataset.o); x.setAttribute(multi ? "aria-pressed" : "aria-checked", String(on)); });
        c.classList.toggle("need--on", cur.o.length > 0);
        if (cur.o.length) queueSend(id); else { clearTimeout(sendTimers[id]); c.querySelector(".need__st").textContent = ""; }
      }));
    });
  }

  /* auto-clear (Luis Nov 6): re-checked on every open, so stale asks vanish even before the next HQ build.
     Same rules as files/hq/autoclean.py: past-dated items go; an unpaid fee stays as "Overdue" until its event date passes. */
  const MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const RX_D = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*[-–]\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{1,2}))?\b/gi;
  const RX_REC = /\b(weekly|every|monthly|ongoing|(mon|tues|wednes|thurs|fri|satur|sun)days)\b/i;
  const RX_MONEY = /(💳|^\W*pay\b|\bpay \$|\binvoice\b|\brenew\b|\bowe[sd]?\b|\bbalance due\b)/i;
  const isoNear = (m, d, today) => { const t = parse(today); let best = null; [-1, 0, 1].forEach((k) => { const y = t.getUTCFullYear() + k; const c = new Date(Date.UTC(y, m - 1, d, 12)); if (c.getUTCMonth() !== m - 1) return; if (!best || Math.abs(c - t) < Math.abs(best - t)) best = c; }); return best ? best.toISOString().slice(0, 10) : null; };
  const textDates = (s, today) => { const out = []; String(s || "").replace(RX_D, (all, m1, d1, m2, d2) => { const a1 = isoNear(MON3[m1.slice(0, 3).toLowerCase()], +d1, today); if (a1) out.push(a1); if (d2) { const a2 = isoNear(MON3[(m2 || m1).slice(0, 3).toLowerCase()], +d2, today); if (a2) out.push(a2); } return all; }); return out; };
  const dueISO = (it) => { if (!it.deadline) return null; if (/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?(Z|\+00:00))?$/.test(it.deadline)) return String(it.deadline).slice(0, 10); /* midnight-UTC = a plain date, not the evening before */ const d = new Date(it.deadline); return isNaN(d) ? String(it.deadline).slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); };
  function needState(it, today) {
    const title = it.title || "";
    if (RX_REC.test(title)) return "keep";
    const td = textDates(title, today), due = dueISO(it);
    if (RX_MONEY.test(title) || RX_MONEY.test(String(it.id || "").replace(/-/g, " "))) {
      if (td.length) { const e = td.sort().pop(); if (e < today) return "clear"; return due && due < today ? "overdue" : "keep"; }
      return due && due < today ? "overdue" : "keep";
    }
    if (due && due < today) return "clear";   /* a passed answer/apply-by date makes the ask stale */
    const ds = td.length ? td : textDates(it.why, today).filter((x) => x >= today);
    const d = ds.length ? ds.sort().pop() : due;
    if (!d) return "keep";
    return d < today ? "clear" : "keep";
  }
  function paintHQ() {
    const box = document.getElementById("hqbox"); if (!box) return;
    const nd = HQ.data["needs_you.json"], today = todayISO();
    const items = ((nd && nd.items) || []).filter((x) => !x.expired).map((x) => Object.assign({}, x, { _st: needState(x, today) })).filter((x) => x._st !== "clear")
      .sort((p, q) => (q._st === "overdue") - (p._st === "overdue"));
    const shown = HQ.showAll ? items : items.slice(0, 5);
    box.innerHTML = items.length ? sec("Needs you", `<span class="more-link">${items.length} open</span>`) + `<div class="needs">${shown.map(needCard).join("")}</div>`
      + (items.length > 5 ? `<button class="btn full" type="button" id="needs-all">${HQ.showAll ? "Show top 5" : "Show all " + items.length}</button>` : "")
      : sec("Needs you") + `<div class="card"><p class="m" style="margin:0">Nothing needs you right now.</p></div>`;
    wireNeeds(box, items);
    const all = document.getElementById("needs-all"); if (all) all.onclick = () => { HQ.showAll = !HQ.showAll; paintHQ(); };
    const team = document.getElementById("hqteam"); if (team) team.innerHTML = teamHTML();
    const fol = document.getElementById("hqfol"); if (fol) fol.innerHTML = followersHTML();
  }
  /* Followers now live on Shop & Links (plain numbers, no repeat links); Tab's team lives in Settings. Never a store-platform row. */
  function followersHTML() {
    const stt = ((HQ.data["stats.json"] || {}).accounts || []).filter((s) => !/square/i.test(String(s.platform || "") + String(s.url || "")));
    return stt.length ? sec("Followers") + `<div class="fol">${stt.map((s) => `<div class="fol__i"><small>${esc(s.platform)}</small><b>${s.followers == null ? "—" : esc(s.followers)}</b>${s.followers_delta ? `<span class="m">${s.followers_delta > 0 ? "+" : ""}${esc(s.followers_delta)} this week</span>` : ""}</div>`).join("")}</div>` : "";
  }
  function teamHTML() {
    const ag = (HQ.data["agents.json"] || {}).agents || [];
    if (!ag.length) return "";
    const dot = (h) => `<span class="hdot h-${esc(h || "none")}"></span>`;
    return (ag.length ? `<h2 class="set-h">Tab's team</h2>` + `<div class="card team">${ag.map((x) => `<details class="team__r"><summary>${dot(x.health || (x.on ? "green" : "off"))}<span><b>${esc(x.name)}</b><small>${esc(x.cadence || "")}</small></span></summary><p class="m">${esc(x.what || "")}${x.health_why ? " · " + esc(x.health_why) : ""}${x.next_run ? " · next " + esc(new Date(x.next_run).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ })) : ""}</p></details>`).join("")}</div>` : "");
  }
  function hqUnlockForm(box, after) {
    box.innerHTML = sec("Needs you") + `<form class="card unlockhq" id="hqun"><p class="m" style="margin:0 0 10px">Enter your password once on this phone to show HQ here.</p>
      <input type="text" name="username" value="jaysteel-logistics" autocomplete="username" hidden>
      <div class="row2"><input class="search" type="password" id="hqpw" autocomplete="current-password" placeholder="Password" aria-label="Password" required><button class="btn primary" type="submit">Unlock</button></div><p class="m warn-text" id="hqerr"></p></form>`;
    document.getElementById("hqun").addEventListener("submit", async (ev) => {
      ev.preventDefault(); const v = document.getElementById("hqpw").value.trim();
      try { if (await hqLoad(v)) after(); } catch (_) { document.getElementById("hqerr").textContent = "That password didn't open HQ."; }
    });
  }
  function withHQ(paint) {
    if (HQ.key && Date.now() - HQ.at < 5 * 60000) { paint(); return; }
    if (HQ.key) paint();
    hqLoad().then((d) => { if (d) paint(); else { const b = document.getElementById("hqbox"); if (b) hqUnlockForm(b, paint); } })
      .catch(() => { const b = document.getElementById("hqbox"); if (b && !HQ.key) b.innerHTML = sec("Needs you") + `<div class="card"><p class="m" style="margin:0">HQ couldn't load. Pull down to refresh.</p></div>`; });
  }
  window.addEventListener("jshq-key", () => { HQ.at = 0; if (document.getElementById("hqbox")) withHQ(paintHQ); });
  const fillNeeds = () => withHQ(paintHQ);
  /* Payments: HQ's Payment reminders switch (same signed channel; "turning on/off…" until the next HQ build confirms) */
  function remState() {
    const d = HQ.data["schedule.json"], r = d && d.reminders; const on = r ? !!r.on : ((d && d.items) || []).some((x) => x.kind === "reminder");
    let P = ld(K_REM, null); if (P && (Date.now() - P.at > 12 * 36e5 || (P.to === "ON") === on)) { try { localStorage.removeItem(K_REM); } catch (_) {} P = null; }
    return { on: P ? P.to === "ON" : on, pending: !!P, next: r && r.next };
  }
  function paintRem() {
    const box = document.getElementById("rembox"); if (!box || !HQ.key) return;
    const s = remState();
    box.innerHTML = `<button type="button" class="swrow" role="switch" aria-checked="${s.on}" id="remsw"><span><b>Payment reminders</b><small>${s.pending ? (s.on ? "Turning on… Tab confirms on the next update" : "Turning off… Tab confirms on the next update") : s.on ? "WhatsApp nudge 3 days before a fee is due" + (s.next ? " · next " + esc(new Date(s.next).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })) : "") : "Off. Tab won't nudge you before fees are due"}</small></span><span class="tog" aria-hidden="true"></span></button>`;
    document.getElementById("remsw").onclick = async (ev) => {
      const b = ev.currentTarget, to = s.on ? "OFF" : "ON", L = ["HQ automation: Payment reminders \u2192 " + to]; b.disabled = true;
      try { await hqPost(L, ["automation-payment-reminders"]); sv(K_REM, { to, at: Date.now() }); toast("✓ Sent to Tab: reminders " + to.toLowerCase()); }
      catch (_) { toast("Couldn't reach Tab. Try again"); }
      paintRem();
    };
  }

  /* ===== TODAY: next-market countdown hero ===== */
  let tick = null;
  function viewToday() {
    setTab("today");
    const today = todayISO(), now = Date.now();
    const upcoming = DATA.events.filter((e) => lastDay(e) >= today && e.status !== "declined");
    const next = nextMarket();
    const approved = upcoming.filter((e) => UPCOMING_OK.includes(e.status)).length;
    const waiting = upcoming.filter((e) => WAITING.includes(e.status)).length;
    const due = dueItems(today), over = overdueItems(today);
    let hero = "";
    if (next) {
      const live = started(next, now) && !ended(next, now);
      const target = next.start ? nyMs(next.date, next.start) : nyMs(next.date, "00:00");
      const n = daysBetween(today, next.date);
      hero = `<section class="hero" aria-labelledby="hero-name">
        <div class="hero__top"><p class="kicker">${live ? '<span class="livedot"></span>Happening now' : n <= 0 ? "Today" : "Next market"}</p>${statusPill(next.status)}</div>
        <h1 class="hero__name" id="hero-name"><a href="#/e/${encodeURIComponent(next.id)}">${esc(next.name)}</a></h1>
        <p class="hero__when">${esc(fmt(next.date, { weekday: "long", month: "long", day: "numeric" }))}${next.endDate ? " – " + esc(shortDate(next.endDate)) : ""} · ${esc(timeRange(next))}</p>
        <p class="hero__where">${esc(next.venue || next.address || "")}</p>
        ${live || (n <= 0 && !next.start) ? `<div class="clock clock--now" role="timer"><b>${live ? "Open" : "Today"}</b><span>${live ? (next.end ? "until " + esc(t12(next.end)) : "go get 'em") : "start time not set"}</span></div>`
          : `<div class="clock" id="clock" data-t="${target}" role="timer" aria-live="off">${["Days", "Hrs", "Min", "Sec"].map((u) => `<div><b data-u="${u}">–</b><span>${u}</span></div>`).join("")}</div>
             ${next.start ? "" : `<p class="clock-note">Start time not set yet — counting to the day.</p>`}`}
        <div class="hero__acts">
          ${next.address ? `<a class="act act--gold" href="${esc(dirURL(next.address))}" target="_blank" rel="noopener">${I.pin}<span>Directions</span></a>` : `<a class="act" href="#/e/${encodeURIComponent(next.id)}">${I.pin}<span>No address</span></a>`}
          <a class="act" href="#/e/${encodeURIComponent(next.id)}">${I.info}<span>Details</span></a>
        </div>
      </section>`;
    } else hero = `<section class="hero hero--empty"><p class="kicker">Next market</p><h1 class="hero__name">Nothing booked yet</h1><p class="hero__where">Open ☰ › Find markets to look for the next one.</p></section>`;

    /* money due: one summary line; the full list lives on Payments only */
    const owe = over.concat(due);
    const feeNum = (s) => { const m = String(s || "").replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
    const sum = owe.reduce((a, e) => { const n = feeNum(e.fee); return n == null ? a : a + n; }, 0);
    const nextDue = owe.slice().sort((p, q) => String(p.payBy).localeCompare(String(q.payBy)))[0];
    const moneyHTML = sec("Money due") + (owe.length
      ? `<a class="card nodate${over.length ? " late" : ""}" href="#/money"><span><b>${owe.length} fee${owe.length === 1 ? "" : "s"} to pay${sum ? " · " + money(sum) : ""}${over.length ? ` · ${over.length} late` : ""}</b><small>Next: ${esc(nextDue.name)} · ${over.includes(nextDue) ? "was due" : "pay by"} ${esc(fmt(nextDue.payBy, { month: "short", day: "numeric" }))}</small></span><span class="chev" aria-hidden="true">›</span></a>`
      : `<div class="card"><p class="m" style="margin:0">Nothing due right now.</p></div>`);
    let html = `<div class="pagehead"><h1>Dashboard</h1></div><section id="hqbox" aria-live="polite"></section><div class="today">${hero}<div class="today__side">${moneyHTML}</div></div>` + footer();
    show(html);
    startClock();
    fillNeeds();
  }
  function startClock() {
    clearInterval(tick); const c = document.getElementById("clock"); if (!c) return;
    const t = +c.dataset.t; const cells = {}; c.querySelectorAll("[data-u]").forEach((b) => { cells[b.dataset.u] = b; });
    const paint = () => {
      if (!document.body.contains(c)) { clearInterval(tick); return; }
      let s = Math.max(0, Math.floor((t - Date.now()) / 1000));
      if (s === 0) { clearInterval(tick); setTimeout(route, 1000); }
      const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
      cells.Days.textContent = d; cells.Hrs.textContent = String(h).padStart(2, "0"); cells.Min.textContent = String(m).padStart(2, "0"); cells.Sec.textContent = String(s).padStart(2, "0");
    };
    paint(); tick = setInterval(paint, 1000);
  }
  /* "Confirmed / Waiting / No date yet" taps open Markets on that filter */
  function wireJumps() {
    app.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (ev) => {
      ev.preventDefault(); const j = a.dataset.jump;
      if (j === "nodate") filter = "nodate";
      else if (j === "approved") filter = DATA.events.some((e) => e.status === "approved" && lastDay(e) >= todayISO()) ? "approved" : "upcoming";
      else { const k = ["pending", "conditional", "tentative"].find((s) => DATA.events.some((e) => e.status === s && lastDay(e) >= todayISO())); filter = k || "upcoming"; }
      if (location.hash === "#/markets") viewList(); else location.hash = "#/markets";
    }));
  }

  /* ===== MARKETS: the chain timeline ===== */
  function viewList() {
    setTab("list");
    const today = todayISO();
    const upcoming = DATA.events.filter((e) => lastDay(e) >= today);
    const count = (k) => upcoming.filter((e) => e.status === k).length;
    const nOpen = (DATA.openApplications || []).length;
    const nPast = DATA.events.filter((e) => lastDay(e) < today).length;
    const chips = [["upcoming", "Upcoming", upcoming.length], ["past", "Past", nPast]].concat(nOpen ? [["nodate", "No date yet", nOpen]] : []);
    if (!chips.some((c) => c[0] === filter)) filter = "upcoming";
    let html = `<div class="pagehead"><h1>Markets</h1></div>
      <div class="searchbox">${'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'}<input class="search" type="search" id="q" placeholder="Search markets, places…" value="${esc(query)}" aria-label="Search markets" autocomplete="off"></div>
      <div class="chips" role="group" aria-label="Filter by status">${chips.map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}${n != null ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      <div id="listbody" aria-live="polite"></div>`;
    if (nOpen) {
      html += `<div id="openapps">${sec("Open applications · no date yet")}` + DATA.openApplications.map((o) => `<div class="card oa">
        <div class="oa__h"><span class="oa__ic" aria-hidden="true">${(STATUS[o.status] || {}).icon || "⏳"}</span><div><p class="oa__n">${esc(o.name)}</p><p class="m">${esc(o.when || "")}${o.fee ? " · " + esc(o.fee) : ""}</p></div>${statusPill(o.status)}</div>
        ${o.nextStep ? `<p class="oa__next"><span>Next step</span>${esc(o.nextStep)}</p>` : ""}${canApplyStatus(o.status) && !o.paid ? applyBtn({ id: o.id || slug(o.name), name: o.name, dates: o.when || "No date yet", link: o.link || o.url || "" }) : ""}</div>`).join("") + `</div>`;
    }
    html += footer();
    show(html);
    renderListBody();
    const oaBox = document.getElementById("openapps"); if (oaBox) wireApply(oaBox, viewList);
    app.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.f;
      app.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      renderListBody();
    }));
    const pc = app.querySelector('.chip[aria-pressed="true"]'); if (pc && pc.scrollIntoView && filter !== "upcoming") pc.scrollIntoView({ block: "nearest", inline: "center" });
    const q = document.getElementById("q");
    q.addEventListener("input", debounce(() => { query = q.value.trim(); renderListBody(); }, 160));
  }

  function renderListBody() {
    const box = document.getElementById("listbody"); if (!box) return;
    const today = todayISO();
    const ql = query.toLowerCase();
    let list = DATA.events.filter((e) => {
      const isPast = lastDay(e) < today;
      if (filter === "past") { if (!isPast) return false; }
      else if (filter !== "all" && isPast) return false;
      if (!["upcoming", "past", "all"].includes(filter) && e.status !== filter) return false;
      if (ql) { const hay = `${e.name} ${e.venue || ""} ${e.address || ""} ${e.notes || ""}`.toLowerCase(); if (!hay.includes(ql)) return false; }
      return true;
    });
    if (filter === "past") list = list.slice().reverse();
    let month = "";
    box.innerHTML = list.length ? `<div class="chain">${list.map((e) => {
      const m = fmt(e.date, { month: "long", year: "numeric" });
      const head = m !== month ? `<p class="month">${m}</p>` : ""; month = m;
      const past = lastDay(e) < today;
      const inner = !past && canApplyEvent(e) ? `${rowHTML(e, today)}<div class="applyrow">${applyBtn({ id: e.id, name: e.name, dates: eventDates(e), link: e.link || "" })}</div>` : rowHTML(e, today);
      return head + `<div class="link-item${past ? " is-past" : ""}"><span class="node" aria-hidden="true"></span>${inner}</div>`;
    }).join("")}</div>` : `<p class="empty">No markets match${query ? ` “${esc(query)}”` : ""}.</p>`;
    const oa = document.getElementById("openapps"); if (oa) oa.hidden = filter !== "nodate";
    box.hidden = filter === "nodate";
    wireApply(box, renderListBody);
  }

  /* To pay (Nov 6 2026, Luis: "this should not be here"): only CONFIRMED markets (approved / booked) that are not paid,
     never one he asked to hide (hideFromToPay). Conditional / pending / agreement-sent = not confirmed yet = don't pay. */
  const PAYABLE = ["approved", "booked"];
  /* showInToPay (Nov 6 2026, Luis: "i didnt tell you to take eagle landing off"): listed even before it is confirmed.
     Paid and hideFromToPay still win. */
  const toPay = (e) => !!e.payBy && e.paid !== true && !e.hideFromToPay && (PAYABLE.includes(e.status) || e.showInToPay === true);
  function dueItems(today) {
    return DATA.events.filter((e) => toPay(e) && e.payBy >= today)
      .sort((a, b) => a.payBy.localeCompare(b.payBy));
  }
  /* pay-by date already passed, still marked unpaid, market still ahead */
  function overdueItems(today) {
    return DATA.events.filter((e) => toPay(e) && e.payBy < today && lastDay(e) >= today)
      .sort((a, b) => a.payBy.localeCompare(b.payBy));
  }

  /* ===== CALENDAR ===== */
  function viewCalendar() {
    setTab("cal");
    const today = todayISO();
    if (!calMonth) calMonth = today.slice(0, 7);
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1, 12)); const startDow = first.getUTCDay();
    const daysIn = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    const map = {};
    DATA.events.forEach((e) => { let d = e.date; const end = lastDay(e); while (d <= end) { (map[d] = map[d] || []).push(e); const nd = parse(d); nd.setUTCDate(nd.getUTCDate() + 1); d = nd.toISOString().slice(0, 10); } });
    let cells = ""; for (let i = 0; i < startDow; i++) cells += `<div class="day out" aria-hidden="true"></div>`;
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${calMonth}-${String(d).padStart(2, "0")}`; const evs = map[iso] || [];
      cells += `<button class="day${iso === today ? " today" : ""}${iso === calSel ? " sel" : ""}${evs.length ? " has" : ""}${iso < today ? " gone" : ""}" data-d="${iso}" aria-label="${fmt(iso, { month: "long", day: "numeric" })}, ${evs.length} market${evs.length === 1 ? "" : "s"}">
        <span class="num">${d}</span><span class="dots">${evs.slice(0, 4).map((e) => `<i class="dot s-${e.status}"></i>`).join("")}</span></button>`;
    }
    const sel = calSel && map[calSel] ? map[calSel] : null;
    const monthEvents = DATA.events.filter((e) => e.date.startsWith(calMonth) || lastDay(e).startsWith(calMonth));
    show(`<div class="pagehead"><h1>Calendar</h1></div>
      <div class="card calcard"><div class="cal-head"><button class="iconbtn" id="prev" aria-label="Previous month">‹</button>
      <h2>${fmt(calMonth + "-01", { month: "long", year: "numeric" })}</h2><button class="iconbtn" id="nextm" aria-label="Next month">›</button></div>
      <div class="grid">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells}</div>
      <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span class="s-${k}"><i class="dot"></i><em>${v.label}</em></span>`).join("")}</div></div>
      <p class="month">${sel ? fmt(calSel, { weekday: "long", month: "long", day: "numeric" }) : "This month"}</p>
      <div class="list">${(sel || monthEvents).map((e) => rowHTML(e, today)).join("") || '<p class="empty">No markets this month.</p>'}</div>
      <button class="btn full" id="icsall" style="margin-top:16px">${I.cal} Add all upcoming to my phone calendar (.ics)</button>${footer()}`);
    app.querySelectorAll(".day[data-d]").forEach((b) => b.addEventListener("click", () => { calSel = calSel === b.dataset.d ? null : b.dataset.d; const y = window.scrollY; viewCalendar(); window.scrollTo(0, y); }));
    document.getElementById("prev").onclick = () => { calMonth = shiftMonth(calMonth, -1); calSel = null; viewCalendar(); };
    document.getElementById("nextm").onclick = () => { calMonth = shiftMonth(calMonth, 1); calSel = null; viewCalendar(); };
    document.getElementById("icsall").onclick = () => download("jaysteel-markets.ics", ics(DATA.events.filter((e) => lastDay(e) >= today)), "text/calendar");
  }
  const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

  function kv(ic, k, v) { return v ? `<div class="kv"><span class="ic" aria-hidden="true">${ic}</span><div><p class="k">${k}</p><p class="v">${v}</p></div></div>` : ""; }

  /* ===== ONE MARKET: a hang tag ===== */
  function viewEvent(id) {
    setTab("list");
    const e = byId(id);
    if (!e) { show(`<a class="back" href="#/markets">‹ All markets</a><p class="empty">That market isn't in the list anymore.</p>`); return; }
    const c = e.contact || {};
    const contact = [c.name && esc(c.name), c.email && (/@/.test(c.email) && !/\s/.test(c.email) ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : esc(c.email))].filter(Boolean).join("<br>");
    const paidLine = (e.status === "approved" || e.status === "agreement" || e.status === "conditional") ? (e.paid ? "✅ <b>Paid</b>" : "⚠️ Not paid yet") : "";
    const overdue = toPay(e) && e.payBy < todayISO() && lastDay(e) >= todayISO();
    const payBy = e.payBy && (overdue ? `<span class="pill s-due"><i></i>Past due</span> <span class="warn-text">was due ${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</span>` : `Pay by <b>${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</b>`);
    const pay = [e.fee && `<b>${esc(e.fee)}</b>${e.feeNote ? " · " + esc(e.feeNote) : ""}`, paidLine, e.booth && `Booth <b>${esc(e.booth)}</b>`, payBy, e.payHow && esc(e.payHow)].filter(Boolean).join("<br>");
    const today = todayISO(), n = daysBetween(today, e.date), past = lastDay(e) < today;
    show(`<a class="back" href="#/markets">‹ All markets</a>
      <article class="hangtag s-${esc(e.status)}">
        <span class="hangtag__hole" aria-hidden="true"></span>
        <div class="hangtag__top">${statusPill(e.status)}<span class="hangtag__count">${past ? "Past" : n <= 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days"}</span></div>
        <h1>${esc(e.name)}</h1><p class="when">${esc(whenText(e))}</p>${e.venue ? `<p class="hangtag__venue">${esc(e.venue)}</p>` : ""}
      </article>
      <div class="bigacts">
        ${e.address ? `<a class="act act--gold" href="${esc(dirURL(e.address))}" target="_blank" rel="noopener">${I.pin}<span>Directions</span></a>` : ""}
        <button class="act" id="ics" type="button">${I.cal}<span>Add to calendar</span></button>
        ${e.link ? `<a class="act" href="${esc(e.link)}" target="_blank" rel="noopener">${I.link}<span>Event site</span></a>` : ""}
      </div>
      ${lastDay(e) >= todayISO() && canApplyEvent(e) ? `<div class="apply-detail">${applyBtn({ id: e.id, name: e.name, dates: eventDates(e), link: e.link || "" })}</div>` : ""}
      ${e.headsUp ? `<div class="card heads">${kv("⚠️", "Heads up", esc(e.headsUp))}</div>` : ""}
      <div class="card info">
        ${kv("📍", "Where", `${esc(e.venue || "")}${e.address ? "<br>" + esc(e.address) : ""}`)}
        ${kv("💵", "Fee · how paid", pay)}
        ${kv("☎️", "Contact", contact)}
        ${kv("🧰", "Setup", e.setup && esc(e.setup))}
        ${kv("⛺", "Booth info", (e.boothInfo || e.booth_info) && esc(e.boothInfo || e.booth_info))}
        ${kv("⏰", "Apply by", (e.applyBy || e.registration_deadline) && esc(fmt(e.applyBy || e.registration_deadline, { weekday: "short", month: "short", day: "numeric" })))}
        ${kv("📋", "Requirements", (e.requirements || e.registration_requirements) && esc(e.requirements || e.registration_requirements))}
        ${kv("➡️", "Next step", e.nextStep && esc(e.nextStep))}
        ${kv("🏷️", "Status", e.approval && esc(e.approval))}
        ${kv("📝", "Notes", e.notes && esc(e.notes))}
      </div>
      ${sec("Sales &amp; expenses")}<div class="card" id="money"></div>${footer()}`);
    document.getElementById("ics").onclick = () => download(`${e.id}.ics`, ics([e]), "text/calendar");
    renderTally(e); wireApply(app, () => viewEvent(id));
    window.scrollTo(0, 0);
  }

  /* Nov 6 2026: the packing checklist / booth mode was removed at Luis's request (saved lists on the phone are left untouched). */

  let entryType = "sale";
  function renderTally(e) {
    const box = document.getElementById("money"); const rows = tally(e.id); const t = totals(rows);
    box.innerHTML = `<form class="form" id="tform">
        <div class="seg full" role="group" aria-label="Entry type"><button type="button" data-t="sale" aria-pressed="${entryType === "sale"}">+ Sale</button><button type="button" data-t="expense" aria-pressed="${entryType === "expense"}">− Expense</button></div>
        <input id="amt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Amount $" aria-label="Amount in dollars" required>
        <select id="method" aria-label="Payment method"><option>Card</option><option>Cash</option><option>Cash App / Zelle</option><option>Other</option></select>
        <input class="full" id="note" placeholder="${entryType === "sale" ? "What sold (e.g. Cuban link 20in)" : "What for (e.g. booth fee, parking)"}" maxlength="80" aria-label="Note">
        <button class="btn primary full" type="submit">Add ${entryType}</button></form>
      <div class="tot"><div><b class="pos">${money(t.sales)}</b><span>Sales</span></div><div><b class="neg">${money(t.exp)}</b><span>Expenses</span></div><div><b class="${t.sales - t.exp >= 0 ? "pos" : "neg"}">${money(t.sales - t.exp)}</b><span>Profit</span></div></div>
      <ul class="ledger">${rows.length ? rows.slice().reverse().map((r) => `<li><span>${esc(r.note || (r.type === "sale" ? "Sale" : "Expense"))}<small>${esc(r.method || "")} · ${esc(new Date(r.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</small></span><b class="${r.type === "sale" ? "pos" : "neg"}">${r.type === "sale" ? "+" : "−"}${money(r.amount)}</b><button class="x" data-rm="${r.at}" aria-label="Delete entry">×</button></li>`).join("") : '<li class="empty">No entries yet. Add sales as you go — totals update live.</li>'}</ul>
      <div class="actions" style="margin:10px 0 12px"><button class="btn small full" id="csv1">⬇︎ Export this market (CSV)</button></div>`;
    box.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { entryType = b.dataset.t; renderTally(e); }));
    document.getElementById("tform").addEventListener("submit", (ev) => {
      ev.preventDefault(); const amount = parseFloat(document.getElementById("amt").value);
      if (!(amount > 0)) { toast("Enter an amount"); return; }
      const l = tally(e.id); l.push({ type: entryType, amount: Math.round(amount * 100) / 100, method: document.getElementById("method").value, note: document.getElementById("note").value.trim(), at: Date.now() });
      store.set("tally." + e.id, l); renderTally(e); toast(entryType === "sale" ? "Sale added" : "Expense added");
    });
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Delete this entry?")) return; store.set("tally." + e.id, tally(e.id).filter((r) => String(r.at) !== b.dataset.rm)); renderTally(e); }));
    document.getElementById("csv1").onclick = () => download(`${e.id}-sales.csv`, toCSV([e]), "text/csv");
  }

  function toCSV(events) {
    const out = [["market", "date", "type", "amount", "method", "note", "time"].join(",")];
    events.forEach((e) => tally(e.id).forEach((r) => out.push([e.name, e.date, r.type, (r.type === "sale" ? r.amount : -r.amount).toFixed(2), r.method, r.note, new Date(r.at).toISOString()].map(csvCell).join(","))));
    return out.join("\n") + "\n";
  }

  function viewMoney() {
    setTab("money");
    const today = todayISO(); const due = dueItems(today), over = overdueItems(today);
    const withRows = DATA.events.map((e) => ({ e, t: totals(tally(e.id)), n: tally(e.id).length })).filter((x) => x.n);
    const all = withRows.reduce((a, x) => ({ sales: a.sales + x.t.sales, exp: a.exp + x.t.exp }), { sales: 0, exp: 0 });
    const dueRow = (e, late) => `<a class="payrow${late ? " late" : ""}" href="#/e/${encodeURIComponent(e.id)}"><span class="payrow__t"><b>${esc(e.name)}</b><small>${esc(e.fee || "")}${late ? " · still marked unpaid" : ""}</small></span><span class="payrow__d">${late ? "was due" : "pay by"}<b>${esc(fmt(e.payBy, { month: "short", day: "numeric" }))}</b></span></a>`;
    show(`<div class="pagehead"><h1>Payments</h1></div><p class="sub">Fees to pay, what's paid, and what each market made. Sales are saved on this phone.</p>
      <p class="month">To pay</p>
      <div class="card pays">${over.length || due.length ? over.map((e) => dueRow(e, true)).join("") + due.map((e) => dueRow(e, false)).join("") : '<p class="empty">Nothing due right now.</p>'}</div>
      ${(() => { const pd = DATA.events.filter((e) => e.paid && lastDay(e) >= today); return pd.length ? `<p class="month">Paid</p><div class="card pays">${pd.map((e) => `<a class="payrow" href="#/e/${encodeURIComponent(e.id)}"><span class="payrow__t"><b>${esc(e.name)}</b><small>${esc(e.fee || "")}</small></span><span class="payrow__d"><span class="pill s-paid"><i></i>Paid</span><b>${esc(fmt(e.date, { month: "short", day: "numeric" }))}</b></span></a>`).join("")}</div>` : ""; })()}
      <p class="month">All markets · totals</p>
      <div class="tot"><div><b class="pos">${money(all.sales)}</b><span>Sales</span></div><div><b class="neg">${money(all.exp)}</b><span>Expenses</span></div><div><b class="${all.sales - all.exp >= 0 ? "pos" : "neg"}">${money(all.sales - all.exp)}</b><span>Profit</span></div></div>
      <div class="card"><ul class="ledger">${withRows.length ? withRows.map((x) => `<li><a href="#/e/${encodeURIComponent(x.e.id)}">${esc(x.e.name)}<small>${esc(fmt(x.e.date, { month: "short", day: "numeric", year: "numeric" }))} · ${x.n} entr${x.n === 1 ? "y" : "ies"}</small></a><b class="${x.t.sales - x.t.exp >= 0 ? "pos" : "neg"}">${money(x.t.sales - x.t.exp)}</b><span></span></li>`).join("") : '<li class="empty">No sales logged yet — open a market and tap “+ Sale”.</li>'}</ul></div>
      <div class="actions"><button class="btn primary full" id="csvall">⬇︎ Export all sales &amp; expenses (CSV)</button>
        <button class="btn small" id="backup">Back up my data</button><label class="btn small" for="restore">Restore backup<input type="file" id="restore" accept="application/json" class="visually-hidden"></label></div>${footer()}`);
    document.getElementById("csvall").onclick = () => download(`jaysteel-sales-${today}.csv`, toCSV(DATA.events), "text/csv");
    document.getElementById("backup").onclick = () => {
      const dump = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("jsj.")) dump[k] = localStorage.getItem(k); }
      download(`jaysteel-logistics-backup-${today}.json`, JSON.stringify(dump, null, 1), "application/json");
    };
    document.getElementById("restore").addEventListener("change", (ev) => {
      const f = ev.target.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); Object.keys(d).forEach((k) => { if (k.startsWith("jsj.")) localStorage.setItem(k, d[k]); }); toast("Backup restored"); viewMoney(); } catch (_) { toast("That file isn't a backup"); } };
      r.readAsText(f);
    });
  }

  const ICONS = {"store": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z\"/><path d=\"M9 8V6a3 3 0 0 1 6 0v2\"/></svg>", "ig": "<svg viewBox=\"0 0 24 24\"><rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.2\" cy=\"6.8\" r=\".6\"/></svg>", "mail": "<svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"5.5\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M3.5 7l8.5 6 8.5-6\"/></svg>", "edit": "<svg viewBox=\"0 0 24 24\"><path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/></svg>"};
  function viewLinks() {
    setTab("links");
    const L = DATA.links || {};
    const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch (_) { return u; } };
    const card = (href, i, b, s, ext) => `<a class="linkcard" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}><span class="i" aria-hidden="true">${ICONS[i]}</span><span><b>${b}</b><small>${s}</small></span><span class="arrow" aria-hidden="true">›</span></a>`;
    const store = STORE_URL;
    /* Nov 6 2026 (Luis): the online store isn't open until inventory is loaded, so this points at the links page. */
    show(`<div class="pagehead"><h1>Shop &amp; Links</h1></div><p class="sub">Send customers here from the booth, Discord or socials.</p>
      ${card(store, "store", "Shop &amp; links", "jaysteeljewelry.github.io/links", true)}
      ${card(L.instagram || "https://www.instagram.com/jaysteeljewelry/", "ig", "Instagram", "@jaysteeljewelry", true)}
      ${card("mailto:" + EMAIL, "mail", "Email", EMAIL, false)}
      <section id="hqfol"></section>
      <div class="signoff"><picture><source srcset="${ROOT}assets/js-icon.webp" type="image/webp"><img src="${ROOT}assets/js-icon.png" alt="" width="256" height="244" loading="lazy"></picture><p class="wordmark">JAY STEEL JEWELRY</p></div>
      ${footer()}`);
    withHQ(() => { const f = document.getElementById("hqfol"); if (f) f.innerHTML = followersHTML(); });
  }

  /* Nov 9 2026: Find markets footer shows the newest scan/vetted date (ET), not the events-file date */
  const oppDay = () => { const t = [OPP && OPP.updated, OPP && OPP.vettedUpdated].filter(Boolean).map((s) => new Date(s.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"))).filter((x) => !isNaN(x)).sort((x, y) => y - x)[0];
    return t ? t.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null; };
  function footer(when) {
    const u = when || DATA.updated;
    return `<p class="fine"><span class="fine__rule" aria-hidden="true"></span>Updated ${esc(u ? fmt(u, { month: "short", day: "numeric", year: "numeric" }) : "")} · JAY STEEL JEWELRY</p>`;
  }


  /* ---------- opportunities ---------- */
  let OPP = null, oLimit = 25, oType = "all", oState = "", oCounty = "", oVendor = false, oQuery = "", oHideApplied = false;
  const TYPE_LABEL = { college: "🎓 College", tabling: "🪧 Tabling", city: "🏙️ City", county: "🏛️ County", market: "🛍️ Market" };
  function loadOpp(fresh) {
    const get = (f) => fetch(ROOT + "data/" + f + (fresh ? "?t=" + Date.now() : ""), { cache: fresh ? "no-store" : "no-cache" });
    return Promise.all([get("opportunities.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      get("opportunities_vetted.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)]).then(([d, v]) => mergeVetted(d, v));
  }
  /* Nov 6 2026: data/opportunities_vetted.json = events Tab's daily pipeline read on the organizer's own page (search 5:30, publish 5:50 AM ET).
     A vetted copy replaces the unverified row of the same event (same name + date); new ones are added. */
  function mergeVetted(d, v) {
    if (d) { const fl = (i) => !i.state || i.state === "FL"; d.items = (d.items || []).filter(fl); d.ongoing = (d.ongoing || []).filter(fl); d.sources = (d.sources || []).filter(fl); } /* Nov 9 2026: Florida only */
    if (!v || !d) return d;
    v = { ...v, items: (v.items || []).filter((i) => !i.state || i.state === "FL"), ongoing: (v.ongoing || []).filter((i) => !i.state || i.state === "FL") };
    d.ongoing = d.ongoing || [];
    const k = (i) => nameKey(i.title) + "|" + (i.date || "");
    const idx = new Map(); d.items.concat(d.ongoing).forEach((i) => { if (!idx.has(k(i))) idx.set(k(i), i); });
    const put = (x, list) => { const hit = idx.get(k(x));
      if (hit) { const keep = { id: hit.id, origin: hit.origin, firstSeen: hit.firstSeen }; Object.assign(hit, x, keep); if (hit.notes) hit.notes = String(hit.notes).replace(/^Unverified\.\s*/, ""); }
      else { list.push(x); idx.set(k(x), x); } };
    (v.items || []).forEach((x) => put(x, d.items)); (v.ongoing || []).forEach((x) => put(x, d.ongoing));
    d.items.sort((a, b) => (a.date || "").localeCompare(b.date || "") || String(a.title).localeCompare(String(b.title)));
    d.vettedUpdated = v.updated; return d;
  }
  /* ===== FIND v9 (Oct 24 2026): search + filters, better cards, ⭐ saved shortlist, one-lead detail page.
     Everything reads data/opportunities.json (+ events.json for "already booked"); saved list lives on this phone (jsj.savedOpp). ===== */
  let oFeeMax = null, oMonth = "", oFee = "", oDist = "", oStatus = "all", oSort = "date", oSeg = "browse";
  const BASE_MI = { /* rough driving miles from base (Southside Jax) — approximations, shown with "~" */
    "jacksonville": 0, "atlantic beach": 14, "neptune beach": 14, "jacksonville beach": 13, "ponte vedra beach": 20, "ponte vedra": 22,
    "orange park": 18, "fleming island": 24, "green cove springs": 32, "middleburg": 30, "yulee": 30, "fernandina beach": 40, "callahan": 35,
    "macclenny": 37, "hilliard": 45, "st. augustine (world golf village)": 27, "st. augustine": 37, "st. augustine beach": 42, "palatka": 55,
    "east palatka": 52, "palm coast": 60, "bunnell": 68, "flagler beach": 70, "ormond beach": 85, "daytona beach": 92, "port orange": 98,
    "deland": 105, "new smyrna beach": 105, "gainesville": 75, "atlanta": 345, "kennesaw": 365, "flowery branch": 360, "gainesville, ga": 365,
    /* Nov 6 2026: Georgia campus towns (rough driving miles, shown with "~") */
    "waycross, ga": 75, "brunswick, ga": 70, "douglas, ga": 110, "valdosta, ga": 130, "savannah, ga": 140, "statesboro, ga": 190, "swainsboro, ga": 205, "albany, ga": 205, "macon, ga": 235, "fort valley, ga": 250, "augusta, ga": 245, "milledgeville, ga": 255, "sandersville, ga": 230, "columbus, ga": 290, "morrow, ga": 335, "decatur, ga": 345, "marietta, ga": 360, "athens, ga": 360, "cartersville, ga": 385, "carrollton, ga": 395, "mount berry, ga": 405, "clarkesville, ga": 405, "dahlonega, ga": 410, "dalton, ga": 435 };
  const miles = (i) => { const c = String(i.city || "").toLowerCase().trim(); if (!c) return null;
    if (i.state === "GA" && BASE_MI[c + ", ga"] != null) return BASE_MI[c + ", ga"];
    if (BASE_MI[c] != null) return BASE_MI[c];
    const k = Object.keys(BASE_MI).filter((n) => c.startsWith(n)).sort((a, b) => b.length - a.length)[0]; return k ? BASE_MI[k] : null; };
  const milesText = (i) => { const m = miles(i); return m == null ? "" : m === 0 ? "In Jax" : "~" + m + " mi from base"; };
  const savedMap = () => store.get("savedOpp", {});
  const isSaved = (id) => !!savedMap()[id];
  function toggleSaved(id) { const s = savedMap(); if (s[id]) { delete s[id]; toast("Removed from Saved"); } else { s[id] = todayISO(); toast("⭐ Saved"); } store.set("savedOpp", s); }
  const feeNum = (i) => { if (!i.fee) return null; if (/\bfree\b/i.test(i.fee)) return 0; const m = String(i.fee).match(/\$\s?([\d,]+(?:\.\d+)?)/); return m ? Number(m[1].replace(/,/g, "")) : (/%/.test(i.fee) ? -1 : null); };
  const feeShort = (i) => { const n = feeNum(i); return n == null ? "" : n === 0 ? "Free" : n < 0 ? "% of sales" : "from $" + n; };
  /* deadline: an ISO date inside the text → days left; otherwise the organizer's words (Rolling, Sold out…) */
  function dl(i, today) {
    const t = String(i.deadline || ""); if (!t) return null;
    if (/sold out|closed|passed/i.test(t) && !/rolling/i.test(t)) return { kind: "closed", label: /sold out/i.test(t) ? "Sold out" : "Closed", text: t };
    const m = t.match(/(20\d\d)-(\d\d)-(\d\d)/);
    if (m && !/rolling/i.test(t.slice(0, 8))) { const iso = m[0], n = daysBetween(today, iso);
      if (n < 0 || /\bwas\b/i.test(t)) return { kind: "closed", label: "Deadline passed", text: t, iso };
      return { kind: n <= 7 ? "soon" : "open", label: n === 0 ? "Due today" : n === 1 ? "1 day left" : n + " days left", text: t, iso, n }; }
    if (/rolling|none|walk-in|anytime|before/i.test(t)) return { kind: "rolling", label: /walk-in/i.test(t) ? "Walk-in" : "Rolling", text: t };
    return { kind: "other", label: "Deadline", text: t };
  }
  const dlBadge = (d) => d ? `<span class="dl dl--${d.kind}" title="${esc(d.text)}">⏰ ${esc(d.label)}</span>` : "";
  const pub = (s) => String(s || "").replace(/100%\s*hand-?made/gi, "maker-only").replace(/hand-?made/gi, "maker-made"); /* public-page wording rule */
  const oppAll = () => (OPP ? OPP.items.concat(OPP.ongoing || []) : []);
  const oppById = (id) => oppAll().find((i) => i.id === id);
  const knownEvent = (i) => { const k = nameKey(i.title); if (k.length < 8) return null; return DATA.events.find((e) => { const n = nameKey(e.name); return n.length >= 8 && (n.includes(k) || k.includes(n)); }) || null; };
  const isNewOpp = (i, today) => i.origin !== "seed" && i.firstSeen >= new Date(parse(today) - 7 * 86400000).toISOString().slice(0, 10);
  function oppStatus(i, today) {
    const applied = isApplied(i.id), d = dl(i, today), ev = knownEvent(i);
    if (ev) return { k: "booked", label: "On your calendar" };
    if (applied) return { k: "applied", label: isSent(i.id) ? "Applied · sent to Tab" : "Applied" };
    if (d && d.kind === "closed") return { k: "closed", label: d.label };
    if (isNewOpp(i, today)) return { k: "new", label: "New this week" };
    return { k: "open", label: "Open" };
  }
  const stChip = (s) => `<span class="st st--${s.k}"><i></i>${esc(s.label)}</span>`;
  const starBtn = (i) => `<button class="star" type="button" data-star="${esc(i.id)}" aria-pressed="${isSaved(i.id)}" aria-label="${isSaved(i.id) ? "Remove from Saved" : "Save"}: ${esc(i.title)}">${isSaved(i.id) ? "★" : "☆"}</button>`;
  const oppDates = (i) => i.date ? fmt(i.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : (i.when || "Ongoing · apply anytime");
  function oppCard(i, today) {
    const s = oppStatus(i, today), d = dl(i, today), mi = milesText(i);
    const dateBox = i.date ? `<div class="date"><small>${fmt(i.date, { month: "short" }).toUpperCase()}</small><b>${parse(i.date).getUTCDate()}</b><i>${fmt(i.date, { weekday: "short" }).toUpperCase()}</i></div>` : `<div class="date"><small>ANY</small><b>∞</b><i>TIME</i></div>`;
    const where = [i.city && i.state ? `${i.city.replace(/\s*\(.*\)$/, "")}, ${i.state}` : "", mi].filter(Boolean).join(" · ");
    const n = i.date ? daysBetween(today, i.date) : null;
    return `<article class="opp opp2${s.k === "applied" || s.k === "closed" ? " dim" : ""}">
      <div class="row">${dateBox}<a class="t" href="#/o/${encodeURIComponent(i.id)}"><p class="n">${esc(pub(i.title))}</p>
        <p class="m">${esc(where)}</p>
        <p class="m">${esc([i.time, n != null && n >= 0 ? (n === 0 ? "Today" : n === 1 ? "Tomorrow" : "in " + n + " days") : ""].filter(Boolean).join(" · ") || (i.org || i.source))}</p></a>${starBtn(i)}</div>
      <div class="facts">${stChip(s)}${i.fee ? `<span class="fee">💵 ${esc(feeShort(i) || String(i.fee).slice(0, 24))}</span>` : '<span class="fee">💵 Fee not listed</span>'}${i.verified === false ? '<span class="badge s-pending">Unverified</span>' : i.verified === true ? '<span class="badge s-approved">✓ Verified</span>' : ""}${i.score != null ? `<span class="badge" title="Scout score">${esc(String(i.score))}/100</span>` : ""}${dlBadge(d)}${i.vendorMatch ? '<span class="badge s-booked">Vendor</span>' : ""}<span class="badge s-tentative">${esc((TYPE_LABEL[i.type] || i.type).replace(/^\S+ /, ""))}</span></div>
      <div class="actions"><a class="btn small" href="#/o/${encodeURIComponent(i.id)}">Details ›</a><button class="btn small" data-ap="${esc(i.id)}" aria-pressed="${isApplied(i.id)}">${isApplied(i.id) ? "✓ Applied" : "Mark applied"}</button></div>
    </article>`;
  }
  function wireOppCards(root, rerender) {
    root.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); toggleSaved(b.dataset.star); const y = window.scrollY; rerender(); window.scrollTo(0, y); }));
    root.querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", () => { if (isApplied(b.dataset.ap)) unmarkApplied(b.dataset.ap); else markApplied(b.dataset.ap); const y = window.scrollY; rerender(); window.scrollTo(0, y); }));
  }
  function needOpp(then) {
    if (OPP) return true;
    app.innerHTML = '<div class="skel" aria-label="Loading opportunities"><i></i><i></i><i></i></div>';
    loadOpp().then((d) => { OPP = d; then(); }).catch(() => { show('<p class="loading">Couldn\'t load opportunities right now. <a href="#/opportunities" onclick="location.reload();return false">Try again</a></p>'); });
    return false;
  }
  function viewOpp() {
    setTab("opp");
    if (!needOpp(() => { if (/opportunities|saved/.test(location.hash)) viewOpp(); })) return;
    if (/saved/.test(location.hash)) oSeg = "saved";
    const today = todayISO();
    const all = oppAll(), saved = savedMap();
    const nSaved = all.filter((i) => saved[i.id]).length;
    const counties = [...new Set(all.filter((i) => !oState || i.state === oState).map((i) => i.county).filter(Boolean))].sort();
    const months = [...new Set(OPP.items.filter((i) => i.date >= today).map((i) => i.date.slice(0, 7)))].sort();
    const feeOk = (i) => { if (!oFee) return true; const n = feeNum(i); if (oFee === "unknown") return n == null; if (n == null) return false;
      const cap = oFee === "custom" ? oFeeMax : /^u\d+$/.test(oFee) ? Number(oFee.slice(1)) : null; if (cap != null) return n >= 0 && n <= cap;
      return oFee === "free" ? n === 0 : oFee === "o100" ? n > 100 : oFee === "pct" ? n < 0 : true; };
    const distOk = (i) => { if (!oDist) return true; const m = miles(i); return m != null && m <= Number(oDist); };
    const statusOk = (i) => { if (oStatus === "all") return true; const s = oppStatus(i, today).k; return oStatus === "open" ? (s === "open" || s === "new") : oStatus === s; };
    const match = (i) => (oSeg !== "saved" || saved[i.id]) && (oType === "all" || i.type === oType) && (!oState || i.state === oState) && (!oCounty || i.county === oCounty)
      && (!oVendor || i.vendorMatch) && (!oHideApplied || !isApplied(i.id)) && (!oMonth || (i.date || "").slice(0, 7) === oMonth) && feeOk(i) && distOk(i) && statusOk(i)
      && (!oQuery || `${i.title} ${i.org || ""} ${i.city || ""} ${i.county || ""} ${i.source} ${i.fee || ""}`.toLowerCase().includes(oQuery.toLowerCase()));
    const sorter = (a, b) => { if (oSort === "fee") { const fx = (i) => { const n = feeNum(i); return n == null || n < 0 ? 1e9 : n; }; return fx(a) - fx(b) || (a.date || "").localeCompare(b.date || ""); }
      if (oSort === "score") return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || (a.date || "").localeCompare(b.date || "");
      if (oSort === "dist") { const x = miles(a), y = miles(b); return (x == null ? 9999 : x) - (y == null ? 9999 : y) || (a.date || "").localeCompare(b.date || ""); }
      if (oSort === "deadline") { const x = dl(a, today), y = dl(b, today); const kx = x && x.iso && x.kind !== "closed" ? x.iso : "9999", ky = y && y.iso && y.kind !== "closed" ? y.iso : "9999"; return kx.localeCompare(ky) || (a.date || "").localeCompare(b.date || ""); }
      return (a.date || "").localeCompare(b.date || ""); };
    const dated = OPP.items.filter((i) => i.date >= today || (oSeg === "saved" && saved[i.id])).filter(match).sort(sorter);
    const ongoing = (OPP.ongoing || []).filter(match).sort(oSort === "date" ? () => 0 : sorter);
    const nActive = [oMonth, oDist, oState, oCounty, oVendor, oHideApplied].filter(Boolean).length;
    const typeChips = [["all", "All"]].concat(Object.entries(TYPE_LABEL));
    const stChips = [["all", "All"], ["open", "Open"], ["new", "New"], ["applied", "Applied"], ["booked", "Booked"]];
    const sel = (id, label, opts, val) => `<label class="fsel"><span>${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    let html = `<div class="pagehead"><h1>Find markets</h1><div class="seg" role="tablist" aria-label="Browse or saved">
        <button role="tab" id="seg-b" aria-selected="${oSeg === "browse"}">Browse</button><button role="tab" id="seg-s" aria-selected="${oSeg === "saved"}">★ Saved${nSaved ? " · " + nSaved : ""}</button></div></div>
      ${oSeg === "saved" ? `<p class="sub">Your shortlist. Tap ☆ on any lead to keep it here; saved on this phone only.</p>` : `<p class="sub">Vendor calls, markets, college market days + city/county events across Florida.</p>`}
      <div class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input class="search" type="search" id="oq" placeholder="Search events, cities, organizers…" value="${esc(oQuery)}" aria-label="Search opportunities"></div>
      <div class="chips" role="group" aria-label="Status">${stChips.map(([k, l]) => `<button class="chip" data-os="${k}" aria-pressed="${oStatus === k}">${l}</button>`).join("")}</div>
      <div class="qrow">${sel("ofe", "Max fee", [["", "Any fee"], ["free", "Free"], ["u25", "≤ $25"], ["u50", "≤ $50"], ["u100", "≤ $100"], ["u150", "≤ $150"], ["custom", oFeeMax != null ? "≤ $" + oFeeMax + " (custom)" : "Custom max…"], ["o100", "Over $100"], ["pct", "% of sales"], ["unknown", "Not listed"]], oFee)}${sel("oso", "Sort", [["date", "Soonest first"], ["fee", "Fee: low → high"], ["dist", "Closest first"], ["score", "Score: high → low"], ["deadline", "Deadline first"]], oSort)}</div>
      <details class="filters"${nActive ? " open" : ""}><summary><span>Filters${nActive ? ` <b class="fcount">${nActive}</b>` : ""}</span></summary>
        <div class="chips" role="group" aria-label="Type">${typeChips.map(([k, l]) => `<button class="chip" data-ot="${k}" aria-pressed="${oType === k}">${l}</button>`).join("")}</div>
        <div class="fgrid">
          ${sel("odi", "Distance", [["", "Any distance"], ["25", "Within 25 mi"], ["50", "Within 50 mi"], ["75", "Within 75 mi"], ["120", "Within 120 mi"]], oDist)}
          ${sel("omo", "Month", [["", "Any month"]].concat(months.map((m) => [m, fmt(m + "-01", { month: "long", year: "numeric" })])), oMonth)}
          
          ${sel("oco", "County", [["", "All counties"]].concat(counties.map((c) => [c, c])), oCounty)}
        </div>
        <div class="chips"><button class="chip" id="ov" aria-pressed="${oVendor}">Vendor-friendly only</button><button class="chip" id="oh" aria-pressed="${oHideApplied}">Hide applied</button>${nActive ? '<button class="chip" id="oclr">Clear filters</button>' : ""}</div>
      </details>`;
    let month = "";
    html += `<p class="sub count">${dated.length} dated · ${ongoing.length} ongoing</p>`;
    if (oSeg === "saved" && !dated.length && !ongoing.length) html += `<div class="empty-saved"><p class="star-big" aria-hidden="true">☆</p><p><b>${nSaved ? "No saved leads match these filters." : "Nothing saved yet."}</b></p><p class="sub">${nSaved ? "Try clearing the search or filters." : "Tap ☆ on any lead in Browse to shortlist it here."}</p><a class="btn small" href="#/opportunities" id="gob">Browse leads</a></div>`;
    else {
      html += dated.length ? dated.slice(0, oLimit).map((i) => { const m = oSort === "date" ? (i.date < today ? "Past" : fmt(i.date, { month: "long", year: "numeric" })) : ""; const h = m && m !== month ? `<p class="month">${m}</p>` : ""; month = m || month; return h + oppCard(i, today); }).join("") : '<p class="empty">Nothing dated matches these filters.</p>';
      if (dated.length > oLimit) html += `<button class="btn full more" id="omore">Show ${Math.min(25, dated.length - oLimit)} more · ${dated.length - oLimit} left</button>`;
      if (ongoing.length) html += `<details class="panel" id="ongo"${oQuery || oSeg === "saved" ? " open" : ""}><summary>Ongoing &amp; annual · apply anytime (${ongoing.length})</summary>${ongoing.map((i) => oppCard(i, today)).join("")}</details>`;
    }
    const okSrc = OPP.sources.filter((s) => s.ok && s.items).length;
    html += `<details class="panel" style="margin-top:16px"><summary>Sources · last scan ${esc(OPP.updated.replace("T", " ").replace("Z", " UTC"))} · ${okSrc} of ${OPP.sources.length} returned items</summary>
      <ul class="ledger" style="margin-top:8px">${OPP.sources.map((s) => `<li><span>${esc(s.source)}<small>${s.ok ? (s.items ? s.items + (s.items === 1 ? " item" : " items") : "no matching events right now") : "couldn't read: " + esc((s.error || "").split(":")[0])}</small></span><b class="${s.ok ? "pos" : "neg"}">${s.ok ? "✓" : "✕"}</b><span></span></li>`).join("")}</ul>
      <p class="fine" style="text-align:left">Refreshes every 6 hours — not live. Miles are rough driving estimates. Always confirm details on the organizer's page.</p></details>` + footer(oppDay());
    show(html);
    const rr = () => viewOpp();
    wireOppCards(app, rr);
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el[ev] = fn; };
    on("seg-b", "onclick", () => { oSeg = "browse"; oLimit = 25; if (/saved/.test(location.hash)) location.hash = "#/opportunities"; else viewOpp(); });
    on("seg-s", "onclick", () => { oSeg = "saved"; oLimit = 25; viewOpp(); });
    on("gob", "onclick", (e) => { e.preventDefault(); oSeg = "browse"; oQuery = ""; location.hash = "#/opportunities"; viewOpp(); });
    on("omore", "onclick", () => { const y = window.scrollY; oLimit += 25; viewOpp(); window.scrollTo(0, y); });
    app.querySelectorAll("[data-ot]").forEach((b) => b.addEventListener("click", () => { oType = b.dataset.ot; oLimit = 25; viewOpp(); }));
    app.querySelectorAll("[data-os]").forEach((b) => b.addEventListener("click", () => { oStatus = b.dataset.os; oLimit = 25; viewOpp(); }));
    on("ost", "onchange", (e) => { oState = e.target.value; oCounty = ""; oLimit = 25; viewOpp(); });
    on("oco", "onchange", (e) => { oCounty = e.target.value; oLimit = 25; viewOpp(); });
    on("odi", "onchange", (e) => { oDist = e.target.value; oLimit = 25; viewOpp(); });
    on("omo", "onchange", (e) => { oMonth = e.target.value; oLimit = 25; viewOpp(); });
    on("ofe", "onchange", (e) => { let v = e.target.value;
      if (v === "custom") { const ans = prompt("Max vendor fee ($)", oFeeMax != null ? String(oFeeMax) : "75"); const n = ans == null ? NaN : Number(String(ans).replace(/[^\d.]/g, "")); if (ans != null && String(ans).trim() !== "" && isFinite(n)) oFeeMax = n; else v = oFee; }
      oFee = v; oLimit = 25; viewOpp(); });
    on("oso", "onchange", (e) => { oSort = e.target.value; oLimit = 25; viewOpp(); });
    on("ov", "onclick", () => { oVendor = !oVendor; oLimit = 25; viewOpp(); });
    on("oh", "onclick", () => { oHideApplied = !oHideApplied; oLimit = 25; viewOpp(); });
    on("oclr", "onclick", () => { oFeeMax = null; oMonth = oFee = oDist = oState = oCounty = ""; oVendor = oHideApplied = false; oLimit = 25; viewOpp(); });
    const q = document.getElementById("oq");
    q.addEventListener("input", debounce(() => { oQuery = q.value; const pos = q.selectionStart; oLimit = 25; viewOpp(); const nq = document.getElementById("oq"); nq.focus(); nq.setSelectionRange(pos, pos); }, 220));
  }

  /* ===== Nov 6 2026: Georgia campus vendor-day guide (lives inside Find markets, no menu item). Reads data/ga_guide.json. ===== */
  let GAG = null;
  function viewGaGuide() {
    setTab("opp");
    const back = `<a class="back" href="#/opportunities">‹ Find</a>`;
    if (!GAG) { app.innerHTML = '<div class="skel"><i></i><i></i></div>';
      fetch(ROOT + "data/ga_guide.json", { cache: "no-cache" }).then((r) => r.json()).then((g) => { GAG = g; if (location.hash === "#/ga-guide") viewGaGuide(); }).catch(() => show(back + '<p class="empty">Couldn\'t load the guide right now.</p>')); return; }
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el[ev] = fn; };
    const g = GAG, t = g.template || {};
    const nGA = OPP ? oppAll().filter((i) => i.state === "GA" && i.type === "college").length : 0;
    show(`${back}<div class="pagehead"><h1>${esc(g.title)}</h1></div><p class="sub">${esc(g.intro)}</p>
      ${(g.sections || []).map((s) => `<div class="card guide"><h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("")}${(s.links || []).map(([l, u]) => `<a class="glink" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ›</a>`).join("")}</div>`).join("")}
      <div class="card guide"><h2>Email / application template</h2><p class="sub">Fill the [brackets], then send from your Gmail.</p><pre class="tmpl" id="tmpl">Subject: ${esc(t.subject || "")}

${esc(t.body || "")}</pre><button class="btn small" id="tcopy" type="button">Copy template</button></div>
      <a class="btn primary full" href="#/opportunities" id="gaList">See Georgia campus listings${nGA ? " (" + nGA + ")" : ""} ›</a>${footer()}`);
    on("tcopy", "onclick", () => { const txt = document.getElementById("tmpl").textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Template copied")).catch(() => toast("Long-press the text to copy")); });
    on("gaList", "onclick", () => { oState = "GA"; oCounty = ""; oType = "college"; oLimit = 25; });
  }

  /* ===== ONE LEAD: details page (fees, booth, deadline, requirements, contact, apply) ===== */
  const t24 = (s) => { const m = String(s || "").match(/(\d{1,2}):(\d\d)\s*([AP]M)/i); if (!m) return ""; let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return String(h).padStart(2, "0") + ":" + m[2]; };
  function viewOppDetail(id) {
    setTab("opp");
    if (!needOpp(() => { if (location.hash.indexOf("#/o/") === 0) viewOppDetail(id); })) return;
    const i = oppById(id);
    const back = `<a class="back" href="#/opportunities">‹ Find</a>`;
    if (!i) { show(back + `<p class="empty">That lead isn't in the feed anymore.</p>`); return; }
    const today = todayISO(), s = oppStatus(i, today), d = dl(i, today), ev = knownEvent(i), mi = milesText(i);
    const n = i.date ? daysBetween(today, i.date) : null;
    const pick = (...ks) => { for (const k of ks) if (i[k]) return i[k]; return ""; };
    const contactEmail = pick("contact_email", "email") || (i.contact && i.contact.email) || "";
    const contactName = (i.contact && i.contact.name) || pick("contact_name");
    const contact = [contactName && esc(contactName), contactEmail && /@/.test(contactEmail) && !/\s/.test(contactEmail) ? `<a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>` : ""].filter(Boolean).join("<br>");
    const loc = String(i.location || "").replace(/([a-z.])([A-Z][a-zA-Z .]+, [A-Z]{2}\b)/, "$1, $2");
    const where = [esc(loc || [i.city, i.state].filter(Boolean).join(", ")), mi && `<span class="sub">${esc(mi)}</span>`, i.county && `<span class="sub">${esc(i.county)} County</span>`].filter(Boolean).join("<br>");
    const dlv = d ? `${dlBadge(d)}<br>${esc(pub(d.text))}` : "";
    const regFee = pick("registration_fee", "registrationFee");
    const fee = [i.fee && `<b>${esc(pub(i.fee))}</b>`, regFee && `Registration: ${esc(regFee)}`].filter(Boolean).join("<br>");
    const applyLink = pick("registration_url", "apply", "url");
    const addr = loc || (i.city ? i.city + ", " + i.state : "");
    show(`${back}
      <article class="hangtag s-${s.k === "booked" ? "approved" : s.k === "applied" ? "agreement" : s.k === "closed" ? "pending" : "booked"} leadtag">
        <span class="hangtag__hole" aria-hidden="true"></span>
        <div class="hangtag__top">${stChip(s)}<span class="hangtag__count">${n == null ? "Ongoing" : n < 0 ? "Past" : n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days"}</span></div>
        <h1>${esc(pub(i.title))}</h1><p class="when">${esc([oppDates(i), i.time].filter(Boolean).join(" · "))}</p>${i.org ? `<p class="hangtag__venue">${esc(i.org)}</p>` : ""}
      </article>
      <div class="bigacts">
        ${applyLink ? `<a class="act act--gold" href="${esc(applyLink)}" target="_blank" rel="noopener">${I.link}<span>Organizer page</span></a>` : ""}
        <button class="act" type="button" data-star="${esc(i.id)}" aria-pressed="${isSaved(i.id)}">${isSaved(i.id) ? "★" : "☆"}<span>${isSaved(i.id) ? "Saved" : "Save"}</span></button>
        ${addr ? `<a class="act" href="${dirURL(addr)}" target="_blank" rel="noopener">${I.pin}<span>Directions</span></a>` : ""}
        ${i.date ? `<button class="act" id="ics" type="button">${I.cal}<span>Add to calendar</span></button>` : ""}
      </div>
      ${ev ? `<a class="boothcta" href="#/e/${encodeURIComponent(ev.id)}"><span class="ring" style="--p:100"><span>✓</span></span><span><b>Already on your calendar</b><small>Open the market for load-in, fees and directions</small></span><span class="chev" aria-hidden="true">›</span></a>` : ""}
      ${!ev && !isApplied(i.id) && !(d && d.kind === "closed") ? `<div class="apply-detail">${applyBtn({ id: i.id, name: i.title, dates: oppDates(i), link: i.url || "" })}</div>` : ""}
      ${i.guide === "ga" || (i.state === "GA" && i.type === "college") ? `<a class="gaguide" href="#/ga-guide"><span>🎓</span><span><b>How to apply in Georgia</b><small>Sales tax number, insurance, approvals + email template</small></span><span aria-hidden="true">›</span></a>` : ""}${i.verified === false ? `<p class="sub">Unverified lead — confirm dates and fee on the organizer page before applying.</p>` : ""}
      <div class="card info">
        ${kv("📅", "When", esc([oppDates(i), i.time].filter(Boolean).join(" · ")))}
        ${kv("📍", "Where", where)}
        ${kv("💵", "Vendor fee", fee)}
        ${kv("⏰", "Apply by", dlv)}
        ${kv("⛺", "Booth info", esc(pick("booth_info", "boothInfo", "booth")))}
        ${kv("📋", "Requirements", esc(pub(pick("registration_requirements", "requirements"))))}
        ${kv("📝", "About", esc(pub(pick("description", "notes"))))}
        ${kv("✉️", "Contact", contact)}
        ${kv("🏷️", "Type", esc([(TYPE_LABEL[i.type] || i.type), i.vendorMatch ? "vendor-friendly" : ""].filter(Boolean).join(" · ")))}
        ${kv("✅", "Verified", i.verified === true ? esc("Read on the organizer's page" + (i.verifiedAt ? " · " + fmt(i.verifiedAt, { month: "short", day: "numeric" }) : "")) : "")}
        ${kv("⭐", "Score", i.score != null ? `<b>${esc(String(i.score))}/100</b>${i.scoreWhy ? `<br><span class="sub">${esc(i.scoreWhy)}</span>` : ""}` : "")}
        ${kv("🔎", "Found via", esc(i.source + (i.firstSeen ? " · first seen " + fmt(i.firstSeen, { month: "short", day: "numeric" }) : "")))}
      </div>
      <div class="actions" style="margin:14px 0 0"><button class="btn small" data-ap="${esc(i.id)}" aria-pressed="${isApplied(i.id)}">${isApplied(i.id) ? "✓ Applied" : "Mark applied"}</button>${applyLink ? `<a class="btn small" href="${esc(applyLink)}" target="_blank" rel="noopener">Apply on organizer site ↗</a>` : ""}</div>
      <p class="fine" style="text-align:left;margin-top:14px">Once you're booked it moves to Markets with load-in, fees and directions. Always confirm details on the organizer's page.</p>${footer()}`);
    const rr = () => viewOppDetail(id);
    wireOppCards(app, rr); wireApply(app, rr);
    const ic = document.getElementById("ics");
    if (ic) ic.onclick = () => download(`${i.id}.ics`, ics([{ id: i.id, name: i.title, date: i.date, start: t24((i.time || "").split("-")[0]), end: t24((i.time || "").split("-")[1]), venue: i.org || "", address: addr, link: i.url || "" }]), "text/calendar");
  }

  /* ---------- .ics ---------- */
  function ics(events) {
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const escI = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JAY STEEL JEWELRY//Market Logistics//EN", "CALSCALE:GREGORIAN"];
    events.forEach((e) => {
      const d = e.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT", `UID:${e.id}@jaysteeljewelry.github.io`, `DTSTAMP:${stamp}`);
      if (e.start) {
        lines.push(`DTSTART;TZID=${TZ}:${d}T${e.start.replace(":", "")}00`);
        lines.push(`DTEND;TZID=${TZ}:${d}T${(e.end || e.start).replace(":", "")}00`);
        if (e.endDate) { const n = daysBetween(e.date, e.endDate) + 1; lines.push(`RRULE:FREQ=DAILY;COUNT=${n}`); }
      } else {
        const end = parse(lastDay(e)); end.setUTCDate(end.getUTCDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}`);
      }
      lines.push(`SUMMARY:${escI(`${(STATUS[e.status] || {}).icon || ""} ${e.name}`.trim())}`);
      if (e.address) lines.push(`LOCATION:${escI(e.address)}`);
      lines.push(`DESCRIPTION:${escI([e.fee && "Fee: " + e.fee, e.payBy && "Pay by: " + e.payBy, e.setup, e.nextStep].filter(Boolean).join("\n"))}`, "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }


  /* ===== MAP (Nov 6 2026): Leaflet + OpenStreetMap, pins by status; coordinates from assets/geo.json (keyed by address) ===== */
  let GEO = null, mapFilter = "upcoming", LMAP = null;
  const loadLeaflet = () => window.L && window.L.map ? Promise.resolve(window.L) : new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = ROOT + "assets/vendor/leaflet/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = ROOT + "assets/vendor/leaflet/leaflet.js"; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  const loadGeo = () => GEO ? Promise.resolve(GEO) : fetch(ROOT + "assets/geo.json", { cache: "no-cache" }).then((r) => r.json()).then((g) => (GEO = g.places || {}));
  const stColor = (s) => `var(--st-${["approved", "booked", "agreement", "pending", "tentative", "conditional", "declined", "nodate"].includes(s) ? s : "nodate"})`;
  const CONFIRMED = ["approved", "agreement", "booked"];
  function mapItems(f) {
    const today = todayISO();
    if (f === "gacampus") return OPP ? oppAll().filter((i) => i.state === "GA" && i.type === "college" && (!i.date || i.date >= today)).map((i) => ({ id: null, oid: i.id, name: pub(i.title), status: "tentative", date: i.date || null, when: i.date ? shortDate(i.date) : (i.when || "Ongoing"), address: i.city + ", GA", venue: i.org, ll: cityLL(i.city, "GA") })) : [];
    if (f === "nodate") return (DATA.openApplications || []).map((o, i) => ({ id: null, name: o.name, status: "nodate", date: null, when: o.when || "No date yet", address: o.address, venue: "" }));
    return DATA.events.filter((e) => {
      const up = lastDay(e) >= today;
      if (f === "past") return !up && e.status !== "declined";
      if (!up || e.status === "declined") return false;
      if (f === "confirmed") return CONFIRMED.includes(e.status);
      if (f === "waiting") return WAITING.includes(e.status);
      return true;
    }).map((e) => ({ id: e.id, name: e.name, status: e.status, date: e.date, when: shortDate(e.date) + (e.start ? " · " + t12(e.start) : ""), address: e.address, venue: e.venue, fee: e.fee, paid: e.paid }));
  }

  /* ===== Nov 6 2026: route planner on the Map (Luis: "add a map to map out and ... create a sort of route when scheduling events").
     Pick dates -> numbered stops in date/time order (same-day untimed stops: nearest next), drive miles/time from the public OSRM
     demo router (no key), straight-line estimate when it doesn't answer, one tap to Google / Apple Maps with every stop. ===== */
  const BASE_LL = [30.2766, -81.5838]; /* base: Southside Jacksonville (32216), approximate */
  let CITYGEO = null, routeLayer = null, RT = null;
  const loadCityGeo = () => CITYGEO ? Promise.resolve(CITYGEO) : fetch(ROOT + "assets/city_geo.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((g) => (CITYGEO = g || {}));
  const cityLL = (city, st) => CITYGEO && CITYGEO[String(city || "").replace(/\s*\(.*\)$/, "").trim() + ", " + st];
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * 3958.8 * Math.asin(Math.sqrt(x)); };
  const plusDays = (iso, n) => new Date(parse(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
  const llq = (p) => p[0].toFixed(5) + "," + p[1].toFixed(5);
  function routeStops(from, to, inclSaved, geo, startLL) {
    const out = [];
    DATA.events.forEach((e) => {
      if (e.status === "declined" || !e.date || e.date > to || lastDay(e) < from) return;
      const g = e.address && geo[e.address]; if (!g) return;
      out.push({ name: e.name, date: e.date < from ? from : e.date, start: e.start || "", ll: [g[0], g[1]], addr: e.address, href: "#/e/" + encodeURIComponent(e.id), approx: !!g[2] });
    });
    if (inclSaved && OPP) { const sv = savedMap(); oppAll().forEach((i) => {
      if (!sv[i.id] || !i.date || i.date > to || (i.end_date || i.date) < from) return;
      const g = cityLL(i.city, i.state); if (!g) return;
      out.push({ name: pub(i.title), date: i.date < from ? from : i.date, start: t24(i.time) || "", ll: g, addr: i.city + ", " + i.state, href: "#/o/" + encodeURIComponent(i.id), approx: true, lead: true });
    }); }
    const days = [...new Set(out.map((s) => s.date))].sort(), ordered = [];
    let cur = startLL;
    days.forEach((d) => {
      const day = out.filter((s) => s.date === d), timed = day.filter((s) => s.start).sort((a, b) => a.start.localeCompare(b.start)), rest = day.filter((s) => !s.start);
      timed.forEach((s) => { ordered.push(s); cur = s.ll; });
      while (rest.length) { let k = 0; if (cur) rest.forEach((s, j) => { if (hav(cur, s.ll) < hav(cur, rest[k].ll)) k = j; }); const s = rest.splice(k, 1)[0]; ordered.push(s); cur = s.ll; }
    });
    return ordered;
  }
  function osrm(pts) {
    if (pts.length < 2 || pts.length > 25) return Promise.reject(new Error("n"));
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
    return fetch("https://router.project-osrm.org/route/v1/driving/" + pts.map((p) => p[1].toFixed(5) + "," + p[0].toFixed(5)).join(";") + "?overview=full&geometries=geojson", { signal: ctl.signal })
      .then((r) => r.json()).then((d) => { if (!d || d.code !== "Ok" || !d.routes || !d.routes[0]) throw new Error("osrm"); return d.routes[0]; });
  }
  const miT = (m) => Math.round(m / 1609.34) + " mi", hmT = (s) => { const h = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60); return h ? h + " h " + mm + " min" : mm + " min"; };
  function routePanelHTML() {
    const r = RT || {};
    return `<details class="route" id="rt"${RT ? " open" : ""}><summary><span>🧭 Plan a route</span><small>Pick dates — numbered stops + drive times</small></summary>
      <div class="chips" role="group" aria-label="Dates"><button class="chip" type="button" data-rq="wknd">This weekend</button><button class="chip" type="button" data-rq="7">Next 7 days</button><button class="chip" type="button" data-rq="30">Next 30 days</button></div>
      <div class="fgrid"><label class="fsel"><span>From</span><input type="date" id="rfrom" value="${esc(r.from || "")}"></label><label class="fsel"><span>To</span><input type="date" id="rto" value="${esc(r.to || "")}"></label></div>
      <label class="rchk"><input type="checkbox" id="rbase"${r.base === false ? "" : " checked"}> Start from base (Southside Jax)</label>
      <label class="rchk"><input type="checkbox" id="rsaved"${r.saved ? " checked" : ""}> Add my ★ saved Find-markets leads</label>
      <button class="btn primary full" id="rgo" type="button">Show route</button><div id="rout" aria-live="polite"></div></details>`;
  }
  function wireRoute(m, Lf, geo) {
    const today = todayISO(), get = (id) => document.getElementById(id);
    app.querySelectorAll("[data-rq]").forEach((b) => b.addEventListener("click", () => {
      const q = b.dataset.rq; let f = today, t;
      if (q === "wknd") { const dow = parse(today).getUTCDay(); f = dow === 0 ? today : dow === 6 ? today : plusDays(today, 6 - dow); t = dow === 0 ? today : plusDays(f, dow === 6 ? 1 : 1); }
      else t = plusDays(today, Number(q) - 1);
      get("rfrom").value = f; get("rto").value = t; run();
    }));
    const run = () => {
      const from = get("rfrom").value || today, to = get("rto").value || plusDays(from, 6);
      RT = { from, to: to < from ? from : to, base: get("rbase").checked, saved: get("rsaved").checked };
      const go = () => drawRoute(m, Lf, geo);
      if (RT.saved && !OPP) loadOpp().then((d) => { OPP = d; return loadCityGeo(); }).then(go).catch(go); else loadCityGeo().then(go);
    };
    on2("rgo", "onclick", run);
    if (RT) loadCityGeo().then(() => drawRoute(m, Lf, geo));
  }
  const on2 = (id, ev, fn) => { const el = document.getElementById(id); if (el) el[ev] = fn; };
  function drawRoute(m, Lf, geo) {
    const out = document.getElementById("rout"); if (!out || !RT) return;
    if (routeLayer) { try { m.removeLayer(routeLayer); } catch (_) {} routeLayer = null; }
    const stops = routeStops(RT.from, RT.to, RT.saved, geo, RT.base ? BASE_LL : null);
    if (!stops.length) { out.innerHTML = `<p class="empty">No markets with an address between ${esc(shortDate(RT.from))} and ${esc(shortDate(RT.to))}.${RT.saved ? "" : " Tick “saved leads” to add ones you starred in Find markets."}</p>`; return; }
    const pts = (RT.base ? [BASE_LL] : []).concat(stops.map((s) => s.ll));
    const lay = routeLayer = Lf.layerGroup().addTo(m);
    const line = Lf.polyline(pts, { color: "#C9CED6", weight: 3, opacity: 0.75, dashArray: "6 7" }).addTo(lay);
    if (RT.base) Lf.marker(BASE_LL, { icon: Lf.divIcon({ className: "", html: '<span class="rnum base">⌂</span>', iconSize: [26, 26], iconAnchor: [13, 13] }), title: "Base" }).addTo(lay);
    stops.forEach((s, k) => Lf.marker(s.ll, { zIndexOffset: 1000, title: s.name, icon: Lf.divIcon({ className: "", html: `<span class="rnum">${k + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] }) }).addTo(lay)
      .bindPopup(`<div class="pop"><h3>${k + 1}. ${esc(s.name)}</h3><p class="m">${esc(shortDate(s.date))}${s.start ? " · " + esc(t12(s.start)) : ""} · ${esc(s.addr)}${s.approx ? " (approx.)" : ""}</p><div class="dir"><a href="${s.href}">Open</a></div></div>`, { maxWidth: 280 }));
    m.fitBounds(Lf.latLngBounds(pts).pad(0.2), { maxZoom: 12 });
    const gUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + llq(pts[0]) + "&destination=" + llq(pts[pts.length - 1]) + (pts.length > 2 ? "&waypoints=" + pts.slice(1, -1).slice(0, 9).map(llq).join("%7C") : "");
    const aUrl = "https://maps.apple.com/?dirflg=d&saddr=" + llq(pts[0]) + "&daddr=" + pts.slice(1).map(llq).join("+to:");
    const render = (legs, real) => {
      let tm = 0, tt = 0;
      const rows = stops.map((s, k) => { const L = legs[RT.base ? k : k - 1]; if (L) { tm += L.d; tt += L.t || 0; }
        const leg = L ? `<small class="leg">${real ? "" : "~"}${miT(L.d)}${L.t ? " · " + (real ? "" : "~") + hmT(L.t) : ""} from ${k === 0 ? "base" : "stop " + k}</small>` : "";
        return `<a class="rstop" href="${s.href}"><span class="rnum sm">${k + 1}</span><span><b>${esc(s.name)}</b><small>${esc(shortDate(s.date))}${s.start ? " · " + esc(t12(s.start)) : ""} · ${esc(s.addr)}${s.lead ? " · ★ lead" : ""}</small>${leg}</span></a>`; }).join("");
      out.innerHTML = `<p class="rsum"><b>${stops.length} stop${stops.length === 1 ? "" : "s"}</b> · ${real ? "" : "~"}${miT(tm)}${tt ? " · " + (real ? "" : "~") + hmT(tt) + " driving" : ""}${real ? "" : " <span class=\"sub\">(straight-line estimate)</span>"}</p>${rows}
        <div class="rbtns"><a class="btn small" href="${esc(gUrl)}" target="_blank" rel="noopener">Open in Google Maps</a><a class="btn small" href="${esc(aUrl)}" target="_blank" rel="noopener">Open in Apple Maps</a></div>${pts.length > 11 ? '<p class="sub">Google Maps takes the first 10 stops.</p>' : ""}`;
    };
    const est = []; for (let k = 1; k < pts.length; k++) est.push({ d: hav(pts[k - 1], pts[k]) * 1.25 * 1609.34, t: hav(pts[k - 1], pts[k]) * 1.25 / 45 * 3600 });
    render(est, false);
    osrm(pts).then((rt) => {
      if (routeLayer !== lay) return;
      try { lay.removeLayer(line); Lf.geoJSON(rt.geometry, { style: { color: "#C9CED6", weight: 4, opacity: 0.85 } }).addTo(lay); } catch (_) {}
      render(rt.legs.map((L) => ({ d: L.distance, t: L.duration })), true);
    }).catch(() => {});
  }
  function viewMap(focusId) {
    setTab("map");
    const today = todayISO();
    const cnt = (f) => mapItems(f).length;
    const chips = [["upcoming", "Upcoming"], ["confirmed", "Confirmed"], ["waiting", "Waiting"], ["nodate", "No date yet"], ["past", "Past"], ["gacampus", "GA campuses"]].map(([k, t]) => [k, t, cnt(k)]).filter((c) => c[2] > 0 || c[0] === "upcoming" || c[0] === "gacampus");
    if (!OPP) loadOpp().then((d) => { OPP = d; }).catch(() => {});
    if (focusId) { const fe = byId(focusId); if (fe) mapFilter = lastDay(fe) < today ? "past" : "upcoming"; }
    show(`<div class="pagehead"><h1>Map</h1></div>
      <div class="chips" role="group" aria-label="Show">${chips.map(([k, t, n]) => `<button class="chip" type="button" data-mf="${k}" aria-pressed="${k === mapFilter}">${esc(t)} <span class="n">${n || (k === "gacampus" ? "" : n)}</span></button>`).join("")}</div>
      ${routePanelHTML()}
      <div class="mapwrap"><div id="map" role="region" aria-label="Map of markets"></div></div>
      <div class="map-legend" aria-hidden="true">${[["approved", "Approved"], ["booked", "On my calendar"], ["agreement", "Agreement"], ["pending", "Pending"], ["tentative", "Tentative / conditional"], ["nodate", "No date yet"]].map(([s, t]) => `<span><i style="background:${stColor(s)}"></i>${t}</span>`).join("")}</div>
      <div class="places" id="places"><p class="loading">Loading map…</p></div>${footer()}`);
    app.querySelectorAll("[data-mf]").forEach((b) => b.addEventListener("click", () => { mapFilter = b.dataset.mf; viewMap(); }));
    Promise.all([loadLeaflet(), loadGeo(), loadCityGeo(), mapFilter === "gacampus" && !OPP ? loadOpp().then((d) => { OPP = d; }).catch(() => {}) : null]).then(([Lf, geo]) => {
      const box = document.getElementById("map"); if (!box || !document.body.contains(box)) return;
      if (LMAP) { try { LMAP.remove(); } catch (_) {} }
      const m = LMAP = Lf.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
      const groups = new Map(), nogeo = [];
      mapItems(mapFilter).forEach((it) => {
        const g = it.ll || (it.address && geo[it.address]);
        if (!g) { nogeo.push(it); return; }
        const key = g[0].toFixed(4) + "," + g[1].toFixed(4);
        if (!groups.has(key)) groups.set(key, { ll: [g[0], g[1]], approx: !!g[2], address: it.address, venue: it.venue, items: [] });
        groups.get(key).items.push(it);
      });
      const places = [...groups.values()].sort((x, y) => String(x.items[0].date || "9").localeCompare(String(y.items[0].date || "9")));
      const markers = [];
      const popHTML = (p) => {
        const first = p.items[0];
        const title = p.items.every((i) => i.name === first.name) ? first.name : (p.venue || first.name);
        return `<div class="pop"><h3>${esc(title)}</h3><p class="m">${esc(p.venue && p.venue !== title ? p.venue + " · " : "")}${esc(p.address || "")}${p.approx ? " (approx. spot)" : ""}</p>
          <ul>${p.items.map((i) => `<li>${i.oid ? `<a href="#/o/${encodeURIComponent(i.oid)}">` : i.id ? `<a href="#/e/${encodeURIComponent(i.id)}">` : `<a href="#/markets" data-nodate="1">`}<span>${esc(i.when)}${p.items.length > 1 && i.name !== title ? " · " + esc(i.name) : ""}</span>${statusPill(i.status === "nodate" ? "pending" : i.status)}</a></li>`).join("")}</ul>
          <div class="dir"><a href="${esc(amaps(p.address))}" target="_blank" rel="noopener">Apple Maps</a><a href="${esc(maps(p.address))}" target="_blank" rel="noopener">Google Maps</a></div></div>`;
      };
      places.forEach((p, idx) => {
        const n = p.items.length, s = p.items[0].status;
        const icon = Lf.divIcon({ className: "", html: `<span class="pin${n > 1 ? " multi" : ""}" style="background:${stColor(s)}">${n > 1 ? n : ""}</span>`, iconSize: n > 1 ? [24, 24] : [18, 18], iconAnchor: n > 1 ? [12, 12] : [9, 9], popupAnchor: [0, -10] });
        const mk = Lf.marker(p.ll, { icon, title: p.items[0].name, keyboard: true }).addTo(m).bindPopup(popHTML(p), { maxWidth: 300, autoPanPadding: [20, 70] });
        markers.push(mk); p.idx = idx;
      });
      /* frame the home cluster (Jacksonville area); far-off markets stay on the map, one pan away */
      const med = (k) => { const v = places.map((p) => p.ll[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
      const core = places.length ? (() => { const c = [med(0), med(1)]; const near = places.filter((p) => Math.abs(p.ll[0] - c[0]) < 0.7 && Math.abs(p.ll[1] - c[1]) < 0.7); return near.length >= Math.max(2, places.length * 0.6) ? near : places; })() : [];
      if (core.length) m.fitBounds(Lf.latLngBounds(core.map((p) => p.ll)).pad(0.15), { maxZoom: 13 }); else m.setView([30.33, -81.66], 9);
      if (core.length < places.length) { const far = places.length - core.length; const note = document.createElement("p"); note.className = "m"; note.style.margin = "8px 2px 0"; note.textContent = far + " more farther out (" + places.filter((p) => !core.includes(p)).map((p) => p.address.split(",").slice(-2, -1)[0].trim()).join(", ") + ") — zoom out to see them."; box.parentNode.after(note); }
      const list = document.getElementById("places");
      list.innerHTML = (places.length ? places.map((p) => `<button class="place" type="button" data-p="${p.idx}"><span class="dot" style="background:${stColor(p.items[0].status)}"></span><span><b>${esc(p.items[0].name)}</b><small>${esc(p.items[0].when)} · ${esc(p.address || "")}</small></span><span class="cnt">${p.items.length > 1 ? p.items.length + " dates" : ""}</span></button>`).join("") : `<p class="empty">Nothing to show for this filter.</p>`)
        + (nogeo.length ? `<p class="m" style="margin-top:6px">${nogeo.length} not on the map (no address yet): ${esc(nogeo.map((i) => i.name).join(" · "))}</p>` : "");
      list.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { const mk = markers[+b.dataset.p]; m.setView(mk.getLatLng(), Math.max(m.getZoom(), 13)); mk.openPopup(); box.scrollIntoView({ behavior: "smooth", block: "center" }); }));
      wireRoute(m, Lf, geo);
      m.on("popupopen", (ev) => { const el = ev.popup.getElement(); el && el.querySelectorAll("[data-nodate]").forEach((x) => x.addEventListener("click", () => { filter = "nodate"; })); });
      setTimeout(() => {
        m.invalidateSize();
        if (focusId) { const p = places.find((q) => q.items.some((i) => i.id === focusId)); if (p) { m.setView(p.ll, 13, { animate: false }); setTimeout(() => markers[p.idx].openPopup(), 120); } }
      }, 60);
    }).catch(() => { const l = document.getElementById("places"); if (l) l.innerHTML = `<p class="empty">The map couldn't load. Check your signal, then pull down to refresh.</p>`; });
  }



  /* ===== SETTINGS (Nov 6 2026) — saved on this device (localStorage "jsl-settings") ===== */
  const K_SETTINGS = "jsl-settings", K_BRIEF = "jsl-brief-pending";
  const SETS = () => Object.assign({ theme: "dark", text: "normal", motion: "full", lock: 0 }, ld(K_SETTINGS, {}));
  function applySettings() {
    const s = SETS(), d = document.documentElement;
    const light = s.theme === "light" || (s.theme === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
    d.setAttribute("data-theme", light ? "light" : "dark");
    d.classList.toggle("text-lg", s.text === "large"); d.classList.toggle("calm", s.motion === "reduce");
    const m = document.getElementById("theme-color"); if (m) m.setAttribute("content", light ? "#E9ECEF" : "#0E0F11");
  }
  if (window.matchMedia) { const mq = matchMedia("(prefers-color-scheme: light)"); (mq.addEventListener ? mq.addEventListener("change", applySettings) : mq.addListener && mq.addListener(applySettings)); }
  applySettings();
  /* auto-lock: after N idle minutes this device forgets the unlock and shows the password screen again */
  const K_SEEN = "jsl-last-active";
  function lockNow() { try { localStorage.removeItem("jsl-auth"); localStorage.removeItem(HQ_KEY); } catch (_) {} location.replace(location.pathname); }
  function idleCheck() { const n = +SETS().lock; if (!n) return; const t = +ld(K_SEEN, 0); if (t && Date.now() - t > n * 60000) lockNow(); }
  idleCheck();
  ["click", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => sv(K_SEEN, Date.now()), { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") idleCheck(); else sv(K_SEEN, Date.now()); });
  setInterval(idleCheck, 30000); sv(K_SEEN, Date.now());
  const APP_URL = "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/";
  const marketsCSV = () => { const cols = ["id", "name", "status", "date", "endDate", "start", "end", "venue", "address", "fee", "paid", "payBy", "link"]; const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return [cols.join(",")].concat(DATA.events.map((e) => cols.map((c) => q(e[c])).join(","))).join("\n") + "\n"; };
  function viewSettings() {
    setTab("settings");
    const s = SETS();
    const seg = (key, opts) => `<div class="seg seg--set" role="radiogroup" aria-label="${esc(key)}">${opts.map(([v, t]) => `<button type="button" role="radio" data-set="${key}" data-v="${v}" aria-checked="${String(s[key]) === String(v)}">${t}</button>`).join("")}</div>`;
    const copyRow = (t, url, what, tag) => `<div class="conn"><div><b>${esc(t)}${tag ? ` <span class="pill">${esc(tag)}</span>` : ""}</b><small>${esc(what)}</small><code>${esc(url)}</code></div><button class="btn small" type="button" data-copy="${esc(url)}">Copy</button></div>`;
    const ro = (t, what) => `<div class="conn"><div><b>${esc(t)}</b><small>${esc(what)}</small></div><span class="pill s-approved"><i></i>Connected via Tab</span></div>`;
    const synced = DATA.updated ? fmt(DATA.updated, { month: "short", day: "numeric", year: "numeric" }) : "—";
    const bp = ld(K_BRIEF, null);
    show(`<div class="pagehead"><h1>Settings</h1></div>
      <h2 class="set-h">Appearance</h2>
      <div class="card set">
        <div class="set-r"><span><b>Theme</b><small>Dark steel is the default</small></span>${seg("theme", [["dark", "Dark"], ["light", "Light"], ["system", "Match phone"]])}</div>
        <div class="set-r"><span><b>Text size</b></span>${seg("text", [["normal", "Normal"], ["large", "Large"]])}</div>
        <div class="set-r"><span><b>Motion</b><small>Turn off animations</small></span>${seg("motion", [["full", "On"], ["reduce", "Reduced"]])}</div>
      </div>
      <h2 class="set-h">Notifications</h2>
      <p class="set-note">These send your choice to Tab on the same signed channel as HQ answers. Tab confirms on the next update.</p>
      <div id="rembox"></div>
      <div id="briefbox"></div>
      <section id="hqteam"></section>
      <h2 class="set-h">Data</h2>
      <div class="card set">
        <div class="set-r"><span><b>Market list updated</b><small>${esc(synced)} · HQ ${HQ.at ? "synced " + new Date(HQ.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "not loaded yet"}</small></span><span class="m">Pull down to refresh</span></div>
        <div class="set-r"><span><b>Export markets</b><small>All ${DATA.events.length} markets</small></span><span class="set-btns"><button class="btn small" type="button" id="x-csv">CSV</button><button class="btn small" type="button" id="x-json">JSON</button></span></div>
      </div>
      <h2 class="set-h">Security</h2>
      <div class="card set">
        <div class="set-r"><span><b>App password</b><small>It also unlocks HQ's encrypted data, so Tab changes it on its side and re-encrypts everything.</small></span><a class="btn small" href="https://wa.me/${TAB_WA}?text=${encodeURIComponent("Tab, please change my JAY STEEL app password.")}" target="_blank" rel="noopener">Ask Tab</a></div>
        <div class="set-r"><span><b>Auto-lock</b><small>Ask for the password after this long idle</small></span>${seg("lock", [["0", "Off"], ["5", "5 min"], ["15", "15 min"], ["60", "1 hr"]])}</div>
      </div>
      <h2 class="set-h">Connect · AI agents</h2>
      <p class="set-note">Read-only links an assistant or another app can use. Items marked public can be read by anyone with the link. HQ data stays encrypted and isn't listed here.</p>
      <div class="card set">
        ${copyRow("Guide for AI agents", APP_URL + "agents.md", "What each file is, its fields and statuses, and how to read them", "public")}
        ${copyRow("Markets feed (JSON)", APP_URL + "data/events.json", "Every market: date, status, fee, paid, venue, address", "public")}
        ${copyRow("Markets schema", APP_URL + "data/events.schema.json", "JSON Schema for the markets feed", "public")}
        ${copyRow("Calendar feed (.ics)", APP_URL + "data/markets.ics", "Subscribe in Apple or Google Calendar", "public")}
        ${copyRow("Vendor opportunities (JSON)", APP_URL + "data/opportunities.json", "Leads shown under ☰ › Find markets", "public")}
        ${copyRow("Map spots (JSON)", APP_URL + "assets/geo.json", "Pin coordinates for each market address", "public")}
        ${ro("Google Calendar", "Markets on your calendar, kept in sync by Tab")}
        ${ro("Discord", "Market cards in your Discord, updated by Tab")}
        ${ro("Booker email", "Tab reads organizer email and updates statuses here")}
      </div>
      <h2 class="set-h">About</h2>
      <div class="card set"><div class="set-r"><span><b>JAY STEEL · Markets &amp; HQ</b><small>Version 16 · Nov 6, 2026 · Built for JAY STEEL JEWELRY</small></span></div></div>
      ${footer()}`);
    app.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
      const cur = SETS(); cur[b.dataset.set] = b.dataset.set === "lock" ? +b.dataset.v : b.dataset.v; sv(K_SETTINGS, cur); applySettings();
      app.querySelectorAll(`[data-set="${b.dataset.set}"]`).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    }));
    app.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied"); } catch (_) { prompt("Copy this link:", b.dataset.copy); } }));
    document.getElementById("x-csv").onclick = () => download("jaysteel-markets.csv", marketsCSV(), "text/csv");
    document.getElementById("x-json").onclick = () => download("jaysteel-markets.json", JSON.stringify(DATA.events, null, 2), "application/json");
    withHQ(() => { paintRem(); paintBrief(); const t = document.getElementById("hqteam"); if (t) t.innerHTML = teamHTML(); });
  }
  function paintBrief() {
    const box = document.getElementById("briefbox"); if (!box || !HQ.key) return;
    const ag = ((HQ.data["agents.json"] || {}).agents || []).find((x) => x.key === "morning-brief");
    let P = ld(K_BRIEF, null); const live = ag ? ag.on !== false : true;
    if (P && (Date.now() - P.at > 12 * 36e5 || (P.to === "ON") === live)) { try { localStorage.removeItem(K_BRIEF); } catch (_) {} P = null; }
    const on = P ? P.to === "ON" : live;
    box.innerHTML = `<button type="button" class="swrow" role="switch" aria-checked="${on}" id="briefsw"><span><b>Daily brief</b><small>${P ? (on ? "Turning on… Tab confirms on the next update" : "Turning off… Tab confirms on the next update") : on ? "WhatsApp summary at 6:30 AM" : "Off. No morning summary"}</small></span><span class="tog" aria-hidden="true"></span></button>`;
    document.getElementById("briefsw").onclick = async (ev) => {
      const to = on ? "OFF" : "ON"; ev.currentTarget.disabled = true;
      try { await hqPost(["HQ automation: Daily brief \u2192 " + to], ["automation-daily-brief"]); sv(K_BRIEF, { to, at: Date.now() }); toast("✓ Sent to Tab: daily brief " + to.toLowerCase()); }
      catch (_) { toast("Couldn't reach Tab. Try again"); }
      paintBrief();
    };
  }

  /* ---------- Products (Nov 7 2026, Luis: supplier importer like ProductUpload.ai / DSers) ----------
     Lives in products.js (+ products.css), loaded on first visit; its data is the encrypted data/products.enc.json. Revert: delete these lines. */
  let prdLoading = null;
  /* Research (Nov 9 2026, Luis: "put this into my app" + "add images next to the items"): research.js + research.css, data/research.enc.json,
     at Products → Research (#/products/research). Revert: delete the lines marked "research". */
  let rsLoading = null;   /* research */
  const rsLoad = () => rsLoading || (rsLoading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = ROOT + "research.js?v=1"; s.onload = ok; s.onerror = () => { rsLoading = null; no(); }; document.body.appendChild(s); }));   /* research */
  /* Product pages (Nov 9 2026, Luis: "generate real product sites with any product link i paste"): pages.js + pages.css, pp/<slug>/ previews,
     at Products → Pages (#/products/pages, #/products/page/<slug>). Revert: delete the lines marked "pages". */
  let pgLoading = null;   /* pages */
  const pgLoad = () => pgLoading || (pgLoading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = ROOT + "pages.js?v=2"; s.onload = ok; s.onerror = () => { pgLoading = null; no(); }; document.body.appendChild(s); }));   /* pages */
  function viewProducts(h) {
    setTab("products");
    if (h.indexOf("products/page") === 0) { if (window.JSLPages) return window.JSLPages.render(h); show('<div class="skel" aria-label="Loading pages"><i></i><i></i><i></i></div>'); return pgLoad().then(() => { if (location.hash.indexOf("#/products/page") === 0) window.JSLPages.render(location.hash); }).catch(() => show('<p class="empty">Couldn\'t load product pages. Check your signal, then pull down to refresh.</p>')); }   /* pages */
    pgLoad().catch(() => {});   /* pages: adds the Pages button + each product's "Product page" link */
    if (h.indexOf("products/research") === 0) { if (window.JSLResearch) return window.JSLResearch.render(h); show('<div class="skel" aria-label="Loading research"><i></i><i></i><i></i></div>'); return rsLoad().then(() => { if (location.hash.indexOf("#/products/research") === 0) window.JSLResearch.render(h); }).catch(() => show('<p class="empty">Couldn\'t load Research. Check your signal, then pull down to refresh.</p>')); }   /* research */
    rsLoad().catch(() => {});   /* research: adds the Research button to the Products bar */
    if (window.JSLProducts) return window.JSLProducts.render(h);
    show('<div class="skel" aria-label="Loading products"><i></i><i></i><i></i></div>');
    if (!prdLoading) prdLoading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = ROOT + "products.js?v=1"; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
    prdLoading.then(() => { if (location.hash.indexOf("#/products") === 0) window.JSLProducts.render(location.hash.replace(/^#\/?/, "")); })
      .catch(() => { prdLoading = null; show('<p class="empty">Couldn\'t load Products. Check your signal, then pull down to refresh.</p>'); });
  }

  /* ---------- router ---------- */
  function route() {
    if (!DATA) return;
    const h = location.hash.replace(/^#\/?/, "");
    if (h !== "" && h !== "markets") clearInterval(tick);
    if (LMAP && !h.startsWith("map")) { try { LMAP.remove(); } catch (_) {} LMAP = null; }
    if (h.startsWith("e/")) return viewEvent(decodeURIComponent(h.slice(2)));
    if (h.startsWith("pack/")) { location.replace("#/e/" + h.slice(5)); return; }   /* Nov 6 2026: packing checklist removed (Luis) */
    if (h === "markets") return viewList();
    if (h === "calendar") return viewCalendar();
    if (h === "map" || h.startsWith("map/")) return viewMap(h.startsWith("map/") ? decodeURIComponent(h.slice(4)) : null);
    if (h === "hq" || h === "needs") { location.replace("#/"); return; }
    if (h === "settings") return viewSettings();
    if (h === "money") return viewMoney();
    if (h.startsWith("o/")) return viewOppDetail(decodeURIComponent(h.slice(2)));
    if (h === "ga-guide") return viewGaGuide();
    if (h === "opportunities" || h === "saved") return viewOpp();
    if (h === "links") return viewLinks();
    if (h === "products" || h.startsWith("products/")) return viewProducts(h);
    viewToday();
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  if (USE_SW && "serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); }); }
  const sortEvents = (d) => { d.events.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))); return d; };

  /* ---------- refresh (Oct 20 2026): ↻ in the header, or pull down at the top of the page ----------
     Re-fetches events.json + the Find feed past every cache, and loads a new app version if one is waiting. */
  let refreshing = false, swReloading = false, lastEventsTxt = null, lastOppTxt = null, ptrPulling = false;
  const hadController = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing && hadController && !swReloading) { swReloading = true; location.reload(); } });
  const rbtn = document.getElementById("refresh-btn");
  async function refreshAll(silent) {
    if (refreshing) return; refreshing = true;
    if (rbtn) { rbtn.classList.add("spin"); rbtn.setAttribute("aria-busy", "true"); }
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        if (reg && USE_SW) {
          await reg.update().catch(() => {});
          const w = reg.waiting || reg.installing;
          if (w && hadController) { w.postMessage("skipWaiting"); setTimeout(() => { if (!swReloading) { swReloading = true; location.reload(); } }, 2500); return; }
        }
      }
      const t = Date.now();
      const [txt, o] = await Promise.all([
        fetch(ROOT + "data/events.json?t=" + t, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }),
        loadOpp(true).catch(() => OPP),
      ]);
      const oTxt = o ? JSON.stringify(o) : lastOppTxt;
      const changed = txt !== lastEventsTxt || oTxt !== lastOppTxt; lastEventsTxt = txt; lastOppTxt = oTxt;
      DATA = sortEvents(JSON.parse(txt)); if (o) OPP = o; migrateSent();
      HQ.at = 0; if (HQ.key) await hqLoad().catch(() => {});
      if (window.JSLProducts && location.hash.indexOf("#/products") === 0) await window.JSLProducts.reload().catch(() => {});
      if (window.JSLResearch && location.hash.indexOf("#/products/research") === 0) await window.JSLResearch.reload().catch(() => {});   /* research */   /* fresh HQ asks too; auto-clear re-runs as screens re-render */
      if (window.JSLPages && location.hash.indexOf("#/products/page") === 0) await window.JSLPages.reload().catch(() => {});   /* pages */
      /* a quiet (automatic) refresh never redraws under a finger: skip while typing or a sheet/menu is open, or when nothing changed */
      const busyUI = document.body.classList.contains("sheet-open") || document.body.classList.contains("menu-open") || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
      if (!silent || (changed && !busyUI) || ptrPulling) { const y = window.scrollY; route(); window.scrollTo(0, y); }
      if (!silent) toast("Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    } catch (_) { if (!silent || ptrPulling) toast("Couldn't refresh. Check your signal"); }
    finally { if (!swReloading) { refreshing = false; if (rbtn) { rbtn.classList.remove("spin"); rbtn.removeAttribute("aria-busy"); } } }
  }
  if (rbtn) rbtn.addEventListener("click", () => refreshAll());
  /* back in the foreground after a minute or more: refresh quietly */
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 15000) refreshAll(true); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) refreshAll(true); });
  /* while open: check for new info every 4 minutes (quiet; redraws only if the data changed) */
  setInterval(() => { if (document.visibilityState === "visible") refreshAll(true); }, 4 * 60 * 1000);
  (function pullToRefresh() {
    const ind = document.createElement("div"); ind.className = "ptr"; ind.setAttribute("aria-hidden", "true");
    ind.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>'; document.body.appendChild(ind);
    const MAX = 110, GO = 70; let y0 = null, x0 = 0, dy = 0;   /* GO = finger travel in px (was 70 after 0.6 damping = ~117 px; too far) */
    const paint = () => { const p = Math.min(dy, MAX); ind.style.opacity = String(Math.min(1, p / GO)); ind.style.transform = `translateY(${p * 0.8 - 30}px) rotate(${p * 3}deg)`; ind.classList.toggle("ready", dy >= GO); };
    const reset = () => { y0 = null; dy = 0; ind.style.transition = "opacity .2s, transform .2s"; ind.style.opacity = "0"; ind.style.transform = "translateY(-20px)"; ind.classList.remove("ready"); };
    window.addEventListener("touchstart", (e) => { if (window.scrollY > 2 || refreshing || document.body.classList.contains("sheet-open") || document.body.classList.contains("menu-open") || (e.target.closest && e.target.closest("#map")) || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; ind.style.transition = "none"; }, { passive: true });
    window.addEventListener("touchmove", (e) => { if (y0 == null) return; const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0); if (window.scrollY > 2 || d < 0 || dx > Math.abs(d)) { if (dy) reset(); else y0 = null; return; } dy = d; paint(); }, { passive: true });
    window.addEventListener("touchcancel", () => { if (y0 != null) reset(); }, { passive: true });
    window.addEventListener("touchend", async () => {
      if (y0 == null) return; const go = dy >= GO;
      if (!go) { reset(); return; }
      y0 = null; ind.style.transition = "transform .2s"; ind.style.transform = "translateY(30px)"; ind.style.opacity = "1"; ind.classList.add("spin");
      ptrPulling = true;
      try { await refreshAll(true); if (!swReloading) toast("Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })); } finally { ptrPulling = false; ind.classList.remove("spin"); reset(); }
    }, { passive: true });
  })();

  fetch(ROOT + "data/events.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((txt) => { lastEventsTxt = txt; DATA = sortEvents(JSON.parse(txt)); migrateSent(); route(); })
    .catch(() => { app.innerHTML = '<p class="loading">Couldn\'t load the market list. Check your signal, then pull down to refresh.</p>'; });
})();
