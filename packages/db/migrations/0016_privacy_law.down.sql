-- KÓMBE C16 — Retour arrière de 0016_privacy_law.sql. Migration entièrement
-- additive (nouvelles tables uniquement) : on retire la politique RLS, les
-- triggers append-only puis les tables, dans l'ordre inverse. Aucun lot antérieur
-- n'est touché ; la fonction partagée `kombe_journal_append_only` appartient à
-- 0007 et n'est PAS retirée. Idempotent (IF EXISTS). À rejouer sur PostgreSQL
-- réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS tenant_isolation ON rights_request;
ALTER TABLE IF EXISTS rights_request DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS data_erasure_tombstone_append_only ON data_erasure_tombstone;
DROP TABLE IF EXISTS data_erasure_tombstone;

DROP TABLE IF EXISTS rights_request;
DROP TABLE IF EXISTS personal_consent;
DROP TABLE IF EXISTS processing_record;

DROP TRIGGER IF EXISTS legal_notice_append_only ON legal_notice;
DROP TABLE IF EXISTS legal_notice;

COMMIT;
