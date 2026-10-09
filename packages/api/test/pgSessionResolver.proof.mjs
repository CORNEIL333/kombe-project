// KÓMBE @kombe/api — preuve base réelle du resolveur de session (Piste A2).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs (Piste A1). Sans KOMBE_API_DATABASE_URL :
// BLOCKED (exit 2), jamais simulé. Reconstruit son propre schéma, insère des
// fixtures (identités, sessions, groupe, adhésions, rôles), puis exerce
// resolveSession/resolveGroupActor contre de VRAIES transactions Postgres :
//
//   A2-VALID     : session active, génération à jour -> identité résolue.
//   A2-REVOKED   : session révoquée -> SESSION_INVALID, rejetée.
//   A2-EXPIRED   : session expirée -> SESSION_INVALID, rejetée.
//   A2-STALEGEN  : génération de session != génération compte (récupération
//                  postérieure) -> SESSION_INVALID, rejetée.
//   A2-UNKNOWN   : session_id inconnu -> SESSION_INVALID (même code que
//                  révoquée/expirée — non-divulgation, pas de distinction).
//   A2-RLS-DIRECT: une requête DIRECTE (hors fonction SECURITY DEFINER) sur
//                  access_session SANS kombe.identity_id posé ne voit AUCUNE
//                  ligne — preuve que la RLS standard reste intacte, que
//                  SEULE la fonction nommée contourne RLS.
//   A2-GROUPACTOR: adhésion active + rôle accepté -> résolu ; adhésion
//                  inexistante -> FEATURE_PILOT_FORBIDDEN.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgSessionResolver.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgSessionResolver", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let resolveSession, resolveGroupActor, DomainError;
try {
  ({ resolveSession, resolveGroupActor } = await import(pathToFileURL(resolve(distRoot, "db/pgSessionResolver.js")).href));
  ({ DomainError } = await import("@kombe/domain"));
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
      -- 'executed' (C09) est terminal : conversion -> closed par 0012.down
      -- (apres son DROP TRIGGER) ; ici le trigger vote_transition est actif.
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled','executed');
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
    "migrations/0024_group_onboarding.down.sql", "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "migrations/0023_worker_discovery.sql", "migrations/0024_group_onboarding.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  const NOW = Date.now();
  const HOUR = 3_600_000;

  // ── Fixtures : groupe, identités, adhésion, rôle ─────────────────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_valid'),('idn_revoked'),('idn_expired'),('idn_stale'),('idn_member')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpS','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_s','grpS','idn_member','active') ON CONFLICT DO NOTHING;
  `);
  // Deux rôles acceptés pour le MÊME membership (schéma le permet) : prouve
  // le choix de résolution "rôle unique pour le moment" (décision humaine
  // 2026-10-07) -- la plus RÉCENTE acceptation (treasurer, maintenant)
  // l'emporte sur la plus ancienne (secretary, il y a 1h).
  await migrator.query(
    `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
       VALUES ('ra_s0','grpS','mem_s','secretary', $1),
              ('ra_s1','grpS','mem_s','treasurer', $2)
     ON CONFLICT DO NOTHING`,
    [new Date(NOW - HOUR), new Date(NOW)],
  );
  // Comptes : actifs à generation=1 sauf idn_stale (generation=2, simulant une
  // récupération postérieure à l'émission de la session testée, encore à 1).
  await migrator.query(`
    INSERT INTO identity_access (identity_id, state, channel_verified, session_generation)
      VALUES ('idn_valid','active',true,1), ('idn_revoked','active',true,1),
             ('idn_expired','active',true,1), ('idn_stale','active',true,2),
             ('idn_member','active',true,1)
      ON CONFLICT (identity_id) DO UPDATE SET state=EXCLUDED.state, session_generation=EXCLUDED.session_generation;
  `);
  await migrator.query(
    `INSERT INTO access_session (session_id, identity_id, generation, issued_at, expires_at, revoked_at)
     VALUES
       ('sess_valid','idn_valid',1,$2,$1,NULL),
       ('sess_revoked','idn_revoked',1,$2,$1,$3),
       ('sess_expired','idn_expired',1,$2,$4,NULL),
       ('sess_stale','idn_stale',1,$2,$1,NULL),
       ('sess_member','idn_member',1,$2,$1,NULL)
     ON CONFLICT (session_id) DO NOTHING`,
    [new Date(NOW + HOUR), new Date(NOW - 2 * HOUR), new Date(NOW), new Date(NOW - 1000)],
  );

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });

  async function withTx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await fn(client);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // A2-VALID
  const valid = await withTx((c) => resolveSession(c, "sess_valid", NOW));
  check("A2-VALID", valid.identityId === "idn_valid", valid);

  // A2-REVOKED
  let revokedCode = null;
  try {
    await withTx((c) => resolveSession(c, "sess_revoked", NOW));
  } catch (e) { revokedCode = e instanceof DomainError ? e.code : String(e); }
  check("A2-REVOKED", revokedCode === "SESSION_INVALID", { revokedCode });

  // A2-EXPIRED
  let expiredCode = null;
  try {
    await withTx((c) => resolveSession(c, "sess_expired", NOW));
  } catch (e) { expiredCode = e instanceof DomainError ? e.code : String(e); }
  check("A2-EXPIRED", expiredCode === "SESSION_INVALID", { expiredCode });

  // A2-STALEGEN : session.generation=1, compte déjà à generation=2.
  let staleCode = null;
  try {
    await withTx((c) => resolveSession(c, "sess_stale", NOW));
  } catch (e) { staleCode = e instanceof DomainError ? e.code : String(e); }
  check("A2-STALEGEN", staleCode === "SESSION_INVALID", { staleCode });

  // A2-UNKNOWN
  let unknownCode = null;
  try {
    await withTx((c) => resolveSession(c, "sess_does_not_exist", NOW));
  } catch (e) { unknownCode = e instanceof DomainError ? e.code : String(e); }
  check("A2-UNKNOWN", unknownCode === "SESSION_INVALID", { unknownCode });

  // A2-RLS-DIRECT : requête directe SANS passer par la fonction, SANS poser
  // kombe.identity_id -> RLS self-scope doit masquer la ligne (0 résultat).
  const direct = await withTx(async (c) => {
    const r = await c.query("SELECT * FROM access_session WHERE session_id = $1", ["sess_valid"]);
    return r.rows.length;
  });
  check("A2-RLS-DIRECT", direct === 0, { rows_visible_without_identity_context: direct });

  // A2-GROUPACTOR : adhésion active + rôle accepté.
  const actor = await withTx(async (c) => {
    await c.query("SELECT set_config('kombe.group_id', $1, true)", ["grpS"]);
    return resolveGroupActor(c, "idn_member", "grpS");
  });
  check("A2-GROUPACTOR", actor.role === "treasurer" && actor.membershipId === "mem_s", actor);

  // A2-GROUPACTOR-DENY : identité sans adhésion dans ce groupe -> refus.
  let denyCode = null;
  try {
    await withTx(async (c) => {
      await c.query("SELECT set_config('kombe.group_id', $1, true)", ["grpS"]);
      return resolveGroupActor(c, "idn_valid", "grpS");
    });
  } catch (e) { denyCode = e instanceof DomainError ? e.code : String(e); }
  check("A2-GROUPACTOR-DENY", denyCode === "FEATURE_PILOT_FORBIDDEN", { denyCode });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgSessionResolver", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgSessionResolver", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
