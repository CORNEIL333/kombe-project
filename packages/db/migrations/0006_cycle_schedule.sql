-- KÓMBE C05 — Calendrier : tours, bénéficiaires, échéances et ordre figé.
-- Migration **additive** sur le socle 0001 (tables `round` / `obligation`), sans
-- les redéfinir. Elle encode : bénéficiaire désigné par tour rattaché au groupe
-- (FK composite), date métier **Africa/Douala** + instant **UTC** persistés,
-- version de règle rattachée (5.2), **rotation égale** = un seul tour par
-- bénéficiaire dans un groupe (5.3), et **obligation unique membre/tour** (5.2).
-- La décision de calendrier (N tours / N membres, permutation, gel après
-- démarrage, départ sans réaffectation) reste côté serveur (`packages/domain/src/
-- schedule.ts`) ; la base ne fait que **borner structurellement**. À rejouer sur
-- PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Colonnes du tour : bénéficiaire, dates (métier + UTC), version de règle.
ALTER TABLE round
  ADD COLUMN beneficiary_membership_id text,
  ADD COLUMN due_date_business          date,
  ADD COLUMN due_at_utc                 timestamptz,
  ADD COLUMN rules_version              integer;

-- 2) Bénéficiaire = adhésion du même groupe (FK composite anti-cross-tenant).
ALTER TABLE round
  ADD CONSTRAINT round_beneficiary_fk
  FOREIGN KEY (group_id, beneficiary_membership_id)
  REFERENCES membership (group_id, membership_id);

-- 3) Version de règle rattachée au tour (échéance liée à une version précise, 5.2).
ALTER TABLE round
  ADD CONSTRAINT round_rules_version_fk
  FOREIGN KEY (group_id, rules_version)
  REFERENCES rule_version (group_id, rules_version);

-- 4) Rotation égale (5.3) : un tour au plus par bénéficiaire dans un groupe.
--    Un second tour avec le même bénéficiaire est rejeté (C05-UNIQUE en base).
CREATE UNIQUE INDEX round_one_beneficiary_per_group
  ON round (group_id, beneficiary_membership_id)
  WHERE beneficiary_membership_id IS NOT NULL;

-- 5) Obligation **unique** par (groupe, tour, membre) — une dette membre/tour (5.2).
ALTER TABLE obligation
  ADD CONSTRAINT obligation_unique_member_round
  UNIQUE (group_id, round_id, member_membership_id);

-- 6) Cohérence datation : si un instant UTC est posé, la date métier l'est aussi.
ALTER TABLE round
  ADD CONSTRAINT round_due_consistency
  CHECK (due_at_utc IS NULL OR due_date_business IS NOT NULL);

COMMIT;
