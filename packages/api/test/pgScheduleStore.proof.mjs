// KÓMBE @kombe/api — preuve base réelle du store `PgScheduleStore` (C05 ;
// migrations `0006_cycle_schedule` + `0022_cycle_schedule`). Script de recette
// RÉEL (pas vitest/mock), même méthode que pgRulesStore.proof.mjs /
// serverRealMode.proof.mjs. Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
//
// Exerce le serveur Fastify RÉEL construit par buildApp({ pool, emailSender })
// via `.inject()` contre de VRAIES transactions Postgres. Chaque vérification
// prouve une PERSISTANCE ou une DÉCISION réelle (aucune donnée en mémoire) :
//
//   S-LOGIN            : connexion RÉELLE (lien magique → sessionId) : l'identité
//                        vient de la SESSION, jamais de `x-actor` (§14).
//   S-BUILD-NOAUTH     : construction avec en-têtes FICTIFS seuls → 401, rien écrit.
//   S-BUILD-COUNT      : 2 membres pour une règle à 3 → 422 SCHEDULE_ROUNDS_MISMATCH.
//   S-BUILD-FOREIGN    : membre sans adhésion ACTIVE → 422 SCHEDULE_MEMBER_UNKNOWN.
//   S-BUILD-DUP-ORDER  : bénéficiaire doublé dans l'ordre → 422
//                        SCHEDULE_BENEFICIARY_DUPLICATE (C05-UNIQUE), rien écrit.
//   S-BUILD            : 3 tours / 3 membres, contributions 7000 → 201 ; la
//                        cotisation/fréquence/quantienne viennent de l'INSTANTANÉ
//                        PUBLIÉ (le corps usurpé 999999/weekly/28 est IGNORÉ,
//                        §10/§12) ; dates métier Africa/Douala + UTC persistées.
//   S-GET              : relecture RÉELLE du calendrier persisté (3 tours, 9 obligations).
//   S-REASSIGN-NOOP    : réassignation vers le MÊME bénéficiaire → 200 (no-op pilote).
//   S-REASSIGN-DUP     : réassignation créant un doublon → 422, aucune écriture.
//   S-REASSIGN-OUT     : tour inexistant → 422 SCHEDULE_ROUNDS_MISMATCH.
//   S-START            : démarrage → 201 { state: 'started', rounds: 3 }.
//   S-FROZEN-REBUILD   : toute reconstruction après démarrage → 409 SCHEDULE_FROZEN.
//   S-FROZEN-REASSIGN  : réassignation après démarrage → 409 SCHEDULE_FROZEN.
//   S-GUARD-0022-*     : défense en profondeur — les déclencheurs 0022 REFUSENT
//                        au niveau SQL (méta / tour / obligation d'un cycle démarré).
//   S-DEPART           : départ d'un membre → dette conservée, tours non réduits.
//   S-RENEW-SAME/ESSENTIAL : plan de renouvellement (5.5) — mêmes valeurs ⇒ pas
//                        d'acceptation ; engagement changé ⇒ exigées.
//   S-PERSIST          : comptage SQL DIRECT (round/obligation/cycle_schedule) →
//                        EXACTEMENT l'état attendu ; AUCUNE écriture dans le
//                        groupe usurpé du corps (grpAUTRE).
//
// DESTRUCTIF (DOWN puis UP des migrations) : à exécuter sur la branche PREVIEW
// Neon uniquement, JAMAIS sur production.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgScheduleStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgScheduleStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
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

const spoof = {
  "x-actor": JSON.stringify({ handle: "spoof", role: "treasurer", identityId: "spoof@example.test", groupIds: ["grpS5"] }),
  "x-server-date": "2020-01-01T00:00:00Z",
};
function headers(sessionId, extra = {}) {
  return { "content-type": "application/json", authorization: `Bearer ${sessionId}`, ...extra };
}

const DIRIGEANT = "s_dirigeant@example.test";
const MEMBRE2 = "s_membre2@example.test";
const MEMBRE3 = "s_membre3@example.test";

