// KÓMBE @kombe/api — preuve base réelle des RETOURS DES MEMBRES (0041).
//
// Script de recette RÉEL (PostgreSQL 16, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
//
// Parcours : noms (une part = un nom, libellés, renommage, grille nom par nom) ;
// séance en ligne (lien https, droits du bureau, notification) ; votes libres
// ouverts par un membre, réponse changée, réponse libre, vote anonyme, aucun
// effet automatique ; amende payée puis annulée, remboursement par la
// trésorerie, réception confirmée ; export Excel réservé au bureau, jamais
// avec un jeton dans l'URL ; journal valide.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/retoursMembres.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.retoursMembres", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
  const X = await login(7, "Tiers");

  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "5000",
    cadence: { kind: "weekly", weekday: new Date(`${today}T12:00:00Z`).getUTCDay() },
    firstMeetingDate: today,
    deadlineTime: "18:00",
    meetingPlace: "Chez Awa",
    maxMembers: 12,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: false,
    guarantorRequired: false,
    payoutWitnesses: 1,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "2000", graceDays: 0 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] },
    operating: { enabled: false, perMeeting: "0" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Retours des membres ${run}`, founderDisplayName: A.name, settings });
  const gid = t.groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 10, days: 7 });
  for (const P of [B, C, D]) {
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  const members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const mid = (name) => members.find((x) => x.displayName === name).membershipId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(B.name), role: "treasurer" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  await ok(A.token, "POST", `/v1/tontines/${gid}/members/${mid(C.name)}/shares`, { shares: 2 });
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  for (const P of [A, B, C, D]) await ok(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });

  /* ── Noms : une part = un nom à part entière ─────────────────────── */
  const names = await ok(D.token, "GET", `/v1/tontines/${gid}/names`);
  const cNames = names.filter((n) => n.holders.some((h) => h.membershipId === mid(C.name)));
  check("NAMES-FIVE", names.length === 5 && names.every((n) => n.roundSeq !== null && n.contributionPerShare === "5000"), names);
  check("NAMES-DEFAULT-LABELS", cNames.length === 2 && cNames.map((n) => n.label).sort().join("|") === "Chantal · nom 1|Chantal · nom 2", cNames.map((n) => n.label));
  check("NAMES-RENAME-RIGHTS", cNames.every((n) => n.canRename === false) && names.find((n) => n.holders[0].membershipId === mid(D.name)).canRename === true, names.map((n) => [n.label, n.canRename]));
  const renamed = await ok(C.token, "PATCH", `/v1/tontines/${gid}/names/${cNames[0].shareId}`, { label: "Chantal pour sa fille" });
  check("NAMES-RENAMED", renamed.label === "Chantal pour sa fille", renamed);
  const noRename = await call(D.token, "PATCH", `/v1/tontines/${gid}/names/${cNames[1].shareId}`, { label: "Pas à moi" });
  check("NAMES-RENAME-FORBIDDEN", noRename.status === 403, noRename);
  const rounds = await ok(D.token, "GET", `/v1/tontines/${gid}/rounds`);
  check("ROUNDS-CARRY-LABEL", rounds.some((r) => r.shareLabel === "Chantal pour sa fille") && rounds.every((r) => r.shareLabel), rounds.map((r) => [r.seq, r.shareLabel]));
  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  const fund = (k) => funds.find((f) => f.kind === k).fundId;
  const cPay = await ok(C.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [cPay.movementId] });
  const grid = await ok(D.token, "GET", `/v1/tontines/${gid}/rounds/1/grid`);
  const cRow = grid.rows.find((r) => r.membershipId === mid(C.name));
  check("GRID-NAME-BY-NAME", cRow?.status === "partial" && cRow.names?.length === 2 && cRow.names.filter((n) => n.status === "paid").length === 1, cRow);

  /* ── Séance en ligne ─────────────────────────────────────────────── */
  const m1 = (await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`))[0];
  check("MEETING-DEFAULT-IN-PERSON", m1.format === "in_person" && m1.onlineUrl === null, m1);
  const memberEdit = await call(D.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "online", onlineUrl: "https://meet.example.org/abc" });
  check("MEETING-EDIT-BUREAU", memberEdit.status === 403, memberEdit.status);
  const noUrl = await call(A.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "online" });
  check("MEETING-ONLINE-NEEDS-URL", noUrl.status === 422, noUrl);
  const http = await call(A.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "online", onlineUrl: "http://meet.example.org/abc" });
  check("MEETING-HTTPS-ONLY", http.status === 422, http);
  const online = await ok(A.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "hybrid", onlineUrl: "https://meet.example.org/abc" });
  check("MEETING-HYBRID", online.format === "hybrid" && online.onlineUrl === "https://meet.example.org/abc" && online.location === "Chez Awa", online);
  const dNotes = await ok(D.token, "GET", "/v1/me/notifications");
  check("MEETING-UPDATE-NOTIFIED", dNotes.some((n) => n.kind === "meeting_updated"), dNotes.map((n) => n.kind));
  const back = await ok(A.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "in_person" });
  check("MEETING-IN-PERSON-CLEARS-URL", back.format === "in_person" && back.onlineUrl === null, back);
  await ok(A.token, "PATCH", `/v1/tontines/${gid}/meetings/${m1.meetingId}`, { format: "online", onlineUrl: "https://meet.example.org/abc" });

  /* ── Votes libres ────────────────────────────────────────────────── */
  const one = await call(D.token, "POST", `/v1/tontines/${gid}/polls`, { question: "Quel jour ?", options: ["Samedi"] });
  check("POLL-ONE-OPTION-REFUSED", one.status === 422, one);
  const poll = await ok(D.token, "POST", `/v1/tontines/${gid}/polls`, { question: "Quel jour pour la fête de fin d'année ?", options: ["Samedi", "Dimanche"], allowFreeAnswer: true });
  check("POLL-OPEN-BY-MEMBER", poll.state === "open" && poll.createdByName === D.name && poll.electorate === 4 && poll.ballotCount === 0, poll);
  await ok(C.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [0] });
  const changed = await ok(C.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [1] });
  check("POLL-CHANGE-BALLOT", changed.ballotCount === 1 && changed.counts.join(",") === "0,1" && changed.myBallot.choices[0] === 1, changed);
  const two = await call(A.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [0, 1] });
  check("POLL-SINGLE-CHOICE", two.status === 422, two);
  const bad = await call(A.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [5] });
  check("POLL-UNKNOWN-CHOICE", bad.status === 422, bad);
  const free = await ok(B.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [], freeAnswer: "Plutôt le lundi de Pâques" });
  check("POLL-FREE-ANSWER", free.freeAnswers.length === 1 && free.freeAnswers[0].name === B.name && free.voters.length === 2, free);
  const outsider = await call(X.token, "GET", `/v1/tontines/${gid}/polls`);
  check("POLL-OUTSIDER-404", outsider.status === 404, outsider.status);
  const notCreator = await call(C.token, "POST", `/v1/tontines/${gid}/polls/${poll.pollId}/close`);
  check("POLL-CLOSE-RIGHTS", notCreator.status === 403, notCreator.status);
  const closedPoll = await ok(A.token, "POST", `/v1/tontines/${gid}/polls/${poll.pollId}/close`);
  check("POLL-CLOSED-BY-PRESIDENCY", closedPoll.state === "closed" && closedPoll.closedAt !== null, closedPoll.state);
  const late = await call(A.token, "PUT", `/v1/tontines/${gid}/polls/${poll.pollId}/ballot`, { choices: [0] });
  check("POLL-CLOSED-NO-BALLOT", late.status === 409, late);
  const anon = await ok(C.token, "POST", `/v1/tontines/${gid}/polls`, { question: "Faut-il augmenter la cotisation ?", options: ["Oui", "Non", "Plus tard"], anonymous: true, multiple: true, hours: 48 });
  await ok(A.token, "PUT", `/v1/tontines/${gid}/polls/${anon.pollId}/ballot`, { choices: [0, 2] });
  const anonView = (await ok(D.token, "GET", `/v1/tontines/${gid}/polls`)).find((p) => p.pollId === anon.pollId);
  check("POLL-ANONYMOUS", anonView.voters === null && anonView.counts.join(",") === "1,0,1" && anonView.closesAt !== null && anonView.canManage === false, anonView);
  const pNotes = await ok(A.token, "GET", "/v1/me/notifications");
  check("POLL-NOTIFIED", pNotes.some((n) => n.kind === "poll_opened"), pNotes.map((n) => n.kind));
  const decisionsUntouched = await ok(A.token, "GET", `/v1/tontines/${gid}/decisions`);
  check("POLL-NO-EFFECT", decisionsUntouched.length === 0, decisionsUntouched.length);

  /* ── Amende payée puis annulée : remboursement ───────────────────── */
  const fine = await ok(A.token, "POST", `/v1/tontines/${gid}/fines`, { membershipId: mid(D.name), kind: "indiscipline", amount: "1000", reason: "Téléphone en pleine séance" });
  const pay = await ok(D.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("fines"), kind: "fine_payment", amount: "1000", channel: "cash", relatedKind: "fine", relatedId: fine.fineId });
  const pendingCancel = await call(A.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/cancel`, { reason: "Erreur de personne" });
  check("FINE-CANCEL-WAITS-PENDING-PAYMENT", pendingCancel.status === 422, pendingCancel);
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [pay.movementId] });
  const noRefund = await call(B.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/refund`, { channel: "cash" });
  check("FINE-REFUND-NOT-DUE", noRefund.status === 422, noRefund);
  const cancelled = await ok(A.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/cancel`, { reason: "Erreur de personne" });
  check("FINE-PAID-CANCELLED", cancelled.state === "cancelled" && cancelled.refundDue === true && cancelled.refundedAt === null, cancelled);
  const memberRefund = await call(C.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/refund`, { channel: "cash" });
  check("FINE-REFUND-TREASURY", memberRefund.status === 403, memberRefund.status);
  const refunded = await ok(B.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/refund`, { channel: "cash" });
  check("FINE-REFUNDED", refunded.refundDue === false && refunded.refundedAt !== null, refunded);
  const twice = await call(B.token, "POST", `/v1/tontines/${gid}/fines/${fine.fineId}/refund`, { channel: "cash" });
  check("FINE-REFUND-ONCE", twice.status === 422, twice);
  const refundMv = (await ok(D.token, "GET", `/v1/tontines/${gid}/movements?mine=1`)).find((m) => m.kind === "payout" && m.relatedId === fine.fineId);
  check("FINE-REFUND-MOVEMENT", refundMv && refundMv.amount === "1000" && refundMv.can.acknowledge === true, refundMv);
  const ack = await ok(D.token, "POST", `/v1/tontines/${gid}/movements/${refundMv.movementId}/acknowledgement`);
  check("FINE-REFUND-RECEIVED", ["confirmed", "validated"].includes(ack.state) && ack.beneficiaryConfirmedAt !== null, ack.state);
  const finesAfter = await ok(D.token, "GET", `/v1/tontines/${gid}/fines`);
  check("FINE-STAYS-CANCELLED", finesAfter.find((f) => f.fineId === fine.fineId).state === "cancelled", finesAfter);
  const dNotes2 = await ok(D.token, "GET", "/v1/me/notifications");
  check("FINE-REFUND-NOTIFIED", dNotes2.some((n) => n.kind === "fine_refunded"), dNotes2.map((n) => n.kind));

  /* ── Export Excel : bureau seulement, en-tête Bearer ─────────────── */
  const memberExport = await app.inject({ method: "GET", url: `/v1/tontines/${gid}/export.xlsx`, headers: { authorization: `Bearer ${D.token}` } });
  check("EXPORT-BUREAU-ONLY", memberExport.statusCode === 403, memberExport.statusCode);
  const anonExport = await app.inject({ method: "GET", url: `/v1/tontines/${gid}/export.xlsx?token=${A.token}` });
  check("EXPORT-NO-TOKEN-IN-URL", anonExport.statusCode === 401, anonExport.statusCode);
  const xl = await app.inject({ method: "GET", url: `/v1/tontines/${gid}/export.xlsx`, headers: { authorization: `Bearer ${A.token}` } });
  const bytes = xl.rawPayload;
  check(
    "EXPORT-XLSX",
    xl.statusCode === 200 &&
      String(xl.headers["content-type"]).startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") &&
      /attachment; filename="kombe-.+\.xlsx"/.test(String(xl.headers["content-disposition"])) &&
      bytes.subarray(0, 2).toString() === "PK" &&
      bytes.includes(Buffer.from("xl/worksheets/sheet6.xml")),
    { status: xl.statusCode, headers: xl.headers },
  );
  if (process.env.KOMBE_EXPORT_SAMPLE) (await import("node:fs")).writeFileSync(process.env.KOMBE_EXPORT_SAMPLE, bytes);

  const journal = await ok(A.token, "GET", `/v1/tontines/${gid}/journal`);
  check("JOURNAL-VALID", journal.valid === true && ["poll.opened", "fine.refunded", "meeting.updated", "share.renamed"].every((t) => journal.entries.some((e) => e.type === t)), journal.entries.map((e) => e.type));
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.retoursMembres", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
