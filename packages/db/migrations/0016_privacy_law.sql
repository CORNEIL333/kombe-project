-- KÓMBE C16 — Données personnelles : **notices légales** versionnées et
-- immuables (aucun placeholder, aucune promesse de garantie des fonds ni de
-- valeur juridique), **registre des traitements** factuel (base juridique
-- connue, durée de conservation entière positive), **consentement** limité aux
-- catégories facultatives (recherche / marketing / IA future — le **service
-- cœur n'est jamais une catégorie de consentement**), **demandes de droits** à
-- vérification proportionnée (gel **motivé**, jamais de refus automatique), et
-- **tombstones d'effacement append-only** (une identité effacée ne peut être
-- silencieusement ressuscitée — garde-fou base de C16-RESTORE).
--
-- Migration **additive** (nouvelles tables uniquement ; rien d'antérieur modifié).
-- Elle encode en base les invariants que le domaine (`packages/domain/src/privacy.ts`)
-- décide à l'exécution, afin qu'aucune écriture directe ne puisse les désarmer :
--  - une notice publiée ne promet ni « preuve légale » ni garantie/fructification
--    des fonds et ne contient aucun gabarit non rempli (`bientôt`, `TBD`…) ;
--  - une notice, une fois publiée, est **immuable** (version = nouvelle ligne) ;
--  - un effacement pose un **tombstone** qui n'est ni modifiable ni supprimable :
--    le registre de tombstones vit **hors** de tout point de restauration ;
--  - le **consentement** ne porte que sur des catégories facultatives : la base
--    refuse structurellement une catégorie « core_service » (on ne peut pas
--    conditionner l'accès au registre à un consentement — C16-CONSENT) ;
--  - une demande de droit **gelée** porte un **motif** non vide ; un **effacement**
--    exige une vérification **élevée** (proportionnée à l'irréversibilité).
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon (ADR-0006 / ADR-0007).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Notices légales versionnées (13.1) : une ligne = une version publiée. Une
--    fois posée, elle n'est ni modifiée ni retirée (la version affichée au membre
--    est celle réellement publiée, sans remaniement rétroactif).
CREATE TABLE legal_notice (
  notice_id       text NOT NULL,
  version         text NOT NULL,
  kind            text NOT NULL CHECK (
    kind IN ('cgu', 'privacy', 'cookies', 'contact', 'complaint')
  ),
  last_updated_at date NOT NULL,
  body            text NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, version),
  CONSTRAINT legal_notice_version_present CHECK (btrim(version) <> ''),
  -- Aucun gabarit non rempli ni promesse remise à plus tard (13.1).
  CONSTRAINT legal_notice_no_placeholder CHECK (
    body !~* 'bient[ôo]t' AND body !~* 'à\s+venir'
    AND body !~* 'coming\s+soon' AND body !~* 't\.?b\.?d'
    AND body !~* 'placeholder' AND body !~* 'todo'
  ),
  -- Communication prudente (13.2) : ni preuve légale, ni garantie des fonds.
  CONSTRAINT legal_notice_no_promise CHECK (
    body !~* 'preuve\s+(légale|legale)'
    AND body !~* 'garanti(e)?\s+(des?\s+)?fonds'
    AND body !~* 'fructifi'
    AND body !~* 'rentabilit'
    AND body !~* 'sans\s+risque'
  )
);

CREATE TRIGGER legal_notice_append_only
  BEFORE UPDATE OR DELETE ON legal_notice
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON legal_notice FROM kombe_app;

-- 2) Registre des traitements (13.3) : factuel, base juridique connue, durée de
--    conservation entière positive (aucun délai légal supposé).
CREATE TABLE processing_record (
  record_id      text PRIMARY KEY,
  purpose        text NOT NULL CHECK (btrim(purpose) <> '' AND purpose !~* 't\.?b\.?d' AND purpose !~* 'placeholder'),
  data_categories text[] NOT NULL CHECK (cardinality(data_categories) >= 1),
  legal_basis    text NOT NULL CHECK (
    legal_basis IN ('contract', 'consent', 'legal_obligation', 'vital_interest', 'public_task', 'legitimate_interest')
  ),
  recipients     text[] NOT NULL DEFAULT '{}',
  country        text NOT NULL CHECK (btrim(country) <> ''),
  retention_days integer NOT NULL CHECK (retention_days >= 1),
  basis_confirmed boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3) Consentement facultatif (13.4) : identité + catégorie (au sens STRICTEMENT
--    facultatif). Le **service cœur** n'est pas une catégorie : la base refuse
--    'core_service', garantissant qu'un refus de consentement ne coupe pas l'accès.
CREATE TABLE personal_consent (
  identity_id text NOT NULL REFERENCES identity(identity_id),
  category    text NOT NULL CHECK (category IN ('research', 'marketing', 'future_ai')),
  granted     boolean NOT NULL,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (identity_id, category)
);

