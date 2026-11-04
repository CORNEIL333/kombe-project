// KÓMBE @kombe/api — preuve base réelle : idempotence ATOMIQUE des commandes.
//
// 1. 20 requêtes simultanées, même clé, même corps → un seul effet ; toutes
//    les réponses identiques ; les suivantes marquées « idempotent-replay ».
// 2. Même clé, autre corps → 409 IDEMPOTENCY_BODY_CONFLICT, aucun effet.
// 3. Panne ENTRE l'effet et l'enregistrement de la réponse (déclencheur de
//    test qui fait échouer l'INSERT dans api_idempotency) → la commande entière
//    est annulée : aucun effet orphelin. Panne levée, relance de la même clé →
//    exactement un effet.
// 4. Clé hors bornes → refus sans effet.
// Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");
function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.idempotence", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}
const url = process.env.KOMBE_API_DATABASE_URL;
const adminUrl = process.env.KOMBE_DATABASE_URL ?? url;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");
const { buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href);
const { createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href);
const { NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href);

process.env.NODE_ENV = "test";
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url, max: 30 });
const app = buildApp({ pool, emailSender: new NullEmailSender() });
await app.ready();
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = cond ? "OK" : detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}
async function call(token, method, path, body, headers = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await app.inject({ method, url: path, headers: h, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { json = res.body; }
  return { status: res.statusCode, body: json, replay: res.headers["idempotent-replay"] === "true" };
}
const run = String(randomInt(100000, 999999));
async function login(i, name) {
  const p = `6${i}${run}${i}`.slice(0, 9);
  const req = await call(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await call(null, "POST", "/v1/auth/code-verifications", { login: req.body.login, code: req.body.devCode });
  await call(ses.body.sessionId, "PATCH", "/v1/me", { displayName: name });
  return ses.body.sessionId;
}
const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const settings = {
  contributionPerShare: "5000", cadence: { kind: "weekly", weekday: new Date(`${today}T12:00:00Z`).getUTCDay() }, firstMeetingDate: today,
  deadlineTime: "18:00", meetingPlace: null, maxMembers: 10, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance",
  newcomersLast: false, guarantorRequired: false, payoutWitnesses: 0,
  fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
  solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
};
const mine = async (t) => (await call(t, "GET", "/v1/me/tontines")).body.length;

try {
  const A = await login(1, "Awa Idempotence");

  /* 1. Concurrence réelle : 20 requêtes, même clé */
  const key1 = `idem-${randomUUID()}`;
  const body1 = { name: `Njangi Idem ${run}`, founderDisplayName: "Awa", settings };
  const outs = await Promise.all(Array.from({ length: 20 }, () => call(A, "POST", "/v1/tontines", body1, { "idempotency-key": key1 })));
  const ok = outs.filter((o) => o.status === 201);
  check("CONCURRENT-ALL-ANSWERED", ok.length === 20, outs.map((o) => o.status));
  check("CONCURRENT-SAME-RESPONSE", new Set(ok.map((o) => o.body.groupId)).size === 1, ok.map((o) => o.body?.groupId));
  check("CONCURRENT-REPLAYS", outs.filter((o) => o.replay).length === 19, outs.map((o) => o.replay));
  check("CONCURRENT-ONE-EFFECT", (await mine(A)) === 1, await mine(A));

  /* 2. Même clé, autre corps */
  const other = await call(A, "POST", "/v1/tontines", { ...body1, name: `Autre ${run}` }, { "idempotency-key": key1 });
  check("BODY-CONFLICT", other.status === 409 && other.body.code === "IDEMPOTENCY_BODY_CONFLICT", other);
  check("BODY-CONFLICT-NO-EFFECT", (await mine(A)) === 1, await mine(A));

  /* 3. Panne entre l'effet et l'enregistrement de la réponse */
  const key3 = `idem-panne-${randomUUID()}`;
  await admin.query(`CREATE OR REPLACE FUNCTION kombe_test_panne() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.idempotency_key LIKE 'idem-panne-%' THEN RAISE EXCEPTION 'panne simulée'; END IF; RETURN NEW; END $$`);
  await admin.query(`DROP TRIGGER IF EXISTS kombe_test_panne ON api_idempotency`);
  await admin.query(`CREATE TRIGGER kombe_test_panne BEFORE INSERT ON api_idempotency FOR EACH ROW EXECUTE FUNCTION kombe_test_panne()`);
  const body3 = { name: `Njangi Panne ${run}`, founderDisplayName: "Awa", settings };
  const crashed = await call(A, "POST", "/v1/tontines", body3, { "idempotency-key": key3 });
  check("FAILURE-REPORTED", crashed.status >= 500 || crashed.status === 409, crashed.status);
  check("FAILURE-NO-ORPHAN-EFFECT", (await mine(A)) === 1, await mine(A));
  await admin.query(`DROP TRIGGER kombe_test_panne ON api_idempotency`);
  await admin.query(`DROP FUNCTION kombe_test_panne()`);
  const retry1 = await call(A, "POST", "/v1/tontines", body3, { "idempotency-key": key3 });
  const retry2 = await call(A, "POST", "/v1/tontines", body3, { "idempotency-key": key3 });
  check("RETRY-AFTER-FAILURE-ONE-EFFECT", retry1.status === 201 && retry2.status === 201 && retry2.replay && retry1.body.groupId === retry2.body.groupId && (await mine(A)) === 2, {
    r1: retry1.status, r2: retry2.status, n: await mine(A),
  });

  /* 4. Clé hors bornes */
  const short = await call(A, "POST", "/v1/tontines", { ...body1, name: `Court ${run}` }, { "idempotency-key": "abc" });
  check("KEY-TOO-SHORT-REFUSED", short.status >= 400 && short.status < 500 && (await mine(A)) === 2, short);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}
await admin.end();
await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.idempotence", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
