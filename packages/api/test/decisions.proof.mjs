// KÓMBE @kombe/api — preuve base réelle des DÉCISIONS VOTÉES (ADR-0038).
//
// Script de recette RÉEL (PostgreSQL 16, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
// Le schéma doit être à jour (node packages/db/scripts/migrate.mjs migrate).
// Les codes SMS viennent du simulateur de développement (`devCode`) : aucun
// SMS réel n'est envoyé.
//
// Parcours : 6 membres dont deux partagent une part (« demi-main ») ; tour 1
// remis et clos ; pause votée (dates décalées) ; suspension du droit de
// bouffer votée puis levée ; destitution du trésorier ; exclusion d'un
// membre qui a déjà bouffé (dette suivie) et d'un membre qui n'a pas bouffé
// (place vacante, remise bloquée) ; reprise de place votée ; vote secret,
// bulletin unique, personne visée hors électorat, tiers 404, journal valide.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/decisions.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.decisions", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
  const C = await login(3, "Chantal");
  const D = await login(4, "Daniel");
  const E = await login(5, "Esther");
  const F = await login(6, "Fabrice");
  const X = await login(7, "Tiers");

  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "5000",
    cadence: { kind: "weekly", weekday: new Date(`${today}T12:00:00Z`).getUTCDay() },
    firstMeetingDate: today,
    deadlineTime: "18:00",
    meetingPlace: "Salle paroissiale, Bépanda",
    maxMembers: 12,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: false,
    guarantorRequired: false,
    payoutWitnesses: 1,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] },
    operating: { enabled: false, perMeeting: "0" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Njangi des Décisions ${run}`, founderDisplayName: A.name, settings });
  const gid = t.groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 10, days: 7 });
  for (const P of [B, C, D, E, F]) {
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  let members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const mid = (name) => members.find((x) => x.displayName === name).membershipId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(B.name), role: "treasurer" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });

  /* ── Part partagée D + F ─────────────────────────────────────────── */
  const shared = await ok(A.token, "POST", `/v1/tontines/${gid}/members/${mid(D.name)}/shares`, { shares: 1, sharedWith: mid(F.name) });
  check("SHARE-SHARED", shared.sharePartnerMembershipId === mid(F.name), shared);
  const selfShare = await call(A.token, "POST", `/v1/tontines/${gid}/members/${mid(D.name)}/shares`, { shares: 1, sharedWith: mid(D.name) });
  check("SHARE-NOT-SELF", selfShare.status === 422, selfShare);

  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of [A, B, C, D, E, F]) await ok(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  const order = [mid(C.name), mid(E.name), mid(D.name), mid(A.name), mid(B.name)];
  await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "manual", membershipOrder: order });
  const rounds0 = await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`);
  check("SHARED-ROUNDS", rounds0.length === 5 && rounds0[0].expectedPot === "25000", rounds0.map((r) => [r.seq, r.beneficiaryName, r.expectedPot]));
  const duesD = (await ok(D.token, "GET", `/v1/me/dues?groupId=${gid}`)).filter((d) => d.roundSeq === 1);
  const duesF = (await ok(F.token, "GET", `/v1/me/dues?groupId=${gid}`)).filter((d) => d.roundSeq === 1);
  check("SHARED-HALF-DUES", duesD[0]?.due === "2500" && duesF[0]?.due === "2500", [duesD, duesF]);

  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  const rot = funds.find((f) => f.kind === "rotation").fundId;

  /* ── Tour 1 : C bouffe, tour clos ────────────────────────────────── */
  const m1 = (await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`))[0].meetingId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m1}/open`);
  await ok(A.token, "PUT", `/v1/tontines/${gid}/meetings/${m1}/attendance`, {
    entries: [A, B, C, D, E, F].map((P) => ({ membershipId: mid(P.name), status: "present" })),
  });
  const mv = {};
  for (const P of [A, B, C, D, E, F]) {
    const amount = P === D || P === F ? "2500" : "5000";
    mv[P.name] = (await ok(P.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: rot, kind: "contribution", amount, roundSeq: 1, channel: "cash" })).movementId;
  }
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [A, C, D, E, F].map((P) => mv[P.name]) });
  await ok(A.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [mv[B.name]] });
  const p1 = await ok(B.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [mid(A.name)] });
  check("PAYOUT-1", p1.amount === "25000", p1.amount);
  await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${p1.movementId}/acknowledgement`);
  await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m1}/close`, {});
  await ok(A.token, "POST", `/v1/tontines/${gid}/rounds/1/close`);

  const vote = (P, d, choice) => call(P.token, "POST", `/v1/tontines/${gid}/decisions/${d}/ballots`, { choice });

  /* ── Pause votée ─────────────────────────────────────────────────── */
  const before = await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`);
  const memberPause = await call(D.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "pause", reason: "Fêtes de fin d'année", occurrences: 1 });
  check("PAUSE-NEEDS-BUREAU", memberPause.status === 403, memberPause.status);
  const pause = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "pause", reason: "Fêtes de fin d'année", occurrences: 1 });
  check("PAUSE-OPEN", pause.state === "open" && pause.electorate === 6 && pause.params.fromSeq === 2, pause);
  for (const P of [A, B]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${pause.decisionId}/ballots`, { choice: "yes" });
  const twice = await vote(A, pause.decisionId, "no");
  check("BALLOT-ONCE", twice.status === 409, twice);
  const secret = (await ok(C.token, "GET", `/v1/tontines/${gid}/decisions`)).find((d) => d.decisionId === pause.decisionId);
  check("BALLOT-SECRET", secret.result === null && secret.ballots === 2 && secret.myChoice === null && secret.can.vote === true, secret);
  const early = await call(C.token, "POST", `/v1/tontines/${gid}/decisions/${pause.decisionId}/close`);
  check("CLOSE-NOT-YET", early.status === 409, early);
  await ok(D.token, "POST", `/v1/tontines/${gid}/decisions/${pause.decisionId}/ballots`, { choice: "yes" });
  const adoptedPause = await ok(F.token, "POST", `/v1/tontines/${gid}/decisions/${pause.decisionId}/ballots`, { choice: "yes" });
  check("PAUSE-ADOPTED", adoptedPause.state === "adopted" && adoptedPause.result?.yes === 4, adoptedPause);
  const after = await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`);
  const plus7 = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  check(
    "PAUSE-SHIFTED",
    after[0].date === before[0].date && after.slice(1).every((r, i) => r.date === plus7(before[i + 1].date)),
    [before.map((r) => r.date), after.map((r) => r.date)],
  );
  const meetingsAfter = await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`);
  check("PAUSE-MEETINGS", meetingsAfter[1].date === after[1].date, meetingsAfter.map((x) => x.date));

  /* ── Suspension du droit de bouffer (E, tour 2) ─────────────────── */
  const susp = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "payout_suspension", targetMembershipId: mid(E.name), reason: "Trois retards non régularisés" });
  check("SUSP-ELECTORATE", susp.electorate === 5, susp.electorate);
  const targetVote = await vote(E, susp.decisionId, "no");
  check("TARGET-CANNOT-VOTE", targetVote.status === 403, targetVote);
  for (const P of [A, B]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${susp.decisionId}/ballots`, { choice: "yes" });
  const suspAdopted = await ok(C.token, "POST", `/v1/tontines/${gid}/decisions/${susp.decisionId}/ballots`, { choice: "yes" });
  check("SUSP-ADOPTED", suspAdopted.state === "adopted", suspAdopted);
  const blocked = await call(B.token, "POST", `/v1/tontines/${gid}/rounds/2/payout`, { channel: "cash", witnessMembershipIds: [mid(A.name)] });
  check("PAYOUT-SUSPENDED", blocked.status === 409 && blocked.body?.code === "PAYOUT_SUSPENDED", blocked);
  const sanctions = await ok(A.token, "GET", `/v1/tontines/${gid}/sanctions`);
  check("SANCTIONS-VIEW", sanctions.length === 6 && sanctions.find((s) => s.membershipId === mid(E.name)).payoutSuspended === true, sanctions);
  const mySanction = await ok(D.token, "GET", `/v1/tontines/${gid}/sanctions`);
  check("SANCTIONS-SELF-ONLY", mySanction.length === 1 && mySanction[0].membershipId === mid(D.name), mySanction.length);
  const lifted = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions/${susp.decisionId}/lift`, { reason: "Retards régularisés" });
  check("SUSP-LIFTED", lifted.state === "lifted", lifted.state);

  /* ── Destitution du trésorier (ouverte par un simple membre) ─────── */
  const removal = await ok(D.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "removal", targetMembershipId: mid(B.name), targetRole: "treasurer", reason: "Cahier de caisse non présenté" });
  check("REMOVAL-72H", Date.parse(removal.closesAt) - Date.parse(removal.openedAt) >= 72 * 3_600_000, removal);
  for (const P of [A, C, D]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${removal.decisionId}/ballots`, { choice: "yes" });
  const still = (await ok(A.token, "GET", `/v1/tontines/${gid}/decisions`)).find((d) => d.decisionId === removal.decisionId);
  check("REMOVAL-WAITS-WINDOW", still.state === "open", still.state);
  await ok(E.token, "POST", `/v1/tontines/${gid}/decisions/${removal.decisionId}/ballots`, { choice: "no" });
  const removed = await ok(F.token, "POST", `/v1/tontines/${gid}/decisions/${removal.decisionId}/ballots`, { choice: "yes" });
  check("REMOVAL-ADOPTED", removed.state === "adopted" && removed.result?.yes === 4 && removed.result?.no === 1, removed);
  members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  check("TREASURER-REMOVED", !members.find((x) => x.membershipId === mid(B.name)).roles.includes("treasurer"), members.map((x) => [x.displayName, x.roles]));

  /* ── Exclusion de C (a déjà bouffé) : dette suivie ───────────────── */
  const exC = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "exclusion", targetMembershipId: mid(C.name), reason: "Ne cotise plus après avoir bouffé" });
  for (const P of [A, B, D, E, F]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${exC.decisionId}/ballots`, { choice: "yes" });
  const exCDone = (await ok(A.token, "GET", `/v1/tontines/${gid}/decisions`)).find((d) => d.decisionId === exC.decisionId);
  check("EXCLUSION-ADOPTED", exCDone.state === "adopted" && /dette/.test(exCDone.outcomeNote ?? ""), exCDone);
  const debts = await ok(A.token, "GET", `/v1/tontines/${gid}/debts`);
  const debtC = debts.find((d) => d.debtorMembershipId === mid(C.name) && d.origin === "catch_up");
  check("EXCLUSION-DEBT", debtC && debtC.amount === "20000", debts);
  const cGone = await call(C.token, "GET", `/v1/tontines/${gid}`);
  check("EXCLUDED-NO-ACCESS", cGone.status === 404, cGone.status);
  const r2 = (await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`))[1];
  check("POT-WITHOUT-EXCLUDED", r2.expectedPot === "20000", r2);

  /* ── Exclusion de E (n'a pas bouffé) : place vacante ─────────────── */
  const exE = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "exclusion", targetMembershipId: mid(E.name), reason: "Abandon de la tontine" });
  check("EXCLUSION-ELECTORATE", exE.electorate === 4, exE.electorate);
  for (const P of [A, B, D, F]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${exE.decisionId}/ballots`, { choice: "yes" });
  // Le bureau nomme un nouveau trésorier après la destitution.
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(D.name), role: "treasurer" });
  await ok(D.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  const vacant = await call(D.token, "POST", `/v1/tontines/${gid}/rounds/2/payout`, { channel: "cash", witnessMembershipIds: [mid(A.name)] });
  check("VACANT-PAYOUT-BLOCKED", vacant.status === 409 && vacant.body?.code === "DECISION_STATE_INVALID", vacant);

  /* ── Reprise de place : A reprend la place de E ──────────────────── */
  const rep = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "replacement", targetMembershipId: mid(E.name), incomingMembershipId: mid(A.name), reason: "Awa reprend la place d'Esther" });
  check("REPLACEMENT-OPEN", rep.params.incomingName === A.name && rep.electorate === 4, rep);
  for (const P of [A, B, D]) await ok(P.token, "POST", `/v1/tontines/${gid}/decisions/${rep.decisionId}/ballots`, { choice: "yes" });
  const repDone = (await ok(A.token, "GET", `/v1/tontines/${gid}/decisions`)).find((d) => d.decisionId === rep.decisionId);
  check("REPLACEMENT-ADOPTED", repDone.state === "adopted" && /Rachat de place/.test(repDone.outcomeNote ?? ""), repDone);
  const r2b = (await ok(A.token, "GET", `/v1/tontines/${gid}/rounds`))[1];
  check("REPLACEMENT-BENEFICIARY", r2b.beneficiaryMembershipId === mid(A.name) && r2b.expectedPot === "20000", r2b);
  const duesA = (await ok(A.token, "GET", `/v1/me/dues?groupId=${gid}`)).filter((d) => d.roundSeq === 2 && d.fundKind === "rotation");
  check("REPLACEMENT-DUES", duesA[0]?.due === "10000", duesA);

  /* ── Accès, idempotence, journal ─────────────────────────────────── */
  const outsider = await call(X.token, "GET", `/v1/tontines/${gid}/decisions`);
  check("OUTSIDER-404", outsider.status === 404, outsider.status);
  const key = { "idempotency-key": `dec-${run}-0001` };
  const o1 = await call(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "pause", reason: "Deuil d'un membre", occurrences: 2 }, key);
  const o2 = await call(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "pause", reason: "Deuil d'un membre", occurrences: 2 }, key);
  check("DECISION-IDEMPOTENT", o1.status === 201 && o2.status === 201 && o1.body.decisionId === o2.body.decisionId, [o1.status, o2.status]);
  const dup = await call(A.token, "POST", `/v1/tontines/${gid}/decisions`, { kind: "pause", reason: "Autre pause", occurrences: 1 });
  check("ONE-OPEN-PER-OBJECT", dup.status === 409, dup.status);
  const cancelled = await ok(A.token, "POST", `/v1/tontines/${gid}/decisions/${o1.body.decisionId}/cancel`, { reason: "Ouvert par erreur" });
  check("DECISION-CANCELLED", cancelled.state === "cancelled", cancelled.state);
  const journal = await ok(A.token, "GET", `/v1/tontines/${gid}/journal`);
  check("JOURNAL-VALID", journal.valid === true && journal.entries.some((e) => e.type === "decision.adopted"), journal.valid);
  check("JOURNAL-NO-CHOICE", !JSON.stringify(journal).includes('"choice"'), null);
  const notes = await ok(F.token, "GET", "/v1/me/notifications");
  check("DECISION-NOTIFIED", notes.some((n) => n.kind === "decision"), notes.map((n) => n.kind));
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.decisions", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
