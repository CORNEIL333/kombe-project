-- KÓMBE Piste A3 — Résolveurs de GROUPE pour les routes sans `:groupId` dans
-- le chemin (votes, exports, support, invitations, demandes de droits) +
-- lectures transverses du périmètre C16 (points de restauration).
--
-- PROBLÈME STRUCTUREL (même famille que 0018_session_resolver.sql) : les
-- tables `vote` (0001/0012), `invitation` (0004), `export_manifest` (0015),
-- `support_access_request` (0014), `rights_request` (0016) portent une RLS
-- `tenant_isolation` sur `kombe.group_id` ; `membership` (0001) et
-- `identity_access` (0003) portent une RLS par groupe / self-scope. Or
-- certaines routes HTTP ne portent PAS le groupe dans leur chemin
-- (`/v1/votes/:voteId/ballots`, `/v1/exports/:manifestId/download`,
-- `/v1/support/access-requests/:requestId/approvals`, ...) : impossible de
-- poser `kombe.group_id` AVANT d'avoir résolu le groupe depuis l'objet.
--
-- SOLUTION : des fonctions SECURITY DEFINER ÉTROITES (sortie = le SEUL
-- `group_id`, jamais une ligne complète), même motif que
-- `kombe_resolve_session` (0018, déjà prouvé sur Neon réel). Le rôle table
-- owner n'est pas soumis à la RLS de ses propres tables (aucun FORCE ROW
-- LEVEL SECURITY dans le schéma — vérifié) : SEULE ces fonctions nommées
-- contournent la RLS, `kombe_app` reste NOBYPASSRLS pour tout le reste.
-- Une fois le groupe résolu, l'appelant pose `kombe.group_id` et la RLS
-- standard s'applique normalement (y compris pour l'anti-IDOR : l'absence
-- de ligne visible et l'absence de droit d'accès répondent à l'identique).
--
-- `rights_request.version` : la colonne manquait au schéma 0016 alors que le
-- contrat HTTP expose une version monotone (1 à l'ouverture, +1 à chaque
-- transition — même sémantique que `support_access_request.version`, 0014).

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) invitation → groupe (rachat de lien : capability anonyme ; le groupe
--    doit être connu AVANT de poser kombe.group_id).
CREATE FUNCTION kombe_invitation_group(invitation_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF invitation_id_in IS NULL OR length(invitation_id_in) = 0 OR length(invitation_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT i.group_id FROM invitation i WHERE i.invitation_id = invitation_id_in;
END $$;

-- 2) vote → groupe (bulletins, clôtures, annulations, exécutions : chemin
--    sans groupe, la volée seule est connue).
CREATE FUNCTION kombe_vote_group(vote_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF vote_id_in IS NULL OR length(vote_id_in) = 0 OR length(vote_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.group_id FROM vote v WHERE v.vote_id = vote_id_in;
END $$;

-- 3) manifeste d'export → groupe (manifeste/téléchargements/vérification).
CREATE FUNCTION kombe_export_manifest_group(manifest_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF manifest_id_in IS NULL OR length(manifest_id_in) = 0 OR length(manifest_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT m.group_id FROM export_manifest m WHERE m.manifest_id = manifest_id_in;
END $$;

-- 4) demande d'accès support → groupe CIBLE (approbations/actions/révocations).
CREATE FUNCTION kombe_support_request_group(request_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF request_id_in IS NULL OR length(request_id_in) = 0 OR length(request_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.target_group_id FROM support_access_request r WHERE r.request_id = request_id_in;
END $$;

-- 5) demande de droits (C16) → groupe de rattachement (RLS de rights_request).
CREATE FUNCTION kombe_privacy_rights_group(request_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF request_id_in IS NULL OR length(request_id_in) = 0 OR length(request_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.group_id FROM rights_request r WHERE r.request_id = request_id_in;
END $$;

-- 6) sujet → groupe de rattachement pour l'OUVERTURE d'une demande de droits
--    (le groupe n'existe nulle part côté client ; il est résolu depuis
--    l'adhésion ACTIVE du sujet). Déterministe : premier groupe actif par
--    ordre lexicographique — un sujet multi-groupe voit sa demande rattachée
--    au même groupe à chaque appel, jamais un choix aléatoire.
CREATE FUNCTION kombe_privacy_subject_group(identity_id_in text)
RETURNS TABLE(group_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF identity_id_in IS NULL OR length(identity_id_in) = 0 OR length(identity_id_in) > 200 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT m.group_id
    FROM membership m
    WHERE m.identity_id = identity_id_in AND m.state = 'active'
    ORDER BY m.group_id
    LIMIT 1;
END $$;

-- 7) adhésion ACTIVE (C16-13.4 : disponibilité du service cœur — la RLS
--    par groupe de `membership` rend la lecture directe invisible).
CREATE FUNCTION kombe_privacy_is_active_member(identity_id_in text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF identity_id_in IS NULL OR length(identity_id_in) = 0 OR length(identity_id_in) > 200 THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM membership m
    WHERE m.identity_id = identity_id_in AND m.state = 'active'
  ) INTO v_exists;
  RETURN v_exists;
END $$;

-- 8) Point de restauration (18.10) : instantané TRANSVERSE des identités
--    visibles (adhésion active, non effacée). Lecture cross-groupe par
--    nature — jamais une ligne complète, seulement les identifiants.
CREATE FUNCTION kombe_privacy_active_identities()
RETURNS TABLE(identity_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT m.identity_id
    FROM membership m
    LEFT JOIN data_erasure_tombstone t ON t.identity_id = m.identity_id
    WHERE m.state = 'active' AND t.identity_id IS NULL;
END $$;

-- 9) Révocations d'accès (18.10) : un accès qui n'est plus `active` est
--    rejoué comme révocation au moment de la restauration (self-scope RLS
--    sur identity_access rend la lecture transverse invisible autrement).
CREATE FUNCTION kombe_privacy_revoked_identities()
RETURNS TABLE(identity_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RETURN QUERY
    SELECT a.identity_id FROM identity_access a WHERE a.state <> 'active';
END $$;

-- 10) Version monotone du ticket de droits (contrat HTTP : 1 à l'ouverture,
--     +1 par transition — aligné sur support_access_request.version, 0014).
ALTER TABLE rights_request ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE rights_request ADD CONSTRAINT rights_version_positive CHECK (version >= 1);

-- Moindre privilège : seul kombe_app (rôle applicatif) appelle ces fonctions.
-- Ni PUBLIC, ni kombe_worker, ni kombe_migrateur (DDL only).
REVOKE ALL ON FUNCTION kombe_invitation_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_invitation_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_vote_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_vote_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_export_manifest_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_export_manifest_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_support_request_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_support_request_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_privacy_rights_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_privacy_rights_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_privacy_subject_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_privacy_subject_group(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_privacy_is_active_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_privacy_is_active_member(text) TO kombe_app;
REVOKE ALL ON FUNCTION kombe_privacy_active_identities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_privacy_active_identities() TO kombe_app;
REVOKE ALL ON FUNCTION kombe_privacy_revoked_identities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kombe_privacy_revoked_identities() TO kombe_app;

COMMIT;

-- NOTE D'EXÉCUTION : contrat de schéma Piste A3. Preuves réelles dans
-- packages/api/test/*.proof.mjs (serveur réel + stores PG sur Neon) — un
-- résolveur qui renverrait un groupe étranger, ou une lecture transverse qui
-- relirait une identité effacée, ferait échouer les preuves d'isolation.
