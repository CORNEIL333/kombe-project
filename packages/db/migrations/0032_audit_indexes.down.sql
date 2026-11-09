-- Annulation de 0032_audit_indexes.sql (index additifs).
BEGIN;
DROP INDEX IF EXISTS fund_movement_by_declared_at;
DROP INDEX IF EXISTS fund_movement_by_member;
DROP INDEX IF EXISTS role_assignment_by_membership;
COMMIT;
