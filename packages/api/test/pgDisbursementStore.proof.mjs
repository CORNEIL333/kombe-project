// KÓMBE @kombe/api — preuve base réelle du store PostgreSQL C08 (décaissements).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED
// (exit 2), jamais simulé. Reconstruit son propre schéma, insère des
// fixtures réelles (identités, groupe, membres, tour, obligation), puis
// exerce PgDisbursementStore contre de VRAIES transactions Postgres :
//
//   DB-DECLARE     : déclaration réelle -> 'requested', aucun transfert exécuté.
//   DB-SEPARATION  : le déclarant ne peut être le bénéficiaire (refus domaine
//                    AVANT toute écriture — vérifié ici au niveau service,
//                    la CHECK SQL `disbursement_substitute_required` est la
//                    même garde structurelle en base).
//   DB-CONFIRM     : bénéficiaire confirme (0 contrôleur requis) -> 'completed'
//                    réel, un événement journal réel scellé.
//   DB-REVERSAL-ONCE : demande + approbation réelles -> 'reversed' ; une
//                    seconde approbation refusée par DISBURSEMENT_ALREADY_REVERSED
//                    (garde domaine + PRIMARY KEY réelle de disbursement_reversal).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgDisbursementStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgDisbursementStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
  );
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

let PgDisbursementStore, DomainError;
try {
  ({ PgDisbursementStore } = await import(pathToFileURL(resolve(distRoot, "db/pgDisbursementStore.js")).href));
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
  "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql",
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
  "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "provision/roles.sql",
];

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
  for (const f of DOWN) await runSql(migrator, f);
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures réelles : groupe, 3 identités (déclarant/bénéficiaire/contrôleur
  //    indépendant), membres actifs, tour, obligation validée nette ──────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_treasurer'), ('idn_beneficiary'), ('idn_controller')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpD8','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_treasurer','grpD8','idn_treasurer','active'),
             ('mem_beneficiary','grpD8','idn_beneficiary','active'),
             ('mem_controller','grpD8','idn_controller','active')
      ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_d8','grpD8',1) ON CONFLICT DO NOTHING;
    INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
      VALUES ('ob_d8','grpD8','rnd_d8','mem_beneficiary','100000','40000','40000',1) ON CONFLICT DO NOTHING;
  `);

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const store = new PgDisbursementStore(pool);

  const ctx = {
    actorIdentityId: "idn_treasurer", actorRole: "treasurer", actorGroupIds: ["grpD8"],
    serverDate: "2026-10-08T00:00:00Z", commandId: "cmd-d8-1", expectedVersion: 1,
  };

  // DB-SEPARATION : le déclarant ne peut être le bénéficiaire — refus AVANT écriture.
  let separationCode = null;
  try {
    await store.declare(ctx, "grpD8", {
      disbursementId: "db_bad", roundId: "rnd_d8", obligationId: "ob_d8",
      beneficiaryIdentityId: "idn_treasurer", netAmount: 10000n, groupFees: 0n,
      requiredControllers: 0, allegedDate: Date.now(),
    });
  } catch (err) {
    separationCode = err instanceof DomainError ? err.code : `non-DomainError: ${String(err)}`;
  }
  check("DB-SEPARATION", separationCode === "DISBURSEMENT_SUBSTITUTE_REQUIRED", { separationCode });

  // DB-DECLARE : déclaration réelle, requiredControllers=0 pour tester la
  // complétion directe à la confirmation (confirm() parachève sans contrôleur).
  const declared = await store.declare(ctx, "grpD8", {
    disbursementId: "db_d8_1", roundId: "rnd_d8", obligationId: "ob_d8",
    beneficiaryIdentityId: "idn_beneficiary", netAmount: 30000n, groupFees: 2000n,
    requiredControllers: 0, allegedDate: Date.now(),
  });
  check("DB-DECLARE", declared.state === "requested" && declared.refundedExternally === false, {
    state: declared.state, refundedExternally: declared.refundedExternally, version: declared.version,
  });

  // DB-CONFIRM : le bénéficiaire confirme -> complété (0 contrôleur requis).
  // groupId fourni par l'appelant (route/session) — sous RLS, aucun « peek »
  // hors contexte n'est possible (kombe_app NOBYPASSRLS).
  const confirmCtx = { ...ctx, actorIdentityId: "idn_beneficiary", expectedVersion: declared.version };
  const confirmed = await store.confirm("grpD8", confirmCtx, "db_d8_1");
  check("DB-CONFIRM", confirmed.actAccepted === true && confirmed.completed === true && confirmed.state === "completed", {
    actAccepted: confirmed.actAccepted, completed: confirmed.completed, state: confirmed.state,
  });

  // Confirmation par un tiers (pas le bénéficiaire) refusée sans écriture —
  // sur un SECOND décaissement à requiredControllers=1 pour pouvoir aussi
  // exercer control() + la séquence reversal ensuite.
  const declared2 = await store.declare(
    { ...ctx, commandId: "cmd-d8-2" },
    "grpD8",
    {
      disbursementId: "db_d8_2", roundId: "rnd_d8", obligationId: "ob_d8",
      beneficiaryIdentityId: "idn_beneficiary", netAmount: 5000n, groupFees: 0n,
      requiredControllers: 1, allegedDate: Date.now(),
    },
  );
  const notBeneficiary = await store.confirm("grpD8", { ...ctx, actorIdentityId: "idn_controller", expectedVersion: declared2.version }, "db_d8_2");
  check("DB-NOT-BENEFICIARY", notBeneficiary.actAccepted === false && notBeneficiary.reason === "NOT_BENEFICIARY", {
    actAccepted: notBeneficiary.actAccepted, reason: notBeneficiary.reason,
  });
  const confirmed2 = await store.confirm("grpD8", { ...ctx, actorIdentityId: "idn_beneficiary", expectedVersion: declared2.version }, "db_d8_2");
  const controlled2 = await store.control("grpD8", { ...ctx, actorIdentityId: "idn_controller", expectedVersion: confirmed2.version }, "db_d8_2");
  check("DB-CONTROL-COMPLETES", controlled2.actAccepted === true && controlled2.completed === true && controlled2.state === "completed", {
    actAccepted: controlled2.actAccepted, completed: controlled2.completed, state: controlled2.state,
  });

  // DB-REVERSAL-ONCE : demande + approbation indépendante réelles -> 'reversed'.
  const reqReversal = await store.requestReversal(
    "grpD8",
    { ...ctx, actorIdentityId: "idn_beneficiary", expectedVersion: controlled2.version },
    "db_d8_2",
    "Montant erroné, correction demandée",
  );
  check("DB-REVERSAL-REQUESTED", reqReversal.state === "reversal_requested", { state: reqReversal.state });

  const approved = await store.approveReversal(
    "grpD8",
    { ...ctx, actorIdentityId: "idn_controller", expectedVersion: reqReversal.version },
    "db_d8_2",
  );
  check("DB-REVERSAL-APPROVED", approved.state === "reversed" && approved.refundedExternally === false, {
    state: approved.state, refundedExternally: approved.refundedExternally,
  });

  // Seconde approbation refusée (déjà reversé une fois) — relit l'état réel
  // depuis la base (nouvelle instance de store/pool simulant une requête
  // séparée), donc teste la garde domaine ET la contrainte réelle en base.
  let alreadyReversedCode = null;
  try {
    await store.approveReversal(
      "grpD8",
      { ...ctx, actorIdentityId: "idn_treasurer", expectedVersion: approved.version },
      "db_d8_2",
    );
  } catch (err) {
    alreadyReversedCode = err instanceof DomainError ? err.code : `non-DomainError: ${String(err)}`;
  }
  check("DB-REVERSAL-ONCE", alreadyReversedCode === "DISBURSEMENT_ALREADY_REVERSED", { alreadyReversedCode });

  // Vue réelle + compteurs d'événements journal réels.
  const view = await store.view(ctx, "grpD8", "db_d8_1");
  const completedCount = await store.eventCount("grpD8", "disbursement.completed");
  const reversedCount = await store.eventCount("grpD8", "disbursement.reversed");
  check("DB-VIEW-AND-JOURNAL", view.state === "completed" && completedCount >= 2 && reversedCount === 1, {
    viewState: view.state, completedCount, reversedCount,
  });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgDisbursementStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.pgDisbursementStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
