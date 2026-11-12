// KÓMBE @kombe/db — runner de migration/déploiement RÉEL (socle déployable).
//
// Ce script n'est PAS un porteur d'échec décoratif : il applique vraiment les
// migrations sur une PostgreSQL 16+ réelle, puis consigne chaque fichier dans
// une table de jalons. Si aucune base n'est joignable (KOMBE_DATABASE_URL
// absente) ou si le pilote `pg` n'est pas installé, il sort en BLOCKED (code 2)
// avec le motif, SANS JAMAIS simuler de succès. Convention de sortie alignée
// sur 04_Harness : 0 = succès réel, 1 = échec, 2 = BLOCKED (dépendance indispo).
//
// Usage :
//   node scripts/migrate.mjs migrate   # applique migrations/ puis provision/roles.sql
//   node scripts/migrate.mjs seed       # charge fixtures/fictitious.sql (après migrate)
//   node scripts/migrate.mjs status     # LECTURE SEULE : appliquées, en attente, inconnues
//   node scripts/migrate.mjs down migrations/00NN_x.sql
//                                       # défait UNE migration : la DERNIÈRE appliquée,
//                                       # nommée explicitement ; en production, exige en
//                                       # plus KOMBE_CONFIRM_PROD_DOWN=<même nom>
//
// Env : KOMBE_DATABASE_URL — chaîne de connexion PostgreSQL (rôle propriétaire).
//
// ATOMICITÉ : les fichiers de migration ne sont PAS idempotents (CREATE TABLE
// nu). Pour qu'un crash ne puisse jamais laisser un jalon sans schéma (ou
// l'inverse), chaque fichier est ré-encadré dans UNE seule transaction POSÉE
// PAR CE RUNNER : ses marqueurs de niveau 0 « BEGIN; »/« COMMIT; » sont retirés
// (les BEGIN/END plpgsql à l'intérieur des fonctions/DO $$ sont préservés, ils
// n'ont pas de point-virgule), puis DDL + insertion du jalon sont committés
// ensemble. Tout échec roule la transaction : ni schéma partiel, ni jalon fantôme.
//
// ORDRE : liste explicite identique à tests/isolation.pg.mjs (les migrations ne
// sont pas auto-découvertes ; provisioning des rôles APRÈS toutes les tables).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "..");

/** Up-migrations dans l'ordre canonique (mêmes fichiers que isolation.pg.mjs). */
const UP_MIGRATIONS = [
  // Les rôles doivent exister avant les migrations qui y référencent des
  // droits (0007 REVOKE, 0013 POLICY/GRANT) ; roles.sql (grants sur tables)
  // reste en dernier car il suppose le schéma appliqué.
  "provision/roles_create.sql",
  "migrations/0001_init.sql",
  "migrations/0002_role_change.sql",
  "migrations/0003_access.sql",
  "migrations/0004_group_governance.sql",
  "migrations/0005_rules_engine.sql",
  "migrations/0006_cycle_schedule.sql",
  "migrations/0007_event_journal.sql",
  "migrations/0008_contribution_idempotency.sql",
  "migrations/0009_contribution_validation.sql",
  "migrations/0010_dispute_cases.sql",
  "migrations/0011_disbursement.sql",
  "migrations/0012_proposal.sql",
  "migrations/0013_outbox.sql",
  "migrations/0014_support_security.sql",
  "migrations/0015_export_manifest.sql",
  "migrations/0016_privacy_law.sql",
  "migrations/0017_pilot_metrics.sql",
  "migrations/0018_session_resolver.sql",
  "migrations/0019_token_security.sql",
  "migrations/0020_group_resolvers.sql",
  "migrations/0021_privacy_restore_points.sql",
  "migrations/0022_cycle_schedule.sql",
  "migrations/0023_worker_discovery.sql",
  "migrations/0024_group_onboarding.sql",
  "migrations/0025_member_groups.sql",
  "migrations/0026_tontine_core.sql",
  "migrations/0027_association.sql",
  "migrations/0028_product_api.sql",
  "migrations/0029_ops_console.sql",
  "migrations/0030_decisions.sql", "migrations/0031_cycles_reserve.sql",
  "migrations/0032_audit_indexes.sql",
  "migrations/0033_custom_funds.sql",
  "migrations/0034_echeances_notifications.sql",
  // Photos (refonte 0.8.0) : noms tels qu'enregistrés en production le 05/11/2026.
  "migrations/0034_group_photo.sql",
  "migrations/0035_member_photo.sql",
  "migrations/0036_securite_operateurs.sql",
  "migrations/0037_rls_identite.sql",
  "migrations/0038_notifications_livraison.sql",
  "migrations/0039_role_api.sql",
  "migrations/0040_performance_charge.sql",
  "migrations/0041_crm.sql",
  "migrations/0042_securite_residuelle.sql", "migrations/0043_retours_membres.sql", "migrations/0044_crm_alertes.sql", "migrations/0045_rls_group.sql", "migrations/0046_crm_delais.sql", "migrations/0047_integrite.sql", "migrations/0048_langue_notifications.sql",
  "provision/roles.sql",
];

