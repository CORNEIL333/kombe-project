-- KÓMBE C12 — Exports du relevé : **manifeste séparé**, **append-only**, portant
-- l'**empreinte SHA-256 sur les octets finalisés** (ni le fichier, ni le hash ne
-- sont modifiés après calcul), la **séquence de coupure** figeant un état cohérent
-- du journal, et la **mention prudente** obligatoire (aucune promesse de valeur
-- juridique, aucune signature simulée).
--
-- Migration **additive** (nouvelle table uniquement ; rien d'antérieur modifié).
-- Elle encode en base les invariants que le domaine (`packages/domain/src/export.ts`)
-- décide à l'exécution, afin qu'aucun acteur ne puisse les désarmer par une écriture
-- directe :
--  - l'empreinte est **inhérente au manifeste**, pas au fichier : `pdf_sha256` et
--    `csv_sha256` sont des hexadécimaux SHA-256 stricts (CHECK regex), posés une
--    fois et **jamais réécrits** (append-only + REVOKE UPDATE/DELETE) — C12-HASH.
--  - la **coupure** est une séquence entière ≥ 0 (état figé du journal) et la
--    **version du générateur** est tracée (18.8).
--  - le **langage prudent** est structurel : `prudent_notice` NOT NULL et une
--    CHECK interdit toute promesse de « preuve légale » / « signed » dans le champ.
--  - le **téléchargement privé** est un objet à péremption (`object_key`,
--    `expires_at`) ; l'ACL effective (membre sortant refusé) est recontrôlée à
--    l'acheminement côté application — la base borne le périmètre par RLS.
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon (ADR-0004 / ADR-0016).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Manifeste d'export : empreinte + coupure + mention prudente. La ligne est
--    posée à la génération et n'est ni modifiée ni retirée (incompressibilité).
CREATE TABLE export_manifest (
  manifest_id           text PRIMARY KEY,
  group_id              text NOT NULL REFERENCES "group"(group_id),
  requester_identity_id text NOT NULL REFERENCES identity(identity_id),
  cutoff_sequence       bigint NOT NULL CHECK (cutoff_sequence >= 0),
  generator_version     text NOT NULL CHECK (btrim(generator_version) <> ''),
  captured_at           timestamptz NOT NULL,
  -- Empreintes sur octets finalisés : hexadécimal SHA-256 strict, en base séparée
  -- du fichier (le hash ne vit pas dans le PDF/CSV exporté).
  pdf_sha256            text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  csv_sha256            text NOT NULL CHECK (csv_sha256 ~ '^[0-9a-f]{64}$'),
  object_key            text,          -- emplacement de stockage privé (hors clair)
  expires_at            timestamptz,   -- téléchargement privé expirant
  revoked_at            timestamptz,   -- révocation immédiate (proxy le cas échéant)
  prudent_notice        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_notice_present CHECK (btrim(prudent_notice) <> ''),
  -- Langage prudent (10.3) : aucune promesse juridique automatique dans la mention.
  CONSTRAINT export_no_legal_promise CHECK (
    prudent_notice !~* 'preuve (légale|legale)'
    AND prudent_notice !~* 'signed'
    AND prudent_notice !~* 'signature (numérique|numerique) certifi'
  ),
  CONSTRAINT export_expiry_coherent CHECK (
    expires_at IS NULL OR expires_at > captured_at
  )
);

-- 2) Le manifeste est immuable une fois posé : ni UPDATE ni DELETE (l'empreinte
--    d'un relevé exporté ne se réécrit pas — C12-HASH structurel).
CREATE TRIGGER export_manifest_append_only
  BEFORE UPDATE OR DELETE ON export_manifest
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON export_manifest FROM kombe_app;

-- 3) RLS d'isolation multi-tenant (ADR-0007) scopée par le groupe de l'export.
ALTER TABLE export_manifest ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON export_manifest
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C12. Ses preuves RÉELLES — empreinte
-- inaltérable après pose (`export_manifest_append_only` + `REVOKE`), SHA-256
-- strictement formé (CHECK regex), coupure entière bornée, mention prudente
-- présente et exempte de promesse juridique (`export_no_legal_promise`), date
-- d'expiration postérieure à la capture, et isolation RLS par groupe — exigent
-- PostgreSQL 16+. Sans base, exécution **BLOCKED** (code 2). L'ACL effective
-- (membre sortant refusé au téléchargement, C12-DOWNLOAD) et la vérification
-- indépendante d'un fichier redescendu (C12-HASH, côté client) sont appliquées
-- par le domaine/la route ; la base n'archive que le manifeste immuable et son
-- empreinte. KÓMBE ne signe juridiquement aucun export et n'en promet la valeur
-- légale.
