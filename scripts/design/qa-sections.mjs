// Capture chaque section (par id) à taille réelle après défilement : QA des détails.
// Usage : node scripts/design/qa-sections.mjs <url> <dossier> <largeur> <hauteur> id1,id2,...
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [url, out, w = "1440", h = "900", ids = ""] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
for (const id of ids.split(",").filter(Boolean)) {
  await p.evaluate((i) => { const el = document.getElementById(i); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "instant" }); }, id);
  await p.waitForTimeout(1700);
  await p.screenshot({ path: `${out}/${id}-${w}.png` });
}
console.log(JSON.stringify({ errors, overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) }));
await b.close();
