#!/usr/bin/env node
// KÓMBE — parcours navigateur de bout en bout : PWA (assistance) et CRM.
//
// Sur une API RÉELLE locale (base jetable) servant aussi le web (KOMBE_WEB_ROOT) :
// crée des comptes, un groupe, une invitation, des demandes d'assistance, un
// opérateur admin avec son second facteur, puis ouvre 20 pages (CRM et PWA) en
// 1280 et 390 px. Pour chaque page : aucune erreur JavaScript, aucune réponse
// /v1 en erreur, aucun défilement horizontal, aucune violation axe-core
// (WCAG 2.2 AA). Jamais contre la production : la garde refuse l'hôte de prod.
//
// Prérequis : API locale (voir README), `pnpm -r run build`, `node scripts/build-web.mjs`.
// Env : KOMBE_E2E_BASE_URL (défaut http://127.0.0.1:3311) ; KOMBE_DATABASE_URL
// (rôle propriétaire de la même base, pour grant-operator).
// Sortie : 0 PASS, 1 FAIL, 2 BLOCKED (API ou navigateur indisponible).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const B = (process.env.KOMBE_E2E_BASE_URL ?? "http://127.0.0.1:3311").replace(/\/+$/, "");
const DB = process.env.KOMBE_DATABASE_URL;
const SHOTS = process.env.KOMBE_E2E_SHOTS ?? "";
const out = (o, code) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
if (/kombe\.vercel\.app|ep-ancient-glade/.test(B + (DB ?? ""))) out({ status: "BLOCKED", reason: "Production refusée : parcours réservé à une base jetable." }, 2);
if (!DB) out({ status: "BLOCKED", reason: "KOMBE_DATABASE_URL absente (rôle propriétaire de la base de l'API locale)." }, 2);

const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req("playwright")); } catch {
  try { ({ chromium } = req(resolve(ROOT, "packages/client/node_modules/@playwright/test"))); } catch { out({ status: "BLOCKED", reason: "Playwright introuvable." }, 2); }
}
const AXE = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
const { base32Decode, totpAt } = await import(resolve(ROOT, "packages/api/dist/ops/operatorAccess.js"));

const ping = await fetch(`${B}/v1/health/ready`).then((r) => r.json()).catch(() => null);
if (!ping || ping.status !== "ready") out({ status: "BLOCKED", reason: `API locale non prête sur ${B}` }, 2);

