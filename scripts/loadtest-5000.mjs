#!/usr/bin/env node
// KÓMBE — banc « N utilisateurs SIMULTANÉS » (modèle réaliste, boucle ouverte).
// Jamais contre la production : refuse toute cible non locale sauf
// KOMBE_LOADTEST_ALLOW_REMOTE=1 (pré-production isolée, accord écrit du porteur).
//
// Données construites par l'API réelle : G groupes de M membres (trésorier
// désigné, statuts acceptés, cycle démarré). Puis chaque personne virtuelle,
// connectée en même temps que les autres, se comporte comme un membre :
//   - ouverture de l'application : tontines, détail du groupe, échéances ;
//   - pastille des non-lues toutes les 60 s (comme la PWA) ;
//   - une action toutes les 30 à 90 s (notifications, mouvements, membres,
//     détail, échéances) et SA déclaration de cotisation une fois (idempotente).
// Les arrivées sont étalées sur la rampe ; mesure : débit, p50/p95/p99 par
// type de requête, codes HTTP, fenêtres de 10 s, temps d'ouverture de l'app.
//
// Usage : KOMBE_LOADTEST_URL=http://127.0.0.1:3311 node scripts/loadtest-5000.mjs
//   KOMBE_LT_GROUPS (500) · KOMBE_LT_MEMBERS (10) · KOMBE_LT_SECONDS (180)
//   KOMBE_LT_RAMP (60) · KOMBE_LT_SETUP_CONCURRENCY (24)
import { randomInt } from "node:crypto";

const BASE = process.env.KOMBE_LOADTEST_URL ?? "http://127.0.0.1:3311";
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(BASE).hostname) && process.env.KOMBE_LOADTEST_ALLOW_REMOTE !== "1") {
  console.error("REFUS : cible non locale. Jamais de charge sur la production.");
  process.exit(2);
}
const G = Number(process.env.KOMBE_LT_GROUPS ?? 500);
const M = Number(process.env.KOMBE_LT_MEMBERS ?? 10);
const SECONDS = Number(process.env.KOMBE_LT_SECONDS ?? 180);
const RAMP = Number(process.env.KOMBE_LT_RAMP ?? 60);
const SETUP_CONC = Number(process.env.KOMBE_LT_SETUP_CONCURRENCY ?? 24);
const run = String(randomInt(10, 99));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, method, path, body, headers = {}) {
  const t0 = performance.now();
  let status = 0;
  let json = null;
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    status = r.status;
    const t = await r.text();
    try { json = t ? JSON.parse(t) : null; } catch { json = t; }
  } catch {
    status = 599; // connexion refusée / coupée
  }
  return { status, json, ms: performance.now() - t0 };
}
async function ok(token, method, path, body, headers) {
  for (let essai = 0; ; essai += 1) {
    const r = await call(token, method, path, body, headers);
    if (r.status < 300) return r.json;
    if (essai < 3 && (r.status === 429 || r.status >= 500)) { await sleep(500 * (essai + 1)); continue; }
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  }
}
async function pool(n, items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

let seq = 0;
async function login(name) {
  seq += 1;
  const phone = `6${run}${String(seq).padStart(6, "0")}`;
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: phone });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, name };
}
function settings() {
  const d = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  return {
    contributionPerShare: "5000", cadence: { kind: "weekly", weekday: new Date(`${d}T12:00:00Z`).getUTCDay() }, firstMeetingDate: d, deadlineTime: "18:00",
    meetingPlace: "Akwa", maxMembers: M + 2, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance",
    newcomersLast: false, guarantorRequired: false, payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
  };
}
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
};

// ── 1. Données ─────────────────────────────────────────────────────────
const t0 = Date.now();
const groups = [];
await pool(SETUP_CONC, Array.from({ length: G }, (_, g) => g), async (g) => {
  const A = await login(`Présidente ${g}`);
  const gid = (await ok(A.token, "POST", "/v1/tontines", { name: `Charge ${run} ${g}`, founderDisplayName: A.name, settings: settings() })).groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: M + 2, days: 7 });
  const members = [A];
  for (let i = 1; i < M; i += 1) {
    const P = await login(`Membre ${g}-${i}`);
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
    members.push(P);
  }
  const mem = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mem.find((x) => x.displayName === members[1].name).membershipId, role: "treasurer" });
  await ok(members[1].token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of members) await call(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  groups.push({ gid, members, rotation: funds.find((f) => f.kind === "rotation").fundId });
  if (groups.length % 50 === 0) process.stderr.write(`  données : ${groups.length}/${G} groupes (${Math.round((Date.now() - t0) / 1000)} s)\n`);
});
const users = groups.flatMap((g) => g.members.map((m) => ({ ...m, g })));
const setupSeconds = Math.round((Date.now() - t0) / 1000);
process.stderr.write(`Données prêtes : ${users.length} personnes, ${groups.length} groupes, ${setupSeconds} s\n`);

