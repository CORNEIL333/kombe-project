-- KÓMBE C05 — ÉCHÉANCIER DE CYCLE PERSISTÉ (5.1–5.7). Additive sur
-- 0006_cycle_schedule.sql, sans le modifier : 0006 avait étendu `round` et
-- `obligation` (bénéficiaire, dates, version de règles) mais AUCUNE table ne
-- portait l'état d'ÉCHÉANCIER du groupe (brouillon vs démarré, fréquence,
-- version de règles de construction). Le domaine (packages/domain/src/
-- schedule.ts) produit l'échéancier en mémoire ; cette migration pose sa
-- persistance transactionnelle :
--
--   * une ligne par groupe (`group_id` PK) = l'échéancier COURANT du cycle ;
--   * `state` : 'draft' (reconstructible) ou 'started' (figé — SCHEDULE_FROZEN
--     du domaine : ni reconstruction, ni réaffectation de bénéficiaire) ;
--   * `rules_version` : la version publiée qui a servi à la construction
--     (FK vers rule_version — on n'échéancie jamais sur une version inexistante).
--
-- Les tours (`round`) et obligations (`obligation`) restent la matérialisation
-- détaillée ; un cycle DÉMARRÉ les gèle en profondeur : suppression interdite,
-- affectation d'un tour interdite. Les colonnes FINANCIÈRES d'une obligation
-- (`validated_net`, `active_reserved`, `version`) restent mutables — elles
-- portent le cycle de vie RÉEL des contributions (C06/C07) et la
-- re-application d'une règle non rétroactive (C04), bornée par
-- assertNonRetroactive côté store.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE cycle_schedule (
  group_id      text PRIMARY KEY REFERENCES "group"(group_id),
  rules_version integer NOT NULL CHECK (rules_version >= 1),
  frequency     text NOT NULL CHECK (frequency IN ('monthly','weekly')),
  state         text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','started')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  FOREIGN KEY (group_id, rules_version) REFERENCES rule_version(group_id, rules_version)
);

ALTER TABLE cycle_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cycle_schedule
  USING (group_id = current_setting('kombe.group_id', true));

-- Gel d'un échéancier DÉMARRÉ : plus aucune écriture sur la méta (la
-- transition draft → started est la DERNIÈRE écriture ; elle-même reste
-- permise car OLD.state = 'draft').
CREATE FUNCTION cycle_schedule_frozen_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'started' THEN
    RAISE EXCEPTION 'Échéancier démarré : méta figée (SCHEDULE_FROZEN)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER cycle_schedule_frozen
  BEFORE UPDATE ON cycle_schedule
  FOR EACH ROW EXECUTE FUNCTION cycle_schedule_frozen_guard();

-- Gel en profondeur des TOURS d'un cycle démarré : aucune modification ni
-- suppression du découpage (bénéficiaire, dates, version) après démarrage.
CREATE FUNCTION cycle_round_frozen_guard() RETURNS trigger AS $$
DECLARE
  schedule_state text;
BEGIN
  SELECT state INTO schedule_state FROM cycle_schedule WHERE group_id = OLD.group_id;
  IF schedule_state = 'started' THEN
    RAISE EXCEPTION 'Cycle démarré : tour figé (SCHEDULE_FROZEN)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER round_frozen
  BEFORE UPDATE OR DELETE ON round
  FOR EACH ROW EXECUTE FUNCTION cycle_round_frozen_guard();

-- Obligations d'un cycle démarré : suppression interdite et STRUCTURE figée
-- (tour, membre). Les colonnes financières restent mutables (cycle de vie des
-- contributions + re-application de règle bornée par le domaine).
CREATE FUNCTION cycle_obligation_frozen_guard() RETURNS trigger AS $$
DECLARE
  schedule_state text;
BEGIN
  SELECT state INTO schedule_state FROM cycle_schedule WHERE group_id = OLD.group_id;
  IF schedule_state = 'started' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cycle démarré : obligation non supprimable (SCHEDULE_FROZEN)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.round_id IS DISTINCT FROM OLD.round_id
       OR NEW.member_membership_id IS DISTINCT FROM OLD.member_membership_id THEN
      RAISE EXCEPTION 'Cycle démarré : affectation figée (SCHEDULE_FROZEN)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER obligation_frozen
  BEFORE UPDATE OR DELETE ON obligation
  FOR EACH ROW EXECUTE FUNCTION cycle_obligation_frozen_guard();

-- Moindre privilège explicite (ne dépend pas d'une ré-exécution de
-- provision/roles.sql, dont le jalon peut déjà être posé) : kombe_app lit,
-- insère, met à jour (brouillon → démarré) ; jamais de suppression.
GRANT SELECT, INSERT, UPDATE ON cycle_schedule TO kombe_app;
REVOKE DELETE ON cycle_schedule FROM kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C05. Sa preuve réelle (échéancier
-- construit sur version publiée, relu, démarré une seule fois, gel effectif
-- des tours après démarrage, réaffectation/départ/renouvellement) exige
-- PostgreSQL 16+ réel — voir packages/api/test/pgScheduleStore.proof.mjs.
