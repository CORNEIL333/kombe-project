// KÓMBE @kombe/api — preuve base réelle : caisses et cotisations propres à
// chaque tontine (retours terrain du 2026-10-17).
//
// Script de recette RÉEL (PostgreSQL, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
// Le schéma doit être à jour (0033_custom_funds).
//
// Parcours : la présidente crée trois caisses (cotisation par séance,
// cotisation unique, caisse libre) ; les membres voient leurs échéances,
// versent, puis le bureau change un montant pour l'avenir et clôt une caisse.
// Vérifie : bureau seul, jamais de rétroactivité, montants dus exacts,
// caisse libre sans échéance, clôture sans effacer ce qui était dû.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/customFunds.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.tontine.customFunds", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}

const url = process.env.KOMBE_API_DATABASE_URL;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let buildApp, createApiPool, NullEmailSender;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
} catch (err) {
  blocked(`Build manquant (pnpm --filter @kombe/api build requis) : ${String(err?.message ?? err)}`);
}

process.env.NODE_ENV = "test";
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url });
const app = buildApp({ pool, emailSender: new NullEmailSender() });
await app.ready();

const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = cond ? "OK" : detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

async function call(token, method, path, body) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await app.inject({ method, url: path, headers, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json };
}
async function ok(token, method, path, body, expected = [200, 201, 202, 204]) {
  const r = await call(token, method, path, body);
  if (!expected.includes(r.status)) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

const run = String(randomInt(100000, 999999));

async function login(i, name) {
  const p = `6${String(i)}${run.slice(0, 6)}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  if (!req.devCode) throw new Error("devCode absent (simulateur attendu en test)");
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login, name };
}

try {
  const A = await login(1, "Awa Présidente");
  const B = await login(2, "Bertrand Trésorier");
  const C = await login(3, "Chantal Commissaire");
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  const later = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "5000",
    cadence: { kind: "weekly", weekday },
    firstMeetingDate: start,
    deadlineTime: "23:59",
    meetingPlace: "Chez Awa, Bonamoussadi",
    maxMembers: 10,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: false,
    guarantorRequired: false,
    payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 2 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] },
    operating: { enabled: false, perMeeting: "0" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Njangi des caisses ${run}`, founderDisplayName: A.name, settings });
  const gid = t.groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 5, days: 7 });
  for (const P of [B, C]) {
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  const members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const mid = (P) => members.find((x) => x.displayName === P.name).membershipId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(B), role: "treasurer" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(C), role: "auditor" });
  await ok(C.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "auditor" });

  /* ── Création : bureau seul, jamais rétroactive ──────────────────── */
  const byAuditor = await call(C.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Caisse pirate", mode: "free" });
  check("CREATE-BUREAU-ONLY", byAuditor.status === 403, byAuditor);
  const retro = await call(A.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Projet", mode: "each_meeting", amount: "1000", from: start });
  check("CREATE-NOT-RETROACTIVE", retro.status === 422, retro);
  const noAmount = await call(A.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Projet", mode: "one_time" });
  check("CREATE-NEEDS-AMOUNT", noAmount.status === 422, noAmount);
  const f1 = await ok(A.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Fête de fin d'année", mode: "each_meeting", amount: "2000", purpose: "Repas et cadeaux de décembre", target: "60000" });
  const fete = f1.find((f) => f.name === "Fête de fin d'année");
  check("CREATED-EACH", fete && fete.kind === "custom" && fete.state === "active" && fete.perMeeting === "2000" && fete.custom.mode === "each_meeting" && fete.custom.currentAmount === "2000" && fete.custom.target === "60000" && fete.custom.purpose === "Repas et cadeaux de décembre", fete);
  const dup = await call(B.token, "POST", `/v1/tontines/${gid}/funds`, { name: "fête de fin d'année", mode: "free" });
  check("CREATE-NO-DUPLICATE-NAME", dup.status === 422, dup);
  const f2 = await ok(B.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Achat groupé de riz", mode: "one_time", amount: "10000" });
  const riz = f2.find((f) => f.name === "Achat groupé de riz");
  check("CREATED-ONCE-BY-TREASURER", riz && riz.custom.mode === "one_time" && riz.perMeeting === "0" && riz.custom.currentAmount === "10000", riz);
  const f3 = await ok(A.token, "POST", `/v1/tontines/${gid}/funds`, { name: "Urgences", mode: "free", purpose: "Coups durs des membres" });
  const urg = f3.find((f) => f.name === "Urgences");
  check("CREATED-FREE", urg && urg.custom.mode === "free" && urg.custom.schedule.length === 0 && urg.custom.currentAmount === "0", urg);
  const seen = await ok(C.token, "GET", `/v1/tontines/${gid}/funds`);
  check("MEMBERS-SEE-FUNDS", ["Fête de fin d'année", "Achat groupé de riz", "Urgences"].every((n) => seen.some((f) => f.name === n && f.custom)), seen.map((f) => f.name));

  /* ── Démarrage et échéances ──────────────────────────────────────── */
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of [A, B, C]) await ok(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "manual", membershipOrder: [mid(B), mid(C), mid(A)] });
  const duesB = await ok(B.token, "GET", `/v1/me/dues?groupId=${gid}`);
  const dueOf = (list, fid) => list.filter((d) => d.fundId === fid);
  // Membres admis aujourd'hui, caisses créées aujourd'hui : seule la séance du jour (tour 3) compte.
  check("DUE-EACH-ONLY-FROM-TODAY", dueOf(duesB, fete.fundId).length === 1 && dueOf(duesB, fete.fundId)[0].roundSeq === 3 && dueOf(duesB, fete.fundId)[0].due === "2000", dueOf(duesB, fete.fundId));
  check("DUE-ONCE", dueOf(duesB, riz.fundId).length === 1 && dueOf(duesB, riz.fundId)[0].due === "10000", dueOf(duesB, riz.fundId));
  check("DUE-FREE-NONE", dueOf(duesB, urg.fundId).length === 0, dueOf(duesB, urg.fundId));

  /* ── Versements ──────────────────────────────────────────────────── */
  const pay = await ok(B.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fete.fundId, kind: "contribution", amount: "2000", channel: "cash" });
  check("PAY-EACH", pay.state === "declared" && pay.roundSeq === 3 && pay.amount === "2000", pay);
  const over = await call(B.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fete.fundId, kind: "contribution", amount: "500", channel: "cash" });
  check("PAY-NO-OVERPAY", over.status === 409, over);
  const gift = await ok(C.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: urg.fundId, kind: "contribution", amount: "3500", channel: "cash" });
  check("PAY-FREE-ANY-AMOUNT", gift.state === "declared" && gift.amount === "3500", gift);
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [gift.movementId] });
  await ok(A.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [pay.movementId] });
  const afterPay = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  check("BALANCES", afterPay.find((f) => f.fundId === fete.fundId).confirmedBalance === "2000" && afterPay.find((f) => f.fundId === urg.fundId).confirmedBalance === "3500", afterPay.map((f) => [f.name, f.confirmedBalance]));

  /* ── Modifications : l'avenir seulement ──────────────────────────── */
  const pastAmount = await call(A.token, "PATCH", `/v1/tontines/${gid}/funds/${fete.fundId}`, { amount: "3000", from: start });
  check("UPDATE-NOT-RETROACTIVE", pastAmount.status === 422, pastAmount);
  const byMember = await call(C.token, "PATCH", `/v1/tontines/${gid}/funds/${fete.fundId}`, { amount: "3000", from: later });
  check("UPDATE-BUREAU-ONLY", byMember.status === 403, byMember);
  const rotation = afterPay.find((f) => f.kind === "rotation");
  const rotPatch = await call(A.token, "PATCH", `/v1/tontines/${gid}/funds/${rotation.fundId}`, { name: "Autre" });
  check("UPDATE-RULEBOOK-FUNDS-LOCKED", rotPatch.status === 422, rotPatch);
  const up = await ok(A.token, "PATCH", `/v1/tontines/${gid}/funds/${fete.fundId}`, { amount: "3000", from: later, purpose: "Repas, cadeaux et musique" });
  const fete2 = up.find((f) => f.fundId === fete.fundId);
  check("UPDATE-FUTURE", fete2.custom.schedule.length === 2 && fete2.custom.currentAmount === "2000" && fete2.custom.schedule[1].amount === "3000" && fete2.custom.purpose === "Repas, cadeaux et musique", fete2.custom);
  const duesC = await ok(C.token, "GET", `/v1/me/dues?groupId=${gid}`);
  check("DUE-UNCHANGED-AFTER-UPDATE", dueOf(duesC, fete.fundId).length === 1 && dueOf(duesC, fete.fundId)[0].due === "2000", dueOf(duesC, fete.fundId));

  /* ── Clôture : ce qui était dû le reste ──────────────────────────── */
  const closed = await ok(A.token, "PATCH", `/v1/tontines/${gid}/funds/${fete.fundId}`, { close: true });
  const fete3 = closed.find((f) => f.fundId === fete.fundId);
  check("CLOSED", fete3.state === "closed" && fete3.custom.closedOn === today, fete3);
  const duesC2 = await ok(C.token, "GET", `/v1/me/dues?groupId=${gid}`);
  check("CLOSED-KEEPS-DUE", dueOf(duesC2, fete.fundId).length === 1 && dueOf(duesC2, fete.fundId)[0].remaining === "2000", dueOf(duesC2, fete.fundId));
  const late = await ok(C.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fete.fundId, kind: "contribution", amount: "2000", channel: "cash" });
  check("CLOSED-ACCEPTS-WHAT-WAS-DUE", late.state === "declared" && late.roundSeq === 3, late);
  const reclose = await call(A.token, "PATCH", `/v1/tontines/${gid}/funds/${fete.fundId}`, { close: true });
  check("CLOSED-FINAL", reclose.status === 422, reclose);

  const journal = await ok(C.token, "GET", `/v1/tontines/${gid}/journal`);
  const types = new Set(journal.entries.map((e) => e.type));
  check("JOURNAL", journal.valid === true && types.has("fund.created") && types.has("fund.updated") && types.has("fund.closed"), { valid: journal.valid, types: [...types] });
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.tontine.customFunds", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
