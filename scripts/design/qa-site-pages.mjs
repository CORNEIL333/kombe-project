// QA visuelle des pages du site (/site/…) : capture chaque page, plus le menu
// ouvert (ordinateur et mobile). Usage : node scripts/design/qa-site-pages.mjs [base] [dossier] [largeur] [hauteur]
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4400", out = ".", w = "1440", h = "900"] = process.argv.slice(2);
const PAGES = ["", "aide/", "securite/", "a-propos/", "telecharger/", "legal/", "legal/conditions/", "legal/cookies/"];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/v1/")) errors.push(`${r.status()} ${r.url()}`); });
for (const path of PAGES) {
  await p.goto(`${base}/site/${path}`);
  await p.waitForTimeout(1600);
  const name = path.replace(/\//g, "-").replace(/-$/, "") || "accueil";
  await p.screenshot({ path: `${out}/site-${name}-${w}.png`, fullPage: true });
}
await p.goto(`${base}/site/aide/`);
await p.waitForTimeout(800);
if (+w >= 980) await p.click(".menu__btn[aria-controls=m-espaces]");
else await p.click(".burger");
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/site-menu-${w}.png` });
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ errors, overflow }));
await b.close();
