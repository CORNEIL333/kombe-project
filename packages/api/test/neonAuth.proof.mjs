// KÓMBE @kombe/api — preuve base réelle de la connexion par Neon Auth (ADR-0040).
//
// Script de recette RÉEL (PostgreSQL 16, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
// Le schéma doit être à jour (node packages/db/scripts/migrate.mjs migrate).
// Les codes SMS viennent du simulateur de développement (`devCode`) : aucun
// SMS réel n'est envoyé.
//
// Parcours : jetons signés localement (clé de test, JWKS local injecté) ;
// échange d'un jeton valide → session KÓMBE utilisable ; refus d'un jeton
// expiré, signé par une autre clé, d'un autre émetteur ou d'une adresse non
// vérifiée ; voies de connexion annoncées ; identité unique (même e-mail).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/neonAuth.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.neonauth", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } = await import("jose");
const BASE = "https://ep-test.neonauth.example.neon.tech/neondb/auth";
const { publicKey, privateKey } = await generateKeyPair("EdDSA");
const other = await generateKeyPair("EdDSA");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" };
const neonAuth = { baseUrl: BASE, jwks: createLocalJWKSet({ keys: [jwk] }) };
const pool = createApiPool({ connectionString: url });
const app = buildApp({ pool, emailSender: new NullEmailSender(), neonAuth });
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
  const res = await app.inject({ method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { json = res.body; }
  return { status: res.statusCode, body: json };
}
const run = String(randomInt(100000, 999999));
const email = `Awa.${run}@Exemple.CM`;
async function jeton(claims, { key = privateKey, iss = BASE, exp = "10m" } = {}) {
  return new SignJWT({ email, emailVerified: true, name: "Awa", ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer(iss)
    .setAudience(BASE)
    .setSubject(`usr_${run}`)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

try {
  const ch = await call(null, "GET", "/v1/auth/channels");
  check("CHANNELS-NEON", ch.body.neonAuthUrl === BASE && ch.body.email === true, ch.body);

  const ok = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({}) });
  check("EXCHANGE-OK", ok.status === 201 && ok.body.identityId === email.toLowerCase() && ok.body.sessionId, ok);
  const me = await call(ok.body.sessionId, "GET", "/v1/me");
  check("SESSION-USABLE", me.status === 200, me);
  const t = await call(ok.body.sessionId, "POST", "/v1/tontines", { name: `Njangi Neon ${run}`, founderDisplayName: "Awa", settings: { contributionPerShare: "5000", cadence: { kind: "weekly", weekday: 6 }, firstMeetingDate: "2026-11-07", deadlineTime: "18:00", meetingPlace: "Bonamoussadi", maxMembers: 10, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance", newcomersLast: false, guarantorRequired: false, payoutWitnesses: 1, fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 }, solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" } } });
  check("SESSION-CAN-CREATE", t.status === 201, t.status);

  const again = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({ email: email.toUpperCase() }) });
  check("SAME-IDENTITY", again.status === 201 && again.body.identityId === email.toLowerCase(), again.body);
  const mine = await call(again.body.sessionId, "GET", "/v1/me/tontines");
  check("SAME-IDENTITY-SEES-GROUP", Array.isArray(mine.body) && mine.body.length === 1, mine.body);

  const expired = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({}, { exp: Math.floor(Date.now() / 1000) - 3600 }) });
  check("EXPIRED-REFUSED", expired.status === 401, expired);
  const forged = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({}, { key: other.privateKey }) });
  check("FOREIGN-KEY-REFUSED", forged.status === 401, forged);
  const badIss = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({}, { iss: "https://evil.example.com" }) });
  check("FOREIGN-ISSUER-REFUSED", badIss.status === 401, badIss);
  const unverified = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({ emailVerified: false }) });
  check("UNVERIFIED-REFUSED", unverified.status === 401, unverified);
  const noEmail = await call(null, "POST", "/v1/auth/neon-exchange", { token: await jeton({ email: undefined }) });
  check("NO-EMAIL-REFUSED", noEmail.status === 401, noEmail);
  const garbage = await call(null, "POST", "/v1/auth/neon-exchange", { token: "x".repeat(40) });
  check("GARBAGE-REFUSED", garbage.status === 401, garbage);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.neonauth", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
