-- KÓMBE C08 — Décaissements, corrections, rapprochement et clôture (6.10, 18.4, 18.9, 2.8).
-- Migration **additive** sur le socle 0001 (table `disbursement` et ses 4 états
-- `requested`/`reversal_requested`/`reversed`/`completed` + RLS existent déjà), sans
-- la redéfinir. Elle encode structurellement en base les invariants que le domaine
-- (`packages/domain/src/disbursement.ts`) décide à l'exécution : la **séparation des
-- pouvoirs** (déclarant ≠ bénéficiaire, tous deux connus — un suppléant déclare), la
-- **contre-écriture unique** d'une correction (table `disbursement_reversal` dont la
-- CLÉ PRIMAIRE est le décaissement reversé : deux contre-écritures concurrentes
-- s'affrontent sur la même clé, une seule gagne — borne structurelle, pas un simple
-- compteur), le **jamais-remboursé-externe** (`refunded_externally` figé à `false`),
-- les **frais groupe distincts des frais personnels hors pot**, et
-- l'**indépendance/anti-cumul du contrôle** par une table d'actes append-only. La
-- décision de clôture (écart nul, litige, impayé) et le rapprochement restent
-- serveur via l'oracle indépendant `reconciliation` ; la base ne fait que **borner**
-- ces règles et rendre les actes **incompressibles**. À rejouer sur PostgreSQL réel ;
-- **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Portée et montants (6.10, 18.4). La table 0001 ne portait qu'un `amount`
--    global ; C08 distingue le **net bénéficiaire**, les **frais groupe** (imputés
--    au pot, comptés au rapprochement) et les **frais personnels hors pot** (JAMAIS
--    déduits du rapprochement). L'obligation soldée, le bénéficiaire et le déclarant
--    sont rendus explicites pour l'indépendance ; le seuil de contrôleurs aussi.
--    Bénéficiaire et déclarant sont **NOT NULL** : la séparation des pouvoirs du
--    point 2 ne peut pas être contournée en laissant une des deux colonnes vide.
--    `obligation_id` est NOT NULL et ancré au tenant par FK composée
--    `(group_id, obligation_id)` vers `obligation` (convention du socle 0001 pour
--    `contribution`) : un décaissement ne peut pointer une obligation inexistante
--    ou d'un autre groupe.
ALTER TABLE disbursement
  ADD COLUMN obligation_id           text NOT NULL,
  ADD COLUMN beneficiary_identity_id text NOT NULL REFERENCES identity(identity_id),
  ADD COLUMN declarant_identity_id   text NOT NULL REFERENCES identity(identity_id),
  ADD COLUMN net_amount              kombe_money NOT NULL DEFAULT 0,
  ADD COLUMN group_fees              kombe_money NOT NULL DEFAULT 0,
  ADD COLUMN personal_fees_out_of_pot kombe_money NOT NULL DEFAULT 0,
  ADD COLUMN required_controllers    integer NOT NULL DEFAULT 0 CHECK (required_controllers >= 0),
  ADD COLUMN alleged_date            timestamptz,
  ADD COLUMN server_date             timestamptz;

ALTER TABLE disbursement
  ADD CONSTRAINT disbursement_obligation_fkey
  FOREIGN KEY (group_id, obligation_id) REFERENCES obligation(group_id, obligation_id);

-- 2) Séparation des pouvoirs (6.10). Le déclarant ne peut être le bénéficiaire de
--    son propre décaissement : un suppléant doit déclarer. Contrainte structurelle
--    directe (colonnes NOT NULL), indépendante d'une course serveur.
ALTER TABLE disbursement
  ADD CONSTRAINT disbursement_substitute_required
  CHECK (declarant_identity_id <> beneficiary_identity_id);

-- 3) Jamais de remboursement automatique externe (18.9). Corriger un décaissement
--    n'annule pas un mouvement bancaire réel : `refunded_externally` est figé à
--    `false` par une CHECK — impossible à mettre à `true` en base.
ALTER TABLE disbursement
  ADD COLUMN refunded_externally boolean NOT NULL DEFAULT false
    CHECK (refunded_externally = false);

-- 4) Demande de correction portée sur l'ORIGINAL (conservé, jamais effacé) :
--    demandeur et motif non vide. Le **nombre** de contre-écritures n'est PAS
--    borné ici par un compteur (deux transactions concurrentes lisant 0
--    écriraient toutes deux 1) — l'unicité réelle est structurelle au point 5.
ALTER TABLE disbursement
  ADD COLUMN reversal_requested_by text,
  ADD COLUMN reversal_reason       text;

