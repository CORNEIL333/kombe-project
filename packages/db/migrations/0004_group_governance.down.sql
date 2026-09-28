-- KÓMBE C03 — Retour arrière de 0004_group_governance.sql.
-- Repose la CHECK d'origine sur group.state (états du socle 0001) et droppe la
-- table invitation. ATTENTION : si des groupes sont dans un état ajouté
-- (stopped_with_discrepancies/archived), la repose de la contrainte échoue —
-- signe explicite qu'un retour arrière n'est pas sans perte ; aucun-effacement
-- silencieux. À exécuter sur PostgreSQL réel ; BLOCKED sinon.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS invitation;

ALTER TABLE "group" DROP CONSTRAINT IF EXISTS group_state_check;
ALTER TABLE "group" ADD CONSTRAINT group_state_check
  CHECK (state IN ('configuration','active','paused','closed'));

COMMIT;
