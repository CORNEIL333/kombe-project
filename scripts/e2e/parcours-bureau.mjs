#!/usr/bin/env node
// KÓMBE — parcours navigateur de l'Espace bureau, en français et en anglais (A17).
//
// Sur une API RÉELLE locale (base jetable) servant aussi le web : crée une
// présidente et un membre, un groupe, une invitation, puis ouvre les 9 pages
// de /bureau/ en 1280 et 390 px, en français puis en anglais (langue choisie
// dans l'application : clé `kombe.langue`). Pour chaque page : aucune erreur
// JavaScript, aucune réponse /v1 en erreur, aucun défilement horizontal,
// aucune violation axe-core (WCAG 2.2 AA), un titre h1 ; en anglais, aucun
// texte d'interface resté en français. Jamais contre la production.
//
// Prérequis : API locale (voir README), `pnpm -r run build`, `node scripts/build-web.mjs`.
// Env : KOMBE_E2E_BASE_URL (défaut http://127.0.0.1:3311). Sortie : 0 PASS, 1 FAIL, 2 BLOCKED.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const B = (process.env.KOMBE_E2E_BASE_URL ?? "http://127.0.0.1:3311").replace(/\/+$/, "");
const out = (o, code) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
if (/kombe\.vercel\.app/.test(B)) out({ status: "BLOCKED", reason: "Production refusée : parcours réservé à une base jetable." }, 2);
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req("playwright")); } catch { out({ status: "BLOCKED", reason: "Playwright introuvable." }, 2); }
const AXE = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
const ping = await fetch(`${B}/v1/health/ready`).then((r) => r.json()).catch(() => null);
if (!ping || ping.status !== "ready") out({ status: "BLOCKED", reason: `API locale non prête sur ${B}` }, 2);

const j = async (m, p, b, t) => {
  const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : (m === "GET" ? undefined : "{}") });
  const x = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x)}`);
  return x;
};
const run = String(Date.now()).slice(-5);
const login = async (n, name) => {
  const rq = await j("POST", "/v1/auth/code-requests", { login: `68${run}${n}`.slice(0, 9) });
  const s = await j("POST", "/v1/auth/code-verifications", { login: rq.login, code: rq.devCode });
  await j("PATCH", "/v1/me", { displayName: name }, s.sessionId);
  return { id: rq.login, t: s.sessionId };
};
const P = await login(1, "Awa Mballa"), M = await login(2, "Paul Ndi");
const d = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const settings = { contributionPerShare: "5000", cadence: { kind: "weekly", weekday: new Date(d + "T12:00:00Z").getUTCDay() }, firstMeetingDate: d, deadlineTime: "18:00", meetingPlace: "Akwa", maxMembers: 10, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance", newcomersLast: false, guarantorRequired: false, payoutWitnesses: 0, fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 }, solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" } };
const g = await j("POST", "/v1/tontines", { name: `Njangi ${run}`, founderDisplayName: "Awa Mballa", settings }, P.t);
const inv = await j("POST", `/v1/tontines/${g.groupId}/invitations`, { maxUses: 5, days: 7 }, P.t);
await j("POST", `/v1/invitations/${inv.code}/join`, { displayName: "Paul Ndi" }, M.t);
// Statuts publiés : la page Règlement les affiche (sans statuts, l'API répond 404 par conception).
await j("POST", `/v1/tontines/${g.groupId}/statutes`, {}, P.t);

const pages = ["/", "/collecte", "/mouvements", "/membres", "/seances", "/discipline", "/votes", "/registre", "/reglement"];
// Mots d'interface français sans homographe anglais courant (données du groupe exclues).
const FR = /(?<![\p{L}])(cotisations?|séances?|membres|groupe|trésorier|déclaré|confirmé|aucune?|tours?|règlement|statuts|amendes?|secours|dettes?|votes? ouverts?|à confirmer|en attente|se déconnecter)(?![\p{L}])/iu;
let browser;
try { browser = await chromium.launch(); } catch (e) { out({ status: "BLOCKED", reason: `Chromium : ${String(e).slice(0, 200)}` }, 2); }
const results = {};
let failures = 0;
for (const langue of ["fr", "en"]) {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    for (const path of pages) {
      const ctx = await browser.newContext({ viewport: vp, bypassCSP: true }); // axe injecté pour l'analyse seulement
      const pg = await ctx.newPage();
      const errs = [];
      pg.on("pageerror", (e) => errs.push(e.message));
      pg.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/v1/")) errs.push(`${r.status()} ${r.url().replace(B, "")}`); });
      await pg.addInitScript(([id, sid, l]) => {
        const s = JSON.stringify({ identityId: id, sessionId: sid, expiresAt: Date.now() + 3600e3 });
        sessionStorage.setItem("kombe.dashboard.session", s);
        localStorage.setItem("kombe.langue", l);
      }, [P.id, P.t, langue]);
      await pg.goto(`${B}/bureau/#${path}`);
      await pg.waitForLoadState("networkidle");
      await pg.waitForTimeout(1200);
      await pg.addScriptTag({ content: AXE });
      const axe = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] })).violations.map((v) => `${v.id}×${v.nodes.length}`));
      const hscroll = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const h1 = await pg.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
      const htmlLang = await pg.evaluate(() => document.documentElement.lang);
      let resteFr = [];
      if (langue === "en") {
        // Contenus rédigés en français par le serveur (statuts, procès-verbaux) : marqués lang="fr", exclus.
        const t = await pg.evaluate(() => {
          const fr = new Set([...document.querySelectorAll('[lang="fr"]')].flatMap((e) => e.innerText.split("\n")));
          return document.body.innerText.split("\n").filter((l) => !fr.has(l)).concat([...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""));
        });
        resteFr = t.map((x) => x.replace(/Njangi \d+|Awa Mballa|Paul Ndi|Akwa/g, "")).filter((x) => FR.test(x)).slice(0, 6);
      }
      const ok = errs.length === 0 && axe.length === 0 && !hscroll && h1 !== "" && resteFr.length === 0 && (langue === "fr" || htmlLang === "en");
      if (!ok) failures += 1;
      results[`${langue}${path}@${vp.width}`] = ok ? "OK" : { errs, axe, hscroll, h1, htmlLang, resteFr };
      await ctx.close();
    }
  }
}
await browser.close();
out({ target: "kombe.e2e.parcours-bureau", status: failures === 0 ? "PASS" : "FAIL", pages: Object.keys(results).length, failures, results }, failures === 0 ? 0 : 1);
