// KÓMBE C01 — Tests d'isolation PostgreSQL RÉELS (livrable prêt à exécuter).
//
// Ce fichier N'EST PAS UN MOCK. Il applique les scénarios C01-TENANT, C01-FK et
// C01-POOL contre une base PostgreSQL 16+ réelle et des observations issues
// d'actions/réquisitions réelles — jamais de constante lue dans un fichier
// d'attentes.
//
// HONNÊTETÉ D'EXÉCUTION : si aucune base n'est disponible (variable
// KOMBE_TEST_DATABASE_URL absente) OU si le pilote `pg` n'est pas installé, le
// script sort en BLOCKED (code 2) avec le motif, SANS simuler de succès. C'est
// l'état de cet hôte (ni Docker ni PostgreSQL). Convention de sortie alignée
// sur 04_Harness : 0 = succès réel, 1 = échec, 2 = BLOCKED.
//
// Lancement (quand l'infra existe) :
//   KOMBE_TEST_DATABASE_URL=postgresql://kombe_migrateur@localhost:5432/kombe_test \
//   node packages/db/tests/isolation.pg.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "..");
const url = process.env.KOMBE_TEST_DATABASE_URL;

function blocked(reason) {
  process.stdout.write(
    JSON.stringify({ target: "kombe.db.isolation", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n",
  );
  process.exit(2);
}

if (!url) {
  blocked("KOMBE_TEST_DATABASE_URL absente : aucune base PostgreSQL de test joignable sur cet hôte.");
}

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé : impossibilité de parler à PostgreSQL réel (mock interdit).");
}

/** Lit et exécute un fichier SQL (requête simple multi-instructions). */
async function runSql(client, file) {
  await client.query(readFileSync(resolve(dbRoot, file), "utf8"));
}

/** Enveloppe une transaction en posant le contexte RLS kombe.group_id. */
async function withTenant(client, groupId, fn) {
  await client.query("BEGIN");
  await client.query("SET LOCAL kombe.group_id = $1", [groupId]);
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

/** Enveloppe une transaction en posant le contexte self-scope kombe.identity_id. */
async function withIdentity(client, identityId, fn) {
  await client.query("BEGIN");
  await client.query("SET LOCAL kombe.identity_id = $1", [identityId]);
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main() {
  const migrator = new pg.Client({ connectionString: url });
  await migrator.connect();
  const observations = {};

  try {
    // État initial reproductible : on repart d'un schéma propre en base de test.
    await runSql(migrator, "migrations/0009_contribution_validation.down.sql");
    await runSql(migrator, "migrations/0008_contribution_idempotency.down.sql");
    await runSql(migrator, "migrations/0007_event_journal.down.sql");
    await runSql(migrator, "migrations/0001_init.down.sql");
    await runSql(migrator, "migrations/0001_init.sql");
    await runSql(migrator, "migrations/0002_role_change.sql");
    await runSql(migrator, "migrations/0003_access.sql");
    await runSql(migrator, "migrations/0004_group_governance.sql");
    await runSql(migrator, "migrations/0005_rules_engine.sql");
    await runSql(migrator, "migrations/0006_cycle_schedule.sql");
    await runSql(migrator, "migrations/0007_event_journal.sql");
    await runSql(migrator, "migrations/0008_contribution_idempotency.sql");
    await runSql(migrator, "migrations/0009_contribution_validation.sql");
    await runSql(migrator, "provision/roles.sql");

    // Deux groupes A/B, une identité et une obligation chacune (fictives).
    await migrator.query(`
      SET kombe.group_id = 'grpA';
      INSERT INTO identity (identity_id) VALUES ('idn_a'), ('idn_b') ON CONFLICT DO NOTHING;
      INSERT INTO "group" (group_id, state) VALUES ('grpA','active'), ('grpB','active') ON CONFLICT DO NOTHING;
      INSERT INTO membership (membership_id, group_id, identity_id, state)
        VALUES ('mem_a','grpA','idn_a','active'), ('mem_b','grpB','idn_b','active')
        ON CONFLICT DO NOTHING;
      INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_a','grpA',1), ('rnd_b','grpB',1) ON CONFLICT DO NOTHING;
      INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount)
        VALUES ('obl_a','grpA','rnd_a','mem_a',1000), ('obl_b','grpB','rnd_b','mem_b',1000)
        ON CONFLICT DO NOTHING;
      -- Une ligne de journal posée (append), pour éprouver l'append-only côté app (C11).
      INSERT INTO journal (group_id, seq, event_type, previous_hash, hash, payload)
        VALUES ('grpA',1,'contribution.declared',
                '0000000000000000000000000000000000000000000000000000000000000000',
                '1111111111111111111111111111111111111111111111111111111111111111',
                '{"body":{"obligationId":"obl_a","amount":1000}}'::jsonb)
        ON CONFLICT DO NOTHING;
    `);

    // État d'accès + jeton + session (fictifs) pour idn_a (lot C02).
    await migrator.query(`
      INSERT INTO identity_access (identity_id, state, channel_verified)
        VALUES ('idn_a','active',true) ON CONFLICT (identity_id)
        DO UPDATE SET state='active', channel_verified=true, session_generation=1;
      -- Un seul jeton de récupération non consommé pour idn_a.
      DELETE FROM verification_token WHERE identity_id = 'idn_a';
      INSERT INTO verification_token (token_id, identity_id, purpose, channel, token_hash, expires_at)
        VALUES ('tok_rec_a','idn_a','recovery','email','hash_fictif_a', now() + interval '15 minutes');
      -- Session à la génération courante (1) pour le scénario de supplantation.
      DELETE FROM access_session WHERE identity_id = 'idn_a';
      INSERT INTO access_session (session_id, identity_id, generation, expires_at)
        VALUES ('ses_a','idn_a',1, now() + interval '1 hour');
    `);

    // Session applicative : kombe_app (non-propriétaire, sans BYPASSRLS).
    const app = new pg.Client({
      connectionString: url,
      options: "-c role=kombe_app",
    });
    await app.connect();

    // ── C01-TENANT : A interroge avec l'id d'un objet de B. ──────────────────
    const tenant = await withTenant(app, "grpA", async () => {
      const res = await app.query(
        "SELECT count(*)::int AS n FROM obligation WHERE obligation_id = 'obl_b'",
      );
      return res.rows[0].n;
    });
    observations.C01_TENANT = { cross_group_rows: tenant };

    // ── C01-FK : lier une contribution A à l'obligation de B. ────────────────
    let foreignLinkAccepted = true;
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query(
        `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state)
         VALUES ('cn_bad','grpA','obl_b',500,'declared')`,
      );
      await app.query("COMMIT");
    } catch {
      foreignLinkAccepted = false; // FK composite (group_id, obligation_id) rejetée
      await app.query("ROLLBACK").catch(() => {});
    }
    observations.C01_FK = { foreign_link_accepted: foreignLinkAccepted };

    // ── C01-POOL : 100 alternances A/B sur UNE même connexion de pool. ───────
    let leaked = 0;
    for (let i = 0; i < 100; i += 1) {
      const group = i % 2 === 0 ? "grpA" : "grpB";
      const expectedObl = group === "grpA" ? "obl_a" : "obl_b";
      const n = await withTenant(app, group, async () => {
        const res = await app.query(
          "SELECT obligation_id FROM obligation WHERE group_id = $1",
          [group],
        );
        // Toute ligne dont l'obligation n'appartient pas au groupe courant est une fuite.
        return res.rows.filter((r) => r.obligation_id !== expectedObl).length;
      });
      leaked += n;
    }
    observations.C01_POOL = { leaked_rows: leaked };

    // ── C02-RECOVERY : consommer deux fois le même jeton en base réelle. ─────
    // La consommation est un UPDATE atomique sous verrou ; la seconde trouve
    // consumed_at déjà posé ⇒ 0 ligne touchée ⇒ second_use_accepted = false.
    const consumeOnce = async () => {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.identity_id = 'idn_a'");
      const res = await app.query(
        `UPDATE verification_token SET consumed_at = now()
         WHERE token_id = 'tok_rec_a' AND consumed_at IS NULL
         RETURNING token_id`,
      );
      await app.query("COMMIT");
      return res.rowCount; // 1 = accepté, 0 = refus (déjà consommé)
    };
    const firstUse = await consumeOnce();
    const secondUse = await consumeOnce();
    observations.C02_RECOVERY = {
      first_use_accepted: firstUse === 1,
      second_use_accepted: secondUse === 1,
    };

    // ── C02-SESSION : la récupération incrémente la génération ⇒ l'ancienne
    // session (génération 1) n'est plus recevable (jointure self-scope). ──────
    await app.query("BEGIN");
    await app.query("SET LOCAL kombe.identity_id = 'idn_a'");
    await app.query(
      "UPDATE identity_access SET session_generation = session_generation + 1 WHERE identity_id = 'idn_a'",
    );
    await app.query("COMMIT");
    const oldSessionAccepted = await withIdentity(app, "idn_a", async () => {
      const res = await app.query(
        `SELECT count(*)::int AS n FROM access_session s
         JOIN identity_access a ON a.identity_id = s.identity_id
         WHERE s.session_id = 'ses_a' AND s.generation = a.session_generation
           AND s.revoked_at IS NULL AND s.expires_at > now()`,
      );
      return res.rows[0].n > 0;
    });
    observations.C02_SESSION = { old_session_accepted: oldSessionAccepted };

    // ── C02-SELFSCOPE : kombe_app ne voit que la ligne de l'identité posée. ──
    const selfScope = await withIdentity(app, "idn_b", async () => {
      // kombe.identity_id = idn_b ; la ligne d'idn_a doit être invisible.
      const res = await app.query("SELECT count(*)::int AS n FROM identity_access");
      return res.rows[0].n;
    });
    observations.C02_SELFSCOPE = { rows_visible_to_other_identity: selfScope };

    // ── C03-STATE : le groupe accepte un état ajouté par 0004 (2.7). ─────────
    let extendedStateAccepted = true;
    try {
      await migrator.query("UPDATE \"group\" SET state = 'stopped_with_discrepancies' WHERE group_id = 'grpA'");
    } catch {
      extendedStateAccepted = false;
    }
    observations.C03_STATE = { extended_state_accepted: extendedStateAccepted };

    // ── C03-INVITE : une invitation bornée à 1 usage refuse le second. ───────
    await migrator.query("SET kombe.group_id = 'grpA'");
    await migrator.query(
      `DELETE FROM invitation WHERE invitation_id = 'inv_a';
       INSERT INTO invitation (invitation_id, group_id, channel, max_uses, used_count, expires_at)
         VALUES ('inv_a','grpA','link',1,0, now() + interval '1 hour');`,
    );
    const redeemOnce = async () => {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      const res = await app.query(
        `UPDATE invitation SET used_count = used_count + 1
         WHERE invitation_id = 'inv_a' AND used_count < max_uses
         RETURNING invitation_id`,
      );
      await app.query("COMMIT");
      return res.rowCount;
    };
    const inviteFirst = await redeemOnce();
    const inviteSecond = await redeemOnce();
    observations.C03_INVITE = {
      first_redeem_accepted: inviteFirst === 1,
      second_redeem_accepted: inviteSecond === 1, // attendu false (borne max_uses)
    };

    // ── C03-TENANT : l'invitation de A est invisible au contexte de B. ───────
    const inviteCross = await withTenant(app, "grpB", async () => {
      const res = await app.query("SELECT count(*)::int AS n FROM invitation");
      return res.rows[0].n;
    });
    observations.C03_TENANT = { cross_group_invitation_rows: inviteCross };

    // ── C04-IMMUTABLE : un UPDATE de rule_version est refusé (append-only). ──
    await migrator.query("SET kombe.group_id = 'grpA'");
    await migrator.query(
      `INSERT INTO rule_version (group_id, rules_version, snapshot, snapshot_hash)
       VALUES ('grpA', 1, '{"penaltyEnabled": false}', $1)
       ON CONFLICT DO NOTHING`,
      ["a".repeat(64)],
    );
    let immutableUpdateAccepted = true;
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query(
        `UPDATE rule_version SET snapshot = '{"penaltyEnabled": false, "tampered": true}'::jsonb
         WHERE group_id = 'grpA' AND rules_version = 1`,
      );
      await app.query("COMMIT");
    } catch {
      immutableUpdateAccepted = false; // déclencheur d'immuabilité → refus
      await app.query("ROLLBACK").catch(() => {});
    }
    observations.C04_IMMUTABLE = { immutable_update_accepted: immutableUpdateAccepted };

    // ── C04-PENALTY (base) : insérer penaltyEnabled=true est refusé (CHECK). ──
    let penaltyTrueInsertAccepted = true;
    try {
      await migrator.query(
        `INSERT INTO rule_version (group_id, rules_version, snapshot)
         VALUES ('grpA', 99, '{"penaltyEnabled": true}')`,
      );
    } catch {
      penaltyTrueInsertAccepted = false; // règle barre pilote → refus structurel
    }
    observations.C04_PENALTY = { penalty_true_insert_accepted: penaltyTrueInsertAccepted };

    // ── C05-UNIQUE : un second tour avec le MÊME bénéficiaire est refusé (5.3). ─
    // `round_one_beneficiary_per_group` (index partiel unique) borne la rotation
    // égale : mem_a déjà bénéficiaire de rnd_a, un autre tour vers mem_a échoue.
    await migrator.query("SET kombe.group_id = 'grpA'");
    await migrator.query(
      `UPDATE round SET beneficiary_membership_id = 'mem_a',
                        due_date_business = DATE '2028-01-31',
                        due_at_utc = TIMESTAMPTZ '2028-01-31T11:00:00Z'
       WHERE round_id = 'rnd_a'`,
    );
    let secondRoundSameBeneficiaryAccepted = true;
    try {
      await migrator.query(
        `INSERT INTO round (round_id, group_id, seq, beneficiary_membership_id)
         VALUES ('rnd_a_dup','grpA',2,'mem_a')`,
      );
    } catch {
      secondRoundSameBeneficiaryAccepted = false; // index partiel unique → refus
    }
    observations.C05_UNIQUE = {
      second_round_same_beneficiary_accepted: secondRoundSameBeneficiaryAccepted,
    };

    // ── C05-OBLIGATION : obligation doublon (groupe, tour, membre) refusée (5.2). ─
    let duplicateObligationAccepted = true;
    try {
      await migrator.query(
        `INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount)
         VALUES ('obl_a_dup','grpA','rnd_a','mem_a',1000)`,
      );
    } catch {
      duplicateObligationAccepted = false; // obligation_unique_member_round → refus
    }
    observations.C05_OBLIGATION = { duplicate_member_round_accepted: duplicateObligationAccepted };

    // ── C11-APPEND-ONLY : kombe_app ne peut ni modifier ni effacer une ligne ──
    // posée (trigger append-only + REVOKE UPDATE/DELETE de 0007). La ligne reste
    // présente intacte (aucun effet de bord, aucune divulgation silencieuse).
    let journalUpdateRefused = false;
    let journalDeleteRefused = false;
    // Chaque tentative dans sa PROPRE transaction : sinon la première erreur
    // « avorte » la transaction et la seconde échoue pour la mauvaise raison.
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query("UPDATE journal SET payload = '{}'::jsonb WHERE group_id='grpA' AND seq=1");
      await app.query("ROLLBACK");
    } catch {
      journalUpdateRefused = true;
      await app.query("ROLLBACK").catch(() => {});
    }
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query("DELETE FROM journal WHERE group_id='grpA' AND seq=1");
      await app.query("ROLLBACK");
    } catch {
      journalDeleteRefused = true;
      await app.query("ROLLBACK").catch(() => {});
    }
    const rowPresentAfter = await withTenant(app, "grpA", async () => {
      const res = await app.query("SELECT count(*)::int AS n FROM journal WHERE group_id='grpA' AND seq=1");
      return res.rows[0].n;
    });
    observations.C11_APPEND_ONLY = {
      update_refused: journalUpdateRefused,
      delete_refused: journalDeleteRefused,
      row_present_after: rowPresentAfter,
    };

    // ── C11-CHECKPOINT : le checkpoint est hors d'écriture du rôle applicatif ──
    // (REVOKE INSERT de 0007) ; seul un vérificateur externe le pose.
    let checkpointAppInsertAccepted = true;
    try {
      await withTenant(app, "grpA", async () => {
        await app.query(
          `INSERT INTO checkpoint (group_id, seq, head_hash, issued_at, issued_by, hash)
           VALUES ('grpA',1,
             '1111111111111111111111111111111111111111111111111111111111111111',
             now(),'poseur_fictif',
             '2222222222222222222222222222222222222222222222222222222222222222')`,
        );
      });
    } catch {
      checkpointAppInsertAccepted = false; // privilège retiré → refus
    }
    observations.C11_CHECKPOINT = { app_insert_accepted: checkpointAppInsertAccepted };

    // ── C11-ROLLBACK : crash transactionnel après événement, avant outbox. ──
    // On insère commande + journal + outbox dans UNE transaction puis on rollback :
    // rien ne doit subsister (`partial_commit_count = 0`, atomicité 9.x / 18).
    await migrator.query("SET kombe.group_id = 'grpA'");
    await migrator.query("BEGIN");
    await migrator.query(
      `INSERT INTO command (command_id, idempotency_key, group_id, status)
       VALUES ('cmd_rb','idem_rb','grpA','applied')`,
    );
    await migrator.query(
      `INSERT INTO journal (group_id, seq, event_type, previous_hash, hash, payload)
       VALUES ('grpA',2,'contribution.validated',
         '1111111111111111111111111111111111111111111111111111111111111111',
         '3333333333333333333333333333333333333333333333333333333333333333',
         '{"body":{"obligationId":"obl_a","amount":1000}}'::jsonb)`,
    );
    await migrator.query(
      `INSERT INTO outbox (command_id, topic, payload)
       VALUES ('cmd_rb','notifications.internal','{}'::jsonb)`,
    );
    await migrator.query("ROLLBACK");
    const partialCommitCount = await migrator.query(
      `SELECT
         (SELECT count(*) FROM journal WHERE group_id='grpA' AND seq=2)
       + (SELECT count(*) FROM outbox  WHERE command_id='cmd_rb')
       + (SELECT count(*) FROM command WHERE command_id='cmd_rb') AS n`,
    );
    observations.C11_ROLLBACK = { partial_commit_count: Number(partialCommitCount.rows[0].n) };

    // ── C06-IDEMPOTENCE : le registre d'idempotence est append-only côté app ──
    // et scopé. kombe_app peut INSERT une réservation appliquée, JAMAIS la
    // modifier ni l'effacer (trigger + REVOKE UPDATE/DELETE de 0008) ; une
    // seconde exécution de la même (acteur,groupe,type,clé) bute sur l'UNIQUE,
    // donc une rejouabilité après timeout/coupure n'ajoute AUCUN second résultat.
    const HASH_A = "4".repeat(64);
    const HASH_B = "5".repeat(64);
    await withTenant(app, "grpA", async () => {
      await app.query(
        `INSERT INTO idempotency_registry
           (actor_identity_id, group_id, command_type, idempotency_key, body_hash, result_status)
         VALUES ('idn_a','grpA','contribution.declare','idem_c06_a',$1,'applied')`,
        [HASH_A],
      );
    });
    let registryUpdateRefused = false;
    try {
      await app.query("BEGIN");
      await app.query("SET LOCAL kombe.group_id = 'grpA'");
      await app.query(
        `UPDATE idempotency_registry SET body_hash = $1
         WHERE group_id='grpA' AND idempotency_key='idem_c06_a'`,
        [HASH_B],
      );
      await app.query("ROLLBACK");
    } catch {
      registryUpdateRefused = true;
      await app.query("ROLLBACK").catch(() => {});
    }
    // Corps différent sur la même clé scopée : l'UNIQUE bloque la seconde
    // application durable (le 409 corps-différent est décidé serveur, 18.1).
    let duplicateScopedKeyAccepted = true;
    try {
      await withTenant(app, "grpA", async () => {
        await app.query(
          `INSERT INTO idempotency_registry
             (actor_identity_id, group_id, command_type, idempotency_key, body_hash, result_status)
           VALUES ('idn_a','grpA','contribution.declare','idem_c06_a',$1,'applied')`,
          [HASH_B],
        );
      });
    } catch {
      duplicateScopedKeyAccepted = false;
    }
    observations.C06_IDEMPOTENCE = {
      registry_update_refused: registryUpdateRefused,
      duplicate_scoped_key_accepted: duplicateScopedKeyAccepted,
    };

    // ── C06-REPLAY : la déclaration n'est appliquée qu'une fois (compte = 1) ──
    // Transaction d'application (commande + registre + contribution) posée une
    // fois ; toute re-application bute sur l'UNIQUE du registre ⇒ pas de second
    // événement. Scénario éponyme : `contribution_count = 1` malgré 20 rejeux.
    await migrator.query("SET kombe.group_id = 'grpA'");
    await migrator.query("BEGIN");
    await migrator.query(
      `INSERT INTO command (command_id, idempotency_key, group_id, status)
       VALUES ('cmd_c06','idem_c06_r','grpA','applied')`,
    );
    await migrator.query(
      `INSERT INTO idempotency_registry
         (actor_identity_id, group_id, command_type, idempotency_key, body_hash, command_id, result_status)
       VALUES ('idn_a','grpA','contribution.declare','idem_c06_r',$1,'cmd_c06','applied')`,
      [HASH_A],
    );
    await migrator.query(
      `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state)
       VALUES ('ctr_c06','grpA','obl_a',1000,'declared')`,
    );
    await migrator.query("COMMIT");
    let replaySecondInsertAccepted = true;
    try {
      await migrator.query("BEGIN");
      await migrator.query(
        `INSERT INTO idempotency_registry
           (actor_identity_id, group_id, command_type, idempotency_key, body_hash, result_status)
         VALUES ('idn_a','grpA','contribution.declare','idem_c06_r',$1,'applied')`,
        [HASH_A],
      );
      await migrator.query("COMMIT");
    } catch {
      replaySecondInsertAccepted = false;
      await migrator.query("ROLLBACK").catch(() => {});
    }
    const contributionCount = await migrator.query(
      `SELECT count(*)::int AS n FROM contribution WHERE group_id='grpA' AND contribution_id='ctr_c06'`,
    );
    observations.C06_REPLAY = {
      replay_second_registry_insert_accepted: replaySecondInsertAccepted,
      contribution_count: Number(contributionCount.rows[0].n),
    };

    // ── C06-RACE : excédent bloqué par le CHECK de capacité sous verrou ──────
    // Obligation de 5000 : deux courses de 3000. La première porte active_reserved
    // à 3000 ; la seconde tenterait 6000 > due ⇒ refusée par le CHECK hérité de
    // 0001 (`active_reserved <= due_amount`), sous le verrou de la ligne. Le total
    // accepté reste 3000.
    await migrator.query(
      `INSERT INTO round (round_id, group_id, seq) VALUES ('rnd_race','grpA',2) ON CONFLICT DO NOTHING`,
    );
    await migrator.query(
      `INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount)
       VALUES ('obl_race','grpA','rnd_race','mem_a',5000) ON CONFLICT DO NOTHING`,
    );
    await migrator.query(`UPDATE obligation SET active_reserved = 3000 WHERE obligation_id = 'obl_race'`);
    let excessAccepted = true;
    try {
      await migrator.query(`UPDATE obligation SET active_reserved = 6000 WHERE obligation_id = 'obl_race'`);
    } catch {
      excessAccepted = false;
    }
    const raceReserved = await migrator.query(
      `SELECT active_reserved::int AS n FROM obligation WHERE obligation_id = 'obl_race'`,
    );
    observations.C06_RACE = {
      second_course_accepted: excessAccepted,
      accepted_total: Number(raceReserved.rows[0].n),
    };

    // ── C07-SELF / C07-TRIPLE : indépendance et anti-cumul des actes ─────────
    // Une cotisation déclarée par idn_a. Le trigger d'indépendance refuse qu'IDN_A
    // pose un acte sur SA propre déclaration ; un acteur distinct (idn_b) passe.
    // `UNIQUE (group, contribution, actor)` refuse ensuite qu'idn_b cumule un
    // second acte (confirmer puis contrôler) ; un tiers distinct (idn_c) parachève.
    await migrator.query("INSERT INTO identity (identity_id) VALUES ('idn_c') ON CONFLICT DO NOTHING");
    await app.query("BEGIN");
    await app.query("SET LOCAL kombe.group_id = 'grpA'");
    await app.query(
      `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state, declarant_identity_id)
       VALUES ('ctr_c07','grpA','obl_a',1000,'declared','idn_a')`,
    );
    await app.query("COMMIT");

    const tryAct = async (actor, act) => {
      try {
        await app.query("BEGIN");
        await app.query("SET LOCAL kombe.group_id = 'grpA'");
        await app.query(
          `INSERT INTO contribution_act (contribution_id, group_id, actor_identity_id, act)
           VALUES ('ctr_c07','grpA',$1,$2)`,
          [actor, act],
        );
        await app.query("COMMIT");
        return true;
      } catch {
        await app.query("ROLLBACK").catch(() => {});
        return false;
      }
    };
    const selfConfirmAccepted = await tryAct("idn_a", "confirm"); // attendu false (trigger)
    const distinctConfirmAccepted = await tryAct("idn_b", "confirm"); // attendu true
    const sameActorSecondAccepted = await tryAct("idn_b", "control"); // attendu false (UNIQUE)
    const thirdActorAccepted = await tryAct("idn_c", "control"); // attendu true
    observations.C07_SELF = { self_confirm_accepted: selfConfirmAccepted };
    observations.C07_TRIPLE = {
      distinct_confirm_accepted: distinctConfirmAccepted,
      same_actor_second_accepted: sameActorSecondAccepted,
      third_actor_accepted: thirdActorAccepted,
    };

    // ── C07-REVERSE : un original ne peut être compensé qu'une fois ──────────
    // La contre-écriture POINTE l'original ; l'index partiel UNIQUE interdit une
    // seconde compensation du même original (reversal_count = 1), même si deux
    // courses serveur tentent de l'écrire.
    await app.query("BEGIN");
    await app.query("SET LOCAL kombe.group_id = 'grpA'");
    await app.query(
      `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state)
       VALUES ('ctr_orig','grpA','obl_a',1000,'validated')`,
    );
    await app.query("COMMIT");
    const tryReversal = async (reversalId) => {
      try {
        await app.query("BEGIN");
        await app.query("SET LOCAL kombe.group_id = 'grpA'");
        await app.query(
          `INSERT INTO contribution (contribution_id, group_id, obligation_id, declared_amount, state, compensates_contribution_id)
           VALUES ($1,'grpA','obl_a',1000,'declared','ctr_orig')`,
          [reversalId],
        );
        await app.query("COMMIT");
        return true;
      } catch {
        await app.query("ROLLBACK").catch(() => {});
        return false;
      }
    };
    const firstReversalAccepted = await tryReversal("ctr_rev");
    const secondReversalAccepted = await tryReversal("ctr_rev2");
    const reversalCount = await migrator.query(
      `SELECT count(*)::int AS n FROM contribution WHERE compensates_contribution_id = 'ctr_orig'`,
    );
    observations.C07_REVERSE = {
      first_reversal_accepted: firstReversalAccepted,
      second_reversal_accepted: secondReversalAccepted,
      reversal_count: Number(reversalCount.rows[0].n),
    };

    // ── C07-DISPUTE : fenêtre ordinaire bornée, fraude/erreur grave hors délai ─
    // Un litige ORDINAIRE ouvert plus de 7 jours après notification est refusé par
    // le CHECK ; la FRAUDE pour le même délai reste recevable (6.5).
    const tryDispute = async (disputeId, category, gapDays) => {
      try {
        await app.query("BEGIN");
        await app.query("SET LOCAL kombe.group_id = 'grpA'");
        await app.query(
          `INSERT INTO dispute (dispute_id, group_id, state, category, reason, obligation_id, notified_at, raised_at)
           VALUES ($1,'grpA','open',$2,'motif fictif de contestation','obl_a',
                   now(), now() + make_interval(days => $3))`,
          [disputeId, category, gapDays],
        );
        await app.query("COMMIT");
        return true;
      } catch {
        await app.query("ROLLBACK").catch(() => {});
        return false;
      }
    };
    const ordinaryLateAccepted = await tryDispute("dsp_ord_late", "ordinary", 40); // attendu false
    const fraudLateAccepted = await tryDispute("dsp_fraud_late", "fraud", 40); // attendu true
    observations.C07_DISPUTE = {
      ordinary_late_accepted: ordinaryLateAccepted,
      fraud_late_accepted: fraudLateAccepted,
    };

    await app.end();

    const pass =
      observations.C01_TENANT.cross_group_rows === 0 &&
      observations.C01_FK.foreign_link_accepted === false &&
      observations.C01_POOL.leaked_rows === 0 &&
      observations.C02_RECOVERY.first_use_accepted === true &&
      observations.C02_RECOVERY.second_use_accepted === false &&
      observations.C02_SESSION.old_session_accepted === false &&
      observations.C02_SELFSCOPE.rows_visible_to_other_identity === 0 &&
      observations.C03_STATE.extended_state_accepted === true &&
      observations.C03_INVITE.first_redeem_accepted === true &&
      observations.C03_INVITE.second_redeem_accepted === false &&
      observations.C03_TENANT.cross_group_invitation_rows === 0 &&
      observations.C04_IMMUTABLE.immutable_update_accepted === false &&
      observations.C04_PENALTY.penalty_true_insert_accepted === false &&
      observations.C05_UNIQUE.second_round_same_beneficiary_accepted === false &&
      observations.C05_OBLIGATION.duplicate_member_round_accepted === false &&
      observations.C11_APPEND_ONLY.update_refused === true &&
      observations.C11_APPEND_ONLY.delete_refused === true &&
      observations.C11_APPEND_ONLY.row_present_after === 1 &&
      observations.C11_CHECKPOINT.app_insert_accepted === false &&
      observations.C11_ROLLBACK.partial_commit_count === 0 &&
      observations.C06_IDEMPOTENCE.registry_update_refused === true &&
      observations.C06_IDEMPOTENCE.duplicate_scoped_key_accepted === false &&
      observations.C06_REPLAY.replay_second_registry_insert_accepted === false &&
      observations.C06_REPLAY.contribution_count === 1 &&
      observations.C06_RACE.second_course_accepted === false &&
      observations.C06_RACE.accepted_total === 3000 &&
      observations.C07_SELF.self_confirm_accepted === false &&
      observations.C07_TRIPLE.distinct_confirm_accepted === true &&
      observations.C07_TRIPLE.same_actor_second_accepted === false &&
      observations.C07_TRIPLE.third_actor_accepted === true &&
      observations.C07_REVERSE.first_reversal_accepted === true &&
      observations.C07_REVERSE.second_reversal_accepted === false &&
      observations.C07_REVERSE.reversal_count === 1 &&
      observations.C07_DISPUTE.ordinary_late_accepted === false &&
      observations.C07_DISPUTE.fraud_late_accepted === true;

    process.stdout.write(
      JSON.stringify(
        {
          target: "kombe.db.isolation",
          status: pass ? "PASS" : "FAIL",
          observations,
          exitCode: pass ? 0 : 1,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(pass ? 0 : 1);
  } finally {
    await migrator.end();
  }
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({ target: "kombe.db.isolation", status: "FAIL", error: String(err), exitCode: 1 }, null, 2) + "\n",
  );
  process.exit(1);
});
