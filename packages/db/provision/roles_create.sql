-- KÓMBE C29 — Création anticipée des rôles, AVANT les migrations.
--
-- Pourquoi : certaines migrations référencent les rôles avant la fin de
-- provision/roles.sql (ex. 0007 « REVOKE ... FROM kombe_app », 0013
-- « CREATE POLICY ... TO kombe_app »). Sur un cluster neuf, ces statements
-- échoueraient avec « role does not exist ». Ce fichier ne fait que créer les
-- rôles (IF NOT EXISTS, idempotent) ; les grants et ALTER DEFAULT PRIVILEGES
-- restent dans provision/roles.sql, appliqué après les migrations car il
-- suppose les tables existantes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_migrateur') THEN
    CREATE ROLE kombe_migrateur NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_app') THEN
    CREATE ROLE kombe_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_worker') THEN
    CREATE ROLE kombe_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
