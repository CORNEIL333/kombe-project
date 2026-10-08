// KÓMBE @kombe/api — preuve base réelle du store `PgMetricsStore` (C18 ;
// migration `0017_pilot_metrics`). Script de recette RÉEL (pas vitest/mock),
// même méthode que serverRealMode.proof.mjs / pgContributionStore.proof.mjs.
// Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2), jamais simulé.
//
// Exerce le serveur Fastify RÉEL construit par buildApp({ pool, emailSender })
// via `.inject()` contre de VRAIES transactions Postgres. Chaque vérification
// prouve une PERSISTANCE ou une DÉCISION réelle (aucune donnée en mémoire) :
//
//   M-ANALYTICS-TRACK  : POST /v1/metrics/analytics/events (groupId porté) →
//                        201, événement daté SERVEUR, écrit en base.
//   M-ANALYTICS-REJECT : propriété financière individuelle (montant) → 422
//                        METRICS_CHAMPS_FINANCIER_INDIVIDUEL (domaine, avant écriture).
//   M-FUNNEL           : GET /v1/metrics/analytics/funnel/:cohortId?groupId →
//                        individualFinancialFields = 0 (C18-ANALYTICS), étapes relues.
//   M-FUNNEL-NOGROUP   : même route SANS groupId → 422 METRICS_IDENTIFIANT_REQUIS
//                        (le store RÉEL exige le groupe porteur ; RLS + FK NOT NULL).
//   M-COHORT-UPSERT    : POST /v1/metrics/cohorts 10 membres / 30 tours → 3 cycles,
//                        éligible trois cycles (C18-COHORT).
//   M-COHORT-GET       : GET /v1/metrics/cohorts/:groupId RELIT la ligne persistée.
//   M-COHORT-404       : cohorte inconnue → 404 RESERVATION_INCOHERENTE (non-divulguant).
//   M-ECONOMICS        : POST /v1/metrics/economics 2 payants / 10 exposés → 20 % < 25 %
//                        ⇒ gateG2Met false, coûts XAF entiers en chaînes (C18-PAYERS).
//   M-RISK             : POST /v1/metrics/risks critique SANS contrôle → 201.
//   M-EXTENSION        : GET /v1/metrics/extension-check → extensionAllowed false,
//                        criticalWithoutControl contient le risque (registre RÉEL relu).
//   M-PERSIST          : comptage SQL DIRECT (analytics_event/pilot_cohort/pilot_risk)
//                        → les lignes existent physiquement en base (anti-simulation).
//
// DESTRUCTIF (DOWN puis UP des migrations) : à exécuter sur la branche PREVIEW
// Neon uniquement, JAMAIS sur production.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/pgMetricsStore.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgMetricsStore", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
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

// En-têtes d'acteur (résolution serveur fictive de l'acteur, comme metrics.test.ts) :
// les routes C18 authentifient l'acteur via `x-actor` ; la PERSISTANCE, elle, est réelle.
function h(identityId) {
  return {
    "content-type": "application/json",
    "x-actor": JSON.stringify({ handle: identityId, role: "member", identityId, groupIds: ["grpM"] }),
    "x-server-date": "2026-10-07T10:00:00Z",
  };
}

