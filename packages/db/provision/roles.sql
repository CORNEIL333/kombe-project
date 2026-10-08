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

-- Membership du rôle connectant dans chaque rôle KÓMBE (permet SET ROLE kombe_app/worker).
-- Sur Neon, CURRENT_USER = neondb_owner ; sur Docker, CURRENT_USER = kombe_migrateur.
GRANT kombe_migrateur TO CURRENT_USER;
GRANT kombe_app TO CURRENT_USER;
GRANT kombe_worker TO CURRENT_USER;

-- kombe_app : uniquement SELECT/INSERT/UPDATE/DELETE, jamais de DDL.
GRANT USAGE ON SCHEMA public TO kombe_app;
-- Privilèges par défaut pour les TABLES futures ( ignoré sur Neon, qui interdit ALTER DEFAULT PRIVILEGES ).
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kombe_app';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ALTER DEFAULT PRIVILEGES non autorisé (fournisseur managé type Neon) — skip.';
END $$;
-- Granteaux explicites sur les tables EXISTANTES (toujours nécessaire, y compris Neon).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kombe_app;

-- Rétablir les restrictions sélectives posées par les migrations (miroir des REVOKE
-- dans 0007-0022). Sans ALTER DEFAULT PRIVILEGES fonctionnel (Neon), le GRANT blanket
-- redonnerait les droits que les triggers + REVOKE migraient. Cette section garantit
-- la moindre privilège applicatif.
REVOKE UPDATE, DELETE ON journal FROM kombe_app;
REVOKE INSERT, UPDATE, DELETE ON checkpoint FROM kombe_app;
REVOKE UPDATE, DELETE ON idempotency_registry FROM kombe_app;
REVOKE UPDATE, DELETE ON contribution_act FROM kombe_app;
REVOKE UPDATE, DELETE ON dispute_assignment FROM kombe_app;
REVOKE UPDATE, DELETE ON disbursement_reversal FROM kombe_app;
REVOKE UPDATE, DELETE ON disbursement_act FROM kombe_app;
REVOKE UPDATE, DELETE ON vote_electorate FROM kombe_app;
REVOKE UPDATE, DELETE ON ballot FROM kombe_app;
REVOKE UPDATE, DELETE ON security_log FROM kombe_app;
REVOKE UPDATE, DELETE ON support_access_approver FROM kombe_app;
REVOKE UPDATE, DELETE ON export_manifest FROM kombe_app;
REVOKE UPDATE, DELETE ON legal_notice FROM kombe_app;
REVOKE UPDATE, DELETE ON data_erasure_tombstone FROM kombe_app;
REVOKE UPDATE, DELETE ON restore_point FROM kombe_app;
REVOKE DELETE ON cycle_schedule FROM kombe_app;
REVOKE UPDATE, DELETE ON analytics_event FROM kombe_app;
REVOKE UPDATE, DELETE ON unit_economics_snapshot FROM kombe_app;
REVOKE INSERT, UPDATE, DELETE ON internal_notification, notification_delivery FROM kombe_app;
REVOKE ALL ON notification_preference, notification_channel FROM kombe_app;

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
