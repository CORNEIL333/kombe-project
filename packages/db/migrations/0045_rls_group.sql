-- KÓMBE — RLS de la table "group" (fin du risque résiduel R-02). Additif.
--
-- Avant : toute requête du rôle applicatif pouvait lire tous les groupes
-- (nom, état, règlement). Désormais une ligne n'est visible que :
--   * dans le contexte du groupe posé par le serveur (kombe.group_id) : lecture,
--     création et modification, comme pour toutes les tables du produit ;
--   * par un membre (ou ancien membre) du groupe : lecture ;
--   * par un opérateur de la plateforme (CRM) : lecture ;
--   * pour un groupe ouvert à la découverte (is_discoverable) : lecture.
-- Les fonctions SECURITY DEFINER existantes (consoles, « mes groupes »,
-- aperçu d'invitation) ne sont pas affectées. La chaîne des groupes parents
-- (socle de gouvernance) passe par deux fonctions étroites.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_is_member_of(group_in text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.membership m
                  WHERE m.group_id = group_in AND m.identity_id = current_setting('kombe.identity_id', true))
$$;

CREATE FUNCTION kombe_group_exists(group_in text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public."group" WHERE group_id = group_in)
$$;

/* Ascendance d'un groupe, du parent le plus proche au plus lointain (64 au plus, anti-boucle). */
CREATE FUNCTION kombe_group_ancestors(group_in text) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE chain text[] := ARRAY[]::text[]; cur text;
BEGIN
  SELECT parent_group_id INTO cur FROM public."group" WHERE group_id = group_in;
  WHILE cur IS NOT NULL AND cardinality(chain) < 64 LOOP
    chain := chain || cur;
    SELECT parent_group_id INTO cur FROM public."group" WHERE group_id = cur;
  END LOOP;
  RETURN chain;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['kombe_is_member_of(text)', 'kombe_group_exists(text)', 'kombe_group_ancestors(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO kombe_app', f);
  END LOOP;
END $$;

ALTER TABLE "group" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_all ON "group"
  USING (group_id = current_setting('kombe.group_id', true))
  WITH CHECK (group_id = current_setting('kombe.group_id', true));
CREATE POLICY member_read ON "group" FOR SELECT USING (kombe_is_member_of(group_id));
CREATE POLICY operator_read ON "group" FOR SELECT USING (kombe_is_operator());
CREATE POLICY discoverable_read ON "group" FOR SELECT USING (is_discoverable);

COMMIT;
