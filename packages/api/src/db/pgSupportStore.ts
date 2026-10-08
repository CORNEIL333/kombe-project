/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour la console support (C17).
 * Même esprit que pgContributionStore.ts/pgAccessStore.ts : TOUTE décision
 * reste dans les fonctions pures de `@kombe/domain` (`support.ts`,
 * `securityLog.ts`) ; ce fichier ne fait que les exécuter contre des lignes
 * Postgres réelles sous verrou. Le schéma réel (migration 0014) encode en
 * base des gardes supplémentaires (trigger `support_grant_gate` : double
 * approbation + expiration cohérente ; trigger `support_approver_distinct` :
 * jamais l'applicant comme son propre approbateur ; `security_log` append-only
 * + CHECK sans montant) — défense en profondeur, pas un remplacement des
 * fonctions pures, qui restent appelées EN PREMIER pour produire le bon
 * DomainError stable plutôt qu'une erreur Postgres brute.
 *
 * Écart assumé avec le contrat fictif : `approve`/`act`/`revoke`/`probe`
 * prennent un `groupId` explicite en plus de `requestId` (comme
 * pgContributionStore.declare/view le font déjà pour `obligationId`) — la RLS
 * `tenant_isolation` sur `support_access_request`/`support_access_approver`/
 * `security_log` filtre sur `kombe.group_id`, qu'il faut donc connaître AVANT
 * toute lecture scopée (même motif que le reste de la Piste A : le groupe est
 * déjà porté par le chemin HTTP `/v1/groups/:groupId/...`).
 */
import type pg from "pg";
import {
  DomainError,
  approveSupportAccess,
  assertSupportActionAllowed,
  createSupportAccessRequest,
  recordSecurityEvent,
  redactProviderError,
  revokeSupportAccess,
  supportAccessAllowed,
  REQUIRED_APPROVALS,
  type SecurityEvent,
  type SupportAccessRequest,
  type SupportAccessState,
  type SupportPermission,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";

export interface SupportContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  readonly actorGroupIds: readonly string[];
  readonly serverNow: number;
  readonly commandId: string;
}

export interface CreateAccessCommand {
  readonly requestId: string;
  readonly targetGroupId: string;
  readonly motif: string;
  readonly permissions: readonly string[];
  readonly ttlSeconds: number;
}

export interface SupportAccessView {
  readonly requestId: string;
  readonly applicantIdentityId: string;
  readonly targetGroupId: string;
  readonly motif: string;
  readonly permissions: readonly SupportPermission[];
  readonly approverCount: number;
  readonly requiredApprovals: number;
  readonly requestedAt: number;
  readonly expiresAt: number | null;
  readonly status: SupportAccessState;
  readonly version: number;
}

export interface ActionReceipt {
  readonly requestId: string;
  readonly action: string;
  readonly groupId: string;
  readonly accessAllowed: boolean;
  readonly version: number;
}

function toView(request: SupportAccessRequest, version: number): SupportAccessView {
  return {
    requestId: request.requestId,
    applicantIdentityId: request.applicantIdentityId,
    targetGroupId: request.targetGroupId,
    motif: request.motif,
    permissions: request.permissions,
    approverCount: request.approverIds.length,
    requiredApprovals: REQUIRED_APPROVALS,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    status: request.status,
    version,
  };
}

export class PgSupportStore {
  constructor(private readonly pool: pg.Pool) {}

  private async loadForUpdate(
    client: pg.PoolClient,
    requestId: string,
  ): Promise<{ request: SupportAccessRequest; version: number }> {
    const res = await client.query(
      `SELECT request_id, applicant_identity_id, target_group_id, motif, permissions,
              requested_at, expires_at, revoked_at, status, version
       FROM support_access_request WHERE request_id = $1 FOR UPDATE`,
      [requestId],
    );
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
    const apprRes = await client.query(
      `SELECT approver_identity_id FROM support_access_approver WHERE request_id = $1 ORDER BY approved_at`,
      [requestId],
    );
    const request: SupportAccessRequest = {
      requestId: String(row.request_id),
      applicantIdentityId: String(row.applicant_identity_id),
      targetGroupId: String(row.target_group_id),
      motif: String(row.motif),
      permissions: row.permissions as SupportPermission[],
      requestedAt: Math.floor(new Date(row.requested_at as string).getTime() / 1000),
      expiresAt: row.expires_at ? Math.floor(new Date(row.expires_at as string).getTime() / 1000) : null,
      approverIds: apprRes.rows.map((r) => String(r.approver_identity_id)),
      revokedAt: row.revoked_at ? Math.floor(new Date(row.revoked_at as string).getTime() / 1000) : null,
      status: row.status as SupportAccessState,
    };
    return { request, version: Number(row.version) };
  }

  private async writeLog(
    client: pg.PoolClient,
    ctx: SupportContext,
    groupId: string,
    eventType: string,
    detail: string,
  ): Promise<void> {
    const event: SecurityEvent = recordSecurityEvent({
      eventType,
      actorIdentityId: ctx.actorIdentityId,
      groupId,
      occurredAt: ctx.serverNow,
      detail,
    });
    await client.query(
      `INSERT INTO security_log (event_type, actor_identity_id, group_id, occurred_at, detail)
       VALUES ($1,$2,$3,$4,$5)`,
      [event.eventType, event.actorIdentityId, event.groupId, new Date(event.occurredAt * 1000), event.detail],
    );
  }

