-- KÓMBE — Fixtures FICTIVES pour le développement et la recette.
-- Aucune donnée réelle. Identifiants et montants inventés. À charger UNIQUEMENT
-- dans une base de test isolée (Testcontainers) après 0001_init.sql.
-- L'exécution réelle est BLOCKED sans PostgreSQL (voir README).

BEGIN;
SET LOCAL kombe.group_id = 'grp_fictif_1';

INSERT INTO identity (identity_id) VALUES
  ('idn_alice'), ('idn_bob'), ('idn_carole');

INSERT INTO "group" (group_id, state, version) VALUES
  ('grp_fictif_1', 'active', 1),
  ('grp_fictif_2', 'active', 1);

INSERT INTO membership (membership_id, group_id, identity_id, state) VALUES
  ('mem_alice_1', 'grp_fictif_1', 'idn_alice',  'active'),
  ('mem_bob_1',   'grp_fictif_1', 'idn_bob',    'active'),
  ('mem_carole_1','grp_fictif_1', 'idn_carole', 'active');

INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at) VALUES
  ('rol_anim_1',  'grp_fictif_1', 'mem_alice_1', 'animator',  now()),
  ('rol_tres_1',  'grp_fictif_1', 'mem_bob_1',   'treasurer', now());

-- Règle snapshot (rotation de 3 membres, cotisation 5 000 XAF).
INSERT INTO rule_version (group_id, rules_version, snapshot) VALUES
  ('grp_fictif_1', 1, '{"members":3,"contribution":5000,"tz":"Africa/Douala"}'::jsonb);

INSERT INTO round (round_id, group_id, seq, state) VALUES
  ('rnd_fictif_1', 'grp_fictif_1', 1, 'open');

INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount, version) VALUES
  ('obl_fictif_1', 'grp_fictif_1', 'rnd_fictif_1', 'mem_carole_1', 5000, 1);

COMMIT;
