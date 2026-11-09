// Capture la fenêtre à plusieurs positions de défilement (QA des scènes animées).
// Usage : node scripts/design/qa-scroll.mjs <url> <prefixe> [largeur] [hauteur] [positions séparées par des virgules, en px ou en % de la page]
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [url, prefix, w = "1440", h = "900", stops = "0,15%,30%,45%,60%,75%,90%"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(url);
await p.waitForTimeout(2200);
const total = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
let i = 0;
for (const s of stops.split(",")) {
  const y = s.endsWith("%") ? Math.round((parseFloat(s) / 100) * total) : +s;
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${prefix}-${String(i++).padStart(2, "0")}.png` });
}
console.log(JSON.stringify({ errors, total }));
await b.close();
