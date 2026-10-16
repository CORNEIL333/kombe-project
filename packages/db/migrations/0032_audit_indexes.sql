-- KÓMBE — Index de l'audit serveur (2026-10-16). Additif, aucune donnée.
-- Trois chemins de lecture hot restés en balayage séquentiel :
--   1. resolveGroupActor (chaque route socle en mode réel) joint
--      role_assignment par (group_id, membership_id) — la clé étrangère
--      n'est jamais indexée automatiquement par PostgreSQL ;
--   2. mes cotisations / mouvements d'un membre (myDues, computeDues,
--      movements?mine=1) filtrent fund_movement par (group_id, membership_id) ;
--   3. la console d'exploitation agrège fund_movement par fenêtres de
--      declared_at (0029, sans filtre de groupe).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS role_assignment_by_membership
  ON role_assignment (group_id, membership_id);

CREATE INDEX IF NOT EXISTS fund_movement_by_member
  ON fund_movement (group_id, membership_id);

CREATE INDEX IF NOT EXISTS fund_movement_by_declared_at
  ON fund_movement (declared_at);

COMMIT;
