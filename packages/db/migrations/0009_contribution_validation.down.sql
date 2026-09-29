-- KÓMBE C07 — Retour arrière de 0009_contribution_validation.sql. Retire dans
-- l'ordre inverse : colonnes/contraintes de litige, table `contribution_act`
-- (triggers/RLS/table), colonnes et index de compensation/validation de
-- `contribution`, et restauration de la contrainte d'état 0001. La fonction
-- partagée `kombe_journal_append_only` appartient à 0007 et n'est PAS retirée.
-- Le socle 0001 et le lot C06 (0008) restent intacts. Idempotent (IF EXISTS).
-- À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 5) Litige : contraintes puis colonnes ajoutées.
ALTER TABLE dispute DROP CONSTRAINT IF EXISTS dispute_ordinary_window;
ALTER TABLE dispute DROP CONSTRAINT IF EXISTS dispute_reason_present;
ALTER TABLE dispute
  DROP COLUMN IF EXISTS obligation_id,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS notified_at,
  DROP COLUMN IF EXISTS raised_at,
  DROP COLUMN IF EXISTS raised_by_identity_id;

-- 4) Actes de validation (trigger + append-only + RLS + table).
DROP TABLE IF EXISTS contribution_act;
DROP FUNCTION IF EXISTS kombe_contribution_act_independence();

-- 3) Compensation unique : index partiel puis colonne de liaison.
DROP INDEX IF EXISTS contribution_one_reversal_per_original;
ALTER TABLE contribution DROP COLUMN IF EXISTS compensates_contribution_id;

-- 2) Déclarant et seuil de contrôle.
ALTER TABLE contribution
  DROP COLUMN IF EXISTS declarant_identity_id,
  DROP COLUMN IF EXISTS required_controllers;

-- 1) Machine à états : restauration de la contrainte d'état d'origine (0001).
ALTER TABLE contribution DROP CONSTRAINT IF EXISTS contribution_state_check;
ALTER TABLE contribution ADD CONSTRAINT contribution_state_check
  CHECK (state IN ('declared','validated','rejected','compensated'));

COMMIT;
