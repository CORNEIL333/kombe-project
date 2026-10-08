-- KÓMBE — DÉMONTAGE de la migration 0021_privacy_restore_points.sql (ordre inverse).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS restore_point;

COMMIT;
