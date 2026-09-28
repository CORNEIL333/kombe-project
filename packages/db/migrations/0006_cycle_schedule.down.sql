-- KÓMBE C05 — Retour arrière de 0006_cycle_schedule.sql. Retire contrainte
-- d'unicité, index partiel de rotation, FK et CHECK ajoutés, puis les nouvelles
-- colonnes de `round`. À exécuter sur PostgreSQL réel ; **BLOCKED** sinon. Ordre
-- inverse de l'application.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE obligation DROP CONSTRAINT IF EXISTS obligation_unique_member_round;
DROP INDEX IF EXISTS round_one_beneficiary_per_group;

ALTER TABLE round DROP CONSTRAINT IF EXISTS round_due_consistency;
ALTER TABLE round DROP CONSTRAINT IF EXISTS round_rules_version_fk;
ALTER TABLE round DROP CONSTRAINT IF EXISTS round_beneficiary_fk;

ALTER TABLE round
  DROP COLUMN IF EXISTS beneficiary_membership_id,
  DROP COLUMN IF EXISTS due_date_business,
  DROP COLUMN IF EXISTS due_at_utc,
  DROP COLUMN IF EXISTS rules_version;

COMMIT;
