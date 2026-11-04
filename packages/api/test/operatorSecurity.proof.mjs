// KÓMBE @kombe/api — preuve base réelle : sécurité des opérateurs (ADR-0043)
// et journal de support DURABLE.
//
// - Membre ordinaire → 403 sur toutes les consoles (refus journalisé).
// - Opérateur « direction » seul → 403 sur Opérations (autre fonction), et
//   403 OPERATOR_MFA_REQUIRED sur Direction tant que le second facteur n'est
//   ni activé ni vérifié.
// - TOTP : mauvais code refusé ; bon code (RFC 6238 calculé ici) → codes de
//   secours ; nouvelle session → re-vérification exigée ; rejeu du même pas
//   refusé ; code de secours à usage unique ; essais en rafale → 429.
// - Support JIT : auto-approbation refusée ET tracée après le 403 ; action
//   financière refusée ET tracée ; approbation avec version périmée → 409.
// Horloge injectée. Sans KOMBE_API_DATABASE_URL : BLOCKED.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");
function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.operatorSecurity", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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
delete process.env.KOMBE_OPERATOR_MFA; // second facteur EXIGÉ (défaut)
delete process.env.KOMBE_SMS_PROVIDER;
let clock = Date.now();
const pool = createApiPool({ connectionString: url });
const app = buildApp({ pool, emailSender: new NullEmailSender(), now: () => clock });
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
  return { status: res.statusCode, body: json };
}
const run = String(randomInt(100000, 999999));
async function session(i, name) {
  const p = `6${i}${run}${i}`.slice(0, 9);
  const req = await call(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await call(null, "POST", "/v1/auth/code-verifications", { login: req.body.login, code: req.body.devCode });
  if (name) await call(ses.body.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.body.sessionId, login: req.body.login };
}
function b32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const ch of s) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secretB32, ms) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(ms / 30000)));
  const h = createHmac("sha1", b32decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
async function grant(login, roles) {
  await admin.query(`UPDATE identity_access SET is_operator = true WHERE identity_id = $1`, [login]);
  for (const r of roles) await admin.query(`INSERT INTO operator_role (identity_id, role, granted_by) VALUES ($1,$2,'preuve') ON CONFLICT DO NOTHING`, [login, r]);
}

try {
  /* Membre ordinaire */
  const M = await session(1, "Membre Ordinaire");
  for (const p of ["/v1/ops/overview", "/v1/ops/engineering", "/v1/metrics/risks"]) {
    const r = await call(M.token, "GET", p);
    check(`MEMBER-DENIED ${p}`, r.status === 403, r);
  }
  const meM = await call(M.token, "GET", "/v1/ops/me");
  check("ME-MEMBER", meM.body.operator === false && meM.body.roles.length === 0, meM.body);

  /* Opérateur « direction » */
  const D = await session(2, "Opératrice Direction");
  await grant(D.login, ["direction"]);
  const wrongRole = await call(D.token, "GET", "/v1/ops/overview");
  check("ROLE-SEPARATION", wrongRole.status === 403 && wrongRole.body.code === "PRIVILEGE_NOT_GRANTED", wrongRole);
  const noMfa = await call(D.token, "GET", "/v1/metrics/risks");
  check("MFA-REQUIRED-BEFORE-ENROLL", noMfa.status === 403 && noMfa.body.code === "OPERATOR_MFA_REQUIRED", noMfa);
  const enr = await call(D.token, "POST", "/v1/ops/mfa/enrollment");
  check("ENROLL", enr.status === 201 && /^[A-Z2-7]{32}$/.test(enr.body.secret) && enr.body.otpauthUri.startsWith("otpauth://totp/"), enr);
  const stored = await admin.query(`SELECT secret_ciphertext FROM operator_mfa WHERE identity_id = $1`, [D.login]);
  check("SECRET-ENCRYPTED-AT-REST", stored.rows[0] && !stored.rows[0].secret_ciphertext.includes(enr.body.secret), "secret en clair");
  const bad = await call(D.token, "POST", "/v1/ops/mfa/activation", { code: totp(enr.body.secret, clock) === "000000" ? "111111" : "000000" });
  check("ACTIVATION-BAD-CODE", bad.status === 400 && bad.body.code === "TOKEN_INVALID", bad);
  const act = await call(D.token, "POST", "/v1/ops/mfa/activation", { code: totp(enr.body.secret, clock) });
  check("ACTIVATION", act.status === 200 && act.body.recoveryCodes.length === 10, act);
  const ok1 = await call(D.token, "GET", "/v1/metrics/risks");
  check("DIRECTION-ALLOWED-AFTER-MFA", ok1.status === 200, ok1.status);
  check("STILL-NO-OPERATIONS", (await call(D.token, "GET", "/v1/ops/overview")).status === 403, "ops ouvert");

  /* Nouvelle session : re-vérification, anti-rejeu, secours, rafale */
  const D2 = await session(2);
  const again = await call(D2.token, "GET", "/v1/metrics/risks");
  check("NEW-SESSION-NEEDS-MFA", again.status === 403 && again.body.code === "OPERATOR_MFA_REQUIRED", again);
  const replay = await call(D2.token, "POST", "/v1/ops/mfa/verification", { code: totp(enr.body.secret, clock) });
  check("TOTP-REPLAY-REFUSED", replay.status === 400, replay);
  clock += 60_000;
  const v = await call(D2.token, "POST", "/v1/ops/mfa/verification", { code: totp(enr.body.secret, clock) });
  check("VERIFY", v.status === 200 && (await call(D2.token, "GET", "/v1/metrics/risks")).status === 200, v);
  const D3 = await session(2);
  const rc = act.body.recoveryCodes[0];
  const rec1 = await call(D3.token, "POST", "/v1/ops/mfa/verification", { recoveryCode: rc });
  const D4 = await session(2);
  const rec2 = await call(D4.token, "POST", "/v1/ops/mfa/verification", { recoveryCode: rc });
  check("RECOVERY-ONCE", rec1.status === 200 && rec2.status === 400, [rec1.status, rec2.status]);
  clock += 600_000; // nouvelle fenêtre de limitation
  const D5 = await session(2);
  const burst = [];
  for (let i = 0; i < 7; i++) burst.push((await call(D5.token, "POST", "/v1/ops/mfa/verification", { code: "000000" })).status);
  // Échecs antérieurs de la fenêtre précédente oubliés ; 5 échecs puis refus.
  check("MFA-THROTTLED", burst.slice(0, 5).every((s) => s === 400) && burst.slice(5).every((s) => s === 429), burst);
  const audit = await admin.query(`SELECT event_type, count(*)::int n FROM operator_audit_log WHERE identity_id = $1 GROUP BY 1`, [D.login]);
  const ev = Object.fromEntries(audit.rows.map((r) => [r.event_type, r.n]));
  check("OPERATOR-AUDIT-DURABLE", ev.console_denied >= 2 && ev.mfa_failed >= 6 && ev.mfa_enabled === 1 && ev.mfa_recovery_used === 1, ev);

  /* Support JIT : refus durables, version */
  const S1 = await session(3, "Support Un");
  const S2 = await session(4, "Support Deux");
  for (const S of [S1, S2]) {
    await grant(S.login, ["support"]);
    const e = await call(S.token, "POST", "/v1/ops/mfa/enrollment");
    await call(S.token, "POST", "/v1/ops/mfa/activation", { code: totp(e.body.secret, clock) });
  }
  const g = await admin.query(`INSERT INTO "group" (group_id, state, display_name) VALUES ($1,'active','Groupe support') RETURNING group_id`, [`grp_sup_${run}`]);
  const gid = g.rows[0].group_id;
  const reqId = `req-${randomUUID()}`;
  const created = await call(S1.token, "POST", "/v1/support/access-requests", { requestId: reqId, targetGroupId: gid, motif: "Ticket 42 : membre bloqué", permissions: ["view_trace"], ttlSeconds: 3600 });
  check("SUPPORT-REQUEST", created.status === 201, created);
  const self = await call(S1.token, "POST", `/v1/support/access-requests/${reqId}/approvals`, { ttlSeconds: 3600 }, { "if-match-version": "1" });
  check("SELF-APPROVAL-REFUSED", self.status === 403 || self.status === 409 || self.status === 422, self);
  const stale = await call(S2.token, "POST", `/v1/support/access-requests/${reqId}/approvals`, { ttlSeconds: 3600 }, { "if-match-version": "7" });
  check("STALE-VERSION-409", stale.status === 409, stale);
  const fin = await call(S1.token, "POST", `/v1/support/access-requests/${reqId}/actions`, { action: "validate_contribution" });
  check("FINANCIAL-ACTION-REFUSED", fin.status === 403, fin);
  const logs = await admin.query(`SELECT event_type FROM security_log WHERE group_id = $1 ORDER BY log_id`, [gid]);
  const types = logs.rows.map((r) => r.event_type);
  check("REFUSALS-DURABLE-AFTER-403", types.filter((t) => t === "support_access_denied").length >= 2 && types.includes("support_financial_action_refused"), types);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}
await admin.end();
await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.operatorSecurity", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
