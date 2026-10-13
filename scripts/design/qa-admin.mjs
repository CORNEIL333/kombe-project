// QA visuelle du dashboard admin groupe : parcours de connexion RÉEL de l'UI,
// réponses API interceptées dans le navigateur de test uniquement (fixtures de
// QA, jamais embarquées dans un build). Usage :
//   node scripts/design/qa-admin.mjs <baseUrl> <dossier-sortie>
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4311", out = "docs/brand/screens"] = process.argv.slice(2);
const now = Date.now(), day = 86400000;
const fixtures = {
  "/v1/access/login-requests": { accepted: true },
  "/v1/access/login-completions": { sessionId: "qa-session", expiresAt: now + 3600000 },
  "/schedules": { groupId: "grp-qa", ruleVersion: 3, memberCount: 12, rounds: 12, frequency: "monthly", state: "started", contribution: "25000", roundPot: "300000", cycleExpectedTotal: "3600000",
    schedule: Array.from({ length: 12 }, (_, i) => ({ seq: i + 1, dueAtMs: now + (i - 3) * 30 * day })) },
  "/cycle-readiness": { acceptedIndependentRoles: 2, requiredIndependentRoles: 2, rulesAcceptedByAllMembers: false },
  "/dispute-cases": [{ disputeId: "lit-1", state: "open" }],
};
const browser = await chromium.launch();
const errors = [];
for (const [name, w, h] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.route(/\/v1\//, (route) => {
    const u = route.request().url();
    const key = Object.keys(fixtures).find((k) => u.includes(k));
    route.fulfill({ status: key ? 200 : 404, contentType: "application/json", body: JSON.stringify(key ? fixtures[key] : { error: "NOT_FOUND" }) });
  });
  await page.goto(base);
  await page.getByLabel("Identité (identityId)").fill("tresorier-qa");
  await page.getByRole("button", { name: "Recevoir le code" }).click();
  await page.getByLabel("Code de connexion").fill("123456");
  await page.getByRole("button", { name: "Ouvrir la session" }).click();
  await page.getByLabel("Identifiant du groupe").fill("grp-qa");
  await page.getByRole("button", { name: "Ouvrir ce groupe" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/admin-home-${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(JSON.stringify({ name, overflow }));
  await page.close();
}
console.log(JSON.stringify({ errors }));
await browser.close();