-- 4) Demandes de droits (18.19) : ticket scopé par groupe (RLS), vérification
--    proportionnée, gel motivé. Un effacement exige un seuil de vérification élevé.
CREATE TABLE rights_request (
  request_id            text PRIMARY KEY,
  group_id              text NOT NULL REFERENCES "group"(group_id),
  subject_identity_id   text NOT NULL REFERENCES identity(identity_id),
  kind                  text NOT NULL CHECK (
    kind IN ('access', 'export', 'erasure', 'rectification', 'objection')
  ),
  status                text NOT NULL CHECK (
    status IN ('received', 'requires_more_info', 'ready', 'fulfilled', 'frozen')
  ),
  verification_level    integer NOT NULL DEFAULT 0 CHECK (verification_level >= 0),
  required_verification integer NOT NULL CHECK (required_verification >= 1),
  restriction_reason    text,
  opened_at             timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL,
  -- Jamais de refus automatique : un gel est MOTIVÉ (18.19).
  CONSTRAINT rights_frozen_needs_motif CHECK (
    status <> 'frozen' OR btrim(coalesce(restriction_reason, '')) <> ''
  ),
  -- Vérification proportionnée : un effacement (irréversible) exige un seuil élevé.
  CONSTRAINT rights_erasure_high_verification CHECK (
    kind <> 'erasure' OR required_verification >= 3
  )
);

-- 5) Tombstones d'effacement (18.10) : posés à l'exécution d'un droit à
--    l'effacement, **ni modifiables ni supprimables**. Une restauration depuis un
--    backup antérieur ne peut pas ressusciter silencieusement une identité effacée
--    — le registre de tombstones est externe au point de reprise (C16-RESTORE).
CREATE TABLE data_erasure_tombstone (
  identity_id text PRIMARY KEY REFERENCES identity(identity_id),
  erased_at   timestamptz NOT NULL
);

CREATE TRIGGER data_erasure_tombstone_append_only
  BEFORE UPDATE OR DELETE ON data_erasure_tombstone
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON data_erasure_tombstone FROM kombe_app;

-- 6) RLS d'isolation multi-tenant (ADR-0007) scopée par le groupe de la demande.
ALTER TABLE rights_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rights_request
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C16. Ses preuves RÉELLES — notice immuable
-- après publication (`legal_notice_append_only` + `REVOKE`), absence de placeholder
-- et de promesse juridique (CHECK), registre factuel (durée entière ≥ 1, base
-- connue), consentement **jamais** lié au service cœur (CHECK d'enum facultatif),
-- gel **motivé** et effacement à **vérification élevée** (CHECK), tombstone
-- **inaltérable** empêchant toute résurrection silencieuse (C16-RESTORE), et
-- isolation RLS par groupe — exigent PostgreSQL 16+. Sans base, exécution
-- **BLOCKED** (code 2). L'extraction filtrée sans fuite de champ privé d'autrui
-- (C16-EXPORT), la disponibilité du service cœur indépendante du consentement
-- (C16-CONSENT) et la réapplication des effacements/révocations à la restauration
-- sont décidées par le domaine/la route ; la base n'encode que les garde-fous
-- structurels ci-dessus. KÓMBE ne publie aucune notice à promesse juridique et ne
-- purgera un vrai index/cache/backup que raccordé à l'infrastructure déployée (C29).
