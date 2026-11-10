# JAY STEEL · Markets & HQ — guide for AI agents

This app is the private market planner of JAY STEEL JEWELRY (a Jacksonville, FL jewelry seller who works local markets).
The app screens are behind a password. The files below are public and read-only. There is no write API: to change anything,
ask the owner's assistant (Tab). Never guess a password, and never try to open the encrypted HQ data.

Base URL: https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/

## Files

| File | What it is |
|---|---|
| `data/events.json` | Every market: `events[]` plus `openApplications[]` (applied, no date yet). Schema: `data/events.schema.json`. |
| `data/events.schema.json` | JSON Schema (2020-12) for `data/events.json`. |
| `data/markets.ics` | The same markets as an iCalendar feed (declined ones left out). Regenerated when the market list changes. |
| `data/opportunities.json` | Vendor opportunities / leads (shown in the app under Find markets). Covers all of Florida + Georgia: college/city/county calendars, marketplaces, web search. Leads with a link are vetted on the organizer's page — `registration_url` (apply link), `fee`, `deadline`, `email`, `verified`/`verifiedAt` are filled when found. |
| `assets/geo.json` | Map pins: `places["<exact address string from events.json>"] = [lat, lng]` or `[lat, lng, 1]` (1 = approximate spot). |

## Reading `data/events.json`

- Dates are `YYYY-MM-DD`, times are 24-hour `HH:MM`, all local to `America/New_York` (`timezone`).
- `endDate` marks the last day of a multi-day event; otherwise the event is one day.
- `status` is one of:
  - `approved`: accepted by the organizer
  - `agreement`: agreement sent, waiting to be signed/returned
  - `pending`: applied, waiting for an answer
  - `tentative` / `conditional`: not final yet
  - `booked`: on the calendar (confirmed or recurring)
  - `declined`: not going. The app hides these, and so should you.
- Money: `fee` (number or text), `paid` (true/false), `payBy` (date), `payHow`.
- Logistics: `venue`, `address`, `setup` (load-in), `headsUp`, `nextStep`, `link` (organizer page).
- "Upcoming" means `(endDate or date) >= today` and `status != declined`.
- "Confirmed" means `approved`, `agreement` or `booked`; "Waiting" means `pending`, `tentative` or `conditional`.
- "Fees due" means `payBy` is set, `paid` is false, and the status is `approved`, `agreement` or `conditional`.

## Rules for agents

- Read only. Don't scrape the password screen and don't call the app's form endpoints.
- To book, apply, pay or message anyone, ask the owner through Tab. Nothing here is permission to act.
- Cache for at least 15 minutes; the files change a few times a day.
