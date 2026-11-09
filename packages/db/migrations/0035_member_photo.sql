-- KÓMBE — Photo de profil d'un membre (refonte, 2026-11). Additif.
-- Une photo par personne, commune à ses groupes : mêmes variantes bornées que
-- la photo de tontine (0034). Écriture : soi-même uniquement. Lecture : soi-même,
-- ou les membres d'un groupe que la personne partage (groupe courant de la RLS).
-- Retirer la photo vide les octets (pas de DELETE pour l'application).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE identity_photo (
  identity_id   text PRIMARY KEY REFERENCES identity(identity_id),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  sha256        text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  bytes_512     bytea CHECK (bytes_512 IS NULL OR octet_length(bytes_512) <= 409600),
  bytes_256     bytea CHECK (bytes_256 IS NULL OR octet_length(bytes_256) <= 153600),
  window_start  timestamptz NOT NULL DEFAULT now(),
  window_count  integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((bytes_512 IS NULL) = (bytes_256 IS NULL) AND (bytes_512 IS NULL) = (sha256 IS NULL))
);
ALTER TABLE identity_photo ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON identity_photo
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
CREATE POLICY shared_group_read ON identity_photo FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM membership m
     WHERE m.identity_id = identity_photo.identity_id
       AND m.group_id = current_setting('kombe.group_id', true)
  ));
GRANT SELECT, INSERT, UPDATE ON identity_photo TO kombe_app;
REVOKE DELETE ON identity_photo FROM kombe_app;

COMMIT;
