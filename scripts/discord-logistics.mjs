// Posts / edits the "Logistics" card in the JAY STEEL Discord from data/events.json.
// Runs in GitHub Actions. The webhook URL comes ONLY from the DISCORD_WEBHOOK_URL secret.
import fs from "node:fs";

const HOOK = process.env.DISCORD_WEBHOOK_URL;
if (!HOOK) { console.log("DISCORD_WEBHOOK_URL secret is not set — nothing posted."); process.exit(0); }
const APP = "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/";
const STORE = "https://jaysteeljewelry.github.io/";
const STATE = "data/discord.json";
const TZ = "America/New_York";
const ICON = { approved: "✅", agreement: "📝", pending: "⏳", tentative: "❓", booked: "📌" };

const data = JSON.parse(fs.readFileSync("data/events.json", "utf8"));
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const d = (iso, o) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, o));
const t12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`; };
const last = (e) => e.endDate || e.date;
const up = data.events.filter((e) => last(e) >= today).sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
const link = (e) => `${APP}#/e/${encodeURIComponent(e.id)}`;

const next = up.slice(0, 8).map((e) => {
  const when = d(e.date, { weekday: "short", month: "short", day: "numeric" }) + (e.endDate ? `–${d(e.endDate, { day: "numeric" })}` : "");
  const time = e.start ? ` · ${t12(e.start)}${e.end ? "–" + t12(e.end) : ""}` : "";
  return `${ICON[e.status] || "•"} **${when}** — [${e.name}](${link(e)})${time}`;
}).join("\n") || "No upcoming markets.";

const due = data.events.filter((e) => e.payBy && e.payBy >= today && ["approved", "agreement", "pending"].includes(e.status))
  .sort((a, b) => a.payBy.localeCompare(b.payBy)).slice(0, 5)
  .map((e) => `• **${d(e.payBy, { month: "short", day: "numeric" })}** — ${e.name}: ${e.fee || "fee TBD"}${e.status === "pending" ? " *(if accepted)*" : ""}`).join("\n");

const count = (s) => up.filter((e) => e.status === s).length;
const board = `✅ ${count("approved")} approved · 📝 ${count("agreement")} agreement · ⏳ ${count("pending")} pending · ❓ ${count("tentative")} tentative · 📌 ${count("booked")} on calendar`;

const fields = [];
if (due) fields.push({ name: "💵 To pay", value: due.slice(0, 1024) });
fields.push({ name: "📊 Board", value: board });

const payload = {
  username: "JAY STEEL Logistics",
  embeds: [{
    title: "🧭 Market Logistics — next up",
    url: APP,
    color: 0xD9A84E,
    description: next.slice(0, 4000),
    fields,
    footer: { text: "Updates daily 7 AM + whenever markets change · Tough as Steel, Styled to Thrill." },
    timestamp: new Date().toISOString()
  }],
  components: [{ type: 1, components: [
    { type: 2, style: 5, label: "Open logistics app", emoji: { name: "🧭" }, url: APP },
    { type: 2, style: 5, label: "Shop JAY STEEL", emoji: { name: "🛍️" }, url: STORE }
  ] }],
  allowed_mentions: { parse: [] }
};

async function call(method, url, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((s) => setTimeout(s, ((j.retry_after || 2) + 0.5) * 1000)); continue; }
    return r;
  }
  throw new Error("Discord kept rate-limiting");
}
const base = HOOK.split("?")[0];
let res;
if (state.summary_message_id) {
  res = await call("PATCH", `${base}/messages/${state.summary_message_id}?with_components=true`, payload);
  if (res.ok) { console.log("Edited Logistics card", state.summary_message_id); process.exit(0); }
  console.log("Edit failed", res.status, (await res.text()).slice(0, 200), "— posting a new card");
}
res = await call("POST", `${base}?wait=true&with_components=true`, payload);
if (!res.ok) { console.error("Post failed", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
const msg = await res.json();
fs.writeFileSync(STATE, JSON.stringify({ summary_message_id: msg.id, channel_id: msg.channel_id, note: "Message id of the Discord Logistics card (not a secret)." }, null, 2) + "\n");
console.log("Posted new Logistics card", msg.id);
