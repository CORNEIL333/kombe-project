-- KÓMBE C11 — Journal d'événements : enveloppe traçable, append-only RÉEL et
-- checkpoints hors privilèges applicatifs (stories 9.1 → 9.5).
-- Migration **additive** sur le socle 0001 (table `journal`), sans la redéfinir.
-- Elle encode : l'enveloppe d'audit (acteur interne, rôle instantané, date
-- serveur, commande/corrélation, version de règle) en colonnes REQUERYABLES ;
-- la protection **append-only** du journal (le chemin applicatif ne peut ni
-- modifier ni effacer une ligne posée) ; la table `checkpoint` scellée, hors
-- d'écriture du rôle applicatif (point de contrôle externe, 9.2). La chaîne de
-- hash elle-même et le replay versionné restent côté serveur
-- (`packages/domain/src/journal.ts`) ; la base ne fait que **bornner
-- structurellement** et rendre l'append-only incompressible. À rejouer sur
-- PostgreSQL réel ; **BLOCKED** sinon.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Enveloppe d'audit en colonnes (9.1), nullables pour rester rejouable sur
--    des lignes déjà posées sans backfill réel (aucune donnée en base de test).
ALTER TABLE journal
  ADD COLUMN actor_identity_id text,
  ADD COLUMN actor_role        text
    CHECK (actor_role IS NULL OR actor_role IN
      ('founder','animator','treasurer','secretary','auditor','member')),
  ADD COLUMN command_id        text,
  ADD COLUMN correlation_id    text,
  ADD COLUMN rules_version     integer;

-- 2) Append-only (9.1/9.4) : aucun chemin applicatif ne modifie silencieusement
--    une ligne posée. Un trigger refuse UPDATE/DELETE SAUF si une session de
--    maintenance TRACÉE pose le drapeau explicite (opération technique
--    exceptionnelle séparée, jamais le chemin métier).
CREATE OR REPLACE FUNCTION kombe_journal_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('kombe.allow_journal_maintenance', true) IS NULL THEN
    RAISE EXCEPTION 'journal append-only : UPDATE/DELETE interdits au chemin applicatif'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER journal_append_only
  BEFORE UPDATE OR DELETE ON journal
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- 3) Moindre privilège : le rôle applicatif, même nanti du grant par défaut de
--    0001, est DECHARGÉ de UPDATE/DELETE sur le journal (le trigger reste la
--    défense en profondeur ; la révocation retire aussi la capacité).
REVOKE UPDATE, DELETE ON journal FROM kombe_app;

-- 4) Checkpoints (9.2) : empreinte d'un préfixe de chaîne, posée par un
--    vérificateur HORS des privilèges applicatifs. Le hash seul n'atteste pas
--    l'origine — la séparation des droits oui : kombe_app n'a AUCUN droit
--    d'écriture, et la ligne est immuable (trigger append-only).
CREATE TABLE checkpoint (
  group_id   text NOT NULL REFERENCES "group"(group_id),
  seq        bigint NOT NULL CHECK (seq >= 1),
  head_hash  text NOT NULL CHECK (head_hash ~ '^[0-9a-f]{64}$'),
  issued_at  timestamptz NOT NULL,
  issued_by  text NOT NULL,
  hash       text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (group_id, seq),
  -- Un checkpoint ne peut précéder un événement : sa (group, seq) doit exister.
  FOREIGN KEY (group_id, seq) REFERENCES journal (group_id, seq)
);

CREATE TRIGGER checkpoint_append_only
  BEFORE UPDATE OR DELETE ON checkpoint
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège : les *default privileges* de provision/roles.sql accorderaient
-- INSERT au rôle applicatif sur toute table nouvelle. Le checkpoint est posé par un
-- vérificateur EXTERNE ; kombe_app en est déchargé (aucune écriture possible).
REVOKE INSERT, UPDATE, DELETE ON checkpoint FROM kombe_app;

-- RLS : le checkpoint suit l'isolation tenant en LECTURE (défense additionnelle).
ALTER TABLE checkpoint ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON checkpoint
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C11. Sa preuve RÉELLE — append-only
-- (UPDATE/DELETE d'une ligne posée refusés), checkpoint immuable et hors
-- d'écriture app, et atomicité événement/projection/outbox (crash après
-- événement avant outbox ⇒ `partial_commit_count = 0`, scénario C11-ROLLBACK de
-- `tests/isolation.pg.mjs`) — exige PostgreSQL 16+. Sans base, exécution
-- **BLOCKED** (code 2) : voir packages/db/README.md. Aucune donnée réelle.
