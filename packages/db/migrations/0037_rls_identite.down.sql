-- Retour arrière de 0037_rls_identite (rétablit l'état antérieur).
BEGIN;
DROP FUNCTION IF EXISTS kombe_schema_has(text);
DO $$ BEGIN
  DROP POLICY IF EXISTS self_read ON identity;
  DROP POLICY IF EXISTS create_any ON identity;
  ALTER TABLE identity DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
