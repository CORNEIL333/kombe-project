-- KÓMBE — DÉMONTAGE de 0029_ops_console.sql (fonctions de lecture seule).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS kombe_ops_engineering();
DROP FUNCTION IF EXISTS kombe_ops_groups(integer);
DROP FUNCTION IF EXISTS kombe_ops_kpis(integer);
DROP FUNCTION IF EXISTS kombe_ops_overview();
DROP FUNCTION IF EXISTS kombe_is_operator();
COMMIT;
