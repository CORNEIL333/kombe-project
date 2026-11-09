-- KÓMBE — Sécurité résiduelle R-01 et R-02 (docs/production-readiness/02). Additive.
--
-- R-01 — Jetons de session : la base ne garde plus que leur EMPREINTE.
--   Une fuite de la base ne permet plus de détourner une session : on y lit
--   « sha256:<64 hexadécimaux> », jamais le jeton remis au navigateur.
--   * kombe_session_key(jeton) calcule l'empreinte ; toute recherche passe par
--     elle (résolution, statut opérateur, déconnexion, second facteur). Une
--     empreinte présentée comme jeton est hachée à son tour : elle ne correspond
--     à rien.
--   * Un déclencheur hache le jeton à l'insertion : le code qui crée une
--     session n'a pas à changer, et aucun chemin ne peut stocker un jeton clair
--     (contrainte de forme, en plus).
--   * Les sessions existantes sont hachées ici même : personne n'est déconnecté
--     (le jeton détenu par le navigateur donne la même empreinte).
--   Jeton = UUID aléatoire (122 bits) : SHA-256 sans sel suffit (pas de
--   dictionnaire possible sur un tel espace).
--
-- R-02 — Règles d'accès ligne par ligne (RLS) sur les tables qui n'en avaient pas :
--   * personal_consent       : la personne seule (lecture et écriture) ;
--   * data_erasure_tombstone : la personne écrit et lit sa ligne ; les
--                              opérateurs lisent (restauration) ;
--   * restore_point          : opérateurs seulement ;
--   * processing_record      : opérateurs (lecture, ajout) ;
--   * legal_notice           : lecture publique (mentions légales), ajout par
--                              les opérateurs ;
--   * pilot_risk             : opérateurs seulement.
--   Les fonctions SECURITY DEFINER existantes (0020) ne sont pas affectées.
--   La table "group" reste sans RLS : elle ne porte aucune donnée personnelle
--   (nom, état, règlement) et est lue par de nombreux chemins (invitation,
--   aperçu) ; risque résiduel consigné.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

/* ── R-01 ──────────────────────────────────────────────────────────────── */
CREATE FUNCTION kombe_session_key(token text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT 'sha256:' || encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;
GRANT EXECUTE ON FUNCTION kombe_session_key(text) TO kombe_app;

CREATE FUNCTION kombe_session_hash_on_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.session_id := kombe_session_key(NEW.session_id);
  RETURN NEW;
END $$;

-- Sessions déjà ouvertes : même empreinte que le jeton détenu par le navigateur.
UPDATE access_session SET session_id = kombe_session_key(session_id) WHERE session_id !~ '^sha256:[0-9a-f]{64}$';

CREATE TRIGGER access_session_hash BEFORE INSERT ON access_session
  FOR EACH ROW EXECUTE FUNCTION kombe_session_hash_on_insert();
ALTER TABLE access_session ADD CONSTRAINT access_session_token_hashed CHECK (session_id ~ '^sha256:[0-9a-f]{64}$');

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
    WHERE s.session_id = kombe_session_key(session_id_in)
    FOR SHARE OF s, a;
END $$;
REVOKE ALL ON FUNCTION kombe_resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_resolve_session(text) TO kombe_app;

CREATE OR REPLACE FUNCTION kombe_operator_status(session_in text)
RETURNS TABLE(is_operator boolean, roles text[], mfa_enabled boolean, mfa_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (a.is_operator AND a.state = 'active'),
         COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM public.operator_role r WHERE r.identity_id = a.identity_id), ARRAY[]::text[]),
         EXISTS (SELECT 1 FROM public.operator_mfa m WHERE m.identity_id = a.identity_id AND m.enabled_at IS NOT NULL),
         (SELECT s.mfa_verified_at FROM public.access_session s
           WHERE s.session_id = public.kombe_session_key(session_in) AND s.identity_id = a.identity_id AND s.revoked_at IS NULL)
    FROM public.identity_access a
   WHERE a.identity_id = current_setting('kombe.identity_id', true)
$$;
REVOKE ALL ON FUNCTION kombe_operator_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_operator_status(text) TO kombe_app;

/* ── R-02 ──────────────────────────────────────────────────────────────── */
ALTER TABLE personal_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_all ON personal_consent
  USING (identity_id = current_setting('kombe.identity_id', true))
  WITH CHECK (identity_id = current_setting('kombe.identity_id', true));

ALTER TABLE data_erasure_tombstone ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON data_erasure_tombstone FOR SELECT USING (identity_id = current_setting('kombe.identity_id', true));
CREATE POLICY self_insert ON data_erasure_tombstone FOR INSERT WITH CHECK (identity_id = current_setting('kombe.identity_id', true));
CREATE POLICY operator_read ON data_erasure_tombstone FOR SELECT USING (kombe_is_operator());

ALTER TABLE restore_point ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON restore_point USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());

ALTER TABLE processing_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_read ON processing_record FOR SELECT USING (kombe_is_operator());
CREATE POLICY operator_insert ON processing_record FOR INSERT WITH CHECK (kombe_is_operator());

ALTER TABLE legal_notice ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read ON legal_notice FOR SELECT USING (true);
CREATE POLICY operator_insert ON legal_notice FOR INSERT WITH CHECK (kombe_is_operator());

ALTER TABLE pilot_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_all ON pilot_risk USING (kombe_is_operator()) WITH CHECK (kombe_is_operator());

COMMIT;
