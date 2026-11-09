-- Retour arrière de 0039_role_api : retire la connexion et l'adhésion du rôle
-- (le rôle lui-même reste : il peut posséder des sessions ouvertes).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api') THEN
    ALTER ROLE kombe_api NOLOGIN;
    REVOKE kombe_app FROM kombe_api;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
COMMIT;
