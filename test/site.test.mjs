// node --test test/  (web build standard, Oct 25 2026)
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const R = new URL('..', import.meta.url).pathname, rd = (f) => readFileSync(R + f, 'utf8');
const html = rd('index.html'), js = rd('app.js'), css = rd('styles.css'), sw = rd('sw.js');
test('shell: title, viewport, local assets exist', () => {
  assert.match(html, /<title>[^<]+<\/title>/); assert.match(html, /name="viewport" content="width=device-width/);
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+)(?:\?[^"]*)?"/g)) assert.ok(existsSync(R + m[1]), 'missing ' + m[1]);
});
test('service worker shell matches the versioned assets the page loads', () => {
  for (const m of html.matchAll(/(styles\.css|app\.js)\?v=(\d+)/g)) assert.ok(sw.includes(`"${m[1]}?v=${m[2]}"`), 'sw cache missing ' + m[0]);
});
test('events.json keeps its array-of-events shape', () => {
  const d = JSON.parse(rd('data/events.json')); const list = Array.isArray(d) ? d : d.events;
  assert.ok(Array.isArray(list) && list.length > 0); for (const e of list) assert.ok(e.id && e.date, 'event needs id + date');
});
test('security: new-tab links use noopener; no secrets or plain password', () => {
  for (const m of (html + js).matchAll(/target="_blank"[^>]*/g)) assert.match(m[0], /noopener/);
  assert.ok(!/ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|discord(app)?\.com\/api\/webhooks/.test(html + js));
  const pw = '/home/user/tab/state/hq/password.txt'; if (existsSync(pw)) { const p = readFileSync(pw, 'utf8').trim(); assert.ok(!(html + js).includes(p)); }
});
test('accessibility basics: focus ring, reduced motion, AA faint text', () => {
  assert.match(css, /:focus-visible\{outline/); assert.ok(css.includes('*,*::before,*::after{scroll-behavior:auto!important;animation-duration'));
  assert.ok(!css.includes('--faint:#8a8d92') && !css.includes('--faint:#6d7076'), 'faint text below 4.5:1');
  assert.ok(js.includes('const esc ='), 'data is escaped before rendering');
});
test('data: schema files exist and parse; markets.ics stays a balanced VCALENDAR', () => {
  for (const f of ['events.schema.json', 'opportunities.schema.json']) { JSON.parse(rd('data/' + f)); }
  const ics = rd('data/markets.ics');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, ics.match(/END:VEVENT/g).length);
});
test('runtime safety net: device error capture exists and is bounded', () => {
  assert.ok(js.includes('unhandledrejection'), 'captures unhandled rejections');
  assert.ok(js.includes('jsl.err'), 'bounded error log key');
  assert.ok(js.includes('ERR_MAX'), 'log is capped');
});
test('password gate: PBKDF2 + retry lockout present, legacy unlock preserved', () => {
  assert.ok(html.includes('PBKDF2') && html.includes('jsl-pw2'), 'gate enrolls a slow per-device check');
  assert.ok(html.includes('jsl-at') && html.includes('Wrong password · try again in'), 'wrong-guess lockout');
  assert.ok(html.includes('await h(v)===H'), 'legacy (offline-safe) check is still the fallback');
});
test('service worker: navigationPreload + external image cache, old caches still purged', () => {
  assert.ok(sw.includes('navigationPreload.enable'), 'activate enables preload');
  assert.ok(sw.includes('IMG_CACHE') && sw.includes('jsl-img-v1'), 'image cache defined');
  assert.ok(sw.includes('k !== CACHE && k !== IMG_CACHE'), 'image cache survives activate purge');
});
test('primary nav: 5-tab bottom dock present and wired into the tab system', () => {
  assert.match(html, /class="dock"/);
  assert.ok(html.includes('id="more-btn"'), 'dock More button opens the slide-in menu');
  assert.ok(js.includes('.dock a[data-tab]'), 'setTab highlights dock links too');
  assert.ok(js.includes('more.addEventListener'), 'dock More is wired to the menu');
});
test('map: dark/light basemap with automatic OSM fallback', () => {
  assert.ok(js.includes('basemaps.cartocdn.com'), 'uses a real dark/light basemap');
  assert.ok(js.includes('tileerror'), 'falls back on tile errors');
  assert.ok(js.includes('t-osm-dark') || js.includes('t-osm-ink'), 'fallback tile filter class present');
});
test('design tokens: dark default, gold accent, no forbidden faint values', () => {
  assert.ok(css.includes('--accent:#E6C87C'), 'gold accent is the brand accent');
  assert.ok(css.includes('.dock a[aria-current]'), 'dock has an active state');
  assert.ok(!css.includes('--faint:#8a8d92') && !css.includes('--faint:#6d7076'), 'faint text below 4.5:1');
});
test('build: one-command build script exists', () => {
  assert.ok(existsSync('scripts/build.mjs'));
});