try {
  await migrator.query(`
    DO $$ BEGIN
      UPDATE "group" SET state = 'closed'
        WHERE state NOT IN ('configuration','active','paused','closed');
      UPDATE vote SET state = 'closed'
        WHERE state NOT IN ('open','closed','cancelled');
      DELETE FROM verification_token
        WHERE purpose NOT IN ('registration','recovery');
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
  `);

  const DOWN = [
    "migrations/0021_privacy_restore_points.down.sql", "migrations/0020_group_resolvers.down.sql", "migrations/0019_token_security.down.sql", "migrations/0018_session_resolver.down.sql", "migrations/0017_pilot_metrics.down.sql",
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
    "migrations/0018_session_resolver.sql", "migrations/0019_token_security.sql", "migrations/0020_group_resolvers.sql", "migrations/0021_privacy_restore_points.sql", "provision/roles.sql",
  ];
  for (const f of UP) await runSql(migrator, f);

  // ── Fixtures : groupe porteur (FK "group" pour analytics_event/pilot_cohort) ──
  await migrator.query(`
    INSERT INTO "group" (group_id, state) VALUES ('grpM','active') ON CONFLICT DO NOTHING;
  `);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const app = buildApp({ pool, emailSender: new NullEmailSender() });
  const inject = (opts) => app.inject(opts);

  // ── M-ANALYTICS-TRACK : écrit un événement RÉEL scopé par groupe ──────────
  const trackRes = await inject({
    method: "POST", url: "/v1/metrics/analytics/events", headers: h("membre_m"),
    payload: { cohortId: "cM", groupId: "grpM", step: "demarrage", properties: { source: "onboarding" } },
  });
  const tracked = trackRes.json();
  check(
    "M-ANALYTICS-TRACK",
    trackRes.statusCode === 201 && tracked.cohortId === "cM" && tracked.step === "demarrage" &&
      tracked.occurredAt === Math.floor(Date.parse("2026-10-07T10:00:00Z") / 1000),
    { status: trackRes.statusCode, body: tracked },
  );

  // ── M-ANALYTICS-REJECT : champ financier individuel refusé (422) ──────────
  const rejectRes = await inject({
    method: "POST", url: "/v1/metrics/analytics/events", headers: h("membre_m"),
    payload: { cohortId: "cM", groupId: "grpM", step: "premiere_contribution", properties: { montant: 5000 } },
  });
  check(
    "M-ANALYTICS-REJECT",
    rejectRes.statusCode === 422 && rejectRes.json().code === "METRICS_CHAMPS_FINANCIER_INDIVIDUEL",
    { status: rejectRes.statusCode, body: rejectRes.json() },
  );

  // Deux étapes supplémentaires pour l'entonnoir.
  for (const step of ["visite", "premiere_validation"]) {
    await inject({
      method: "POST", url: "/v1/metrics/analytics/events", headers: h("membre_m"),
      payload: { cohortId: "cM", groupId: "grpM", step, properties: { n: 1 } },
    });
  }

  // ── M-FUNNEL : entonnoir RELU depuis la base, sans champ individuel ───────
  const funnelRes = await inject({
    method: "GET", url: "/v1/metrics/analytics/funnel/cM?groupId=grpM", headers: h("membre_m"),
  });
  const funnel = funnelRes.json();
  const demarrage = (funnel.steps ?? []).find((s) => s.step === "demarrage");
  check(
    "M-FUNNEL",
    funnelRes.statusCode === 200 && funnel.individualFinancialFields === 0 && demarrage && demarrage.count >= 1,
    { status: funnelRes.statusCode, body: funnel },
  );

  // ── M-FUNNEL-NOGROUP : le store RÉEL exige le groupe porteur (422) ────────
  const noGroupRes = await inject({
    method: "GET", url: "/v1/metrics/analytics/funnel/cM", headers: h("membre_m"),
  });
  check(
    "M-FUNNEL-NOGROUP",
    noGroupRes.statusCode === 422 && noGroupRes.json().code === "METRICS_IDENTIFIANT_REQUIS",
    { status: noGroupRes.statusCode, body: noGroupRes.json() },
  );

  // ── M-COHORT-UPSERT : 10 membres / 30 tours → 3 cycles, éligible ──────────
  const upsertRes = await inject({
    method: "POST", url: "/v1/metrics/cohorts", headers: h("membre_m"),
    payload: { groupId: "grpM", memberCount: 10, roundsCompleted: 30 },
  });
  const upsert = upsertRes.json();
  check(
    "M-COHORT-UPSERT",
    upsertRes.statusCode === 201 && upsert.completedCycles === 3 && upsert.eligibleThreeCycleRetention === true,
    { status: upsertRes.statusCode, body: upsert },
  );

  // ── M-COHORT-GET : RELIT la ligne persistée (pas un cache en mémoire) ─────
  const getCohortRes = await inject({
    method: "GET", url: "/v1/metrics/cohorts/grpM", headers: h("membre_m"),
  });
  const got = getCohortRes.json();
  check(
    "M-COHORT-GET",
    getCohortRes.statusCode === 200 && got.memberCount === 10 && got.roundsCompleted === 30 && got.completedCycles === 3,
    { status: getCohortRes.statusCode, body: got },
  );

  // ── M-COHORT-404 : cohorte inconnue → 404 non-divulguant ──────────────────
  const notFoundRes = await inject({
    method: "GET", url: "/v1/metrics/cohorts/grpInconnu", headers: h("membre_m"),
  });
  check(
    "M-COHORT-404",
    notFoundRes.statusCode === 404 && notFoundRes.json().code === "RESERVATION_INCOHERENTE",
    { status: notFoundRes.statusCode, body: notFoundRes.json() },
  );

  // ── M-ECONOMICS : calcul RÉEL (2/10 = 20 % < 25 % ⇒ G2 non atteinte) ──────
  const econRes = await inject({
    method: "POST", url: "/v1/metrics/economics", headers: h("membre_m"),
    payload: {
      exposedMembers: 10, paidCount: 2, promisedCount: 5, supportMinutes: 120,
      supportCostPerMinuteMinor: "50", infrastructureCostMinor: "10000", cancellations: 1, taxesMinor: "500",
    },
  });
  const econ = econRes.json();
  check(
    "M-ECONOMICS",
    econRes.statusCode === 200 && econ.realPayers === 2 && econ.paymentRealPercent === 20 &&
      econ.gateG2Met === false && econ.supportCostMinor === "6000" && econ.totalCostMinor === "16500",
    { status: econRes.statusCode, body: econ },
  );

  // ── M-RISK : risque critique SANS contrôle effectif, enregistré en base ───
  const riskRes = await inject({
    method: "POST", url: "/v1/metrics/risks", headers: h("membre_m"),
    payload: {
      riskId: "R-M-CRIT", severity: "critique", probabilityPercent: 60, impactPercent: 80,
      control: "", evidenceRef: "", owner: "", reviewedAt: "2026-10-01",
    },
  });
  check("M-RISK", riskRes.statusCode === 201 && riskRes.json().riskId === "R-M-CRIT", {
    status: riskRes.statusCode, body: riskRes.json(),
  });

  // ── M-EXTENSION : verdict RELU depuis pilot_risk (GET, forme dashboard) ───
  const extRes = await inject({ method: "GET", url: "/v1/metrics/extension-check", headers: h("membre_m") });
  const ext = extRes.json();
  check(
    "M-EXTENSION",
    extRes.statusCode === 200 && ext.extensionAllowed === false &&
      Array.isArray(ext.criticalWithoutControl) && ext.criticalWithoutControl.includes("R-M-CRIT"),
    { status: extRes.statusCode, body: ext },
  );

  // ── M-PERSIST : comptage SQL DIRECT — les lignes sont PHYSIQUEMENT en base ─
  const persist = await migrator.query(`
    SELECT
      (SELECT count(*)::int FROM analytics_event WHERE group_id = 'grpM' AND cohort_id = 'cM') AS events,
      (SELECT count(*)::int FROM pilot_cohort WHERE group_id = 'grpM') AS cohorts,
      (SELECT count(*)::int FROM pilot_risk WHERE risk_id = 'R-M-CRIT') AS risks;
  `);
  const p = persist.rows[0];
  check(
    "M-PERSIST",
    Number(p.events) >= 3 && Number(p.cohorts) === 1 && Number(p.risks) === 1,
    { analyticsEvents: p.events, pilotCohorts: p.cohorts, pilotRisks: p.risks },
  );

  await app.close();
  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.pgMetricsStore", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.pgMetricsStore", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
