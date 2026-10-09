// KÓMBE @kombe/api — preuve base réelle de la découverte de travail worker (C13, 0023).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que les preuves
// précédentes. Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
//
//   W-DISCOVER-SETUP        : un événement journal 'contribution.declared' dans
//                             grpW1 déclenche kombe_c13_enqueue (0013) → 2 lignes
//                             outbox 'pending' (une par membre actif, canal
//                             'internal' seulement — aucune préférence push).
//   W-DISCOVER              : sous rôle kombe_worker, kombe_c13_pending_groups()
//                             (0023, SECURITY DEFINER) retourne exactement grpW1
//                             — la découverte est possible SANS poser le GUC.
//   W-DISCOVER-RLS-NOGUC    : sous kombe_worker, SELECT sur outbox sans GUC → 0
//                             ligne (politique c13_worker_tenant maintenue).
//   W-DISCOVER-RLS-GUC      : dans une transaction avec SET LOCAL
//                             kombe.group_id='grpW1' → les 2 lignes du groupe.
//   W-DISCOVER-DENY-APP     : kombe_app appelant la fonction → permission
//                             denied (EXECUTE accordé à kombe_worker seul).
//   W-DISCOVER-EXPIRED-EXCLUDED : état 'delivered' terminal exclu de la
//                             découverte (migrateur UPDATE → liste vide).
//   W-DISCOVER-SECOND-GROUP : un événement dans grpW2 (membre actif distinct)
//                             → la fonction retourne exactement grpW2.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgWorkerDiscovery.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgWorkerDiscovery", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

async function runSql(client, relPath) {
  const sql = readFileSync(resolve(dbRoot, relPath), "utf8");
  await client.query(sql);
}

const migrator = new pg.Client({ connectionString: url });
await migrator.connect();
await (await import("../../db/scripts/guard.mjs")).assertNonProdTeardown(migrator, "kombe.api.pgWorkerDiscovery");
const observations = {};
let failures = 0;

function check(name, cond, detail) {
  observations[name] = detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

async function withClient(pool, fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

const ZEROS = "0".repeat(64);
const HASH_W1 = "a".repeat(64);
const HASH_W2 = "b".repeat(64);

try {
  await migrator.query(`
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

  const DOWN = [
    "migrations/0025_member_groups.down.sql", "migrations/0024_group_onboarding.down.sql", "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql",
    "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql",
    "migrations/0023_worker_discovery.sql", "migrations/0024_group_onboarding.sql", "migrations/0025_member_groups.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures : deux groupes, membres actifs, un événement notifiable chacun. ──
  // Le trigger kombe_c13_enqueue (0013) insère internal_notification + outbox
  // 'pending' par membre actif ; la ligne push n'existe QUE si la préférence
  // external_enabled est posée — ici aucune, donc canal 'internal' seul.
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_w1'), ('idn_w2') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id) VALUES ('grpW1'), ('grpW2') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state) VALUES
      ('mem_w1', 'grpW1', 'idn_w1', 'active'),
      ('mem_w2', 'grpW1', 'idn_w2', 'active'),
      ('mem_w3', 'grpW2', 'idn_w1', 'active')
    ON CONFLICT DO NOTHING;
  `);
  await migrator.query(`
    INSERT INTO journal (group_id, seq, event_type, previous_hash, hash, payload)
    VALUES ('grpW1', 1, 'contribution.declared', '${ZEROS}', '${HASH_W1}', '{}');
  `);

  const setup = await migrator.query(`
    SELECT channel, state, count(*)::int AS n
    FROM outbox WHERE group_id = 'grpW1' GROUP BY channel, state ORDER BY channel, state;
  `);
  const internalPending = setup.rows.filter((r) => r.channel === "internal" && r.state === "pending");
  const pushRows = setup.rows.filter((r) => r.channel === "push");
  check("W-DISCOVER-SETUP", internalPending.length === 1 && internalPending[0].n === 2 && pushRows.length === 0, {
    rows: setup.rows,
  });

  const workerPool = new pg.Pool({ connectionString: url, options: "-c role=kombe_worker", max: 5 });
  const appPool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 3 });

  // W-DISCOVER : la fonction SECURITY DEFINER rend la découverte possible sous
  // kombe_worker SANS poser le GUC — exactement l'ensemble à traiter.
  const discovered = await withClient(workerPool, (c) => c.query("SELECT group_id FROM kombe_c13_pending_groups() ORDER BY group_id"));
  check("W-DISCOVER", discovered.rows.length === 1 && discovered.rows[0].group_id === "grpW1", {
    rows: discovered.rows,
  });

  // W-DISCOVER-RLS-NOGUC : la politique c13_worker_tenant filtre TOUT sans GUC.
  const noGuc = await withClient(workerPool, (c) => c.query("SELECT count(*)::int AS n FROM outbox"));
  check("W-DISCOVER-RLS-NOGUC", noGuc.rows[0].n === 0, { count: noGuc.rows[0].n });

  // W-DISCOVER-RLS-GUC : dans le contexte du groupe, les 2 lignes sont visibles.
  const withGuc = await withClient(workerPool, async (c) => {
    await c.query("BEGIN");
    try {
      await c.query("SET LOCAL kombe.group_id = 'grpW1'");
      const r = await c.query("SELECT count(*)::int AS n FROM outbox");
      await c.query("COMMIT");
      return r.rows[0].n;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
  check("W-DISCOVER-RLS-GUC", withGuc === 2, { count: withGuc });

  // W-DISCOVER-DENY-APP : EXECUTE accordé à kombe_worker seul.
  let denyError = null;
  try {
    await withClient(appPool, (c) => c.query("SELECT group_id FROM kombe_c13_pending_groups()"));
  } catch (err) {
    denyError = String(err && err.message ? err.message : err);
  }
  check("W-DISCOVER-DENY-APP", typeof denyError === "string" && /permission denied/i.test(denyError), {
    error: denyError,
  });

  // W-DISCOVER-EXPIRED-EXCLUDED : 'delivered' est terminal, hors découverte.
  await migrator.query(`UPDATE outbox SET state = 'delivered' WHERE group_id = 'grpW1'`);
  const afterDelivered = await withClient(workerPool, (c) => c.query("SELECT group_id FROM kombe_c13_pending_groups()"));
  check("W-DISCOVER-EXPIRED-EXCLUDED", afterDelivered.rows.length === 0, { rows: afterDelivered.rows });

  // W-DISCOVER-SECOND-GROUP : un second groupe à traiter apparaît seul.
  await migrator.query(`
    INSERT INTO journal (group_id, seq, event_type, previous_hash, hash, payload)
    VALUES ('grpW2', 1, 'contribution.declared', '${ZEROS}', '${HASH_W2}', '{}');
  `);
  const second = await withClient(workerPool, (c) => c.query("SELECT group_id FROM kombe_c13_pending_groups() ORDER BY group_id"));
  check("W-DISCOVER-SECOND-GROUP", second.rows.length === 1 && second.rows[0].group_id === "grpW2", {
    rows: second.rows,
  });

  await workerPool.end();
  await appPool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgWorkerDiscovery", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgWorkerDiscovery", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
