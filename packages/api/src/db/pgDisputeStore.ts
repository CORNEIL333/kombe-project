/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les litiges et recours
 * (C10, construction "les 15"). Même esprit que `pgValidationStore.ts` :
 * TOUTE décision reste dans les fonctions pures de `@kombe/domain`
 * (`disputes.ts`). Schéma : `packages/db/migrations/0010_dispute_cases.sql`
 * (additif sur `dispute`, posée par 0001+0009).
 *
 * Divergences assumées avec le contrat fictif (`disputeStore.ts`), toutes
 * documentées ici plutôt que cachées :
 *
 * 1. `groupId` explicite (RLS `tenant_isolation`), comme tous les stores réels.
 * 2. Pas de colonne `version` sur `dispute` : la table n'en a jamais porté
 *    (ni 0001, ni 0009, ni 0010). La version optimiste exposée ici est le
 *    compteur **natif** Postgres `xmin` (incrémenté à CHAQUE UPDATE de la
 *    ligne) — une technique standard, pas une invention locale. Elle joue
 *    exactement le même rôle (détecter un UPDATE concurrent) sans migration
 *    supplémentaire.
 * 3. `involvedIdentityIds` (domaine) n'est PAS stocké : il est DÉRIVÉ en
 *    lecture du déclarant + des acteurs `contribution_act` de TOUTES les
 *    cotisations de l'obligation contestée (la vérité vit dans ces tables,
 *    jamais une copie figée qui pourrait diverger).
 * 4. `resolverIdentityIds` vient de la table append-only `dispute_assignment`
 *    (indépendance déjà imposée par un trigger — défense en profondeur, la
 *    décision reste dans `designateResolvers`).
 * 5. `reopenCount` : le schéma réel ne porte qu'un lien `reopened_from_dispute_id`
 *    AUTO-référencé (pas une chaîne multi-reprises) — le compte exposé ici
 *    est donc 0 (jamais rouvert) ou 1 (rouvert au moins une fois), jamais un
 *    compteur multi-reprises exact. Limite assumée, pas cachée.
 */
