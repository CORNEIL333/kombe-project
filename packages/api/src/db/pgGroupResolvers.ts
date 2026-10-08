/**
 * KÓMBE @kombe/api — résolveurs de GROUPE réels pour les routes dont le
 * chemin ne porte PAS `:groupId` (Piste A3, migration 0020_group_resolvers.sql).
 *
 * Même motif que `pgSessionResolver.ts` (Piste A2) : la RLS `tenant_isolation`
 * filtre sur `kombe.group_id`, qu'il faut donc connaître AVANT toute lecture
 * scopée — or certaines ressources (vote, manifeste d'export, demande support,
 * demande de droits, invitation) identifient un groupe par elles-mêmes, hors
 * du chemin HTTP. Les fonctions SECURITY DEFINER ÉTROITES de 0020 rendent le
 * SEUL `group_id` ; tout le reste de la lecture reste ensuite soumis à la RLS
 * standard (l'anti-IDOR de la route s'applique sur l'objet, pas ici).
 *
 * Contrat commun : `null` = ressource inconnue OU identifiant de forme
 * invalide — indistinguables (non-divulgation), l'appelant répond le MÊME
 * 404 que pour un objet hors portée.
 */
import type pg from "pg";

const MAX_ID_LENGTH = 200;

async function groupVia(
  pool: pg.Pool,
  fn: string,
  id: string,
): Promise<string | null> {
  if (!id || id.length > MAX_ID_LENGTH) return null;
  const res = await pool.query(`SELECT group_id FROM ${fn}($1)`, [id]);
  const row = res.rows[0];
  return row ? String(row.group_id) : null;
}

/** Groupe d'une invitation (rachat de lien — capability anonyme). */
export function invitationGroup(pool: pg.Pool, invitationId: string): Promise<string | null> {
  return groupVia(pool, "kombe_invitation_group", invitationId);
}

/** Groupe d'une volée (bulletins, clôtures, annulations, exécutions). */
export function voteGroup(pool: pg.Pool, voteId: string): Promise<string | null> {
  return groupVia(pool, "kombe_vote_group", voteId);
}

/** Groupe d'un manifeste d'export (manifeste, téléchargements, vérification). */
export function exportManifestGroup(pool: pg.Pool, manifestId: string): Promise<string | null> {
  return groupVia(pool, "kombe_export_manifest_group", manifestId);
}

/** Groupe CIBLE d'une demande d'accès support (approbations, actions, révocations). */
export function supportRequestGroup(pool: pg.Pool, requestId: string): Promise<string | null> {
  return groupVia(pool, "kombe_support_request_group", requestId);
}

/** Groupe de rattachement d'une demande de droits (C16, RLS rights_request). */
export function privacyRightsGroup(pool: pg.Pool, requestId: string): Promise<string | null> {
  return groupVia(pool, "kombe_privacy_rights_group", requestId);
}

/**
 * Groupe de rattachement du SUJET pour l'OUVERTURE d'une demande de droits :
 * le groupe n'existe nulle part côté client ; il est résolu depuis l'adhésion
 * ACTIVE du sujet (déterministe — premier groupe actif par ordre
 * lexicographique, jamais un choix aléatoire entre deux appels).
 * `null` si le sujet n'a aucune adhésion active.
 */
export function privacySubjectGroup(pool: pg.Pool, identityId: string): Promise<string | null> {
  return groupVia(pool, "kombe_privacy_subject_group", identityId);
}
