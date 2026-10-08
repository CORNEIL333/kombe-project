// KÓMBE @kombe/api — preuve base réelle du store PostgreSQL C10 (litiges).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgValidationStore.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED
// (exit 2), jamais simulé. Déclare une VRAIE cotisation (PgContributionStore)
// pour avoir un déclarant réellement impliqué, puis exerce PgDisputeStore
// contre de VRAIES transactions Postgres :
//
//   D-OPEN               : dossier réellement inséré, motif+correction posés.
//   D-COMMON-VIEW-NO-PRIVATE : listCommon ne porte JAMAIS le motif privé.
//   D-INDEPENDENCE        : désigner le déclarant impliqué comme résolveur est
//                           refusé (garde pure + trigger DB en profondeur) ;
//                           un indépendant passe.
//   D-RESOLVE-NO-AMOUNT   : la résolution ne porte aucun champ monétaire —
//                           vérifié structurellement sur la ligne réelle.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgDisputeStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgDisputeStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgContributionStore, PgValidationStore, PgDisputeStore, DomainError;
try {
  ({ PgContributionStore } = await import(pathToFileURL(resolve(distRoot, "db/pgContributionStore.js")).href));
  ({ PgValidationStore } = await import(pathToFileURL(resolve(distRoot, "db/pgValidationStore.js")).href));
  ({ PgDisputeStore } = await import(pathToFileURL(resolve(distRoot, "db/pgDisputeStore.js")).href));
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
];
const UP = [
  "provision/roles_create.sql", "migrations/0001_init.sql", "migrations/0002_role_change.sql",
  "migrations/0003_access.sql", "migrations/0004_group_governance.sql", "migrations/0005_rules_engine.sql",
  "migrations/0006_cycle_schedule.sql", "migrations/0007_event_journal.sql",
  "migrations/0008_contribution_idempotency.sql", "migrations/0009_contribution_validation.sql",
  "migrations/0010_dispute_cases.sql", "migrations/0011_disbursement.sql", "migrations/0012_proposal.sql",
  "migrations/0013_outbox.sql", "migrations/0014_support_security.sql", "migrations/0015_export_manifest.sql",
  "migrations/0016_privacy_law.sql", "migrations/0017_pilot_metrics.sql",
  "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "migrations/0023_worker_discovery.sql", "provision/roles.sql",
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

  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_decl'),('idn_raiser'),('idn_indep'),('idn_coord') ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpD','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_decl','grpD','idn_decl','active') ON CONFLICT DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_d1','grpD',1) ON CONFLICT DO NOTHING;
  `);

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const contrib = new PgContributionStore(pool);
  const val = new PgValidationStore(pool);
  const disp = new PgDisputeStore(pool);

  await contrib.seedObligation("grpD", "ob_d1", "rnd_d1", "mem_decl", 50000n);
  const declCtx = {
    actorIdentityId: "idn_decl", actorRole: "treasurer", actorGroupIds: ["grpD"],
    idempotencyKey: "kd1", expectedVersion: 1, serverDate: "2026-10-07", commandId: "cmd-kd1",
  };
  await contrib.declare("grpD", declCtx, { obligationId: "ob_d1", amountMinor: 20000n, channel: "cash", allegedDate: "2026-10-07" });
  // `declarant_identity_id` n'est PAS posé par `PgContributionStore.declare`
  // lui-même (lacune d'intégration réelle, signalée au rapport) : posé ici
  // comme le ferait la route réelle une fois câblée (même mécanisme que
  // `pgValidationStore.proof.mjs`), pour que l'indépendance du résolveur ait
  // un déclarant réel à vérifier contre.
  await val.seedDeclarantAndThreshold("grpD", "ob_d1:cmd-kd1", "idn_decl", 0);

  const raiser = { identityId: "idn_raiser", role: "member", groupIds: ["grpD"] };
  // Désigner des résolveurs est un acte `dispute.resolve` (secretary/treasurer
  // seulement, matrice d'autorisation) — DISTINCT du rôle `member` du levant,
  // qui ne porte que `dispute.raise`. L'indépendance se vérifie PAR OBJET une
  // fois ce premier filtre de rôle franchi (le rôle ouvre la porte, l'objet
  // la ferme — commentaire disputes.ts).
  const coordinator = { identityId: "idn_coord", role: "secretary", groupIds: ["grpD"] };

  // ── D-OPEN ────────────────────────────────────────────────────────────────
  const openInput = {
    disputeId: "disp-1", groupId: "grpD", obligationId: "ob_d1", category: "ordinary",
    raisedBy: "idn_raiser", reason: "Montant incorrect selon moi", requestedCorrection: "Revoir le montant declare",
    involvedIdentityIds: [], notifiedAt: 1759795200, raisedAt: 1759795200,
  };
  const opened = await disp.open("grpD", raiser, openInput);
  check("D-OPEN", opened.disputeId === "disp-1" && opened.state === "open" && opened.requestedCorrection === openInput.requestedCorrection, { opened });

  // ── D-COMMON-VIEW-NO-PRIVATE ─────────────────────────────────────────────
  const commonList = await disp.listCommon("grpD", raiser);
  const commonKeys = commonList.length ? Object.keys(commonList[0]) : [];
  check("D-COMMON-VIEW-NO-PRIVATE", !commonKeys.includes("reason") && !commonKeys.includes("requestedCorrection") && !commonKeys.includes("raisedBy"), { commonKeys, commonList });

  // ── D-INDEPENDENCE ────────────────────────────────────────────────────────
  // `version` (xmin) n'est pas exposée par `view()` (vue métier) : relue
  // directement pour piloter le test, comme un client HTTP la lirait depuis
  // un en-tête de réponse dédié (hors scope de ce store).
  async function currentVersion() {
    const r = await migrator.query(`SELECT xmin::text::bigint AS v FROM dispute WHERE dispute_id='disp-1'`);
    return Number(r.rows[0].v);
  }
  const v0 = await currentVersion();
  let declRefusedCode = null;
  try {
    await disp.assignResolvers("grpD", coordinator, "disp-1", ["idn_decl"], v0);
  } catch (e) {
    declRefusedCode = e instanceof DomainError ? e.code : String(e);
  }
  check("D-INDEPENDENCE-DECLARANT-REFUSED", declRefusedCode === "DISPUTE_RESOLVER_NOT_INDEPENDENT", { declRefusedCode });

  const v1 = await currentVersion();
  const assigned = await disp.assignResolvers("grpD", coordinator, "disp-1", ["idn_indep"], v1);
  check("D-INDEPENDENCE-INDEP-ACCEPTED", assigned.record.resolverIdentityIds.includes("idn_indep"), { assigned });

  // ── D-RESOLVE-NO-AMOUNT ───────────────────────────────────────────────────
  const resolver = { identityId: "idn_indep", role: "secretary", groupIds: ["grpD"] };
  const resolved = await disp.resolve("grpD", resolver, "disp-1", "Montant verifie et confirme correct", 1759881600, assigned.version);
  const resolvedKeys = Object.keys(resolved.record);
  const hasAmountField = resolvedKeys.some((k) => /amount|montant/i.test(k));
  check("D-RESOLVE-NO-AMOUNT", resolved.record.state === "resolved" && resolved.record.outcome.length > 0 && !hasAmountField, {
    resolvedKeys, state: resolved.record.state, outcome: resolved.record.outcome,
  });
  // Vérification structurelle directe sur la ligne réelle (pas seulement le DTO applicatif).
  const rawRow = await migrator.query(`SELECT * FROM dispute WHERE dispute_id='disp-1'`);
  const rawCols = Object.keys(rawRow.rows[0] ?? {});
  check("D-RESOLVE-NO-AMOUNT-COLUMN", !rawCols.some((c) => /amount|montant/i.test(c)), { rawCols });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgDisputeStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgDisputeStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
