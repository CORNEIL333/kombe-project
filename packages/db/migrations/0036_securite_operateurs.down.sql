-- Retour arrière de 0036_securite_operateurs. Refuse de perdre des journaux.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM operator_audit_log) THEN
    RAISE EXCEPTION 'Journal des opérateurs non vide : retour arrière refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM security_log WHERE event_type = 'support_access_revoked') THEN
    RAISE EXCEPTION 'Révocations journalisées : retour arrière refusé';
  END IF;
  ALTER TABLE security_log DROP CONSTRAINT IF EXISTS security_log_event_type_check;
  ALTER TABLE security_log ADD CONSTRAINT security_log_event_type_check CHECK (
    event_type IN ('support_access_requested', 'support_access_approved', 'support_access_granted',
      'support_access_denied', 'support_financial_action_refused', 'role_change', 'otp_failure', 'mass_account_creation'));
  DROP FUNCTION IF EXISTS kombe_rate_peek(text, integer, integer, timestamptz);
  DROP FUNCTION IF EXISTS kombe_rate_hit(text, integer, integer, timestamptz);
  DROP TABLE IF EXISTS auth_rate_limit;
  DROP FUNCTION IF EXISTS kombe_operator_status(text);
  DROP TABLE IF EXISTS operator_audit_log;
  ALTER TABLE access_session DROP COLUMN IF EXISTS mfa_verified_at;
  DROP TABLE IF EXISTS operator_mfa;
  DROP TABLE IF EXISTS operator_role;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
COMMIT;
