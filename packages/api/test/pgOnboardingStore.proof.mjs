// KÓMBE @kombe/api — preuve base RÉELLE de l'amorçage tontine persisté (0024).
//
// Script de recette RÉEL (pas vitest/mock), même méthode que les preuves
// précédentes. Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2). Il pilote le
// VRAI PgGovernanceStore compilé (dist) contre PostgreSQL/Neon et vérifie les
// effets en SQL brut — jamais une simulation.
//
//   O-CREATE-PERSIST         : createGroup (nom, modèle, typologie) → colonnes
//                              group réellement écrites (devise XAF, fuseau
//                              Africa/Douala, état configuration).
//   O-CREATE-CURRENCY-REFUSED: devise hors pilote refusée AVANT écriture (0 ligne).
//   O-PARENT-OK / -UNKNOWN / -DEPTH : hiérarchie de supervision (C21) persistée,
//                              parent inconnu refusé, chaîne trop profonde refusée.
//   O-P1-START-REFUSED       : typologie « tirage » créée puis démarrage du cycle
//                              refusé fermé (ROTATION_TYPE_NOT_READY).
//   O-SPONSOR-*              : parrainage (membre actif réel exigé, unicité d'une
//                              demande ouverte, auto-parrainage refusé, décision
//                              horodatée) sous RLS + moindre privilège.
//   O-SPONSOR-RLS-NOGUC/-GUC : isolation multi-tenant du parrainage.
//   O-SPONSOR-NO-DELETE      : kombe_app ne peut DELETE (audit trail conservé).
//   O-DISCOVERABLE           : liste publique filtrée par is_discoverable.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgOnboardingStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgOnboardingStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
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

let PgGovernanceStore, createApiPool;
try {
  ({ PgGovernanceStore } = await import(pathToFileURL(resolve(distRoot, "db/pgGovernanceStore.js")).href));
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

// Exécute `fn`, capture le code d'erreur domaine (`DomainError.code`) ; null si aucune.
async function codeOf(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err && err.code ? String(err.code) : `RAW:${String(err && err.message ? err.message : err)}`;
  }
}

const DOWN = [
  "migrations/0025_member_groups.down.sql", "migrations/0024_group_onboarding.down.sql", "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql",
  "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql",
  "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql", "migrations/0016_privacy_law.down.sql",
  "migrations/0015_export_manifest.down.sql", "migrations/0014_support_security.down.sql", "migrations/0013_outbox.down.sql",
  "migrations/0012_proposal.down.sql", "migrations/0011_disbursement.down.sql", "migrations/0010_dispute_cases.down.sql",
  "migrations/0009_contribution_validation.down.sql", "migrations/0008_contribution_idempotency.down.sql", "migrations/0007_event_journal.down.sql",
  "migrations/0006_cycle_schedule.down.sql", "migrations/0005_rules_engine.down.sql", "migrations/0004_group_governance.down.sql",
  "migrations/0003_access.down.sql", "migrations/0002_role_change.down.sql", "migrations/0001_init.down.sql",
];
const UP = [
  "provision/roles_create.sql", "migrations/0001_init.sql", "migrations/0002_role_change.sql", "migrations/0003_access.sql",
  "migrations/0004_group_governance.sql", "migrations/0005_rules_engine.sql", "migrations/0006_cycle_schedule.sql",
  "migrations/0007_event_journal.sql", "migrations/0008_contribution_idempotency.sql", "migrations/0009_contribution_validation.sql",
  "migrations/0010_dispute_cases.sql", "migrations/0011_disbursement.sql", "migrations/0012_proposal.sql", "migrations/0013_outbox.sql",
  "migrations/0014_support_security.sql", "migrations/0015_export_manifest.sql", "migrations/0016_privacy_law.sql",
  "migrations/0017_pilot_metrics.sql", "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql",
  "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql",
  "migrations/0023_worker_discovery.sql", "migrations/0024_group_onboarding.sql", "migrations/0025_member_groups.sql", "provision/roles.sql",
];

