-- KÓMBE — AMORÇAGE TONTINE PERSISTÉ (C03 §2.1–2.3, C05 §5.3, C21, parrainage).
-- Additif : le socle 0001/0004 ne portait que (group_id, state, version) ;
-- l'UI/API d'amorçage (créer une tontine avec nom, modèle, typologie, parent
-- de supervision) n'avait AUCUN support de persistance, et le parrainage
-- (cooptation) aucune table. Cette migration comble la dérive, sans modifier
-- 0001/0004. Les valeurs par défaut sont calées sur les invariants du domaine
-- (@kombe/domain/src/tontine.ts) : XAF, Africa/Douala, rotation fermée,
-- modèle « personnalise ».

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Colonnes d'identité et d'amorçage du groupe.
ALTER TABLE "group" ADD COLUMN display_name text;                      -- nom affiché (nullable : défaut = group_id côté store)
ALTER TABLE "group" ADD COLUMN tontine_model text NOT NULL DEFAULT 'personnalise'
  CHECK (tontine_model IN ('famille','collegues','fetes','construction','etudiant','personnalise'));
ALTER TABLE "group" ADD COLUMN rotation_type text NOT NULL DEFAULT 'rotative_fermee'
  CHECK (rotation_type IN ('rotative_fermee','tirage','negocie'));
ALTER TABLE "group" ADD COLUMN currency text NOT NULL DEFAULT 'XAF'
  CHECK (currency = 'XAF');
ALTER TABLE "group" ADD COLUMN timezone text NOT NULL DEFAULT 'Africa/Douala';
ALTER TABLE "group" ADD COLUMN minimum_members integer NOT NULL DEFAULT 3
  CHECK (minimum_members BETWEEN 2 AND 1000);
ALTER TABLE "group" ADD COLUMN required_independent_roles integer NOT NULL DEFAULT 4
  CHECK (required_independent_roles BETWEEN 0 AND 10);

-- Hiérarchie parent/enfant (une association supervise un portefeuille, C21).
-- Auto-parent exclu par la garde domaine ; la profondeur est bornée au domaine
-- (une chaîne SQL circulaire est refusée à l'écriture applicative).
ALTER TABLE "group" ADD COLUMN parent_group_id text REFERENCES "group"(group_id);
CREATE INDEX IF NOT EXISTS group_parent_idx ON "group"(parent_group_id) WHERE parent_group_id IS NOT NULL;

-- Découvrabilité + code d'adhésion (rejoindre sans invitation directe).
ALTER TABLE "group" ADD COLUMN is_discoverable boolean NOT NULL DEFAULT false;
ALTER TABLE "group" ADD COLUMN join_code text UNIQUE;

COMMENT ON COLUMN "group".parent_group_id IS
  'Groupe faîtier de supervision ; ne confère AUCUN droit financier (C21).';

-- Parrainage / cooptation : un membre actif cautionne un candidat.
CREATE TABLE sponsorship (
  sponsorship_id text PRIMARY KEY,
  group_id       text NOT NULL REFERENCES "group"(group_id),
  candidate_id   text NOT NULL REFERENCES identity(identity_id),
  sponsor_id     text NOT NULL REFERENCES identity(identity_id),
  state          text NOT NULL DEFAULT 'requested'
                 CHECK (state IN ('requested','endorsed','rejected','withdrawn')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  -- Un candidat ne peut se parrainer lui-même (garde domaine) ; cohérence DB.
  CHECK (candidate_id <> sponsor_id)
);

-- Une seule demande OUVERTE par (groupe, candidat) ; les tranchées historiques
-- restent conservées (index partiel, compatible Neon/pgbouncer).
CREATE UNIQUE INDEX sponsorship_open_one
  ON sponsorship (group_id, candidate_id) WHERE state = 'requested';

ALTER TABLE sponsorship ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sponsorship
  USING (group_id = current_setting('kombe.group_id', true));

-- Moindre privilège : lecture/insert/mise à jour (décision), jamais suppression
-- (un parrainage tranché reste dans l'audit trail).
GRANT SELECT, INSERT, UPDATE ON sponsorship TO kombe_app;
REVOKE DELETE ON sponsorship FROM kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat d'amorçage. Sa preuve réelle (création persistée
-- avec modèle/typologie/parent, refus serveur d'une typologie P1 au démarrage,
-- parrain non membre rejeté, unicité d'une demande ouverte, isolation RLS du
-- parrainage) exige PostgreSQL 16+ réel — voir packages/api/test/
-- pgOnboardingStore.proof.mjs.
