#!/usr/bin/env node
// A one-command release bump for the versioned assets the service worker shells.
// Keeps index.html's `?v=` and the SW's SHELL list in sync, and bumps the cache name
// (so old caches are dropped on the next activate). Nothing else changes.
//   node scripts/bump-version.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "index.html");
const swPath = path.join(root, "sw.js");

const nextV = (text, file) => {
  const m = text.match(new RegExp('("' + file + '\\?v=)(\\d+)'));
  if (!m) { console.error(file + ' not found in index.html'); process.exit(1); }
  text = text.replace(m[0], m[1] + (+m[2] + 1));
  return { text, from: +m[2], to: +m[2] + 1 };
};

let html = fs.readFileSync(htmlPath, "utf8");
let { text, from: cssFrom, to: cssTo } = nextV(html, "styles.css"); html = text;
let r2 = nextV(html, "app.js"); html = r2.text;

let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(`"styles.css?v=${cssFrom}"`, `"styles.css?v=${cssTo}"`)
       .replace(`"app.js?v=${r2.from}"`, `"app.js?v=${r2.to}"`);
const c = sw.match(/const CACHE = "jsl-v(\d+)"/);
if (!c) { console.error('cache name not found in sw.js'); process.exit(1); }
const cache = parseInt(c[1], 10) + 1;
sw = sw.replace(/const CACHE = "jsl-v\d+"/, `const CACHE = "jsl-v${cache}"`);

fs.writeFileSync(htmlPath, html);
fs.writeFileSync(swPath, sw);
console.log(`styles.css?v=${cssFrom}\u2192${cssTo}   app.js?v=${r2.from}\u2192${r2.to}   cache jsl-v${c[1]}\u2192jsl-v${cache}`);