-- Une demande de correction porte un motif non vide (quand elle existe).
ALTER TABLE disbursement
  ADD CONSTRAINT disbursement_reversal_reason_present
  CHECK (reversal_requested_by IS NULL OR btrim(coalesce(reversal_reason, '')) <> '');

-- 5) Contre-écriture UNIQUE d'une correction (6.10, 18.9, C08-CORRECTION). Table
--    dédiée dont la **clé primaire est le décaissement reversé** : un original
--    ne peut porter qu'**une seule** contre-écriture, deux INSERT concurrents
--    s'affrontent sur la même clé et un seul est accepté (unicité structurelle
--    garantie par l'index unique, pas par une CHECK lisible-modifiable).
--    L'approbateur est une identité réelle (FK) et ne peut être ni le déclarant,
--    ni le bénéficiaire, ni le demandeur de la correction — vérifié par trigger,
--    miroir de `approveDisbursementReversal` côté domaine.
CREATE TABLE disbursement_reversal (
  disbursement_id        text PRIMARY KEY REFERENCES disbursement(disbursement_id),
  group_id               text NOT NULL REFERENCES "group"(group_id),
  approved_by_identity_id text NOT NULL REFERENCES identity(identity_id),
  reversal_reason        text NOT NULL CHECK (btrim(reversal_reason) <> ''),
  reversed_at            timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION kombe_disbursement_reversal_independence() RETURNS trigger AS $$
DECLARE
  declarant   text;
  beneficiary text;
  requester   text;
  src_state   text;
BEGIN
  SELECT declarant_identity_id, beneficiary_identity_id, reversal_requested_by, state
    INTO declarant, beneficiary, requester, src_state
    FROM disbursement WHERE disbursement_id = NEW.disbursement_id;
  IF NEW.group_id IS DISTINCT FROM (
       SELECT group_id FROM disbursement WHERE disbursement_id = NEW.disbursement_id
     ) THEN
    RAISE EXCEPTION 'coherence : le groupe de la contre-ecriture differe de celui du decaissement'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Miroir de `approveDisbursementReversal` (domaine) : on ne contre-écrit que sur
  -- une demande de correction PREALABLEMENT posee et un original en etat
  -- `reversal_requested`. Sans ces deux gardes, la base laisserait reverser un
  -- original jamais conteste (ce que le domaine refuse).
  IF requester IS NULL THEN
    RAISE EXCEPTION 'correction : aucune demande de correction ne precede la contre-ecriture'
      USING ERRCODE = 'check_violation';
  END IF;
  IF src_state IS DISTINCT FROM 'reversal_requested' THEN
    RAISE EXCEPTION 'correction : etat reversal_requested requis sur l original'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.approved_by_identity_id = declarant THEN
    RAISE EXCEPTION 'independance : le declarant ne valide pas la contre-ecriture de son decaissement'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.approved_by_identity_id = beneficiary THEN
    RAISE EXCEPTION 'independance : le beneficiaire ne juge pas sa propre cause'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.approved_by_identity_id = requester THEN
    RAISE EXCEPTION 'independance : le demandeur de la correction ne l approuve pas seul'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER disbursement_reversal_independence
  BEFORE INSERT ON disbursement_reversal
  FOR EACH ROW EXECUTE FUNCTION kombe_disbursement_reversal_independence();

-- Une contre-écriture posée n'est ni modifiée ni effacée (décision incompressible).
CREATE TRIGGER disbursement_reversal_append_only
  BEFORE UPDATE OR DELETE ON disbursement_reversal
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : contre-écriture = INSERT+SELECT, JAMAIS UPDATE/DELETE applicatif.
REVOKE UPDATE, DELETE ON disbursement_reversal FROM kombe_app;

ALTER TABLE disbursement_reversal ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON disbursement_reversal
  USING (group_id = current_setting('kombe.group_id', true));

-- 6) Actes de contrôle par IDENTITÉ (6.10) — table append-only dédiée, miroir de
--    `contribution_act` (C07). `UNIQUE (group_id, disbursement_id, actor_identity_id)`
--    interdit qu'un même acteur pose deux actes sur le même décaissement
--    (anti-cumul). Un trigger impose les trois gardes annoncées par le domaine :
--    le **déclarant** ne contrôle pas son propre décaissement, seul le
--    **bénéficiaire confirme**, et le **contrôle suppose la confirmation
--    préalable**. Note : `disbursement` porte une PRIMARY KEY globale sur
--    `disbursement_id` (0001) — une FK composée `(group_id, disbursement_id)`
--    n'ajouterait aucune protection d'unicité ici ; la cohérence de groupe est
--    donc vérifiée par le trigger de chaque table fille.
CREATE TABLE disbursement_act (
  disbursement_id     text NOT NULL REFERENCES disbursement(disbursement_id),
  group_id            text NOT NULL REFERENCES "group"(group_id),
  actor_identity_id   text NOT NULL REFERENCES identity(identity_id),
  act                 text NOT NULL CHECK (act IN ('confirm','control')),
  acted_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, disbursement_id, actor_identity_id)
);

