#!/usr/bin/env node
// MarketDesk helper: copy the market + opportunities feed from another deployment into ./data.
//   node tools/fetch-data.mjs https://jaysteeljewelry.github.io/jaysteel-market-logistics-app
// Same-origin requirement: this is a static-site fetch, so remote hosts must serve CORS headers
// or the files must live on the same origin. It is mostly meant for local/self-host setups.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = String(process.argv[2] || "").replace(/\/+$/, "");
if (!base) { console.error("usage: node tools/fetch-data.mjs <base-url>"); process.exit(1); }

for (const f of ["events.json", "opportunities.json"]) {
  const url = base + "/data/" + f;
  const out = path.join(root, "data", f);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const txt = await r.text();
    JSON.parse(txt); // validate
    fs.writeFileSync(out, txt + "\n");
    console.log("✓ " + out + "  (" + (txt.length / 1024).toFixed(1) + " KB)");
  } catch (e) {
    console.warn("✗ " + f + " — " + e.message + " (skipped)");
  }
}
console.log("done. Refresh the app to load the new data.");