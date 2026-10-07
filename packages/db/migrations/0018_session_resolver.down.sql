-- Retour arrière de 0018_session_resolver.sql — purement additive (une seule
-- fonction), donc un DROP simple et symétrique.
BEGIN;
DROP FUNCTION IF EXISTS kombe_resolve_session(text);
COMMIT;
