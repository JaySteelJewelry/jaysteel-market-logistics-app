/* JAY STEEL JEWELRY · Market Logistics — "Market Day" redesign (Oct 22 2026)
   Data: data/events.json (edit that one file to add/change markets).
   Checklists + sales/expense tally are saved on this device (localStorage).
   Oct 20 2026: "Apply via Tab" hands an application to Tab over WhatsApp (Tab's number only). */
(function () {
  "use strict";
  const TZ = "America/New_York";
  const STORE_URL = "https://jaysteeljewelry.square.site/";
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
    "Inventory: necklaces, bracelets, rings, earrings", "Price tags / price sign", "Square reader + phone charged",
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

  /* ---------- theme (sun/moon). The <head> script already applied it before first paint. ---------- */
  (function themeToggle() {
    const KEY = "jsj-theme", root = document.documentElement, btn = document.getElementById("theme-toggle"), meta = document.getElementById("theme-color");
    const apply = (t) => {
      root.setAttribute("data-theme", t);
      if (meta) meta.setAttribute("content", t === "light" ? "#F6F4EF" : "#070707");
      if (btn) { const next = t === "light" ? "dark" : "light"; btn.setAttribute("aria-label", `Switch to ${next} mode`); btn.setAttribute("aria-pressed", String(t === "light")); }
    };
    apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");
    if (btn) btn.addEventListener("click", () => { const t = root.getAttribute("data-theme") === "light" ? "dark" : "light"; apply(t); try { localStorage.setItem(KEY, t); } catch (_) {} });
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const follow = (e) => { let saved = null; try { saved = localStorage.getItem(KEY); } catch (_) {} if (saved !== "light" && saved !== "dark") apply(e.matches ? "light" : "dark"); };
      if (mq.addEventListener) mq.addEventListener("change", follow); else if (mq.addListener) mq.addListener(follow);
    }
  })();

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
  function setTab(name) {
    document.querySelectorAll(".dock a").forEach((a) => a.toggleAttribute("aria-current", false));
    const a = document.querySelector(`.dock a[data-tab="${name}"]`); if (a) a.setAttribute("aria-current", "page");
    document.body.classList.toggle("booth", name === "booth");
  }

  /* one market on the chain timeline */
  function rowHTML(e, today) {
    const past = lastDay(e) < today;
    const d = parse(e.date);
    const late = !past && e.payBy && !e.paid && e.payBy < today && ["approved", "agreement", "conditional"].includes(e.status);
    return `<a class="row${past ? " past" : ""} s-${esc(e.status)}" href="#/e/${encodeURIComponent(e.id)}">
      <div class="date"><small>${fmt(e.date, { month: "short" }).toUpperCase()}</small><b>${d.getUTCDate()}</b><i>${fmt(e.date, { weekday: "short" }).toUpperCase()}</i></div>
      <div class="t"><p class="n">${esc(e.name)}</p><p class="m">${esc(timeRange(e))}${e.endDate ? " · thru " + esc(shortDate(e.endDate)) : ""} · ${esc(e.venue || e.address || "")}</p>
      <p class="b">${statusPill(e.status)}${e.fee ? `<span class="fee">${esc(e.fee)}</span>` : ""}${e.paid ? '<span class="pill s-paid"><i></i>Paid</span>' : ""}${late ? ' <span class="pill s-due"><i></i>Past due</span>' : ""}</p></div>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }

  const UPCOMING_OK = ["approved", "agreement", "booked"];
  const WAITING = ["pending", "tentative", "conditional"];

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
      const ps = packStat(next.id);
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
          <a class="act" href="#/pack/${encodeURIComponent(next.id)}">${ring(ps.pct, ps.done)}<span>Pack ${ps.done}/${ps.total}</span></a>
          <a class="act" href="#/e/${encodeURIComponent(next.id)}">${I.cash}<span>Sales &amp; info</span></a>
        </div>
      </section>`;
    } else hero = `<section class="hero hero--empty"><p class="kicker">Next market</p><h1 class="hero__name">Nothing booked yet</h1><p class="hero__where">Find your next one in the Find tab.</p><div class="hero__acts"><a class="act act--gold" href="#/opportunities">${I.bag}<span>Find markets</span></a></div></section>`;

    const rail = upcoming.filter((e) => !next || e.id !== next.id).filter((e) => !ended(e, now)).slice(0, 8);
    const railHTML = rail.length ? `<div class="rail">${rail.map((e) => { const n = daysBetween(today, e.date); return `<a class="tag s-${esc(e.status)}" href="#/e/${encodeURIComponent(e.id)}">
        <span class="tag__hole" aria-hidden="true"></span><span class="tag__in">${n <= 0 ? "Today" : n === 1 ? "Tomorrow" : "in " + n + " days"}</span>
        <b class="tag__d">${esc(fmt(e.date, { month: "short" }).toUpperCase())} ${parse(e.date).getUTCDate()}</b><span class="tag__n">${esc(e.name)}</span>${statusPill(e.status)}</a>`; }).join("")}</div>` : "";

    const payRow = (e, late) => `<a class="payrow${late ? " late" : ""}" href="#/e/${encodeURIComponent(e.id)}"><span class="payrow__t"><b>${esc(e.name)}</b><small>${esc(e.fee || "")}${late ? " · still marked unpaid" : ""}</small></span><span class="payrow__d">${late ? "was due" : "pay by"}<b>${esc(fmt(e.payBy, { month: "short", day: "numeric" }))}</b></span></a>`;
    const nOpen = (DATA.openApplications || []).length;
    let html = `<div class="today">${hero}<div class="today__side">
      <div class="stats">
        <a class="stat" href="#/markets" data-jump="approved"><b>${approved}</b><span>Confirmed</span></a>
        <a class="stat" href="#/markets" data-jump="waiting"><b>${waiting}</b><span>Waiting</span></a>
        <a class="stat${over.length ? " alert" : ""}" href="#/money"><b>${due.length + over.length}</b><span>${over.length ? `To pay · ${over.length} late` : "To pay"}</span></a>
      </div>
      ${over.length || due.length ? sec("Fees to pay", `<a class="more-link" href="#/money">Money ›</a>`) + `<div class="card pays">${over.map((e) => payRow(e, true)).join("") + due.map((e) => payRow(e, false)).join("")}</div>` : ""}
      ${nOpen ? sec("No date yet") + `<a class="card nodate" href="#/markets" data-jump="nodate"><span><b>${nOpen} open application${nOpen === 1 ? "" : "s"}</b><small>${esc(DATA.openApplications.map((o) => o.name.replace(/\s*\(.*?\)/g, "")).join(" · "))}</small></span><span class="chev" aria-hidden="true">›</span></a>` : ""}
    </div></div>`;
    if (railHTML) html += sec("Coming up", `<a class="more-link" href="#/markets">All markets ›</a>`) + railHTML;
    html += `<div class="quick">
      <a class="qk" href="#/calendar">${I.cal}<span>Calendar</span></a>
      <a class="qk" href="#/opportunities">${I.bag}<span>Find markets</span></a>
      <a class="qk" href="#/links">${I.link}<span>Shop links</span></a>
    </div>` + footer();
    show(html);
    wireJumps();
    startClock();
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
    const chips = [["upcoming", "Upcoming", upcoming.length]].concat(Object.keys(STATUS).map((k) => [k, `${STATUS[k].icon} ${STATUS[k].label}`, count(k)]).filter((c) => c[2] > 0), nOpen ? [["nodate", "🗓 No date yet", nOpen]] : [], [["past", "Past"], ["all", "All"]]);
    if (!chips.some((c) => c[0] === filter)) filter = "upcoming";
    let html = `<div class="pagehead"><h1>Markets</h1><div class="seg seg--nav" role="group" aria-label="View"><a href="#/markets" aria-current="page">List</a><a href="#/calendar">Calendar</a></div></div>
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
    const oa = document.getElementById("openapps"); if (oa) oa.hidden = !(filter === "nodate" || filter === "all");
    box.hidden = filter === "nodate";
    wireApply(box, renderListBody);
  }

  const PAYABLE = ["approved", "agreement", "pending", "conditional"];
  function dueItems(today) {
    return DATA.events.filter((e) => e.payBy && e.payBy >= today && !e.paid && PAYABLE.includes(e.status))
      .sort((a, b) => a.payBy.localeCompare(b.payBy));
  }
  /* pay-by date already passed, still marked unpaid, market still ahead */
  function overdueItems(today) {
    return DATA.events.filter((e) => e.payBy && e.payBy < today && !e.paid && lastDay(e) >= today && (e.status === "approved" || e.status === "agreement" || e.status === "conditional"))
      .sort((a, b) => a.payBy.localeCompare(b.payBy));
  }

  /* ===== CALENDAR ===== */
  function viewCalendar() {
    setTab("list");
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
    show(`<div class="pagehead"><h1>Markets</h1><div class="seg seg--nav" role="group" aria-label="View"><a href="#/markets">List</a><a href="#/calendar" aria-current="page">Calendar</a></div></div>
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
    const overdue = e.payBy && !e.paid && e.payBy < todayISO() && lastDay(e) >= todayISO();
    const payBy = e.payBy && (overdue ? `<span class="pill s-due"><i></i>Past due</span> <span class="warn-text">was due ${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</span>` : `Pay by <b>${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</b>`);
    const pay = [e.fee && `<b>${esc(e.fee)}</b>${e.feeNote ? " · " + esc(e.feeNote) : ""}`, paidLine, e.booth && `Booth <b>${esc(e.booth)}</b>`, payBy, e.payHow && esc(e.payHow)].filter(Boolean).join("<br>");
    const today = todayISO(), n = daysBetween(today, e.date), past = lastDay(e) < today;
    const ps = packStat(e.id);
    show(`<a class="back" href="#/markets">‹ All markets</a>
      <article class="hangtag s-${esc(e.status)}">
        <span class="hangtag__hole" aria-hidden="true"></span>
        <div class="hangtag__top">${statusPill(e.status)}<span class="hangtag__count">${past ? "Past" : n <= 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days"}</span></div>
        <h1>${esc(e.name)}</h1><p class="when">${esc(whenText(e))}</p>${e.venue ? `<p class="hangtag__venue">${esc(e.venue)}</p>` : ""}
      </article>
      <div class="bigacts">
        ${e.address ? `<a class="act act--gold" href="${maps(e.address)}" target="_blank" rel="noopener">${I.pin}<span>Directions</span></a><a class="act" href="${amaps(e.address)}" target="_blank" rel="noopener">${I.map}<span>Apple Maps</span></a>` : ""}
        <button class="act" id="ics" type="button">${I.cal}<span>Add to calendar</span></button>
        ${e.link ? `<a class="act" href="${esc(e.link)}" target="_blank" rel="noopener">${I.link}<span>Event site</span></a>` : `<a class="act" href="#/links">${I.bag}<span>Store links</span></a>`}
      </div>
      <a class="boothcta" href="#/pack/${encodeURIComponent(e.id)}">${ring(ps.pct, ps.done)}<span><b>Packing checklist</b><small>${ps.done} of ${ps.total} packed · big-button booth mode</small></span><span class="chev" aria-hidden="true">›</span></a>
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

  /* ===== BOOTH MODE: one-handed packing checklist (same saved list as before: jsj.check.<id>) ===== */
  let packEdit = false, packHide = false;
  function viewPack(id) {
    const e = byId(id);
    if (!e) { setTab("list"); show(`<a class="back" href="#/markets">‹ All markets</a><p class="empty">That market isn't in the list anymore.</p>`); return; }
    setTab("booth");
    show(`<div class="booth-v"><div class="booth-h"><a class="back" href="#/e/${encodeURIComponent(e.id)}">‹ ${esc(e.name)}</a>
      <div class="booth-sum" id="bsum"></div></div><ul class="bigcheck" id="pack"></ul>
      <form class="addrow" id="addItem"><input id="newItem" placeholder="Add an item…" aria-label="Add a checklist item" maxlength="80" autocomplete="off"><button class="btn" type="submit">Add</button></form>
      <div class="booth-tools"><button class="btn small" id="hidePacked" aria-pressed="${packHide}">Hide packed</button><button class="btn small" id="editPack" aria-pressed="${packEdit}">${packEdit ? "Done editing" : "Edit list"}</button><button class="btn small" id="resetPack">Uncheck all</button><button class="btn small" id="saveTpl">Save as my default list</button></div></div>`);
    renderPack(e);
    document.getElementById("addItem").addEventListener("submit", (ev) => { ev.preventDefault(); const inp = document.getElementById("newItem"); const v = inp.value.trim(); if (!v) return; const l = checklist(e.id); l.push({ text: v, done: false }); store.set("check." + e.id, l); inp.value = ""; renderPack(e); });
    document.getElementById("resetPack").onclick = () => { if (!confirm("Uncheck everything?")) return; store.set("check." + e.id, checklist(e.id).map((i) => ({ text: i.text, done: false }))); renderPack(e); };
    document.getElementById("saveTpl").onclick = () => { store.set("packTemplate", checklist(e.id).map((i) => i.text)); toast("Saved as your default list"); };
    document.getElementById("editPack").onclick = (ev) => { packEdit = !packEdit; ev.currentTarget.setAttribute("aria-pressed", String(packEdit)); ev.currentTarget.textContent = packEdit ? "Done editing" : "Edit list"; renderPack(e); };
    document.getElementById("hidePacked").onclick = (ev) => { packHide = !packHide; ev.currentTarget.setAttribute("aria-pressed", String(packHide)); renderPack(e); };
    window.scrollTo(0, 0);
  }
  function renderPack(e) {
    const box = document.getElementById("pack"), sum = document.getElementById("bsum"); if (!box) return;
    const items = checklist(e.id); const done = items.filter((i) => i.done).length; const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    sum.innerHTML = `${ring(pct, pct + "%")}<div><b>${done === items.length && items.length ? "All packed. Go sell." : `${items.length - done} left to pack`}</b><small>${done} of ${items.length} packed · saved on this phone</small></div>`;
    box.classList.toggle("editing", packEdit);
    box.innerHTML = items.map((it, i) => (packHide && it.done && !packEdit ? "" : `<li class="${it.done ? "done" : ""}"><button type="button" class="ck" data-i="${i}" aria-pressed="${it.done}"><span class="box" aria-hidden="true">${I.check}</span><span class="tx">${esc(it.text)}</span></button>${packEdit ? `<button type="button" class="x" data-del="${i}" aria-label="Remove ${esc(it.text)}">×</button>` : ""}</li>`)).join("") || '<li class="empty">Everything is packed.</li>';
    const save = (list) => { store.set("check." + e.id, list); renderPack(e); };
    box.querySelectorAll(".ck").forEach((b) => b.addEventListener("click", () => { const l = checklist(e.id); const it = l[b.dataset.i]; it.done = !it.done; if (navigator.vibrate) navigator.vibrate(12); save(l); }));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const l = checklist(e.id); l.splice(b.dataset.del, 1); save(l); }));
  }

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
    show(`<div class="pagehead"><h1>Money</h1></div><p class="sub">Fees to pay, and what each market made. Sales are saved on this phone.</p>
      <p class="month">To pay</p>
      <div class="card pays">${over.length || due.length ? over.map((e) => dueRow(e, true)).join("") + due.map((e) => dueRow(e, false)).join("") : '<p class="empty">Nothing due right now.</p>'}</div>
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
    const store = L.store || STORE_URL;
    show(`<div class="pagehead"><h1>Shop</h1></div><p class="sub">Send customers here from the booth, Discord or socials.</p>
      ${card(store, "store", "Online store", esc(host(store)), true)}
      ${card(L.instagram || "https://www.instagram.com/jaysteeljewelry/", "ig", "Instagram", "@jaysteeljewelry", true)}
      ${card("mailto:" + EMAIL, "mail", "Email", EMAIL, false)}
      <div class="signoff"><picture><source srcset="${ROOT}assets/js-icon.webp" type="image/webp"><img src="${ROOT}assets/js-icon.png" alt="" width="256" height="244" loading="lazy"></picture><p class="wordmark">JAY STEEL JEWELRY</p></div>
      ${footer()}`);
  }

  function footer() {
    return `<p class="fine"><span class="fine__rule" aria-hidden="true"></span>Updated ${esc(DATA.updated ? fmt(DATA.updated, { month: "short", day: "numeric", year: "numeric" }) : "")} · JAY STEEL JEWELRY</p>`;
  }


  /* ---------- opportunities ---------- */
  let OPP = null, oLimit = 25, oType = "all", oState = "", oCounty = "", oVendor = false, oQuery = "", oHideApplied = false;
  const TYPE_LABEL = { college: "🎓 College", tabling: "🪧 Tabling", city: "🏙️ City", county: "🏛️ County", market: "🛍️ Market" };
  function loadOpp(fresh) {
    return fetch(ROOT + "data/opportunities.json" + (fresh ? "?t=" + Date.now() : ""), { cache: fresh ? "no-store" : "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  /* ===== FIND v9 (Oct 24 2026): search + filters, better cards, ⭐ saved shortlist, one-lead detail page.
     Everything reads data/opportunities.json (+ events.json for "already booked"); saved list lives on this phone (jsj.savedOpp). ===== */
  let oMonth = "", oFee = "", oDist = "", oStatus = "all", oSort = "date", oSeg = "browse";
  const BASE_MI = { /* rough driving miles from base (Southside Jax) — approximations, shown with "~" */
    "jacksonville": 0, "atlantic beach": 14, "neptune beach": 14, "jacksonville beach": 13, "ponte vedra beach": 20, "ponte vedra": 22,
    "orange park": 18, "fleming island": 24, "green cove springs": 32, "middleburg": 30, "yulee": 30, "fernandina beach": 40, "callahan": 35,
    "macclenny": 37, "hilliard": 45, "st. augustine (world golf village)": 27, "st. augustine": 37, "st. augustine beach": 42, "palatka": 55,
    "east palatka": 52, "palm coast": 60, "bunnell": 68, "flagler beach": 70, "ormond beach": 85, "daytona beach": 92, "port orange": 98,
    "deland": 105, "new smyrna beach": 105, "gainesville": 75, "atlanta": 345, "kennesaw": 365, "flowery branch": 360, "gainesville, ga": 365 };
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
      <div class="facts">${stChip(s)}${i.fee ? `<span class="fee">💵 ${esc(feeShort(i) || "Fee listed")}</span>` : ""}${dlBadge(d)}${i.vendorMatch ? '<span class="badge s-booked">Vendor</span>' : ""}<span class="badge s-tentative">${esc((TYPE_LABEL[i.type] || i.type).replace(/^\S+ /, ""))}</span></div>
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
      return oFee === "free" ? n === 0 : oFee === "u50" ? n >= 0 && n <= 50 : oFee === "u100" ? n >= 0 && n <= 100 : oFee === "o100" ? n > 100 : oFee === "pct" ? n < 0 : true; };
    const distOk = (i) => { if (!oDist) return true; const m = miles(i); return m != null && m <= Number(oDist); };
    const statusOk = (i) => { if (oStatus === "all") return true; const s = oppStatus(i, today).k; return oStatus === "open" ? (s === "open" || s === "new") : oStatus === s; };
    const match = (i) => (oSeg !== "saved" || saved[i.id]) && (oType === "all" || i.type === oType) && (!oState || i.state === oState) && (!oCounty || i.county === oCounty)
      && (!oVendor || i.vendorMatch) && (!oHideApplied || !isApplied(i.id)) && (!oMonth || (i.date || "").slice(0, 7) === oMonth) && feeOk(i) && distOk(i) && statusOk(i)
      && (!oQuery || `${i.title} ${i.org || ""} ${i.city || ""} ${i.county || ""} ${i.source} ${i.fee || ""}`.toLowerCase().includes(oQuery.toLowerCase()));
    const sorter = (a, b) => { if (oSort === "dist") { const x = miles(a), y = miles(b); return (x == null ? 9999 : x) - (y == null ? 9999 : y) || (a.date || "").localeCompare(b.date || ""); }
      if (oSort === "deadline") { const x = dl(a, today), y = dl(b, today); const kx = x && x.iso && x.kind !== "closed" ? x.iso : "9999", ky = y && y.iso && y.kind !== "closed" ? y.iso : "9999"; return kx.localeCompare(ky) || (a.date || "").localeCompare(b.date || ""); }
      return (a.date || "").localeCompare(b.date || ""); };
    const dated = OPP.items.filter((i) => i.date >= today || (oSeg === "saved" && saved[i.id])).filter(match).sort(sorter);
    const ongoing = (OPP.ongoing || []).filter(match).sort(oSort === "date" ? () => 0 : sorter);
    const nActive = [oMonth, oFee, oDist, oState, oCounty, oVendor, oHideApplied].filter(Boolean).length;
    const typeChips = [["all", "All"]].concat(Object.entries(TYPE_LABEL));
    const stChips = [["all", "All"], ["open", "Open"], ["new", "New"], ["applied", "Applied"], ["booked", "Booked"]];
    const sel = (id, label, opts, val) => `<label class="fsel"><span>${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    let html = `<div class="pagehead"><h1>Find</h1><div class="seg" role="tablist" aria-label="Browse or saved">
        <button role="tab" id="seg-b" aria-selected="${oSeg === "browse"}">Browse</button><button role="tab" id="seg-s" aria-selected="${oSeg === "saved"}">★ Saved${nSaved ? " · " + nSaved : ""}</button></div></div>
      ${oSeg === "saved" ? `<p class="sub">Your shortlist. Tap ☆ on any lead to keep it here; saved on this phone only.</p>` : `<p class="sub">Vendor calls, markets, college market days + city/county events across NE Florida and Georgia.</p>`}
      <div class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input class="search" type="search" id="oq" placeholder="Search events, cities, organizers…" value="${esc(oQuery)}" aria-label="Search opportunities"></div>
      <div class="chips" role="group" aria-label="Status">${stChips.map(([k, l]) => `<button class="chip" data-os="${k}" aria-pressed="${oStatus === k}">${l}</button>`).join("")}</div>
      <details class="filters"${nActive ? " open" : ""}><summary><span>Filters${nActive ? ` <b class="fcount">${nActive}</b>` : ""}</span><span class="fsort">${oSort === "date" ? "Soonest first" : oSort === "deadline" ? "Deadline first" : "Closest first"}</span></summary>
        <div class="chips" role="group" aria-label="Type">${typeChips.map(([k, l]) => `<button class="chip" data-ot="${k}" aria-pressed="${oType === k}">${l}</button>`).join("")}</div>
        <div class="fgrid">
          ${sel("odi", "Distance", [["", "Any distance"], ["25", "Within 25 mi"], ["50", "Within 50 mi"], ["75", "Within 75 mi"], ["120", "Within 120 mi"]], oDist)}
          ${sel("omo", "Month", [["", "Any month"]].concat(months.map((m) => [m, fmt(m + "-01", { month: "long", year: "numeric" })])), oMonth)}
          ${sel("ofe", "Fee", [["", "Any fee"], ["free", "Free"], ["u50", "Up to $50"], ["u100", "Up to $100"], ["o100", "Over $100"], ["pct", "% of sales"], ["unknown", "Not listed"]], oFee)}
          ${sel("oso", "Sort", [["date", "Soonest first"], ["deadline", "Deadline first"], ["dist", "Closest first"]], oSort)}
          ${sel("ost", "State", [["", "All states"], ["FL", "FL"], ["GA", "GA"]], oState)}
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
      <ul class="ledger" style="margin-top:8px">${OPP.sources.map((s) => `<li><span>${esc(s.source)}<small>${s.ok ? (s.items ? s.items + " items" : "no matching events right now") : "couldn't read: " + esc((s.error || "").split(":")[0])}</small></span><b class="${s.ok ? "pos" : "neg"}">${s.ok ? "✓" : "✕"}</b><span></span></li>`).join("")}</ul>
      <p class="fine" style="text-align:left">Refreshes every 6 hours — not live. Miles are rough driving estimates. Always confirm details on the organizer's page.</p></details>` + footer();
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
    on("ofe", "onchange", (e) => { oFee = e.target.value; oLimit = 25; viewOpp(); });
    on("oso", "onchange", (e) => { oSort = e.target.value; oLimit = 25; viewOpp(); });
    on("ov", "onclick", () => { oVendor = !oVendor; oLimit = 25; viewOpp(); });
    on("oh", "onclick", () => { oHideApplied = !oHideApplied; oLimit = 25; viewOpp(); });
    on("oclr", "onclick", () => { oMonth = oFee = oDist = oState = oCounty = ""; oVendor = oHideApplied = false; oLimit = 25; viewOpp(); });
    const q = document.getElementById("oq");
    q.addEventListener("input", debounce(() => { oQuery = q.value; const pos = q.selectionStart; oLimit = 25; viewOpp(); const nq = document.getElementById("oq"); nq.focus(); nq.setSelectionRange(pos, pos); }, 220));
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
      ${ev ? `<a class="boothcta" href="#/e/${encodeURIComponent(ev.id)}"><span class="ring" style="--p:100"><span>✓</span></span><span><b>Already on your calendar</b><small>Open the market for load-in, fees paid &amp; packing list</small></span><span class="chev" aria-hidden="true">›</span></a>` : ""}
      ${!ev && !isApplied(i.id) && !(d && d.kind === "closed") ? `<div class="apply-detail">${applyBtn({ id: i.id, name: i.title, dates: oppDates(i), link: i.url || "" })}</div>` : ""}
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
        ${kv("🔎", "Found via", esc(i.source + (i.firstSeen ? " · first seen " + fmt(i.firstSeen, { month: "short", day: "numeric" }) : "")))}
      </div>
      <div class="actions" style="margin:14px 0 0"><button class="btn small" data-ap="${esc(i.id)}" aria-pressed="${isApplied(i.id)}">${isApplied(i.id) ? "✓ Applied" : "Mark applied"}</button>${applyLink ? `<a class="btn small" href="${esc(applyLink)}" target="_blank" rel="noopener">Apply on organizer site ↗</a>` : ""}</div>
      <p class="fine" style="text-align:left;margin-top:14px">Once you're booked it moves to Markets with load-in, fees and the packing checklist. Always confirm details on the organizer's page.</p>${footer()}`);
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

  /* ---------- router ---------- */
  function route() {
    if (!DATA) return;
    const h = location.hash.replace(/^#\/?/, "");
    if (h !== "" && h !== "markets") clearInterval(tick);
    if (h.startsWith("e/")) return viewEvent(decodeURIComponent(h.slice(2)));
    if (h.startsWith("pack/")) return viewPack(decodeURIComponent(h.slice(5)));
    if (h === "markets") return viewList();
    if (h === "calendar") return viewCalendar();
    if (h === "money") return viewMoney();
    if (h.startsWith("o/")) return viewOppDetail(decodeURIComponent(h.slice(2)));
    if (h === "opportunities" || h === "saved") return viewOpp();
    if (h === "links") return viewLinks();
    viewToday();
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  if (USE_SW && "serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); }); }
  const sortEvents = (d) => { d.events.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))); return d; };

  /* ---------- refresh (Oct 20 2026): ↻ in the header, or pull down at the top of the page ----------
     Re-fetches events.json + the Find feed past every cache, and loads a new app version if one is waiting. */
  let refreshing = false, swReloading = false;
  const hadController = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing && hadController && !swReloading) { swReloading = true; location.reload(); } });
  const rbtn = document.getElementById("refresh-btn");
  async function refreshAll() {
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
      const [d, o] = await Promise.all([
        fetch(ROOT + "data/events.json?t=" + t, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        loadOpp(true).catch(() => OPP),
      ]);
      DATA = sortEvents(d); if (o) OPP = o; migrateSent();
      const y = window.scrollY; route(); window.scrollTo(0, y);
      toast("Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    } catch (_) { toast("Couldn't refresh. Check your signal"); }
    finally { if (!swReloading) { refreshing = false; if (rbtn) { rbtn.classList.remove("spin"); rbtn.removeAttribute("aria-busy"); } } }
  }
  if (rbtn) rbtn.addEventListener("click", refreshAll);
  (function pullToRefresh() {
    const ind = document.createElement("div"); ind.className = "ptr"; ind.setAttribute("aria-hidden", "true");
    ind.innerHTML = rbtn ? rbtn.querySelector("svg").outerHTML : "↻"; document.body.appendChild(ind);
    const MAX = 90, GO = 70; let y0 = null, x0 = 0, dy = 0;
    const paint = () => { const p = Math.min(dy, MAX); ind.style.opacity = String(Math.min(1, p / GO)); ind.style.transform = `translateY(${p - 20}px) rotate(${p * 3}deg)`; ind.classList.toggle("ready", dy >= GO); };
    const reset = () => { y0 = null; dy = 0; ind.style.transition = "opacity .2s, transform .2s"; ind.style.opacity = "0"; ind.style.transform = "translateY(-20px)"; ind.classList.remove("ready"); };
    window.addEventListener("touchstart", (e) => { if (window.scrollY > 0 || refreshing || document.body.classList.contains("sheet-open") || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; ind.style.transition = "none"; }, { passive: true });
    window.addEventListener("touchmove", (e) => { if (y0 == null) return; const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0); if (window.scrollY > 0 || d < 0 || dx > Math.abs(d)) { if (dy) reset(); else y0 = null; return; } dy = d * 0.6; paint(); }, { passive: true });
    window.addEventListener("touchend", () => { if (y0 == null) return; const go = dy >= GO; reset(); if (go) refreshAll(); }, { passive: true });
  })();

  fetch(ROOT + "data/events.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { DATA = sortEvents(d); migrateSent(); route(); })
    .catch(() => { app.innerHTML = '<p class="loading">Couldn\'t load the market list. Check your signal, then pull down to refresh.</p>'; });
})();
