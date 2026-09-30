-- KÓMBE C09 — Propositions, votes et décisions (7.1 → 7.5, 18.5).
-- Migration **additive** sur le socle 0001, qui définissait déjà `vote` (avec
-- `state`, `quorum_num/den`, `electorate_size`, `frozen_electors` en `bigint[]`,
-- `version`) et `ballot` (CLÉ PRIMAIRE `(vote_id, identity_id)` = **un seul
-- bulletin par électeur**, déjà structurelle). Elle n'efface rien et encode en
-- base les invariants que le domaine (`packages/domain/src/proposal.ts`) décide à
-- l'exécution : le **métadaté de décision** (objet lié, motif, version de règles,
-- empreinte canonique, échéance SERVEUR), l'**instantané d'électorat réel** (une
-- table `vote_electorate` à FK — le dénominateur figé du quorum, pas un tableau
-- opaque), l'**éligibilité** (un bulletin n'existe que pour un électeur figé), le
-- **vote interdit hors délai / après clôture**, la **progression d'état**
-- (open → closed → executed, ou annulation motivée ; une décision exécutée ne
-- s'annule pas) et l'**exécution seulement si approuvée**. Le calcul du résultat
-- (quorum ceil, majorité stricte, abstentions au seul quorum, zéro suffrage
-- rejette) reste l'**oracle indépendant** `voteResult` côté serveur ; la base ne
-- fait que **borner** ces règles et rendre bulletins/instantanés **incompressibles**.
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Métadonné de la proposition/volée (7.1, 7.4). Colonnes ajoutées avec défauts
--    pour rester additives ; la **présence** effective est gardée par CHECK (un
--    défaut vide est refusé dès qu'une écriture réelle arrive). `deadline` est
--    l'échéance SERVEUR (le client ne la décide pas) ; `effective_at` la date
--    d'effet posée à la clôture (jamais rétroactive).
ALTER TABLE vote
  ADD COLUMN subject_kind   text NOT NULL DEFAULT '',
  ADD COLUMN subject_ref    text NOT NULL DEFAULT '',
  ADD COLUMN reason         text NOT NULL DEFAULT '',
  ADD COLUMN rules_version  integer NOT NULL DEFAULT 1,
  ADD COLUMN canonical_hash text NOT NULL DEFAULT '',
  ADD COLUMN opened_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deadline       timestamptz,
  ADD COLUMN closed_at      timestamptz,
  ADD COLUMN effective_at   timestamptz,
  ADD COLUMN executed_at    timestamptz,
  ADD COLUMN cancelled_at   timestamptz,
  ADD COLUMN cancel_reason  text,
  ADD COLUMN quorum         integer,   -- figé à la clôture (projection, recalculable)
  ADD COLUMN approved       boolean;   -- figé à la clôture par l'oracle serveur

-- Objet + motif obligatoires (non vides) — miroir des refus `PROPOSAL_REASON_REQUIRED`.
ALTER TABLE vote
  ADD CONSTRAINT vote_subject_present
  CHECK (
    btrim(subject_kind) <> '' AND btrim(subject_ref) <> ''
    AND btrim(reason) <> '' AND btrim(canonical_hash) <> ''
  );
ALTER TABLE vote ADD CONSTRAINT vote_rules_version_positive CHECK (rules_version >= 1);
-- Échéance SERVEUR OBLIGATOIRE d'une volée : borne de la fenêtre de vote, le
-- client ne la décide pas. Colonne ajoutée nullable (addition sûre sur table
-- potentiellement peuplée), puis backfill et verrou NOT NULL — ainsi le garde-fou
-- `kombe_ballot_guards` (bulletin hors délai refusé) ne peut être désarmé par une
-- simple ligne sans échéance. Table vide au pilote → backfill sans perte.
UPDATE vote SET deadline = opened_at + interval '1 hour' WHERE deadline IS NULL;
ALTER TABLE vote ALTER COLUMN deadline SET NOT NULL;
ALTER TABLE vote ADD CONSTRAINT vote_deadline_after_open CHECK (deadline > opened_at);
-- Le résultat figé, s'il existe, cohérent avec un quorum positif.
ALTER TABLE vote ADD CONSTRAINT vote_quorum_positive CHECK (quorum IS NULL OR quorum >= 0);

-- 2) Progression d'état : le socle autorisait `open/closed/cancelled`. C09 ajoute
--    `executed` (exécution d'une décision approuvée). On remplace la CHECK.
ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_state_check;
ALTER TABLE vote
  ADD CONSTRAINT vote_state_check
  CHECK (state IN ('open', 'closed', 'executed', 'cancelled'));

-- 3) Instantané d'électorat **réel** (7.3, 18.5) : une table à FK, source du
--    dénominateur figé et de l'éligibilité. La CLÉ PRIMAIRE `(vote_id, identity_id)`
--    interdit de figer deux fois le même électeur ; `group_id` ancré au tenant.
CREATE TABLE vote_electorate (
  vote_id     text NOT NULL REFERENCES vote(vote_id),
  group_id    text NOT NULL REFERENCES "group"(group_id),
  identity_id text NOT NULL REFERENCES identity(identity_id),
  frozen_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vote_id, identity_id)
);

