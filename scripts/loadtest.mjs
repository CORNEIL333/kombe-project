#!/usr/bin/env node
// KÓMBE — test de charge MESURÉ (P2). Jamais contre la production.
//
// Construit des données réalistes PAR L'API RÉELLE (groupes, membres admis,
// statuts acceptés, cycle démarré), puis mesure trois phases :
//   A. lecture  : tableau de bord d'un membre (tontines, détail, échéances,
//                 notifications, pastille, mouvements) ;
//   B. écriture : déclaration de cotisation idempotente (une par membre), puis
//                 rejeu de la même clé (doit répondre « idempotent-replay ») ;
//   C. mixte    : 90 % lecture / 10 % écriture (profil PATCH /v1/me idempotent).
// Résultat : débit, p50/p95/p99, codes HTTP, en JSON (et en tableau lisible).
//
// Usage : KOMBE_LOADTEST_URL=http://127.0.0.1:3311 node scripts/loadtest.mjs
//   KOMBE_LOADTEST_GROUPS (20) · _MEMBERS (10) · _CONCURRENCY (32) · _SECONDS (30)
// Refus : toute cible non locale, sauf KOMBE_LOADTEST_ALLOW_REMOTE=1 (pré-production
// isolée, avec l'accord écrit du propriétaire).
import { randomInt, randomUUID } from "node:crypto";

const BASE = process.env.KOMBE_LOADTEST_URL ?? "http://127.0.0.1:3311";
const host = new URL(BASE).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host) && process.env.KOMBE_LOADTEST_ALLOW_REMOTE !== "1") {
  console.error(`REFUS : cible non locale (${host}). Jamais de charge sur la production.`);
  process.exit(2);
}
const G = Number(process.env.KOMBE_LOADTEST_GROUPS ?? 20);
const M = Number(process.env.KOMBE_LOADTEST_MEMBERS ?? 10);
const CONC = Number(process.env.KOMBE_LOADTEST_CONCURRENCY ?? 32);
const SECONDS = Number(process.env.KOMBE_LOADTEST_SECONDS ?? 30);
const run = String(randomInt(100000, 999999));

async function call(token, method, path, body, headers = {}) {
  const t0 = performance.now();
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  const ms = performance.now() - t0;
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, body: json, ms, replay: r.headers.get("idempotent-replay") === "true" };
}
async function ok(token, method, path, body, headers) {
  const r = await call(token, method, path, body, headers);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}
async function pool(n, items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

let seq = 0;
async function login(name) {
  seq += 1;
  const phone = `6${String(seq).padStart(4, "0")}${run.slice(0, 4)}`;
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

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10; };
function summary(name, lat, codes, wallMs) {
  return { phase: name, requests: lat.length, rps: Math.round((lat.length / wallMs) * 1000 * 10) / 10, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: pct(lat, 100), codes };
}
async function phase(name, seconds, step) {
  const lat = [];
  const codes = {};
  const until = Date.now() + seconds * 1000;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (Date.now() < until) {
      const r = await step();
      lat.push(r.ms);
      codes[r.status] = (codes[r.status] ?? 0) + 1;
    }
  }));
  return summary(name, lat, codes, Date.now() - t0);
}

// ── Données ────────────────────────────────────────────────────────────
const t0 = Date.now();
const groups = [];
await pool(4, Array.from({ length: G }, (_, g) => g), async (g) => {
  const A = await login(`Présidente ${g}`);
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Charge ${run} ${g}`, founderDisplayName: A.name, settings: settings() });
  const gid = t.groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: M + 2, days: 7 });
  const members = [A];
  for (let i = 1; i < M; i += 1) {
    const P = await login(`Membre ${g}-${i}`);
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
    members.push(P);
  }
  // Bureau minimal : un trésorier distinct de la présidente (proposé, accepté).
  const mem = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const tres = mem.find((x) => x.displayName === members[1].name);
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: tres.membershipId, role: "treasurer" });
  await ok(members[1].token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of members) await call(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  groups.push({ gid, members, rotation: funds.find((f) => f.kind === "rotation").fundId });
});
const users = groups.flatMap((g) => g.members.map((m) => ({ ...m, g })));
const setupSeconds = Math.round((Date.now() - t0) / 100) / 10;

// ── A. Lecture ─────────────────────────────────────────────────────────
const pick = (a) => a[randomInt(0, a.length)];
const reads = [
  (u) => call(u.token, "GET", "/v1/me/tontines"),
  (u) => call(u.token, "GET", `/v1/tontines/${u.g.gid}`),
  (u) => call(u.token, "GET", `/v1/me/dues?groupId=${u.g.gid}`),
  (u) => call(u.token, "GET", "/v1/me/notifications"),
  (u) => call(u.token, "GET", "/v1/me/notifications/unread-count"),
  (u) => call(u.token, "GET", `/v1/tontines/${u.g.gid}/movements`),
];
const A = await phase("A-lecture", SECONDS, () => pick(reads)(pick(users)));

// ── B. Écriture idempotente : une déclaration par membre, puis rejeu ────
const decl = [];
const declCodes = {};
let tB = Date.now();
await pool(CONC, users, async (u) => {
  const r = await call(u.token, "POST", `/v1/tontines/${u.g.gid}/movements`, { fundId: u.g.rotation, kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" }, { "idempotency-key": `load-${run}-${u.name}` });
  decl.push(r.ms);
  declCodes[r.status] = (declCodes[r.status] ?? 0) + 1;
});
const B1 = summary("B-declaration", decl, declCodes, Date.now() - tB);
const rep = [];
const repCodes = {};
let replays = 0;
tB = Date.now();
await pool(CONC, users, async (u) => {
  const r = await call(u.token, "POST", `/v1/tontines/${u.g.gid}/movements`, { fundId: u.g.rotation, kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" }, { "idempotency-key": `load-${run}-${u.name}` });
  rep.push(r.ms);
  repCodes[r.status] = (repCodes[r.status] ?? 0) + 1;
  if (r.replay) replays += 1;
});
const B2 = { ...summary("B-rejeu-meme-cle", rep, repCodes, Date.now() - tB), replays };

// ── C. Mixte 90/10 ─────────────────────────────────────────────────────
const C = await phase("C-mixte-90-10", SECONDS, () => {
  const u = pick(users);
  if (randomInt(0, 10) === 0) return call(u.token, "PATCH", "/v1/me", { displayName: `${u.name}` }, { "idempotency-key": randomUUID() });
  return pick(reads)(u);
});

// ── D. (option) Par route, 5 s chacune : où part le temps ? ─────────────
const perRoute = [];
if (process.env.KOMBE_LOADTEST_PER_ROUTE === "1") {
  const names = ["me/tontines", "tontines/:id", "me/dues", "me/notifications", "unread-count", "tontines/:id/movements"];
  for (let i = 0; i < reads.length; i += 1) perRoute.push(await phase(`D-${names[i]}`, 5, () => reads[i](pick(users))));
}

const report = { base: BASE, groups: G, membersPerGroup: M, users: users.length, concurrency: CONC, seconds: SECONDS, setupSeconds, node: process.version, phases: [A, B1, B2, C, ...perRoute] };
console.log(JSON.stringify(report, null, 2));
console.error("\nphase              req     rps    p50    p95    p99    max   codes");
for (const p of report.phases) console.error(`${p.phase.padEnd(18)} ${String(p.requests).padStart(5)} ${String(p.rps).padStart(7)} ${String(p.p50).padStart(6)} ${String(p.p95).padStart(6)} ${String(p.p99).padStart(6)} ${String(p.max).padStart(6)}   ${JSON.stringify(p.codes)}`);
