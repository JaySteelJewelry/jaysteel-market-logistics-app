# JAY STEEL JEWELRY · Market Logistics

Live app: https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/

A phone-first planner for every market JAY STEEL JEWELRY sells at: status badges, calendar, fees and pay-by dates,
contacts, directions, a packing checklist and a sales/expense tally per market (CSV export).

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
  "setup": "Setup 7:30–9:45 AM", "nextStep": "Book + pay on the portal", "headsUp": "Same day as Park Street"
}
```

Status words: `approved` ✅ · `agreement` 📝 · `pending` ⏳ · `tentative` ❓ · `booked` 📌 (on your own calendar).
Times are 24-hour Eastern (`"18:00"` = 6 PM). Multi-day events add `"endDate"`.

## Where things are saved

- Markets: `data/events.json` in this repo (public — never put a home address, card, POS code or password in it).
- Checklists + sales tally: saved on the phone/browser you use (localStorage). Use **Money → Back up my data** to keep a copy.

## Discord

`.github/workflows/discord-logistics.yml` posts/edits one "Logistics" card in the private JAY STEEL Discord
(daily at 7 AM Eastern, on every change to `data/events.json`, or by hand from the Actions tab → Run workflow).
The webhook URL lives only in the repo secret `DISCORD_WEBHOOK_URL` — never in the code.

## Opportunities tab ("Find")

`scripts/opportunities.py` scans public calendars (college Engage/Localist feeds, CivicPlus city/county calendars,
Eventbrite/VendorsMap where they allow it) for vendor markets, market days, festivals and tabling calls in
NE Florida (Nassau, Duval, Clay, St. Johns, Baker, Putnam, Flagler, Volusia) and Georgia (Atlanta area, Hall County).
It runs **every 6 hours** (`.github/workflows/opportunities.yml`, or Actions → Run workflow) — not literally live.
Each source is tried on its own; the app's Sources list shows which ones returned data on the last scan.
Results: `data/opportunities.json`. Ongoing/annual leads come from `data/opportunities_seed.json`.
New vendor-type finds are posted to #market-log in Discord (secret `DISCORD_OPPORTUNITIES_WEBHOOK_URL`).
Add a source: one line in `SOURCES` at the top of the script.
