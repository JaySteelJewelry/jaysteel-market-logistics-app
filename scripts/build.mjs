#!/usr/bin/env node
// One-command build for the JAY STEEL logistics app.
// It verifies the site (tests + syntax + data) and copies it into dist/ so it can be
// hosted on any static host (or pushed anywhere). The live site itself is served from
// the repo root by GitHub Pages, so this is a release/export helper, not a compile step.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

console.log("· tests            node --test test/site.test.mjs");
execSync("node --test test/site.test.mjs", { cwd: root, stdio: "inherit" });

for (const f of ["index.html"]) void f; // (index.html is validated by the test suite)
console.log("· syntax           node --check on every JS file");
for (const f of fs.readdirSync(root).filter((f) => f.endsWith(".js"))) execSync(`node --check ${f}`, { cwd: root, stdio: "inherit" });
for (const f of fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".mjs"))) execSync(`node --check scripts/${f}`, { cwd: root, stdio: "inherit" });

console.log("· data             every data/*.json parses");
for (const f of fs.readdirSync(path.join(root, "data")).filter((f) => f.endsWith(".json")))
  JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

console.log("· export           copying site to dist/ …");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const skip = new Set([".git", "dist", "scripts", "test", ".github", "__pycache__"]);
const copy = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const src = path.join(dir, e.name);
    const dst = path.join(dist, path.relative(root, src));
    if (e.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copy(src); }
    else fs.copyFileSync(src, dst);
  }
};
copy(root);
const sizeKB = (d) => Math.round(fs.readdirSync(d, { recursive: true })
  .filter((f) => fs.statSync(path.join(d, f)).isFile())
  .reduce((n, f) => n + fs.statSync(path.join(d, f)).size, 0) / 1024);
console.log(`\n✓ build OK · dist/ ready (${sizeKB(dist).toLocaleString()} KB)`);
console.log("  Host dist/ on any static host, or deploy the repo root via GitHub Pages.");