CREATE OR REPLACE FUNCTION kombe_disbursement_act_independence() RETURNS trigger AS $$
DECLARE
  declarant   text;
  beneficiary text;
BEGIN
  SELECT declarant_identity_id, beneficiary_identity_id
    INTO declarant, beneficiary
    FROM disbursement WHERE disbursement_id = NEW.disbursement_id;
  IF NEW.group_id IS DISTINCT FROM (
       SELECT group_id FROM disbursement WHERE disbursement_id = NEW.disbursement_id
     ) THEN
    RAISE EXCEPTION 'coherence : le groupe de l acte differe de celui du decaissement'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.act = 'control' AND NEW.actor_identity_id = declarant THEN
    RAISE EXCEPTION 'independance : le declarant ne controle pas son propre decaissement'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.act = 'confirm' AND NEW.actor_identity_id IS DISTINCT FROM beneficiary THEN
    RAISE EXCEPTION 'seul le beneficiaire confirme son decaissement'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.act = 'control' AND NOT EXISTS (
       SELECT 1 FROM disbursement_act a
        WHERE a.disbursement_id = NEW.disbursement_id AND a.act = 'confirm'
     ) THEN
    RAISE EXCEPTION 'le controle suppose la confirmation prealable du beneficiaire'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER disbursement_act_independence
  BEFORE INSERT ON disbursement_act
  FOR EACH ROW EXECUTE FUNCTION kombe_disbursement_act_independence();

-- Un acte posé n'est ni modifié ni effacé (journal de décision incompressible).
CREATE TRIGGER disbursement_act_append_only
  BEFORE UPDATE OR DELETE ON disbursement_act
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : contrôle = INSERT+SELECT, JAMAIS UPDATE/DELETE applicatif.
REVOKE UPDATE, DELETE ON disbursement_act FROM kombe_app;

ALTER TABLE disbursement_act ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON disbursement_act
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C08. Ses preuves RÉELLES — séparation des
-- pouvoirs (déclaration par le bénéficiaire refusée par la CHECK NOT NULL
-- `disbursement_substitute_required`), contre-écriture unique (seconde
-- INSERT dans `disbursement_reversal` refusé par la CLÉ PRIMAIRE — unicité
-- structurelle sous concurrence, scénario C08-CORRECTION), indépendance de
-- l'approbateur (trigger `disbursement_reversal_independence` : déclarant,
-- bénéficiaire et demandeur exclus), jamais-remboursé-externe
-- (`refunded_externally = true` refusé par la CHECK), indépendance/anti-cumul
-- du contrôle (`UNIQUE disbursement_act` + trigger à trois gardes), et le
-- rapprochement/verrou réel sous charge concurrente — exigent PostgreSQL 16+.
-- Sans base, exécution **BLOCKED** (code 2) : voir packages/db/README.md. La
-- décision de clôture normale (écart nul, litige, impayé) et l'arrêt
-- exceptionnel restent serveur (oracle `reconciliation`, entrées détenues
-- serveur) ; aucune donnée réelle, KÓMBE n'exécute aucun transfert.
-- PROCÉDURE NOT NULL : `obligation_id`/`beneficiary_identity_id`/
-- `declarant_identity_id` sont ajoutés NOT NULL sans défaut. Sur une table
-- `disbursement` DÉJÀ peuplée, un `ADD COLUMN NOT NULL` nu échoue (23502) : la
-- passe réelle doit alors procéder en trois temps (ajout nullable → backfill
-- depuis les obligations/identités existantes → `SET NOT NULL` + FK/CHECK). Le
-- pilote C08 écrivant depuis le début avec ces colonnes, la table est vide à
-- l'application ; cette exigence est consignée ici, non masquée.
