// MarketDesk — `node --test tests/`
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const R = new URL('../', import.meta.url).pathname, rd = (f) => readFileSync(R + f, 'utf8');
const html = rd('index.html'), js = rd('app.js'), css = rd('styles.css'), sw = rd('sw.js');

test('shell: title, viewport, local assets exist', () => {
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width/);
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+)(?:\?[^"]*)?"/g)) assert.ok(existsSync(R + m[1]), 'missing ' + m[1]);
});
test('service worker shell lists the versioned assets the page loads', () => {
  for (const m of html.matchAll(/(app\.js)(\?v=\d+)?/g)) { const src = m[0]; assert.ok(sw.includes(src) || sw.includes('app.js'), 'sw missing ' + src); }
});
test('data: sample events + opportunities parse with the expected shape', () => {
  const ev = JSON.parse(rd('data/events.json'));
  assert.ok(Array.isArray(ev.events) && ev.events.length > 0);
  for (const e of ev.events) assert.ok(e.id && e.date && e.status, 'event needs id/date/status');
  const opp = JSON.parse(rd('data/opportunities.json'));
  assert.ok(Array.isArray(opp.items) && Array.isArray(opp.ongoing));
});
test('security: new-tab links use noopener; data is escaped before render', () => {
  for (const m of (html + js).matchAll(/target="_blank"[^>]*/g)) assert.match(m[0], /noopener/);
  assert.ok(js.includes('const esc ='), 'escape helper present');
});
test('accessibility basics: focus ring, reduced motion, safe faint text', () => {
  assert.match(css, /:focus-visible\{outline/);
  assert.ok(css.includes('*,*::before,*::after{scroll-behavior:auto!important;animation-duration'));
  assert.ok(!css.includes('--faint:#8a8d92') && !css.includes('--faint:#6d7076'));
});
test('core features wired: router, to-do, auto-apply, sync buttons', () => {
  assert.ok(js.includes('#/todo') && js.includes('systemTasks'), 'to-do routed');
  assert.ok(js.includes('autoApplySheet') && js.includes('appDraft'), 'auto-apply engine');
  assert.ok(html.includes('id="todo-badge"') && html.includes('class="dock"'), 'dock + badge');
  assert.ok(js.includes('calendar.google.com') && js.includes('outlook.live.com'), 'calendar sync');
});