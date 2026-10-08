// KÓMBE @kombe/api — preuve base réelle du journal (C11, Piste A4).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED
// (exit 2), jamais simulé. Reconstruit son propre schéma, génère de VRAIS
// événements via PgContributionStore (déjà prouvé réel, Piste A1) puis
// exerce PgJournalStore contre ces lignes réelles :
//
//   J-VERIFY-INTACT : la chaîne réelle (2 déclarations) vérifie intact=true.
//   J-TIMELINE      : la timeline filtrée par rôle reflète les événements réels.
//   J-CHECKPOINT    : checkpoint réel posé (pool vérificateur = propriétaire,
//                     kombe_app est révoqué par 0007) ; reverify le voit.
//   J-CHECKPOINT-NOPOOL : sans pool vérificateur, checkpoint() refuse (jamais
//                         un faux succès silencieux).
//   J-TAMPER        : tamperCopyOf sur une COPIE est détecté par verifyCopy ;
//                     la chaîne réelle en base reste intacte (reverify toujours ok).
//   J-REBUILD       : rebuild réconcilie contre le validated_net RÉEL de
//                     l'obligation (ici 0, aucune validation réelle encore).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgJournalStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgJournalStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgJournalStore, PgContributionStore, createApiPool;
try {
  ({ PgJournalStore } = await import(pathToFileURL(resolve(distRoot, "db/pgJournalStore.js")).href));
  ({ PgContributionStore } = await import(pathToFileURL(resolve(distRoot, "db/pgContributionStore.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
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
      DELETE FROM verification_token WHERE purpose NOT IN ('registration','recovery');
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

  // ── Fixtures : groupe, identité, adhésion, round, obligation ────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_j1') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpJ1','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_j1','grpJ1','idn_j1','active') ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_j1','grpJ1',1) ON CONFLICT DO NOTHING;
    INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
      VALUES ('ob_j1','grpJ1','rnd_j1','mem_j1','100000','0','0',1) ON CONFLICT DO NOTHING;
  `);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const verifierPool = new pg.Pool({ connectionString: url, max: 2 }); // rôle propriétaire (neondb_owner), PAS kombe_app
  const contributions = new PgContributionStore(pool);
  const journal = new PgJournalStore(pool, verifierPool);
  const journalNoVerifier = new PgJournalStore(pool);

  // ── Génère 2 VRAIS événements via le store déjà prouvé réel (Piste A1) ──
  const baseCtx = {
    actorIdentityId: "idn_j1", actorRole: "treasurer", actorGroupIds: ["grpJ1"],
    serverDate: "2026-10-07", rulesVersion: 1,
  };
  await contributions.declare("grpJ1", { ...baseCtx, idempotencyKey: "idem-j-1", expectedVersion: 1, commandId: "cmd-j-1" },
    { obligationId: "ob_j1", amountMinor: 20000n, channel: "cash", allegedDate: "2026-10-07" });
  await contributions.declare("grpJ1", { ...baseCtx, idempotencyKey: "idem-j-2", expectedVersion: 2, commandId: "cmd-j-2" },
    { obligationId: "ob_j1", amountMinor: 15000n, channel: "electronic", allegedDate: "2026-10-07", reference: "TXN-J-2" });

  // ── J-VERIFY-INTACT ─────────────────────────────────────────────────────
  const v1 = await journal.verify("grpJ1");
  check("J-VERIFY-INTACT", v1.intact === true && v1.throughSeq === 2, v1);

  // ── J-TIMELINE ──────────────────────────────────────────────────────────
  const events = await journal.events("grpJ1");
  check("J-EVENTS-COUNT", events.length === 2, { count: events.length });
  const timeline = await journal.timeline("grpJ1", "treasurer");
  check("J-TIMELINE", timeline.length === events.length && timeline[0].seq === 1, { timeline });

  // ── J-CHECKPOINT ────────────────────────────────────────────────────────
  const cp = await journal.checkpoint("grpJ1", "auditor", "idn_j1", new Date().toISOString());
  check("J-CHECKPOINT", cp.seq === 2 && cp.headHash === events[1].hash, cp);
  const v2 = await journal.verify("grpJ1");
  check("J-CHECKPOINT-REVERIFY", v2.intact === true, v2);

  // ── J-CHECKPOINT-NOPOOL : sans pool vérificateur, refus explicite ──────
  let noPoolCode = null;
  try {
    await journalNoVerifier.checkpoint("grpJ1", "auditor", "idn_j1", new Date().toISOString());
  } catch (e) { noPoolCode = e && e.code ? e.code : String(e); }
  check("J-CHECKPOINT-NOPOOL", noPoolCode === "RESERVATION_INCOHERENTE", { noPoolCode });

  // ── J-TAMPER : copie altérée détectée, original intact ─────────────────
  const tampered = journal.tamperCopyOf(events, 1, 999999);
  const tamperResult = journal.verifyCopy(tampered);
  check("J-TAMPER-DETECTED", tamperResult.intact === false && tamperResult.error === "EVENT_HASH_MISMATCH", tamperResult);
  const v3 = await journal.verify("grpJ1");
  check("J-ORIGINAL-UNCHANGED", v3.intact === true, v3);

  // ── J-REBUILD : réconciliation contre validated_net RÉEL (0, pas encore validé) ─
  const rebuild = await journal.rebuild("grpJ1");
  check("J-REBUILD", rebuild.projectionMatches === true && rebuild.throughSeq === 2, rebuild);

  await pool.end();
  await verifierPool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgJournalStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgJournalStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
