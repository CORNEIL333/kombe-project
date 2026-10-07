/**
 * KÓMBE @kombe/api — résolution RÉELLE de session (Piste A2). Remplace la
 * confiance aveugle de `server.ts` (`actorFrom` parse un en-tête JSON fourni
 * PAR LE CLIENT, `x-actor`, sans aucune vérification serveur — voir
 * `server.ts:222-227`) par une résolution base réelle, conforme `ADR-0012`.
 *
 * `resolveSession` contourne le problème structurel documenté dans
 * `packages/db/migrations/0018_session_resolver.sql` : `access_session`/
 * `identity_access` ont une RLS self-scope sur `kombe.identity_id`, donc
 * chercher une session par son identifiant est impossible sans déjà
 * connaître l'identité recherchée. La fonction SECURITY DEFINER
 * `kombe_resolve_session` (même motif que `kombe_c13_dispatch_rights`,
 * déjà prouvé en base réelle) fait ce bypass ÉTROIT ; toute décision de
 * validité reste ensuite dans la fonction pure `assertSessionUsable` de
 * `@kombe/domain`, inchangée.
 *
 * `resolveGroupActor` n'a PAS besoin de SECURITY DEFINER : appelée APRÈS que
 * `kombe.group_id` est posé (ex. dans `withGroupTx`), la RLS `tenant_isolation`
 * standard s'applique normalement — même motif que `pgContributionStore.ts`
 * (Piste A1).
 */
import type pg from "pg";
import {
  DomainError,
  assertSessionUsable,
  type AccessAccount,
  type Session,
  type Role,
} from "@kombe/domain";

export interface ResolvedIdentity {
  readonly identityId: string;
  readonly isOperator: boolean;
}

/**
 * Résout une session OPAQUE (ex. `Authorization: Bearer <sessionId>`) en
 * identité réelle. À appeler EN TOUT DÉBUT de transaction, avant tout
 * `set_config('kombe.group_id', ...)`. Pose `kombe.identity_id` pour toute
 * lecture identité-scopée ultérieure dans la MÊME transaction (RLS standard,
 * cf. commentaire migration 0003_access.sql).
 */
export async function resolveSession(
  client: pg.PoolClient,
  sessionId: string,
  now: number,
): Promise<ResolvedIdentity> {
  // Non-divulgation : forme invalide et session inconnue répondent à
  // l'identique (même DomainError), jamais de distinction observable.
  if (!sessionId || sessionId.length > 200) {
    throw new DomainError("SESSION_INVALID", "Session non applicable");
  }
  const res = await client.query("SELECT * FROM kombe_resolve_session($1)", [sessionId]);
  const row = res.rows[0];
  if (!row) {
    throw new DomainError("SESSION_INVALID", "Session non applicable");
  }
  const account: AccessAccount = {
    identityId: String(row.identity_id),
    state: row.account_state as AccessAccount["state"],
    channelVerified: true,
    mfaEnrolled: false,
    isOperator: row.is_operator === true,
    sessionGeneration: Number(row.account_session_generation),
    recoveryLockUntil: row.recovery_lock_until
      ? new Date(row.recovery_lock_until as string).getTime()
      : null,
  };
  const session: Session = {
    sessionId,
    identityId: String(row.identity_id),
    generation: Number(row.session_generation),
    issuedAt: new Date(row.issued_at as string).getTime(),
    expiresAt: new Date(row.expires_at as string).getTime(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string).getTime() : null,
  };
  // Fonction pure inchangée de @kombe/domain : état actif, génération,
  // révocation, expiration — la même logique que FictitiousAccessStore.
  assertSessionUsable(account, session, now);

  await client.query("SELECT set_config('kombe.identity_id', $1, true)", [account.identityId]);
  return { identityId: account.identityId, isOperator: account.isOperator };
}

export interface GroupActor {
  readonly identityId: string;
  readonly membershipId: string;
  readonly roles: readonly Role[];
}

/**
 * Résout l'adhésion ACTIVE et les rôles ACCEPTÉS d'une identité dans le
 * groupe déjà scopé par la transaction (`kombe.group_id`). Un membre peut
 * légitimement porter plusieurs rôles simultanément (schéma
 * `role_assignment`, pas de contrainte d'unicité par membership) : cette
 * fonction retourne l'ENSEMBLE, elle ne choisit pas un rôle unique — ce
 * choix reste un point ouvert (voir note d'appel, server.ts à venir).
 */
export async function resolveGroupActor(
  client: pg.PoolClient,
  identityId: string,
  groupId: string,
): Promise<GroupActor> {
  const res = await client.query(
    `SELECT m.membership_id, r.role
     FROM membership m
     JOIN role_assignment r USING (group_id, membership_id)
     WHERE m.group_id = $1 AND m.identity_id = $2 AND m.state = 'active'
       AND r.accepted_at IS NOT NULL`,
    [groupId, identityId],
  );
  // Anti-IDOR / non-divulgation : absence d'adhésion active (ou groupe
  // inexistant) répond comme un refus d'accès générique, jamais une
  // distinction observable entre les deux cas.
  if (res.rows.length === 0) {
    throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
  }
  return {
    identityId,
    membershipId: String(res.rows[0].membership_id),
    roles: res.rows.map((r) => r.role as Role),
  };
}
