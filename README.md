# JAY STEEL JEWELRY · Market Logistics

Live app: https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/

A phone-first planner for every market JAY STEEL JEWELRY sells at: status badges, calendar, fees and pay-by dates,
contacts, directions, a sales/expense tally per market (CSV export).

## Auto-apply (one-tap vendor applications)

Every lead and booked market gets an **⚡ Auto-apply** button. It fills your application from your
**vendor profile** (Settings › My vendor profile) and hands it over for submission — tap *Email the
organizer* (Mail opens fully written), *Application link + copy draft*, or *Send to Tab to submit*.
The app never pays a fee or signs for you: the last click is always yours (or Tab's). Applications are
tracked on this device; the Dashboard shows an "applications in motion" card.

## APIs & costs

Everything is **free and open-source**: the app uses no paid API keys. The opportunity engine reads
public/open feeds (CampusLabs Engage, Localist, CivicPlus, The Events Calendar, VendorsMap, AllEvents
pages, Esri + OpenStreetMap map tiles) and searches the web via an optional free-tier
[Serper.dev](https://serper.dev) key (falling back to Bing/DuckDuckGo with no key). If a paid API is
ever worth it, it is only added after you approve the cost.

## Shop & links

The app links customers to **jaysteeljewelry.github.io** and its **#links** page — no third-party
storefront until the online store is live.

## Design & app install

"Midnight & Gold": a dark-first design system (jewelry gold accent over deep charcoal), with a matching light theme.
On phones the bottom dock is the primary nav — Home · Markets · Find · Map · **More** (the ☰ menu has the full list).
It's a PWA: **Share → Add to Home Screen** on iPhone (or the install icon in Android Chrome) saves it like an app,
and it works offline. Theme, text size and motion are under **Settings › Appearance** (saved per device).

## Edit your markets (the only file you touch)

Open [`data/events.json`](data/events.json) on GitHub → pencil icon → change or copy an event block → **Commit changes**.
The app updates in about a minute, and the Discord "Logistics" card refreshes automatically.

Each event looks like this (only `id`, `name`, `date`, `status` are required):

```json
{
  "id": "mayport-2026-11-21",
  "name": "Mayport Village Waterfront Market",
  "status": "approved",
  "date": "2026-11-21", "start": "10:00", "end": "14:00",
  "venue": "Mayport Village", "address": "4542 Ocean St, Jacksonville, FL 32233",
  "fee": "$45", "payBy": "2026-10-18", "payHow": "Vendor portal",
  "contact": { "name": "Mitch Reeves", "email": "mayportmarket@mayportwaterfrontpartnership.org" },
  "paid": false, "booth": "B12",
  "setup": "Setup 7:30–9:45 AM", "nextStep": "Book + pay on the portal", "headsUp": "Same day as Park Street"
}
```

Status words: `approved` ✅ · `agreement` 📝 · `pending` ⏳ · `tentative` ❓ · `booked` 📌 (on your own calendar).
`paid: true` + `status: "approved"` makes the market show in **📍 Find us at** on the store page (jaysteeljewelry.github.io). `booth` is optional.
Times are 24-hour Eastern (`"18:00"` = 6 PM). Multi-day events add `"endDate"`.

## Where things are saved

- Markets: `data/events.json` in this repo (public — never put a home address, card, POS code or password in it).
- Checklists + sales tally: saved on the phone/browser you use (localStorage). Use **Money → Back up my data** to keep a copy.

## Discord

`.github/workflows/discord-logistics.yml` posts/edits one "Logistics" card in the private JAY STEEL Discord
(daily at 7 AM Eastern, on every change to `data/events.json`, or by hand from the Actions tab → Run workflow).
The webhook URL lives only in the repo secret `DISCORD_WEBHOOK_URL` — never in the code.

## Opportunities tab ("Find")

`scripts/opportunities.py` autonomously finds vendor opportunities across **all of Florida and Georgia**:
college/university calendars (Localist + CampusLabs "Engage"), city and county calendars (CivicPlus),
marketplace listings (VendorsMap), **web search** (Google via the optional `SEARCH_API_KEY` secret,
otherwise Bing/DuckDuckGo), and Tab's daily vetted pipeline. Every lead that has a link gets **vetted
on its own page**: the run opens the organizer's site and pulls the real date, exact **registration link**,
fee, apply-by deadline and contact — so the "Apply on organizer site" and "Apply via Tab" buttons work from
the feed itself.

- Runs **every 6 hours** (`.github/workflows/opportunities.yml`, or Actions → Run workflow) — not literally live.
- Each source is wrapped on its own; the app's Sources list shows which returned data on the last scan
  (a site that misses one scan keeps its last good read for 3 days).
- Results: `data/opportunities.json`. Ongoing/annual leads come from `data/opportunities_seed.json`.
- New vendor-type finds are posted to #market-log in Discord (secret `DISCORD_OPPORTUNITIES_WEBHOOK_URL`).
- **Optional:** add a GitHub secret `SEARCH_API_KEY` (a free [Serper.dev](https://serper.dev) key) and,
  if you want to force Google over the automatic fallback, `SEARCH_ENGINE=serper`.
- Add a source or search query: one line in `SOURCES` at the top of the script. Parser unit tests live in
  `scripts/test_scan.py` and run on every push/PR.

## Development

No build step — this is a static site. A few things make it keep working:

- **Tests:** `node --test test/site.test.mjs` covers shell/asset consistency, security and accessibility
  baselines. `.github/workflows/ci.yml` runs it on every push/PR, and also parses every `data/*.json`,
  validates `data/events.json` and `data/opportunities.json` against their schemas
  (`events.schema.json`, `opportunities.schema.json`), checks `data/markets.ics` stays well-formed,
  syntax-checks all JS, and runs the scanner's unit tests (`python3 scripts/test_scan.py`).
- **Versioned assets:** `index.html` loads `styles.css?v=` and `app.js?v=`, and the service worker
  (`sw.js`) lists the same strings in its shell. They must match (tested). After changing either file,
  run `node scripts/bump-version.mjs` to bump both plus the SW cache name in one step.
- **Device errors:** the app silently keeps the last 20 errors per device under **Settings › Diagnostics**
  (captured only — never sent on their own).
