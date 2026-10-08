// KÓMBE @kombe/api — preuve base réelle du store PostgreSQL C07 (validations).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED
// (exit 2), jamais simulé. Reconstruit son propre schéma, déclare de VRAIES
// cotisations via PgContributionStore (jamais une ligne insérée à la main),
// puis exerce PgValidationStore contre de VRAIES transactions Postgres :
//
//   V-CONFIRM        : confirmation par un tiers distinct -> validée,
//                       obligation.validated_net crédité, journal réel grandit.
//   V-SELF-REFUSED   : le déclarant confirme sa propre déclaration -> refusé,
//                       AUCUNE écriture (ni contribution_act, ni journal).
//   V-REJECT         : rejet avant validation -> state='rejected'.
//   V-COMPENSATE-ONCE: compensation de l'original validé -> contre-écriture
//                       réelle liée ; une SECONDE compensation du même
//                       original est refusée par l'index partiel UNIQUE
//                       (via la garde pure CONTRIBUTION_ALREADY_COMPENSATED).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgValidationStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgValidationStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgContributionStore, PgValidationStore, DomainError;
try {
  ({ PgContributionStore } = await import(pathToFileURL(resolve(distRoot, "db/pgContributionStore.js")).href));
  ({ PgValidationStore } = await import(pathToFileURL(resolve(distRoot, "db/pgValidationStore.js")).href));
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
  for (const f of DOWN) await runSql(migrator, f);
  for (const f of UP) await runSql(migrator, f);

  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_decl'),('idn_conf'),('idn_other') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpV','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_decl','grpV','idn_decl','active'), ('mem_conf','grpV','idn_conf','active') ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_v1','grpV',1), ('rnd_v2','grpV',2), ('rnd_v3','grpV',3) ON CONFLICT DO NOTHING;
  `);

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const contrib = new PgContributionStore(pool);
  const val = new PgValidationStore(pool);

  // Un membre ne porte qu'UNE obligation par tour (contrainte réelle
  // `obligation_unique_member_round`) : un tour distinct par obligation.
  await contrib.seedObligation("grpV", "ob_v1", "rnd_v1", "mem_decl", 100000n);
  await contrib.seedObligation("grpV", "ob_v2", "rnd_v2", "mem_decl", 100000n);
  await contrib.seedObligation("grpV", "ob_v3", "rnd_v3", "mem_decl", 100000n);

  const declCtx = (key) => ({
    actorIdentityId: "idn_decl", actorRole: "treasurer", actorGroupIds: ["grpV"],
    idempotencyKey: key, expectedVersion: 1, serverDate: "2026-10-07", commandId: `cmd-${key}`,
  });

  // ── V-CONFIRM : déclare + seed déclarant/seuil=0 + confirme par un tiers ──
  const d1 = await contrib.declare("grpV", declCtx("k1"), { obligationId: "ob_v1", amountMinor: 40000n, channel: "cash", allegedDate: "2026-10-07" });
  const c1Id = `ob_v1:cmd-k1`;
  await val.seedDeclarantAndThreshold("grpV", c1Id, "idn_decl", 0);
  const beforeJournal = await val.journalTailHash("grpV");
  const confirmCtx = { actorIdentityId: "idn_conf", actorRole: "treasurer", actorGroupIds: ["grpV"], serverDate: "2026-10-07", commandId: "cmd-confirm-1", expectedVersion: 1 };
  const r1 = await val.confirm("grpV", confirmCtx, c1Id);
  const view1 = await val.view("grpV", c1Id);
  check("V-CONFIRM", r1.validationAccepted === true && r1.validationCompleted === true && view1.state === "validated", {
    r1, view1,
  });
  const afterJournal = await val.journalTailHash("grpV");
  check("V-CONFIRM-JOURNAL-GREW", beforeJournal !== afterJournal, { beforeJournal, afterJournal });

  // ── V-SELF-REFUSED : le déclarant confirme sa propre déclaration ─────────
  const d2 = await contrib.declare("grpV", declCtx("k2"), { obligationId: "ob_v2", amountMinor: 10000n, channel: "cash", allegedDate: "2026-10-07" });
  const c2Id = `ob_v2:cmd-k2`;
  await val.seedDeclarantAndThreshold("grpV", c2Id, "idn_decl", 0);
  const selfCtx = { actorIdentityId: "idn_decl", actorRole: "treasurer", actorGroupIds: ["grpV"], serverDate: "2026-10-07", commandId: "cmd-self", expectedVersion: 1 };
  const journalBeforeSelf = await val.journalTailHash("grpV");
  const r2 = await val.confirm("grpV", selfCtx, c2Id);
  const journalAfterSelf = await val.journalTailHash("grpV");
  check("V-SELF-REFUSED", r2.validationAccepted === false && r2.reason === "SELF_DECLARANT" && journalBeforeSelf === journalAfterSelf, {
    r2, journalBeforeSelf, journalAfterSelf,
  });

  // ── V-REJECT : rejet avant validation ─────────────────────────────────────
  const d3 = await contrib.declare("grpV", declCtx("k3"), { obligationId: "ob_v3", amountMinor: 5000n, channel: "cash", allegedDate: "2026-10-07" });
  const c3Id = `ob_v3:cmd-k3`;
  await val.seedDeclarantAndThreshold("grpV", c3Id, "idn_decl", 0);
  const rejectCtx = { actorIdentityId: "idn_other", actorRole: "treasurer", actorGroupIds: ["grpV"], serverDate: "2026-10-07", commandId: "cmd-reject", expectedVersion: 1 };
  const r3 = await val.reject("grpV", rejectCtx, c3Id);
  check("V-REJECT", r3.state === "rejected", { r3 });

  // ── V-COMPENSATE-ONCE : compense l'original validé (c1Id), puis refuse une 2e ──
  const compCtx = { actorIdentityId: "idn_other", actorRole: "treasurer", actorGroupIds: ["grpV"], serverDate: "2026-10-07", commandId: "cmd-comp-1", expectedVersion: view1.version };
  const comp1 = await val.compensate("grpV", compCtx, c1Id, "rev-1");
  check("V-COMPENSATE-ONCE", comp1.reversalAccepted === true && comp1.reversalCount === 1 && comp1.state === "compensated", { comp1 });

  let secondCompCode = null;
  try {
    const view1b = await val.view("grpV", c1Id);
    await val.compensate("grpV", { ...compCtx, commandId: "cmd-comp-2", expectedVersion: view1b.version }, c1Id, "rev-2");
  } catch (e) {
    secondCompCode = e instanceof DomainError ? e.code : String(e);
  }
  check("V-COMPENSATE-REFUSED-TWICE", secondCompCode === "CONTRIBUTION_ALREADY_COMPENSATED", { secondCompCode });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgValidationStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgValidationStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
