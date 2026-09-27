-- KÓMBE C01 — Provisionnement des rôles PostgreSQL (CONTRAT d'exécution).
--
-- Principe de moindre privilège : le rôle APPLICATIF qui sert les requêtes
-- n'est PAS propriétaire des tables, n'est PAS superuser et n'a PAS BYPASSRLS —
-- ainsi la RLS s'applique à lui et l'isolation multi-tenant est effective
-- (preuve base réelle : C01, BLOCKED sans PostgreSQL).
--
-- Séparation des rôles :
--   * kombe_migrateur : propriétaire du schéma, applique les migrations (DDL).
--   * kombe_app        : rôle applicatif, DML seulement, RLS appliquée.
--   * kombe_worker     : consommateur d'outbox, permissions minimales (worker).
--
-- Aucun secret ici : les mots de passe sont fournis hors bande par le
-- provisionneur (variables d'environnement / secrets manager), jamais versionnés.

-- ── Rôles (IF NOT EXISTS pour idempotence de re-déploiement) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_migrateur') THEN
    CREATE ROLE kombe_migrateur NOLOGIN;         -- NOLOGIN : membres via app
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_app') THEN
    CREATE ROLE kombe_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_worker') THEN
    CREATE ROLE kombe_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- kombe_app : uniquement SELECT/INSERT/UPDATE/DELETE, jamais de DDL.
GRANT USAGE ON SCHEMA public TO kombe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kombe_app;

-- kombe_worker : lecture/maJ de l'outbox et du registre de commandes seulement.
GRANT USAGE ON SCHEMA public TO kombe_worker;
GRANT SELECT, UPDATE ON outbox TO kombe_worker;
GRANT SELECT, UPDATE ON command TO kombe_worker;

-- Le contexte RLS est posé par l'application par transaction :
--   BEGIN; SET LOCAL kombe.group_id = '<id>'; ... COMMIT;
-- Jamais de SET global (persiste sur une connexion rendue au pool → fuite).

-- NOTE D'EXÉCUTION : contrat posé par C01. L'application réelle et la preuve
-- « RLS effective sur kombe_app (non-owner, sans BYPASSRLS) » sont exécutées
-- par packages/db/tests/isolation.pg.mjs sur PostgreSQL 16+ réel (BLOCKED sinon).
