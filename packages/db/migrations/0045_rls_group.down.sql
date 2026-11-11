-- Retour arrière de 0045_rls_group : "group" redevient lisible sans contexte.
BEGIN;
DROP POLICY IF EXISTS discoverable_read ON "group";
DROP POLICY IF EXISTS operator_read ON "group";
DROP POLICY IF EXISTS member_read ON "group";
DROP POLICY IF EXISTS tenant_all ON "group";
ALTER TABLE IF EXISTS "group" DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS kombe_group_ancestors(text);
DROP FUNCTION IF EXISTS kombe_group_exists(text);
DROP FUNCTION IF EXISTS kombe_is_member_of(text);
COMMIT;
