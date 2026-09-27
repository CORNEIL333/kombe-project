-- KÓMBE C02 — Retour arrière de 0003_access.sql (suppression purement additive).
-- N'impacte aucune donnée métier des tables du socle 0001/0002 ; drops en ordre
-- inverse des dépendances FK (sessions/jetons avant l'état d'accès). À exécuter
-- sur PostgreSQL réel ; BLOCKED sinon.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS access_session;
DROP TABLE IF EXISTS verification_token;
DROP TABLE IF EXISTS identity_access;

COMMIT;