const j = async (m, p, b, t, h = {}) => {
  const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}), ...h }, body: b ? JSON.stringify(b) : (m === "GET" ? undefined : "{}") });
  const x = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x)}`);
  return x;
};
const run = String(Date.now()).slice(-5);
const login = async (n, name) => {
  const rq = await j("POST", "/v1/auth/code-requests", { login: `69${run}${n}`.slice(0, 9) });
  const s = await j("POST", "/v1/auth/code-verifications", { login: rq.login, code: rq.devCode });
  await j("PATCH", "/v1/me", { displayName: name }, s.sessionId);
  return { id: rq.login, t: s.sessionId };
};

// ── Données réelles du parcours ──
const A = await login(1, "Alice Admin"), P = await login(2, "Awa Présidente"), M = await login(3, "Bertrand Membre");
const d = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const settings = { contributionPerShare: "5000", cadence: { kind: "weekly", weekday: new Date(d + "T12:00:00Z").getUTCDay() }, firstMeetingDate: d, deadlineTime: "18:00", meetingPlace: "Akwa", maxMembers: 10, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance", newcomersLast: false, guarantorRequired: false, payoutWitnesses: 0, fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 }, solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" } };
const g = await j("POST", "/v1/tontines", { name: `Njangi ${run}`, founderDisplayName: "Awa Présidente", settings }, P.t);
const inv = await j("POST", `/v1/tontines/${g.groupId}/invitations`, { maxUses: 5, days: 7 }, P.t);
await j("POST", `/v1/invitations/${inv.code}/join`, { displayName: "Bertrand Membre" }, M.t);
const grant = spawnSync(process.execPath, [resolve(ROOT, "packages/db/scripts/grant-operator.mjs"), A.id, "--roles=admin"], { env: { ...process.env, KOMBE_DATABASE_URL: DB }, encoding: "utf8" });
if (grant.status !== 0) out({ status: "FAIL", reason: "grant-operator", detail: grant.stdout + grant.stderr }, 1);
const enr = await j("POST", "/v1/ops/mfa/enrollment", null, A.t);
await j("POST", "/v1/ops/mfa/activation", { code: totpAt(base32Decode(enr.secret), Date.now()) }, A.t);
const t1 = await j("POST", "/v1/me/support-tickets", { subject: "Ma cotisation n'apparaît pas", category: "cotisation", body: "J'ai versé 5000 XAF mardi en espèces, rien ne s'affiche.", groupId: g.groupId }, P.t);
await j("POST", "/v1/me/support-tickets", { subject: "Accès à mes données", category: "donnees_personnelles", body: "Je souhaite une copie de mes données personnelles." }, M.t);
const tt = (await j("GET", "/v1/crm/tickets", null, A.t)).find((x) => x.ticketId === t1.ticketId);
await j("PATCH", `/v1/crm/tickets/${t1.ticketId}`, { impact: 2, urgency: 2 }, A.t, { "if-match-version": String(tt.version) });
await j("POST", `/v1/crm/tickets/${t1.ticketId}/messages`, { visibility: "interne", body: "Vérifier avec le trésorier." }, A.t);
await j("POST", `/v1/crm/tickets/${t1.ticketId}/messages`, { visibility: "public", body: "Le trésorier doit confirmer votre déclaration." }, A.t);
await j("POST", "/v1/crm/notes", { groupId: g.groupId, body: "Groupe accompagné au démarrage." }, A.t);
await j("POST", "/v1/crm/tasks", { title: "Rappeler le trésorier", groupId: g.groupId, ticketId: t1.ticketId }, A.t);
const cid = (await j("GET", `/v1/crm/accounts/${g.groupId}`, null, A.t)).contacts[0].contactId;

const pages = [
  ["crm-tableau", "/crm/#/", A], ["crm-demandes", "/crm/#/demandes", A], ["crm-demande", `/crm/#/demandes/${t1.ticketId}`, A],
  ["crm-comptes", "/crm/#/comptes", A], ["crm-compte", `/crm/#/comptes/${g.groupId}`, A], ["crm-contacts", "/crm/#/contacts", A], ["crm-contact", `/crm/#/contacts/${cid}`, A],
  ["crm-taches", "/crm/#/taches", A], ["crm-segments", "/crm/#/segments", A], ["crm-conformite", "/crm/#/conformite", A], ["crm-journal", "/crm/#/journal", A],
  ["crm-ops", "/crm/#/ops", A], ["crm-acces", "/crm/#/ops/acces", A], ["crm-runbooks", "/crm/#/ops/runbooks", A], ["crm-direction", "/crm/#/direction", A], ["crm-risques", "/crm/#/direction/risques", A],
  ["crm-technique", "/crm/#/technique", A], ["crm-integration", "/crm/#/technique/integration", A],
  ["pwa-aide", "/#/aide", P], ["pwa-demande", `/#/aide/demandes/${t1.ticketId}`, P],
];
let browser;
try { browser = await chromium.launch(); } catch (e) { out({ status: "BLOCKED", reason: `Chromium : ${String(e).slice(0, 200)}` }, 2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = {};
let failures = 0;
for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const [name, path, who] of pages) {
    const ctx = await browser.newContext({ viewport: vp, bypassCSP: true });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(e.message));
    pg.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/v1/")) errs.push(`${r.status()} ${r.url().replace(B, "")}`); });
    await pg.addInitScript(([id, sid]) => {
      const s = JSON.stringify({ identityId: id, sessionId: sid, expiresAt: Date.now() + 3600e3 });
      localStorage.setItem("kombe.session", s);
      sessionStorage.setItem("kombe.dashboard.session", s);
    }, [who.id, who.t]);
    await pg.goto(B + path);
    await pg.waitForLoadState("networkidle");
    await pg.waitForTimeout(1200); // animations d'entrée terminées avant l'analyse de contraste
    if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${name}@${vp.width}.png`, fullPage: true });
    await pg.addScriptTag({ content: AXE });
    const axe = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] })).violations.map((v) => `${v.id}×${v.nodes.length}`));
    const hscroll = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const h1 = await pg.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
    const ok = errs.length === 0 && axe.length === 0 && !hscroll && h1 !== "";
    if (!ok) failures += 1;
    results[`${name}@${vp.width}`] = ok ? "OK" : { errs, axe, hscroll, h1 };
    await ctx.close();
  }
}
await browser.close();
out({ target: "kombe.e2e.parcours-crm", status: failures === 0 ? "PASS" : "FAIL", pages: Object.keys(results).length, failures, results }, failures === 0 ? 0 : 1);