  async request(ctx: SupportContext, input: CreateAccessCommand): Promise<SupportAccessView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, input.targetGroupId, async (client) => {
      const existing = await client.query(`SELECT 1 FROM support_access_request WHERE request_id = $1`, [
        input.requestId,
      ]);
      if (existing.rows.length > 0) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Demande déjà enregistrée");
      }
      // Décision PURE d'abord (motif requis, permissions bornées au support) :
      // produit le DomainError stable AVANT toute écriture, jamais une erreur
      // Postgres brute remontée au client.
      const built = createSupportAccessRequest({
        requestId: input.requestId,
        applicantIdentityId: ctx.actorIdentityId,
        targetGroupId: input.targetGroupId,
        motif: input.motif,
        permissions: input.permissions,
        now: ctx.serverNow,
        ttlSeconds: input.ttlSeconds,
      });
      await client.query(
        `INSERT INTO support_access_request
           (request_id, applicant_identity_id, target_group_id, motif, permissions, requested_at, status, version)
         VALUES ($1,$2,$3,$4,$5,$6,'pending_approval',1)`,
        [
          built.requestId,
          built.applicantIdentityId,
          built.targetGroupId,
          built.motif,
          built.permissions,
          new Date(built.requestedAt * 1000),
        ],
      );
      await this.writeLog(client, ctx, input.targetGroupId, "support_access_requested", input.motif);
      return toView(built, 1);
    });
  }

  async approve(ctx: SupportContext, groupId: string, requestId: string, ttlSeconds: number): Promise<SupportAccessView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadForUpdate(client, requestId);
      const wasPending = request.status === "pending_approval";
      // Décision pure : approbateur distinct de l'applicant et des précédents,
      // seuil REQUIRED_APPROVALS pour passer granted (jamais par cette couche).
      const next = approveSupportAccess(request, ctx.actorIdentityId, ctx.serverNow, ttlSeconds);
      await client.query(
        `INSERT INTO support_access_approver (request_id, approver_identity_id, approved_at) VALUES ($1,$2,$3)`,
        [requestId, ctx.actorIdentityId, new Date(ctx.serverNow * 1000)],
      );
      const newVersion = version + 1;
      await client.query(
        `UPDATE support_access_request SET status=$2, expires_at=$3, version=$4 WHERE request_id=$1`,
        [requestId, next.status, next.expiresAt ? new Date(next.expiresAt * 1000) : null, newVersion],
      );
      if (next.status === "granted" && wasPending) {
        await this.writeLog(client, ctx, groupId, "support_access_granted", requestId);
      } else {
        await this.writeLog(client, ctx, groupId, "support_access_approved", requestId);
      }
      return toView(next, newVersion);
    });
  }

  async act(ctx: SupportContext, groupId: string, requestId: string, action: string): Promise<ActionReceipt> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadForUpdate(client, requestId);
      try {
        assertSupportActionAllowed(request, action, groupId, ctx.serverNow);
      } catch (e) {
        if (e instanceof DomainError) {
          const eventType =
            e.code === "SUPPORT_FINANCIAL_FORBIDDEN" ? "support_financial_action_refused" : "support_access_denied";
          await this.writeLog(client, ctx, groupId, eventType, `${action} : ${redactProviderError(e.message)}`);
        }
        throw e;
      }
      // Action autorisée : AUCUNE mutation, AUCUN log superflu (parité fictif).
      return { requestId, action, groupId, accessAllowed: true, version };
    });
  }

  async revoke(ctx: SupportContext, groupId: string, requestId: string): Promise<SupportAccessView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadForUpdate(client, requestId);
      const next = revokeSupportAccess(request, ctx.serverNow);
      const newVersion = version + 1;
      await client.query(`UPDATE support_access_request SET status=$2, revoked_at=$3, version=$4 WHERE request_id=$1`, [
        requestId,
        next.status,
        new Date(ctx.serverNow * 1000),
        newVersion,
      ]);
      await this.writeLog(client, ctx, groupId, "support_access_denied", `revoke ${requestId}`);
      return toView(next, newVersion);
    });
  }

  async view(ctx: SupportContext, groupId: string, requestId: string): Promise<SupportAccessView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadForUpdate(client, requestId);
      if (request.targetGroupId !== groupId) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
      }
      return toView(request, version);
    });
  }

  async probe(ctx: SupportContext, groupId: string, requestId: string, action: string): Promise<boolean> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request } = await this.loadForUpdate(client, requestId);
      return supportAccessAllowed(request, action, request.targetGroupId, ctx.serverNow);
    });
  }

  async securityLogEntries(groupId: string): Promise<readonly SecurityEvent[]> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT event_type, actor_identity_id, group_id, occurred_at, detail
         FROM security_log WHERE group_id = $1 ORDER BY log_id`,
        [groupId],
      );
      return res.rows.map((r) => ({
        eventType: r.event_type,
        actorIdentityId: String(r.actor_identity_id),
        groupId: String(r.group_id),
        occurredAt: Math.floor(new Date(r.occurred_at as string).getTime() / 1000),
        detail: String(r.detail),
      })) as SecurityEvent[];
    });
  }

  async securityEventCount(groupId: string, eventType: string): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS n FROM security_log WHERE group_id = $1 AND event_type = $2`,
        [groupId, eventType],
      );
      return Number(res.rows[0]?.n ?? 0);
    });
  }
}
