// QA visuelle de la PWA connectée. Les réponses /v1 sont INTERCEPTÉES dans le
// navigateur de test uniquement (données d'exemple conformes à @kombe/domain) :
// rien n'est embarqué dans l'application ni envoyé à l'API réelle.
// Usage : node scripts/design/qa-pwa-v3.mjs [base=http://localhost:4400] [dossier] [largeur=390] [hauteur=844]
import { createRequire } from "node:module";
const req = createRequire(new URL("../../packages/client/package.json", import.meta.url));
const { chromium } = req("@playwright/test");
const [base = "http://localhost:4400", out = ".", w = "390", h = "844"] = process.argv.slice(2);

const J = 86400000;
const now = Date.now();
const iso = (d) => new Date(now + d * J).toISOString().slice(0, 10);
const at = (d) => new Date(now + d * J).toISOString();
const noms = ["Amina Ngué", "Paul Abega", "Serge Nkoué", "Marie Abena", "Linda Mbarga", "Chantal Abega", "Éric Kamga", "Joëlle Bilong", "Didier Fotso", "Rose Essomba", "Alain Mbida", "Grâce Onana"];
const G = "grp-etoiles";
const fines = { lateContributionFixed: "1000", lateContributionPerDay: "0", lateContributionCap: "5000", meetingLate: "500", meetingAbsence: "1000", indisciplineCap: "5000", graceDays: 2 };
const settings = {
  contributionPerShare: "25000", cadence: { kind: "monthly_day", day: 15 }, firstMeetingDate: iso(-95), deadlineTime: "18:00", meetingPlace: "Chez Amina, Bastos",
  maxMembers: 12, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance", newcomersLast: false, guarantorRequired: false, payoutWitnesses: 2,
  fines, solidarity: { enabled: true, perMeeting: "1000", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
};
const membres = noms.map((n, i) => ({
  membershipId: `m${i + 1}`, displayName: n, state: "active", roles: i === 1 ? ["treasurer"] : i === 0 ? ["animator"] : i === 6 ? ["auditor"] : [], pendingRoles: [],
  login: i === 0 ? "amina@exemple.cm" : `+237 6•• •• •• ${String(10 + i)}`, isMe: i === 0, sponsorMembershipId: null, proxyMembershipId: null, offline: i === 9,
  joinedAt: at(-300 + i * 9), shares: 1, sharePartnerMembershipId: null,
}));
const tours = noms.map((n, i) => ({
  seq: i + 1, date: iso(-95 + i * 30), state: i < 3 ? "closed" : "open", beneficiaryMembershipId: `m${((i + 3) % 12) + 1}`, beneficiaryName: noms[(i + 3) % 12],
  meetingId: `mt${i + 1}`, expectedPot: "300000", collected: i < 3 ? "300000" : i === 3 ? "225000" : "0", payoutState: i < 3 ? "received" : "none",
}));
const funds = [
  { fundId: "f1", kind: "rotation", name: "Tontine", state: "active", confirmedBalance: "225000", pendingIn: "50000", perMeeting: "25000" },
  { fundId: "f2", kind: "solidarity", name: "Caisse de secours", state: "active", confirmedBalance: "38000", pendingIn: "0", perMeeting: "1000" },
];
const detail = {
  groupId: G, name: "Les Étoiles de Yaoundé", state: "active", settings, me: { membershipId: "m1", state: "active", roles: ["animator"] }, memberCount: 12, pendingCount: 1, funds,
  currentRound: tours[3], nextMeeting: { meetingId: "mt4", seq: 4, date: iso(5), state: "planned", location: "Chez Amina, Bastos", hostName: "Amina Ngué", roundSeq: 4, minutesApproved: false },
  statutes: { version: 3, hash: "h3", acceptedByMe: true }, cycleStarted: true, cycle: { number: 1, firstSeq: 1, lastSeq: 12, finished: false }, flags: [],
};
const summary = (g, name, n, amount, nextD, due, roles = []) => ({ groupId: g, name, state: "active", membershipId: "m1", membershipState: "active", roles, memberCount: n, contributionPerShare: amount, nextMeetingDate: iso(nextD), myOpenDue: due, myPayoutDate: iso(nextD + 60) });
const fixtures = [
  ["GET", /\/v1\/me$/, { identityId: "me", login: "amina@exemple.cm", displayName: "Amina Ngué", language: "fr" }],
  ["GET", /\/v1\/me\/tontines/, [summary(G, "Les Étoiles de Yaoundé", 12, "25000", 5, "25000", ["animator"]), summary("grp-bam", "Solidarité Bamiléké", 10, "15000", 10, "0", ["treasurer"]), summary("grp-vis", "Vision Entrepreneurs", 8, "50000", 3, "0")]],
  ["GET", /\/v1\/me\/notifications/, [
    { notificationId: "n1", groupId: G, groupName: "Les Étoiles de Yaoundé", kind: "validation_waiting", target: null, createdAt: at(-0.1), read: false },
    { notificationId: "n2", groupId: G, groupName: "Les Étoiles de Yaoundé", kind: "meeting_reminder", target: null, createdAt: at(-1), read: false },
    { notificationId: "n3", groupId: "grp-bam", groupName: "Solidarité Bamiléké", kind: "payout_recorded", target: null, createdAt: at(-3), read: true },
  ]],
  ["GET", /\/v1\/me\/dues/, [{ groupId: G, fundId: "f1", fundKind: "rotation", fundName: "Tontine", roundSeq: 4, date: iso(5), due: "25000", confirmed: "0", declared: "0", remaining: "25000", lateness: "upcoming" },
    { groupId: G, fundId: "f2", fundKind: "solidarity", fundName: "Caisse de secours", roundSeq: 4, date: iso(5), due: "1000", confirmed: "0", declared: "0", remaining: "1000", lateness: "upcoming" }]],
  ["GET", /\/members/, membres],
  ["GET", /\/rounds$/, tours],
  ["GET", /\/funds/, funds],
  ["GET", /\/my-forecast/, { cycle: 1, totalDue: "300000", totalToReceive: "300000", confirmedSoFar: "75000", turns: [{ seq: 10, date: iso(185), amount: "300000", paidBeforeReceiving: "250000", position: "you_advance_group", gap: "50000", explanation: "Vous recevez au tour 10 : vous aurez versé 250 000 FCFA avant.", received: false }] }],
  ["GET", /\/regularity/, membres.map((m, i) => ({ membershipId: m.membershipId, name: m.displayName, isMe: m.isMe, dueSoFar: 3, onTime: i % 5 === 3 ? 2 : 3, late: i % 5 === 3 ? 1 : 0, unpaidLate: 0, openFines: 0, onTimeRate: i % 5 === 3 ? 0.67 : 1, badge: i % 5 === 3 ? "à suivre" : "exemplaire" }))],
  ["GET", /\/statutes/, { version: 3, title: "Statuts des Étoiles", body: "Article 1 — …", hash: "h3", publishedAt: at(-80), acceptedByMe: true, acceptedCount: 12 }],
  ["GET", /\/movements/, []],
  ["GET", /\/meetings$/, [detail.nextMeeting]],
  ["GET", /\/tontines\/[^/]+$/, detail],
  ["GET", /\/v1\/auth\/channels/, { sms: false, whatsapp: false, email: true }],
];

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
