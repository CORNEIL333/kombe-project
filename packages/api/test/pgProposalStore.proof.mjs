// KÓMBE @kombe/api — preuve base réelle du store PostgreSQL C09 (propositions/votes).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED
// (exit 2), jamais simulé. Reconstruit son propre schéma, insère des
// fixtures réelles (groupe, 3 membres actifs), puis exerce PgProposalStore
// contre de VRAIES transactions Postgres :
//
//   P-OPEN        : électorat scellé = membres actifs RÉELS (lus depuis
//                   `membership`), figé dans `vote_electorate`.
//   P-CAST-ONCE   : un second bulletin du même électeur est refusé
//                   (ALREADY_VOTED, contrainte PRIMARY KEY réelle `ballot`).
//   P-NOT-ELIGIBLE: un non-électeur ne peut voter.
//   P-CLOSE-TALLY : clôture après échéance -> tally réel conforme aux
//                   bulletins réellement insérés, quorum/approved figés en base.
//   P-QUORUM      : participation insuffisante -> approved=false (oracle
//                   voteResult, jamais un chiffre inventé par le client).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgProposalStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgProposalStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
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

let PgProposalStore;
try {
  ({ PgProposalStore } = await import(pathToFileURL(resolve(distRoot, "db/pgProposalStore.js")).href));
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

  // ── Fixtures réelles : groupe, 4 identités dont 3 membres actifs (un
  //    electeur non-membre retiré pour tester P-NOT-ELIGIBLE) ──────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_p1'), ('idn_p2'), ('idn_p3'), ('idn_outsider')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpP9','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_p1','grpP9','idn_p1','active'),
             ('mem_p2','grpP9','idn_p2','active'),
             ('mem_p3','grpP9','idn_p3','active')
      ON CONFLICT DO NOTHING;
  `);

  const pool = new pg.Pool({ connectionString: url, options: "-c role=kombe_app", max: 5 });
  const store = new PgProposalStore(pool);

  const openedAt = Date.now() - 2000; // ouverte il y a 2s
  const ctx = {
    actorIdentityId: "idn_p1", actorRole: "treasurer", actorGroupIds: ["grpP9"],
    serverDate: new Date(openedAt).toISOString(), commandId: "cmd-p9-open", expectedVersion: 1,
  };
  const rules = { quorumNumerator: 2, quorumDenominator: 3, rulesVersion: 1 };

  // P-OPEN : électorat scellé = membres actifs réels (3), jamais un électorat fourni par le client.
  const opened = await store.open(
    ctx, "grpP9",
    { proposalId: "vote_p9_1", subjectKind: "rule_change", subjectRef: "ref-1", reason: "Test réel C09", durationSeconds: 1 },
    rules,
  );
  check("P-OPEN", opened.state === "open" && opened.electorateSize === 3, {
    state: opened.state, electorateSize: opened.electorateSize,
  });

  // P-NOT-ELIGIBLE : un non-électeur ne peut voter.
  const castOutsider = await store.cast(
    { ...ctx, actorIdentityId: "idn_outsider", expectedVersion: opened.version },
    "vote_p9_1", "yes",
  );
  check("P-NOT-ELIGIBLE", castOutsider.voteAccepted === false && castOutsider.reason === "NOT_ELIGIBLE", {
    voteAccepted: castOutsider.voteAccepted, reason: castOutsider.reason,
  });

  // P-CAST-ONCE : un premier vote réussit, un second du même électeur est refusé.
  const cast1 = await store.cast({ ...ctx, actorIdentityId: "idn_p1", expectedVersion: opened.version }, "vote_p9_1", "yes");
  check("P-CAST-FIRST", cast1.voteAccepted === true, { voteAccepted: cast1.voteAccepted });
  const cast1Again = await store.cast({ ...ctx, actorIdentityId: "idn_p1", expectedVersion: cast1.version }, "vote_p9_1", "no");
  check("P-CAST-ONCE", cast1Again.voteAccepted === false && cast1Again.reason === "ALREADY_VOTED", {
    voteAccepted: cast1Again.voteAccepted, reason: cast1Again.reason,
  });

  const cast2 = await store.cast({ ...ctx, actorIdentityId: "idn_p2", expectedVersion: cast1.version }, "vote_p9_1", "yes");

  // Attendre le délai (durationSeconds=1) pour pouvoir clôturer réellement.
  await new Promise((r) => setTimeout(r, 1200));

  // P-CLOSE-TALLY : clôture réelle, tally conforme (2 yes / 0 no / 0 abstain sur 3 électeurs).
  const closed = await store.close({ ...ctx, actorIdentityId: "idn_p1", expectedVersion: cast2.version }, "vote_p9_1");
  check("P-CLOSE-TALLY", closed.tally.yes === 2 && closed.tally.no === 0 && closed.tally.turnout === 2, {
    tally: closed.tally,
  });
  check("P-QUORUM", closed.tally.approved === true, { approved: closed.tally.approved, quorum: closed.tally.quorum });

  // ── Second scrutin : participation insuffisante -> approved=false ───────
  const opened2 = await store.open(
    { ...ctx, commandId: "cmd-p9-open-2" }, "grpP9",
    { proposalId: "vote_p9_2", subjectKind: "rule_change", subjectRef: "ref-2", reason: "Quorum insuffisant", durationSeconds: 1 },
    rules,
  );
  // Un seul "yes" sur 3 électeurs, quorum 2/3 -> non atteint.
  const cast3 = await store.cast({ ...ctx, actorIdentityId: "idn_p1", expectedVersion: opened2.version }, "vote_p9_2", "yes");
  await new Promise((r) => setTimeout(r, 1200));
  const closed2 = await store.close({ ...ctx, actorIdentityId: "idn_p1", expectedVersion: cast3.version }, "vote_p9_2");
  check("P-QUORUM-INSUFFICIENT", closed2.tally.approved === false, { tally: closed2.tally });

  // Journal réel : au moins les événements opened/ballot/closed pour le premier scrutin.
  const openedCount = await store.eventCount("grpP9", "proposal.opened");
  const closedCount = await store.eventCount("grpP9", "proposal.closed");
  check("P-JOURNAL-REAL", openedCount === 2 && closedCount === 2, { openedCount, closedCount });

  // Historique réel : les 2 scrutins clôturés apparaissent (open n'y figure jamais).
  const history = await store.history(ctx, "grpP9");
  check("P-HISTORY", history.length === 2 && history.every((h) => h.state === "closed"), {
    length: history.length, states: history.map((h) => h.state),
  });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgProposalStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.pgProposalStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
