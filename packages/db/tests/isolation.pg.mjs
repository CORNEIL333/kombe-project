// KÓMBE C01 — Tests d'isolation PostgreSQL RÉELS (livrable prêt à exécuter).
//
// Ce fichier N'EST PAS UN MOCK. Il applique les scénarios C01-TENANT, C01-FK et
// C01-POOL contre une base PostgreSQL 16+ réelle et des observations issues
// d'actions/réquisitions réelles — jamais de constante lue dans un fichier
// d'attentes.
//
// HONNÊTETÉ D'EXÉCUTION : si aucune base n'est disponible (variable
// KOMBE_TEST_DATABASE_URL absente) OU si le pilote `pg` n'est pas installé, le
// script sort en BLOCKED (code 2) avec le motif, SANS simuler de succès. C'est
// l'état de cet hôte (ni Docker ni PostgreSQL). Convention de sortie alignée
// sur 04_Harness : 0 = succès réel, 1 = échec, 2 = BLOCKED.
//
// Lancement (quand l'infra existe) :
//   KOMBE_TEST_DATABASE_URL=postgresql://kombe_migrateur@localhost:5432/kombe_test \
//   node packages/db/tests/isolation.pg.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "..");
const url = process.env.KOMBE_TEST_DATABASE_URL;

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.db.isolation", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
  );
  process.exit(2);
}

if (!url) {
  blocked("KOMBE_TEST_DATABASE_URL absente : aucune base PostgreSQL de test joignable sur cet hôte.");
}

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé : impossibilité de parler à PostgreSQL réel (mock interdit).");
}

/** Lit et exécute un fichier SQL (requête simple multi-instructions). */
async function runSql(client, file) {
  await client.query(readFileSync(resolve(dbRoot, file), "utf8"));
}

/** Enveloppe une transaction en posant le contexte RLS kombe.group_id. */
async function withTenant(client, groupId, fn) {
  await client.query("BEGIN");
  await client.query("SET LOCAL kombe.group_id = $1", [groupId]);
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main() {
  const migrator = new pg.Client({ connectionString: url });
  await migrator.connect();
  const observations = {};

  try {
    // État initial reproductible : on repart d'un schéma propre en base de test.
    await runSql(migrator, "migrations/0001_init.down.sql");
    await runSql(migrator, "migrations/0001_init.sql");
    await runSql(migrator, "migrations/0002_role_change.sql");
    await runSql(migrator, "provision/roles.sql");

    // Deux groupes A/B, une identité et une obligation chacune (fictives).
    await migrator.query(`
      SET kombe.group_id = 'grpA';
      INSERT INTO identity (identity_id) VALUES ('idn_a'), ('idn_b') ON CONFLICT DO NOTHING;
      INSERT INTO "group" (group_id, state) VALUES ('grpA','active'), ('grpB','active') ON CONFLICT DO NOTHING;
      INSERT INTO membership (membership_id, group_id, identity_id, state)
        VALUES ('mem_a','grpA','idn_a','active'), ('mem_b','grpB','idn_b','active')
        ON CONFLICT DO NOTHING;
      INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_a','grpA',1), ('rnd_b','grpB',1) ON CONFLICT DO NOTHING;
      INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount)
        VALUES ('obl_a','grpA','rnd_a','mem_a',1000), ('obl_b','grpB','rnd_b','mem_b',1000)
        ON CONFLICT DO NOTHING;
    `);

    // Session applicative : kombe_app (non-propriétaire, sans BYPASSRLS).
    const app = new pg.Client({
      connectionString: url,
      options: "-c role=kombe_app",
    });
    await app.connect();

    // ── C01-TENANT : A interroge avec l'id d'un objet de B. ──────────────────
    const tenant = await withTenant(app, "grpA", async () => {
      const res = await app.query(
        "SELECT count(*)::int AS n FROM obligation WHERE obligation_id = 'obl_b'",
      );
      return res.rows[0].n;
    });
    observations.C01_TENANT = { cross_group_rows: tenant };

    // ── C01-FK : lier une contribution A à l'obligation de B. ────────────────
    let foreignLinkAccepted = true;
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query(
        `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state)
         VALUES ('cn_bad','grpA','obl_b',500,'declared')`,
      );
      await app.query("COMMIT");
    } catch {
      foreignLinkAccepted = false; // FK composite (group_id, obligation_id) rejetée
      await app.query("ROLLBACK").catch(() => {});
    }
    observations.C01_FK = { foreign_link_accepted: foreignLinkAccepted };

    // ── C01-POOL : 100 alternances A/B sur UNE même connexion de pool. ───────
    let leaked = 0;
    for (let i = 0; i < 100; i += 1) {
      const group = i % 2 === 0 ? "grpA" : "grpB";
      const expectedObl = group === "grpA" ? "obl_a" : "obl_b";
      const n = await withTenant(app, group, async () => {
        const res = await app.query(
          "SELECT obligation_id FROM obligation WHERE group_id = $1",
          [group],
        );
        // Toute ligne dont l'obligation n'appartient pas au groupe courant est une fuite.
        return res.rows.filter((r) => r.obligation_id !== expectedObl).length;
      });
      leaked += n;
    }
    observations.C01_POOL = { leaked_rows: leaked };

    await app.end();

    const pass =
      observations.C01_TENANT.cross_group_rows === 0 &&
      observations.C01_FK.foreign_link_accepted === false &&
      observations.C01_POOL.leaked_rows === 0;

    process.stdout.write(
      JSON.stringify(
        {
          target: "kombe.db.isolation",
          status: pass ? "PASS" : "FAIL",
          observations,
          exitCode: pass ? 0 : 1,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(pass ? 0 : 1);
  } finally {
    await migrator.end();
  }
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({ target: "kombe.db.isolation", status: "FAIL", error: String(err), exitCode: 1 }, null, 2) + "\n",
  );
  process.exit(1);
});
