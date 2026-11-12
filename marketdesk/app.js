/* MarketDesk — open-source vendor market command center.
   MIT. Self-hostable: any static host, GitHub Pages, Netlify, Vercel…
   Data comes from ./data/events.json + ./data/opportunities.json (override with
   ?events=… / ?opps=…, or window.MARKETDESK = { eventsUrl, opportunitiesUrl }). */
(function () {
  "use strict";
  /* ---------- config ---------- */
  const Q = new URLSearchParams(location.search);
  const CFG = Object.assign({
    title: "MarketDesk",
    eventsUrl: "data/events.json",
    opportunitiesUrl: "data/opportunities.json",
    icsUrl: "data/markets.ics",
    tabWhatsApp: "",                 // e.g. "11234567890" — enables the "Send to assistant" auto-apply row
    assistantName: "your assistant",
    unlock: null,                    // sha256 hex, or null = open app
  }, window.MARKETDESK || {});
  if (Q.get("events")) CFG.eventsUrl = Q.get("events");
  if (Q.get("opps")) CFG.opportunitiesUrl = Q.get("opps");

  const TZ = "America/New_York";
  const STATUS = {
    approved: { label: "Approved", icon: "✅" }, agreement: { label: "Agreement sent", icon: "📝" },
    pending: { label: "Pending", icon: "⏳" }, tentative: { label: "Tentative", icon: "❓" },
    booked: { label: "On my calendar", icon: "📌" }, conditional: { label: "Conditional", icon: "❓" },
    declined: { label: "Declined", icon: "❌" }
  };
  const app = document.getElementById("app");
  let DATA = null, OPP = null, filter = "upcoming", query = "", calMonth = null, calSel = null;
  let oppLoading = null;
  let oLimit = 25, oOngoing = 12, oType = "all", oSort = "date", oStatus = "all", oQuery = "", oSeg = "browse", oHideApplied = false;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const parse = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const fmt = (iso, opts) => parse(iso).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts));
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const t12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`; };
  const timeRange = (e) => e.start ? (e.end ? `${t12(e.start)}–${t12(e.end)}` : t12(e.start)) : "Time TBD";
  const lastDay = (e) => e.endDate || e.date;
  const badge = (s) => `<span class="pill s-${esc(s)}"><i></i>${esc((STATUS[s] || { label: s }).label)}</span>`;
  const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toFixed(2).replace(/\.00$/, "");
  const maps = (a) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(a);
  const amaps = (a) => "https://maps.apple.com/?daddr=" + encodeURIComponent(a);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("md." + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("md." + k, JSON.stringify(v)); } catch (_) {} }
  };
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }
  function toastAction(msg, label, fn) { const t = document.createElement("div"); t.className = "toast toast--act"; t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="toast__act">${esc(label)}</button>`; t.querySelector("button").onclick = () => { fn(); t.remove(); }; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const show = (html) => { app.innerHTML = `<div class="view">${html}</div>`; };
  const byId = (id) => (DATA && DATA.events.find((e) => e.id === id)) || null;
  const sec = (t, extra) => `<div class="sec"><h2>${t}</h2>${extra || ""}</div>`;
  const csvCell = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

  /* ---------- local actions: save / hide / apply ---------- */
  const hero = (e, extra) => `<section class="hero">
    <div class="hero__top"><p class="kicker">${e.status === "declined" ? "Past" : esc(e.statusLabel || "Market")}</p><span class="hangtag__count">${extra || ""}</span></div>
    <h1>${esc(e.name)}</h1><p class="when">${esc(e.when || "")}</p>${e.venue ? `<p class="hero__where">${esc(e.venue)}</p>` : ""}</section>`;
  const hideMap = (k) => store.get(k, {});
  const isHiddenEvent = (id) => !!hideMap("hiddenEvents")[id];
  const hideEvent = (id) => { const m = hideMap("hiddenEvents"); m[id] = true; store.set("hiddenEvents", m); };
  const showEvent = (id) => { const m = hideMap("hiddenEvents"); delete m[id]; store.set("hiddenEvents", m); };
  /* not interested: distinctly hidden, restorable on its own */
  const niMap = () => store.get("notInterested", {});
  const isNotInterested = (id) => !!niMap()[id];
  const markNotInterested = (id) => { const m = niMap(); m[id] = true; store.set("notInterested", m); };
  const unmarkNotInterested = (id) => { const m = niMap(); delete m[id]; store.set("notInterested", m); };
  const isHiddenOpp = (id) => !!hideMap("hiddenOpps")[id];
  const hideOpp = (id) => { const m = hideMap("hiddenOpps"); m[id] = true; store.set("hiddenOpps", m); };
  const showOpp = (id) => { const m = hideMap("hiddenOpps"); delete m[id]; store.set("hiddenOpps", m); };
  const savedMap = () => store.get("savedEvents", {});
  const isSavedEvent = (id) => !!savedMap()[id];
  function toggleSavedEvent(id) { const s = savedMap(); if (s[id]) { delete s[id]; toast("Removed from saved"); } else { s[id] = todayISO(); toast("⭐ Saved"); } store.set("savedEvents", s); }
  const visEvent = (e) => !!e && !isHiddenEvent(e.id) && !isNotInterested(e.id);
  const oppAll = () => (OPP ? (OPP.items || []).concat(OPP.ongoing || []) : []).filter((i) => !isHiddenOpp(i.id));
  const oppById = (id) => oppAll().find((i) => i.id === id);
  const nameKey = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  const appliedMap = () => store.get("applied", {});
  const isApplied = (id) => !!appliedMap()[id];
  function markApplied(id) { const a = appliedMap(); if (!a[id]) { a[id] = todayISO(); store.set("applied", a); } }
  function unmarkApplied(id) { const a = appliedMap(); delete a[id]; store.set("applied", a); }

  /* vendor profile + auto-apply */
  const PROF_DEFAULTS = { business: "My Business", contact: "", phone: "", ig: "", space: "10×10 tent, one 6ft table", inventory: "", setup: "", insurance: "", resale: "", notes: "" };
  const profile = () => Object.assign({}, PROF_DEFAULTS, (store.get("profile", {}) || {}));
  const saveProfile = (p) => store.set("profile", Object.assign({}, PROF_DEFAULTS, p));
  function appDraft(x) {
    const p = profile(); const L = [x.name.toUpperCase(), x.dates || "", "", `Business: ${p.business}`, `Contact: ${p.contact}${p.phone ? " · " + p.phone : ""}`, `Instagram: @${String(p.ig || "").replace(/^@/, "")}`, "", `Space needed: ${p.space}`, `Inventory: ${p.inventory}`];
    if (p.setup) L.push(`Setup: ${p.setup}`); if (p.insurance) L.push(`Insurance: ${p.insurance}`); if (p.resale) L.push(`Resale certificate: ${p.resale}`); if (p.notes) L.push(`Notes: ${p.notes}`);
    L.push("", "Prepared with MarketDesk.");
    return L.join("\n");
  }
  const appMailto = (email, x) => "mailto:" + String(email || "").replace(/^mailto:/, "").replace(/\s/g, "") + "?subject=" + encodeURIComponent("Vendor application — " + x.name) + "&body=" + encodeURIComponent(appDraft(x));
  function autoApplySheet(x, email, opener) {
    const old = document.getElementById("applymd"); if (old) old.remove();
    const wrap = document.createElement("div"); wrap.className = "sheet-wrap"; wrap.id = "applymd";
    const wa = CFG.tabWhatsApp ? ("https://wa.me/" + CFG.tabWhatsApp + "?text=" + encodeURIComponent(x.name + " — " + (x.dates || "") + (x.link ? " — " + x.link : "") + "\n\n" + appDraft(x))) : "";
    const rows = [];
    if (email && /@/.test(email)) rows.push(`<a class="auto-row" href="${esc(appMailto(email, x))}"><b>📧 Email the organizer</b><small>Opens Mail with everything filled in</small></a>`);
    if (x.link) rows.push(`<button type="button" class="auto-row" id="md-copy"><b>↗️ Application link + copy draft</b><small>Opens the organizer page with your application copied</small></button>`);
    if (wa) rows.push(`<a class="auto-row" href="${esc(wa)}" target="_blank" rel="noopener"><b>🟢 Send to ${esc(CFG.assistantName)}</b><small>WhatsApp — they file it for you</small></a>`);
    if (!rows.length) rows.push(`<p class="sheet-note">No organizer email or application link on this lead yet.</p>`);
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="md-t" aria-describedby="md-d">
      <p class="eyebrow">Auto-apply</p><h3 id="md-t">${esc(x.name)}</h3>
      <p id="md-d" class="sheet-note">Filled from your vendor profile (Settings › My vendor profile). Pick how to submit — fees and sign-ups stay yours to confirm.</p>
      <div class="auto">${rows.join("")}</div>
      <div class="actions"><button type="button" class="btn" id="md-no">Cancel</button></div></div>`;
    document.body.appendChild(wrap); document.body.classList.add("sheet-open");
    const close = () => { wrap.remove(); document.body.classList.remove("sheet-open"); document.removeEventListener("keydown", onKey); if (opener && document.body.contains(opener)) opener.focus(); };
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", (ev) => { if (ev.target === wrap) close(); });
    document.getElementById("md-no").onclick = close;
    const cp = document.getElementById("md-copy");
    if (cp) cp.onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(appDraft(x)) : Promise.reject()).then(() => toast("Application copied — paste it into the form")).catch(() => toast("Long-press to copy")); window.open(x.link, "_blank", "noopener"); setTimeout(close, 250); };
    markApplied(x.id);
    document.getElementById("md-no").focus();
  }
  const autoBtn = (id) => `<button type="button" class="btn small primary" data-auto="${esc(id)}">⚡ Auto-apply</button>`;
  function wireAuto(root, rerender) {
    (root || app).querySelectorAll("[data-auto]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const x = oppById(b.dataset.auto) || byId(b.dataset.auto); if (!x) return;
      autoApplySheet({ name: x.name || x.title, dates: x.dates || oppos(x) || whenText(x), link: x.registration_url || x.url || x.link || "" }, x.contact_email || x.email || (x.contact && x.contact.email) || "", b);
      if (rerender) rerender();
    }));
  }

  /* ---------- to-do ---------- */
  const K_TODOS = "todos";
  const todos = () => { try { const t = store.get(K_TODOS, []); return Array.isArray(t) ? t : []; } catch (_) { return []; } };
  const saveTodos = (t) => store.set(K_TODOS, t);
  const toPay = (e) => !!e.payBy && e.paid !== true && !e.hideFromToPay;
  function dueItems(today) { return (DATA.events || []).filter((e) => visEvent(e) && toPay(e) && e.payBy >= today).sort((a, b) => a.payBy.localeCompare(b.payBy)); }
  function overdueItems(today) { return (DATA.events || []).filter((e) => visEvent(e) && toPay(e) && e.payBy < today && lastDay(e) >= today).sort((a, b) => a.payBy.localeCompare(b.payBy)); }
  function systemTasks(today) {
    today = today || todayISO(); const ts = [];
    overdueItems(today).forEach((e) => ts.push({ id: "pay:" + e.id, kind: "fee", level: 1, t: "Pay " + (e.fee || "the fee") + " — " + e.name, s: "Fee overdue", href: "#/e/" + encodeURIComponent(e.id) }));
    dueItems(today).slice(0, 4).forEach((e) => ts.push({ id: "pay:" + e.id, kind: "fee", level: 2, t: "Pay by " + fmt(e.payBy, { month: "short", day: "numeric" }) + " — " + e.name, s: "Fee due", href: "#/e/" + encodeURIComponent(e.id) }));
    (DATA.events || []).filter((e) => visEvent(e) && e.applyBy && e.applyBy >= today && daysBetween(today, e.applyBy) <= 14 && !isApplied(e.id))
      .forEach((e) => ts.push({ id: "app:" + e.id, kind: "apply", level: daysBetween(today, e.applyBy) <= 3 ? 1 : 2, t: "Apply by " + fmt(e.applyBy, { month: "short", day: "numeric" }) + " — " + e.name, s: "Application deadline", href: "#/e/" + encodeURIComponent(e.id) }));
    if (OPP) oppAll().filter((i) => i.deadline && i.deadline >= today && daysBetween(today, i.deadline) <= 14 && !isApplied(i.id))
      .forEach((i) => ts.push({ id: "opp:" + i.id, kind: "apply", level: daysBetween(today, i.deadline) <= 3 ? 1 : 2, t: "Deadline " + fmt(i.deadline, { month: "short", day: "numeric" }) + " — " + String(i.title || "").slice(0, 60), s: "Vendor application deadline", href: "#/o/" + encodeURIComponent(i.id) }));
    return ts.sort((a, b) => a.level - b.level || a.t.localeCompare(b.t)).slice(0, 14);
  }
  function todoCount() { return Math.min(9, systemTasks().length + todos().filter((t) => !t.done).length); }
  function paintBadge() { const n = todoCount(); ["todo-badge", "todo-menu-count"].forEach((id) => { const el = document.getElementById(id); if (!el) return; if (n > 0) { el.hidden = false; el.textContent = n; } else el.hidden = true; }); }

  /* ---------- menu ---------- */
  (function menu() {
    const btn = document.getElementById("menu-btn"), more = document.getElementById("more-btn"), nav = document.getElementById("menu"), scrim = document.getElementById("menu-scrim"), x = document.getElementById("menu-close");
    if (!btn || !nav) return;
    const set = (open) => {
      btn.setAttribute("aria-expanded", String(open)); if (more) more.setAttribute("aria-expanded", String(open));
      nav.setAttribute("aria-hidden", String(!open)); nav.classList.toggle("open", open); scrim.hidden = !open;
      document.body.classList.toggle("menu-open", open);
      if (open) { const f = nav.querySelector("[aria-current]") || nav.querySelector("a"); f && f.focus(); }
    };
    set(false); btn.blur();
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    if (more) more.addEventListener("click", () => set(more.getAttribute("aria-expanded") !== "true"));
    scrim.addEventListener("click", () => set(false)); x.addEventListener("click", () => set(false));
    nav.querySelectorAll("a").forEach((l) => l.addEventListener("click", () => set(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) set(false); });
  })();

  const TAB_NAME = { today: "Today", todo: "To-Do", list: "Markets", opp: "Find", map: "Map", cal: "Calendar", money: "Payments", settings: "Settings", about: "About" };
  function setTab(name) {
    document.querySelectorAll(".menu a[data-tab], .dock a[data-tab]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.tab === name));
    const pn = document.getElementById("page-name"); if (pn) pn.textContent = TAB_NAME[name] || "";
    document.body.dataset.tab = name;
  }

  function download(name, text, type) { const blob = new Blob([text], { type: type || "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  const whenText = (e) => { const d = fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); const multi = e.endDate ? " – " + fmt(e.endDate, { weekday: "short", month: "short", day: "numeric" }) : ""; return d + multi + " · " + timeRange(e) + (e.endDate ? " nightly" : ""); };
  const oppos = (i) => i.date ? fmt(i.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : (i.when || "Ongoing · apply anytime");
  function ics(events) {
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const eI = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MarketDesk//Open Vendor OS//EN", "CALSCALE:GREGORIAN"];
    events.forEach((e) => {
      const d = e.date.replace(/-/g, ""); lines.push("BEGIN:VEVENT", "UID:" + e.id + "@marketdesk", "DTSTAMP:" + stamp);
      if (e.start) { lines.push("DTSTART;TZID=" + TZ + ":" + d + "T" + e.start.replace(":", "") + "00", "DTEND;TZID=" + TZ + ":" + d + "T" + (e.end || e.start).replace(":", "") + "00"); if (e.endDate) lines.push("RRULE:FREQ=DAILY;COUNT=" + (daysBetween(e.date, e.endDate) + 1)); }
      else { const end = parse(lastDay(e)); end.setUTCDate(end.getUTCDate() + 1); lines.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + end.getUTCFullYear() + pad(end.getUTCMonth() + 1) + pad(end.getUTCDate())); }
      lines.push("SUMMARY:" + eI((STATUS[e.status] || {}).icon + " " + e.name).trim());
      if (e.address) lines.push("LOCATION:" + eI(e.address));
      lines.push("DESCRIPTION:" + eI([e.fee && "Fee: " + e.fee, e.payBy && "Pay by: " + e.payBy, e.setup, e.nextStep].filter(Boolean).join("\n")), "END:VEVENT");
    });
    lines.push("END:VCALENDAR"); return lines.join("\r\n") + "\r\n";
  }

  /* ===== views ===== */
  function viewToday() {
    setTab("today"); const today = todayISO();
    const up = (DATA.events || []).filter((e) => visEvent(e) && lastDay(e) >= today && e.status !== "declined").sort((a, b) => a.date.localeCompare(b.date));
    const next = up[0];
    const strip = next ? `<a class="next-strip" href="#/e/${encodeURIComponent(next.id)}"><span class="next-strip__ic">📅</span><span class="next-strip__t"><b>${esc(next.name)}</b><small>${esc(whenText(next))}${next.venue ? " · " + esc(next.venue) : ""}</small></span><span class="next-strip__c"><b>${daysBetween(today, next.date) === 0 ? "Today" : daysBetween(today, next.date) === 1 ? "1 day" : daysBetween(today, next.date) + " days"}</b></span><span class="chev">›</span></a>`
      : `<a class="next-strip" href="#/opportunities"><span class="next-strip__ic">🔍</span><span class="next-strip__t"><b>Nothing booked yet</b><small>Find markets to look for the next one</small></span><span class="chev">›</span></a>`;
    const quick = `<div class="quick4"><a class="q4 q4--list" href="#/markets">${I.cal}<span>Markets</span></a><a class="q4 q4--opp" href="#/opportunities">${I.search}<span>Find</span></a><a class="q4 q4--map" href="#/map">${I.map}<span>Map</span></a><a class="q4 q4--cal" href="#/calendar">${I.cal}<span>Calendar</span></a></div>`;
    const over = overdueItems(today), due = dueItems(today), owe = over.concat(due);
    const feeNum = (s) => { const m = String(s || "").replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
    const sum = owe.reduce((a, e) => a + (feeNum(e.fee) || 0), 0);
    const moneyHTML = owe.length ? `<a class="card money-line${over.length ? " late" : ""}" href="#/money"><span class="money-line__t"><b>${sum ? money(sum) : "Fees due"} · ${owe.length} fee${owe.length === 1 ? "" : "s"}${over.length ? " · " + over.length + " late" : ""}</b><small>Payments</small></span><span class="chev">›</span></a>` : `<div class="card"><p class="m" style="margin:0">Nothing due right now.</p></div>`;
    const tt = systemTasks().slice(0, 3);
    const todoSnap = tt.length ? `<a class="card todo-snap" href="#/todo"><span class="todo-snap__h"><b>⚡ ${tt.length} thing${tt.length === 1 ? "" : "s"} need you</b><span class="chev">›</span></span>${tt.map((x) => `<i>${x.t}</i>`).join("")}</a>` : "";
    show(`<div class="pagehead"><h1>Today</h1></div>${strip}${quick}${todoSnap}${moneyHTML}${footer()}`);
  }

  function viewTodo() {
    setTab("todo"); const today = todayISO(); const sys = systemTasks(today); const mine = todos();
    const open = mine.filter((t) => !t.done), done = mine.filter((t) => t.done);
    const row = (x) => `<a class="trow${x.level === 1 ? " trow--urgent" : ""}" href="${x.href}"><span class="tdot ${x.kind === "fee" ? "d-fee" : "d-apply"}"></span><span><b>${x.t}</b>${x.s ? `<small>${x.s}</small>` : ""}</span><span class="chev">›</span></a>`;
    const myRow = (x) => `<div class="mrow${x.done ? " mrow--done" : ""}"><button class="mchk" type="button" data-mid="${esc(x.id)}" aria-pressed="${x.done ? "true" : "false"}">${x.done ? "✓" : ""}</button><span>${esc(x.text)}</span><button class="x" type="button" data-mdel="${esc(x.id)}" aria-label="Delete">×</button></div>`;
    show(`<div class="pagehead"><h1>To-Do</h1></div><p class="sub">Fees, deadlines, applications — plus your own list.</p>
      ${sys.length ? sec("Needs you", `<span class="more-link">${sys.length} open</span>`) + `<div class="tlist">${sys.map(row).join("")}</div>` : `<div class="card"><p class="m" style="margin:0">Nothing pending. 🎉</p></div>`}
      <p class="month">My list</p>
      <form class="tadd" id="tadd"><input id="ttext" placeholder="Add a task…" maxlength="120" aria-label="New task"><button class="btn primary" type="submit">Add</button></form>
      ${open.length ? `<div class="mvlist">${open.map(myRow).join("")}</div>` : ""}
      ${done.length ? `<details class="panel"><summary>Done (${done.length})</summary><div class="mvlist">${done.map(myRow).join("")}</div></details>` : ""}${footer()}`);
    document.getElementById("tadd").addEventListener("submit", (ev) => { ev.preventDefault(); const v = document.getElementById("ttext").value.trim(); if (!v) return; const t = todos(); t.push({ id: "t" + Date.now(), text: v.slice(0, 120), done: false }); saveTodos(t); viewTodo(); paintBadge(); });
    app.querySelectorAll("[data-mid]").forEach((b) => b.addEventListener("click", () => { const t = todos(); const x = t.find((y) => y.id === b.dataset.mid); if (x) x.done = !x.done; saveTodos(t); viewTodo(); paintBadge(); }));
    app.querySelectorAll("[data-mdel]").forEach((b) => b.addEventListener("click", () => { saveTodos(todos().filter((y) => y.id !== b.dataset.mdel)); toast("Task removed"); viewTodo(); paintBadge(); }));
  }

  const UPCOMING = ["upcoming", "past", "saved"];
  function viewMarkets() {
    setTab("list"); const today = todayISO();
    const up = (DATA.events || []).filter((e) => lastDay(e) >= today);
    const hidePast = !!SETS().hidePast;
    if (hidePast && filter === "past") filter = "upcoming";
    const chips = [["upcoming", "Upcoming", up.length]].concat(Object.keys(savedMap()).length ? [["saved", "⭐ Saved", Object.keys(savedMap()).length]] : []).concat(hidePast ? [] : [["past", "Past", (DATA.events || []).length - up.length]]);
    const chipHTML = (c, k) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${c}${k === "upcoming" ? ` <span class="n">${up.length}</span>` : ""}</button>`;
    show(`<div class="pagehead"><h1>Markets</h1></div>
      <div class="searchbox">${I.search}<input class="search" id="q" type="search" placeholder="Search markets, places…" value="${esc(query)}" aria-label="Search markets"></div>
      <div class="chips">${chips.map(([name, k]) => chipHTML(name, k)).join("")}</div>
      <div id="mbody"></div>${footer()}`);
    document.getElementById("q").addEventListener("input", debounce(() => { query = document.getElementById("q").value.trim(); renderMarkets(); }, 160));
    app.querySelectorAll(".chip[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; app.querySelectorAll(".chip[data-f]").forEach((c) => c.setAttribute("aria-pressed", String(c === b))); renderMarkets(); }));
    renderMarkets();
  }
  function renderMarkets() {
    const box = document.getElementById("mbody"); if (!box) return; const today = todayISO(); const ql = query.toLowerCase();
    let list = (DATA.events || []).filter((e) => {
      if (isHiddenEvent(e.id)) return false;
      const past = lastDay(e) < today;
      if (filter === "saved" && !isSavedEvent(e.id)) return false;
      if (filter === "past" && !past) return false;
      if (filter === "upcoming" && past) return false;
      if (ql && !`${e.name} ${e.venue || ""} ${e.address || ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    if (filter === "past") list = list.slice().reverse();
    let month = "";
    box.innerHTML = list.length ? `<div class="chain">${list.map((e) => {
      const m = fmt(e.date, { month: "long", year: "numeric" }); const head = m !== month ? `<p class="month" style="margin-left:-30px;padding-left:30px">${m}</p>` : ""; month = m;
      const past = lastDay(e) < today; const late = !past && toPay(e) && e.payBy < today;
      return head + `<div class="link-item${past ? " is-past" : ""}"><span class="node"></span><a class="row${past ? " past" : ""}" href="#/e/${encodeURIComponent(e.id)}">
        <span class="date"><small>${fmt(e.date, { month: "short" }).toUpperCase()}</small><b>${parse(e.date).getUTCDate()}</b><i>${fmt(e.date, { weekday: "short" }).toUpperCase()}</i></span>
        <span class="t"><p class="n">${esc(e.name)}</p><p class="m">${esc(timeRange(e))}${e.endDate ? " · thru " + esc(fmt(e.endDate, { month: "short", day: "numeric" })) : ""} · ${esc(e.venue || e.address || "")}</p>
        <p class="b">${badge(e.status)}${e.fee ? `<span class="fee">${esc(e.fee)}</span>` : ""}${e.paid ? '<span class="pill s-paid"><i></i>Paid</span>' : ""}${late ? ' <span class="pill s-due"><i></i>Past due</span>' : ""}</p></span><span class="chev">›</span></a></div>`;
    }).join("")}</div>` : `<p class="empty">No markets here.</p>`;
  }

  function viewEvent(id) {
    setTab("list"); const e = byId(id);
    if (!e) { show(`<a class="back" href="#/markets">‹ All markets</a><p class="empty">That market isn't in the list.</p>`); return; }
    if (isHiddenEvent(id)) { show(`<a class="back" href="#/markets">‹ All markets</a><div class="card"><p class="m" style="margin:0 0 10px">Hidden on this device.</p><button class="btn small" id="unh">Put it back</button></div>`); document.getElementById("unh").onclick = () => { showEvent(id); viewEvent(id); }; return; }
    const c = e.contact || {}; const today = todayISO(); const n = daysBetween(today, e.date); const past = lastDay(e) < today;
    const paidLine = (e.status === "approved" || e.status === "agreement" || e.status === "conditional") ? (e.paid ? "✅ Paid" : "⚠️ Not paid yet") : "";
    const pay = [e.fee && `<b>${esc(e.fee)}</b>`, paidLine, e.booth && `Booth <b>${esc(e.booth)}</b>`, e.payBy ? `Pay by <b>${esc(fmt(e.payBy, { month: "short", day: "numeric" }))}</b>` : "", e.payHow && esc(e.payHow)].filter(Boolean).join("<br>");
    const canApply = e.status !== "declined" && lastDay(e) >= today && !e.paid;
    show(`${hero({ name: e.name, when: whenText(e), venue: e.venue, statusLabel: past ? "Past" : n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days" })}
      <div class="bigacts">
        ${e.address ? `<a class="act act--gold" href="${esc(/iphone|ipad|ipod/i.test(navigator.userAgent) ? amaps(e.address) : maps(e.address))}" target="_blank" rel="noopener">🧭<span>Directions</span></a>` : ""}
        <button class="act" id="ics" type="button">📅<span>Add to calendar</span></button>
        <button class="act" id="save-ev" type="button" aria-pressed="${isSavedEvent(e.id)}">${isSavedEvent(e.id) ? "★" : "☆"}<span>${isSavedEvent(e.id) ? "Saved" : "Save"}</span></button>
        <button class="act act--noi" id="noi-ev" type="button" aria-pressed="${isNotInterested(e.id) ? "true" : "false"}">🙅<span>${isNotInterested(e.id) ? "Not interested" : "Not interested"}</span></button>
        <button class="act act--danger" id="hide-ev" type="button">🗑<span>Remove</span></button>
      </div>
      ${canApply ? `<div class="apply-detail actions">${autoBtn(e.id)}</div>` : ""}
      <div class="card info">
        <div class="kv"><span class="ic">📍</span><div><p class="k">Where</p><p class="v">${esc(e.venue || "")}${e.address ? "<br>" + esc(e.address) : ""}</p></div></div>
        <div class="kv"><span class="ic">💵</span><div><p class="k">Fee · how paid</p><p class="v">${pay}</p></div></div>
        ${c.name || c.email ? `<div class="kv"><span class="ic">☎️</span><div><p class="k">Contact</p><p class="v">${esc(c.name || "")}${c.email ? "<br><a href=\"mailto:" + esc(c.email) + "\">" + esc(c.email) + "</a>" : ""}</p></div></div>` : ""}
        ${e.setup ? `<div class="kv"><span class="ic">🧰</span><div><p class="k">Setup</p><p class="v">${esc(e.setup)}</p></div></div>` : ""}
        ${e.nextStep ? `<div class="kv"><span class="ic">➡️</span><div><p class="k">Next step</p><p class="v">${esc(e.nextStep)}</p></div></div>` : ""}
        ${e.notes ? `<div class="kv"><span class="ic">📝</span><div><p class="k">Notes</p><p class="v">${esc(e.notes)}</p></div></div>` : ""}
      </div>
      ${sec("Sales &amp; expenses")}<div class="card" id="money"></div>${footer()}`);
    document.getElementById("ics").onclick = () => download(`${e.id}.ics`, ics([e]), "text/calendar");
    document.getElementById("save-ev").onclick = () => { toggleSavedEvent(e.id); viewEvent(id); };
    document.getElementById("hide-ev").onclick = () => { hideEvent(e.id); toastAction(e.name + " removed", "Undo", () => { showEvent(e.id); viewEvent(id); }); location.replace("#/markets"); renderMarkets(); };
    document.getElementById("noi-ev").onclick = () => { if (isNotInterested(e.id)) { unmarkNotInterested(e.id); toast("Back on the list"); } else { markNotInterested(e.id); toastAction(e.name + " marked not interested", "Undo", () => { unmarkNotInterested(e.id); viewEvent(id); }); } viewEvent(id); };
    wireAuto(app, () => viewEvent(id));
    renderTally(e);
  }
  function renderTally(e) {
    const box = document.getElementById("money"); if (!box) return;
    const rows = store.get("tally." + e.id, []);
    const t = rows.reduce((a, r) => { if (r.type === "sale") a.sales += r.amount; else a.exp += r.amount; return a; }, { sales: 0, exp: 0 });
    box.innerHTML = `<form class="form" id="tform"><input id="amt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Amount $" required><select id="method"><option>Card</option><option>Cash</option><option>Cash App / Zelle</option><option>Other</option></select><input class="full" id="note" placeholder="What sold / what for" maxlength="80"><button class="btn primary full" type="submit">Add entry</button></form>
      <div class="tot"><div><b class="pos">${money(t.sales)}</b><span>Sales</span></div><div><b class="neg">${money(t.exp)}</b><span>Expenses</span></div><div><b class="${t.sales - t.exp >= 0 ? "pos" : "neg"}">${money(t.sales - t.exp)}</b><span>Profit</span></div></div>
      <ul class="ledger">${rows.length ? rows.slice().reverse().map((r) => `<li><span>${esc(r.note || r.type)}<small>${esc(r.method || "")} · ${new Date(r.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></span><b class="${r.type === "sale" ? "pos" : "neg"}">${r.type === "sale" ? "+" : "−"}${money(r.amount)}</b><button class="x" data-rm="${r.at}">×</button></li>`).join("") : '<li class="empty">No entries yet.</li>'}</ul>`;
    document.getElementById("tform").addEventListener("submit", (ev) => { ev.preventDefault(); const amount = parseFloat(document.getElementById("amt").value); if (!(amount > 0)) { toast("Enter an amount"); return; } const l = store.get("tally." + e.id, []); l.push({ type: "sale", amount: Math.round(amount * 100) / 100, method: document.getElementById("method").value, note: document.getElementById("note").value.trim(), at: Date.now() }); store.set("tally." + e.id, l); renderTally(e); toast("Added"); });
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { store.set("tally." + e.id, store.get("tally." + e.id, []).filter((r) => String(r.at) !== b.dataset.rm)); renderTally(e); }));
  }

  function viewCalendar() {
    setTab("cal"); const today = todayISO(); if (!calMonth) calMonth = today.slice(0, 7);
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1, 12)); const startDow = first.getUTCDay();
    const daysIn = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    const map = {};
    (DATA.events || []).forEach((e) => { if (isHiddenEvent(e.id)) return; let d = e.date; const end = lastDay(e); while (d <= end) { (map[d] = map[d] || []).push(e); const nd = parse(d); nd.setUTCDate(nd.getUTCDate() + 1); d = nd.toISOString().slice(0, 10); } });
    let cells = ""; for (let i = 0; i < startDow; i++) cells += `<div class="day out"></div>`;
    for (let d = 1; d <= daysIn; d++) { const iso = calMonth + "-" + String(d).padStart(2, "0"); const evs = map[iso] || []; cells += `<button class="day${iso === today ? " today" : ""}${iso === calSel ? " sel" : ""}${evs.length ? " has" : ""}${iso < today ? " gone" : ""}" data-d="${iso}"><span class="num">${d}</span><span class="dots">${evs.slice(0, 4).map((e) => `<i class="dot s-${e.status}"></i>`).join("")}</span></button>`; }
    const sel = calSel && map[calSel] ? map[calSel] : null;
    const monthEvents = (DATA.events || []).filter((e) => !isHiddenEvent(e.id) && e.date.startsWith(calMonth));
    const next = (DATA.events || []).filter((e) => visEvent(e) && lastDay(e) >= today && e.status !== "declined").sort((a, b) => a.date.localeCompare(b.date))[0];
    const nd = next && daysBetween(today, next.date);
    const countdown = next ? `<a class="cal-cta" href="#/e/${encodeURIComponent(next.id)}"><span class="cal-cta__l"><small>Next market</small><b>${esc(next.name)}</b></span><span class="cal-cta__c">${nd === 0 ? "Today" : nd === 1 ? "1 day" : nd + " days"}</span><span class="chev">›</span></a>`
      : `<a class="cal-cta" href="#/opportunities"><span class="cal-cta__l"><small>Next market</small><b>Nothing booked yet</b></span><span class="chev">›</span></a>`;
    show(`<div class="pagehead"><h1>Calendar</h1></div>${countdown}
      <div class="card calcard"><div class="cal-head"><button class="iconbtn" id="prev">‹</button><h2>${fmt(calMonth + "-01", { month: "long", year: "numeric" })}</h2><button class="iconbtn" id="nextm">›</button></div>
      <div class="grid">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells}</div>
      <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span class="s-${k}"><i class="dot"></i><em>${v.label}</em></span>`).join("")}</div></div>
      <p class="month">${sel ? fmt(calSel, { weekday: "long", month: "long", day: "numeric" }) : "This month"}</p>
      <div class="list">${(sel || monthEvents).map((e) => `<a class="row" href="#/e/${encodeURIComponent(e.id)}"><span class="date"><small>${fmt(e.date, { month: "short" }).toUpperCase()}</small><b>${parse(e.date).getUTCDate()}</b><i>${fmt(e.date, { weekday: "short" }).toUpperCase()}</i></span><span class="t"><p class="n">${esc(e.name)}</p><p class="m">${esc(timeRange(e))}</p></span><span class="chev">›</span></a>`).join("") || '<p class="empty">No markets this month.</p>'}</div>
      <button class="btn full" id="icsall" style="margin-top:16px">📅 Add all upcoming to my phone calendar (.ics)</button>${footer()}`);
    app.querySelectorAll(".day[data-d]").forEach((b) => b.addEventListener("click", () => { calSel = calSel === b.dataset.d ? null : b.dataset.d; viewCalendar(); }));
    document.getElementById("prev").onclick = () => { calMonth = shift(calMonth, -1); calSel = null; viewCalendar(); };
    document.getElementById("nextm").onclick = () => { calMonth = shift(calMonth, 1); calSel = null; viewCalendar(); };
    document.getElementById("icsall").onclick = () => download("markets.ics", ics((DATA.events || []).filter((e) => lastDay(e) >= today)), "text/calendar");
  }
  const shift = (ym, n) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

  function viewMoney() {
    setTab("money"); const today = todayISO(); const due = dueItems(today), over = overdueItems(today);
    const withRows = (DATA.events || []).filter(visEvent).map((e) => ({ e, t: (store.get("tally." + e.id, []) || []).reduce((a, r) => { if (r.type === "sale") a.sales += r.amount; else a.exp += r.amount; return a; }, { sales: 0, exp: 0 }), n: store.get("tally." + e.id, []).length })).filter((x) => x.n);
    show(`<div class="pagehead"><h1>Payments</h1></div><p class="sub">Fees to pay and what each market made.</p>
      <p class="month">To pay</p>
      <div class="card pays">${over.length || due.length ? over.map((e) => payRow(e, true)).join("") + due.map((e) => payRow(e)).join("") : '<p class="empty">Nothing due right now.</p>'}</div>
      <p class="month">All markets · totals</p>
      <div class="tot"><div><b class="pos">${money(withRows.reduce((a, x) => a + x.t.sales, 0))}</b><span>Sales</span></div><div><b class="neg">${money(withRows.reduce((a, x) => a + x.t.exp, 0))}</b><span>Expenses</span></div><div><b>${money(withRows.reduce((a, x) => a + x.t.sales - x.t.exp, 0))}</b><span>Profit</span></div></div>
      <div class="card"><ul class="ledger">${withRows.length ? withRows.map((x) => `<li><a href="#/e/${encodeURIComponent(x.e.id)}">${esc(x.e.name)}<small>${esc(fmt(x.e.date, { month: "short", day: "numeric" }))} · ${x.n} entr${x.n === 1 ? "y" : "ies"}</small></a><b class="${x.t.sales - x.t.exp >= 0 ? "pos" : "neg"}">${money(x.t.sales - x.t.exp)}</b></li>`).join("") : '<li class="empty">No sales logged yet.</li>'}</ul></div>
      <div class="actions"><button class="btn primary full" id="csvall">⬇︎ Export all (CSV)</button><button class="btn small" id="backup">Back up</button><label class="btn small" for="restore">Restore<input type="file" id="restore" accept="application/json" class="visually-hidden"></label></div>${footer()}`);
    document.getElementById("csvall").onclick = () => download("markets-sales.csv", toCSV(), "text/csv");
    document.getElementById("backup").onclick = () => { const dump = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("md.")) dump[k] = localStorage.getItem(k); } download("marketdesk-backup-" + today + ".json", JSON.stringify(dump, null, 1), "application/json"); };
    document.getElementById("restore").addEventListener("change", (ev) => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); Object.keys(d).forEach((k) => { if (k.startsWith("md.")) localStorage.setItem(k, d[k]); }); toast("Backup restored"); viewMoney(); } catch (_) { toast("That file isn't a backup"); } }; r.readAsText(f); });
  }
  function payRow(e, late) { return `<a class="payrow${late ? " late" : ""}" href="#/e/${encodeURIComponent(e.id)}"><span class="payrow__t"><b>${esc(e.name)}</b>${e.fee ? `<small>${esc(e.fee)}</small>` : ""}</span><span class="payrow__d"><b>${esc(fmt(e.payBy, { month: "short", day: "numeric" }))}</b>${late ? "was due" : "pay by"}</span></a>`; }
  function toCSV() {
    const out = [["market", "date", "type", "amount", "method", "note", "time"].join(",")];
    (DATA.events || []).forEach((e) => (store.get("tally." + e.id, []) || []).forEach((r) => out.push([e.name, e.date, r.type, (r.type === "sale" ? r.amount : -r.amount).toFixed(2), r.method, r.note, new Date(r.at).toISOString()].map(csvCell).join(","))));
    return out.join("\n") + "\n";
  }

  /* ---------- Find ---------- */
  function loadOpp(fresh) { const get = (f) => fetch(CFG.opportunitiesUrl + (fresh ? "?t=" + Date.now() : ""), { cache: fresh ? "no-store" : "no-cache" }); return get("").then((r) => (r.ok ? r.json() : Promise.reject(r.status))); }
  function viewOpp() {
    setTab("opp");
    if (!OPP && !needOpp()) return;
    const today = todayISO();
    const all = oppAll();
    const miles = () => null; const feeNum = (i) => { if (!i.fee) return null; if (/\bfree\b/i.test(i.fee || "")) return 0; const m = String(i.fee).match(/\$\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g, "")) : null; };
    const stChip = (i) => { const applied = isApplied(i.id); const d = String(i.deadline || ""); const closed = /sold out|closed|passed/i.test(d) || (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today); return `<span class="st ${applied ? "st--applied" : closed ? "st--closed" : "st--open"}"><i></i>${applied ? "Applied" : closed ? "Closed" : "Open"}</span>`; };
    const feeShort = (i) => { const n = feeNum(i); return n == null ? "💵 " + String(i.fee || "Fee not listed").slice(0, 22) : n === 0 ? "💵 Free" : "💵 $" + n; };
    const match = (i) => (oSeg !== "saved" || savedOpps()[i.id]) && (oType === "all" || i.type === oType) && (!oHideApplied || !isApplied(i.id)) && (!oQuery || `${i.title} ${i.org || ""} ${i.city || ""} ${i.fee || ""}`.toLowerCase().includes(oQuery.toLowerCase()));
    const sorter = (a, b) => { if (oSort === "fee") return (feeNum(a) ?? 1e9) - (feeNum(b) ?? 1e9); return String(a.date || "z").localeCompare(String(b.date || "z")); };
    const dated = (OPP.items || []).filter((i) => i.date >= today).filter(match).sort(sorter);
    const ongoing = (OPP.ongoing || []).filter(match).sort(sorter);
    const card = (i) => `<article class="opp2${isApplied(i.id) ? " dim" : ""}">
      <div class="row"><span class="date"><small>${i.date ? fmt(i.date, { month: "short" }).toUpperCase() : "ANY"}</small><b>${i.date ? parse(i.date).getUTCDate() : "∞"}</b><i>${i.date ? fmt(i.date, { weekday: "short" }).toUpperCase() : "TIME"}</i></span>
        <a class="t" href="#/o/${encodeURIComponent(i.id)}"><p class="n">${esc(i.title)}</p><p class="m">${esc([i.city, i.state].filter(Boolean).join(", "))}${i.time ? " · " + esc(i.time) : ""}</p></a>
        <button class="star" data-star="${esc(i.id)}" aria-pressed="${savedOpps()[i.id] ? "true" : "false"}">${savedOpps()[i.id] ? "★" : "☆"}</button></div>
      <div class="facts">${stChip(i)}<span class="fee">${feeShort(i)}</span>${i.verified === true ? '<span class="n" style="font-size:11px;color:var(--ok)">✓ Read on organizer page</span>' : ""}</div>
      <div class="actions">${autoBtn(i.id)}<a class="btn small" href="#/o/${encodeURIComponent(i.id)}">Details ›</a><button class="btn small icon" data-hide-opp="${esc(i.id)}" title="Not interested">✕</button></div>
    </article>`;
    show(`<div class="pagehead"><h1>Find</h1><div class="seg" role="tablist"><button role="tab" id="seg-b" aria-selected="${oSeg === "browse"}">Browse</button><button role="tab" id="seg-s" aria-selected="${oSeg === "saved"}">★ Saved</button></div></div>
      <div class="searchbox">${I.search}<input class="search" id="oq" type="search" placeholder="Search events, cities…" value="${esc(oQuery)}"></div>
      <details class="filters"><summary>Filters${oType !== "all" || oHideApplied ? ` <span class="fcount">active</span>` : ""}</summary>
      <div class="fgrid"><label class="fsel"><span>Type</span><select id="otype">${[["all", "All"], ["college", "🎓 College"], ["tabling", "🪧 Tabling"], ["city", "🏙️ City"], ["market", "🛍️ Market"], ["county", "🏛️ County"]].map(([v, l]) => `<option value="${v}" ${oType === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="fsel"><span>Sort</span><select id="osort">${[["date", "Soonest first"], ["fee", "Fee low → high"]].map(([v, l]) => `<option value="${v}" ${oSort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="chips" style="padding:0;margin:6px 0 2px"><button class="chip" id="oh" aria-pressed="${oHideApplied ? "true" : "false"}">Hide applied</button></div></details>
      <p class="sub count">${dated.length} dated · ${ongoing.length} ongoing</p>
      ${dated.length ? dated.slice(0, oLimit).map(card).join("") : '<p class="empty">Nothing dated matches.</p>'}
      ${dated.length > oLimit ? `<button class="btn full more" id="omore">Show more · ${dated.length - oLimit} left</button>` : ""}
      ${ongoing.length ? `<details class="panel" id="ongo"><summary>Ongoing &amp; annual · apply anytime (${ongoing.length})</summary>${ongoing.slice(0, oOngoing).map(card).join("")}${ongoing.length > oOngoing ? `<button class="btn full more" id="ongo-more">Show more ongoing</button>` : ""}</details>` : ""}${footer()}`);
    document.getElementById("seg-b").onclick = () => { oSeg = "browse"; viewOpp(); };
    document.getElementById("seg-s").onclick = () => { oSeg = "saved"; viewOpp(); };
    document.getElementById("otype").addEventListener("change", (e2) => { oType = e2.target.value; oLimit = 25; viewOpp(); });
    document.getElementById("osort").addEventListener("change", (e2) => { oSort = e2.target.value; viewOpp(); });
    document.getElementById("oh").onclick = () => { oHideApplied = !oHideApplied; oLimit = 25; viewOpp(); };
    document.getElementById("oq").addEventListener("input", debounce(() => { oQuery = document.getElementById("oq").value; oLimit = 25; viewOpp(); }, 220));
    wireOpp(app);
    const om = document.getElementById("omore"); if (om) om.onclick = () => { oLimit += 25; viewOpp(); };
    const og = document.getElementById("ongo-more"); if (og) og.onclick = () => { oOngoing += 12; viewOpp(); };
  }
  function needOpp() {
    if (OPP) return true;
    if (!oppLoading) {
      app.innerHTML = '<div class="skel"><i></i><i></i></div>';
      oppLoading = loadOpp().then((d) => { OPP = d; route(); }).catch(() => { oppLoading = null; show('<p class="loading">Couldn\'t load opportunities — check data/opportunities.json or point ?opps= at a feed.</p>'); });
    } else app.innerHTML = '<div class="skel"><i></i><i></i></div>';
    return false;
  }
  const savedOpps = () => store.get("savedOpp", {});
  function toggleSaved(id) { const s = savedOpps(); if (s[id]) { delete s[id]; toast("Removed from Saved"); } else { s[id] = todayISO(); toast("⭐ Saved"); } store.set("savedOpp", s); }
  function wireOpp(root) {
    (root || app).querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", (e2) => { e2.preventDefault(); toggleSaved(b.dataset.star); viewOpp(); }));
    (root || app).querySelectorAll("[data-hide-opp]").forEach((b) => b.addEventListener("click", (e2) => { e2.preventDefault(); hideOpp(b.dataset.hideOpp); toastAction("Lead hidden", "Undo", () => { showOpp(b.dataset.hideOpp); viewOpp(); }); viewOpp(); }));
    wireAuto(root, () => viewOpp());
  }
  function viewOppDetail(id) {
    setTab("opp");
    if (!OPP && !needOpp()) return;
    const i = oppById(id);
    if (!i) { show(`<a class="back" href="#/opportunities">‹ Find</a><p class="empty">That lead isn't in the feed anymore.</p>`); return; }
    const sel = (k) => i[k] || "";
    show(`<a class="back" href="#/opportunities">‹ Find</a>
      ${hero({ name: i.title, when: oppos(i) + (i.time ? " · " + i.time : ""), venue: i.org || "", statusLabel: i.verified === true ? "✓ Vetted" : "Lead" })}
      <div class="bigacts">
        ${sel("registration_url") || sel("url") ? `<a class="act act--gold" href="${esc(sel("registration_url") || sel("url"))}" target="_blank" rel="noopener">↗<span>Apply</span></a>` : ""}
        ${i.city ? `<a class="act" href="${esc(maps(i.city + ", " + (i.state || "")))}" target="_blank" rel="noopener">🧭<span>Directions</span></a>` : ""}
        ${i.date ? `<button class="act" id="oics" type="button">📅<span>Calendar</span></button>` : ""}
        <button class="act act--danger" data-hide-opp="${esc(i.id)}">✕<span>Hide</span></button>
      </div>
      <div class="actions">${autoBtn(i.id)}<button class="btn" data-ap="${esc(i.id)}" aria-pressed="${isApplied(i.id) ? "true" : "false"}">${isApplied(i.id) ? "✓ Applied" : "Mark applied"}</button></div>
      <div class="card info">
        <div class="kv"><span class="ic">💵</span><div><p class="k">Vendor fee</p><p class="v">${esc(i.fee || "Not listed")}</p></div></div>
        ${i.deadline ? `<div class="kv"><span class="ic">⏰</span><div><p class="k">Apply by</p><p class="v">${esc(i.deadline)}</p></div></div>` : ""}
        ${sel("registration_requirements") ? `<div class="kv"><span class="ic">📋</span><div><p class="k">Requirements</p><p class="v">${esc(sel("registration_requirements"))}</p></div></div>` : ""}
        ${sel("description") || sel("notes") ? `<div class="kv"><span class="ic">📝</span><div><p class="k">About</p><p class="v">${esc(sel("description") || sel("notes"))}</p></div></div>` : ""}
        ${i.email ? `<div class="kv"><span class="ic">✉️</span><div><p class="k">Contact</p><p class="v">${esc(i.email)}</p></div></div>` : ""}
        <div class="kv"><span class="ic">🔎</span><div><p class="k">Found via</p><p class="v">${esc(i.source || "Feed")}${i.verified ? " · read on the organizer's page" : ""}</p></div></div>
      </div>${footer()}`);
    wireOpp(app);
    const oic = document.getElementById("oics"); if (oic) oic.onclick = () => download(i.id + ".ics", ics([{ id: i.id, name: i.title, date: i.date, start: t24(i.time || ""), end: null, address: i.city + ", " + (i.state || ""), link: i.url || "" }]), "text/calendar");
    app.querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", () => { if (isApplied(b.dataset.ap)) unmarkApplied(b.dataset.ap); else markApplied(b.dataset.ap); viewOppDetail(id); paintBadge(); }));
  }
  const t24 = (s) => { const m = String(s || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/i); if (!m) return ""; let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return String(h).padStart(2, "0") + ":" + m[2]; };

  /* ---------- map ---------- */
  const GEO_DEFAULT = { "Jacksonville, FL": [30.3149, -81.6597], "Orlando, FL": [28.5384, -81.3789], "Tampa, FL": [27.9506, -82.4572], "Miami, FL": [25.7617, -80.1918], "St. Augustine, FL": [29.9012, -81.3124], "Atlanta, GA": [33.749, -84.388], "Savannah, GA": [32.0809, -81.0912], "Athens, GA": [33.9519, -83.3576] };
  function viewMap() {
    setTab("map"); const today = todayISO();
    const items = (DATA.events || []).filter((e) => visEvent(e) && e.address && lastDay(e) >= today && e.status !== "declined").map((e) => ({ e, ll: geocode(e.address) }));
    show(`<div class="pagehead"><h1>Map</h1></div>
      <div class="mapwrap"><div id="map" role="region" aria-label="Map of markets"></div></div>
      <div class="map-legend">${[["approved", "Approved"], ["booked", "On my calendar"], ["pending", "Pending"], ["tentative", "Tentative"]].map(([s, t]) => `<span><i class="dot s-${s}"></i>${t}</span>`).join("")}</div>
      <div class="places" id="places"><p class="loading">Loading map…</p></div>${footer()}`);
    Promise.all([loadLeaflet(), loadGeo()]).then(([Lf, GEO]) => {
      const box = document.getElementById("map"); if (!box || !document.body.contains(box)) return;
      const m = Lf.map(box, { zoomControl: true, scrollWheelZoom: false });
      const light = document.documentElement.getAttribute("data-theme") === "light";
      const tiles = [
        { url: `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${light ? "World_Light_Gray_Base" : "World_Dark_Gray_Base"}/MapServer/tile/{z}/{y}/{x}`, opts: { maxZoom: 16 }, attr: '&copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, &copy; OpenStreetMap' },
        { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", opts: { maxZoom: 18, className: light ? "t-osm-ink" : "t-osm-dark" }, attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }
      ];
      const addTiles = (k) => { if (k >= tiles.length) return; const t = Lf.tileLayer(tiles[k].url, Object.assign({ attribution: tiles[k].attr }, tiles[k].opts)); t.on("tileerror", () => { try { m.removeLayer(t); } catch (_) {} addTiles(k + 1); }); t.addTo(m); };
      addTiles(0);
      const pts = items.filter((x) => x.ll);
      pts.forEach((x) => { const color = {"approved": "#5FD39B", "booked": "#6FB6E8", "pending": "#E0A44E", "tentative": "#E08A5F"}[x.e.status] || "#8E96A3"; Lf.marker(x.ll, { icon: Lf.divIcon({ className: "", html: `<span class="pin" style="background:${color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(m).bindPopup(`<div class="pop"><h3>${esc(x.e.name)}</h3><p class="m">${esc(fmt(x.e.date, { month: "short", day: "numeric" }))}${x.e.start ? " · " + esc(t12(x.e.start)) : ""}</p><div class="dir"><a href="#/e/${encodeURIComponent(x.e.id)}">Open</a></div></div>`); });
      if (pts.length) m.fitBounds(Lf.latLngBounds(pts.map((x) => x.ll)).pad(0.35), { maxZoom: 12 }); else m.setView([30.3, -81.7], 9);
      const list = document.getElementById("places");
      list.innerHTML = pts.length ? pts.map((x) => `<button class="place" type="button" data-p="${esc(x.e.id)}"><span class="dot" style="background:${{"approved": "#5FD39B", "booked": "#6FB6E8", "pending": "#E0A44E", "tentative": "#E08A5F"}[x.e.status] || "#8E96A3"}"></span><span><b>${esc(x.e.name)}</b><small>${esc(fmt(x.e.date, { month: "short", day: "numeric" }))} · ${esc(x.e.venue || x.e.address)}</small></span></button>`).join("") : `<p class="empty">No upcoming markets with addresses yet.</p>`;
      list.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { location.hash = "#/e/" + encodeURIComponent(b.dataset.p); }));
      setTimeout(() => m.invalidateSize(), 60);
    }).catch(() => { const l = document.getElementById("places"); if (l) l.innerHTML = '<p class="empty">Map couldn\'t load.</p>'; });
  }
  const loadLeaflet = () => window.L && window.L.map ? Promise.resolve(window.L) : new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "vendor/leaflet/leaflet.js"; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  const loadGeo = () => { const g = store.get("geoOverrides", {}); return Promise.resolve(Object.assign({}, GEO_DEFAULT, g)); };
  function geocode(addr) { if (!addr) return null; const low = addr.toLowerCase(); for (const k of Object.keys(GEO_DEFAULT)) { if (low.includes(k.toLowerCase().split(",")[0])) return GEO_DEFAULT[k]; } return null; }

  /* ---------- settings / about ---------- */
  const K_SETTINGS = "settings";
  const SETS = () => Object.assign({ theme: "system", text: "normal", notify: false }, store.get(K_SETTINGS, {}));
  function applySettings() {
    const s = SETS(); const d = document.documentElement;
    const light = s.theme === "light" || (s.theme === "system" && matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
    d.setAttribute("data-theme", light ? "light" : "dark");
    d.classList.toggle("text-lg", s.text === "large");
    const m = document.getElementById("theme-color"); if (m) m.setAttribute("content", light ? "#ECEEF1" : "#0A0B0E");
  }
  applySettings();
  function viewSettings() {
    setTab("settings"); const s = SETS();
    const p = profile();
    const seg = (key, opts) => `<div class="seg seg--set" role="radiogroup">${opts.map(([v, t]) => `<button type="button" role="radio" data-set="${key}" data-v="${v}" aria-checked="${String(s[key]) === String(v)}">${t}</button>`).join("")}</div>`;
    const CIS = "https://" + location.host + location.pathname.replace(/[^/]*$/, "") + "data/markets.ics";
    const WEB = "webcal://" + location.host + location.pathname.replace(/[^/]*$/, "") + "data/markets.ics";
    show(`<div class="pagehead"><h1>Settings</h1></div>
      <h2 class="set-h">Appearance</h2><div class="card set">
        <div class="set-r"><span><b>Theme</b></span>${seg("theme", [["dark", "Dark"], ["light", "Light"], ["system", "Match phone"]])}</div>
        <div class="set-r"><span><b>Text size</b></span>${seg("text", [["normal", "Normal"], ["large", "Large"]])}</div>
      </div>
      <h2 class="set-h">My vendor profile</h2>
      <div class="card set"><p class="set-note">Filled automatically into every Auto-apply. On this device only.</p>
        <label class="pfield"><span>Business name</span><input id="pf-business" value="${esc(p.business)}"></label>
        <label class="pfield"><span>Contact email</span><input id="pf-contact" type="email" value="${esc(p.contact)}"></label>
        <label class="pfield"><span>Phone</span><input id="pf-phone" type="tel" value="${esc(p.phone)}"></label>
        <label class="pfield"><span>Instagram</span><input id="pf-ig" value="${esc(p.ig)}"></label>
        <label class="pfield"><span>Space needed</span><input id="pf-space" value="${esc(p.space)}"></label>
        <label class="pfield"><span>Inventory</span><textarea id="pf-inventory" rows="3">${esc(p.inventory)}</textarea></label>
        <label class="pfield"><span>Setup notes</span><textarea id="pf-setup" rows="2">${esc(p.setup)}</textarea></label>
        <label class="pfield"><span>Insurance</span><input id="pf-insurance" value="${esc(p.insurance)}"></label>
        <label class="pfield"><span>Resale certificate #</span><input id="pf-resale" value="${esc(p.resale)}"></label>
        <button class="btn primary full" id="pf-save">Save profile</button>
      </div>
      <h2 class="set-h">Sync your calendar</h2>
      <div class="card set"><div class="syncbtns">
        <a class="sync" href="${esc(WEB)}" target="_blank" rel="noopener"><span>🍎</span><b>Apple Calendar</b><small>Subscribe on iPhone · Mac</small></a>
        <a class="sync" href="${esc("https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(WEB))}" target="_blank" rel="noopener"><span>📅</span><b>Google Calendar</b><small>Add the feed in a tap</small></a>
        <a class="sync" href="${esc("https://outlook.live.com/calendar/0/addfromweb?url=" + encodeURIComponent(CIS))}" target="_blank" rel="noopener"><span>🔷</span><b>Outlook</b><small>Web or desktop</small></a>
      </div><div class="syncrow"><code>${esc(WEB)}</code><button class="btn small" data-copy="${esc(WEB)}">Copy</button></div></div>
      <h2 class="set-h">Notifications</h2><div class="card set">
        <button type="button" class="swrow" role="switch" aria-checked="${s.notify ? "true" : "false"}" id="notifysw"><span><b>Reminders</b><small>Phone notification when To-Do is pending</small></span><span class="tog"></span></button>
      </div>
      <h2 class="set-h">Data &amp; hidden</h2><div class="card set">
        <div class="set-r"><span><b>Hide past markets</b><small>Keep the Markets list focused on what's ahead</small></span><button class="chip" id="hidepast" aria-pressed="${s.hidePast ? "true" : "false"}">${s.hidePast ? "On" : "Off"}</button></div>
        <div class="set-r"><span><b>Hidden / not interested</b><small>${Object.keys(hideMap("hiddenEvents")).length + Object.keys(hideMap("hiddenOpps")).length + Object.keys(niMap()).length} on this device</small></span><a class="btn small" id="md-unhide">Restore</a></div>
        <div class="set-r"><span><b>Data source</b><small>${esc(CFG.eventsUrl)}</small></span></div>
      </div>
      <h2 class="set-h">About</h2><div class="card set"><div class="set-r"><span><b>MarketDesk</b><small>Open-source vendor market command center · MIT · v1.0</small></span><a class="btn small" href="#/about">About</a></div></div>${footer()}`);
    app.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { const c = SETS(); c[b.dataset.set] = b.dataset.v; store.set(K_SETTINGS, c); applySettings(); viewSettings(); }));
    app.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => { (navigator.clipboard || { writeText: () => Promise.reject() }).writeText(b.dataset.copy).then(() => toast("Copied")).catch(() => prompt("Copy:", b.dataset.copy)); }));
    document.getElementById("pf-save").onclick = () => { const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; }; saveProfile({ business: g("pf-business"), contact: g("pf-contact"), phone: g("pf-phone"), ig: g("pf-ig"), space: g("pf-space"), inventory: g("pf-inventory"), setup: g("pf-setup"), insurance: g("pf-insurance"), resale: g("pf-resale") }); toast("Vendor profile saved"); };
    const he = Object.keys(hideMap("hiddenEvents")), ho = Object.keys(hideMap("hiddenOpps"));
    document.getElementById("md-unhide").onclick = () => { [["hiddenEvents", he], ["hiddenOpps", ho], ["notInterested", Object.keys(niMap())]].forEach(([k, ids]) => { const m = (k === "notInterested" ? niMap() : hideMap(k)); ids.forEach((id) => delete m[id]); store.set(k, m); }); toast("All restored"); viewSettings(); };
    document.getElementById("hidepast").onclick = () => { const c = SETS(); c.hidePast = !c.hidePast; store.set(K_SETTINGS, c); viewSettings(); };
    document.getElementById("notifysw").onclick = async () => { const c = SETS(); c.notify = !c.notify; store.set(K_SETTINGS, c); if (c.notify && "Notification" in window && Notification.permission !== "granted") { const p = await Notification.requestPermission().catch(() => "denied"); if (p !== "granted") { c.notify = false; store.set(K_SETTINGS, c); } } viewSettings(); };
  }
  function viewAbout() {
    setTab("about");
    show(`<div class="pagehead"><h1>About</h1></div>
      <div class="card"><p class="sub">MarketDesk is an open-source, MIT-licensed vendor market command center. It runs entirely in your browser — nothing is sent to a server beyond the static files it loads.</p>
      <p class="m">• Data: <b>data/events.json</b> (your market calendar), <b>data/opportunities.json</b> (vendor leads feed).</p>
      <p class="m">• Self-host: put the folder on any static host (GitHub Pages, Netlify, Vercel, local <code>python -m http.server</code>).</p>
      <p class="m">• Local state (todos, applied, hidden, profile, tallies) lives in this browser only.</p>
      <p class="m">• Auth: optional password gate (<code>window.MARKETDESK.unlock</code>); off by default — this is a personal tool, not a bank.</p>
      <p class="m" style="margin-top:10px">Icons: Leaflet (BSD-2) for maps; Esri/OSM tiles. Fonts: Montserrat &amp; Cormorant Garamond (OFL).</p></div>${footer()}`);
  }
  const footer = () => `<p class="fine">MarketDesk · open source · MIT</p>`;

  /* ---------- router ---------- */
  const I = { cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>', map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></svg>', search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' };
  function route() {
    if (!DATA && !OPP) return;
    paintBadge();
    const h = location.hash.replace(/^#\/?/, "");
    if (h === "") return viewToday();
    if (h === "todo") return viewTodo();
    if (h === "markets") return viewMarkets();
    if (h.startsWith("e/")) return viewEvent(decodeURIComponent(h.slice(2)));
    if (h === "calendar") return viewCalendar();
    if (h === "money") return viewMoney();
    if (h === "map") return viewMap();
    if (h.startsWith("o/")) return viewOppDetail(decodeURIComponent(h.slice(2)));
    if (h === "opportunities" || h === "saved") { if (h === "saved") oSeg = "saved"; return viewOpp(); }
    if (h === "settings") return viewSettings();
    if (h === "about") return viewAbout();
    viewToday();
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

  /* ---------- boot ---------- */
  const sortEvents = (d) => { (d.events || []).sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))); return d; };
  fetch(CFG.eventsUrl, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { DATA = d; route(); })
    .catch(() => { app.innerHTML = `<div class="pagehead"><h1>MarketDesk</h1></div><div class="card"><p class="m" style="margin:0">Couldn't load <b>${esc(CFG.eventsUrl)}</b>. Copy data/events.json next to the app (see README), or point <code>?events=…</code> at a feed.</p></div>`; });
  setTab("today");
})();