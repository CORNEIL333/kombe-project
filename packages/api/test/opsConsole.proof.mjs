// KÓMBE @kombe/api — preuve base réelle de la console d'exploitation (X-08, X-11 à X-13).
//
// Sur une vraie PostgreSQL (rôle kombe_app sous RLS) : une identité ordinaire
// reçoit 403 sur /v1/ops/* ; promue opératrice (grant-operator.mjs, acte
// d'administration en base), elle lit des agrégats transverses aux groupes
// (aucune donnée individuelle), les indicateurs hebdomadaires et l'état du
// schéma (dernier jalon = celui attendu par le build). Sans base : BLOCKED (2).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://… node test/opsConsole.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.ops", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await app.inject({ method, url: path, headers, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json };
}
async function ok(token, method, path, body) {
  const r = await call(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

const run = String(randomInt(100000, 999999));
async function login(i, name) {
  const p = `69${run}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login };
}

try {
  const O = await login(1, "Opératrice");
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "2000", cadence: { kind: "every_n_days", n: 8 }, firstMeetingDate: today, deadlineTime: "18:00",
    meetingPlace: null, maxMembers: 5, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance",
    newcomersLast: true, guarantorRequired: false, payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 1 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  await ok(O.token, "POST", "/v1/tontines", { name: `Groupe console ${run}`, founderDisplayName: "Opératrice", settings });

  const me1 = await ok(O.token, "GET", "/v1/ops/me");
  check("OPS-ME-NOT-OPERATOR", me1.operator === false && me1.identityId === O.login, me1);
  const refused = await Promise.all(["/v1/ops/overview", "/v1/ops/kpis", "/v1/ops/groups", "/v1/ops/engineering"].map((p) => call(O.token, "GET", p)));
  check("OPS-403-FOR-MEMBER", refused.every((r) => r.status === 403), refused.map((r) => r.status));
  const anon = await call(null, "GET", "/v1/ops/overview");
  check("OPS-401-ANON", anon.status === 401, anon.status);

  // Promotion par le VRAI script d'administration (sortie 0 attendue).
  const grant = spawnSync(process.execPath, [resolve(here, "../../db/scripts/grant-operator.mjs"), O.login], {
    env: { ...process.env, KOMBE_DATABASE_URL: url },
    encoding: "utf8",
  });
  check("GRANT-OPERATOR-SCRIPT", grant.status === 0 && /"isOperator": true/.test(grant.stdout), { code: grant.status, out: grant.stdout, err: grant.stderr });

  const me2 = await ok(O.token, "GET", "/v1/ops/me");
  check("OPS-ME-OPERATOR", me2.operator === true, me2);
  const ov = await ok(O.token, "GET", "/v1/ops/overview");
  check(
    "OPS-OVERVIEW",
    typeof ov.identities === "number" && ov.identities >= 1 && (ov.groupsByState.configuration ?? 0) >= 1 && "outboxPending" in ov && "movementsDeclaredOver72h" in ov,
    ov,
  );
  const kpis = await ok(O.token, "GET", "/v1/ops/kpis?weeks=4");
  check("OPS-KPIS", kpis.length === 4 && kpis[3].groupsCreated >= 1 && /^\d+$/.test(kpis[3].amountDeclared), kpis);
  const badWeeks = await call(O.token, "GET", "/v1/ops/kpis?weeks=500");
  check("OPS-KPIS-BOUNDS", badWeeks.status === 400 || badWeeks.status === 422, badWeeks.status);
  const groups = await ok(O.token, "GET", "/v1/ops/groups?limit=50");
  const mine = groups.find((g) => g.name === `Groupe console ${run}`);
  check("OPS-GROUPS", mine && mine.membersActive === 1 && mine.state === "configuration", mine ?? groups.slice(0, 3));
  check("OPS-GROUPS-NO-PERSONAL-DATA", groups.every((g) => !JSON.stringify(g).includes("+237")), "téléphone exposé");
  const eng = await ok(O.token, "GET", "/v1/ops/engineering");
  check("OPS-ENGINEERING", eng.schemaUpToDate === true && eng.migrations.length >= 29 && typeof eng.postgresVersion === "string", {
    upToDate: eng.schemaUpToDate,
    n: eng.migrations?.length,
    expected: eng.expectedLatestMigration,
  });
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.ops", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
