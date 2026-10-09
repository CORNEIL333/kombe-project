// KÓMBE @kombe/api — preuve base réelle du CÂBLAGE server.ts/HTTP en mode
// RÉEL (Piste A3). Script de recette RÉEL (pas vitest/mock), même méthode que
// pgContributionStore.proof.mjs / pgAccessStore.proof.mjs. Sans
// KOMBE_API_DATABASE_URL : BLOCKED (exit 2), jamais simulé.
//
// Exerce le serveur Fastify RÉEL construit par buildApp({ pool, emailSender })
// via `.inject()` (pas de port réseau nécessaire, même app, mêmes routes
// qu'en production) contre de VRAIES transactions Postgres :
//
//   A3-REGISTER     : inscription + vérification par code → compte actif.
//   A3-LOGIN        : lien magique → sessionId RÉEL généré serveur.
//   A3-DECLARE      : POST /v1/groups/:id/declarations avec
//                     Authorization: Bearer <sessionId> RÉEL → 201, événement
//                     scellé en base (journal), capacité réservée.
//   A3-DECLARE-NOAUTH : même route SANS Authorization → 401 SESSION_INVALID.
//   A3-DECLARE-FOREIGN : session valide mais hors du groupe ciblé → 403
//                         FEATURE_PILOT_FORBIDDEN (anti-IDOR, jamais une
//                         divulgation de l'existence de l'obligation).
//   A3-VIEW         : GET /v1/groups/:id/obligations/:id avec la même session
//                     → capacité/restant dû reflètent la déclaration ci-dessus.
//   A3-FICTIF-INTACT : buildApp() SANS pool (mode par défaut) répond encore
//                      au squelette fictif existant — zéro régression.
//
//   A4 (multi-acteur, stores PG réels) : trois sessions RÉELLES (alice
//   trésorière, bob animateur/bénéficiaire, carol membre/contrôleuse) sur la
//   même app :
//     C08 : déclarer → NON-bénéficiaire refusé (sans écriture) → bénéficiaire
//           confirme → contrôle INDÉPENDANT → achevé (versions 1→2→3).
//     C09 : proposition → bulletins (double vote refusé, 200) → clôture
//           EXIGEANT l'échéance franchie par HORLOGE INJECTÉE (+61 s, jamais
//           un sleep) → exécution puis rejeu idempotent (version figée).
//     C12 : export scellé → manifeste → téléchargements PDF/CSV → vérification
//           d'empreinte des octets RÉELS ; groupe étranger → 404.
//     C17 : support JIT double approbation → action lue ; action FINANCIÈRE
//           refusée 403 SUPPORT_FINANCIAL_FORBIDDEN (jamais exécutée).
//     C16 : notice publiée/publique, consentement, droits à vérification
//           proportionnée, export personnel filtré, point de restauration.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/serverRealMode.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
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

  // ── Fixtures : identité, DEUX groupes (cible + étranger), adhésion+rôle,
  //    obligation ────────────────────────────────────────────────────────
  await migrator.query(`
    INSERT INTO identity (identity_id) VALUES ('alice@example.test'), ('bob@example.test'), ('carol@example.test')
      ON CONFLICT DO NOTHING;
    INSERT INTO "group" (group_id, state) VALUES ('grpA3','active'), ('grpA3-foreign','active')
      ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_a3','grpA3','alice@example.test','active'),
             ('mem_a3_bob','grpA3','bob@example.test','active'),
             ('mem_a3_carol','grpA3','carol@example.test','active') ON CONFLICT DO NOTHING;
    INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
      VALUES ('ra_a3','grpA3','mem_a3','treasurer', now()),
             ('ra_a3_bob','grpA3','mem_a3_bob','animator', now()),
             ('ra_a3_carol','grpA3','mem_a3_carol','member', now()) ON CONFLICT DO NOTHING;
    -- Comptes ACTIFS pour bob/carol (alice le devient via A3-REGISTER) : la
    -- connexion réelle exige identity_access.state='active' (pgAccessStore).
    INSERT INTO identity_access (identity_id, state, channel_verified)
      VALUES ('bob@example.test','active',true), ('carol@example.test','active',true)
      ON CONFLICT (identity_id) DO NOTHING;
    INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_a3','grpA3',1) ON CONFLICT DO NOTHING;
    INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
      VALUES ('ob_a3','grpA3','rnd_a3','mem_a3','100000','0','0',1) ON CONFLICT DO NOTHING;
    -- Règles publiées (C04) : quorum 1/2 lisible par realGroupDecisionRules (C09).
    -- penaltyEnabled=false exigé par le CHECK pilote de 0005.
    INSERT INTO rule_version (group_id, rules_version, snapshot)
      VALUES ('grpA3', 1, '{"quorum":{"numerator":1,"denominator":2},"penaltyEnabled":false}')
      ON CONFLICT DO NOTHING;
    -- Dédié A4-C03 : membre à révoquer (dave) et invitation anonyme à racheter.
    INSERT INTO identity (identity_id) VALUES ('dave@example.test') ON CONFLICT DO NOTHING;
    INSERT INTO membership (membership_id, group_id, identity_id, state)
      VALUES ('mem_a3_dave','grpA3','dave@example.test','active') ON CONFLICT DO NOTHING;
    INSERT INTO invitation (invitation_id, group_id, channel, max_uses, used_count, issued_at, expires_at)
      VALUES ('inv_a4','grpA3','link',2,0, now(), now() + interval '1 hour')
      ON CONFLICT (invitation_id) DO NOTHING;
  `);

  const pool = createApiPool({ connectionString: url, max: 5 });
  const nullSender = new NullEmailSender();
  // Horloge SERVEUR injectable (§27 : jamais l'horloge client) : elle SUIT
  // l'horloge réelle — une horloge gelée dériverait du trigger 0012
  // (`now() > deadline`) sous la vraie latence réseau — et avance par décalage
  // pour franchir l'échéance d'une volée (durationSeconds) sans sleep.
  let clockOffsetMs = 0;
  const serverNowMs = () => Date.now() + clockOffsetMs;
  const app = buildApp({ pool, emailSender: nullSender, now: serverNowMs });

  function inject(opts) {
    return app.inject(opts);
  }

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

  // ── A3-REGISTER : inscription + code + vérification → actif ────────────
  await inject({ method: "POST", url: "/v1/access/registrations", payload: { identityId: "alice@example.test", channel: "email" } });
  const codeMatch = nullSender.sent.at(-1)?.text.match(/(\d{6})/);
  const code = codeMatch ? codeMatch[1] : null;
  const verifyRes = await inject({
    method: "POST",
    url: "/v1/access/registrations/verifications",
    payload: { identityId: "alice@example.test", code },
  });
  check("A3-REGISTER", verifyRes.statusCode === 200 && verifyRes.json().state === "active", {
    status: verifyRes.statusCode,
    body: verifyRes.json(),
  });

  // ── A3-LOGIN : lien magique → sessionId RÉEL ────────────────────────────
  await inject({ method: "POST", url: "/v1/access/login-requests", payload: { identityId: "alice@example.test" } });
  const loginCodeMatch = nullSender.sent.at(-1)?.text.match(/(\d{6})/);
  const loginCode = loginCodeMatch ? loginCodeMatch[1] : null;
  const loginRes = await inject({
    method: "POST",
    url: "/v1/access/login-completions",
    payload: { identityId: "alice@example.test", code: loginCode },
  });
  const sessionId = loginRes.json().sessionId;
  check("A3-LOGIN", loginRes.statusCode === 201 && typeof sessionId === "string" && sessionId.length === 36, {
    status: loginRes.statusCode,
    sessionIdLength: sessionId ? sessionId.length : null,
  });

  // ── A3-DECLARE : déclaration RÉELLE authentifiée par la session ─────────
  const declareRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/declarations",
    headers: {
      authorization: `Bearer ${sessionId}`,
      "idempotency-key": "idem-a3-1",
      "if-match-version": "1",
    },
    payload: { obligationId: "ob_a3", amount: 40000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE", declareRes.statusCode === 201 && declareRes.json().status === "applied", {
    status: declareRes.statusCode,
    body: declareRes.json(),
  });

  // ── A3-DECLARE-NOAUTH : sans Authorization → 401 SESSION_INVALID ───────
  const noAuthRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/declarations",
    headers: { "idempotency-key": "idem-a3-2", "if-match-version": "1" },
    payload: { obligationId: "ob_a3", amount: 1000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE-NOAUTH", noAuthRes.statusCode === 401 && noAuthRes.json().code === "SESSION_INVALID", {
    status: noAuthRes.statusCode,
    body: noAuthRes.json(),
  });

  // ── A3-DECLARE-FOREIGN : session valide, groupe SANS adhésion → 403 ────
  const foreignRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3-foreign/declarations",
    headers: {
      authorization: `Bearer ${sessionId}`,
      "idempotency-key": "idem-a3-3",
      "if-match-version": "1",
    },
    payload: { obligationId: "ob_a3", amount: 1000, channel: "cash", allegedDate: "2026-10-07" },
  });
  check("A3-DECLARE-FOREIGN", foreignRes.statusCode === 403 && foreignRes.json().code === "FEATURE_PILOT_FORBIDDEN", {
    status: foreignRes.statusCode,
    body: foreignRes.json(),
  });

  // ── A3-VIEW : capacité/restant dû reflètent la déclaration ci-dessus ───
  const viewRes = await inject({
    method: "GET",
    url: "/v1/groups/grpA3/obligations/ob_a3",
    headers: { authorization: `Bearer ${sessionId}` },
  });
  check(
    "A3-VIEW",
    viewRes.statusCode === 200 && viewRes.json().activeReserved === "40000" && viewRes.json().contributionCount === 1,
    { status: viewRes.statusCode, body: viewRes.json() },
  );

  // ═══ A4 : parcours multi-acteur HTTP → PgStore → PostgreSQL ═══════════
  // Trois acteurs RÉELS, trois rôles : alice trésorière (déclarante),
  // bob animateur (bénéficiaire), carol membre (contrôleuse indépendante).
  const bobSession = await loginAs("bob@example.test");
  const carolSession = await loginAs("carol@example.test");
  check(
    "A4-SESSIONS",
    typeof bobSession === "string" &&
      bobSession.length === 36 &&
      typeof carolSession === "string" &&
      carolSession.length === 36,
    {
      bobLength: typeof bobSession === "string" ? bobSession.length : null,
      carolLength: typeof carolSession === "string" ? carolSession.length : null,
    },
  );
  const aliceAuth = { authorization: `Bearer ${sessionId}` };
  const bobAuth = { authorization: `Bearer ${bobSession}` };
  const carolAuth = { authorization: `Bearer ${carolSession}` };

  // ── A4-C03 : gouvernance réelle — l'identité métier vient de la SESSION,
  //    jamais du corps (§14) ; révocation et invitation persistent en base ──
  // Acceptation des règles par alice : le corps tente d'usurper dave — la
  // réponse doit porter l'identité RÉSOLUE d'alice et la version courante (1).
  const acceptRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/rules-acceptances",
    headers: aliceAuth,
    payload: { identityId: "dave@example.test" },
  });
  check(
    "A4-C03-ACCEPT",
    acceptRes.statusCode === 201 &&
      acceptRes.json().identityId === "alice@example.test" &&
      acceptRes.json().rulesVersion === 1,
    { status: acceptRes.statusCode, body: acceptRes.json() },
  );

  const spoofRows = await migrator.query(
    `SELECT
       count(*) FILTER (WHERE identity_id = 'alice@example.test')::int AS alice_rows,
       count(*) FILTER (WHERE identity_id = 'dave@example.test')::int AS dave_rows
     FROM rules_acceptance WHERE group_id = 'grpA3' AND rules_version = 1`,
  );
  check(
    "A4-C03-ACCEPT-SPOOF-IGNORED",
    spoofRows.rows[0]?.alice_rows === 1 && spoofRows.rows[0]?.dave_rows === 0,
    spoofRows.rows[0],
  );

  // Barrière d'acceptation : alice (acceptée) passe même si le corps nomme
  // carol ; carol (jamais acceptée) est refusée 403 RULES_NOT_ACCEPTED.
  const declareAllowed = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/contribution-declarations",
    headers: aliceAuth,
    payload: { identityId: "carol@example.test" },
  });
  check(
    "A4-C03-DECLARE",
    declareAllowed.statusCode === 200 && declareAllowed.json().allowed === true,
    { status: declareAllowed.statusCode, body: declareAllowed.json() },
  );

  const declareRefused = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/contribution-declarations",
    headers: carolAuth,
    payload: { identityId: "carol@example.test" },
  });
  check(
    "A4-C03-DECLARE-REFUSED",
    declareRefused.statusCode === 403 && declareRefused.json().code === "RULES_NOT_ACCEPTED",
    { status: declareRefused.statusCode, body: declareRefused.json() },
  );

  // Révocation de l'adhésion de dave par la session d'alice (dave = CIBLE
  // légitime) ; la transition active→revoked doit persister en base.
  const terminateRes = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/membership-terminations",
    headers: aliceAuth,
    payload: { identityId: "dave@example.test" },
  });
  check(
    "A4-C03-TERMINATE",
    terminateRes.statusCode === 200 && terminateRes.json().state === "revoked",
    { status: terminateRes.statusCode, body: terminateRes.json() },
  );

  const revokedRows = await migrator.query(
    `SELECT state FROM membership WHERE membership_id = 'mem_a3_dave'`,
  );
  check("A4-C03-TERMINATE-PERSIST", revokedRows.rows[0]?.state === "revoked", revokedRows.rows[0]);

  // Rachat d'invitation anonyme : compté par racheteur, épuisable à max_uses,
  // groupe résolu par le résolveur étroit 0020 (jamais fourni par le client).
  const redeem1 = await inject({
    method: "POST",
    url: "/v1/invitations/inv_a4/redemptions",
    headers: aliceAuth,
  });
  check(
    "A4-C03-INVITE-REDEEM-1",
    redeem1.statusCode === 200 && redeem1.json().usedCount === 1 && redeem1.json().groupId === "grpA3",
    { status: redeem1.statusCode, body: redeem1.json() },
  );

  const redeem2 = await inject({
    method: "POST",
    url: "/v1/invitations/inv_a4/redemptions",
    headers: carolAuth,
  });
  check(
    "A4-C03-INVITE-REDEEM-2",
    redeem2.statusCode === 200 && redeem2.json().usedCount === 2,
    { status: redeem2.statusCode, body: redeem2.json() },
  );

  const redeem3 = await inject({
    method: "POST",
    url: "/v1/invitations/inv_a4/redemptions",
    headers: bobAuth,
  });
  check(
    "A4-C03-INVITE-EXHAUSTED",
    redeem3.statusCode === 410 && redeem3.json().code === "INVITATION_INVALID",
    { status: redeem3.statusCode, body: redeem3.json() },
  );

  const inviteRows = await migrator.query(
    `SELECT used_count FROM invitation WHERE invitation_id = 'inv_a4'`,
  );
  check("A4-C03-INVITE-PERSIST", inviteRows.rows[0]?.used_count === 2, inviteRows.rows[0]);

  // ── A4-C08 : décaissement documenté, déclarant ≠ bénéficiaire ──────────
  const c08Declare = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/disbursements",
    headers: { ...aliceAuth, "idempotency-key": "idem-a4-dsb-declare" },
    payload: {
      disbursementId: "dsb_a4",
      roundId: "rnd_a3",
      obligationId: "ob_a3",
      beneficiaryIdentityId: "bob@example.test",
      netAmount: 30000,
      groupFees: 1000,
      requiredControllers: 1,
      allegedDate: serverNowMs(),
    },
  });
  check(
    "A4-C08-DECLARE",
    c08Declare.statusCode === 201 &&
      c08Declare.json().state === "requested" &&
      c08Declare.json().version === 1 &&
      c08Declare.json().netAmount === "30000",
    { status: c08Declare.statusCode, body: c08Declare.json() },
  );

  const c08NoAuth = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/disbursements/dsb_a4/confirmations",
    headers: { "idempotency-key": "idem-a4-cfm-noauth", "if-match-version": "1" },
  });
  check("A4-C08-NOAUTH", c08NoAuth.statusCode === 401 && c08NoAuth.json().code === "SESSION_INVALID", {
    status: c08NoAuth.statusCode,
    body: c08NoAuth.json(),
  });

  // La DÉCLARANTE elle-même (alice) n'est pas le bénéficiaire : refus 200
  // `actAccepted=false`, AUCUNE écriture (version figée à 1).
  const c08WrongConfirm = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/disbursements/dsb_a4/confirmations",
    headers: { ...aliceAuth, "idempotency-key": "idem-a4-cfm-wrong", "if-match-version": "1" },
  });
  check(
    "A4-C08-CONFIRM-WRONG",
    c08WrongConfirm.statusCode === 200 &&
      c08WrongConfirm.json().actAccepted === false &&
      c08WrongConfirm.json().version === 1 &&
      c08WrongConfirm.json().reason === "NOT_BENEFICIARY",
    { status: c08WrongConfirm.statusCode, body: c08WrongConfirm.json() },
  );

  // Le bénéficiaire RÉEL (bob) confirme → en attente de contrôle indépendant.
  const c08Confirm = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/disbursements/dsb_a4/confirmations",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-cfm-bob", "if-match-version": "1" },
  });
  check(
    "A4-C08-CONFIRM",
    c08Confirm.statusCode === 200 &&
      c08Confirm.json().actAccepted === true &&
      c08Confirm.json().completed === false &&
      c08Confirm.json().version === 2 &&
      c08Confirm.json().reason === "AWAITING_CONTROLLERS",
    { status: c08Confirm.statusCode, body: c08Confirm.json() },
  );

  // Contrôle par un tiers distinct (carol ≠ déclarante ≠ bénéficiaire) → achevé.
  const c08Control = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/disbursements/dsb_a4/control",
    headers: { ...carolAuth, "idempotency-key": "idem-a4-ctl-carol", "if-match-version": "2" },
  });
  check(
    "A4-C08-CONTROL",
    c08Control.statusCode === 200 &&
      c08Control.json().actAccepted === true &&
      c08Control.json().completed === true &&
      c08Control.json().version === 3,
    { status: c08Control.statusCode, body: c08Control.json() },
  );

  const c08View = await inject({
    method: "GET",
    url: "/v1/groups/grpA3/disbursements/dsb_a4",
    headers: aliceAuth,
  });
  check(
    "A4-C08-VIEW",
    c08View.statusCode === 200 &&
      c08View.json().state === "completed" &&
      c08View.json().netAmount === "30000" &&
      c08View.json().refundedExternally === false,
    { status: c08View.statusCode, body: c08View.json() },
  );

  // ── A4-C09 : proposition, bulletins, clôture horloge RÉELLE, exécution ─
  const c09Open = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/votes",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-vote-open" },
    payload: {
      proposalId: "prop_a4",
      subjectKind: "disbursement_correction",
      subjectRef: "dsb_a4",
      reason: "Correction demandée après contrôle du décaissement",
      durationSeconds: 60,
    },
  });
  check(
    "A4-C09-OPEN",
    c09Open.statusCode === 201 && c09Open.json().state === "open" && c09Open.json().version === 1,
    { status: c09Open.statusCode, body: c09Open.json() },
  );

  const c09BallotBob = await inject({
    method: "POST",
    url: "/v1/votes/prop_a4/ballots",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-ballot-bob", "if-match-version": "1" },
    payload: { choice: "yes" },
  });
  check(
    "A4-C09-BALLOT-BOB",
    c09BallotBob.statusCode === 201 &&
      c09BallotBob.json().voteAccepted === true &&
      c09BallotBob.json().version === 2,
    { status: c09BallotBob.statusCode, body: c09BallotBob.json() },
  );

  const c09BallotCarol = await inject({
    method: "POST",
    url: "/v1/votes/prop_a4/ballots",
    headers: { ...carolAuth, "idempotency-key": "idem-a4-ballot-carol", "if-match-version": "2" },
    payload: { choice: "yes" },
  });
  check(
    "A4-C09-BALLOT-CAROL",
    c09BallotCarol.statusCode === 201 &&
      c09BallotCarol.json().voteAccepted === true &&
      c09BallotCarol.json().version === 3,
    { status: c09BallotCarol.statusCode, body: c09BallotCarol.json() },
  );

  // Double vote : refus 200 SANS écriture (version figée à 3).
  const c09BallotDup = await inject({
    method: "POST",
    url: "/v1/votes/prop_a4/ballots",
    headers: { ...carolAuth, "idempotency-key": "idem-a4-ballot-carol-2", "if-match-version": "3" },
    payload: { choice: "no" },
  });
  check(
    "A4-C09-BALLOT-DUP",
    c09BallotDup.statusCode === 200 &&
      c09BallotDup.json().voteAccepted === false &&
      c09BallotDup.json().version === 3 &&
      c09BallotDup.json().reason === "ALREADY_VOTED",
    { status: c09BallotDup.statusCode, body: c09BallotDup.json() },
  );

  // Échéance (60 s) franchie par HORLOGE INJECTÉE — jamais un sleep réel.
  clockOffsetMs += 61_000;

  const c09Close = await inject({
    method: "POST",
    url: "/v1/proposals/prop_a4/closures",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-vote-close", "if-match-version": "3" },
  });
  const c09Tally = c09Close.json().tally;
  check(
    "A4-C09-CLOSE",
    c09Close.statusCode === 200 &&
      c09Close.json().state === "closed" &&
      c09Close.json().version === 4 &&
      c09Tally &&
      c09Tally.yes === 2 &&
      c09Tally.no === 0 &&
      c09Tally.turnout === 2 &&
      c09Tally.quorum === 2 &&
      c09Tally.approved === true,
    { status: c09Close.statusCode, body: c09Close.json() },
  );

  const c09Execute = await inject({
    method: "POST",
    url: "/v1/votes/prop_a4/executions",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-vote-exec", "if-match-version": "4" },
  });
  check(
    "A4-C09-EXECUTE",
    c09Execute.statusCode === 200 &&
      c09Execute.json().executed === true &&
      c09Execute.json().idempotent === false &&
      c09Execute.json().version === 5,
    { status: c09Execute.statusCode, body: c09Execute.json() },
  );

  const c09ExecuteReplay = await inject({
    method: "POST",
    url: "/v1/votes/prop_a4/executions",
    headers: { ...bobAuth, "idempotency-key": "idem-a4-vote-exec-2", "if-match-version": "5" },
  });
  check(
    "A4-C09-EXECUTE-REPLAY",
    c09ExecuteReplay.statusCode === 200 &&
      c09ExecuteReplay.json().executed === true &&
      c09ExecuteReplay.json().idempotent === true &&
      c09ExecuteReplay.json().version === 5,
    { status: c09ExecuteReplay.statusCode, body: c09ExecuteReplay.json() },
  );

  // ── A4-C12 : export scellé, téléchargements, vérification d'empreinte ──
  const c12Export = await inject({
    method: "POST",
    url: "/v1/groups/grpA3/exports",
    headers: { ...aliceAuth, "idempotency-key": "idem-a4-export" },
    payload: {},
  });
  const c12ManifestId = c12Export.json().manifestId;
  check(
    "A4-C12-EXPORT",
    c12Export.statusCode === 201 &&
      typeof c12ManifestId === "string" &&
      c12ManifestId.startsWith("exp-grpA3-"),
    { status: c12Export.statusCode, manifestId: c12ManifestId },
  );

  const c12Manifest = await inject({
    method: "GET",
    url: `/v1/exports/${c12ManifestId}/manifest`,
    headers: aliceAuth,
  });
  check(
    "A4-C12-MANIFEST",
    c12Manifest.statusCode === 200 && /^[0-9a-f]{64}$/.test(c12Manifest.json().pdfSha256),
    { status: c12Manifest.statusCode, pdfSha256: c12Manifest.json().pdfSha256 },
  );

  const c12Download = await inject({
    method: "GET",
    url: `/v1/exports/${c12ManifestId}/download`,
    headers: aliceAuth,
  });
  check(
    "A4-C12-DOWNLOAD",
    c12Download.statusCode === 200 &&
      c12Download.headers["content-type"] === "application/pdf" &&
      c12Download.rawPayload.length > 0,
    {
      status: c12Download.statusCode,
      contentType: c12Download.headers["content-type"],
      bytes: c12Download.rawPayload.length,
    },
  );

  const c12Csv = await inject({
    method: "GET",
    url: `/v1/exports/${c12ManifestId}/csv`,
    headers: aliceAuth,
  });
  check(
    "A4-C12-CSV",
    c12Csv.statusCode === 200 &&
      String(c12Csv.headers["content-type"]).startsWith("text/csv") &&
      c12Csv.body.length > 0,
    { status: c12Csv.statusCode, contentType: c12Csv.headers["content-type"], bytes: c12Csv.body.length },
  );

  // Vérification INDÉPENDANTE des octets RÉELS téléchargés vs manifeste.
  const c12Verify = await inject({
    method: "POST",
    url: `/v1/exports/${c12ManifestId}/verifications`,
    headers: { ...aliceAuth, "idempotency-key": "idem-a4-export-verify" },
    payload: { bytesBase64: c12Download.rawPayload.toString("base64") },
  });
  check(
    "A4-C12-VERIFY",
    c12Verify.statusCode === 200 &&
      c12Verify.json().verification_passed === true &&
      c12Verify.json().checkedHash === c12Manifest.json().pdfSha256 &&
      c12Verify.json().expectedHash === c12Manifest.json().pdfSha256,
    { status: c12Verify.statusCode, body: c12Verify.json() },
  );

  // Groupe étranger : alice n'y a aucune adhésion → 404 non-divulguant.
  const c12Foreign = await inject({
    method: "POST",
    url: "/v1/groups/grpA3-foreign/exports",
    headers: { ...aliceAuth, "idempotency-key": "idem-a4-export-foreign" },
    payload: {},
  });
  check(
    "A4-C12-FOREIGN",
    c12Foreign.statusCode === 404 && c12Foreign.json().code === "RESERVATION_INCOHERENTE",
    { status: c12Foreign.statusCode, body: c12Foreign.json() },
  );

  // ── A4-C17 : support JIT, double approbation, refus financier ──────────
  const c17Request = await inject({
    method: "POST",
    url: "/v1/support/access-requests",
    headers: aliceAuth,
    payload: {
      requestId: "sup_a4",
      targetGroupId: "grpA3",
      motif: "Assistance sur la déclaration de cotisation",
      permissions: ["view_trace"],
      ttlSeconds: 3600,
    },
  });
  check(
    "A4-C17-REQUEST",
    c17Request.statusCode === 201 &&
      c17Request.json().status === "pending_approval" &&
      c17Request.json().approverCount === 0,
    { status: c17Request.statusCode, body: c17Request.json() },
  );

  const c17Approve1 = await inject({
    method: "POST",
    url: "/v1/support/access-requests/sup_a4/approvals",
    headers: bobAuth,
    payload: { ttlSeconds: 3600 },
  });
  check(
    "A4-C17-APPROVE-1",
    c17Approve1.statusCode === 200 &&
      c17Approve1.json().approverCount === 1 &&
      c17Approve1.json().status === "pending_approval",
    { status: c17Approve1.statusCode, body: c17Approve1.json() },
  );

  const c17Approve2 = await inject({
    method: "POST",
    url: "/v1/support/access-requests/sup_a4/approvals",
    headers: carolAuth,
    payload: { ttlSeconds: 3600 },
  });
  check(
    "A4-C17-APPROVE-2",
    c17Approve2.statusCode === 200 &&
      c17Approve2.json().approverCount === 2 &&
      c17Approve2.json().status === "granted",
    { status: c17Approve2.statusCode, body: c17Approve2.json() },
  );

  const c17ActionOk = await inject({
    method: "POST",
    url: "/v1/support/access-requests/sup_a4/actions",
    headers: aliceAuth,
    payload: { action: "view_trace" },
  });
  check(
    "A4-C17-ACTION-OK",
    c17ActionOk.statusCode === 200 && c17ActionOk.json().accessAllowed === true,
    { status: c17ActionOk.statusCode, body: c17ActionOk.json() },
  );

  // Action FINANCIÈRE : jamais exécutée, refus stable 403 (§20-24, C17-JIT).
  const c17ActionFin = await inject({
    method: "POST",
    url: "/v1/support/access-requests/sup_a4/actions",
    headers: aliceAuth,
    payload: { action: "validate_contribution" },
  });
  check(
    "A4-C17-ACTION-FIN",
    c17ActionFin.statusCode === 403 && c17ActionFin.json().code === "SUPPORT_FINANCIAL_FORBIDDEN",
    { status: c17ActionFin.statusCode, body: c17ActionFin.json() },
  );

  // ── A4-C16 : notices, consentement, droits, export perso, restauration ─
  const c16Notice = await inject({
    method: "POST",
    url: "/v1/privacy/notices",
    headers: aliceAuth,
    payload: {
      noticeId: "not_a4",
      kind: "privacy",
      version: "1.0.0",
      lastUpdatedAt: "2026-10-08",
      body: "KÓMBE est un registre partagé de tontine. Les paiements restent hors application. Vous pouvez exercer vos droits d'accès, de rectification et d'effacement depuis l'application.",
    },
  });
  check(
    "A4-PRIVACY-NOTICE",
    c16Notice.statusCode === 201 && c16Notice.json().noticeId === "not_a4",
    { status: c16Notice.statusCode, body: c16Notice.json() },
  );

  // Notice PUBLIQUE : lisible sans session (13.1).
  const c16NoticePublic = await inject({ method: "GET", url: "/v1/privacy/notices/not_a4" });
  check(
    "A4-PRIVACY-NOTICE-PUBLIC",
    c16NoticePublic.statusCode === 200 && c16NoticePublic.json().noticeId === "not_a4",
    { status: c16NoticePublic.statusCode, body: c16NoticePublic.json() },
  );

  const c16Consent = await inject({
    method: "POST",
    url: "/v1/privacy/consents",
    headers: aliceAuth,
    payload: { category: "research", granted: true },
  });
  check(
    "A4-PRIVACY-CONSENT",
    c16Consent.statusCode === 200 && c16Consent.json().research === true,
    { status: c16Consent.statusCode, body: c16Consent.json() },
  );

  const c16ConsentView = await inject({ method: "GET", url: "/v1/privacy/consents", headers: aliceAuth });
  check(
    "A4-PRIVACY-CONSENT-VIEW",
    c16ConsentView.statusCode === 200 && c16ConsentView.json().research === true,
    { status: c16ConsentView.statusCode, body: c16ConsentView.json() },
  );

  const c16Open = await inject({
    method: "POST",
    url: "/v1/privacy/rights-requests",
    headers: aliceAuth,
    payload: { requestId: "rr_a4", kind: "access" },
  });
  check(
    "A4-PRIVACY-OPEN",
    c16Open.statusCode === 201 &&
      c16Open.json().status === "received" &&
      c16Open.json().requiredVerification === 1,
    { status: c16Open.statusCode, body: c16Open.json() },
  );

  // Vérification PROPORTIONNÉE : niveau insuffisant ⇒ requires_more_info.
  const c16VerifyLow = await inject({
    method: "POST",
    url: "/v1/privacy/rights-requests/rr_a4/verifications",
    headers: aliceAuth,
    payload: { level: 0 },
  });
  check(
    "A4-PRIVACY-VERIFY-LOW",
    c16VerifyLow.statusCode === 200 && c16VerifyLow.json().status === "requires_more_info",
    { status: c16VerifyLow.statusCode, body: c16VerifyLow.json() },
  );

  const c16VerifyOk = await inject({
    method: "POST",
    url: "/v1/privacy/rights-requests/rr_a4/verifications",
    headers: aliceAuth,
    payload: { level: 1 },
  });
  check(
    "A4-PRIVACY-VERIFY-OK",
    c16VerifyOk.statusCode === 200 && c16VerifyOk.json().status === "ready",
    { status: c16VerifyOk.statusCode, body: c16VerifyOk.json() },
  );

  const c16Export = await inject({
    method: "POST",
    url: "/v1/privacy/rights-requests/rr_a4/export",
    headers: aliceAuth,
  });
  check(
    "A4-PRIVACY-EXPORT",
    c16Export.statusCode === 201 &&
      c16Export.json().subjectIdentityId === "alice@example.test" &&
      c16Export.json().thirdPartyPrivateFields === 0,
    { status: c16Export.statusCode, body: c16Export.json() },
  );

  const c16RestorePoint = await inject({
    method: "POST",
    url: "/v1/privacy/restore-points",
    headers: aliceAuth,
  });
  const restoreIdentities = Array.isArray(c16RestorePoint.json().identities)
    ? c16RestorePoint.json().identities
    : [];
  check(
    "A4-PRIVACY-RESTORE-POINT",
    c16RestorePoint.statusCode === 201 &&
      restoreIdentities.includes("alice@example.test") &&
      restoreIdentities.includes("bob@example.test") &&
      restoreIdentities.includes("carol@example.test"),
    { status: c16RestorePoint.statusCode, identities: restoreIdentities },
  );

  // ── A3-FICTIF-INTACT : sans pool, le squelette fictif répond encore ────
  const fictifApp = buildApp();
  const fictifRes = await fictifApp.inject({ method: "GET", url: "/v1/health" });
  check("A3-FICTIF-INTACT", fictifRes.statusCode === 200 && fictifRes.json().mode === "fictif", {
    status: fictifRes.statusCode,
    body: fictifRes.json(),
  });
  await fictifApp.close();

  await app.close();
  await pool.end();
  await migrator.end();

  const status = failures === 0 ? "PASS" : "FAIL";
  process.stdout.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status, observations, exitCode: failures === 0 ? 0 : 1 }, null, 2) + "\n",
  );
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(
    JSON.stringify({ target: "kombe.api.serverRealMode", status: "FAIL", error: String(err && err.stack ? err.stack : err), exitCode: 1 }, null, 2) + "\n",
  );
  try { await migrator.end(); } catch { /* ignore */ }
  process.exit(1);
}
