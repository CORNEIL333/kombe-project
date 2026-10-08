// KÓMBE @kombe/api — preuve base réelle du store `PgRulesStore` (C04 ;
// migrations `0005_rules_engine`). Script de recette RÉEL (pas vitest/mock),
// même méthode que pgMetricsStore.proof.mjs / serverRealMode.proof.mjs.
// Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2), jamais simulé.
//
// Exerce le serveur Fastify RÉEL construit par buildApp({ pool, emailSender })
// via `.inject()` contre de VRAIES transactions Postgres. Chaque vérification
// prouve une PERSISTANCE ou une DÉCISION réelle (aucune donnée en mémoire) :
//
//   R-LOGIN           : connexion RÉELLE (lien magique → code NullEmailSender →
//                       sessionId) : en mode réel l'identité vient de la SESSION,
//                       jamais de `x-actor` (§14).
//   R-PUBLISH-NOAUTH  : publication avec en-têtes FICTIFS seuls (x-actor) →
//                       401 SESSION_INVALID : aucune écriture possible sans session.
//   R-PUBLISH         : POST /v1/groups/:groupId/rule-versions → 201 ; version 1
//                       numérotée par le SERVEUR ; penaltyEnabled=true compilé à
//                       false (pilot) ; snapshot_hash persisté = hash canonique.
//   R-ACCEPT-MISMATCH : acceptation avec hash ERRONÉ → 412
//                       RULE_ACCEPT_HASH_MISMATCH, aucune écriture.
//   R-ACCEPT          : acceptation avec hash EXACT → 201 ; l'accepteur persisté
//                       est l'IDENTITÉ DE SESSION — le `identityId` du corps
//                       (usurpé) est IGNORÉ (§14, vérifié en SQL direct).
//   R-ACCEPT-REPLAY   : rejouer la même acceptation → 201, toujours UNE ligne
//                       (idempotence structurelle, PK).
//   R-PUBLISH-2       : version 2 (contribution 6000) → 201, version 2 en base.
//   R-CHANGE-INCOMPLETE : changement essentiel avec UNE acceptation sur trois
//                       membres actifs ⇒ new_rule_executed = false ; la liste
//                       `concerned` du corps (usurpée) est IGNORÉE — les
//                       concernés sont les membres ACTIFS relus en base.
//   R-CHANGE-COMPLETE : après acceptation des trois membres actifs ⇒ true.
//   R-PENALTY         : demande penaltyEnabled=true → refus pilote
//                       { requested: true, penalty_enabled: false, rejected: true }.
//   R-RECALC          : recalcul du cycle courant : une échéance FUTURE à 5000
//                       passe à la contribution courante 6000 (version bumpée) ;
//                       past_due_changed = false ; vérifié en SQL direct.
//   R-RETRO           : une échéance PASSÉE modifiée ⇒ 409 RULE_RETROACTIVE
//                       AVANT toute écriture (montant et version inchangés en SQL).
//   R-404             : version inconnue → 404 RESERVATION_INCOHERENTE (non-divulguant).
//   R-PERSIST         : comptage SQL DIRECT (rule_version/rules_acceptance) →
//                       EXACTEMENT les lignes attendues (401/412/409 n'ont rien écrit).
//
// DESTRUCTIF (DOWN puis UP des migrations) : à exécuter sur la branche PREVIEW
// Neon uniquement, JAMAIS sur production.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgRulesStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgRulesStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
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

let buildApp, createApiPool, NullEmailSender;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
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

// En mode RÉEL, l'authentification est la SESSION (`Authorization: Bearer`).
// Les en-têtes `x-actor`/`x-server-date` sont FICTIFS : présents uniquement
// pour prouver qu'ils sont IGNORÉS (§14 identité, §27 horloge).
const spoof = {
  "x-actor": JSON.stringify({ handle: "spoof", role: "treasurer", identityId: "spoof@example.test", groupIds: ["grpR4"] }),
  "x-server-date": "2020-01-01T00:00:00Z",
};
function headers(sessionId, extra = {}) {
  return { "content-type": "application/json", authorization: `Bearer ${sessionId}`, ...extra };
}

