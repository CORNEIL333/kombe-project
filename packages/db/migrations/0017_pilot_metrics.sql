-- KÓMBE C18 — Mesure du pilote et économie unitaire : un **journal d'événements
-- d'analytics pseudonymisé** (16.1) dont la structure **interdit** tout champ
-- financier ou identitaire individuel (l'export ne peut donc jamais porter un
-- `montant`, une `référence`, un `email`… — C18-ANALYTICS), une **cohorte de
-- pilote** (18.13) où un cycle = rotation complète = `member_count` tours
-- (l'éligibilité « trois cycles » en découle), un **instantané d'économie
-- unitaire** (16.2) distinguant le paiement **réel** de la **promesse** et
-- gardant le **coût total = support + infrastructure + taxes** en **XAF entier**
-- (domaine `kombe_money`, jamais de flottant), et un **registre des risques**
-- (16.3) à sévérité / probabilité / impact bornés, dont un risque **critique sans
-- contrôle effectif** est ce qui, à l'exécution, **bloque l'extension** du pilote.
--
-- Migration **additive** (nouvelles tables uniquement ; rien d'antérieur modifié).
-- Elle encode en base les invariants que le domaine (`packages/domain/src/metrics.ts`)
-- décide à l'exécution, afin qu'aucune écriture directe ne puisse les désarmer :
--  - un événement d'analytics ne peut stocker aucune clé financière/identitaire
--    individuelle (CHECK `?|` sur les clés de `properties`) ; ses étapes sont
--    une liste fermée ; il est **append-only** (un mesure ne se réécrit pas) ;
--  - une cohorte garde `member_count >= 1` (sinon le diviseur du nombre de
--    cycles serait nul) et `rounds_completed >= 0` ;
--  - un instantané économique lie le **coût total** à la somme de ses composantes
--    et borne les taux à [0,100] ; les montants sont en `kombe_money` (entier
--    borné, non négatif) — aucune valeur fractionnaire ne peut être posée ;
--  - un risque porte une sévérité connue et des pourcentages bornés.
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon (ADR-0006 / ADR-0007).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Journal d'événements d'analytics pseudonymisé (16.1). Une ligne = une mesure
--    passée, **immuable**. Les propriétés sont un objet JSON **plate** (valeurs
--    primitives seulement) dont la base REFUSE toute clé financière ou
--    identitaire individuelle : l'export d'un entonnoir ne peut donc structurellement
--    contenir aucun champ individuel (C18-ANALYTICS : `individual_financial_fields = 0`).
CREATE TABLE analytics_event (
  event_id    text PRIMARY KEY,
  cohort_id   text NOT NULL CHECK (btrim(cohort_id) <> ''),
  group_id    text NOT NULL REFERENCES "group"(group_id),
  step        text NOT NULL CHECK (
    step IN (
      'visite', 'demarrage', 'regles_crees', 'invitations', 'membres_acceptes',
      'premiere_contribution', 'premiere_validation', 'cycle_termine', 'paiement_abonnement'
    )
  ),
  occurred_at timestamptz NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_event_properties_object CHECK (jsonb_typeof(properties) = 'object'),
  -- Aucun champ financier individuel (montant, cotisation, solde, référence,
  -- commentaire…). La clé exacte est bloquée ici ; le domaine, lui, bloque aussi
  -- les variantes (sous-chaîne, accents) — la base est un garde-fou structurel.
  CONSTRAINT analytics_event_no_financial_field CHECK (
    NOT (properties ?| ARRAY[
      'montant', 'amount', 'cotisation', 'contribution', 'solde', 'balance',
      'pot', 'iban', 'reference', 'référence', 'commentaire', 'comment'
    ])
  ),
  -- Aucun champ identitaire/personnel individuel (l'analytics est pseudonymisée).
  CONSTRAINT analytics_event_no_personal_field CHECK (
    NOT (properties ?| ARRAY[
      'identity', 'member', 'email', 'e-mail', 'phone', 'telephone', 'téléphone',
      'prenom', 'prénom', 'surname', 'nom', 'address', 'adresse', 'user'
    ])
  )
);

CREATE TRIGGER analytics_event_append_only
  BEFORE UPDATE OR DELETE ON analytics_event
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON analytics_event FROM kombe_app;

-- 2) Cohorte de pilote (18.13) : un cycle = rotation égale = member_count tours.
--    `member_count >= 1` garantit un diviseur non nul pour le calcul de cycles ;
--    l'éligibilité « trois cycles » (>= member_count*3 tours) est jugée par le
--    domaine, la base n'en garde que les données brutes scopées par groupe.
CREATE TABLE pilot_cohort (
  group_id         text PRIMARY KEY REFERENCES "group"(group_id),
  member_count     integer NOT NULL CHECK (member_count >= 1),
  rounds_completed integer NOT NULL CHECK (rounds_completed >= 0),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3) Instantané d'économie unitaire (16.2) : mesure **immuable** du coût et du
--    taux de paiement RÉEL. Le paiement réel (`real_payers`) est distinct de la
--    promesse (`promised_only`) ; le taux réel borne la porte exploratoire G2.
--    Coûts en `kombe_money` (XAF entier borné, jamais de flottant) ; le coût
--    total est structurellement égal à la somme de ses composantes.
CREATE TABLE unit_economics_snapshot (
  snapshot_id              text PRIMARY KEY,
  group_id                 text NOT NULL REFERENCES "group"(group_id),
  exposed_members          integer NOT NULL CHECK (exposed_members >= 0),
  real_payers              integer NOT NULL CHECK (real_payers >= 0),
  promised_only            integer NOT NULL CHECK (promised_only >= 0),
  payment_real_percent     integer NOT NULL CHECK (payment_real_percent BETWEEN 0 AND 100),
  support_minutes          integer NOT NULL CHECK (support_minutes >= 0),
  support_cost_minor       kombe_money NOT NULL,
  infrastructure_cost_minor kombe_money NOT NULL,
  taxes_minor              kombe_money NOT NULL,
  total_cost_minor         kombe_money NOT NULL,
  cancellations            integer NOT NULL CHECK (cancellations >= 0),
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Cohérence : un payant réel est un membre exposé.
  CONSTRAINT unit_economics_payers_within_exposed CHECK (real_payers <= exposed_members),
  -- Le coût total est EXACTEMENT support + infrastructure + taxes (ADR-0002 :
  --     arithmétique entière, pas d'arrondi flottant).
  CONSTRAINT unit_economics_total_is_sum CHECK (
    total_cost_minor = support_cost_minor + infrastructure_cost_minor + taxes_minor
  )
);

CREATE TRIGGER unit_economics_snapshot_append_only
  BEFORE UPDATE OR DELETE ON unit_economics_snapshot
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON unit_economics_snapshot FROM kombe_app;

-- 4) Registre des risques du pilote (16.3) : sévérité connue, probabilité et
--    impact bornés à [0,100], date de revue entière. Le **contrôle effectif**
--    (contrôle + preuve + propriétaire non vides) et le **blocage d'extension**
--    d'un risque critique sans contrôle sont jugés à l'exécution par le domaine ;
--    le registre est révisable (une revue met à jour la ligne), non append-only.
CREATE TABLE pilot_risk (
  risk_id           text PRIMARY KEY,
  severity          text NOT NULL CHECK (severity IN ('faible', 'moyen', 'eleve', 'critique')),
  probability_percent integer NOT NULL CHECK (probability_percent BETWEEN 0 AND 100),
  impact_percent    integer NOT NULL CHECK (impact_percent BETWEEN 0 AND 100),
  control           text NOT NULL DEFAULT '',
  evidence_ref      text NOT NULL DEFAULT '',
  owner             text NOT NULL DEFAULT '',
  reviewed_at       date NOT NULL,
  residual          text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 5) RLS d'isolation multi-tenant (ADR-0007) sur les données scopées par groupe.
--    `pilot_risk` est un registre PROGRAMME (transverse aux cohortes), donc hors
--    RLS ; les événements, cohortes et instantanés économiques sont scopés groupe.
ALTER TABLE analytics_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics_event
  USING (group_id = current_setting('kombe.group_id', true));

ALTER TABLE pilot_cohort ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_cohort
  USING (group_id = current_setting('kombe.group_id', true));

ALTER TABLE unit_economics_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON unit_economics_snapshot
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C18. Ses preuves RÉELLES — événement
-- d'analytics **immuable** et **sans champ financier/identitaire individuel**
-- (append-only + CHECK `?|` garantissant C18-ANALYTICS `individual_financial_fields = 0`),
-- cohorte à diviseur non nul (member_count >= 1) portant l'éligibilité trois
-- cycles calculée par le domaine (C18-COHORT), instantané économique en **XAF
-- entier** (`kombe_money`, `total = support + infra + taxes`) avec taux réel
-- borné gouvernant la porte G2 (C18-PAYERS), et registre de risques borné dont un
-- critique sans contrôle bloque l'extension — exigent PostgreSQL 16+. Sans base,
-- exécution **BLOCKED** (code 2). La décision (éligibilité, seuil G2, blocage
-- d'extension, refus de champ sensible) est prise par le domaine ; la base n'encode
-- que les garde-fous structurels. KÓMBE ne branche ici AUCUN outil d'analytics
-- réel : le raccordement (RGPD-compatible, sans champ individuel) relève de
-- l'infrastructure déployée (C29).
