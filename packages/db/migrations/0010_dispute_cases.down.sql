-- KÓMBE C10 — Retour arrière de 0010_dispute_cases.sql. Retire dans l'ordre
-- inverse : table `dispute_assignment` (triggers/RLS/table) et sa fonction,
-- puis contraintes et colonnes ajoutées à `dispute`. La fonction partagée
-- `kombe_journal_append_only` appartient à 0007 et n'est PAS retirée. Les
-- socles 0001 et les lots C06/C07 (0008/0009) restent intacts. Idempotent
-- (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 2) Désignations des résolveurs (trigger + append-only + RLS + table).
DROP TABLE IF EXISTS dispute_assignment;
DROP FUNCTION IF EXISTS kombe_dispute_assignment_independence();

-- 1) Dossier de litige : contraintes puis colonnes ajoutées.
ALTER TABLE dispute DROP CONSTRAINT IF EXISTS dispute_reopen_links_self;
ALTER TABLE dispute DROP CONSTRAINT IF EXISTS dispute_resolution_documented;
ALTER TABLE dispute DROP CONSTRAINT IF EXISTS dispute_requested_correction_present;
ALTER TABLE dispute
  DROP COLUMN IF EXISTS requested_correction,
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by_identity_id,
  DROP COLUMN IF EXISTS reopened_from_dispute_id;

COMMIT;
