-- KÓMBE C06 — Retour arrière de 0008_contribution_idempotency.sql. Retire dans
-- l'ordre inverse : registre d'idempotence (trigger/RLS/table), colonnes ajoutées
-- à `command` et `contribution`. La fonction partagée `kombe_journal_append_only`
-- appartient à 0007 et n'est PAS retirée ici. Le socle 0001 reste intact.
-- Idempotent (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS idempotency_registry;

ALTER TABLE contribution
  DROP CONSTRAINT IF EXISTS contribution_electronic_reference;
ALTER TABLE contribution
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS reference,
  DROP COLUMN IF EXISTS justification,
  DROP COLUMN IF EXISTS alleged_date,
  DROP COLUMN IF EXISTS server_date;

ALTER TABLE command
  DROP COLUMN IF EXISTS actor_identity_id,
  DROP COLUMN IF EXISTS command_type,
  DROP COLUMN IF EXISTS body_hash;

COMMIT;
