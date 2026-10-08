-- KÓMBE C16 — Points de restauration DURABLES (18.10, C16-RESTORE). Additive
-- sur 0016_privacy_law.sql, sans le modifier.
--
-- CONTEXTE : 0016 posait le tombstone d'effacement (append-only) mais AUCUN
-- stockage durable d'un « point de restauration » (RestorePoint). Le store
-- pgPrivacyStore calculait un point RÉEL (identités actives lues via
-- kombe_privacy_active_identities(), 0020) sans le persister, et restoreLatest
-- recevait le point en paramètre du client — un écart de contrat visible côté
-- HTTP (le client n'a jamais à fournir un point). Cette migration pose la
-- table manquante : l'instantané est PERSISTÉ, et la restauration lit le
-- DERNIER point enregistré (jamais un point fourni par l'appelant).
--
-- Un point de restauration est une TRACE (identités visibles à un instant T) :
-- append-only, miroir du tombstone 0016 — ni modifiable ni supprimable par le
-- chemin applicatif (trigger en profondeur + REVOKE).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE restore_point (
  point_id   bigserial PRIMARY KEY,
  taken_at   timestamptz NOT NULL,
  identities text[] NOT NULL
);

CREATE TRIGGER restore_point_append_only
  BEFORE UPDATE OR DELETE ON restore_point
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

-- Moindre privilège explicite (ne dépend pas d'une ré-exécution de
-- provision/roles.sql, dont le jalon peut déjà être posé) : kombe_app insère
-- et lit les points ; jamais de modification ni suppression. Les séquences
-- d'un bigserial exigent leur propre GRANT USAGE pour INSERT.
GRANT SELECT, INSERT ON restore_point TO kombe_app;
GRANT USAGE ON SEQUENCE restore_point_point_id_seq TO kombe_app;
REVOKE UPDATE, DELETE ON restore_point FROM kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C16-RESTORE. Sa preuve réelle (point
-- persisté puis relu à la restauration, réapplication des effacements et
-- révocations, identité effacée après le point jamais ressuscitée par un
-- backup antérieur, append-only effectif) exige PostgreSQL 16+ réel — voir
-- packages/api/test/serverRealMode.proof.mjs (flux C16) et la preuve dédiée
-- PgPrivacyStore.
