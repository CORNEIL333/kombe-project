// QA visuelle PWA : onglet « Créer un groupe » puis « Ma cotisation » (connexion), desktop + mobile.
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4312", out = "docs/brand/screens"] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
for (const [name, w, h] of [["desktop", 1440, 960], ["mobile", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.goto(base);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/pwa-groupe-${name}.png`, fullPage: true });
  await page.getByRole("tab", { name: /cotisation/i }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/pwa-connexion-${name}.png`, fullPage: true });
  console.log(JSON.stringify({ name, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) }));
  await page.close();
}
console.log(JSON.stringify({ errors }));
await browser.close();
