-- Retour arrière de 0042_securite_residuelle.
-- ATTENTION : les empreintes de session ne peuvent pas redevenir des jetons.
-- Après ce retour arrière, les sessions ouvertes ne sont plus reconnues :
-- chacun se reconnecte (aucune donnée perdue, aucune écriture effacée).
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS operator_all ON pilot_risk;
ALTER TABLE pilot_risk DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_read ON legal_notice;
DROP POLICY IF EXISTS operator_insert ON legal_notice;
ALTER TABLE legal_notice DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_read ON processing_record;
DROP POLICY IF EXISTS operator_insert ON processing_record;
ALTER TABLE processing_record DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_all ON restore_point;
ALTER TABLE restore_point DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_read ON data_erasure_tombstone;
DROP POLICY IF EXISTS self_insert ON data_erasure_tombstone;
DROP POLICY IF EXISTS operator_read ON data_erasure_tombstone;
ALTER TABLE data_erasure_tombstone DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_all ON personal_consent;
ALTER TABLE personal_consent DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION kombe_operator_status(session_in text)
RETURNS TABLE(is_operator boolean, roles text[], mfa_enabled boolean, mfa_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (a.is_operator AND a.state = 'active'),
         COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM public.operator_role r WHERE r.identity_id = a.identity_id), ARRAY[]::text[]),
         EXISTS (SELECT 1 FROM public.operator_mfa m WHERE m.identity_id = a.identity_id AND m.enabled_at IS NOT NULL),
         (SELECT s.mfa_verified_at FROM public.access_session s WHERE s.session_id = session_in AND s.identity_id = a.identity_id AND s.revoked_at IS NULL)
    FROM public.identity_access a
   WHERE a.identity_id = current_setting('kombe.identity_id', true)
$$;

CREATE OR REPLACE FUNCTION kombe_resolve_session(session_id_in text)
RETURNS TABLE(
  identity_id text,
  account_state text,
  is_operator boolean,
  account_session_generation integer,
  recovery_lock_until timestamptz,
  session_generation integer,
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF session_id_in IS NULL OR length(session_id_in) = 0 OR length(session_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.identity_id, a.state, a.is_operator, a.session_generation,
           a.recovery_lock_until,
           s.generation, s.issued_at, s.expires_at, s.revoked_at
    FROM access_session s
    JOIN identity_access a ON a.identity_id = s.identity_id
    WHERE s.session_id = session_id_in
    FOR SHARE OF s, a;
END $$;

ALTER TABLE access_session DROP CONSTRAINT IF EXISTS access_session_token_hashed;
DROP TRIGGER IF EXISTS access_session_hash ON access_session;
DROP FUNCTION IF EXISTS kombe_session_hash_on_insert();
DROP FUNCTION IF EXISTS kombe_session_key(text);

COMMIT;
