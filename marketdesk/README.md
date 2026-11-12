# MarketDesk

**Open-source vendor market command center.** A self-hostable, offline-capable web app for market
vendors: Today, To‑Do, Markets, Find (leads), Calendar, Map, Payments, and Auto‑apply — no build step,
no dependencies, no servers, MIT licensed.

It is a clean, portable rewrite of a production market-logistics app: everything runs in the browser
(localStorage for your device state), and the autonomous leads feed is optional — drop in any
`opportunities.json` (including one built by your own Python scanner) and the Find tab lights up.

## Features

- **Today** — next booked market, quick tiles, money-due line, To‑Do snapshot.
- **To‑Do** — fees overdue/pay-by, apply-by deadlines, personal task list, live badge on the dock.
- **Markets** — timeline, search, filters (upcoming / saved / past), detail pages with directions,
  add-to-calendar (.ics), Save ⭐, Remove (with undo), and a per-market sales/expense tally.
- **Find** — vendor leads feed: browse/saved, filters, star, hide, mark applied, **⚡ Auto‑apply**
  (composes your full application from the vendor profile and hands it off by email, opened
  application link + copied draft, or WhatsApp to your assistant).
- **Calendar** — Apple-style month grid with a red today, countdown strip, .ics export,
  one-tap Apple / Google / Outlook subscription buttons.
- **Map** — Esri/OSM basemap (dark/light) with an automatic fallback, status pins, tap-to-open.
- **Payments** — fees due, running tallies, CSV export, backup / restore.
- **Settings** — theme, vendor profile, local reminders (Notification API), hidden-item restore.
- **PWA** — installable to the home screen, works offline (service worker).

## Run it

Any static host works: GitHub Pages, Netlify, Vercel, or locally:

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

Point it at your own data:

- Edit `data/events.json` (your markets) and `data/opportunities.json` (the leads feed).
- Or override at load time: `index.html?events=…&opps=…` (same-origin URLs only).

Pull the real feeds from another deployment with the helper:

```bash
node tools/fetch-data.mjs <base-url-without-trailing-slash>
# e.g. node tools/fetch-data.mjs https://jaysteeljewelry.github.io/jaysteel-market-logistics-app
```

That copies `data/events.json` and `data/opportunities.json` from that origin into this folder.

## Optional unlock

By default the app is open — it's a personal tool, not a bank. If you want a password, set
`window.MARKETDESK = { unlock: "<sha256 hex of password>" }` in `index.html` (sha256 of the password;
do not paste the password itself).

## Data shape

- `data/events.json` — `{ update, timezone, events:[…], openApplications:[…] }`, each event
  `{ id, name, status, date, start?, end?, endDate?, venue?, address?, fee?, paid?, payBy?,
  payHow?, booth?, setup?, applyBy?, nextStep?, notes?, contact?:{ name?, email? } }`.
  Statuses: `approved, agreement, pending, tentative, booked, conditional, declined`.
- `data/opportunities.json` — `{ updated, sources:[…], items:[…], ongoing:[…] }`, each lead
  `{ id, title, date?, end_date?, time?, city, state, type, fee?, deadline?, registration_url?,
  url, source, verified?, verifiedAt?, vendorMatch?, email? }`.

## Test

```bash
node --test tests/site.test.mjs
```

## License

MIT. The bundled brand icons are a placeholder; replace them with your own. Leaflet is BSD-2.
Map tiles are from Esri / OpenStreetMap (their attribution is shown on the map).