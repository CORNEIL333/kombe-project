// KÓMBE @kombe/api — preuve base réelle des échéances (ADR-0042).
//
// Statuts publiés avec une échéance ; relances de plus en plus rapprochées
// (j7 → j3 → j2 → j1 → h6) aux seuls retardataires ; à l'échéance, les
// retardataires sont exclus (avant démarrage du cycle), la présidence jamais,
// le bureau est prévenu ; le cycle démarre ensuite sans eux. Variante « keep » :
// signalement sans exclusion. Prolongation et relance manuelle. Notifications
// précises (type, détail) ; tâche planifiée protégée par CRON_SECRET.
// Horloge injectée (aucune attente réelle). Sans KOMBE_API_DATABASE_URL : BLOCKED.
//
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
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
process.env.CRON_SECRET = "secret-de-preuve";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url });
const H = 3_600_000;
const D = 24 * H;
let clock = Date.now();
const app = buildApp({ pool, emailSender: new NullEmailSender(), now: () => clock });
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
  if (!expected.includes(r.status)) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const run = String(randomInt(100000, 999999));
async function login(i, name) {
  const p = `6${String(i)}${run.slice(0, 6)}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, name };
}
const notifs = async (P) => ok(P.token, "GET", "/v1/me/notifications");
const ofKind = (list, kind, gid) => list.filter((n) => n.kind === kind && n.groupId === gid);

function settingsFor(dateIso) {
  return {
    contributionPerShare: "5000",
    cadence: { kind: "weekly", weekday: new Date(`${dateIso}T12:00:00Z`).getUTCDay() },
    firstMeetingDate: dateIso,
    deadlineTime: "18:00",
    meetingPlace: "Bépanda",
    maxMembers: 12,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: false,
    guarantorRequired: false,
    payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] },
    operating: { enabled: false, perMeeting: "0" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
}

async function groupe(nom, membres, A) {
  const date = new Date(clock + 30 * D).toISOString().slice(0, 10);
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `${nom} ${run}`, founderDisplayName: A.name, settings: settingsFor(date) });
  const gid = t.groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 10, days: 7 });
  for (const P of membres) {
    const j = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
    await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  return gid;
}

try {
  const A = await login(1, "Awa Présidente");
  const B = await login(2, "Bertrand Trésorier");
  const C = await login(3, "Chantal Retard");
  const E = await login(4, "Esther Ponctuelle");

  /* ── 1. Échéance à 10 jours, conséquence : exclusion ─────────────── */
  const gid = await groupe("Njangi Échéance", [B, C, E], A);
  let members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const mid = (name) => members.find((x) => x.displayName === name).membershipId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(B.name), role: "treasurer" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });

  const badDays = await call(A.token, "POST", `/v1/tontines/${gid}/statutes`, { acceptanceDays: 0 });
  check("DEADLINE-BOUNDS", badDays.status === 422, badDays);
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`, { acceptanceDays: 10, onExpiry: "exclude" });
  check("PUBLISH-DEADLINE", st.deadline && st.deadline.acceptanceDays === 10 && st.deadline.onExpiry === "exclude", st.deadline);
  check("PUBLISHER-ACCEPTED", st.acceptedByMe === true && st.acceptedCount === 1 && st.expectedCount === 4, st);
  check("PENDING-LIST", st.pending.length === 3 && st.pending.every((p) => p.deadlineAt === st.deadline.deadlineAt), st.pending);
  const nB = ofKind(await notifs(B), "statutes_published", gid);
  check("NOTIF-PUBLISHED", nB.length === 1 && nB[0].target === `/tontines/${gid}/statuts` && nB[0].params.deadlineAt === st.deadline.deadlineAt && nB[0].params.groupName.startsWith("Njangi Échéance"), nB);
  check("NO-DUPLICATE-AT-PUBLISH", ofKind(await notifs(B), "statutes_reminder", gid).length === 0, "rappel doublon à la publication");
  check("NOTIF-NOT-TO-PUBLISHER", ofKind(await notifs(A), "statutes_published", gid).length === 0, "publisher notified");

  // B et E acceptent ; C traîne.
  await ok(B.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await ok(E.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  const start1 = await call(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
  check("START-BLOCKED-NAMES", start1.status === 403 && /Chantal Retard/.test(start1.body.message) && /Échéance/.test(start1.body.message), start1);

  // Relances accentuées : rien à J-10, j7, j3, j2, j1, h6 ; une seule par palier.
  const deadlineMs = Date.parse(st.deadline.deadlineAt);
  const stages = [];
  for (const before of [9.5 * D, 6 * D, 6 * D - H, 3 * D - H, 2 * D - H, D - H, 5 * H]) {
    clock = deadlineMs - before;
    await notifs(C);
    stages.push(ofKind(await notifs(C), "statutes_reminder", gid).map((n) => n.params.stage).sort().join(","));
  }
  check("REMINDERS-ESCALATE", stages.join(" | ") === " | j7 | j7 | j3,j7 | j2,j3,j7 | j1,j2,j3,j7 | h6,j1,j2,j3,j7", stages);
  check("REMINDERS-ONLY-LAGGARDS", ofKind(await notifs(B), "statutes_reminder", gid).length === 0 && ofKind(await notifs(E), "statutes_reminder", gid).length === 0, "ponctuels relancés");

  // Relance manuelle : une fois toutes les six heures au plus.
  const r1 = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes/reminders`);
  await ok(A.token, "POST", `/v1/tontines/${gid}/statutes/reminders`);
  const manual = ofKind(await notifs(C), "statutes_reminder", gid).filter((n) => n.params.stage === "relance");
  check("MANUAL-REMINDER", r1.reminded === 1 && manual.length === 1, { r1, manual: manual.length });
  const forbid = await call(C.token, "POST", `/v1/tontines/${gid}/statutes/reminders`);
  check("MANUAL-REMINDER-BUREAU-ONLY", forbid.status === 403, forbid);

  // Échéance passée : C exclu par la lecture de n'importe quel membre.
  clock = deadlineMs + H;
  await notifs(B);
  members = await ok(A.token, "GET", `/v1/tontines/${gid}/members?all=1`);
  const cRow = members.find((x) => x.displayName === C.name);
  check("EXPIRED-EXCLUDED", cRow && cRow.state === "revoked", cRow);
  const nC = ofKind(await notifs(C), "statutes_excluded", gid);
  check("NOTIF-EXCLUDED", nC.length === 1 && nC[0].groupName !== null, nC);
  const nA = ofKind(await notifs(A), "statutes_expired", gid);
  check("NOTIF-BUREAU-EXPIRED", nA.length === 1 && nA[0].params.name === C.name && nA[0].params.excluded === true, nA);
  const journal = await ok(A.token, "GET", `/v1/tontines/${gid}/journal`);
  check("JOURNAL-VALID", journal.valid === true && journal.entries.some((e) => e.type === "statutes.deadline_exclusion"), { valid: journal.valid });
  const start2 = await call(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
  check("START-AFTER-EXPIRY", start2.status === 200 || start2.status === 201, start2);
  const nE = ofKind(await notifs(E), "cycle_started", gid);
  check("NOTIF-CYCLE-STARTED", nE.length === 1 && nE[0].params.cycleNo === 1 && nE[0].target === `/tontines/${gid}/calendrier`, nE);

  /* ── 2. Conséquence « keep » : signalement, aucune exclusion ─────── */
  clock = deadlineMs + 2 * D;
  const g2 = await groupe("Njangi Souple", [B, C], A);
  const st2 = await ok(A.token, "POST", `/v1/tontines/${g2}/statutes`, { acceptanceDays: 2, onExpiry: "keep" });
  check("SHORT-DEADLINE-NO-BURST", ofKind(await notifs(C), "statutes_reminder", g2).length === 0, "paliers j7/j3/j2 envoyés d'un coup");
  const ext = await ok(A.token, "PATCH", `/v1/tontines/${g2}/statutes/deadline`, { extendDays: 3 });
  check("EXTEND", Date.parse(ext.deadline.deadlineAt) - Date.parse(st2.deadline.deadlineAt) === 3 * D, ext.deadline);
  clock = Date.parse(ext.deadline.deadlineAt) + H;
  await notifs(A);
  const m2 = await ok(A.token, "GET", `/v1/tontines/${g2}/members?all=1`);
  check("KEEP-NOT-EXCLUDED", m2.filter((x) => x.state === "active").length === 3, m2.map((x) => x.state));
  const k = ofKind(await notifs(A), "statutes_expired", g2);
  check("KEEP-BUREAU-TOLD", k.length === 2 && k.every((n) => n.params.excluded === false && n.params.reason === "keep"), k.map((n) => n.params));

  /* ── 3. Notifications précises et cliquables ─────────────────────── */
  const inv = await ok(A.token, "POST", `/v1/tontines/${g2}/invitations`, { maxUses: 2, days: 7 });
  const X = await login(5, "Xavier Candidat");
  const j = await ok(X.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: X.name });
  const jr = ofKind(await notifs(A), "join_request", g2).filter((n) => n.params.name === X.name);
  check("NOTIF-JOIN-REQUEST", jr.length === 1 && jr[0].params.name === X.name && jr[0].target === `/tontines/${g2}/membres`, jr);
  await ok(A.token, "POST", `/v1/tontines/${g2}/members/${j.membershipId}/admission`, { decision: "reject" });
  const rj = ofKind(await notifs(X), "rejected", g2);
  check("NOTIF-REJECTED-DELIVERED", rj.length === 1 && rj[0].params.groupName.startsWith("Njangi Souple"), rj);

  /* ── 4. Tâche planifiée ─────────────────────────────────────────── */
  const noAuth = await call(null, "GET", "/v1/internal/cron/echeances");
  check("CRON-PROTECTED", noAuth.status === 404, noAuth.status);
  const cron = await call(null, "GET", "/v1/internal/cron/echeances", undefined, { authorization: "Bearer secret-de-preuve" });
  check("CRON-RUNS", cron.status === 200 && cron.body.groups >= 2, cron);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.echeances", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
