-- KÓMBE C07 — Validations et corrections de cotisations (stories 6.2 → 6.6).
-- Migration **additive** sur le socle 0001 et le lot C06 (0008), sans redéfinir
-- `contribution`/`obligation`/`dispute`. Elle encode la **machine à états** de la
-- cotisation (ajout de l'état `confirmed`), l'**indépendance anti-collusion**
-- (le déclarant ne valide pas sa propre déclaration ; un même acteur ne pose
-- qu'un seul acte), la **compensation unique** d'un original (au plus une contre-
-- écriture), et la **fenêtre de contestation** (litige ordinaire borné à 7 jours,
-- fraude/erreur grave toujours recevables). La résolution de décision (ordre des
-- actes, seuil de validateurs, gel des opérations dépendantes) reste côté serveur
-- (`packages/domain/src/validation.ts`) ; la base ne fait que **borner
-- structurellement** ces règles et rendre les actes **incompressibles**
-- (append-only). À rejouer sur PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Machine à états (6.2) : la cotisation peut désormais stationner en
--    `confirmed` (confirmée par un tiers, en attente de contrôle) avant
--    `validated`. L'ancienne contrainte 0001 est remplacée par son extension.
ALTER TABLE contribution DROP CONSTRAINT IF EXISTS contribution_state_check;
ALTER TABLE contribution ADD CONSTRAINT contribution_state_check
  CHECK (state IN ('declared','confirmed','validated','rejected','compensated'));

-- 2) Déclarant et seuil de contrôle (6.3, 6.4). `declarant_identity_id` porte
--    l'auteur de la déclaration (contrôle d'indépendance) ; `required_controllers`
--    fixe le nombre de contrôles distincts requis au-delà de la confirmation.
ALTER TABLE contribution
  ADD COLUMN declarant_identity_id text,
  ADD COLUMN required_controllers  integer NOT NULL DEFAULT 0
    CHECK (required_controllers >= 0);

-- 3) Compensation unique de l'original (6.2, 6.6). La contre-écriture est une
--    cotisation qui POINTE l'original qu'elle annule via `compensates_contribution_id`.
--    Un index partiel UNIQUE borne à UN seul « original compensé » : une seconde
--    contre-écriture du même original est refusée en base (reversal_count = 1),
--    indépendamment de toute course serveur.
ALTER TABLE contribution
  ADD COLUMN compensates_contribution_id text REFERENCES contribution(contribution_id);
CREATE UNIQUE INDEX contribution_one_reversal_per_original
  ON contribution (compensates_contribution_id)
  WHERE compensates_contribution_id IS NOT NULL;

-- 4) Actes de validation par IDENTITÉ (6.3, 6.4) — table append-only dédiée.
--    `UNIQUE (contribution_id, actor_identity_id)` interdit qu'un même acteur
--    cumule confirmer puis contrôler (anti-cumul). Un trigger refuse qu'un acteur
--    pose un acte sur une cotisation dont il est le DÉCLARANT (indépendance).
CREATE TABLE contribution_act (
  contribution_id   text NOT NULL REFERENCES contribution(contribution_id),
  group_id          text NOT NULL REFERENCES "group"(group_id),
  actor_identity_id text NOT NULL REFERENCES identity(identity_id),
  act               text NOT NULL CHECK (act IN ('confirm','control')),
  acted_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, contribution_id, actor_identity_id)
);

CREATE OR REPLACE FUNCTION kombe_contribution_act_independence() RETURNS trigger AS $$
DECLARE
  declarant text;
BEGIN
  SELECT declarant_identity_id INTO declarant
    FROM contribution WHERE contribution_id = NEW.contribution_id;
  IF declarant IS NOT NULL AND declarant = NEW.actor_identity_id THEN
    RAISE EXCEPTION 'independance : le declarant ne peut valider sa propre declaration'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER contribution_act_independence
  BEFORE INSERT ON contribution_act
  FOR EACH ROW EXECUTE FUNCTION kombe_contribution_act_independence();

-- Un acte posé n'est ni modifié ni effacé (journal de décision incompressible).
CREATE TRIGGER contribution_act_append_only
  BEFORE UPDATE OR DELETE ON contribution_act
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : les default privileges de roles.sql grantent le DML complet
-- à kombe_app sur toute table nouvelle. Un acte de validation exige INSERT+SELECT,
-- JAMAIS UPDATE/DELETE applicatif (le trigger reste la défense en profondeur).
REVOKE UPDATE, DELETE ON contribution_act FROM kombe_app;

ALTER TABLE contribution_act ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contribution_act
  USING (group_id = current_setting('kombe.group_id', true));

-- 5) Litige (6.5) : on précise la portée (obligation contestée), la nature
--    (`category`), le motif, et les horodatages de notification/ouverture. La
--    FENÊTRE ordinaire est bornée structurellement à 7 jours ; la fraude et
--    l'erreur grave y échappent (recevables sans condition de délai).
ALTER TABLE dispute
  ADD COLUMN obligation_id       text,
  ADD COLUMN category            text NOT NULL DEFAULT 'ordinary'
    CHECK (category IN ('ordinary','fraud','serious_error')),
  ADD COLUMN reason              text,
  ADD COLUMN notified_at         timestamptz,
  ADD COLUMN raised_at           timestamptz,
  ADD COLUMN raised_by_identity_id text;

-- Un litige porte un motif non vide (fraude d'un « je conteste » sans contenu).
ALTER TABLE dispute
  ADD CONSTRAINT dispute_reason_present
  CHECK (btrim(coalesce(reason, '')) <> '');

-- Fenêtre ordinaire : raised_at - notified_at <= 7 jours, sauf fraude/erreur grave.
ALTER TABLE dispute
  ADD CONSTRAINT dispute_ordinary_window
  CHECK (
    category <> 'ordinary'
    OR notified_at IS NULL
    OR raised_at IS NULL
    OR (raised_at - notified_at) <= interval '7 days'
  );

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C07. Ses preuves RÉELLES — indépendance
-- (le déclarant qui se confirme est refusé par le trigger, un acteur distinct
-- passe ; scénario C07-SELF), anti-cumul (un même acteur ne pose qu'un acte,
-- UNIQUE `contribution_act`, scénario C07-TRIPLE), compensation unique (seconde
-- contre-écriture du même original refusée par l'index partiel UNIQUE, scénario
-- C07-REVERSE), et fenêtre de contestation (litige ordinaire hors délai refusé
-- par le CHECK, fraude hors délai recevable, scénario C07-DISPUTE) — exigent
-- PostgreSQL 16+. Sans base, exécution **BLOCKED** (code 2) : voir
-- packages/db/README.md. Le gel des opérations dépendantes après validation et la
-- résolution de litige (gouvernance/vote) restent serveur ; aucune donnée réelle.
