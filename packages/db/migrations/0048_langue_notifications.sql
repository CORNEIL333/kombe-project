-- KÓMBE — Langue des messages envoyés hors de l'application (A15). Additif.
-- La langue est celle du profil (`identity_profile.language`, choisie dans
-- l'application). Le répartiteur n'a pas de contexte de session : il la lit
-- par cette fonction étroite (une identité → sa langue, rien d'autre).
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_notification_locale(identity_in text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN (SELECT p.language FROM public.identity_profile p WHERE p.identity_id = identity_in) = 'en' THEN 'en' ELSE 'fr' END
$$;
REVOKE ALL ON FUNCTION kombe_notification_locale(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_notification_locale(text) TO kombe_app;

COMMIT;
