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
if (mode !== "migrate" && mode !== "seed") {
  process.stderr.write(
    JSON.stringify(
      {
        target: "kombe.db.migrate",
        status: "FAIL",
        reason: `mode inconnu : « ${mode} » (attendu : migrate | seed)`,
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