/** Fixtures de développement (mode seed uniquement). */
const FIXTURES = ["fixtures/fictitious.sql"];

/** Clé de verrou advisory (session) : sérialise deux `migrate` concurrents. */
const ADVISORY_LOCK_KEY = 778_812_301;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function blocked(reason) {
  emit({ target: "kombe.db.migrate", status: "BLOCKED", reason, exitCode: 2 });
  process.exit(2);
}

// ── Mode : strict (un mode inconnu ne doit JAMAIS appliquer les migrations) ──
const mode = process.argv[2] ?? "migrate";
if (mode !== "migrate" && mode !== "seed" && mode !== "status" && mode !== "down") {
  process.stderr.write(
    JSON.stringify(
      {
        target: "kombe.db.migrate",
        status: "FAIL",
        reason: `mode inconnu : « ${mode} » (attendu : migrate | seed | status | down)`,
        exitCode: 1,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(1);
}

const url = process.env.KOMBE_DATABASE_URL;
if (!url) {
  blocked(
    "KOMBE_DATABASE_URL absente : aucune base PostgreSQL de déploiement joignable. " +
      "La migration réelle ne peut pas être simulée (règle : ne pas mocker PostgreSQL).",
  );
}

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé : impossibilité de parler à PostgreSQL réel (mock interdit).");
}

/** Retire uniquement les marqueurs de transaction de NIVEAU 0 (ligne dédiée
 *  « BEGIN; » / « COMMIT; »). Les BEGIN/END plpgsql (sans point-virgule, à
 *  l'intérieur des fonctions et DO $$) ne correspondent pas et sont conservés. */
function stripTopLevelTxMarkers(sql) {
  return sql
    .replace(/^[ \t]*BEGIN;[ \t]*$/gim, "")
    .replace(/^[ \t]*COMMIT;[ \t]*$/gim, "");
}

const files = mode === "seed" ? FIXTURES : UP_MIGRATIONS;
const client = new pg.Client({ connectionString: url });

/* ── status : lecture seule (aucun verrou, aucune table créée) ─────────── */
if (mode === "status") {
  try {
    await client.connect();
    const exists = (await client.query("SELECT to_regclass('public.kombe_migration') IS NOT NULL AS ok")).rows[0].ok === true;
    const rows = exists ? (await client.query("SELECT name, applied_at FROM kombe_migration ORDER BY applied_at, name")).rows : [];
    const applied = new Set(rows.map((r) => r.name));
    const pending = UP_MIGRATIONS.filter((f) => !applied.has(f));
    const unknown = rows.map((r) => r.name).filter((n) => !UP_MIGRATIONS.includes(n) && !FIXTURES.includes(n));
    const lastMigration = [...rows].reverse().find((r) => /^migrations\//.test(r.name));
    emit({
      target: "kombe.db.migrate", mode, status: "OK",
      applied: rows.length, pending, unknown,
      latest: lastMigration ? { name: lastMigration.name, appliedAt: new Date(lastMigration.applied_at).toISOString() } : null,
      exitCode: 0,
    });
    await client.end();
    process.exit(0);
  } catch (err) {
    emit({ target: "kombe.db.migrate", mode, status: "FAIL", error: String(err?.message ?? err), exitCode: 1 });
    process.exit(1);
  }
}

/* ── down : une seule migration, la dernière, nommée explicitement ───── */
if (mode === "down") {
  const target = process.argv[3];
  const fail = (reason, code = 1) => {
    emit({ target: "kombe.db.migrate", mode, status: code === 2 ? "BLOCKED" : "FAIL", reason, exitCode: code });
    process.exit(code);
  };
  if (!target || !/^migrations\/\d{4}_[a-z0-9_]+\.sql$/.test(target) || !UP_MIGRATIONS.includes(target)) {
    fail("Usage : migrate.mjs down migrations/00NN_nom.sql (une migration connue)");
  }
  const { isProdHost } = await import("./guard.mjs");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* hôte illisible : traité comme inconnu */ }
  if (isProdHost(host) && process.env.KOMBE_CONFIRM_PROD_DOWN !== target) {
    fail(`Base de PRODUCTION : retour arrière refusé sans KOMBE_CONFIRM_PROD_DOWN=${target} (faire une sauvegarde Neon d'abord).`, 2);
  }
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    const last = (await client.query(
      "SELECT name FROM kombe_migration WHERE name LIKE 'migrations/%' ORDER BY applied_at DESC, name DESC LIMIT 1",
    )).rows[0]?.name;
    if (last !== target) fail(`Seule la dernière migration appliquée peut être défaite : ${last ?? "aucune"} (demandé : ${target}).`);
    const downSql = stripTopLevelTxMarkers(readFileSync(resolve(dbRoot, target.replace(/\.sql$/, ".down.sql")), "utf8"));
    await client.query("BEGIN");
    try {
      await client.query(downSql);
      await client.query("DELETE FROM kombe_migration WHERE name = $1", [target]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    emit({ target: "kombe.db.migrate", mode, status: "OK", reverted: target, exitCode: 0 });
    await client.end();
    process.exit(0);
  } catch (err) {
    emit({ target: "kombe.db.migrate", mode, status: "FAIL", error: String(err?.message ?? err), exitCode: 1 });
    process.exit(1);
  }
}

try {
  await client.connect();
  // Verrou advisory de session : un second runner concurrent attend plutôt que
  // de courir après le premier sur les mêmes DDL. Libéré à la fermeture.
  await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

  // Table de jalons (idempotence des ré-exécutions complètes) ; auto-committée.
  await client.query(
    `CREATE TABLE IF NOT EXISTS kombe_migration (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const already = new Set(
    (await client.query("SELECT name FROM kombe_migration")).rows.map((r) => r.name),
  );

  const applied = [];
  const skipped = [];
  for (const file of files) {
    if (already.has(file)) {
      skipped.push(file);
      continue;
    }
    const innerSql = stripTopLevelTxMarkers(readFileSync(resolve(dbRoot, file), "utf8"));
    // DDL + jalon dans UNE seule transaction : atomicité vérifiée.
    await client.query("BEGIN");
    try {
      await client.query(innerSql);
      await client.query("INSERT INTO kombe_migration (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }

  emit({ target: "kombe.db.migrate", mode, status: "OK", applied, skipped, exitCode: 0 });
  await client.end();
  process.exit(0);
} catch (err) {
  process.stderr.write(
    JSON.stringify(
      {
        target: "kombe.db.migrate",
        mode,
        status: "FAIL",
        error: String(err && err.message ? err.message : err),
        exitCode: 1,
      },
      null,
      2,
    ) + "\n",
  );
  try {
    await client.end();
  } catch {
    /* connexion déjà rompue */
  }
  process.exit(1);
}
