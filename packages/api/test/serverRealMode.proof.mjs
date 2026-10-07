// KÓMBE @kombe/api — preuve base réelle du CÂBLAGE server.ts/HTTP en mode
// RÉEL (Piste A3). Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs / pgAccessStore.proof.mjs. Sans
// KOMBE_API_DATABASE_URL : BLOCKED (exit 2), jamais simulé.
//
// Exerce le serveur Fastify RÉEL construit par buildApp({ pool, emailSender })
// via `.inject()` (pas de port réseau nécessaire, même app, mêmes routes
// qu'en production) contre de VRAIES transactions Postgres :
//
//   A3-REGISTER     : inscription + vérification par code → compte actif.
//   A3-LOGIN        : lien magique → sessionId RÉEL généré serveur.
//   A3-DECLARE      : POST /v1/groups/:id/declarations avec
//                     Authorization: Bearer <sessionId> RÉEL → 201, événement
//                     scellé en base (journal), capacité réservée.
//   A3-DECLARE-NOAUTH : même route SANS Authorization → 401 SESSION_INVALID.
//   A3-DECLARE-FOREIGN : session valide mais hors du groupe ciblé → 403
//                         FEATURE_PILOT_FORBIDDEN (anti-IDOR, jamais une
//                         divulgation de l'existence de l'obligation).
//   A3-VIEW         : GET /v1/groups/:id/obligations/:id avec la même session
//                     → capacité/restant dû reflètent la déclaration ci-dessus.
//   A3-FICTIF-INTACT : buildApp() SANS pool (mode par défaut) répond encore
//                      au squelette fictif existant — zéro régression.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/serverRealMode.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
  );
  process.exit(2);
}

const url = process.env.KOMBE_API_DATABASE_URL;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé.");
}

let buildApp, createApiPool, NullEmailSender;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
} catch (err) {
  blocked(`Build manquant (pnpm --filter @kombe/api build requis) : ${String(err && err.message ? err.message : err)}`);
}

async function runSql(client, relPath) {
  const sql = readFileSync(resolve(dbRoot, relPath), "utf8");
  await client.query(sql);
}

const migrator = new pg.Client({ connectionString: url });
await migrator.connect();
const observations = {};
let failures = 0;

