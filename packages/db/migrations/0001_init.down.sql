-- KÓMBE C01 — Retour arrière complet du socle 0001_init.sql.
-- PRÉREQUIS : appliquer 0002_role_change.down.sql AVANT (0002 référence
-- membership/identity/group). Drops en ordre inverse des dépendances FK, puis
-- le domaine kombe_money en dernier. Destructif ; uniquement base de test. BLOCKED sans PG.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS command;
DROP TABLE IF EXISTS journal;
DROP TABLE IF EXISTS dispute;
DROP TABLE IF EXISTS ballot;
DROP TABLE IF EXISTS vote;
DROP TABLE IF EXISTS disbursement;
DROP TABLE IF EXISTS validation;
DROP TABLE IF EXISTS contribution;
DROP TABLE IF EXISTS obligation;
DROP TABLE IF EXISTS round;
DROP TABLE IF EXISTS rules_acceptance;
DROP TABLE IF EXISTS rule_version;
DROP TABLE IF EXISTS role_assignment;
DROP TABLE IF EXISTS membership;
DROP TABLE IF EXISTS "group";
DROP TABLE IF EXISTS identity;

DROP DOMAIN IF EXISTS kombe_money;

COMMIT;
