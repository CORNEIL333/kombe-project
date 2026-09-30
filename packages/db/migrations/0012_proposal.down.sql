-- KÓMBE C09 — Retour arrière de 0012_proposal.sql. Retire dans l'ordre inverse :
-- le trigger de progression d'état, les gardes/append-only/RLS de `ballot` et sa
-- colonne `group_id`, la table `vote_electorate` (et sa fonction), la CHECK d'état
-- étendue (rétablie à la forme du socle `open/closed/cancelled`), puis les CHECK et
-- colonnes de métadonné. Le socle 0001 (tables `vote`/`ballot` et leur RLS de base)
-- et les lots antérieurs restent **intacts** ; la fonction partagée
-- `kombe_journal_append_only` appartient à 0007 et n'est PAS retirée. Idempotent
-- (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 5) Progression d'état.
DROP TRIGGER IF EXISTS vote_transition ON vote;
DROP FUNCTION IF EXISTS kombe_vote_transition();

-- 4) Gardes du bulletin + append-only + RLS + colonne de tenant.
DROP TRIGGER IF EXISTS ballot_append_only ON ballot;
DROP TRIGGER IF EXISTS ballot_guards ON ballot;
DROP FUNCTION IF EXISTS kombe_ballot_guards();
DROP POLICY IF EXISTS tenant_isolation ON ballot;
ALTER TABLE ballot DISABLE ROW LEVEL SECURITY;
ALTER TABLE ballot DROP COLUMN IF EXISTS group_id;

-- 3) Instantané d'électorat (fonction + append-only/cohérence + RLS + table).
DROP TABLE IF EXISTS vote_electorate;
DROP FUNCTION IF EXISTS kombe_vote_electorate_coherence();

-- 2) Progression d'état rétablie à la CHECK du socle. Le socle (0001) ne
--    connaît pas `executed` : une rollback sur une base où une décision a été
--    exécutée échouerait sinon (`ADD CONSTRAINT ... CHECK` valide les lignes
--    existantes). On rétrograde donc `executed` → `closed` (la décision reste
--    close approuvée ; le fait d'exécuter est un ajout C09 que l'on défait).
UPDATE vote SET state = 'closed', executed_at = NULL WHERE state = 'executed';
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_state_check;
ALTER TABLE vote
  ADD CONSTRAINT vote_state_check
  CHECK (state IN ('open', 'closed', 'cancelled'));

-- 1) Métadonné de la proposition : CHECK puis colonnes.
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_quorum_positive;
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_deadline_after_open;
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_rules_version_positive;
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_subject_present;
ALTER TABLE vote
  DROP COLUMN IF EXISTS subject_kind,
  DROP COLUMN IF EXISTS subject_ref,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS rules_version,
  DROP COLUMN IF EXISTS canonical_hash,
  DROP COLUMN IF EXISTS opened_at,
  DROP COLUMN IF EXISTS deadline,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS effective_at,
  DROP COLUMN IF EXISTS executed_at,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancel_reason,
  DROP COLUMN IF EXISTS quorum,
  DROP COLUMN IF EXISTS approved;

COMMIT;
