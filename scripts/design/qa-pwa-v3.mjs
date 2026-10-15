// QA visuelle de la PWA connectée. Les réponses /v1 sont INTERCEPTÉES dans le
// navigateur de test uniquement (données d'exemple conformes à @kombe/domain) :
// rien n'est embarqué dans l'application ni envoyé à l'API réelle.
// Usage : node scripts/design/qa-pwa-v3.mjs [base=http://localhost:4400] [dossier] [largeur=390] [hauteur=844]
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4400", out = ".", w = "390", h = "844"] = process.argv.slice(2);

import { fixtures, G } from "./fixtures-v1.mjs";

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
  if (session) await p.addInitScript(() => window.localStorage.setItem("kombe.session", JSON.stringify({ sessionId: "qa", identityId: "me", expiresAt: Date.now() + 3600000 })));
  return p;
}
const shot = async (p, hash, name, full = false) => {
  await p.goto(`${base}/${hash}`);
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/pwa-${name}-${w}.png`, fullPage: full });
};
const anon = await page(false);
await shot(anon, "", "connexion", true);
const p = await page(true);
await shot(p, "#/", "accueil", true);
await shot(p, `#/groupe/${G}`, "groupe", true);
await shot(p, "#/creer", "creer", true);
await shot(p, "#/notifications", "notifications", true);
console.log(JSON.stringify({ errors }));
await b.close();
