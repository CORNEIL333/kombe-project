-- Retour arrière de 0024_tontine_core.sql (ordre inverse).
-- Prérequis : aucune ligne n'utilise les rôles élargis (sinon le CHECK
-- réduit échoue) — le harnais rétrograde ces lignes avant le DOWN.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS kombe_invitation_by_code(text);
DROP FUNCTION IF EXISTS kombe_my_memberships();
DROP TABLE IF EXISTS identity_profile;

DROP INDEX IF EXISTS invitation_code_unique;
ALTER TABLE invitation DROP COLUMN IF EXISTS code, DROP COLUMN IF EXISTS created_by_identity_id;

ALTER TABLE journal DROP CONSTRAINT IF EXISTS journal_actor_role_check;
ALTER TABLE journal ADD CONSTRAINT journal_actor_role_check
  CHECK (actor_role IS NULL OR actor_role IN
    ('founder','animator','treasurer','secretary','auditor','member'));

ALTER TABLE role_assignment
  DROP CONSTRAINT IF EXISTS role_assignment_approver_distinct,
  DROP CONSTRAINT IF EXISTS role_assignment_mandate,
  DROP COLUMN IF EXISTS ended_at,
  DROP COLUMN IF EXISTS mandate_end,
  DROP COLUMN IF EXISTS mandate_start,
  DROP COLUMN IF EXISTS approved_by_identity_id,
  DROP COLUMN IF EXISTS proposed_by_identity_id;
ALTER TABLE role_assignment DROP CONSTRAINT IF EXISTS role_assignment_role_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_role_check
  CHECK (role IN ('animator','treasurer','secretary','auditor','member'));

DROP INDEX IF EXISTS membership_one_pending;
ALTER TABLE membership
  DROP CONSTRAINT IF EXISTS membership_admitted_by_other,
  DROP CONSTRAINT IF EXISTS membership_proxy_not_self,
  DROP CONSTRAINT IF EXISTS membership_sponsor_not_self,
  DROP CONSTRAINT IF EXISTS membership_proxy_fk,
  DROP CONSTRAINT IF EXISTS membership_sponsor_fk,
  DROP COLUMN IF EXISTS proxy_membership_id,
  DROP COLUMN IF EXISTS sponsor_membership_id,
  DROP COLUMN IF EXISTS invitation_id,
  DROP COLUMN IF EXISTS admitted_by_identity_id,
  DROP COLUMN IF EXISTS joined_at,
  DROP COLUMN IF EXISTS display_name;

ALTER TABLE "group"
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS settings,
  DROP COLUMN IF EXISTS created_by_identity_id,
  DROP COLUMN IF EXISTS name;

COMMIT;
