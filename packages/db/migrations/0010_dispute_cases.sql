-- KÓMBE C10 — Litiges et recours (stories 8.1 → 8.4).
-- Migration **additive** sur le socle 0001 et les lots C07 (0009), sans
-- redéfinir `dispute`. Elle encode structurellement le dossier de litige :
-- **correction demandée** non vide à l'ouverture (8.1), **issue documentée**
-- obligatoire pour atteindre `resolved` (8.3), **résolveurs désignés** dans une
-- table append-only dédiée dont un trigger refuse qu'ils soient le levant ou le
-- déclarant d'une cotisation de l'obligation contestée (indépendance à la
-- désignation, 8.2), et **recours lié à l'original** : `reopened_from_dispute_id`
-- ne peut pointer que le dossier lui-même (la reprise historise, elle
-- n'écrase jamais la première résolution). La résolution de décision (vue
-- commune vs détail privé, gel de clôture, fenêtres) reste côté serveur
-- (`packages/domain/src/disputes.ts`) ; la base **borne** et **incompressibilise**.
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Dossier 8.1/8.3 : correction demandée, issue utile, résolution tracée,
--    lien de recours. `state` accepte déjà ('open','resolved','reopened') (0001).
ALTER TABLE dispute
  ADD COLUMN requested_correction text,
  ADD COLUMN outcome              text,
  ADD COLUMN resolved_at          timestamptz,
  ADD COLUMN resolved_by_identity_id text,
  ADD COLUMN reopened_from_dispute_id text REFERENCES dispute(dispute_id);

-- Ouverture recevable (8.1) : la correction demandée est non vide — un
-- « je conteste » sans ce qui est demandé ne crée pas de dossier.
ALTER TABLE dispute
  ADD CONSTRAINT dispute_requested_correction_present
  CHECK (btrim(coalesce(requested_correction, '')) <> '');

-- Résolution documentée (8.3) : `resolved` n'est atteignable qu'avec une issue
-- utile non vide ET un résolveur tracé. Clôturer « au feeling » est refusé.
ALTER TABLE dispute
  ADD CONSTRAINT dispute_resolution_documented
  CHECK (
    state <> 'resolved'
    OR (
      btrim(coalesce(outcome, '')) <> ''
      AND resolved_by_identity_id IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  );

-- Recours lié à l'original (8.3) : la reprise d'un dossier ne crée pas un
-- lien circulaire vers un autre dossier ; le self-lien marque « réouverture
-- du même original », l'historique de la première résolution reste lisible
-- dans les actes append-only (jamais d'UPDATE effaceur ici).
ALTER TABLE dispute
  ADD CONSTRAINT dispute_reopen_links_self
  CHECK (
    reopened_from_dispute_id IS NULL
    OR reopened_from_dispute_id = dispute_id
  );

-- 2) Désignation des résolveurs (8.2) — table append-only dédiée.
--    `UNIQUE (dispute_id, assigned_identity_id)` : une identité n'est désignée
--    qu'une fois par dossier. Un trigger BEFORE INSERT refuse la désignation
--    d'un acteur **non indépendant** : le levant du litige, ou le déclarant
--    d'une cotisation portant sur l'obligation contestée. La désignation d'un
--    rôle ne remplace pas l'indépendance : c'est l'objet qui ferme la porte.
CREATE TABLE dispute_assignment (
  dispute_id            text NOT NULL REFERENCES dispute(dispute_id),
  group_id              text NOT NULL REFERENCES "group"(group_id),
  assigned_identity_id  text NOT NULL REFERENCES identity(identity_id),
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispute_id, assigned_identity_id)
);

CREATE OR REPLACE FUNCTION kombe_dispute_assignment_independence() RETURNS trigger AS $$
DECLARE
  raiser text;
  declarant_count integer;
BEGIN
  SELECT raised_by_identity_id INTO raiser
    FROM dispute WHERE dispute_id = NEW.dispute_id;
  IF raiser IS NOT NULL AND raiser = NEW.assigned_identity_id THEN
    RAISE EXCEPTION 'independance : le levant d''un litige ne peut le resoudre'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO declarant_count
    FROM contribution c
    JOIN dispute d ON d.dispute_id = NEW.dispute_id
   WHERE c.obligation_id = d.obligation_id
     AND c.declarant_identity_id = NEW.assigned_identity_id;
  IF declarant_count > 0 THEN
    RAISE EXCEPTION 'independance : un declarant de l''operation contestee ne peut la resoudre'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER dispute_assignment_independence
  BEFORE INSERT ON dispute_assignment
  FOR EACH ROW EXECUTE FUNCTION kombe_dispute_assignment_independence();

-- Une désignation n'est ni modifiée ni effacée (journal de décision
-- incompressible) ; la fonction partagée est propriété de 0007.
CREATE TRIGGER dispute_assignment_append_only
  BEFORE UPDATE OR DELETE ON dispute_assignment
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : INSERT+SELECT seulement pour kombe_app — une désignation
-- se prend, ne se réécrit pas (le trigger reste la défense en profondeur).
REVOKE UPDATE, DELETE ON dispute_assignment FROM kombe_app;

ALTER TABLE dispute_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dispute_assignment
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C10. Ses preuves RÉELLES — correction
-- demandée obligatoire (scénario C10-CASE), résolution sans issue refusée et
-- issue documentée acceptée (C10-RESOLVE : la base n'a AUCUN canal vers un
-- total — le dossier ne porte pas de colonne monétaire), désignation du levant
-- ou du déclarant refusée par le trigger tandis qu'un indépendant passe
-- (C10-INDEP), et réouverture liée à l'original (C10-REOPEN) — exigent
-- PostgreSQL 16+. Sans base, exécution **BLOCKED** (code 2) : voir
-- packages/db/README.md. La vue commune vs détail privé et le gel de clôture
-- restent serveur (`disputes.ts`) ; aucun montant ne transite par ce lot.
