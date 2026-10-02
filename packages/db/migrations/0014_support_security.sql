-- KÓMBE C17 — Console support : accès **just-in-time**, **double approbation**
-- (COM05), **séparation stricte du pouvoir financier** (18.17) et journal de
-- sécurité **séparé** et **append-only** (9.7, 14.7).
--
-- Migration **additive** (nouvelles tables uniquement ; rien d'antérieur modifié).
-- Elle encode en base les invariants que le domaine (`packages/domain/src/support.ts`,
-- `securityLog.ts`) décide à l'exécution, afin qu'aucun acteur — pas même un
-- opérateur de la console — ne puisse les désarmer par une écriture directe :
--  - **aucune permission financière** ne peut être stockée : la colonne
--    `permissions` est bornée par CHECK à l'ensemble support
--    (`view_trace`/`restore_access`/`explain_journal`), structurellement disjoint
--    des actions financières (valider/corriger/reverser). C17-FINANCE en base.
--  - le **motif est obligatoire** (CHECK `btrim(motif) <> ''`).
--  - la **double approbation** est gardée : une demande ne devient `granted` que
--    si **deux approbateurs distincts** au moins ont signé (trigger), et
--    jamais l'applicant lui-même (trigger à l'insertion d'un approbateur) ; la
--    CLÉ PRIMAIRE `(request_id, approver_identity_id)` interdit de compter deux
--    fois le même compte (COM05).
--  - l'**expiration** est posée au granted (`expires_at NOT NULL` quand granted) ;
--    un accès `revoked`/`expired` ne se réactive pas (CHECK de progression).
--  - le **journal de sécurité** est un flux **distinct** du journal métier C11,
--    **append-only** (ni UPDATE ni DELETE), scopé par groupe (RLS). La rédaction
--    des données sensibles est appliquée **avant** écriture par le domaine ; la
--    base borne l'incompressibilité et l'absence de montant.
-- À rejouer sur PostgreSQL réel ; **BLOCKED** sinon (ADR-0006 / ADR-0007).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Demande d'accès support (9.6). `status` né `pending_approval` ; `granted`
--    exigé par le trigger de double approbation (jamais par une écriture directe).
CREATE TABLE support_access_request (
  request_id           text PRIMARY KEY,
  applicant_identity_id text NOT NULL REFERENCES identity(identity_id),
  target_group_id      text NOT NULL REFERENCES "group"(group_id),
  motif                text NOT NULL,
  -- Permissions bornées à l'ensemble support : aucune permission financière ne
  -- peut être stockée (C17-FINANCE structurelle, disjointe des actions financières).
  permissions          text[] NOT NULL,
  required_approvals   integer NOT NULL DEFAULT 2 CHECK (required_approvals >= 2),
  requested_at         timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  revoked_at           timestamptz,
  status               text NOT NULL DEFAULT 'pending_approval'
                         CHECK (status IN ('pending_approval', 'granted', 'expired', 'revoked')),
  version              integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT support_motif_present CHECK (btrim(motif) <> ''),
  CONSTRAINT support_perms_nonempty CHECK (array_length(permissions, 1) >= 1),
  CONSTRAINT support_perms_support_only CHECK (
    permissions <@ ARRAY['view_trace', 'restore_access', 'explain_journal']::text[]
  ),
  -- Un granted porte toujours une expiration ; un non-granted n'en porte pas.
  CONSTRAINT support_expiry_consistency CHECK (
    (status = 'granted' AND expires_at IS NOT NULL)
    OR (status <> 'granted')
  )
);

-- 2) Approbateurs distincts (COM05). La PK interdit de compter deux fois le même
--    compte ; un trigger refuse l'applicant comme son propre approbateur.
CREATE TABLE support_access_approver (
  request_id            text NOT NULL REFERENCES support_access_request(request_id),
  approver_identity_id  text NOT NULL REFERENCES identity(identity_id),
  approved_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, approver_identity_id)
);

CREATE OR REPLACE FUNCTION kombe_support_approver_distinct() RETURNS trigger AS $$
DECLARE
  v_applicant text;
BEGIN
  SELECT applicant_identity_id INTO v_applicant
    FROM support_access_request WHERE request_id = NEW.request_id;
  IF NEW.approver_identity_id = v_applicant THEN
    RAISE EXCEPTION 'approbation refusee : l approbateur est le demandeur'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER support_approver_distinct
  BEFORE INSERT ON support_access_approver
  FOR EACH ROW EXECUTE FUNCTION kombe_support_approver_distinct();

-- Un approbateur posé n'est ni modifié ni retiré (signature incompressible).
CREATE TRIGGER support_approver_append_only
  BEFORE UPDATE OR DELETE ON support_access_approver
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON support_access_approver FROM kombe_app;

