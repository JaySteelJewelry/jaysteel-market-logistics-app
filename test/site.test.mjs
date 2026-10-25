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
