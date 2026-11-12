-- Retour arrière de 0047_integrite.
BEGIN;
DROP POLICY IF EXISTS tenant_isolation ON command;
ALTER TABLE IF EXISTS command DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS meeting_one_open_per_group;
COMMIT;
