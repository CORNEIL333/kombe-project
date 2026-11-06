-- KÓMBE — Rôle de CONNEXION dédié à l'API (ADR-0045, risque R-03). Additif.
--
-- L'API se connectait avec le rôle propriétaire puis assumait `kombe_app` par
-- l'option de démarrage `-c role=kombe_app`, que les poolers (PgBouncer, dont
-- celui de Neon) refusent : connexions directes seulement, plafonnées.
-- `kombe_api` se connecte directement avec les droits de `kombe_app` (héritage),
-- sans BYPASSRLS, sans propriété de table : l'URL de l'API peut alors viser le
-- point d'accès POOLÉ. Le contexte RLS (`set_config(..., true)`, `SET LOCAL`)
-- est à portée de transaction : compatible avec le mode « transaction ».
--
-- Le rôle est créé SANS connexion et SANS mot de passe : aucun secret dans le
-- dépôt. Le propriétaire l'ouvre lui-même (runbook, « Bascule vers le pooler ») :
--   ALTER ROLE kombe_api LOGIN PASSWORD '<secret aléatoire>';
-- Là où le migrateur n'a pas les droits (CI, conteneurs : rôles posés par le
-- superutilisateur), la migration laisse une notice au lieu d'échouer.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api') THEN
    BEGIN
      CREATE ROLE kombe_api NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'CREATE ROLE kombe_api refusé (droits insuffisants) : à poser par l''administrateur.';
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api') THEN
    -- Chaque étape dans son propre bloc : sous PostgreSQL 16, un rôle CREATEROLE
    -- ne peut pas toucher aux attributs BYPASSRLS/REPLICATION (même pour les
    -- retirer) ; cela ne doit pas empêcher l'adhésion (constaté sur Neon).
    BEGIN
      GRANT kombe_app TO kombe_api;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'GRANT kombe_app TO kombe_api refusé : à poser par l''administrateur.';
    END;
    BEGIN
      ALTER ROLE kombe_api NOCREATEDB NOCREATEROLE INHERIT;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Attributs de kombe_api non modifiables par ce rôle.';
    END;
    -- Fermé par défaut : jamais de contournement de la RLS par ce rôle.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api' AND (rolsuper OR rolbypassrls OR rolreplication)) THEN
      RAISE EXCEPTION 'kombe_api ne doit être ni superutilisateur, ni BYPASSRLS, ni REPLICATION';
    END IF;
  END IF;
END $$;

COMMIT;
