// KÓMBE @kombe/api — preuve base réelle du store PostgreSQL C06 (Piste A1).
//
// Script de recette RÉEL (pas vitest/mock) : exécute contre un Neon/PostgreSQL
// 16+ joignable via KOMBE_API_DATABASE_URL. Sans cette variable, sort en
// BLOCKED (exit 2) — jamais un succès simulé. Reconstruit son propre schéma
// (down puis up, mêmes fichiers que packages/db/tests/isolation.pg.mjs) pour
// partir d'un état connu, insère deux obligations fictives dans deux groupes
// distincts, puis exerce le store CONTRE de vraies transactions Postgres :
//
//   A1-DECLARE   : déclaration appliquée, journal+idempotency_registry réels.
//   A1-REPLAY    : même clé/corps -> duplicate, AUCUN second événement journal.
//   A1-CONFLICT  : même clé, corps différent -> IDEMPOTENCY_BODY_CONFLICT.
//   A1-RESTART   : nouveau Pool (process "redémarré") relit la même donnée.
//   A1-CROSSGRP  : contexte RLS du groupe B ne voit PAS l'obligation du groupe A.
//   A1-EXCESS    : dépassement de capacité refusé, aucune écriture.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgContributionStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgContributionStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgContributionStore, DomainError;
try {
  ({ PgContributionStore } = await import(pathToFileURL(resolve(distRoot, "db/pgContributionStore.js")).href));
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
  // Pré-nettoyage (même garde que isolation.pg.mjs) : élimine les lignes
  // résiduelles d'un run précédent dont l'état violerait un CHECK réduit
  // par les .down.sql intermédiaires. Premier run vierge ⇒ undefined_table
  // ignorée par le bloc DO lui-même (PL/pgSQL), pas par un catch JS.
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

  // ── Schéma propre : même ordre DOWN/UP que isolation.pg.mjs ──────────────
  for (const f of [
    "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql",
    "migrations/0017_pilot_metrics.down.sql", "migrations/0016_privacy_law.down.sql",
    "migrations/0015_export_manifest.down.sql", "migrations/0014_support_security.down.sql",
    "migrations/0013_outbox.down.sql", "migrations/0012_proposal.down.sql",
    "migrations/0011_disbursement.down.sql", "migrations/0010_dispute_cases.down.sql",
    "migrations/0009_contribution_validation.down.sql", "migrations/0008_contribution_idempotency.down.sql",
    "migrations/0007_event_journal.down.sql", "migrations/0006_cycle_schedule.down.sql",
    "migrations/0005_rules_engine.down.sql", "migrations/0004_group_governance.down.sql",
    "migrations/0003_access.down.sql", "migrations/0002_role_change.down.sql",
    "migrations/0001_init.down.sql",
  ]) {
    await runSql(migrator, f);
  }
  for (const f of [
    "provision/roles_create.sql", "migrations/0001_init.sql", "migrations/0002_role_change.sql",
    "migrations/0003_access.sql", "migrations/0004_group_governance.sql", "migrations/0005_rules_engine.sql",
    "migrations/0006_cycle_schedule.sql", "migrations/0007_event_journal.sql",
    "migrations/0008_contribution_idempotency.sql", "migrations/0009_contribution_validation.sql",
    "migrations/0010_dispute_cases.sql", "migrations/0011_disbursement.sql", "migrations/0012_proposal.sql",
    "migrations/0013_outbox.sql", "migrations/0014_support_security.sql", "migrations/0015_export_manifest.sql",
    "migrations/0016_privacy_law.sql", "migrations/0017_pilot_metrics.sql",
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "migrations/0023_worker_discovery.sql", "provision/roles.sql",
  ]) {
    await runSql(migrator, f);
  }

  // ── Fixtures : deux groupes, une identité et une obligation chacun ───────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_a'), ('idn_b') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpA','active'), ('grpB','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_a','grpA','idn_a','active'), ('mem_b','grpB','idn_b','active') ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_a','grpA',1), ('rnd_b','grpB',1) ON CONFLICT DO NOTHING;
  `);

  const pool1 = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const store1 = new PgContributionStore(pool1);

  await store1.seedObligation("grpA", "ob_a1", "rnd_a", "mem_a", 5000n);
  await store1.seedObligation("grpB", "ob_b1", "rnd_b", "mem_b", 5000n);

  const ctxA = {
    actorIdentityId: "idn_a", actorRole: "treasurer", actorGroupIds: ["grpA"],
    idempotencyKey: "key-1", expectedVersion: 1, serverDate: "2026-10-06", commandId: "cmd-key-1",
  };
  const decl = { obligationId: "ob_a1", amountMinor: 3000n, channel: "cash", allegedDate: "2026-10-06" };

  // A1-DECLARE
  const r1 = await store1.declare("grpA", ctxA, decl);
  check("A1-DECLARE", r1.status === "applied" && r1.remainingDue === 5000n && r1.availableToDeclare === 2000n, {
    status: r1.status, remainingDue: r1.remainingDue.toString(), availableToDeclare: r1.availableToDeclare.toString(),
  });
  const countAfterFirst = await store1.declaredEventCount("grpA");

  // A1-REPLAY : même clé, même corps -> duplicate, aucun second événement.
  const r2 = await store1.declare("grpA", ctxA, decl);
  const countAfterReplay = await store1.declaredEventCount("grpA");
  check("A1-REPLAY", r2.status === "duplicate" && countAfterReplay === countAfterFirst, {
    status: r2.status, countAfterFirst, countAfterReplay,
  });

  // A1-CONFLICT : même clé, corps différent -> IDEMPOTENCY_BODY_CONFLICT.
  let conflictCode = null;
  try {
    await store1.declare("grpA", { ...ctxA, expectedVersion: r1.resultVersion }, { ...decl, amountMinor: 999n });
  } catch (err) {
    conflictCode = err instanceof DomainError ? err.code : `non-DomainError: ${String(err)}`;
  }
  check("A1-CONFLICT", conflictCode === "IDEMPOTENCY_BODY_CONFLICT", { conflictCode });

  // A1-EXCESS : dépassement de capacité (restant 2000) -> refusé, aucune écriture.
  let excessCode = null;
  const countBeforeExcess = await store1.declaredEventCount("grpA");
  try {
    await store1.declare(
      "grpA",
      { ...ctxA, idempotencyKey: "key-excess", commandId: "cmd-excess", expectedVersion: r1.resultVersion },
      { ...decl, amountMinor: 999999n },
    );
  } catch (err) {
    excessCode = err instanceof DomainError ? err.code : `non-DomainError: ${String(err)}`;
  }
  const countAfterExcess = await store1.declaredEventCount("grpA");
  check("A1-EXCESS", excessCode === "CONTRIBUTION_EXCEEDS_REMAINING" && countAfterExcess === countBeforeExcess, {
    excessCode, countBeforeExcess, countAfterExcess,
  });

  // A1-CROSSGRP : transaction scopée grpB ne voit PAS l'obligation de grpA (RLS).
  let crossGroupCode = null;
  try {
    await store1.declare(
      "grpB",
      { ...ctxA, actorGroupIds: ["grpB"], idempotencyKey: "key-cross", commandId: "cmd-cross" },
      { ...decl, obligationId: "ob_a1" },
    );
  } catch (err) {
    crossGroupCode = err instanceof DomainError ? err.code : `non-DomainError: ${String(err)}`;
  }
  check("A1-CROSSGRP", crossGroupCode === "RESERVATION_INCOHERENTE", { crossGroupCode });

  await pool1.end();

  // A1-RESTART : un NOUVEAU Pool (processus "redémarré") relit la même donnée persistée.
  const pool2 = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const store2 = new PgContributionStore(pool2);
  const view2 = await store2.view("grpA", "ob_a1");
  const count2 = await store2.declaredEventCount("grpA");
  check("A1-RESTART", view2.activeReserved === "3000" && view2.contributionCount === 1 && count2 === countAfterFirst, {
    activeReserved: view2.activeReserved, contributionCount: view2.contributionCount, count2, countAfterFirst,
  });
  await pool2.end();

  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgContributionStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgContributionStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
