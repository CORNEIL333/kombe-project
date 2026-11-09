-- KÓMBE — Tenue en charge (≥ 5 000 personnes simultanées). Additif.
-- Mesuré sur le banc scripts/loadtest-5000.mjs (06/11/2026) :
-- 1. kombe_my_memberships() (appelée par presque chaque écran) parcourait TOUTE
--    la table membership (pas d'index sur identity_id) : ~2 ms à 5 000
--    adhésions, linéaire avec la taille ; 131 M de lignes lues en 3 minutes.
-- 2. kombe_rate_hit() faisait son ménage à CHAQUE appel par un DELETE sur
--    window_start, sans index : parcours complet à chaque tentative de
--    connexion (100 M de lignes lues pendant une rafale de connexions).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS membership_by_identity ON membership (identity_id, state);
CREATE INDEX IF NOT EXISTS auth_rate_limit_by_window ON auth_rate_limit (window_start);

CREATE OR REPLACE FUNCTION kombe_rate_hit(key_in text, window_seconds integer, max_hits integer, at_in timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM at_in) / window_seconds) * window_seconds);
        n integer;
BEGIN
  INSERT INTO public.auth_rate_limit AS t (bucket_key, window_start, hits) VALUES (key_in, w, 1)
    ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = t.hits + 1
    RETURNING t.hits INTO n;
  -- Ménage des fenêtres anciennes : un appel sur cinquante, borné, par index.
  IF random() < 0.02 THEN
    DELETE FROM public.auth_rate_limit WHERE ctid IN (
      SELECT ctid FROM public.auth_rate_limit WHERE window_start < at_in - interval '2 days' LIMIT 500);
  END IF;
  RETURN n <= max_hits;
END $$;

-- 3. Délais de la connexion applicative en VALEURS PAR DÉFAUT du rôle de
--    connexion (appliquées aussi aux connexions ouvertes par le pooler) : plus
--    de trois SET LOCAL par transaction (3 instructions sur 8 pour la pastille).
--    L'API vérifie leur présence et revient aux SET LOCAL sinon.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api') THEN
    BEGIN
      ALTER ROLE kombe_api SET statement_timeout = '9s';
      ALTER ROLE kombe_api SET lock_timeout = '3s';
      ALTER ROLE kombe_api SET idle_in_transaction_session_timeout = '9s';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Délais par défaut de kombe_api non posables par ce rôle : l''API utilisera SET LOCAL.';
    END;
  END IF;
END $$;

COMMIT;
