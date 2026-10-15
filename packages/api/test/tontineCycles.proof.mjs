// KÓMBE @kombe/api — preuve base réelle : cycle complet, cycles successifs,
// réserve de fin d'année, conflits d'intérêts et repères (ADR-0040).
//
// Script de recette RÉEL (PostgreSQL 16, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
// Le schéma doit être à jour (node packages/db/scripts/migrate.mjs migrate).
// Les codes SMS viennent du simulateur de développement (`devCode`) : aucun
// SMS réel n'est envoyé.
//
// Parcours : 3 membres (présidente, trésorier UNIQUE, commissaire UNIQUE)
// font un cycle complet de 3 tours. Le trésorier bouffe en premier : la
// présidence déclare sa remise. Le commissaire bouffe ensuite : la présidence
// contrôle sa remise. Puis : repères (simulateur, « mon tour », régularité,
// résumé WhatsApp), réserve rendue à chacun, nouveau cycle aux tours 4 à 7
// avec deux parts pour le commissaire.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/tontineApi.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.tontine.cycles", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
// Le parcours enchaîne des dizaines d'appels depuis la même IP (inject).
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

async function call(token, method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
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
async function ok(token, method, path, body, expected = [200, 201, 202, 204], headers) {
  const r = await call(token, method, path, body, headers);
  if (!expected.includes(r.status)) {
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

// Numéros uniques par exécution (la base peut contenir des runs précédents).
const run = String(randomInt(100000, 999999));

async function login(i, name) {
  const p = `6${String(i)}${run.slice(0, 6)}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  if (!req.devCode) throw new Error("devCode absent (simulateur attendu en test)");
  const bad = await call(null, "POST", "/v1/auth/code-verifications", { login: p, code: req.devCode === "000000" ? "111111" : "000000" });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login, name, badStatus: bad.status };
}

try {
  const A = await login(1, "Awa Présidente");
  const B = await login(2, "Bertrand Trésorier");
  const C = await login(3, "Chantal Commissaire");
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  // Cycle commencé il y a deux semaines : les trois tours sont échus aujourd'hui.
  const start = new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
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
    yearEndReserve: { enabled: true, perMeeting: "1000" },
  };

  /* ── Simulateur avant création ───────────────────────────────────── */
  const sim = await ok(A.token, "POST", "/v1/cycle-simulations", { cadence: settings.cadence, firstMeetingDate: today, shares: 3, contributionPerShare: "5000", sidePerMeeting: "1000" });
  check("SIMULATION", sim.meetings === 3 && sim.firstMeeting === today && sim.pot === "15000" && sim.totalPerShare === "18000" && sim.spanDays === 14 && /reçoit une fois/.test(sim.summary), sim);
  const simAnon = await call(null, "POST", "/v1/cycle-simulations", { cadence: settings.cadence, firstMeetingDate: today, shares: 3, contributionPerShare: "5000" });
  check("SIMULATION-NEEDS-SESSION", simAnon.status === 401, simAnon.status);

  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Njangi du quartier ${run}`, founderDisplayName: A.name, settings });
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
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of [A, B, C]) await ok(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  const started = await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "manual", membershipOrder: [mid(B), mid(C), mid(A)] });
  check("CYCLE1", started.cycle && started.cycle.number === 1 && started.cycle.firstSeq === 1 && started.cycle.lastSeq === 3 && started.cycle.finished === false, started.cycle);
  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  const fund = (k) => funds.find((f) => f.kind === k).fundId;

  /* ── « Mon tour » au démarrage ───────────────────────────────────── */
  const fB = await ok(B.token, "GET", `/v1/tontines/${gid}/my-forecast`);
  check("FORECAST-FIRST", fB.cycle === 1 && fB.turns.length === 1 && fB.turns[0].seq === 1 && fB.turns[0].amount === "15000" && fB.turns[0].position === "group_advances_you" && fB.turns[0].gap === "10000", fB);
  const fA = await ok(A.token, "GET", `/v1/tontines/${gid}/my-forecast`);
  check("FORECAST-LAST", fA.turns[0].seq === 3 && fA.turns[0].position === "even" && fA.totalDue === "15000" && fA.totalToReceive === "15000", fA);
  const early = await call(A.token, "POST", `/v1/tontines/${gid}/cycle-renewals`, { order: "join_order" });
  check("RENEW-NOT-BEFORE-END", early.status === 409, early);
  const earlyDraw = await call(A.token, "POST", `/v1/tontines/${gid}/draws`);
  check("DRAW-NOT-DURING-CYCLE", earlyDraw.status === 409, earlyDraw);

  const meetings = await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`);
  const order = { 1: B, 2: C, 3: A };
  for (const seq of [1, 2, 3]) {
    // Chacun déclare sa cotisation et sa part de réserve.
    const mv = {};
    for (const P of [A, B, C]) {
      mv[P.name] = [];
      // Les caisses à cotisation par séance ne sont dues qu'après l'adhésion (aujourd'hui) : réserve au tour 3 seulement.
      for (const [k, amount] of seq === 3 ? [["rotation", "5000"], ["year_end_reserve", "1000"]] : [["rotation", "5000"]]) {
        mv[P.name].push((await ok(P.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund(k), kind: "contribution", amount, roundSeq: seq, channel: "cash" })).movementId);
      }
    }
    await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [...mv[A.name], ...mv[C.name]] });
    await ok(A.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: mv[B.name] });
    for (const id of [...mv[A.name], ...mv[B.name]]) await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${id}/control`);
    if (seq === 1) {
      const byAuditor = await call(C.token, "POST", `/v1/tontines/${gid}/movements/${mv[C.name][0]}/control`);
      check("AUDITOR-NOT-OWN", byAuditor.status === 403, byAuditor);
      const listA = await ok(A.token, "GET", `/v1/tontines/${gid}/movements?roundSeq=1`);
      check("SUBSTITUTE-CAN-CONTROL", listA.find((x) => x.movementId === mv[C.name][0]).can.control === true, null);
      const listB = await ok(B.token, "GET", `/v1/tontines/${gid}/movements?roundSeq=1`);
      check("TREASURER-NOT-SUBSTITUTE", listB.find((x) => x.movementId === mv[C.name][0]).can.control === false, null);
      const bySub = await ok(A.token, "POST", `/v1/tontines/${gid}/movements/${mv[C.name][0]}/control`);
      check("PRESIDENCY-CONTROLS-AUDITOR", bySub.state === "validated" && bySub.controlledByName === A.name, bySub);
      const notSubstitute = await call(A.token, "POST", `/v1/tontines/${gid}/movements/${mv[A.name][0]}/control`);
      check("SUBSTITUTE-ONLY-FOR-AUDITOR", notSubstitute.status === 403 || notSubstitute.status === 409, notSubstitute);
    } else {
      for (const id of mv[C.name]) await ok(A.token, "POST", `/v1/tontines/${gid}/movements/${id}/control`);
    }

    const ben = order[seq];
    let payout;
    if (seq === 1) {
      const self = await call(B.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [] });
      check("TREASURER-NOT-OWN-PAYOUT", self.status === 403, self);
      const auditor = await call(C.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [] });
      check("AUDITOR-CANNOT-DECLARE-PAYOUT", auditor.status === 403, auditor);
      payout = await ok(A.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [] });
      check("PRESIDENCY-DECLARES-TREASURER-PAYOUT", payout.state === "declared" && payout.amount === "15000" && payout.declaredByName === A.name, payout);
    } else {
      if (seq === 3) {
        const pres = await call(A.token, "POST", `/v1/tontines/${gid}/rounds/2/payout`, { channel: "cash", witnessMembershipIds: [] });
        check("PRESIDENCY-NOT-WHEN-TREASURER-FREE", pres.status === 403 || pres.status === 409, pres);
      }
      payout = await ok(B.token, "POST", `/v1/tontines/${gid}/rounds/${seq}/payout`, { channel: "cash", witnessMembershipIds: [] });
    }
    const ack = await ok(ben.token, "POST", `/v1/tontines/${gid}/movements/${payout.movementId}/acknowledgement`);
    if (seq === 2) {
      const own = await call(C.token, "POST", `/v1/tontines/${gid}/movements/${payout.movementId}/control`);
      check("AUDITOR-NOT-OWN-PAYOUT", own.status === 403, own);
      const sub = await ok(A.token, "POST", `/v1/tontines/${gid}/movements/${payout.movementId}/control`);
      check("PRESIDENCY-CONTROLS-AUDITOR-PAYOUT", ack.state === "confirmed" && sub.state === "validated", [ack.state, sub.state]);
    } else {
      const ctl = await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${payout.movementId}/control`);
      check(`PAYOUT${seq}-VALIDATED`, ctl.state === "validated", ctl.state);
    }
    if (seq === 1) {
      const share = await ok(C.token, "GET", `/v1/tontines/${gid}/meetings/${meetings[0].meetingId}/share-text`);
      check("WHATSAPP-SUMMARY", share.text.includes("Remise : 15 000 FCFA à Bertrand Trésorier") && share.text.includes("Il ne garde pas notre argent") && !/\+237|épargne|solde/i.test(share.text), share.text);
    }
    const closed = await ok(A.token, "POST", `/v1/tontines/${gid}/rounds/${seq}/close`);
    check(`ROUND${seq}-CLOSED`, closed.state === "closed", closed.state);
  }
  // Tours 1 et 2 versés aujourd'hui, après leur date et le délai de grâce : en retard ; tour 3 à temps.
  const reg = await ok(C.token, "GET", `/v1/tontines/${gid}/regularity`);
  check("REGULARITY", reg.length === 3 && reg.every((r) => r.dueSoFar === 3 && r.onTime === 1 && r.late === 2 && r.unpaidLate === 0 && r.onTimeRate === 33 && r.badge === "à suivre") && reg.filter((r) => r.isMe).length === 1, reg);
  const done = await ok(A.token, "GET", `/v1/tontines/${gid}`);
  check("CYCLE1-FINISHED", done.state === "closed" && done.cycle.finished === true, [done.state, done.cycle]);

  /* ── Réserve de fin d'année ──────────────────────────────────────── */
  const memberRes = await call(C.token, "POST", `/v1/tontines/${gid}/reserve-distributions`, { channel: "cash" });
  check("RESERVE-MEMBER-FORBIDDEN", memberRes.status === 403, memberRes);
  const r1 = await ok(B.token, "POST", `/v1/tontines/${gid}/reserve-distributions`, { channel: "cash" });
  check("RESERVE-BY-TREASURER", r1.available === "3000" && r1.shortfall === false && r1.movements.length === 2 && r1.movements.every((x) => x.amount === "1000" && x.relatedKind === "reserve") && r1.waiting.length === 1 && r1.waiting[0].membershipId === mid(B), r1);
  const r2 = await ok(A.token, "POST", `/v1/tontines/${gid}/reserve-distributions`, { channel: "cash" });
  check("RESERVE-TREASURER-BY-PRESIDENCY", r2.movements.length === 1 && r2.movements[0].membershipId === mid(B) && r2.movements[0].amount === "1000", r2);
  for (const [P, m] of [[A, r1.movements.find((x) => x.membershipId === mid(A))], [C, r1.movements.find((x) => x.membershipId === mid(C))], [B, r2.movements[0]]]) {
    const a = await ok(P.token, "POST", `/v1/tontines/${gid}/movements/${m.movementId}/acknowledgement`);
    check(`RESERVE-RECEIVED-${P.name.split(" ")[0]}`, a.beneficiaryConfirmedAt !== null, a);
  }
  const r3 = await ok(B.token, "POST", `/v1/tontines/${gid}/reserve-distributions`, { channel: "cash" });
  check("RESERVE-ONCE", r3.movements.length === 0, r3);
  const fundsAfter = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  check("RESERVE-EMPTY", fundsAfter.find((f) => f.kind === "year_end_reserve").confirmedBalance === "0", fundsAfter.map((f) => [f.kind, f.confirmedBalance]));

  /* ── Nouveau cycle : tours 4 à 7, deux parts pour Chantal ────────── */
  const draw2 = await call(A.token, "POST", `/v1/tontines/${gid}/draws`);
  check("DRAW-BETWEEN-CYCLES", draw2.status === 201, draw2);
  const sharesC = await call(A.token, "POST", `/v1/tontines/${gid}/members/${mid(C)}/shares`, { shares: 2 });
  check("SHARES-BETWEEN-CYCLES", sharesC.status === 200 && sharesC.body.shares === 2, sharesC);
  const memberRenew = await call(C.token, "POST", `/v1/tontines/${gid}/cycle-renewals`, { order: "join_order" });
  check("RENEW-BUREAU-ONLY", memberRenew.status === 403, memberRenew);
  const renewed = await ok(A.token, "POST", `/v1/tontines/${gid}/cycle-renewals`, { order: "draw", drawId: draw2.body.drawId });
  check("CYCLE2", renewed.state === "active" && renewed.cycle.number === 2 && renewed.cycle.firstSeq === 4 && renewed.cycle.lastSeq === 7 && renewed.cycle.finished === false, renewed.cycle);
  const rounds = await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`);
  const cyc2 = rounds.filter((r) => r.seq >= 4);
  check("CYCLE2-ROUNDS", rounds.length === 7 && cyc2.length === 4 && cyc2.every((r) => r.state === "open" && r.expectedPot === "20000") && cyc2[0].date > rounds[2].date, rounds.map((r) => [r.seq, r.date, r.state, r.beneficiaryName]));
  check("CYCLE2-CHANTAL-TWICE", cyc2.filter((r) => r.beneficiaryMembershipId === mid(C)).length === 2, cyc2.map((r) => r.beneficiaryName));
  const drawSeen = await ok(B.token, "GET", `/v1/tontines/${gid}/draws/${draw2.body.drawId}`);
  check("DRAW2-REVEALED", drawSeen.seed !== null && drawSeen.resultNames.length === 4 && drawSeen.resultNames.every((n) => [A.name, B.name, C.name].includes(n)), drawSeen);
  const fC = await ok(C.token, "GET", `/v1/tontines/${gid}/my-forecast`);
  check("FORECAST-CYCLE2", fC.cycle === 2 && fC.turns.length === 2 && fC.totalDue === "40000" && fC.totalToReceive === "40000", fC);
  const membersNow = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  check("SHARES-SHOWN", membersNow.find((x) => x.membershipId === mid(C)).shares === 2, membersNow.map((x) => [x.displayName, x.shares]));
  const sharesLocked = await call(A.token, "POST", `/v1/tontines/${gid}/members/${mid(A)}/shares`, { shares: 2 });
  check("SHARES-LOCKED-IN-CYCLE", sharesLocked.status === 409, sharesLocked);
  const journal = await ok(C.token, "GET", `/v1/tontines/${gid}/journal`);
  check("JOURNAL-VALID", journal.valid === true && journal.entries.some((e) => e.type === "cycle.renewed") && journal.entries.some((e) => e.type === "reserve.distributed"), { valid: journal.valid, types: [...new Set(journal.entries.map((e) => e.type))] });
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.tontine.cycles", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