try {
  await migrator.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed' WHERE state NOT IN ('configuration','active','paused','closed');
      UPDATE vote SET state = 'closed' WHERE state NOT IN ('open','closed','cancelled','executed');
      DELETE FROM verification_token WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);
  for (const f of DOWN) await runSql(migrator, f);
  for (const f of UP) await runSql(migrator, f);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const store = new PgGovernanceStore(pool);

  // ── O-CREATE-PERSIST ───────────────────────────────────────────────────────
  const created = await store.createGroup({
    groupId: "grpO1",
    displayName: "Tontine familiale Mbarga",
    tontineModel: "famille",
    rotationType: "rotative_fermee",
  });
  check("O-CREATE-PERSIST-RETURN", created.state === "configuration" && created.tontineModel === "famille" && created.rotationType === "rotative_fermee", { created });
  const g1 = (await migrator.query(`SELECT display_name, tontine_model, rotation_type, currency, timezone, state, parent_group_id FROM "group" WHERE group_id = 'grpO1'`)).rows[0];
  check("O-CREATE-PERSIST-ROW", !!g1 && g1.display_name === "Tontine familiale Mbarga" && g1.tontine_model === "famille" && g1.rotation_type === "rotative_fermee" && g1.currency === "XAF" && g1.timezone === "Africa/Douala" && g1.state === "configuration", { g1 });

  // ── O-CREATE-CURRENCY-REFUSED (garde serveur AVANT écriture) ────────────────
  const curCode = await codeOf(() => store.createGroup({ groupId: "grpBad", currency: "USD" }));
  const badCount = (await migrator.query(`SELECT count(*)::int AS n FROM "group" WHERE group_id = 'grpBad'`)).rows[0].n;
  check("O-CREATE-CURRENCY-REFUSED", curCode === "GROUP_CURRENCY_UNSUPPORTED" && badCount === 0, { curCode, badCount });

  // ── O-PARENT-* (hiérarchie C21) ────────────────────────────────────────────
  await store.createGroup({ groupId: "grpChild", parentGroupId: "grpO1" });
  const child = (await migrator.query(`SELECT parent_group_id FROM "group" WHERE group_id = 'grpChild'`)).rows[0];
  check("O-PARENT-OK", !!child && child.parent_group_id === "grpO1", { child });
  const unknownCode = await codeOf(() => store.createGroup({ groupId: "grpOrphan", parentGroupId: "grpGhost" }));
  check("O-PARENT-UNKNOWN", unknownCode === "GROUP_PARENT_UNKNOWN", { unknownCode });
  // Chaîne profonde : g2←g1, g3←g2, g4←g3, g5←g4 (profondeur 5 OK), g6←g5 (6 → refus).
  let prev = "grpO1";
  const chain = [];
  for (let i = 2; i <= 6; i++) {
    const id = `grpChain${i}`;
    chain.push(await codeOf(() => store.createGroup({ groupId: id, parentGroupId: prev })));
    prev = id;
  }
  check("O-PARENT-DEPTH", chain[3] === null && chain[4] === "GROUP_PARENT_DEPTH_EXCEEDED", { chain });

  // ── O-P1-START-REFUSED (typologie reconnue, non démarrable) ────────────────
  await store.createGroup({ groupId: "grpTir", rotationType: "tirage" });
  const startCode = await codeOf(() => store.startCycle("grpTir"));
  check("O-P1-START-REFUSED", startCode === "ROTATION_TYPE_NOT_READY", { startCode });

  // ── Parrainage : fixtures identité + membre actif parrain ──────────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('idn_sponsor'), ('idn_cand'), ('idn_other') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_sponsor','grpO1','idn_sponsor','active') ON CONFLICT DO NOTHING;
  `);

  // O-SPONSOR-NOT-MEMBER : parrain non membre → refus, aucune ligne.
  const notMemberCode = await codeOf(() => store.requestSponsorship({
    sponsorshipId: "sp_nm", groupId: "grpO1", candidateId: "idn_other", sponsorId: "idn_ghost_x",
  }));
  check("O-SPONSOR-NOT-MEMBER", notMemberCode === "SPONSOR_NOT_ACTIVE_MEMBER", { notMemberCode });

  // O-SPONSOR-SELF : candidate == sponsor → refus.
  const selfCode = await codeOf(() => store.requestSponsorship({
    sponsorshipId: "sp_self", groupId: "grpO1", candidateId: "idn_sponsor", sponsorId: "idn_sponsor",
  }));
  check("O-SPONSOR-SELF", selfCode === "SPONSOR_SELF_FORBIDDEN", { selfCode });

  // O-SPONSOR-OPEN : demande valide persistée 'requested'.
  const sp = await store.requestSponsorship({
    sponsorshipId: "sp_ok", groupId: "grpO1", candidateId: "idn_cand", sponsorId: "idn_sponsor",
  });
  const spRow = (await migrator.query(`SELECT state, decided_at FROM sponsorship WHERE sponsorship_id = 'sp_ok'`)).rows[0];
  check("O-SPONSOR-OPEN", sp.state === "requested" && !!spRow && spRow.state === "requested" && spRow.decided_at === null, { sp, spRow });

  // O-SPONSOR-UNIQUE : seconde demande ouverte même candidat → refus.
  const dupeCode = await codeOf(() => store.requestSponsorship({
    sponsorshipId: "sp_dupe", groupId: "grpO1", candidateId: "idn_cand", sponsorId: "idn_sponsor",
  }));
  check("O-SPONSOR-UNIQUE", dupeCode === "SPONSORSHIP_ALREADY_OPEN", { dupeCode });

  // O-SPONSOR-DECIDE : endossement horodaté.
  const decided = await store.decideSponsorship("grpO1", "sp_ok", "endorsed");
  const decRow = (await migrator.query(`SELECT state, decided_at FROM sponsorship WHERE sponsorship_id = 'sp_ok'`)).rows[0];
  check("O-SPONSOR-DECIDE", decided.state === "endorsed" && !!decRow && decRow.state === "endorsed" && decRow.decided_at !== null, { decided, decRow });

  // O-SPONSOR-REDECIDE : une demande tranchée ne se re-tranche pas.
  const redecode = await codeOf(() => store.decideSponsorship("grpO1", "sp_ok", "rejected"));
  check("O-SPONSOR-REDECIDE", redecode === "SPONSORSHIP_STATE_INVALID", { redecode });

  // ── RLS : la table sponsorship est tenant-scope ────────────────────────────
  const appRaw = new pg.Client({ connectionString: url, options: "-c role=kombe_app" });
  await appRaw.connect();
  const noGuc = (await appRaw.query(`SELECT count(*)::int AS n FROM sponsorship`)).rows[0].n;
  check("O-SPONSOR-RLS-NOGUC", noGuc === 0, { noGuc });
  await appRaw.query("BEGIN");
  await appRaw.query(`SELECT set_config('kombe.group_id', 'grpO1', true)`);
  const withGuc = (await appRaw.query(`SELECT count(*)::int AS n FROM sponsorship`)).rows[0].n;
  await appRaw.query("COMMIT");
  check("O-SPONSOR-RLS-GUC", withGuc === 1, { withGuc });

  // O-SPONSOR-NO-DELETE : moindre privilège (audit trail conservé).
  let delErr = null;
  try {
    await appRaw.query("BEGIN");
    await appRaw.query(`SELECT set_config('kombe.group_id', 'grpO1', true)`);
    await appRaw.query(`DELETE FROM sponsorship WHERE sponsorship_id = 'sp_ok'`);
    await appRaw.query("COMMIT");
  } catch (err) {
    delErr = String(err && err.message ? err.message : err);
    try { await appRaw.query("ROLLBACK"); } catch { /* ignore */ }
  }
  check("O-SPONSOR-NO-DELETE", typeof delErr === "string" && /permission denied|insufficient privilege/i.test(delErr), { delErr });
  await appRaw.end();

  // ── O-DISCOVERABLE : filtré par le drapeau is_discoverable ─────────────────
  await store.createGroup({ groupId: "grpD1", displayName: "Tontine ouverte", tontineModel: "collegues" });
  await store.createGroup({ groupId: "grpD2", displayName: "Tontine privée", tontineModel: "famille" });
  await migrator.query(`UPDATE "group" SET is_discoverable = true WHERE group_id = 'grpD1'`);
  const discoverable = await store.listDiscoverable();
  const ids = discoverable.map((d) => d.groupId).sort();
  const d1 = discoverable.find((d) => d.groupId === "grpD1");
  check("O-DISCOVERABLE", ids.includes("grpD1") && !ids.includes("grpD2") && !!d1 && d1.revealsRegistry === false && d1.groupName === "Tontine ouverte", { ids, d1 });

  // ── O-MYGROUPS : vue MULTI-ADHÉSION serveur C21 §2.5 (listGroupsForMember) ─
  // idn_sponsor est déjà membre actif de grpO1 (mémé); on l'ajoute aussi membre
  // actif de grpChild (enfant de grpO1). Un membre peut être dans plusieurs
  // tontines ; la projection joint membership ⨝ group par identity_id et révèle
  // la hiérarchie parent sans AUCUN champ financier.
  await migrator.query(`
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_sponsor_child','grpChild','idn_sponsor','active') ON CONFLICT DO NOTHING;
  `);
  const mine = await store.listGroupsForMember("idn_sponsor");
  const idsMine = mine.map((m) => m.groupId).sort();
  const childView = mine.find((m) => m.groupId === "grpChild");
  check("O-MYGROUPS-MULTI", idsMine.includes("grpO1") && idsMine.includes("grpChild"), { idsMine });
  check(
    "O-MYGROUPS-HIERARCHY",
    !!childView && childView.parentGroupId === "grpO1" && childView.membershipState === "active" && childView.groupState === "configuration",
    { childView },
  );
  // Aucune donnée financière exposée (champs strictement bornés à la projection).
  const fieldKeys = childView ? Object.keys(childView).sort() : [];
  check(
    "O-MYGROUPS-NO-MONEY",
    JSON.stringify(fieldKeys) === JSON.stringify(["displayName", "groupId", "groupState", "membershipState", "parentGroupId", "rotationType", "tontineModel"]),
    { fieldKeys },
  );
  // Isolation serveur : une identité sans adhésion ne voit aucune tontine.
  const noneForMember = await store.listGroupsForMember("idn_ghost_zzz");
  check("O-MYGROUPS-ISOLATION", Array.isArray(noneForMember) && noneForMember.length === 0, { noneForMember });

  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(JSON.stringify({ target: "kombe.api.pgOnboardingStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n");
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(JSON.stringify({ target: "kombe.api.pgOnboardingStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n");
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
