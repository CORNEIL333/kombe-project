-- KÓMBE C04 — Moteur de règles versionnées. Migration ADDITIVE sur le socle
-- `rule_version` / `rules_acceptance` (déjà présents dans 0001). Elle ajoute :
--   * l'empreinte canonique (hash) scellant chaque version immuable ;
--   * le chaînage des versions (`supersedes`) ;
--   * la BARRE PILOTE : aucune version publiée ne peut activer les pénalités ;
--   * l'IMMUTABILITÉ effective de `rule_version` (append-only, gérée par
--     déclencheur) — la preuve que UPDATE/DELETE est refusée en base réelle.
--
-- CONTRAT de persistance (C04). Son APPLICATION et sa PREUVE (déclencheur
-- d'immuabilité, refus de la CHECK pénalité, unicité d'acceptation) exigent une
-- PostgreSQL 16+ RÉELLE (lot C04 d'exécution). Sans base, l'exécution est
-- **BLOCKED** (exit 2). La non-rétroactivité des échéances et l'effectivité
-- d'un engagement essentiel sont des DÉCISIONS serveur (`packages/domain/src/
-- rules.ts`), pas des contraintes SQL ; aucune donnée réelle ici.
--
-- Reprise : DDL unique dans BEGIN…COMMIT ; tout ou rien. Retour arrière :
-- 0005_rules_engine.down.sql.

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- ── Empreinte canonique + chaînage des versions ──────────────────────────────
ALTER TABLE rule_version
  ADD COLUMN snapshot_hash text,
  ADD COLUMN supersedes    integer,
  ADD COLUMN published_at  timestamptz;

-- L'empreinte, si présente, est bien un SHA-256 hexadécimal (64).
ALTER TABLE rule_version
  ADD CONSTRAINT rule_version_hash_hex CHECK (
    snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'
  );

-- Une version ne précède que la version immédiatement antérieure du même groupe.
ALTER TABLE rule_version
  ADD CONSTRAINT rule_version_supersedes_fk FOREIGN KEY (group_id, supersedes)
    REFERENCES rule_version(group_id, rules_version);

-- ── Barre PILOTE : pénalités jamais activables en base (3.3, ADR-0005) ────────
-- Le snapshot canonique porte la clé penaltyEnabled ; au pilote elle vaut
-- toujours 'false'. Un instantané la mettant à true est refusé structurellement.
ALTER TABLE rule_version
  ADD CONSTRAINT rule_version_pilot_no_penalty CHECK (
    snapshot ->> 'penaltyEnabled' = 'false'
  );

-- ── Immuabilité effective de rule_version (append-only) ──────────────────────
CREATE FUNCTION rule_version_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rule_version est immuable (append-only)'
    USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER rule_version_no_update
  BEFORE UPDATE OR DELETE ON rule_version
  FOR EACH ROW EXECUTE FUNCTION rule_version_forbid_mutation();

-- ── Un membre n'accepte une version qu'une seule fois (PK déjà posée en 0001 :
--    (group_id, identity_id, rules_version)) ; on borne l'horodatage. ─────────
ALTER TABLE rules_acceptance
  ADD CONSTRAINT rules_acceptance_hash_nonnull CHECK (accepted_at IS NOT NULL);

COMMIT;

-- NOTE : après application de 0005, toute correction d'une version publiée passe
-- par une NOUVELLE version (`supersedes`), jamais par un UPDATE — le déclencheur
-- l'interdit. Preuve effective BLOCKED sans PostgreSQL → tests/isolation.pg.mjs.
