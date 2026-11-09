-- KÓMBE — Caisses personnalisées (retours terrain, 2026-10-17). Additif.
-- Une tontine crée ses propres caisses et cotisations (projet commun, fête,
-- achat groupé, urgences…) avec leurs règles (rules jsonb : mode, barème
-- daté non rétroactif, objectif, date de clôture). Seule la contrainte de
-- type s'élargit ; aucune donnée existante n'est modifiée.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE fund DROP CONSTRAINT IF EXISTS fund_kind_check;
ALTER TABLE fund ADD CONSTRAINT fund_kind_check
  CHECK (kind IN ('rotation','solidarity','year_end_reserve','operating','fines','loan','collector','custom'));

COMMIT;
