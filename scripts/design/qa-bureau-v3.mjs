// QA visuelle des tableaux de bord (Espace bureau + consoles). Réponses /v1
// INTERCEPTÉES dans le navigateur de test (données d'exemple, fixtures-v1.mjs).
// Usage : node scripts/design/qa-bureau-v3.mjs [base] [dossier] [largeur=1440] [hauteur=900]
import { createRequire } from "node:module";
import { fixtures } from "./fixtures-v1.mjs";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4400", out = ".", w = "1440", h = "900"] = process.argv.slice(2);

const b = await chromium.launch();
const errors = [];
async function page(session) {
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.route(/\/v1\//, (route) => {
    const r = route.request();
    const hit = fixtures.find(([m, re]) => m === r.method() && re.test(new URL(r.url()).pathname));
    route.fulfill({ status: hit ? 200 : 404, contentType: "application/json", body: JSON.stringify(hit ? hit[2] : { error: "NOT_FOUND" }) });
  });
  if (session) await p.addInitScript(() => window.sessionStorage.setItem("kombe.dashboard.session", JSON.stringify({ identityId: "amina@exemple.cm", sessionId: "qa", expiresAt: Date.now() + 3600000 })));
  return p;
}
const shot = async (p, url, name, full = false) => {
  await p.goto(`${base}${url}`);
  await p.waitForTimeout(2400);
  await p.screenshot({ path: `${out}/bureau-${name}-${w}.png`, fullPage: full });
};
const anon = await page(false);
await shot(anon, "/bureau/", "connexion");
await shot(anon, "/ops/", "ops-connexion");
const p = await page(true);
await shot(p, "/bureau/#/", "apercu", true);
await shot(p, "/bureau/#/collecte", "collecte", true);
await shot(p, "/bureau/#/mouvements", "mouvements");
await shot(p, "/direction/", "direction");
console.log(JSON.stringify({ errors }));
await b.close();
