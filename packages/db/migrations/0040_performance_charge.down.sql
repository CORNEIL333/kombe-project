-- Retour arrière de 0040_performance_charge (ménage à chaque appel, sans index).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kombe_api') THEN
    ALTER ROLE kombe_api RESET statement_timeout;
    ALTER ROLE kombe_api RESET lock_timeout;
    ALTER ROLE kombe_api RESET idle_in_transaction_session_timeout;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  DROP INDEX IF EXISTS membership_by_identity;
  DROP INDEX IF EXISTS auth_rate_limit_by_window;
  CREATE OR REPLACE FUNCTION kombe_rate_hit(key_in text, window_seconds integer, max_hits integer, at_in timestamptz DEFAULT now())
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
  DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM at_in) / window_seconds) * window_seconds);
          n integer;
  BEGIN
    INSERT INTO public.auth_rate_limit AS t (bucket_key, window_start, hits) VALUES (key_in, w, 1)
      ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = t.hits + 1
      RETURNING t.hits INTO n;
    DELETE FROM public.auth_rate_limit WHERE ctid IN (
      SELECT ctid FROM public.auth_rate_limit WHERE window_start < at_in - interval '2 days' LIMIT 50);
    RETURN n <= max_hits;
  END $f$;
EXCEPTION WHEN undefined_table OR undefined_function THEN NULL; END $$;
COMMIT;