CREATE OR REPLACE FUNCTION kombe_vote_electorate_coherence() RETURNS trigger AS $$
BEGIN
  IF NEW.group_id IS DISTINCT FROM (
       SELECT group_id FROM vote WHERE vote_id = NEW.vote_id
     ) THEN
    RAISE EXCEPTION 'coherence : le groupe de lelectorat differe de celui du vote'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER vote_electorate_coherence
  BEFORE INSERT ON vote_electorate
  FOR EACH ROW EXECUTE FUNCTION kombe_vote_electorate_coherence();

-- Instantané figé : un électeur scellé n'est ni retiré ni déplacé (le
-- dénominateur ne bouge pas en cours de volée ; le changer = annuler et rouvrir).
CREATE TRIGGER vote_electorate_append_only
  BEFORE UPDATE OR DELETE ON vote_electorate
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON vote_electorate FROM kombe_app;

ALTER TABLE vote_electorate ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vote_electorate
  USING (group_id = current_setting('kombe.group_id', true));

-- 4) Bulletin : le socle garantissait déjà l'unicité (PK `(vote_id, identity_id)`).
--    On y ancre le `group_id` (pour la RLS et la cohérence) et on ajoute les gardes
--    métier du domaine : **éligibilité** (l'identité figure dans l'instantané
--    figé), **volée ouverte** (aucun vote après clôture/annulation/exécution) et
--    **dans le délai SERVEUR** (base sur l'horloge serveur PostgreSQL, `now()`).
ALTER TABLE ballot ADD COLUMN group_id text;

CREATE OR REPLACE FUNCTION kombe_ballot_guards() RETURNS trigger AS $$
DECLARE
  v_state    text;
  v_group    text;
  v_deadline timestamptz;
BEGIN
  SELECT state, group_id, deadline
    INTO v_state, v_group, v_deadline
    FROM vote WHERE vote_id = NEW.vote_id;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'vote introuvable pour ce bulletin' USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- Cohérence de tenant : le bulletin hérite le groupe du vote (et n'est jamais
  -- posé sous un autre groupe par un acteur d'un groupe tiers).
  NEW.group_id := v_group;
  -- Pas de bulletin après la fin de la volée (7.2 : état doit rester `open`).
  IF v_state <> 'open' THEN
    RAISE EXCEPTION 'vote refuse : la volee est %', v_state
      USING ERRCODE = 'check_violation';
  END IF;
  -- Pas de bulletin après l'échéance SERVEUR (C09-LATE) ; l'horloge serveur juge,
  -- jamais une date fournie par le client. `deadline` est NOT NULL (verrouillé
  -- plus haut) : une volée sans échéance est une violation d'invariant, refusée
  -- et non un blanc-seing.
  IF v_deadline IS NULL THEN
    RAISE EXCEPTION 'volee sans echeance serveur (invariant 0012 viole)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF now() > v_deadline THEN
    RAISE EXCEPTION 'vote hors delai serveur' USING ERRCODE = 'check_violation';
  END IF;
  -- Éligibilité : seuls les électeurs figés à l'ouverture peuvent voter.
  IF NOT EXISTS (
       SELECT 1 FROM vote_electorate ve
        WHERE ve.vote_id = NEW.vote_id AND ve.identity_id = NEW.identity_id
     ) THEN
    RAISE EXCEPTION 'non electeur : %(figure pas dans l instantanie fige)', NEW.identity_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ballot_guards
  BEFORE INSERT ON ballot
  FOR EACH ROW EXECUTE FUNCTION kombe_ballot_guards();

-- Un bulletin posé n'est ni modifié ni effacé (vote identifié, incompressible).
CREATE TRIGGER ballot_append_only
  BEFORE UPDATE OR DELETE ON ballot
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON ballot FROM kombe_app;

ALTER TABLE ballot ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ballot
  USING (group_id = current_setting('kombe.group_id', true));

-- 5) Progression légale de l'état d'une proposition (7.4, 18.5). Transition
--    monotone et gestarde : `open → closed` (ou `cancelled`), `closed → executed`
--    (ou `cancelled`), **exécuté** figé. Une exécution exige l'approbation
--    collective (`approved = true`) ; on ne « rouvre » jamais une volée close.
CREATE OR REPLACE FUNCTION kombe_vote_transition() RETURNS trigger AS $$
DECLARE
  legal boolean;
BEGIN
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;
  legal := (
       (OLD.state = 'open'     AND NEW.state IN ('closed', 'cancelled'))
    OR (OLD.state = 'closed'   AND NEW.state IN ('executed', 'cancelled'))
  );
  IF NOT legal THEN
    RAISE EXCEPTION 'transition interdit : % -> %', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'executed' AND NEW.approved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'execution refusee : decision non approuvee collectivement'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'executed' AND OLD.executed_at IS NOT NULL THEN
    RAISE EXCEPTION 'execution deja passee (idempotence structurelle)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER vote_transition
  BEFORE UPDATE OF state ON vote
  FOR EACH ROW EXECUTE FUNCTION kombe_vote_transition();

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C09. Ses preuves RÉELLES — unicité du
-- bulletin sous deux votes concurrents d'un même électeur (refus par la CLÉ
-- PRIMAIRE `ballot`), éligibilité (bulletin d'un hors-instantané refusé par le
-- trigger `ballot_guards`), vote hors délai serveur et vote après clôture refusés
-- (même trigger), instantané d'électorat incompressible (`vote_electorate`
-- append-only + `REVOKE`), progression d'état légale et exécution seulement si
-- approuvée (`vote_transition`) — exigent PostgreSQL 16+. Sans base, exécution
-- **BLOCKED** (code 2) : voir packages/db/README.md. Le calcul du résultat
-- (quorum, majorité, abstentions, zéro suffrage, égalité) reste l'oracle
-- indépendant `voteResult` côté serveur ; l'identité du votant et l'électorat
-- sont résolus SERVEUR (jamais fournis librement par le client). Aucune donnée
-- réelle ; KÓMBE n'exécute aucun transfert.
-- PROCÉDURE ADDITIVE : les colonnes NOT NULL sont ajoutées avec défaut (`''` /
-- `1` / `now()`) pour rester applicables sur une table `vote` peuplée ; la
-- présence effective est gardée par les CHECK (`vote_subject_present`, etc.),
-- qui refusent une écriture réelle au défaut vide. Sur le pilote (table vide à
-- l'application), le domaine impose déjà ces valeurs avant toute INSERT.
