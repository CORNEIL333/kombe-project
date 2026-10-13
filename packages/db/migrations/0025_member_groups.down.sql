-- KÓMBE — DÉMONTAGE de la migration 0025_member_groups.sql (ordre inverse).
-- S'exécute AVANT 0024.down : le pont référence des colonnes ajoutées par 0024
-- (display_name / tontine_model / rotation_type / parent_group_id) ; on le drop
-- d'abord pour ne laisser aucune fonction orpheline.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS kombe_member_groups(text);

COMMIT;
