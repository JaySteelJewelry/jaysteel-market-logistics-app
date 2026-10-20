/* JAY STEEL JEWELRY · Market Logistics
   Data: data/events.json (edit that one file to add/change markets).
   Checklists + sales/expense tally are saved on this device (localStorage).
   Oct 20 2026: "Apply via Tab" hands an application to Tab over WhatsApp (Tab's number only). */
(function () {
  "use strict";
  const TZ = "America/New_York";
  const STORE_URL = "https://jaysteeljewelry.github.io/";
  const EDIT_URL = "https://github.com/JaySteelJewelry/jaysteel-market-logistics-app/edit/main/data/events.json";
  const STATUS = {
    approved: { label: "Approved", icon: "✅" },
    agreement: { label: "Agreement sent", icon: "📝" },
    pending: { label: "Pending", icon: "⏳" },
    tentative: { label: "Tentative", icon: "❓" },
    booked: { label: "On my calendar", icon: "📌" },
    conditional: { label: "Conditional", icon: "❓" }
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
      if (meta) meta.setAttribute("content", t === "light" ? "#F6F4EF" : "#0A0A0A");
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
     the real status comes back in data/events.json. "⏳ Sent to Tab" is remembered on this device only. */
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
  function applyMsg(x) {
    return `APPLY ✅ ${x.name} — ${x.dates} — id:${x.id}${x.link ? " — " + x.link : ""}\nLuis sent from the JAY STEEL logistics app.`;
  }
  const applyURL = (x) => "https://wa.me/" + TAB_WA + "?text=" + encodeURIComponent(applyMsg(x));
  const eventDates = (e) => fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + (e.endDate ? " – " + fmt(e.endDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
  const APPLY_REG = {};
  function applyBtn(x) {
    APPLY_REG[x.id] = x;
    if (isSent(x.id)) return `<p class="sent-tab" role="status"><span class="badge s-pending">⏳ Sent to Tab</span></p>`;
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
      const m = sentMap(); m[x.id] = new Date().toISOString(); store.set("sentToTab", m);
      setTimeout(() => { close(); toast("⏳ Sent to Tab"); const y = window.scrollY; if (rerender) rerender(); window.scrollTo(0, y); }, 60);
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

  /* ---------- views ---------- */
  function setTab(name) {
    document.querySelectorAll(".tabs a").forEach((a) => a.toggleAttribute("aria-current", false));
    const a = document.querySelector(`.tabs a[data-tab="${name}"]`); if (a) a.setAttribute("aria-current", "page");
  }

  function rowHTML(e, today) {
    const past = lastDay(e) < today;
    const d = parse(e.date);
    return `<a class="row${past ? " past" : ""}" href="#/e/${encodeURIComponent(e.id)}">
      <div class="date"><small>${fmt(e.date, { month: "short" }).toUpperCase()}</small><b>${d.getUTCDate()}</b><i>${fmt(e.date, { weekday: "short" }).toUpperCase()}</i></div>
      <div class="t"><p class="n">${esc(e.name)}</p><p class="m">${esc(timeRange(e))} · ${esc(e.venue || e.address || "")}</p>${badge(e.status)}${!past && e.payBy && !e.paid && e.payBy < today && ["approved", "agreement", "conditional"].includes(e.status) ? ' <span class="badge s-due">Past due</span>' : ""}</div>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }

  const UPCOMING_OK = ["approved", "agreement", "booked"];
  const WAITING = ["pending", "tentative", "conditional"];
  function viewList() {
    setTab("list");
    const today = todayISO();
    const upcoming = DATA.events.filter((e) => lastDay(e) >= today);
    const next = upcoming.find((e) => e.status !== "pending" && e.status !== "tentative") || upcoming[0];
    const approved = upcoming.filter((e) => UPCOMING_OK.includes(e.status)).length;
    const waiting = upcoming.filter((e) => WAITING.includes(e.status)).length;
    const due = dueItems(today), over = overdueItems(today);
    let html = "";
    if (next) {
      const n = daysBetween(today, next.date);
      html += `<a class="next" href="#/e/${encodeURIComponent(next.id)}"><p class="label">NEXT MARKET</p>
        <p class="name">${esc(next.name)}</p><p class="meta">${esc(whenText(next))}<br>${esc(next.venue || "")}</p>
        <div class="count"><b>${n <= 0 ? "Today" : n}</b><small>${n <= 0 ? "" : n === 1 ? "DAY" : "DAYS"}</small></div></a>`;
    }
    html += `<div class="stats"><a class="stat" href="#/" data-jump="approved" style="text-decoration:none"><b>${approved}</b><span>Confirmed</span></a><a class="stat" href="#/" data-jump="waiting" style="text-decoration:none"><b>${waiting}</b><span>Waiting</span></a><a class="stat${over.length ? " alert" : ""}" href="#/money" style="text-decoration:none"><b>${due.length + over.length}</b><span>${over.length ? `To pay · ${over.length} late` : "To pay"}</span></a></div>`;
    const count = (k) => upcoming.filter((e) => e.status === k).length;
    const nOpen = (DATA.openApplications || []).length;
    /* Oct 20: "No date yet" is its own chip, so each chip shows only its own markets (no mixed long scroll) */
    const chips = [["upcoming", "Upcoming", upcoming.length]].concat(Object.keys(STATUS).map((k) => [k, `${STATUS[k].icon} ${STATUS[k].label}`, count(k)]).filter((c) => c[2] > 0), nOpen ? [["nodate", "🗓 No date yet", nOpen]] : [], [["past", "Past"], ["all", "All"]]);
    if (!chips.some((c) => c[0] === filter)) filter = "upcoming";
    html += `<h2 class="h2">Markets</h2><input class="search" type="search" id="q" placeholder="Search markets, places…" value="${esc(query)}" aria-label="Search markets" autocomplete="off">
      <div class="chips" role="group" aria-label="Filter by status">${chips.map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}${n != null ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      <div id="listbody" aria-live="polite"></div>`;
    if (DATA.openApplications && DATA.openApplications.length) {
      html += `<div id="openapps"><h2 class="h2">Open applications · no date yet</h2>` + DATA.openApplications.map((o) => `<div class="panel">
        <div class="kv"><span class="ic" aria-hidden="true">${(STATUS[o.status] || {}).icon || "⏳"}</span><div><p class="k">${esc((STATUS[o.status] || { label: o.status }).label)}</p><p class="v"><b>${esc(o.name)}</b><br>${esc(o.when || "")}${o.fee ? " · " + esc(o.fee) : ""}</p></div></div>
        ${o.nextStep ? `<div class="kv"><span class="ic" aria-hidden="true">➡️</span><div><p class="k">Next step</p><p class="v">${esc(o.nextStep)}</p></div></div>` : ""}${canApplyStatus(o.status) && !o.paid ? applyBtn({ id: o.id || slug(o.name), name: o.name, dates: o.when || "No date yet", link: o.link || o.url || "" }) : ""}</div>`).join("") + `</div>`;
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
    app.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (ev) => {
      ev.preventDefault(); const k = a.dataset.jump === "approved" ? "approved" : "pending";
      const chip = app.querySelector(`.chip[data-f="${k}"]`) || app.querySelector('.chip[data-f="upcoming"]'); chip.click(); chip.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
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
    box.innerHTML = list.length ? `<div class="rows">${list.map((e) => {
      const m = fmt(e.date, { month: "long", year: "numeric" });
      const head = m !== month ? `<p class="month">${m}</p>` : ""; month = m;
      const past = lastDay(e) < today;
      return head + (!past && canApplyEvent(e) ? `<div class="applywrap">${rowHTML(e, today)}${applyBtn({ id: e.id, name: e.name, dates: eventDates(e), link: e.link || "" })}</div>` : rowHTML(e, today));
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

  function viewCalendar() {
    setTab("calendar");
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
      cells += `<button class="day${iso === today ? " today" : ""}${iso === calSel ? " sel" : ""}" data-d="${iso}" aria-label="${fmt(iso, { month: "long", day: "numeric" })}, ${evs.length} market${evs.length === 1 ? "" : "s"}">
        <span class="num">${d}</span><span class="dots">${evs.slice(0, 4).map((e) => `<i class="dot s-${e.status}"></i>`).join("")}</span></button>`;
    }
    const sel = calSel && map[calSel] ? map[calSel] : null;
    const monthEvents = DATA.events.filter((e) => e.date.startsWith(calMonth) || lastDay(e).startsWith(calMonth));
    show(`<div class="cal-head"><button class="iconbtn" id="prev" aria-label="Previous month">‹</button>
      <h2 class="h2">${fmt(calMonth + "-01", { month: "long", year: "numeric" })}</h2><button class="iconbtn" id="nextm" aria-label="Next month">›</button></div>
      <div class="grid">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells}</div>
      <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span class="s-${k}"><i class="dot"></i><em>${v.label}</em></span>`).join("")}</div>
      <p class="month">${sel ? fmt(calSel, { weekday: "long", month: "long", day: "numeric" }) : "This month"}</p>
      <div class="list">${(sel || monthEvents).map((e) => rowHTML(e, today)).join("") || '<p class="empty">No markets this month.</p>'}</div>
      <button class="btn full" id="icsall" style="margin-top:16px">⬇︎ Add all upcoming to my phone calendar (.ics)</button>${footer()}`);
    app.querySelectorAll(".day[data-d]").forEach((b) => b.addEventListener("click", () => { calSel = calSel === b.dataset.d ? null : b.dataset.d; const y = window.scrollY; viewCalendar(); window.scrollTo(0, y); }));
    document.getElementById("prev").onclick = () => { calMonth = shiftMonth(calMonth, -1); calSel = null; viewCalendar(); };
    document.getElementById("nextm").onclick = () => { calMonth = shiftMonth(calMonth, 1); calSel = null; viewCalendar(); };
    document.getElementById("icsall").onclick = () => download("jaysteel-markets.ics", ics(DATA.events.filter((e) => lastDay(e) >= today)), "text/calendar");
  }
  const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

  function kv(ic, k, v) { return v ? `<div class="kv"><span class="ic" aria-hidden="true">${ic}</span><div><p class="k">${k}</p><p class="v">${v}</p></div></div>` : ""; }

  function viewEvent(id) {
    setTab("list");
    const e = byId(id);
    if (!e) { show(`<a class="back" href="#/">‹ All markets</a><p class="empty">That market isn't in the list anymore.</p>`); return; }
    const c = e.contact || {};
    const contact = [c.name && esc(c.name), c.email && (/@/.test(c.email) && !/\s/.test(c.email) ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : esc(c.email)), c.phone && esc(c.phone)].filter(Boolean).join("<br>");
    const paidLine = (e.status === "approved" || e.status === "agreement" || e.status === "conditional") ? (e.paid ? "✅ <b>Paid</b>" : "⚠️ Not paid yet") : "";
    const overdue = e.payBy && !e.paid && e.payBy < todayISO() && lastDay(e) >= todayISO();
    const payBy = e.payBy && (overdue ? `<span class="badge s-due">Past due</span> <span class="warn-text">was due ${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</span>` : `Pay by <b>${esc(fmt(e.payBy, { weekday: "short", month: "short", day: "numeric" }))}</b>`);
    const pay = [e.fee && `<b>${esc(e.fee)}</b>${e.feeNote ? " · " + esc(e.feeNote) : ""}`, paidLine, e.booth && `Booth <b>${esc(e.booth)}</b>`, payBy, e.payHow && esc(e.payHow)].filter(Boolean).join("<br>");
    show(`<a class="back" href="#/">‹ All markets</a>
      <div class="dhead">${badge(e.status)}<h2>${esc(e.name)}</h2><p class="when">${esc(whenText(e))}</p></div>
      <div class="actions">
        ${e.address ? `<a class="btn primary" href="${maps(e.address)}" target="_blank" rel="noopener">📍 Directions</a><a class="btn" href="${amaps(e.address)}" target="_blank" rel="noopener">🗺️ Apple Maps</a>` : ""}
        <button class="btn" id="ics">🗓️ Add to calendar</button>
        ${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">🔗 Event site</a>` : `<a class="btn" href="#/links">🛍️ Store links</a>`}
      </div>
      <div class="panel">
        ${kv("📍", "Where", `${esc(e.venue || "")}${e.address ? "<br>" + esc(e.address) : ""}`)}
        ${kv("💵", "Fee · how paid", pay)}
        ${kv("☎️", "Contact", contact)}
        ${kv("🧰", "Setup", e.setup && esc(e.setup))}
        ${kv("➡️", "Next step", e.nextStep && esc(e.nextStep))}
        ${kv("🏷️", "Status", e.approval && esc(e.approval))}
        ${kv("📝", "Notes", e.notes && esc(e.notes))}
      </div>
      ${lastDay(e) >= todayISO() && canApplyEvent(e) ? `<div class="apply-detail">${applyBtn({ id: e.id, name: e.name, dates: eventDates(e), link: e.link || "" })}</div>` : ""}
      ${e.headsUp ? `<div class="panel heads">${kv("⚠️", "Heads up", esc(e.headsUp))}</div>` : ""}
      <h3 class="h2">Packing checklist</h3><div class="panel" id="pack"></div>
      <h3 class="h2">Sales &amp; expenses</h3><div class="panel" id="money"></div>${footer()}`);
    document.getElementById("ics").onclick = () => download(`${e.id}.ics`, ics([e]), "text/calendar");
    renderPack(e); renderTally(e); wireApply(app, () => viewEvent(id));
    window.scrollTo(0, 0);
  }

  function renderPack(e) {
    const box = document.getElementById("pack"); const items = checklist(e.id);
    const done = items.filter((i) => i.done).length; const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    box.innerHTML = `<div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="sub" style="margin:4px 0 6px">${done} of ${items.length} packed</p>
      <ul class="check">${items.map((it, i) => `<li><input type="checkbox" id="c${i}" data-i="${i}" ${it.done ? "checked" : ""}><label for="c${i}">${esc(it.text)}</label><button class="x" data-del="${i}" aria-label="Remove ${esc(it.text)}">×</button></li>`).join("")}</ul>
      <form class="addrow" id="addItem"><input id="newItem" placeholder="Add an item…" aria-label="Add a checklist item" maxlength="80"><button class="btn small" type="submit">Add</button></form>
      <div class="actions" style="margin-bottom:12px"><button class="btn small" id="resetPack">Uncheck all</button><button class="btn small" id="saveTpl">Save as my default list</button></div>`;
    const save = (list) => { store.set("check." + e.id, list); renderPack(e); };
    box.querySelectorAll("input[type=checkbox]").forEach((cb) => cb.addEventListener("change", () => { const l = checklist(e.id); l[cb.dataset.i].done = cb.checked; save(l); }));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const l = checklist(e.id); l.splice(b.dataset.del, 1); save(l); }));
    document.getElementById("addItem").addEventListener("submit", (ev) => { ev.preventDefault(); const v = document.getElementById("newItem").value.trim(); if (!v) return; const l = checklist(e.id); l.push({ text: v, done: false }); save(l); });
    document.getElementById("resetPack").onclick = () => { save(checklist(e.id).map((i) => ({ text: i.text, done: false }))); };
    document.getElementById("saveTpl").onclick = () => { store.set("packTemplate", checklist(e.id).map((i) => i.text)); toast("Saved as your default list"); };
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
    const dueRow = (e, late) => `<a class="${late ? "over" : ""}" href="#/e/${encodeURIComponent(e.id)}"><span>${esc(e.name)}<br><small>${esc(e.fee || "")}${late ? " · still marked unpaid" : ""}</small>${late ? '<br><span class="badge s-due">Past due</span>' : ""}</span><b>${late ? "was due" : "by"} ${esc(fmt(e.payBy, { month: "short", day: "numeric" }))}</b></a>`;
    show(`<h2 class="h2">Money</h2><p class="sub">Fees to pay, and what each market made. Sales are saved on this phone.</p>
      <p class="month">To pay</p>
      <div class="due">${over.length || due.length ? over.map((e) => dueRow(e, true)).join("") + due.map((e) => dueRow(e, false)).join("") : '<p class="empty">Nothing due right now.</p>'}</div>
      <p class="month">All markets · totals</p>
      <div class="tot"><div><b class="pos">${money(all.sales)}</b><span>Sales</span></div><div><b class="neg">${money(all.exp)}</b><span>Expenses</span></div><div><b class="${all.sales - all.exp >= 0 ? "pos" : "neg"}">${money(all.sales - all.exp)}</b><span>Profit</span></div></div>
      <div class="panel"><ul class="ledger">${withRows.length ? withRows.map((x) => `<li><a href="#/e/${encodeURIComponent(x.e.id)}">${esc(x.e.name)}<small>${esc(fmt(x.e.date, { month: "short", day: "numeric", year: "numeric" }))} · ${x.n} entr${x.n === 1 ? "y" : "ies"}</small></a><b class="${x.t.sales - x.t.exp >= 0 ? "pos" : "neg"}">${money(x.t.sales - x.t.exp)}</b><span></span></li>`).join("") : '<li class="empty">No sales logged yet — open a market and tap “+ Sale”.</li>'}</ul></div>
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
    show(`<h2 class="h2">Shop JAY STEEL</h2><p class="sub">Send customers here from the booth, Discord or socials.</p>
      ${card(store, "store", "Online store", esc(host(store)), true)}
      ${card(L.instagram || "https://www.instagram.com/jaysteeljewelry/", "ig", "Instagram", "@jaysteeljewelry", true)}
      ${card("mailto:" + EMAIL, "mail", "Email", EMAIL, false)}
      <div class="signoff"><picture><source srcset="assets/js-icon.webp" type="image/webp"><img src="assets/js-icon.png" alt="" width="256" height="244" loading="lazy"></picture><p class="wordmark">JAY STEEL JEWELRY</p></div>
      <hr class="gold-rule"><p class="month">Manage the app</p>
      ${card(EDIT_URL, "edit", "Edit markets", "Change data/events.json on GitHub — the app + Discord update", true)}${footer()}`);
  }

  function footer() {
    return `<hr class="gold-rule"><p class="fine">Updated ${esc(DATA.updated ? fmt(DATA.updated, { month: "short", day: "numeric", year: "numeric" }) : "")} · JAY STEEL JEWELRY</p>`;
  }


  /* ---------- opportunities ---------- */
  let OPP = null, oLimit = 25, oType = "all", oState = "", oCounty = "", oVendor = false, oQuery = "", oHideApplied = false;
  const TYPE_LABEL = { college: "🎓 College", tabling: "🪧 Tabling", city: "🏙️ City", county: "🏛️ County", market: "🛍️ Market" };
  function loadOpp() {
    return fetch("data/opportunities.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function viewOpp() {
    setTab("opp");
    if (!OPP) { app.innerHTML = '<div class="skel" aria-label="Loading opportunities"><i></i><i></i><i></i></div>'; loadOpp().then((d) => { OPP = d; if (location.hash.indexOf("opportunities") >= 0) viewOpp(); }).catch(() => { show('<p class="loading">Couldn\'t load opportunities right now. <a href="#/opportunities" onclick="location.reload();return false">Try again</a></p>'); }); return; }
    const today = todayISO(); const weekAgo = new Date(parse(today) - 7 * 86400000).toISOString().slice(0, 10);
    const applied = store.get("applied", {});
    const all = OPP.items.concat(OPP.ongoing || []);
    const counties = [...new Set(all.filter((i) => !oState || i.state === oState).map((i) => i.county).filter(Boolean))].sort();
    const match = (i) => (oType === "all" || i.type === oType) && (!oState || i.state === oState) && (!oCounty || i.county === oCounty)
      && (!oVendor || i.vendorMatch) && (!oHideApplied || !applied[i.id])
      && (!oQuery || `${i.title} ${i.org || ""} ${i.city || ""} ${i.source}`.toLowerCase().includes(oQuery.toLowerCase()));
    const dated = OPP.items.filter((i) => i.date >= today).filter(match);
    const ongoing = (OPP.ongoing || []).filter(match);
    const isNew = (i) => i.origin !== "seed" && i.firstSeen >= weekAgo;
    const ks = knownKeys();
    const oppApply = (i) => !applied[i.id] && !alreadyKnown(i.title, ks) && !alreadyKnown(i.org || "", ks);
    const oppDates = (i) => i.date ? fmt(i.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : (i.when || "Ongoing · apply anytime");
    const card = (i) => {
      const dateBox = i.date ? `<div class="date"><small>${fmt(i.date, { month: "short" }).toUpperCase()}</small><b>${parse(i.date).getUTCDate()}</b><i>${fmt(i.date, { weekday: "short" }).toUpperCase()}</i></div>` : `<div class="date"><small>ANY</small><b>∞</b><i>TIME</i></div>`;
      const tags = [isNew(i) ? '<span class="badge s-approved">New this week</span>' : "", i.vendorMatch ? '<span class="badge s-booked">Vendor</span>' : "", `<span class="badge s-tentative">${esc((TYPE_LABEL[i.type] || i.type).replace(/^\S+ /, ""))}</span>`, applied[i.id] ? '<span class="badge s-agreement">Applied</span>' : ""].join(" ");
      return `<div class="opp${applied[i.id] ? " past" : ""}">
        <div class="row">${dateBox}<div class="t"><p class="n">${esc(i.title)}</p>
        <p class="m">${esc([i.time, i.city && i.state ? `${i.city}, ${i.state}` : "", i.county ? i.county + " Co." : ""].filter(Boolean).join(" · "))}</p>
        <p class="m">${esc(i.org || i.source)}${i.when ? " · " + esc(i.when) : ""}</p></div><span></span></div>
        ${i.fee || i.deadline ? `<p class="m" style="margin:8px 0 0">${i.fee ? "💵 " + esc(i.fee) : ""}${i.fee && i.deadline ? " · " : ""}${i.deadline ? "⏰ " + esc(i.deadline) : ""}</p>` : ""}
        <div class="tags">${tags}</div>
        ${oppApply(i) ? `<div class="apply-row">${applyBtn({ id: i.id, name: i.title, dates: oppDates(i), link: i.url || "" })}</div>` : ""}
        <div class="actions" style="margin:10px 0 0">${i.url ? `<a class="btn small" href="${esc(i.url)}" target="_blank" rel="noopener">Details ↗</a>` : '<span></span>'}<button class="btn small" data-ap="${esc(i.id)}" aria-pressed="${!!applied[i.id]}">${applied[i.id] ? "✓ Applied" : "Mark applied"}</button></div></div>`;
    };
    const okSrc = OPP.sources.filter((s) => s.ok && s.items).length;
    const typeChips = [["all", "All"]].concat(Object.entries(TYPE_LABEL));
    let html = `<h2 class="h2">Opportunities</h2><p class="sub">Public vendor calls, markets, college market days + city/county events — FL (Nassau → Volusia) and GA (Atlanta, Hall Co.).</p>
      <input class="search" type="search" id="oq" placeholder="Search opportunities…" value="${esc(oQuery)}" aria-label="Search opportunities">
      <div class="chips" role="group" aria-label="Type">${typeChips.map(([k, l]) => `<button class="chip" data-ot="${k}" aria-pressed="${oType === k}">${l}</button>`).join("")}</div>
      <div class="form" style="padding:0 0 6px"><select id="ost" aria-label="State"><option value="">All states</option><option ${oState === "FL" ? "selected" : ""}>FL</option><option ${oState === "GA" ? "selected" : ""}>GA</option></select>
        <select id="oco" aria-label="County"><option value="">All counties</option>${counties.map((c) => `<option ${oCounty === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="chips"><button class="chip" id="ov" aria-pressed="${oVendor}">Vendor-friendly only</button><button class="chip" id="oh" aria-pressed="${oHideApplied}">Hide applied</button></div>`;
    let month = "";
    html += `<p class="sub" style="margin:2px 0 0">${dated.length} dated · ${ongoing.length} ongoing</p>`;
    html += dated.length ? dated.slice(0, oLimit).map((i) => { const m = fmt(i.date, { month: "long", year: "numeric" }); const h = m !== month ? `<p class="month">${m}</p>` : ""; month = m; return h + card(i); }).join("") : '<p class="empty">Nothing dated matches these filters.</p>';
    if (dated.length > oLimit) html += `<button class="btn full more" id="omore">Show ${Math.min(25, dated.length - oLimit)} more · ${dated.length - oLimit} left</button>`;
    if (ongoing.length) html += `<details class="panel" id="ongo"${oQuery ? " open" : ""}><summary>Ongoing &amp; annual · apply anytime (${ongoing.length})</summary>${ongoing.map(card).join("")}</details>`;
    html += `<details class="panel" style="margin-top:16px"><summary>Sources · last scan ${esc(OPP.updated.replace("T", " ").replace("Z", " UTC"))} · ${okSrc} of ${OPP.sources.length} returned items</summary>
      <ul class="ledger" style="margin-top:8px">${OPP.sources.map((s) => `<li><span>${esc(s.source)}<small>${s.ok ? (s.items ? s.items + " items" : "no matching events right now") : "couldn't read: " + esc((s.error || "").split(":")[0])}</small></span><b class="${s.ok ? "pos" : "neg"}">${s.ok ? "✓" : "✕"}</b><span></span></li>`).join("")}</ul>
      <p class="fine" style="text-align:left">Refreshes every 6 hours — not live. Always confirm details on the organizer's page.</p></details>` + footer();
    show(html);
    wireApply(app, viewOpp);
    const om = document.getElementById("omore"); if (om) om.onclick = () => { const y = window.scrollY; oLimit += 25; viewOpp(); window.scrollTo(0, y); };
    app.querySelectorAll("[data-ot]").forEach((b) => b.addEventListener("click", () => { oType = b.dataset.ot; oLimit = 25; viewOpp(); }));
    document.getElementById("ost").onchange = (e) => { oState = e.target.value; oCounty = ""; oLimit = 25; viewOpp(); };
    document.getElementById("oco").onchange = (e) => { oCounty = e.target.value; oLimit = 25; viewOpp(); };
    document.getElementById("ov").onclick = () => { oVendor = !oVendor; oLimit = 25; viewOpp(); };
    document.getElementById("oh").onclick = () => { oHideApplied = !oHideApplied; oLimit = 25; viewOpp(); };
    app.querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", () => { const a = store.get("applied", {}); if (a[b.dataset.ap]) delete a[b.dataset.ap]; else a[b.dataset.ap] = todayISO(); store.set("applied", a); const y = window.scrollY; viewOpp(); window.scrollTo(0, y); }));
    const q = document.getElementById("oq");
    q.addEventListener("input", debounce(() => { oQuery = q.value; const pos = q.selectionStart; oLimit = 25; viewOpp(); const nq = document.getElementById("oq"); nq.focus(); nq.setSelectionRange(pos, pos); }, 220));
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
    if (h.startsWith("e/")) return viewEvent(decodeURIComponent(h.slice(2)));
    if (h === "calendar") return viewCalendar();
    if (h === "money") return viewMoney();
    if (h === "opportunities") return viewOpp();
    if (h === "links") return viewLinks();
    viewList();
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  if ("serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); }); }
  fetch("data/events.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { d.events.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))); DATA = d; route(); })
    .catch(() => { app.innerHTML = '<p class="loading">Couldn\'t load the market list. Check your signal, then pull down to refresh.</p>'; });
})();