-- 3) Porte du granted (double approbation) + progression d'état légale. Une
--    INSERT directe ne peut naître qu'en `pending_approval` (jamais granted
--    d'emblée) ; un UPDATE vers `granted` exige DEUX approbateurs distincts et
--    une expiration ; un accès éteint (revoked/expired) ne se rallume pas.
CREATE OR REPLACE FUNCTION kombe_support_grant_gate() RETURNS trigger AS $$
DECLARE
  v_apps integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_approval' THEN
      RAISE EXCEPTION 'une demande nait toujours pending_approval (statut % interdit a la creation)', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.status = OLD.status THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'version d objet support incoherente (attendue %)', OLD.version + 1
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Transition de statut : transitions légales uniquement.
  IF NOT (
       (OLD.status = 'pending_approval' AND NEW.status IN ('granted', 'revoked', 'expired'))
    OR (OLD.status = 'granted'          AND NEW.status IN ('expired', 'revoked'))
  ) THEN
    RAISE EXCEPTION 'transition d acces support interdite : % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'granted' THEN
    SELECT count(*) INTO v_apps
      FROM support_access_approver WHERE request_id = NEW.request_id;
    IF v_apps < NEW.required_approvals THEN
      RAISE EXCEPTION 'double approbation exigee (%/% approbateurs distincts)', v_apps, NEW.required_approvals
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at IS NULL THEN
      RAISE EXCEPTION 'un granted porte une expiration (acces JIT borne)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER support_grant_gate
  BEFORE INSERT OR UPDATE ON support_access_request
  FOR EACH ROW EXECUTE FUNCTION kombe_support_grant_gate();

-- 4) Journal de sécurité **séparé**, append-only, **sans montant** ni référence
--    de paiement en clair : la colonne `detail` est expurgée AVANT écriture par
--    le domaine (`recordSecurityEvent`) ; la base borne le type (whitelist),
--    l'incompressibilité et l'absence de tout champ monétaire.
CREATE TABLE security_log (
  log_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type        text NOT NULL CHECK (
    event_type IN (
      'support_access_requested', 'support_access_approved', 'support_access_granted',
      'support_access_denied', 'support_financial_action_refused',
      'role_change', 'otp_failure', 'mass_account_creation'
    )
  ),
  actor_identity_id text,
  group_id          text NOT NULL REFERENCES "group"(group_id),
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  detail            text NOT NULL DEFAULT '',
  -- Aucun montant : le flux de sécurité ne charrie jamais de valeur financière
  -- (story 14.7, ADR-0002) ; la non-divulgation est structurelle, pas seulement applicative.
  CONSTRAINT security_log_no_amount CHECK (detail !~ '(^|[[:space:]])[[:digit:]]{6,}([[:space:]]|$)')
);

CREATE TRIGGER security_log_append_only
  BEFORE UPDATE OR DELETE ON security_log
  FOR EACH ROW EXECUTE FUNCTION kombe_journal_append_only();

REVOKE UPDATE, DELETE ON security_log FROM kombe_app;

-- 5) RLS d'isolation multi-tenant (ADR-0007) scopée par le groupe visé du
--    support et par le groupe du journal de sécurité.
ALTER TABLE support_access_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_access_request
  USING (target_group_id = current_setting('kombe.group_id', true));

ALTER TABLE support_access_approver ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_access_approver
  USING (request_id IN (
    SELECT request_id FROM support_access_request
     WHERE target_group_id = current_setting('kombe.group_id', true)
  ));

ALTER TABLE security_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON security_log
  USING (group_id = current_setting('kombe.group_id', true));

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma C17. Ses preuves RÉELLES — double
-- approbation (un `granted` avec < 2 approbateurs distincts refusé par
-- `support_grant_gate`), auto-approbation refusée (`support_approver_distinct`),
-- même compte compté une seule fois (PK `support_access_approver`), permission
-- financière stockée refusée (`support_perms_support_only`), granted sans
-- expiration refusé, réactivation d'un accès éteint refusée (transition),
-- journal de sécurité incompressible (`security_log_append_only` + `REVOKE`) et
-- sans montant (`security_log_no_amount`) — exigent PostgreSQL 16+. Sans base,
-- exécution **BLOCKED** (code 2). La rédaction des données sensibles (téléphone,
-- référence de paiement) est appliquée par le domaine AVANT écriture ; le
-- contrôle `security_log_no_amount` est un garde-fou résiduel, pas le seul.
-- KÓMBE n'exécute aucun transfert et le support n'a aucun pouvoir financier.