import type pg from "pg";
import {
  DomainError,
  assertAllowed,
  assertRoundCloseNotFrozen,
  designateResolvers,
  disputeCommonView,
  disputeDetailView,
  isCrossGroupAccess,
  isDisputeParty,
  openDisputeCase,
  reopenDispute,
  resolveDispute,
  type DisputeCommonView,
  type DisputeRecord,
  type OpenDisputeCaseInput,
  type Role,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";

export interface DisputeActor {
  readonly identityId: string;
  readonly role: Role;
  readonly groupIds: readonly string[];
}

export class PgDisputeStore {
  constructor(private readonly pool: pg.Pool) {}

  private gateActor(actor: DisputeActor, groupId: string): void {
    if (!actor.identityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(actor.groupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
  }

  /** Identités réellement impliquées dans l'opération contestée : déclarant +
   *  confirmateur/contrôleurs de TOUTE cotisation de l'obligation — dérivé,
   *  jamais une copie stockée (voir §3 du commentaire d'en-tête). */
  private async involvedIdentityIds(client: pg.PoolClient, obligationId: string): Promise<readonly string[]> {
    const res = await client.query(
      `SELECT DISTINCT identity_id FROM (
         SELECT declarant_identity_id AS identity_id FROM contribution
           WHERE obligation_id = $1 AND declarant_identity_id IS NOT NULL
         UNION
         SELECT ca.actor_identity_id AS identity_id FROM contribution_act ca
           JOIN contribution c ON c.contribution_id = ca.contribution_id
           WHERE c.obligation_id = $1
       ) involved`,
      [obligationId],
    );
    return res.rows.map((r) => String(r.identity_id));
  }

  private async resolverIdentityIds(client: pg.PoolClient, disputeId: string): Promise<readonly string[]> {
    const res = await client.query(`SELECT assigned_identity_id FROM dispute_assignment WHERE dispute_id = $1`, [
      disputeId,
    ]);
    return res.rows.map((r) => String(r.assigned_identity_id));
  }

  private async loadRecord(
    client: pg.PoolClient,
    disputeId: string,
  ): Promise<{ record: DisputeRecord; version: number }> {
    const res = await client.query(
      `SELECT dispute_id, group_id, state, obligation_id, category, reason, requested_correction,
              raised_by_identity_id, notified_at, raised_at, outcome, resolved_by_identity_id,
              resolved_at, reopened_from_dispute_id, xmin::text::bigint AS xmin
       FROM dispute WHERE dispute_id = $1 FOR UPDATE`,
      [disputeId],
    );
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Dossier de litige introuvable");
    const involved = await this.involvedIdentityIds(client, String(row.obligation_id));
    const resolvers = await this.resolverIdentityIds(client, disputeId);
    const record: DisputeRecord = {
      disputeId: String(row.dispute_id),
      groupId: String(row.group_id),
      obligationId: String(row.obligation_id),
      category: row.category,
      raisedBy: String(row.raised_by_identity_id ?? ""),
      reason: String(row.reason ?? ""),
      requestedCorrection: String(row.requested_correction ?? ""),
      involvedIdentityIds: involved,
      resolverIdentityIds: resolvers,
      notifiedAt: row.notified_at ? new Date(row.notified_at as string).getTime() / 1000 : 0,
      raisedAt: row.raised_at ? new Date(row.raised_at as string).getTime() / 1000 : 0,
      // 'reopened' est un état DB historique (CHECK 0001) ; le domaine ne
      // connaît que open/resolved — une ligne 'reopened' est relue comme
      // 'open' (c'est son effet, cf. reopenDispute : state redevient 'open').
      state: row.state === "resolved" ? "resolved" : "open",
      outcome: row.outcome ?? null,
      resolvedBy: row.resolved_by_identity_id ?? null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string).getTime() / 1000 : null,
      correctionContributionIds: [],
      reopenedFromDisputeId: row.reopened_from_dispute_id ?? null,
      reopenCount: row.reopened_from_dispute_id ? 1 : 0,
    };
    return { record, version: Number(row.xmin) };
  }

  private expectVersion(version: number, expectedVersion: number): void {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion !== version) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  async open(groupId: string, actor: DisputeActor, input: OpenDisputeCaseInput): Promise<DisputeRecord> {
    assertAllowed(actor.role, "dispute.raise");
    this.gateActor(actor, input.groupId);
    const record = openDisputeCase(input);
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO dispute
           (dispute_id, group_id, state, obligation_id, category, reason, requested_correction,
            notified_at, raised_at, raised_by_identity_id)
         VALUES ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9)`,
        [
          record.disputeId,
          record.groupId,
          record.obligationId,
          record.category,
          record.reason,
          record.requestedCorrection,
          new Date(record.notifiedAt * 1000),
          new Date(record.raisedAt * 1000),
          record.raisedBy,
        ],
      );
    });
    return record;
  }

  async assignResolvers(
    groupId: string,
    actor: DisputeActor,
    disputeId: string,
    resolverIdentityIds: readonly string[],
    expectedVersion: number,
  ): Promise<{ record: DisputeRecord; version: number }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, disputeId);
      assertAllowed(actor.role, "dispute.resolve");
      this.gateActor(actor, record.groupId);
      this.expectVersion(version, expectedVersion);
      // Décision PURE d'abord (indépendance) — puis l'écriture (le trigger
      // DB est une défense en profondeur, jamais l'unique garde).
      designateResolvers(record, resolverIdentityIds);
      for (const r of resolverIdentityIds) {
        await client.query(
          `INSERT INTO dispute_assignment (dispute_id, group_id, assigned_identity_id) VALUES ($1,$2,$3)
           ON CONFLICT (dispute_id, assigned_identity_id) DO NOTHING`,
          [disputeId, record.groupId, r],
        );
      }
      const after = await this.loadRecord(client, disputeId);
      return { record: after.record, version: after.version };
    });
  }

  async resolve(
    groupId: string,
    actor: DisputeActor,
    disputeId: string,
    outcome: string,
    resolvedAt: number,
    expectedVersion: number,
  ): Promise<{ record: DisputeRecord; version: number }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, disputeId);
      assertAllowed(actor.role, "dispute.resolve");
      this.gateActor(actor, record.groupId);
      this.expectVersion(version, expectedVersion);
      const next = resolveDispute(record, { actorIdentityId: actor.identityId, outcome, resolvedAt });
      await client.query(
        `UPDATE dispute SET state='resolved', outcome=$2, resolved_by_identity_id=$3, resolved_at=$4
         WHERE dispute_id=$1`,
        [disputeId, next.outcome, next.resolvedBy, new Date((next.resolvedAt as number) * 1000)],
      );
      const after = await this.loadRecord(client, disputeId);
      return { record: after.record, version: after.version };
    });
  }

  async appeal(
    groupId: string,
    actor: DisputeActor,
    disputeId: string,
    expectedVersion: number,
  ): Promise<{ record: DisputeRecord; version: number }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, disputeId);
      assertAllowed(actor.role, "dispute.raise");
      this.gateActor(actor, record.groupId);
      this.expectVersion(version, expectedVersion);
      if (actor.identityId !== record.raisedBy) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Seul le levant fait recours");
      }
      reopenDispute(record); // validation pure (jette si non 'resolved')
      await client.query(
        `UPDATE dispute
           SET state='open', outcome=NULL, resolved_by_identity_id=NULL, resolved_at=NULL,
               reopened_from_dispute_id=$1
         WHERE dispute_id=$1`,
        [disputeId],
      );
      const after = await this.loadRecord(client, disputeId);
      return { record: after.record, version: after.version };
    });
  }

  async view(groupId: string, actor: DisputeActor, disputeId: string): Promise<DisputeCommonView | DisputeRecord> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record } = await this.loadRecord(client, disputeId);
      this.gateActor(actor, record.groupId);
      return isDisputeParty(record, actor.identityId) ? disputeDetailView(record) : disputeCommonView(record);
    });
  }

  async listCommon(groupId: string, actor: DisputeActor): Promise<DisputeCommonView[]> {
    this.gateActor(actor, groupId);
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(`SELECT dispute_id FROM dispute WHERE group_id = $1`, [groupId]);
      const views: DisputeCommonView[] = [];
      for (const r of res.rows) {
        const { record } = await this.loadRecord(client, String(r.dispute_id));
        views.push(disputeCommonView(record));
      }
      return views;
    });
  }

  async attemptRoundClose(
    groupId: string,
    actor: DisputeActor,
    obligationIds: readonly string[],
  ): Promise<{ readonly normalCloseAccepted: true }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      assertAllowed(actor.role, "round.close");
      this.gateActor(actor, groupId);
      const res = await client.query(
        `SELECT dispute_id, group_id, state, obligation_id, category, reason, requested_correction,
                raised_by_identity_id, notified_at, raised_at, outcome, resolved_by_identity_id,
                resolved_at, reopened_from_dispute_id
         FROM dispute WHERE group_id = $1 AND obligation_id = ANY($2)`,
        [groupId, obligationIds],
      );
      const records: DisputeRecord[] = res.rows.map((row) => ({
        disputeId: String(row.dispute_id),
        groupId: String(row.group_id),
        obligationId: String(row.obligation_id),
        category: row.category,
        raisedBy: String(row.raised_by_identity_id ?? ""),
        reason: String(row.reason ?? ""),
        requestedCorrection: String(row.requested_correction ?? ""),
        involvedIdentityIds: [],
        resolverIdentityIds: [],
        notifiedAt: row.notified_at ? new Date(row.notified_at as string).getTime() / 1000 : 0,
        raisedAt: row.raised_at ? new Date(row.raised_at as string).getTime() / 1000 : 0,
        state: row.state === "resolved" ? "resolved" : "open",
        outcome: row.outcome ?? null,
        resolvedBy: row.resolved_by_identity_id ?? null,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at as string).getTime() / 1000 : null,
        correctionContributionIds: [],
        reopenedFromDisputeId: row.reopened_from_dispute_id ?? null,
        reopenCount: row.reopened_from_dispute_id ? 1 : 0,
      }));
      assertRoundCloseNotFrozen(records, obligationIds);
      return { normalCloseAccepted: true as const };
    });
  }

  async caseCount(groupId: string): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(`SELECT count(*)::int AS n FROM dispute WHERE group_id = $1`, [groupId]);
      return Number(res.rows[0]?.n ?? 0);
    });
  }
}
