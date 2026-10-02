-- KÓMBE C17 — Retour arrière de 0014_support_security.sql. Migration entièrement
-- additive (nouvelles tables uniquement) : on retire dans l'ordre inverse les
-- politiques/RLS, les triggers et fonctions gardiennes, puis les tables. Aucun
-- lot antérieur n'est touché ; la fonction partagée `kombe_journal_append_only`
-- appartient à 0007 et n'est PAS retirée. Idempotent (IF EXISTS). À rejouer sur
-- PostgreSQL réel ; BLOCKED sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 5) RLS.
DROP POLICY IF EXISTS tenant_isolation ON security_log;
ALTER TABLE IF EXISTS security_log DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON support_access_approver;
ALTER TABLE IF EXISTS support_access_approver DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON support_access_request;
ALTER TABLE IF EXISTS support_access_request DISABLE ROW LEVEL SECURITY;

-- 4) Journal de sécurité (append-only + table).
DROP TRIGGER IF EXISTS security_log_append_only ON security_log;
DROP TABLE IF EXISTS security_log;

-- 3) Porte du granted + progression d'état.
DROP TRIGGER IF EXISTS support_grant_gate ON support_access_request;
DROP FUNCTION IF EXISTS kombe_support_grant_gate();

-- 2) Approbateurs distincts (append-only + distincté + table).
DROP TRIGGER IF EXISTS support_approver_append_only ON support_access_approver;
DROP TRIGGER IF EXISTS support_approver_distinct ON support_access_approver;
DROP FUNCTION IF EXISTS kombe_support_approver_distinct();
DROP TABLE IF EXISTS support_access_approver;

-- 1) Demande d'accès (table ; CHECK et colonnes partent avec elle).
DROP TABLE IF EXISTS support_access_request;

COMMIT;
