/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les validations et
 * corrections de cotisations (C07, construction "les 15"). Même esprit que
 * `pgContributionStore.ts` : TOUTE décision reste dans les fonctions pures de
 * `@kombe/domain` (`validation.ts`) ; ce fichier ne fait que les exécuter
 * contre des lignes Postgres réelles sous verrou. Schéma :
 * `packages/db/migrations/0009_contribution_validation.sql` (additif sur
 * 0001/0008, déjà réel via `pgContributionStore.ts`).
 *
 * Divergences assumées avec le contrat fictif (`validationStore.ts`), toutes
 * documentées ici plutôt que cachées :
 *
 * 1. `groupId` est un paramètre EXPLICITE de chaque méthode (comme
 *    `pgContributionStore.ts`) : la RLS `tenant_isolation` exige
 *    `kombe.group_id` AVANT toute lecture ; le store fictif n'a pas cette
 *    contrainte (mémoire, pas de RLS).
 * 2. `confirmerIdentityId`/`controllerIdentityIds` ne sont PAS des colonnes de
 *    `contribution` : ils sont RECONSTRUITS depuis la table append-only
 *    `contribution_act` (un acte = une ligne, indépendance ET anti-cumul déjà
 *    imposés par un trigger + une contrainte UNIQUE en base — défense en
 *    profondeur, la décision reste dans la fonction pure).
 * 3. `compensatedById` (sur l'ORIGINAL, domaine) correspond en base à
 *    `compensates_contribution_id` porté par la CONTRE-ÉCRITURE (sens
 *    inverse) : « original déjà compensé » = « existe-t-il une ligne dont
 *    `compensates_contribution_id` me désigne ? ». L'index partiel UNIQUE
 *    (migration 0009) impose structurellement l'« au plus une fois ».
 * 4. Le gel de validation par litige ouvert (6.5) interroge la vraie table
 *    `dispute` (`state='open' AND obligation_id=$1`) — jamais un tableau en
 *    mémoire.
 * 5. `raise()` est un PONT assumé entre le modèle C07 simple
 *    (`RaiseDisputeInput`, sans `requestedCorrection`) et le schéma réel C10
 *    (migration 0010) qui EXIGE `requested_correction` non vide (contrainte
 *    `dispute_requested_correction_present`). Faute d'un champ C07 dédié, le
 *    motif (`reason`) sert aussi de correction demandée par défaut — un vrai
 *    dossier C10 complet se crée via `PgDisputeStore.open()`
 *    (`OpenDisputeCaseInput`, qui porte son propre `requestedCorrection`).
 */
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  assertDependentOperationsNotBlocked,
  assertValidationNotBlocked,
  compensateContribution,
  confirmContribution,
  controlContribution,
  isCrossGroupAccess,
  raiseDispute,
  rejectContribution,
  sealEventV1,
  type ContributionRecord,
  type ContributionState,
  type Dispute,
  type RaiseDisputeInput,
  type Role,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";

export interface ValidationContext {
  readonly actorIdentityId: string;
  readonly actorRole: Role;
  readonly actorGroupIds: readonly string[];
  readonly serverDate: string;
  readonly commandId: string;
  readonly expectedVersion: number;
}

export interface ActReceipt {
  readonly validationAccepted: boolean;
  readonly validationCompleted: boolean;
  readonly contributionId: string;
  readonly state: ContributionState;
  readonly version: number;
  readonly reason?: string;
  readonly eventHash?: string;
}

export interface CompensationReceipt {
  readonly reversalAccepted: boolean;
  readonly reversalCount: number;
  readonly contributionId: string;
  readonly reversalContributionId: string;
  readonly state: ContributionState;
  readonly version: number;
  readonly eventHash: string;
}

export interface ContributionView {
  readonly contributionId: string;
  readonly obligationId: string;
  readonly groupId: string;
  readonly amount: string;
  readonly declarantIdentityId: string;
  readonly state: ContributionState;
  readonly requiredControllers: number;
  readonly confirmerIdentityId: string | null;
  readonly controllerIdentityIds: readonly string[];
  readonly compensated: boolean;
  readonly reversalCount: number;
  readonly version: number;
}

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

export class PgValidationStore {
  constructor(private readonly pool: pg.Pool) {}

  /** Amorçage de test RÉEL : marque une cotisation déjà réellement déclarée
   *  (via `PgContributionStore.declare`) avec son déclarant/seuil de contrôle
   *  — ces deux colonnes (migration 0009) ne sont pas posées par la
   *  déclaration C06 elle-même. Réservé aux fixtures de test. */
  async seedDeclarantAndThreshold(
    groupId: string,
    contributionId: string,
    declarantIdentityId: string,
    requiredControllers: number,
  ): Promise<void> {
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `UPDATE contribution SET declarant_identity_id=$2, required_controllers=$3 WHERE contribution_id=$1`,
        [contributionId, declarantIdentityId, requiredControllers],
      );
    });
  }

  private async loadRecord(
    client: pg.PoolClient,
    contributionId: string,
  ): Promise<{ record: ContributionRecord; version: number }> {
    const res = await client.query(
      `SELECT contribution_id, group_id, obligation_id, declared_amount, state, version,
              declarant_identity_id, required_controllers, compensates_contribution_id
       FROM contribution WHERE contribution_id = $1 FOR UPDATE`,
      [contributionId],
    );
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Cotisation introuvable");
    const actsRes = await client.query(
      `SELECT act, actor_identity_id FROM contribution_act WHERE contribution_id = $1 ORDER BY acted_at ASC`,
      [contributionId],
    );
    let confirmerIdentityId: string | null = null;
    const controllerIdentityIds: string[] = [];
    for (const a of actsRes.rows) {
      if (a.act === "confirm") confirmerIdentityId = String(a.actor_identity_id);
      else if (a.act === "control") controllerIdentityIds.push(String(a.actor_identity_id));
    }
    const compensatedRes = await client.query(
      `SELECT contribution_id FROM contribution WHERE compensates_contribution_id = $1`,
      [contributionId],
    );
    const record: ContributionRecord = {
      contributionId: String(row.contribution_id),
      obligationId: String(row.obligation_id),
      groupId: String(row.group_id),
      amountMinor: BigInt(row.declared_amount as string),
      declarantIdentityId: String(row.declarant_identity_id ?? ""),
      state: row.state as ContributionState,
      requiredControllers: Number(row.required_controllers ?? 0),
      confirmerIdentityId,
      controllerIdentityIds,
      compensatedById: compensatedRes.rows[0] ? String(compensatedRes.rows[0].contribution_id) : null,
    };
    return { record, version: Number(row.version) };
  }

  private gate(ctx: ValidationContext, groupId: string, version: number): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "contribution.validate");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (!Number.isInteger(ctx.expectedVersion) || ctx.expectedVersion < 1 || ctx.expectedVersion !== version) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  /** Litige OUVERT réel sur l'obligation — jamais un tableau en mémoire. */
  private async openDisputesFor(client: pg.PoolClient, obligationId: string): Promise<readonly Dispute[]> {
    const res = await client.query(
      `SELECT dispute_id, group_id, obligation_id, reason, category, raised_by_identity_id, notified_at, raised_at
       FROM dispute WHERE obligation_id = $1 AND state = 'open'`,
      [obligationId],
    );
    return res.rows.map((r): Dispute => ({
      disputeId: String(r.dispute_id),
      groupId: String(r.group_id),
      obligationId: String(r.obligation_id),
      reason: String(r.reason ?? ""),
      category: r.category,
      raisedBy: String(r.raised_by_identity_id ?? ""),
      notifiedAt: r.notified_at ? new Date(r.notified_at as string).getTime() / 1000 : 0,
      raisedAt: r.raised_at ? new Date(r.raised_at as string).getTime() / 1000 : 0,
      state: "open",
    }));
  }

  private async appendJournalEvent(
    client: pg.PoolClient,
    groupId: string,
    ctx: ValidationContext,
    type: "contribution.validated" | "contribution.compensated",
    obligationId: string,
    amountMinor: bigint,
  ): Promise<string> {
    await lockGroupForJournalWrite(client, groupId);
    const lastRes = await client.query(`SELECT hash FROM journal WHERE group_id = $1 ORDER BY seq DESC LIMIT 1`, [
      groupId,
    ]);
    const previousHash = lastRes.rows[0] ? String(lastRes.rows[0].hash) : GENESIS_HASH;
    const seqRes = await client.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM journal WHERE group_id = $1`, [
      groupId,
    ]);
    const seq = Number(seqRes.rows[0]?.next_seq ?? 1);
    const event = sealEventV1({
      groupId,
      seq,
      type,
      version: 1,
      previousHash,
      actorIdentityId: ctx.actorIdentityId,
      actorRole: ctx.actorRole,
      serverDate: ctx.serverDate,
      commandId: ctx.commandId,
      body: { obligationId, amount: amountMinor },
    });
    await client.query(
      `INSERT INTO journal (group_id, seq, event_type, version, previous_hash, hash, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [groupId, event.seq, event.type, event.version, event.previousHash, event.hash, jsonSafe(event)],
    );
    return event.hash;
  }

  /** Confirmation+contrôle partagent la même mécanique de parachèvement :
   *  pose l'acte (déclenchant le trigger d'indépendance en base), met à jour
   *  l'état, et — si la validation est parachevée — vérifie l'absence de
   *  litige bloquant, crédite `validated_net`, scelle l'événement. */
  private async actAndMaybeComplete(
    groupId: string,
    ctx: ValidationContext,
    contributionId: string,
    act: "confirm" | "control",
    pureFn: (record: ContributionRecord, actorId: string) => {
      readonly validationAccepted: boolean;
      readonly validationCompleted: boolean;
      readonly record: ContributionRecord;
      readonly reason?: string;
    },
  ): Promise<ActReceipt> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, contributionId);
      this.gate(ctx, record.groupId, version);
      const result = pureFn(record, ctx.actorIdentityId);
      if (!result.validationAccepted) {
        return {
          validationAccepted: false,
          validationCompleted: false,
          contributionId,
          state: record.state,
          version,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        };
      }
      if (result.validationCompleted) {
        const openDisputes = await this.openDisputesFor(client, record.obligationId);
        assertValidationNotBlocked(openDisputes, record.obligationId, record.state);
      }
      // L'acte lui-même (trigger d'indépendance en base = défense en profondeur).
      await client.query(
        `INSERT INTO contribution_act (contribution_id, group_id, actor_identity_id, act) VALUES ($1,$2,$3,$4)`,
        [contributionId, record.groupId, ctx.actorIdentityId, act],
      );
      const newVersion = version + 1;
      const updated = await client.query(
        `UPDATE contribution SET state=$2, version=$3 WHERE contribution_id=$1 AND version=$4`,
        [contributionId, result.record.state, newVersion, version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }
      let eventHash: string | undefined;
      if (result.validationCompleted) {
        await client.query(
          `UPDATE obligation SET validated_net = validated_net + $2 WHERE obligation_id = $1`,
          [record.obligationId, record.amountMinor.toString()],
        );
        eventHash = await this.appendJournalEvent(
          client,
          record.groupId,
          ctx,
          "contribution.validated",
          record.obligationId,
          record.amountMinor,
        );
      }
      return {
        validationAccepted: true,
        validationCompleted: result.validationCompleted,
        contributionId,
        state: result.record.state,
        version: newVersion,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
        ...(eventHash !== undefined ? { eventHash } : {}),
      };
    });
  }

  async confirm(groupId: string, ctx: ValidationContext, contributionId: string): Promise<ActReceipt> {
    return this.actAndMaybeComplete(groupId, ctx, contributionId, "confirm", confirmContribution);
  }

  async control(groupId: string, ctx: ValidationContext, contributionId: string): Promise<ActReceipt> {
    return this.actAndMaybeComplete(groupId, ctx, contributionId, "control", controlContribution);
  }

  async reject(groupId: string, ctx: ValidationContext, contributionId: string): Promise<ActReceipt> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, contributionId);
      this.gate(ctx, record.groupId, version);
      const next = rejectContribution(record);
      const newVersion = version + 1;
      const updated = await client.query(
        `UPDATE contribution SET state=$2, version=$3 WHERE contribution_id=$1 AND version=$4`,
        [contributionId, next.state, newVersion, version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }
      return { validationAccepted: true, validationCompleted: false, contributionId, state: next.state, version: newVersion };
    });
  }

  async compensate(
    groupId: string,
    ctx: ValidationContext,
    contributionId: string,
    reversalContributionId: string,
  ): Promise<CompensationReceipt> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, contributionId);
      this.gate(ctx, record.groupId, version);
      const { original, reversal } = compensateContribution(record, reversalContributionId);
      const newVersion = version + 1;
      const updated = await client.query(
        `UPDATE contribution SET state=$2, version=$3 WHERE contribution_id=$1 AND version=$4`,
        [contributionId, original.state, newVersion, version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }
      // Lit channel/dates de l'original pour une contre-écriture honnête
      // (même canal ; horodatage de la correction elle-même pour les dates).
      const origMeta = await client.query(`SELECT channel FROM contribution WHERE contribution_id=$1`, [contributionId]);
      await client.query(
        `INSERT INTO contribution
           (contribution_id, group_id, obligation_id, declared_amount, state, version,
            declarant_identity_id, required_controllers, compensates_contribution_id,
            channel, alleged_date, server_date)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11)`,
        [
          reversal.contributionId,
          reversal.groupId,
          reversal.obligationId,
          reversal.amountMinor.toString(),
          reversal.state,
          reversal.declarantIdentityId,
          reversal.requiredControllers,
          contributionId,
          origMeta.rows[0]?.channel ?? null,
          ctx.serverDate,
          ctx.serverDate,
        ],
      );
      const eventHash = await this.appendJournalEvent(
        client,
        original.groupId,
        ctx,
        "contribution.compensated",
        original.obligationId,
        original.amountMinor,
      );
      const countRes = await client.query(
        `SELECT count(*)::int AS n FROM contribution WHERE compensates_contribution_id = $1`,
        [contributionId],
      );
      return {
        reversalAccepted: true,
        reversalCount: Number(countRes.rows[0]?.n ?? 1),
        contributionId,
        reversalContributionId: reversal.contributionId,
        state: original.state,
        version: newVersion,
        eventHash,
      };
    });
  }

  /** Pont C07→C10 assumé — voir §5 du commentaire d'en-tête du fichier. */
  async raise(groupId: string, ctx: ValidationContext, input: RaiseDisputeInput): Promise<Dispute> {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "dispute.raise");
    if (isCrossGroupAccess(ctx.actorGroupIds, input.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    const d = raiseDispute(input);
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO dispute
           (dispute_id, group_id, state, obligation_id, category, reason, requested_correction,
            notified_at, raised_at, raised_by_identity_id)
         VALUES ($1,$2,'open',$3,$4,$5,$5,$6,$7,$8)`,
        [
          d.disputeId,
          d.groupId,
          d.obligationId,
          d.category,
          d.reason,
          new Date(d.notifiedAt * 1000),
          new Date(d.raisedAt * 1000),
          d.raisedBy,
        ],
      );
    });
    return d;
  }

  async attemptDependentOperation(groupId: string, obligationId: string): Promise<{ readonly blocked: false }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const openDisputes = await this.openDisputesFor(client, obligationId);
      assertDependentOperationsNotBlocked(openDisputes, obligationId);
      return { blocked: false };
    });
  }

  async view(groupId: string, contributionId: string): Promise<ContributionView> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const { record, version } = await this.loadRecord(client, contributionId);
      const countRes = await client.query(
        `SELECT count(*)::int AS n FROM contribution WHERE compensates_contribution_id = $1`,
        [contributionId],
      );
      return {
        contributionId: record.contributionId,
        obligationId: record.obligationId,
        groupId: record.groupId,
        amount: record.amountMinor.toString(),
        declarantIdentityId: record.declarantIdentityId,
        state: record.state,
        requiredControllers: record.requiredControllers,
        confirmerIdentityId: record.confirmerIdentityId,
        controllerIdentityIds: record.controllerIdentityIds,
        compensated: record.compensatedById !== null,
        reversalCount: Number(countRes.rows[0]?.n ?? 0),
        version,
      };
    });
  }

  async validatedEventCount(groupId: string): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS n FROM journal WHERE group_id = $1 AND event_type = 'contribution.validated'`,
        [groupId],
      );
      return Number(res.rows[0]?.n ?? 0);
    });
  }

  async compensatedEventCount(groupId: string): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS n FROM journal WHERE group_id = $1 AND event_type = 'contribution.compensated'`,
        [groupId],
      );
      return Number(res.rows[0]?.n ?? 0);
    });
  }

  async journalTailHash(groupId: string): Promise<string | null> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(`SELECT hash FROM journal WHERE group_id = $1 ORDER BY seq DESC LIMIT 1`, [
        groupId,
      ]);
      return res.rows[0] ? String(res.rows[0].hash) : null;
    });
  }
}
