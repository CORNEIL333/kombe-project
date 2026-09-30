-- KÓMBE C08 — Retour arrière de 0011_disbursement.sql. Retire dans l'ordre
-- inverse : tables filles `disbursement_act` et `disbursement_reversal`
-- (triggers/RLS/fonctions dédiées), contraintes et colonnes de correction, le
-- marqueur `refunded_externally`, la contrainte de séparation des pouvoirs, puis
-- les colonnes de portée/montants. Le socle 0001 (table `disbursement`, sa CHECK
-- d'état à 4 valeurs et sa RLS) et les lots antérieurs restent **intacts** ; la
-- fonction partagée `kombe_journal_append_only` appartient à 0007 et n'est PAS
-- retirée. Idempotent (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 6) Actes de contrôle (triggers + append-only + RLS + table + fonction dédiée).
DROP TABLE IF EXISTS disbursement_act;
DROP FUNCTION IF EXISTS kombe_disbursement_act_independence();

-- 5) Contre-écriture unique structurelle (triggers + append-only + RLS + table).
DROP TABLE IF EXISTS disbursement_reversal;
DROP FUNCTION IF EXISTS kombe_disbursement_reversal_independence();

-- 4) Demande de correction : contrainte de motif puis colonnes.
ALTER TABLE disbursement DROP CONSTRAINT IF EXISTS disbursement_reversal_reason_present;
ALTER TABLE disbursement
  DROP COLUMN IF EXISTS reversal_requested_by,
  DROP COLUMN IF EXISTS reversal_reason;

-- 3) Jamais-remboursé-externe.
ALTER TABLE disbursement DROP COLUMN IF EXISTS refunded_externally;

-- 2) Séparation des pouvoirs.
ALTER TABLE disbursement DROP CONSTRAINT IF EXISTS disbursement_substitute_required;

-- 1) Portée et montants : FK obligation puis colonnes.
ALTER TABLE disbursement DROP CONSTRAINT IF EXISTS disbursement_obligation_fkey;
ALTER TABLE disbursement
  DROP COLUMN IF EXISTS obligation_id,
  DROP COLUMN IF EXISTS beneficiary_identity_id,
  DROP COLUMN IF EXISTS declarant_identity_id,
  DROP COLUMN IF EXISTS net_amount,
  DROP COLUMN IF EXISTS group_fees,
  DROP COLUMN IF EXISTS personal_fees_out_of_pot,
  DROP COLUMN IF EXISTS required_controllers,
  DROP COLUMN IF EXISTS alleged_date,
  DROP COLUMN IF EXISTS server_date;

COMMIT;
