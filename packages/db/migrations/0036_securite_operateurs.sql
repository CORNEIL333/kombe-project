-- KÓMBE — Sécurité des opérateurs et limitation de débit partagée (ADR-0043).
-- Additif, rétrocompatible.
--
-- 1. operator_role : un opérateur n'a plus « tout » par un seul booléen ; ses
--    fonctions sont distinctes (support, operations, direction, engineering,
--    admin). Les opérateurs existants deviennent « admin » (aucune perte
--    d'accès au déploiement ; à restreindre ensuite).
-- 2. operator_mfa : second facteur TOTP (RFC 6238) des opérateurs, secret
--    CHIFFRÉ par l'API (AES-256-GCM, clé hors base), codes de secours hachés.
--    access_session.mfa_verified_at : session élevée après vérification.
-- 3. operator_audit_log : journal append-only des actes d'opérateur (MFA,
--    refus de console), sans donnée personnelle ni montant.
-- 4. auth_rate_limit + kombe_rate_hit() : compteurs à fenêtre fixe PARTAGÉS
--    entre toutes les instances serverless (la limite en mémoire, par
--    instance, ne protège ni des codes en rafale ni des coûts SMS).
-- 5. security_log : type « support_access_revoked ».
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE operator_role (
  identity_id text NOT NULL REFERENCES identity(identity_id),
  role        text NOT NULL CHECK (role IN ('support','operations','direction','engineering','admin')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text NOT NULL DEFAULT 'migration',
  PRIMARY KEY (identity_id, role)
);
INSERT INTO operator_role (identity_id, role, granted_by)
  SELECT identity_id, 'admin', 'migration-0036' FROM identity_access WHERE is_operator = true
  ON CONFLICT DO NOTHING;
ALTER TABLE operator_role ENABLE ROW LEVEL SECURITY;
-- Lecture seule de SES fonctions : jamais d'auto-attribution, même si un
-- provisionnement ultérieur accordait l'écriture (roles.sql : GRANT ALL TABLES).
CREATE POLICY self_read ON operator_role FOR SELECT USING (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT ON operator_role TO kombe_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON operator_role FROM kombe_app;

CREATE TABLE operator_mfa (
  identity_id       text PRIMARY KEY REFERENCES identity(identity_id),
  secret_ciphertext text NOT NULL CHECK (length(secret_ciphertext) BETWEEN 20 AND 400),
  enabled_at        timestamptz,
  last_step         bigint,
  recovery_hashes   text[] NOT NULL DEFAULT '{}',
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operator_mfa ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_scope ON operator_mfa USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT, UPDATE ON operator_mfa TO kombe_app;
REVOKE DELETE ON operator_mfa FROM kombe_app;

ALTER TABLE access_session ADD COLUMN mfa_verified_at timestamptz;
GRANT UPDATE (mfa_verified_at) ON access_session TO kombe_app;

CREATE TABLE operator_audit_log (
  log_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_id text NOT NULL,
  event_type  text NOT NULL CHECK (event_type IN (
    'mfa_enrolled','mfa_enabled','mfa_verified','mfa_failed','mfa_recovery_used','console_denied','role_granted','role_revoked'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  detail      text NOT NULL DEFAULT '' CHECK (length(detail) <= 200)
);
ALTER TABLE operator_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_insert ON operator_audit_log FOR INSERT WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
CREATE POLICY self_read ON operator_audit_log FOR SELECT USING (identity_id = current_setting('kombe.identity_id', true));
GRANT SELECT, INSERT ON operator_audit_log TO kombe_app;
REVOKE UPDATE, DELETE ON operator_audit_log FROM kombe_app;

-- Statut opérateur de la SESSION courante (rôles, MFA) — lecture bornée.
CREATE FUNCTION kombe_operator_status(session_in text)
RETURNS TABLE(is_operator boolean, roles text[], mfa_enabled boolean, mfa_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (a.is_operator AND a.state = 'active'),
         COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM public.operator_role r WHERE r.identity_id = a.identity_id), ARRAY[]::text[]),
         EXISTS (SELECT 1 FROM public.operator_mfa m WHERE m.identity_id = a.identity_id AND m.enabled_at IS NOT NULL),
         (SELECT s.mfa_verified_at FROM public.access_session s WHERE s.session_id = session_in AND s.identity_id = a.identity_id AND s.revoked_at IS NULL)
    FROM public.identity_access a
   WHERE a.identity_id = current_setting('kombe.identity_id', true)
$$;
REVOKE ALL ON FUNCTION kombe_operator_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_operator_status(text) TO kombe_app;

-- Limitation de débit partagée : vrai si la requête est admise.
CREATE TABLE auth_rate_limit (
  bucket_key   text NOT NULL CHECK (length(bucket_key) <= 200),
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
-- `kombe_rate_hit` compte une tentative et dit si elle reste admise ;
-- `kombe_rate_peek` dit si une NOUVELLE tentative serait admise, sans compter
-- (pour ne compter que les échecs, ex. second facteur). L'instant est fourni
-- par l'API (horloge serveur unique, testable).
CREATE FUNCTION kombe_rate_hit(key_in text, window_seconds integer, max_hits integer, at_in timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM at_in) / window_seconds) * window_seconds);
        n integer;
BEGIN
  INSERT INTO public.auth_rate_limit AS t (bucket_key, window_start, hits) VALUES (key_in, w, 1)
    ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = t.hits + 1
    RETURNING t.hits INTO n;
  -- Ménage léger et borné des fenêtres anciennes.
  DELETE FROM public.auth_rate_limit WHERE ctid IN (
    SELECT ctid FROM public.auth_rate_limit WHERE window_start < at_in - interval '2 days' LIMIT 50);
  RETURN n <= max_hits;
END $$;
CREATE FUNCTION kombe_rate_peek(key_in text, window_seconds integer, max_hits integer, at_in timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT hits FROM public.auth_rate_limit
                    WHERE bucket_key = key_in
                      AND window_start = to_timestamp(floor(extract(epoch FROM at_in) / window_seconds) * window_seconds)), 0) < max_hits
$$;
REVOKE ALL ON FUNCTION kombe_rate_peek(text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_rate_peek(text, integer, integer, timestamptz) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_rate_hit(text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_rate_hit(text, integer, integer, timestamptz) TO kombe_app;
REVOKE ALL ON auth_rate_limit FROM kombe_app;
-- Aucune politique : seules les fonctions SECURITY DEFINER (propriétaire) y touchent.
ALTER TABLE auth_rate_limit ENABLE ROW LEVEL SECURITY;

ALTER TABLE security_log DROP CONSTRAINT IF EXISTS security_log_event_type_check;
ALTER TABLE security_log ADD CONSTRAINT security_log_event_type_check CHECK (
  event_type IN (
    'support_access_requested', 'support_access_approved', 'support_access_granted',
    'support_access_denied', 'support_financial_action_refused', 'support_access_revoked',
    'role_change', 'otp_failure', 'mass_account_creation'
  )
);

COMMIT;
