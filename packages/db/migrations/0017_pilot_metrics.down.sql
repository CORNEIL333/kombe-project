-- KÓMBE C18 — Retour arrière de 0017_pilot_metrics.sql. Migration entièrement
-- additive (nouvelles tables uniquement) : on retire les politiques RLS, les
-- triggers append-only puis les tables, dans l'ordre inverse. Aucun lot antérieur
-- n'est touché ; la fonction partagée `kombe_journal_append_only` appartient à
-- 0007 et n'est PAS retirée ; le domaine `kombe_money` appartient à 0001 et n'est
-- PAS retiré. Idempotent (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS tenant_isolation ON unit_economics_snapshot;
ALTER TABLE IF EXISTS unit_economics_snapshot DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS unit_economics_snapshot_append_only ON unit_economics_snapshot;
DROP TABLE IF EXISTS unit_economics_snapshot;

DROP POLICY IF EXISTS tenant_isolation ON pilot_cohort;
ALTER TABLE IF EXISTS pilot_cohort DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS pilot_cohort;

DROP TABLE IF EXISTS pilot_risk;

DROP POLICY IF EXISTS tenant_isolation ON analytics_event;
ALTER TABLE IF EXISTS analytics_event DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS analytics_event_append_only ON analytics_event;
DROP TABLE IF EXISTS analytics_event;

COMMIT;
