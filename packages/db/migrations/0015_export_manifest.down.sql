-- KÓMBE C12 — Retour arrière de 0015_export_manifest.sql. Migration entièrement
-- additive (nouvelle table uniquement) : on retire la politique RLS, le trigger
-- append-only puis la table. Aucun lot antérieur n'est touché ; la fonction
-- partagée `kombe_journal_append_only` appartient à 0007 et n'est PAS retirée.
-- Idempotent (IF EXISTS). À rejouer sur PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS tenant_isolation ON export_manifest;
ALTER TABLE IF EXISTS export_manifest DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS export_manifest_append_only ON export_manifest;

DROP TABLE IF EXISTS export_manifest;

COMMIT;