// ── 2. Simulation : tous connectés en même temps ───────────────────────
const lat = {}; // type → latences
const codes = {};
const windows = new Map(); // fenêtre de 10 s → { n, errors, lat[] }
const open = [];
const start = Date.now();
const end = start + SECONDS * 1000;
function note(kind, r) {
  (lat[kind] ??= []).push(r.ms);
  codes[r.status] = (codes[r.status] ?? 0) + 1;
  const w = Math.floor((Date.now() - start) / 10_000);
  const slot = windows.get(w) ?? { n: 0, errors: 0, lat: [] };
  slot.n += 1;
  if (r.status >= 500 || r.status === 0 || r.status === 429) slot.errors += 1;
  slot.lat.push(r.ms);
  windows.set(w, slot);
}
const actions = [
  [25, "notifications", (u) => call(u.token, "GET", "/v1/me/notifications")],
  [20, "mouvements", (u) => call(u.token, "GET", `/v1/tontines/${u.g.gid}/movements`)],
  [20, "membres", (u) => call(u.token, "GET", `/v1/tontines/${u.g.gid}/members`)],
  [15, "detail-groupe", (u) => call(u.token, "GET", `/v1/tontines/${u.g.gid}`)],
  [20, "echeances", (u) => call(u.token, "GET", `/v1/me/dues?groupId=${u.g.gid}`)],
];
const totalW = actions.reduce((s, a) => s + a[0], 0);
const pickAction = () => { let x = randomInt(0, totalW); for (const a of actions) { if ((x -= a[0]) < 0) return a; } return actions[0]; };

async function personne(u) {
  await sleep(randomInt(0, RAMP * 1000));
  if (Date.now() >= end) return;
  // Ouverture de l'application (séquentiel, comme l'écran d'accueil)
  const o0 = performance.now();
  note("ouverture:tontines", await call(u.token, "GET", "/v1/me/tontines"));
  note("ouverture:detail", await call(u.token, "GET", `/v1/tontines/${u.g.gid}`));
  note("ouverture:echeances", await call(u.token, "GET", `/v1/me/dues?groupId=${u.g.gid}`));
  open.push(performance.now() - o0);
  let nextBadge = Date.now() + randomInt(0, 60_000);
  let nextAction = Date.now() + randomInt(30_000, 90_000);
  let declared = false;
  const declareAt = Date.now() + randomInt(5_000, Math.max(6_000, SECONDS * 1000 - (Date.now() - start) - 5_000));
  while (Date.now() < end) {
    const now = Date.now();
    if (!declared && now >= declareAt) {
      declared = true;
      note("declaration", await call(u.token, "POST", `/v1/tontines/${u.g.gid}/movements`, { fundId: u.g.rotation, kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" }, { "idempotency-key": `lt5000-${run}-${u.name}` }));
    } else if (now >= nextBadge) {
      note("pastille", await call(u.token, "GET", "/v1/me/notifications/unread-count"));
      nextBadge = now + 60_000;
    } else if (now >= nextAction) {
      const [, kind, fn] = pickAction();
      note(kind, await fn(u));
      nextAction = now + randomInt(30_000, 90_000);
    } else {
      await sleep(Math.max(50, Math.min(nextBadge, nextAction, declared ? Infinity : declareAt) - now));
    }
  }
}
process.stderr.write(`Simulation : ${users.length} personnes simultanées, rampe ${RAMP} s, durée ${SECONDS} s…\n`);
await Promise.all(users.map(personne));

const all = Object.values(lat).flat();
const total = all.length;
const steady = [...windows.entries()].filter(([w]) => w * 10 >= RAMP).map(([, v]) => v);
const report = {
  base: BASE, users: users.length, groups: groups.length, seconds: SECONDS, ramp: RAMP, setupSeconds, node: process.version,
  requests: total, rpsMoyen: Math.round((total / SECONDS) * 10) / 10,
  rpsPalier: steady.length ? Math.round((steady.reduce((s, v) => s + v.n, 0) / (steady.length * 10)) * 10) / 10 : null,
  global: { p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), max: pct(all, 100) },
  erreurs: Object.entries(codes).filter(([c]) => Number(c) >= 500 || c === "429" || c === "0").reduce((s, [, n]) => s + n, 0),
  codes,
  ouvertureApp: { n: open.length, p50: pct(open, 50), p95: pct(open, 95), p99: pct(open, 99) },
  parType: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: pct(v, 50), p95: pct(v, 95), p99: pct(v, 99) }])),
  fenetres: [...windows.entries()].sort((a, b) => a[0] - b[0]).map(([w, v]) => ({ t: w * 10, rps: Math.round(v.n / 10), p95: pct(v.lat, 95), erreurs: v.errors })),
};
console.log(JSON.stringify(report, null, 2));
console.error(`\n${report.users} personnes simultanées · ${report.requests} requêtes · ${report.rpsMoyen} req/s moyen, ${report.rpsPalier} req/s en palier · erreurs ${report.erreurs}`);
console.error(`global p50 ${report.global.p50} ms · p95 ${report.global.p95} · p99 ${report.global.p99} · max ${report.global.max} · ouverture de l'app p95 ${report.ouvertureApp.p95} ms`);
for (const [k, v] of Object.entries(report.parType)) console.error(`  ${k.padEnd(22)} n=${String(v.n).padStart(6)}  p50 ${String(v.p50).padStart(5)}  p95 ${String(v.p95).padStart(5)}  p99 ${String(v.p99).padStart(5)}`);
