// Exporte les écrans web vers docs/figma : capture PNG + calques (JSON) pour le plugin.
// Données d'exemple interceptées dans le navigateur, aucune requête réelle, aucune photo.
// Usage : node scripts/design/serve-web.mjs 4400 (autre terminal), puis
//         node scripts/figma/capturer-web.mjs http://localhost:4400 docs/figma
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const { fixtures } = await import(new URL("../design/fixtures-v1.mjs", import.meta.url));
import { extraire } from "./extraire.mjs";
const [base = "http://localhost:4400", dest = "docs/figma", filtre = ""] = process.argv.slice(2);
const J = 86400000, now = Date.now();
const iso = (d) => new Date(now + d * J).toISOString().slice(0, 10);
const at = (d) => new Date(now + d * J).toISOString();
const noms = ["Amina Ngué", "Paul Abega", "Serge Nkoué", "Marie Abena", "Linda Mbarga", "Chantal Abega", "Éric Kamga", "Joëlle Bilong", "Didier Fotso", "Rose Essomba", "Alain Mbida", "Grâce Onana"];
const fundName = { f1: "Tontine", f2: "Caisse de secours", f3: "Fête de fin d'année", f4: "Urgences" };
// Les mouvements d'exemple n'ont pas fundName : on l'ajoute.
const base0 = fixtures.map(([m, re, body]) => {
  if (String(re) === String(/\/members/)) return [m, re, body.map((x, i) => (i < 3 ? { ...x, photoVersion: null } : x))];
  if (String(re) === String(/\/v1\/me\/tontines/)) return [m, re, body.map((g, i) => (i === 0 ? { ...g, myOpenDue: "26000", cyclePosition: { current: 4, total: 12 } } : { ...g, myOpenDue: "0", cyclePosition: { current: 2, total: 10 } }))];
  if (String(re) === String(/\/movements/) && Array.isArray(body)) return [m, re, body.map((x) => ({ fundName: fundName[x.fundId] ?? "Tontine", ...x }))];
  return [m, re, body];
});
const presence = noms.map((n, i) => ({ membershipId: `m${i + 1}`, displayName: n, status: i === 9 ? "absent" : i === 4 ? "late" : "present", representedByMembershipId: null }));
const seanceDetail = { meetingId: "mt4", seq: 4, date: iso(5), state: "planned", location: "Chez Amina, Bastos", hostName: "Amina Ngué", roundSeq: 4, minutesApproved: false, notes: null, attendance: presence, movements: [], fines: [], minutes: null };
const extra = [
  ["GET", /\/meetings\/[^/]+\/share-text$/, { text: "Séance 4 — Les Étoiles de Yaoundé" }],
  ["GET", /\/meetings\/[^/]+$/, seanceDetail],
  ["GET", /\/meetings$/, [
    { meetingId: "mt4", seq: 4, date: iso(5), state: "planned", location: "Chez Amina, Bastos", hostName: "Amina Ngué", roundSeq: 4, minutesApproved: false },
    { meetingId: "mt3", seq: 3, date: iso(-25), state: "closed", location: "Chez Paul, Mvog-Mbi", hostName: "Paul Abega", roundSeq: 3, minutesApproved: true },
    { meetingId: "mt2", seq: 2, date: iso(-55), state: "closed", location: "Chez Serge, Essos", hostName: "Serge Nkoué", roundSeq: 2, minutesApproved: true },
  ]],
  ["GET", /\/order-changes$/, [{ changeId: "c1", kind: "swap", seqA: 6, seqB: 9, reason: "Rentrée scolaire", state: "requested", requiredNames: ["Linda Mbarga", "Joëlle Bilong"], acceptedNames: ["Linda Mbarga"], needsMyAcceptance: false }]],
  ["GET", /\/history$/, { imports: [{ importId: "h1", label: "Cahier 2025", importedAt: at(-40), accepted: 36, rejected: 1 }], perMember: noms.slice(0, 4).map((n, i) => ({ memberName: n, membershipId: `m${i + 1}`, count: 9, total: "225000", firstDate: "2025-01-15", lastDate: "2025-09-15" })), total: "900000" }],
  ["GET", /\/journal$/, { valid: true, entries: [
    { seq: 42, type: "movement.confirmed", at: at(-0.4), actorName: "Paul Abega", summary: "Versement de 25 000 FCFA confirmé (Amina Ngué, tour 4)", hash: "a1b2c3d4e5f6" },
    { seq: 41, type: "movement.declared", at: at(-1), actorName: "Amina Ngué", summary: "Versement de 25 000 FCFA déclaré (Orange Money)", hash: "b2c3d4e5f6a1" },
    { seq: 40, type: "meeting.closed", at: at(-25), actorName: "Amina Ngué", summary: "Séance 3 close, procès-verbal publié", hash: "c3d4e5f6a1b2" },
  ] }],
  ["GET", /\/decisions$/, [{ decisionId: "d1", kind: "pause", state: "open", targetMembershipId: "m10", targetName: "Rose Essomba", targetRole: null, params: { occurrences: 2, fromSeq: 5 }, reason: "Voyage à l'étranger pour deux mois", openedByName: "Amina Ngué", openedAt: at(-1), closesAt: at(2), electorate: 12, ballots: 7, result: null, myChoice: null, outcomeNote: null, closedAt: null, can: { vote: true, close: true, cancel: true, lift: false } }]],
  ["GET", /\/sanctions$/, [{ membershipId: "m4", displayName: "Marie Abena", lateCount: 2, lateAmount: "50000", openDebt: "0", suggested: "fine", payoutSuspended: false }]],
  ["GET", /\/v1\/invitations\/[^/]+$/, { code: "ETOILE7", groupName: "Les Étoiles de Yaoundé", usable: true, alreadyMember: false }],
  ["POST", /\/v1\/cycle-simulations$/, { cadenceLabel: "Chaque mois, le 15", meetings: 12, firstMeeting: iso(10), lastMeeting: iso(340), spanDays: 330, pot: "300000", perMeetingPerShare: "25000", totalPerShare: "300000", dates: [iso(10), iso(40), iso(70)], summary: "12 séances, de novembre à octobre." }],
];
// Corrections des fixtures d'exemple : état d'amende réel, taux en pourcentage.
const corr = (re, f) => { const i = base0.findIndex(([, r]) => String(r) === String(re)); if (i >= 0) base0[i] = [base0[i][0], base0[i][1], f(base0[i][2])]; };
corr(/\/fines/, (l) => l.map((x) => ({ ...x, state: "issued" })));
corr(/\/regularity/, (l) => l.map((x) => ({ ...x, onTimeRate: Math.round(x.onTimeRate * 100) })));
corr(/\/tontines\/[^/]+$/, (d) => ({ ...d, me: { pendingRoles: [], ...d.me }, flags: d.flags ?? [] }));
corr(/\/statutes/, (d) => ({ pending: [], ...d }));
extra.unshift(["GET", /\/v1\/me\/notification-preferences$/, { pushEnabled: true, smsEnabled: false, emailEnabled: true, quietStart: "21:00", quietEnd: "07:00", devices: 1, unread: 3, available: { push: true, sms: false, email: true } }]);
const fx = [...extra, ...base0];
const G = "#/groupe/grp-etoiles";
const onglets = ["apercu", "membres", "seances", "argent", "tours", "discipline", "decisions", "statuts", "journal", "reglages"];
const pwa = ["#/", "#/groupes", "#/notifications", ...onglets.map((o) => `${G}/${o}`), "#/creer", "#/rejoindre", "#/rejoindre/ETOILE7", "#/cotisations", "#/validations", "#/documents", "#/aide", "#/profil"];
const consoles = {
  bureau: ["/", "/collecte", "/mouvements", "/membres", "/seances", "/discipline", "/votes", "/registre", "/reglement"],
  ops: ["/", "/groupes", "/support", "/sante", "/runbooks"],
  direction: ["/", "/pilote", "/funnel", "/cohorts", "/economics", "/risks", "/gates"],
  engineering: ["/", "/integration"],
};
const site = ["/site/", "/site/a-propos/", "/site/aide/", "/site/securite/", "/site/telecharger/", "/site/legal/", "/site/legal/conditions/", "/site/legal/confidentialite/", "/site/legal/cookies/", "/site/legal/mentions-legales/", "/telecharger/"];
const { consoleFx } = await import(new URL("./fixtures-consoles.mjs", import.meta.url));
const nomEcran = (h) => h.replace(/[#/]+/g, "_").replace(/^_|_$/g, "") || "accueil";
const png = `${dest}/ecrans`, cal = `${dest}/calques`;
mkdirSync(png, { recursive: true }); mkdirSync(cal, { recursive: true });
const inventaire = [], soucis = [];
const b = await chromium.launch();

async function figer(p, groupe, nom, route) {
  if (filtre && !`${groupe}__${nom}`.includes(filtre)) return;
  await p.evaluate(() => document.fonts.ready);
  await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }).catch(() => {});
  await p.waitForTimeout(250);
  const f = `${groupe}__${nom}`;
  await p.screenshot({ path: `${png}/${f}.png`, fullPage: true });
  const j = await p.evaluate(extraire);
  writeFileSync(`${cal}/${f}.json`, JSON.stringify({ groupe, nom, route, ...j }));
  const erreurs = await p.evaluate(() => [...document.querySelectorAll(".msg--erreur,[role=alert]")].map((e) => e.textContent.trim().slice(0, 80)).filter(Boolean));
  if (erreurs.length) soucis.push({ f, erreurs });
  inventaire.push({ groupe, nom, route, largeur: j.w, hauteur: j.h, calques: true });
  console.log(f, j.w, j.h);
}
async function intercepter(p, table) {
  const manquants = new Set();
  await p.route(/\/v1\//, (route) => {
    const r = route.request(), u = new URL(r.url());
    if (u.pathname.endsWith("/photo")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const hit = table.find(([m, re]) => m === r.method() && re.test(u.pathname));
    if (!hit) manquants.add(`${r.method()} ${u.pathname}`);
    let corps = hit ? hit[2] : { error: "NOT_FOUND" };
    const etat = u.searchParams.get("state");
    if (hit && etat && Array.isArray(corps)) corps = corps.filter((x) => x.state === etat);
    route.fulfill({ status: hit ? 200 : 404, contentType: "application/json", body: JSON.stringify(corps) });
  });
  return manquants;
}
// PWA connectée et connexion
for (const w of [390, 820, 1440]) {
  const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: w, height: w < 700 ? 844 : 900 } });
  const p = await ctx.newPage();
  const m = await intercepter(p, fx);
  p.on("pageerror", (e) => soucis.push({ f: `pwa-${w}`, erreur: String(e).slice(0, 160), url: p.url() }));
  await p.addInitScript(() => window.localStorage.setItem("kombe.session", JSON.stringify({ sessionId: "qa", identityId: "me", expiresAt: Date.now() + 3600000 })));
  for (const [i, h] of pwa.entries()) {
    await p.goto(`${base}/${h}`);
    await p.reload();
    await p.waitForTimeout(i === 0 ? 2600 : 1800);
    await figer(p, `pwa-${w}`, nomEcran(h), h);
  }
  if (m.size) soucis.push({ f: `pwa-${w}`, manquants: [...m] });
  await ctx.close();
  const c2 = await b.newContext({ serviceWorkers: "block", viewport: { width: w, height: w < 700 ? 844 : 900 } });
  const q = await c2.newPage();
  await q.route(/\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sms: false, whatsapp: false, email: true }) }));
  await q.goto(`${base}/#/`);
  await q.waitForTimeout(3000);
  await figer(q, `pwa-${w}`, "connexion", "#/ (déconnecté)");
  await c2.close();
}
// Consoles
for (const [nom, chemins] of Object.entries(consoles)) {
  for (const w of [1440, 390]) {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: w, height: w < 700 ? 844 : 900 } });
    const p = await ctx.newPage();
    const m = await intercepter(p, [...consoleFx, ...fx]);
    await p.goto(`${base}/${nom}/`);
    await p.waitForTimeout(1500);
    await figer(p, `console-${nom}-${w}`, "connexion", `/${nom}/`);
    p.on("pageerror", (e) => soucis.push({ f: `console-${nom}-${w}`, erreur: String(e).slice(0, 160), url: p.url() }));
    await p.getByRole("textbox").first().fill("amina@exemple.cm");
    await p.getByRole("button", { name: "Recevoir le code" }).click();
    await p.waitForTimeout(600);
    await p.getByRole("textbox").first().fill("123456");
    await p.getByRole("button", { name: "Ouvrir la session" }).click();
    await p.waitForTimeout(1800);
    for (const c of chemins) {
      await p.evaluate((h) => { window.location.hash = h; }, `#${c}`);
      await p.waitForTimeout(1200);
      await figer(p, `console-${nom}-${w}`, nomEcran(c), `/${nom}/#${c}`);
    }
    if (m.size) soucis.push({ f: `console-${nom}-${w}`, manquants: [...m] });
    await ctx.close();
  }
}
// Site public
for (const w of [390, 1440]) {
  const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: w, height: w < 700 ? 844 : 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const s of site) {
    await p.goto(`${base}${s}`);
    await p.waitForTimeout(900);
    await figer(p, `site-${w}`, nomEcran(s), s);
  }
  await ctx.close();
}
await b.close();
writeFileSync(`${dest}/inventaire-web.json`, JSON.stringify(inventaire, null, 1));
writeFileSync(`${dest}/soucis-web.json`, JSON.stringify(soucis, null, 1));
console.log("ECRANS", inventaire.length, "SOUCIS", JSON.stringify(soucis).slice(0, 3000));
