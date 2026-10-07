-- KÓMBE Piste A2 — Résolution de session RÉELLE (remplace l'en-tête client
-- `x-actor` fictif de server.ts par une identité résolue en base, ADR-0012).
--
-- PROBLÈME STRUCTUREL : `access_session`/`identity_access` (migration 0003)
-- portent une politique RLS self-scope sur `kombe.identity_id`
-- (`USING (identity_id = current_setting('kombe.identity_id', true))`).
-- Impossible donc de chercher une session par son `session_id` SANS déjà
-- connaître l'identité qu'on cherche justement à résoudre : avec
-- `kombe.identity_id` non posé, `current_setting(..., true)` renvoie NULL,
-- et `identity_id = NULL` ne filtre JAMAIS aucune ligne vers kombe_app.
--
-- SOLUTION : une fonction SECURITY DEFINER dédiée, même motif que
-- `kombe_c13_dispatch_rights`/`kombe_c13_replay_rights` (migration 0013,
-- déjà prouvé en base réelle sur Neon, H07 PASS) — sortie minimale
-- (jamais `password_hash`, jamais une ligne complète), jamais un bypass RLS
-- général : SEULE cette fonction nommée contourne RLS, kombe_app lui-même
-- reste NOBYPASSRLS pour tout le reste.
--
-- Une fois l'identité résolue et `kombe.identity_id` posé par l'appelant
-- (packages/api/src/db/pgSessionResolver.ts), toute lecture identité-scopée
-- ultérieure dans la MÊME transaction passe par la RLS standard — aucune
-- autre fonction SECURITY DEFINER n'est nécessaire pour ça.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_resolve_session(session_id_in text)
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

-- Moindre privilège : seul kombe_app (rôle applicatif requêtes) appelle
-- cette fonction. Ni kombe_worker, ni PUBLIC, ni kombe_migrateur (DDL only).
REVOKE ALL ON FUNCTION kombe_resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_resolve_session(text) TO kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma Piste A2. Sa preuve réelle (bypass
-- RLS correct pour UNE session via la fonction, RLS standard intacte pour
-- toute requête directe sur access_session/identity_access hors de cette
-- fonction, refus d'exécution pour tout rôle autre que kombe_app) exige
-- PostgreSQL 16+ réel — voir packages/api/test/pgSessionResolver.proof.mjs.
