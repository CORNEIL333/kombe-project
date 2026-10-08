// KÓMBE @kombe/api — preuve base réelle du store accès (C02, Piste A2 suite).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que les scripts
// précédents. Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2). Utilise
// NullEmailSender (JAMAIS un envoi réel avant G0, STACK.md §4) — les codes
// sont lus depuis `sender.sent`, comme une vraie boîte de réception.
//
//   A2B-REGISTER   : inscription → code envoyé → vérification → actif.
//   A2B-MISMATCH   : code erroné → refusé, compte reste pending, pas verrouillé.
//   A2B-LOCKOUT    : après MAX_TOKEN_ATTEMPTS échecs, même le bon code est refusé.
//   A2B-RECOVERY   : récupération → génération de session incrémentée.
//   A2B-ENUM       : identité inconnue → même réponse, AUCUN email envoyé.
//   A2B-LOGIN      : connexion par lien magique → session RÉELLE (access_session),
//                    usable via resolveSession (Piste A2, fonction SECURITY DEFINER).
//   A2B-SESSIONID  : sessionId généré serveur, jamais prévisible/fourni client.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgAccessStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgAccessStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgAccessStore, NullEmailSender, resolveSession, DomainError, MAX_TOKEN_ATTEMPTS;
try {
  ({ PgAccessStore } = await import(pathToFileURL(resolve(distRoot, "db/pgAccessStore.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
  ({ resolveSession } = await import(pathToFileURL(resolve(distRoot, "db/pgSessionResolver.js")).href));
  ({ DomainError, MAX_TOKEN_ATTEMPTS } = await import("@kombe/domain"));
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
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);

  const DOWN = [
    "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql",
    "migrations/0017_pilot_metrics.down.sql", "migrations/0016_privacy_law.down.sql",
    "migrations/0015_export_manifest.down.sql", "migrations/0014_support_security.down.sql",
    "migrations/0013_outbox.down.sql", "migrations/0012_proposal.down.sql",
    "migrations/0011_disbursement.down.sql", "migrations/0010_dispute_cases.down.sql",
    "migrations/0009_contribution_validation.down.sql", "migrations/0008_contribution_idempotency.down.sql",
    "migrations/0007_event_journal.down.sql", "migrations/0006_cycle_schedule.down.sql",
    "migrations/0005_rules_engine.down.sql", "migrations/0004_group_governance.down.sql",
    "migrations/0003_access.down.sql", "migrations/0002_role_change.down.sql",
    "migrations/0001_init.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const sender = new NullEmailSender();
  const store = new PgAccessStore(pool, sender);

  // A2B-REGISTER
  await store.requestRegistration("alice@example.test", "email");
  const sentToAlice = sender.sent.filter((m) => m.to === "alice@example.test");
  check("A2B-REGISTER-SENT", sentToAlice.length === 1, { count: sentToAlice.length });
  const aliceCode = sentToAlice[0].text.match(/(\d{6})/)?.[1];
  const verified = await store.verifyRegistration("alice@example.test", aliceCode);
  check("A2B-REGISTER", verified.state === "active", verified);

  // A2B-MISMATCH : nouvelle inscription, code erroné une fois.
  await store.requestRegistration("bob@example.test", "email");
  const bobCode = sender.sent.find((m) => m.to === "bob@example.test").text.match(/(\d{6})/)[1];
  const wrongCode = bobCode === "000000" ? "111111" : "000000";
  let mismatchCode = null;
  try {
    await store.verifyRegistration("bob@example.test", wrongCode);
  } catch (e) { mismatchCode = e instanceof DomainError ? e.code : String(e); }
  check("A2B-MISMATCH", mismatchCode === "TOKEN_INVALID", { mismatchCode });
  // Le BON code reste utilisable après un seul essai raté.
  const bobVerified = await store.verifyRegistration("bob@example.test", bobCode);
  check("A2B-MISMATCH-RECOVER", bobVerified.state === "active", bobVerified);

  // A2B-LOCKOUT : MAX_TOKEN_ATTEMPTS échecs successifs verrouillent même le bon code.
  await store.requestRegistration("carol@example.test", "email");
  const carolCode = sender.sent.find((m) => m.to === "carol@example.test").text.match(/(\d{6})/)[1];
  const carolWrong = carolCode === "000000" ? "111111" : "000000";
  let lastCode = null;
  for (let i = 0; i < MAX_TOKEN_ATTEMPTS; i++) {
    try { await store.verifyRegistration("carol@example.test", carolWrong); } catch (e) {
      lastCode = e instanceof DomainError ? e.code : String(e);
    }
  }
  let lockedCode = null;
  try {
    await store.verifyRegistration("carol@example.test", carolCode);
  } catch (e) { lockedCode = e instanceof DomainError ? e.code : String(e); }
  check("A2B-LOCKOUT", lastCode === "TOKEN_INVALID" && lockedCode === "TOKEN_INVALID", { lastCode, lockedCode });

  // A2B-RECOVERY
  await store.requestRecovery("alice@example.test");
  const recoveryCode = sender.sent.filter((m) => m.to === "alice@example.test").at(-1).text.match(/(\d{6})/)[1];
  const recovered = await store.completeRecovery("alice@example.test", recoveryCode, 600);
  check("A2B-RECOVERY", recovered.sessionGeneration === 2 && recovered.recoveryLockUntil !== null, recovered);

  // A2B-ENUM : identité inconnue -> même réponse {accepted:true}, AUCUN envoi.
  const beforeCount = sender.sent.length;
  const enumResult = await store.requestRecovery("unknown@example.test");
  check("A2B-ENUM", enumResult.accepted === true && sender.sent.length === beforeCount, {
    accepted: enumResult.accepted, newEmailsSent: sender.sent.length - beforeCount,
  });

  // A2B-LOGIN + A2B-SESSIONID : lien magique -> session réelle, sessionId serveur.
  await store.requestLogin("alice@example.test");
  const loginCode = sender.sent.filter((m) => m.to === "alice@example.test").at(-1).text.match(/(\d{6})/)[1];
  const login = await store.completeLogin("alice@example.test", loginCode);
  check("A2B-SESSIONID", typeof login.sessionId === "string" && login.sessionId.length >= 32, {
    sessionIdLength: login.sessionId.length,
  });
  const resolved = await pool.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      const r = await resolveSession(client, login.sessionId, Date.now());
      await client.query("COMMIT");
      return r;
    } finally { client.release(); }
  });
  check("A2B-LOGIN", resolved.identityId === "alice@example.test", resolved);

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgAccessStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgAccessStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
