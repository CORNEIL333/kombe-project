-- KÓMBE C01 — Retour arrière de 0002_role_change.sql (suppression additive).
-- N'impacte aucune donnée métier des tables du socle 0001 ; drops en ordre
-- inverse des dépendances FK. À exécuter sur PostgreSQL réel ; BLOCKED sinon.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS export_request;
DROP TABLE IF EXISTS role_change_request;

COMMIT;
