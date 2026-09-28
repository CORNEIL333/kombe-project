-- KÓMBE C11 — Retour arrière de 0007_event_journal.sql. Retire dans l'ordre
-- inverse : checkpoint (et sa RLS/trigger), trigger/fonction append-only, puis
-- les colonnes d'enveloppe ajoutées au journal. Le socle 0001 (journal/outbox)
-- reste intact. Idempotent (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED
-- sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS checkpoint;

DROP TRIGGER IF EXISTS journal_append_only ON journal;
DROP FUNCTION IF EXISTS kombe_journal_append_only();

-- Rétablit le droit applicatif retiré (aligné sur le grant par défaut de 0001).
GRANT UPDATE, DELETE ON journal TO kombe_app;

ALTER TABLE journal
  DROP COLUMN IF EXISTS actor_identity_id,
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS command_id,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS rules_version;

COMMIT;