try {
  await migrator.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed'
        WHERE state NOT IN ('configuration','active','paused','closed');
      -- 'executed' (C09) est terminal : conversion -> closed par 0012.down
      -- (apres son DROP TRIGGER) ; ici le trigger vote_transition est actif.
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled','executed');
      DELETE FROM verification_token
        WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);

  const DOWN = [
    "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures : groupe porteur, trois identités ACTIVES membres (rôles
  //    acceptés : préalable de resolveGroupActor), comptes actifs (login réel).
  //    AUCUNE règle pré-publiée : la version 1 naît de la route (chaîne 5.2).
  await migrator.query(`
    INSERT INTO identity (identity_id)
      VALUES ('r_dirigeant@example.test'), ('r_membre2@example.test'), ('r_membre3@example.test')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpR4','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_r4_a','grpR4','r_dirigeant@example.test','active'),
             ('mem_r4_b','grpR4','r_membre2@example.test','active'),
             ('mem_r4_c','grpR4','r_membre3@example.test','active') ON CONFLICT DO NOTHING;
    INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
      VALUES ('ra_r4_a','grpR4','mem_r4_a','treasurer', now()),
             ('ra_r4_b','grpR4','mem_r4_b','member', now()),
             ('ra_r4_c','grpR4','mem_r4_c','member', now()) ON CONFLICT DO NOTHING;
    INSERT INTO identity_access (identity_id, state, channel_verified)
      VALUES ('r_dirigeant@example.test','active',true),
             ('r_membre2@example.test','active',true),
             ('r_membre3@example.test','active',true)
      ON CONFLICT (identity_id) DO NOTHING;
  `);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const nullSender = new NullEmailSender();
  const app = buildApp({ pool, emailSender: nullSender });
  const inject = (opts) => app.inject(opts);

  /** Connexion RÉELLE d'une identité active : lien magique → sessionId. */
  async function loginAs(identityId) {
    await inject({ method: "POST", url: "/v1/access/login-requests", payload: { identityId } });
    const m = nullSender.sent.at(-1)?.text.match(/(\d{6})/);
    const res = await inject({
      method: "POST",
      url: "/v1/access/login-completions",
      payload: { identityId, code: m ? m[1] : null },
    });
    return res.json().sessionId;
  }

  const SNAPSHOT_V1 = {
    memberCount: 3, contribution: "5000", rounds: 3, frequency: "monthly",
    dueDay: 5, quorum: { numerator: 2, denominator: 3 }, gracePeriodDays: 3,
    penaltyEnabled: true, // compilé pilote → false
  };

  // ── R-LOGIN : session RÉELLE (préalable de toutes les preuves §14) ────────
  const sessionA = await loginAs("r_dirigeant@example.test");
  check("R-LOGIN", typeof sessionA === "string" && sessionA.length === 36, {
    sessionIdLength: typeof sessionA === "string" ? sessionA.length : null,
  });

  // ── R-PUBLISH-NOAUTH : x-actor seul (aucune session) → 401, rien écrit ────
  const noAuthRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions",
    headers: { "content-type": "application/json", ...spoof },
    payload: { snapshot: SNAPSHOT_V1 },
  });
  check(
    "R-PUBLISH-NOAUTH",
    noAuthRes.statusCode === 401 && noAuthRes.json().code === "SESSION_INVALID",
    { status: noAuthRes.statusCode, body: noAuthRes.json() },
  );

  // ── R-PUBLISH : version 1 numérotée serveur, pénalités forcées false ──────
  const pub1Res = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions",
    headers: headers(sessionA), payload: { snapshot: SNAPSHOT_V1 },
  });
  const pub1 = pub1Res.json();
  check(
    "R-PUBLISH",
    pub1Res.statusCode === 201 && pub1.version === 1 && pub1.penaltyEnabled === false &&
      typeof pub1.hash === "string" && /^[0-9a-f]{64}$/.test(pub1.hash),
    { status: pub1Res.statusCode, body: pub1 },
  );
  const persisted1 = await migrator.query(`
    SELECT snapshot_hash, snapshot->>'contribution' AS contribution,
           snapshot->>'penaltyEnabled' AS penalty
    FROM rule_version WHERE group_id = 'grpR4' AND rules_version = 1
  `);
  check(
    "R-PUBLISH-SQL",
    persisted1.rows.length === 1 && persisted1.rows[0].snapshot_hash === pub1.hash &&
      persisted1.rows[0].contribution === "5000" && persisted1.rows[0].penalty === "false",
    { row: persisted1.rows[0] ?? null, hash: pub1.hash },
  );

  // ── R-ACCEPT-MISMATCH : hash ERRONÉ → 412, aucune écriture ────────────────
  const wrongRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions/1/acceptances",
    headers: headers(sessionA),
    payload: { identityId: "r_membre2@example.test", hash: "0".repeat(64) },
  });
  const accCount1 = await migrator.query(`SELECT count(*)::int AS n FROM rules_acceptance WHERE group_id = 'grpR4'`);
  check(
    "R-ACCEPT-MISMATCH",
    wrongRes.statusCode === 412 && wrongRes.json().code === "RULE_ACCEPT_HASH_MISMATCH" &&
      Number(accCount1.rows[0].n) === 0,
    { status: wrongRes.statusCode, body: wrongRes.json(), acceptances: accCount1.rows[0].n },
  );

  // ── R-ACCEPT : hash EXACT → 201 ; l'accepteur est la SESSION (corps ignoré) ─
  const accRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions/1/acceptances",
    headers: headers(sessionA),
    payload: { identityId: "r_membre2@example.test", hash: pub1.hash }, // usurpé → ignoré
  });
  const accBody = accRes.json();
  const accRow = await migrator.query(
    `SELECT identity_id, rules_version FROM rules_acceptance WHERE group_id = 'grpR4'`,
  );
  check(
    "R-ACCEPT",
    accRes.statusCode === 201 && accBody.identityId === "r_dirigeant@example.test" &&
      accRow.rows.length === 1 && accRow.rows[0].identity_id === "r_dirigeant@example.test" &&
      accRow.rows[0].rules_version === 1,
    { status: accRes.statusCode, body: accBody, rows: accRow.rows },
  );

  // ── R-ACCEPT-REPLAY : même acceptation rejouée → toujours UNE ligne ───────
  const replayRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions/1/acceptances",
    headers: headers(sessionA), payload: { identityId: "r_dirigeant@example.test", hash: pub1.hash },
  });
  const accCountReplay = await migrator.query(
    `SELECT count(*)::int AS n FROM rules_acceptance WHERE group_id = 'grpR4' AND rules_version = 1`,
  );
  check(
    "R-ACCEPT-REPLAY",
    replayRes.statusCode === 201 && Number(accCountReplay.rows[0].n) === 1,
    { status: replayRes.statusCode, acceptances: accCountReplay.rows[0].n },
  );

  // ── R-PUBLISH-2 : changement essentiel (contribution 5000 → 6000) ─────────
  const pub2Res = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions",
    headers: headers(sessionA),
    payload: { snapshot: { ...SNAPSHOT_V1, contribution: "6000", penaltyEnabled: false }, supersedes: 1 },
  });
  const pub2 = pub2Res.json();
  check("R-PUBLISH-2", pub2Res.statusCode === 201 && pub2.version === 2 && pub2.hash !== pub1.hash, {
    status: pub2Res.statusCode, body: pub2,
  });

  // ── R-CHANGE-INCOMPLETE : 1 acceptation sur 3 membres actifs ⇒ false ──────
  const changeIncRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-changes",
    headers: headers(sessionA),
    payload: { version: 2, concerned: ["spoof@example.test"] }, // usurpé → ignoré (base fait foi)
  });
  const changeInc = changeIncRes.json();
  check(
    "R-CHANGE-INCOMPLETE",
    changeIncRes.statusCode === 200 && changeInc.essential === true &&
      changeInc.appliesTo === "next_cycle" && changeInc.new_rule_executed === false,
    { status: changeIncRes.statusCode, body: changeInc },
  );

  // ── Acceptations v2 par les TROIS membres actifs (sessions réelles) ───────
  const sessionB = await loginAs("r_membre2@example.test");
  const sessionC = await loginAs("r_membre3@example.test");
  for (const s of [sessionA, sessionB, sessionC]) {
    const r = await inject({
      method: "POST", url: "/v1/groups/grpR4/rule-versions/2/acceptances",
      headers: headers(s), payload: { identityId: "r_dirigeant@example.test", hash: pub2.hash },
    });
    if (r.statusCode !== 201) {
      check("R-ACCEPT-2-SETUP", false, { status: r.statusCode, body: r.json() });
    }
  }

  // ── R-CHANGE-COMPLETE : les trois membres accepté ⇒ effectif ──────────────
  const changeOkRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-changes",
    headers: headers(sessionA), payload: { version: 2, concerned: ["spoof@example.test"] },
  });
  const changeOk = changeOkRes.json();
  check(
    "R-CHANGE-COMPLETE",
    changeOkRes.statusCode === 200 && changeOk.new_rule_executed === true &&
      changeOk.essential === true,
    { status: changeOkRes.statusCode, body: changeOk },
  );

  // ── R-PENALTY : refus pilote, aucune pénalité imposée ─────────────────────
  const penRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/penalty-requests",
    headers: headers(sessionA), payload: { desired: true },
  });
  const pen = penRes.json();
  check(
    "R-PENALTY",
    penRes.statusCode === 200 && pen.requested === true && pen.penalty_enabled === false && pen.rejected === true,
    { status: penRes.statusCode, body: pen },
  );

  // ── Fixture recalcul : une échéance FUTURE à 5000 (rattachée à la règle) ──
  await migrator.query(`
    INSERT INTO round (round_id, group_id, seq, state, beneficiary_membership_id,
                       due_date_business, due_at_utc, rules_version)
      VALUES ('rnd_r4_1','grpR4',1,'open','mem_r4_b','2026-12-05','2026-12-05T11:00:00Z',2)
      ON CONFLICT DO NOTHING;
    INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
      VALUES ('ob_r4_future','grpR4','rnd_r4_1','mem_r4_b','5000','0','0',1)
      ON CONFLICT DO NOTHING;
  `);

  // ── R-RECALC : échéance future 5000 → 6000 (contribution courante) ────────
  const recalcRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/cycle-recalculations", headers: headers(sessionA),
    payload: {},
  });
  const recalc = recalcRes.json();
  const afterRecalc = await migrator.query(
    `SELECT due_amount::text AS amount, version FROM obligation WHERE obligation_id = 'ob_r4_future'`,
  );
  check(
    "R-RECALC",
    recalcRes.statusCode === 200 && recalc.past_due_changed === false &&
      afterRecalc.rows[0].amount === "6000" && Number(afterRecalc.rows[0].version) === 2,
    { status: recalcRes.statusCode, body: recalc, row: afterRecalc.rows[0] ?? null },
  );

  // ── R-RETRO : échéance PASSÉE modifiée → 409 AVANT écriture ───────────────
  await migrator.query(`
    UPDATE obligation SET due_amount = '5000', version = 2 WHERE obligation_id = 'ob_r4_future';
    UPDATE round SET due_date_business = '2026-01-05', due_at_utc = '2026-01-05T11:00:00Z'
      WHERE round_id = 'rnd_r4_1';
  `);
  const retroRes = await inject({
    method: "POST", url: "/v1/groups/grpR4/cycle-recalculations", headers: headers(sessionA),
    payload: {},
  });
  const afterRetro = await migrator.query(
    `SELECT due_amount::text AS amount, version FROM obligation WHERE obligation_id = 'ob_r4_future'`,
  );
  check(
    "R-RETRO",
    retroRes.statusCode === 409 && retroRes.json().code === "RULE_RETROACTIVE" &&
      afterRetro.rows[0].amount === "5000" && Number(afterRetro.rows[0].version) === 2,
    { status: retroRes.statusCode, body: retroRes.json(), row: afterRetro.rows[0] ?? null },
  );

  // ── R-404 : version inconnue → 404 non-divulguant, rien écrit ─────────────
  const v404Res = await inject({
    method: "POST", url: "/v1/groups/grpR4/rule-versions/99/acceptances",
    headers: headers(sessionA), payload: { identityId: "r_dirigeant@example.test", hash: pub1.hash },
  });
  check(
    "R-404",
    v404Res.statusCode === 404 && v404Res.json().code === "RESERVATION_INCOHERENTE",
    { status: v404Res.statusCode, body: v404Res.json() },
  );

  // ── R-PERSIST : comptage SQL DIRECT — EXACTEMENT les lignes attendues ─────
  const persist = await migrator.query(`
    SELECT
      (SELECT count(*)::int FROM rule_version WHERE group_id = 'grpR4') AS versions,
      (SELECT count(*)::int FROM rules_acceptance WHERE group_id = 'grpR4') AS acceptances,
      (SELECT count(*)::int FROM rules_acceptance WHERE group_id = 'grpR4' AND rules_version = 2) AS acceptances_v2;
  `);
  const p = persist.rows[0];
  check(
    "R-PERSIST",
    Number(p.versions) === 2 && Number(p.acceptances) === 4 && Number(p.acceptances_v2) === 3,
    { versions: p.versions, acceptances: p.acceptances, acceptancesV2: p.acceptances_v2 },
  );

  await app.close();
  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgRulesStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.pgRulesStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
