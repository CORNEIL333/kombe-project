// KÓMBE @kombe/db — test RÉEL vide → dernière migration (§17).
//
// Méthode : ramener la base de vérification partagée à vide (DOWN canoniques
// 0025 → 0001), puis invoquer le VRAI runner de déploiement
// (`node scripts/migrate.mjs migrate`, child_process — jamais une copie de sa
// liste) et vérifier : exit 0, les 27 jalons consignés, des objets
// représentatifs de la dernière migration présents, et l'idempotence
// (seconde exécution → tout « skipped »). Jamais simulé : sans
// KOMBE_TEST_DATABASE_URL → BLOCKED (exit 2).
//
// Usage : KOMBE_TEST_DATABASE_URL=postgresql://… node tests/migrateEmptyToLatest.pg.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "..");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.db.migrateEmptyToLatest", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}

const url = process.env.KOMBE_TEST_DATABASE_URL;
if (!url) blocked("KOMBE_TEST_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé.");
}

async function runSql(client, relPath) {
  const sql = readFileSync(resolve(dbRoot, relPath), "utf8");
  await client.query(sql);
}

const client = new pg.Client({ connectionString: url });
const observations = {};
let failures = 0;

function check(name, cond, detail) {
  observations[name] = detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

// Même liste canonique que migrate.mjs / isolation.pg.mjs ( Down : inversé ).
const DOWN = [
  "migrations/0025_member_groups.down.sql", "migrations/0024_group_onboarding.down.sql", "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql",
  "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql",
  "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql",
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

const EXPECTED_JALONS = 27; // roles_create.sql + 25 migrations (0001..0025) + roles.sql

try {
  await client.connect();

  // Pré-nettoyage identique aux preuves (états non-DROPpable → valeur fermée).
  await client.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed'
        WHERE state NOT IN ('configuration','active','paused','closed');
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled','executed');
      DELETE FROM verification_token
        WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);
  for (const f of DOWN) await runSql(client, f);
  await client.query(`DROP TABLE IF EXISTS kombe_migration`);

  // VIDE → DERNIERE : le vrai runner, via child_process (chemin de déploiement réel).
  const run1 = spawnSync(process.execPath, [resolve(dbRoot, "scripts/migrate.mjs"), "migrate"], {
    env: { ...process.env, KOMBE_DATABASE_URL: url },
    encoding: "utf8",
  });
  check("MIGRATE-EMPTY-RUNNER-EXIT", run1.status === 0, {
    status: run1.status, stderr: (run1.stderr ?? "").slice(0, 400),
  });

  const jalons = await client.query(`SELECT name FROM kombe_migration ORDER BY name`);
  check("MIGRATE-EMPTY-JALONS", jalons.rows.length === EXPECTED_JALONS, {
    count: jalons.rows.length, expected: EXPECTED_JALONS,
    names: jalons.rows.map((r) => r.name),
  });

  // Objets représentatifs : dernier jalón (0023) + socle (outbox, RLS).
  const fn = await client.query(
    `SELECT proname FROM pg_proc WHERE proname = 'kombe_c13_pending_groups'`,
  );
  check("MIGRATE-EMPTY-LATEST-OBJECT", fn.rows.length === 1, { found: fn.rows });

  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE tablename IN ('outbox','journal','identity_access') ORDER BY tablename`,
  );
  check("MIGRATE-EMPTY-CORE-TABLES", tables.rows.length === 3, { found: tables.rows });

  // IDEMPOTENCE : seconde exécution → rien à appliquer.
  const run2 = spawnSync(process.execPath, [resolve(dbRoot, "scripts/migrate.mjs"), "migrate"], {
    env: { ...process.env, KOMBE_DATABASE_URL: url },
    encoding: "utf8",
  });
  const summary2 = (() => { try { return JSON.parse(run2.stdout); } catch { return null; } })();
  check("MIGRATE-IDEMPOTENT", run2.status === 0 && summary2 && summary2.applied.length === 0 && summary2.skipped.length === EXPECTED_JALONS, {
    status: run2.status, applied: summary2?.applied ?? null, skippedCount: summary2?.skipped?.length ?? null,
  });

  await client.end();
  process.stdout.write(JSON.stringify({
    target: "kombe.db.migrateEmptyToLatest",
    status: failures === 0 ? "PASS" : "FAIL",
    observations,
    exitCode: failures === 0 ? 0 : 1,
  }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({
    target: "kombe.db.migrateEmptyToLatest", status: "FAIL",
    error: String(err && err.stack ? err.stack : err), exitCode: 1,
  }, null, 2) + "\n");
  try { await client.end(); } catch { /* ignore */ }
  process.exit(1);
}
