# AGENTS.md — guide for AI agents maintaining MarketDesk

MarketDesk is a dependency-free static web app: vanilla HTML/CSS/JS + a tiny service worker.
There is no build step and no package.json. The user-facing view is behind no gate by default
(`window.MARKETDESK.unlock` enables one; never invent a password).

## How it's organized

| File | What it is |
|---|---|
| `index.html` | Shell: header, slide-in menu, bottom dock, optional unlock gate, PWA meta |
| `app.js` | Everything else: router, views (today, todo, markets, find, calendar, map, money, settings, about), data loading, localStorage state, auto-apply, .ics generation |
| `styles.css` | The whole design system — dark-first, gold accent, per-tab accent via `body[data-tab]`, light theme in `[data-theme="light"]` |
| `sw.js` | Service worker: shell cache-first, `.json`/`.ics` network-first with cache fallback |
| `data/events.json` | Market calendar (same shape as the JAY STEEL logistics app) |
| `data/opportunities.json` | Vendor-leads feed (Find tab). Can be produced by any external scanner |
| `tools/fetch-data.mjs` | Copies `events.json` + `opportunities.json` from another deployment into `data/` |
| `tests/site.test.mjs` | `node --test tests/site.test.mjs` — shell/asset consistency, security, a11y baselines |

## Rules

- **No new dependencies.** Keep it dependency-free and buildless. If you need a library, add it
  as a vendored file with its license.
- **Escaping:** any user/feed data rendered into `innerHTML` must go through `esc()`.
- **External links** in new-tab anchors must include `rel="noopener"`.
- **Run `node --test tests/` before changing anything** and keep it green; keep the three a11y
  invariants the test checks: `:focus-visible` outline, the reduced-motion block, and faint text
  ≥ 4.5:1 contrast.
- **localStorage keys** are prefixed `md.` (e.g., `md.todos`, `md.applied`, `md.profile`).
- **Version bumps:** bump `app.js?v=` in `index.html` + the `sw.js` `SHELL` + `CACHE` name when
  the JS or CSS changes, so installed PWAs pick up the update.
- **Never add paid services** to this project without an explicit order. All current integrations
  (map tiles, fonts) are free/open source with attribution shown.