-- KÓMBE — Photo de profil d'une tontine (refonte premium, 2026-11-01). Additif.
-- Décision (docs/ai-execution/WORKLOG.md) : aucun stockage objet n'est
-- configuré ; ajouter un fournisseur = compte, clés et coûts à décider par le
-- titulaire. Les variantes sont petites et bornées (JPEG carré 512 et 256 px,
-- métadonnées retirées, ≤ 400 Ko + 150 Ko), lues uniquement par les membres
-- (RLS par groupe) ou via un code d'invitation valide. Retirer la photo vide
-- les octets (pas de DELETE pour l'application) ; `version` sert de clé de cache.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE group_photo (
  group_id   text PRIMARY KEY REFERENCES "group"(group_id),
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  sha256     text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  bytes_512  bytea CHECK (bytes_512 IS NULL OR octet_length(bytes_512) <= 409600),
  bytes_256  bytea CHECK (bytes_256 IS NULL OR octet_length(bytes_256) <= 153600),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((bytes_512 IS NULL) = (bytes_256 IS NULL) AND (bytes_512 IS NULL) = (sha256 IS NULL))
);
ALTER TABLE group_photo ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON group_photo USING (group_id = current_setting('kombe.group_id', true));
GRANT SELECT, INSERT, UPDATE ON group_photo TO kombe_app;
REVOKE DELETE ON group_photo FROM kombe_app;

COMMIT;