function check(name, cond, detail) {
  observations[name] = detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

try {
  await migrator.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed'
        WHERE state NOT IN ('configuration','active','paused','closed');
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled');
      -- 0019.down ré-ajoute la vérification étroite purpose IN
      -- ('registration','recovery') ; des jetons 'login' résiduels d'un cycle
      -- antérieur la violeraient au DOWN. Nettoyage dans le harness (jamais
      -- dans les migrations) : cf. leçon « demote residual states pre-DOWN ».
      DELETE FROM verification_token
        WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);

  const DOWN = [
    "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql",
    "migrations/0016_privacy_law.down.sql", "migrations/0015_export_manifest.down.sql",
    "migrations/0014_support_security.down.sql", "migrations/0013_outbox.down.sql",
    "migrations/0012_proposal.down.sql", "migrations/0011_disbursement.down.sql",
    "migrations/0010_dispute_cases.down.sql", "migrations/0009_contribution_validation.down.sql",
    "migrations/0008_contribution_idempotency.down.sql", "migrations/0007_event_journal.down.sql",
    "migrations/0006_cycle_schedule.down.sql", "migrations/0005_rules_engine.down.sql",
    "migrations/0004_group_governance.down.sql", "migrations/0003_access.down.sql",
    "migrations/0002_role_change.down.sql", "migrations/0001_init.down.sql",
  ];
  for (const f of DOWN) await runSql(migrator, f);

  const UP = [
    "provision/roles_create.sql", "migrations/0001_init.sql", "migrations/0002_role_change.sql",
    "migrations/0003_access.sql", "migrations/0004_group_governance.sql", "migrations/0005_rules_engine.sql",
    "migrations/0006_cycle_schedule.sql", "migrations/0007_event_journal.sql",
    "migrations/0008_contribution_idempotency.sql", "migrations/0009_contribution_validation.sql",
    "migrations/0010_dispute_cases.sql", "migrations/0011_disbursement.sql", "migrations/0012_proposal.sql",
    "migrations/0013_outbox.sql", "migrations/0014_support_security.sql", "migrations/0015_export_manifest.sql",
    "migrations/0016_privacy_law.sql", "migrations/0017_pilot_metrics.sql",
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures : identité, DEUX groupes (cible + étranger), adhésion+rôle,
  //    obligation ────────────────────────────────────────────────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('alice@example.test') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpA3','active'), ('grpA3-foreign','active')
      ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_a3','grpA3','alice@example.test','active') ON CONFLICT DO NOTHING;
    INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
      VALUES ('ra_a3','grpA3','mem_a3','treasurer', now()) ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_a3','grpA3',1) ON CONFLICT DO NOTHING;
    INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
      VALUES ('ob_a3','grpA3','rnd_a3','mem_a3','100000','0','0',1) ON CONFLICT DO NOTHING;
  `);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const nullSender = new NullEmailSender();
  const app = buildApp({ pool, emailSender: nullSender });

  function inject(opts) {
    return app.inject(opts);
  }

  // ── A3-REGISTER : inscription + code + vérification → actif ────────────
  await inject({ method: "POST", url: "/v1/access/registrations", payload: { identityId: "alice@example.test", channel: "email" } });
  const codeMatch = nullSender.sent.at(-1)?.text.match(/(\d{6})/);
  const code = codeMatch ? codeMatch[1] : null;
  const verifyRes = await inject({
    method: "POST",
    url: "/v1/access/registrations/verifications",
    payload: { identityId: "alice@example.test", code },
  });
  check("A3-REGISTER", verifyRes.statusCode === 200 && verifyRes.json().state === "active", {
    status: verifyRes.statusCode,
    body: verifyRes.json(),
  });

  // ── A3-LOGIN : lien magique → sessionId RÉEL ────────────────────────────
  await inject({ method: "POST", url: "/v1/access/login-requests", payload: { identityId: "alice@example.test" } });
  const loginCodeMatch = nullSender.sent.at(-1)?.text.match(/(\d{6})/);
  const loginCode = loginCodeMatch ? loginCodeMatch[1] : null;
  const loginRes = await inject({
    method: "POST",
    url: "/v1/access/login-completions",
    payload: { identityId: "alice@example.test", code: loginCode },
  });
  const sessionId = loginRes.json().sessionId;
  check("A3-LOGIN", loginRes.statusCode === 201 && typeof sessionId === "string" && sessionId.length === 36, {
    status: loginRes.statusCode,
    sessionIdLength: sessionId ? sessionId.length : null,
  });

  // ── A3-DECLARE : déclaration RÉELLE authentifiée par la session ─────────
  const declareRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/declarations",
    headers: {
      authorization: `Bearer ${sessionId}`,
      "idempotency-key": "idem-a3-1",
      "if-match-version": "1",
    },
    payload: { obligationId: "ob_a3", amount: 40000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE", declareRes.statusCode === 201 && declareRes.json().status === "applied", {
    status: declareRes.statusCode,
    body: declareRes.json(),
  });

  // ── A3-DECLARE-NOAUTH : sans Authorization → 401 SESSION_INVALID ───────
  const noAuthRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/declarations",
    headers: { "idempotency-key": "idem-a3-2", "if-match-version": "1" },
    payload: { obligationId: "ob_a3", amount: 1000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE-NOAUTH", noAuthRes.statusCode === 401 && noAuthRes.json().code === "SESSION_INVALID", {
    status: noAuthRes.statusCode,
    body: noAuthRes.json(),
  });

  // ── A3-DECLARE-FOREIGN : session valide, groupe SANS adhésion → 403 ────
  const foreignRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3-foreign/declarations",
    headers: {
      authorization: `Bearer ${sessionId}`,
      "idempotency-key": "idem-a3-3",
      "if-match-version": "1",
    },
    payload: { obligationId: "ob_a3", amount: 1000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE-FOREIGN", foreignRes.statusCode === 403 && foreignRes.json().code === "FEATURE_PILOT_FORBIDDEN", {
    status: foreignRes.statusCode,
    body: foreignRes.json(),
  });

  // ── A3-VIEW : capacité/restant dû reflètent la déclaration ci-dessus ───
  const viewRes = await inject({
    method: "GET",
    url: "/v1/groups/grpA3/obligations/ob_a3",
    headers: { authorization: `Bearer ${sessionId}` },
  });
  check(
    "A3-VIEW",
    viewRes.statusCode === 200 && viewRes.json().activeReserved === "40000" && viewRes.json().contributionCount === 1,
    { status: viewRes.statusCode, body: viewRes.json() },
  );

  // ── A3-FICTIF-INTACT : sans pool, le squelette fictif répond encore ────
  const fictifApp = buildApp();
  const fictifRes = await fictifApp.inject({ method: "GET", url: "/v1/health" });
  check("A3-FICTIF-INTACT", fictifRes.statusCode === 200 && fictifRes.json().phase === "c00-skeleton", {
    status: fictifRes.statusCode,
    body: fictifRes.json(),
  });
  await fictifApp.close();

  await app.close();
  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
