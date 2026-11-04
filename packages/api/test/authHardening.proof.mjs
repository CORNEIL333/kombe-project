// KÓMBE @kombe/api — preuve base réelle : connexion durcie (ADR-0043).
// - Empreinte des codes poivrée (HMAC, préfixe h2:) quand KOMBE_TOKEN_PEPPER est posé ;
//   jamais le code en clair ; connexion qui fonctionne.
// - Limitation PARTAGÉE en base : 6 demandes de code / heure / identifiant → la
//   7e est refusée 429, même avec une NOUVELLE instance d'API (compteur en base,
//   pas en mémoire).
// - 5 codes faux verrouillent le jeton ; le bon code ensuite est refusé.
// Sans KOMBE_API_DATABASE_URL : BLOCKED.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");
function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.authHardening", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
process.env.KOMBE_TOKEN_PEPPER = "poivre-de-preuve-0123456789abcdef";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url });
const mk = async () => { const a = buildApp({ pool, emailSender: new NullEmailSender() }); await a.ready(); return a; };
const app1 = await mk();
const app2 = await mk(); // seconde « instance » : même base, mémoire distincte
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = cond ? "OK" : detail;
  if (!cond) { failures += 1; process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`); }
}
async function call(app, method, path, body) {
  const res = await app.inject({ method, url: path, ...(body !== undefined ? { payload: body } : {}) });
  let json = null; try { json = res.body ? JSON.parse(res.body) : null; } catch { json = res.body; }
  return { status: res.statusCode, body: json };
}
const run = String(randomInt(100000, 999999));
try {
  const login = `69${run}1`.slice(0, 9);
  const r1 = await call(app1, "POST", "/v1/auth/code-requests", { login });
  const tok = await admin.query(`SELECT token_hash FROM verification_token WHERE identity_id = $1 ORDER BY issued_at DESC LIMIT 1`, [r1.body.login]);
  check("HASH-PEPPERED", tok.rows[0]?.token_hash.startsWith("h2:") && !tok.rows[0].token_hash.includes(r1.body.devCode), tok.rows[0]);
  const ok = await call(app1, "POST", "/v1/auth/code-verifications", { login, code: r1.body.devCode });
  check("LOGIN-WORKS", ok.status === 201 && typeof ok.body.sessionId === "string", ok.status);

  // Verrouillage après 5 codes faux.
  const login2 = `68${run}2`.slice(0, 9);
  const r2 = await call(app1, "POST", "/v1/auth/code-requests", { login: login2 });
  const wrong = r2.body.devCode === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await call(app1, "POST", "/v1/auth/code-verifications", { login: login2, code: wrong });
  const after = await call(app1, "POST", "/v1/auth/code-verifications", { login: login2, code: r2.body.devCode });
  check("LOCKED-AFTER-5", after.status === 400 || after.status === 401, after);

  // Limitation partagée entre deux instances.
  const login3 = `67${run}3`.slice(0, 9);
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    await admin.query(`UPDATE verification_token SET issued_at = issued_at - interval '1 minute' WHERE identity_id = $1`, [`+237${login3}`]); // franchit le délai de renvoi
    statuses.push((await call(i % 2 ? app2 : app1, "POST", "/v1/auth/code-requests", { login: login3 })).status);
  }
  const seventh = await call(app2, "POST", "/v1/auth/code-requests", { login: login3 });
  check("SHARED-RATE-LIMIT", statuses.every((s) => s === 202) && seventh.status === 429 && seventh.body.code === "AUTH_THROTTLED", { statuses, seventh });
  const leak = JSON.stringify(seventh.body);
  check("THROTTLE-NO-DISCLOSURE", !/existe|inconnu|compte/i.test(leak), leak);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}
await admin.end();
await app1.close(); await app2.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.authHardening", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
