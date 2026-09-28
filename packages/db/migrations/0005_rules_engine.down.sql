-- KÓMBE C04 — Retour arrière de 0005_rules_engine.sql. Retire le déclencheur
-- d'immuabilité, la fonction associée, les contraintes ajoutées et les nouvelles
-- colonnes de `rule_version`, puis la contrainte d'acceptation. À exécuter sur
-- PostgreSQL réel ; **BLOCKED** sinon. Ordre inverse de l'application.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS rule_version_no_update ON rule_version;
DROP FUNCTION IF EXISTS rule_version_forbid_mutation();

ALTER TABLE rules_acceptance DROP CONSTRAINT IF EXISTS rules_acceptance_hash_nonnull;
ALTER TABLE rule_version DROP CONSTRAINT IF EXISTS rule_version_pilot_no_penalty;
ALTER TABLE rule_version DROP CONSTRAINT IF EXISTS rule_version_supersedes_fk;
ALTER TABLE rule_version DROP CONSTRAINT IF EXISTS rule_version_hash_hex;

ALTER TABLE rule_version
  DROP COLUMN IF EXISTS snapshot_hash,
  DROP COLUMN IF EXISTS supersedes,
  DROP COLUMN IF EXISTS published_at;

COMMIT;
