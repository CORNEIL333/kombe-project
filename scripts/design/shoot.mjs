// Captures visuelles des prototypes/surfaces (QA visuelle KÓMBE).
// Usage : node scripts/design/shoot.mjs <url|fichier> <sortie.png> [largeur] [hauteur] [attente-ms] [fullPage=1]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const [src, out, w = "1440", h = "900", wait = "3200", full = "1"] = process.argv.slice(2);
const url = /^https?:/.test(src) ? src : pathToFileURL(resolve(src)).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(+wait);
// Parcourt la page pour déclencher les révélations au défilement, puis revient en haut.
if (full === "1") {
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.waitForTimeout(900);
}
await page.screenshot({ path: out, fullPage: full === "1" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(JSON.stringify({ out, errors, horizontalOverflowPx: overflow }));
await browser.close();
