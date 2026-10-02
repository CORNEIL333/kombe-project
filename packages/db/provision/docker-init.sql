-- KÓMBE — amorce du conteneur PostgreSQL : crée la base de TEST isolée en plus
-- de la base applicative par défaut, et PROVISIONNE les rôles attendus par les
-- preuves base réelle (isolation.pg.mjs / recettes C13 de postgres.mjs).
--
-- HONNÊTETÉ : sans ce provisionnement, `docker compose --profile test run dbtest`
-- ÉCHOUERAIT (et non PASS) : les tables seraient créées par le superuser `kombe`,
-- donc kombe_app/kombe_worker n'auraient AUCUN droit dessus et la RLS ne pourrait
-- pas s'exécuter. On reproduit ICI le même provisionnement que le job de confiance
-- h00-trusted.yml : le rôle MIGRATEUR est propriétaire de kombe_test et les
-- DEFAULT PRIVILEGES sont posés AVANT les migrations, pour que les tables créées
-- par kombe_migrateur héritent des droits DML de kombe_app. Les migrations 0007/
-- 0008/0013 RETIRENT ensuite les droits append-only (UPDATE/DELETE) là où requis.
--
-- Exécuté une seule fois à l'init du volume (docker-entrypoint-initdb.d) en tant
-- que superuser POSTGRES_USER, connecté à la base applicative par défaut.
-- Aucune donnée réelle : kombe_test ne reçoit que les fixtures fictives du test.

-- ── Rôles (cluster, idempotent) ──────────────────────────────────────────────
-- kombe_migrateur : LOGIN, propriétaire de kombe_test, applique les migrations.
-- kombe_app / kombe_worker : NOLOGIN, sans BYPASSRLS → la RLS s'applique à eux.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_migrateur') THEN
    CREATE ROLE kombe_migrateur LOGIN PASSWORD 'kombe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_app') THEN
    CREATE ROLE kombe_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_worker') THEN
    CREATE ROLE kombe_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Adhésions permettant `SET ROLE kombe_app|kombe_worker` depuis kombe_migrateur
-- (isolation.pg.mjs pose `-c role=kombe_app`, postgres.mjs pose `-c role=kombe_worker`).
GRANT kombe_app TO kombe_migrateur;
GRANT kombe_worker TO kombe_migrateur;

-- ── Base de TEST (idempotent via \gexec) ─────────────────────────────────────
SELECT 'CREATE DATABASE kombe_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kombe_test')\gexec

-- kombe_migrateur devient propriétaire de kombe_test → il contrôle le schéma
-- public (pg_database_owner) et peut y CREATE les tables de migration.
ALTER DATABASE kombe_test OWNER TO kombe_migrateur;

-- ── Droits et DEFAULT PRIVILEGES DANS kombe_test, AVANT toute migration ──────
\c kombe_test
GRANT ALL ON SCHEMA public TO kombe_migrateur;
GRANT USAGE ON SCHEMA public TO kombe_app;
GRANT USAGE ON SCHEMA public TO kombe_worker;

-- CRITIQUE : posé AVANT les migrations. ALTER DEFAULT PRIVILEGES n'affecte que
-- les objets créés APRÈS par kombe_migrateur ; ainsi les tables des migrations
-- (exécutées en dbtest par kombe_migrateur) donnent le DML à kombe_app, sans
-- superuser ni BYPASSRLS → la RLS est réellement éprouvée par isolation.pg.mjs.
ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kombe_app;