try {
  await migrator.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed'
        WHERE state NOT IN ('configuration','active','paused','closed');
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled','executed');
      DELETE FROM verification_token
        WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);

  const DOWN = [
    "migrations/0024_group_onboarding.down.sql", "migrations/0023_worker_discovery.down.sql", "migrations/0022_cycle_schedule.down.sql", "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "migrations/0022_cycle_schedule.sql", "migrations/0023_worker_discovery.sql", "migrations/0024_group_onboarding.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures : groupe porteur + une identité ÉTRANGÈRE (compte actif mais
  //    SANS adhésion dans grpS5 : preuve d'autorité serveur des membres),
  //    trois membres actifs avec rôle accepté, comptes actifs (login réel).
  await migrator.query(`
    INSERT INTO identity (identity_id)
      VALUES ('${DIRIGEANT}'), ('${MEMBRE2}'), ('${MEMBRE3}'), ('s_etranger@example.test')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpS5','active') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_s5_a','grpS5','${DIRIGEANT}','active'),
             ('mem_s5_b','grpS5','${MEMBRE2}','active'),
             ('mem_s5_c','grpS5','${MEMBRE3}','active') ON CONFLICT DO NOTHING;
    INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
      VALUES ('ra_s5_a','grpS5','mem_s5_a','treasurer', now()),
             ('ra_s5_b','grpS5','mem_s5_b','member', now()),
             ('ra_s5_c','grpS5','mem_s5_c','member', now()) ON CONFLICT DO NOTHING;
    INSERT INTO identity_access (identity_id, state, channel_verified)
      VALUES ('${DIRIGEANT}','active',true) ON CONFLICT (identity_id) DO NOTHING;
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

  // ── S-LOGIN : session RÉELLE (préalable de toutes les preuves §14) ─────────
  const sessionA = await loginAs(DIRIGEANT);
  check("S-LOGIN", typeof sessionA === "string" && sessionA.length === 36, {
    sessionIdLength: typeof sessionA === "string" ? sessionA.length : null,
  });

  // ── Préalable 5.2 : la règle du cycle est PUBLIÉE (chaîne serveur réelle) ─
  const pubRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/rule-versions",
    headers: headers(sessionA),
    payload: {
      snapshot: {
        memberCount: 3, contribution: "7000", rounds: 3, frequency: "monthly",
        dueDay: 5, quorum: { numerator: 2, denominator: 3 }, gracePeriodDays: 3,
        penaltyEnabled: false,
      },
    },
  });
  check("S-RULE-PUBLISH", pubRes.statusCode === 201 && pubRes.json().version === 1, {
    status: pubRes.statusCode, body: pubRes.json(),
  });

  const BODY_BASE = {
    groupId: "grpAUTRE", // usurpé : le chemin fait foi
    ruleVersion: 1,
    members: [DIRIGEANT, MEMBRE2, MEMBRE3],
    contribution: "999999", // usurpé : l'instantané publié fait foi
    frequency: "weekly", // usurpé
    dueDay: 28, // usurpé
    startYear: 2026,
    startMonth: 11,
    beneficiaryOrder: [MEMBRE3, DIRIGEANT, MEMBRE2],
  };

  // ── S-BUILD-NOAUTH : x-actor seul (aucune session) → 401, rien écrit ──────
  const noAuthRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules",
    headers: { "content-type": "application/json", ...spoof }, payload: BODY_BASE,
  });
  check(
    "S-BUILD-NOAUTH",
    noAuthRes.statusCode === 401 && noAuthRes.json().code === "SESSION_INVALID",
    { status: noAuthRes.statusCode, body: noAuthRes.json() },
  );

  // ── S-BUILD-COUNT : effectif ≠ règle publiée → 422, rien écrit ────────────
  const countRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA),
    payload: { ...BODY_BASE, members: [DIRIGEANT, MEMBRE2], beneficiaryOrder: [DIRIGEANT, MEMBRE2] },
  });
  check(
    "S-BUILD-COUNT",
    countRes.statusCode === 422 && countRes.json().code === "SCHEDULE_ROUNDS_MISMATCH",
    { status: countRes.statusCode, body: countRes.json() },
  );

  // ── S-BUILD-FOREIGN : membre sans adhésion ACTIVE → 422, rien écrit ───────
  const foreignRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA),
    payload: { ...BODY_BASE, members: [DIRIGEANT, MEMBRE2, "s_etranger@example.test"] },
  });
  check(
    "S-BUILD-FOREIGN",
    foreignRes.statusCode === 422 && foreignRes.json().code === "SCHEDULE_MEMBER_UNKNOWN",
    { status: foreignRes.statusCode, body: foreignRes.json() },
  );

  // ── S-BUILD-DUP-ORDER : bénéficiaire doublé → 422 (C05-UNIQUE), rien écrit ─
  const dupRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA),
    payload: { ...BODY_BASE, beneficiaryOrder: [DIRIGEANT, DIRIGEANT, MEMBRE2] },
  });
  check(
    "S-BUILD-DUP-ORDER",
    dupRes.statusCode === 422 && dupRes.json().code === "SCHEDULE_BENEFICIARY_DUPLICATE",
    { status: dupRes.statusCode, body: dupRes.json() },
  );
  const preWrite = await migrator.query(`
    SELECT (SELECT count(*)::int FROM round WHERE group_id = 'grpS5') AS rounds,
           (SELECT count(*)::int FROM obligation WHERE group_id = 'grpS5') AS obligations,
           (SELECT count(*)::int FROM cycle_schedule WHERE group_id = 'grpS5') AS meta;
  `);
  check(
    "S-BUILD-REJECTS-NOWRITE",
    Number(preWrite.rows[0].rounds) === 0 && Number(preWrite.rows[0].obligations) === 0 &&
      Number(preWrite.rows[0].meta) === 0,
    { row: preWrite.rows[0] },
  );

  // ── S-BUILD : autorité SERVEUR — cotisation/fréquence/quantienne de la règle ─
  const buildRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA), payload: BODY_BASE,
  });
  const built = buildRes.json();
  const dueSeq1 = Date.UTC(2026, 10, 5, 11, 0, 0); // 2026-11-05 12:00 Africa/Douala
  check(
    "S-BUILD",
    buildRes.statusCode === 201 && built.groupId === "grpS5" && built.ruleVersion === 1 &&
      built.memberCount === 3 && built.rounds === 3 && built.state === "draft" &&
      built.contribution === "7000" && built.roundPot === "21000" &&
      built.cycleExpectedTotal === "63000" && built.frequency === "monthly" &&
      built.displayTz === "Africa/Douala" &&
      Array.isArray(built.schedule) && built.schedule.length === 3 &&
      built.schedule[0].beneficiaryId === MEMBRE3 && built.schedule[1].beneficiaryId === DIRIGEANT &&
      built.schedule[2].beneficiaryId === MEMBRE2 &&
      built.schedule[0].dueDate === "2026-11-05" && built.schedule[0].dueAtMs === dueSeq1 &&
      built.schedule[0].obligations.length === 3 &&
      built.schedule[0].obligations.every((o) => o.amount === "7000"),
    { status: buildRes.statusCode, body: { ...built, schedule: built.schedule?.length } },
  );

  // ── S-GET : relecture RÉELLE de la vérité persistée ───────────────────────
  const getRes = await inject({
    method: "GET", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA),
  });
  const got = getRes.json();
  check(
    "S-GET",
    getRes.statusCode === 200 && got.rounds === 3 && got.contribution === "7000" &&
      got.state === "draft" && got.schedule.length === 3 &&
      got.schedule[2].dueDate === "2027-01-05",
    { status: getRes.statusCode, rounds: got.rounds, contribution: got.contribution, state: got.state },
  );

  // ── S-REASSIGN-NOOP : même bénéficiaire → no-op accepté (aucune écriture) ──
  const noopRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/rounds/1/beneficiary", headers: headers(sessionA),
    payload: { seq: 1, newBeneficiaryId: MEMBRE3 },
  });
  check(
    "S-REASSIGN-NOOP",
    noopRes.statusCode === 200 && noopRes.json().seq === 1 && noopRes.json().beneficiaryId === MEMBRE3,
    { status: noopRes.statusCode, body: noopRes.json() },
  );

  // ── S-REASSIGN-DUP : changement réel créant un doublon → 422, rien écrit ──
  const reassignDupRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/rounds/2/beneficiary", headers: headers(sessionA),
    payload: { seq: 2, newBeneficiaryId: MEMBRE3 },
  });
  const round2 = await migrator.query(
    `SELECT m.identity_id AS beneficiary FROM round r
     JOIN membership m ON m.group_id = r.group_id AND m.membership_id = r.beneficiary_membership_id
     WHERE r.group_id = 'grpS5' AND r.seq = 2`,
  );
  check(
    "S-REASSIGN-DUP",
    reassignDupRes.statusCode === 422 && reassignDupRes.json().code === "SCHEDULE_BENEFICIARY_DUPLICATE" &&
      round2.rows[0].beneficiary === DIRIGEANT,
    { status: reassignDupRes.statusCode, body: reassignDupRes.json(), beneficiary: round2.rows[0]?.beneficiary },
  );

  // ── S-REASSIGN-OUT : tour inexistant → 422 ─────────────────────────────────
  const outRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/rounds/99/beneficiary", headers: headers(sessionA),
    payload: { seq: 99, newBeneficiaryId: DIRIGEANT },
  });
  check(
    "S-REASSIGN-OUT",
    outRes.statusCode === 422 && outRes.json().code === "SCHEDULE_ROUNDS_MISMATCH",
    { status: outRes.statusCode, body: outRes.json() },
  );

  // ── S-START : gel du cycle (ordre figé, 5.3) ───────────────────────────────
  const startRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedule-starts", headers: headers(sessionA),
    payload: {},
  });
  check(
    "S-START",
    startRes.statusCode === 201 && startRes.json().state === "started" && startRes.json().rounds === 3,
    { status: startRes.statusCode, body: startRes.json() },
  );

  // ── S-FROZEN-REBUILD : reconstruction après démarrage → 409 ───────────────
  const frozenBuildRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/schedules", headers: headers(sessionA), payload: BODY_BASE,
  });
  check(
    "S-FROZEN-REBUILD",
    frozenBuildRes.statusCode === 409 && frozenBuildRes.json().code === "SCHEDULE_FROZEN",
    { status: frozenBuildRes.statusCode, body: frozenBuildRes.json() },
  );

  // ── S-FROZEN-REASSIGN : réassignation après démarrage → 409 ───────────────
  const frozenReassignRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/rounds/1/beneficiary", headers: headers(sessionA),
    payload: { seq: 1, newBeneficiaryId: MEMBRE3 },
  });
  check(
    "S-FROZEN-REASSIGN",
    frozenReassignRes.statusCode === 409 && frozenReassignRes.json().code === "SCHEDULE_FROZEN",
    { status: frozenReassignRes.statusCode, body: frozenReassignRes.json() },
  );

  // ── S-GUARD-0022 : défense en profondeur — la BASE refuse d'écrire un cycle
  //    démarré (méta / tour / obligation), même hors application. ────────────
  const guardResults = {};
  for (const [name, sql] of [
    ["meta", `UPDATE cycle_schedule SET frequency = 'weekly' WHERE group_id = 'grpS5'`],
    ["round", `DELETE FROM round WHERE group_id = 'grpS5'`],
    ["obligation", `DELETE FROM obligation WHERE group_id = 'grpS5'`],
  ]) {
    try {
      await migrator.query(sql);
      guardResults[name] = "ACCEPTÉ (fuite !)";
    } catch (err) {
      guardResults[name] = /SCHEDULE_FROZEN/.test(String(err && err.message ? err.message : err))
        ? "refusé (SCHEDULE_FROZEN)"
        : `refusé (autre : ${String(err && err.message ? err.message : err)})`;
    }
  }
  check(
    "S-GUARD-0022",
    guardResults.meta === "refusé (SCHEDULE_FROZEN)" &&
      guardResults.round === "refusé (SCHEDULE_FROZEN)" &&
      guardResults.obligation === "refusé (SCHEDULE_FROZEN)",
    guardResults,
  );

  // ── S-DEPART : la dette du partant reste affectée, tours non réduits ──────
  const departRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/departures", headers: headers(sessionA),
    payload: { identityId: MEMBRE2 },
  });
  const dep = departRes.json();
  check(
    "S-DEPART",
    departRes.statusCode === 200 && dep.departingId === MEMBRE2 &&
      dep.roundsUnchanged === true && dep.debtReassigned === false && dep.retainedObligations === 3,
    { status: departRes.statusCode, body: dep },
  );

  // ── S-RENEW-SAME : mêmes valeurs → aucun changement essentiel ─────────────
  const renewSameRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/cycle-renewals", headers: headers(sessionA),
    payload: { version: 2, memberCount: 3, contribution: "7000", rounds: 3 },
  });
  const renewSame = renewSameRes.json();
  check(
    "S-RENEW-SAME",
    renewSameRes.statusCode === 200 && renewSame.fromRuleVersion === 1 && renewSame.toRuleVersion === 2 &&
      renewSame.essentialChange === false && renewSame.requiresNewAcceptances === false &&
      renewSame.historyPreserved === true,
    { status: renewSameRes.statusCode, body: renewSame },
  );

  // ── S-RENEW-ESSENTIAL : contribution changée → nouvelles acceptations ─────
  const renewEssRes = await inject({
    method: "POST", url: "/v1/groups/grpS5/cycle-renewals", headers: headers(sessionA),
    payload: { version: 2, memberCount: 3, contribution: "8000", rounds: 3 },
  });
  const renewEss = renewEssRes.json();
  check(
    "S-RENEW-ESSENTIAL",
    renewEssRes.statusCode === 200 && renewEss.essentialChange === true &&
      renewEss.requiresNewAcceptances === true,
    { status: renewEssRes.statusCode, body: renewEss },
  );

  // ── S-PERSIST : comptage SQL DIRECT — état physique EXACT, aucun débordement
  //    dans le groupe usurpé du corps (grpAUTRE). ────────────────────────────
  const persist = await migrator.query(`
    SELECT
      (SELECT count(*)::int FROM round WHERE group_id = 'grpS5') AS rounds,
      (SELECT count(*)::int FROM obligation WHERE group_id = 'grpS5') AS obligations,
      (SELECT DISTINCT due_amount::text FROM obligation WHERE group_id = 'grpS5') AS amounts,
      (SELECT state FROM cycle_schedule WHERE group_id = 'grpS5') AS meta_state,
      (SELECT count(*)::int FROM round WHERE group_id = 'grpS5' AND beneficiary_membership_id IS NULL) AS rounds_without_beneficiary,
      (SELECT count(*)::int FROM round WHERE group_id = 'grpS5' AND (due_date_business IS NULL OR due_at_utc IS NULL)) AS rounds_without_due,
      (SELECT count(*)::int FROM round WHERE group_id = 'grpAUTRE') AS usurped_rounds,
      (SELECT count(*)::int FROM obligation WHERE group_id = 'grpAUTRE') AS usurped_obligations;
  `);
  const p = persist.rows[0];
  check(
    "S-PERSIST-EXACT",
    Number(p.rounds) === 3 && Number(p.obligations) === 9 && String(p.amounts) === "7000" &&
      p.meta_state === "started" && Number(p.rounds_without_beneficiary) === 0 &&
      Number(p.rounds_without_due) === 0 && Number(p.usurped_rounds) === 0 &&
      Number(p.usurped_obligations) === 0,
    { row: p },
  );

  await app.close();
  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgScheduleStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.pgScheduleStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
