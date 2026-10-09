-- KÓMBE — LECTURE MULTI-ADHÉSION « MES TONTINES » (C21 §2.5, vue consolidée).
-- Additif : une membre peut appartenir à PLUSIEURS tontines, et une grande
-- tontine peut en superviser plusieurs (hiérarchie parent/enfant). L'UI a besoin
-- de lister, pour une identité donnée, toutes les tontines dont elle est membre.
--
-- POURQUOI UNE FONCTION SECURITY DEFINER : `membership` est sous RLS tenant
-- (0001_init.sql:205 — politique `group_id = current_setting('kombe.group_id')`),
-- donc une lecture directe par le rôle applicatif n'est possible QUE groupe par
-- groupe et ne peut PAS exprimer « tous les groupes d'une identité » à travers
-- les tenants. C'est le même problème, déjà résolu et audité, que
-- `kombe_privacy_subject_group` / `kombe_privacy_is_active_member` (migration
-- 0020) : un pont SECURITY DEFINER, de moindre privilège, scotché à l'identité
-- passée par le SERVEUR (§14 — le client ne choisit jamais de quelle identité il
-- liste). `group` n'est PAS sous RLS, mais la jointure part de `membership`,
-- d'où le besoin du pont. N'expose AUCUN champ financier : identité de la
-- tontine, son rôle dans la hiérarchie (parent) et l'état de l'adhésion.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION kombe_member_groups(identity_id_in text)
RETURNS TABLE(
  group_id         text,
  display_name     text,
  tontine_model    text,
  rotation_type    text,
  state            text,
  parent_group_id  text,
  membership_state text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  -- Garde d'entrée stricte : identité vide/trop longue → aucun résultat (jamais
  -- une erreur qui fuiterait l'existence d'un identifiant).
  IF identity_id_in IS NULL OR length(identity_id_in) = 0 OR length(identity_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT g.group_id, g.display_name, g.tontine_model, g.rotation_type,
           g.state, g.parent_group_id, m.state
      FROM membership m
      JOIN "group" g ON g.group_id = m.group_id
     WHERE m.identity_id = identity_id_in
     ORDER BY g.group_id;
END $$;

-- Moindre privilège : seule l'applicatif (kombe_app) peut appeler le pont ;
-- jamais PUBLIC. Le pont bypass la RLS membership UNIQUEMENT pour la projection
-- sans champ financier, scotchée à l'identité fournie par le serveur.
REVOKE ALL ON FUNCTION kombe_member_groups(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_member_groups(text) TO kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de lecture consolidée. Sa preuve réelle (membre
-- multi-tontines listé, hiérarchie parent révélée, identité sans adhésion → vide,
-- aucun champ financier exposé) est rendue en base réelle par packages/api/test/
-- pgOnboardingStore.proof.mjs (section O-MYGROUPS), sur PostgreSQL 16+/Neon.
