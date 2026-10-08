/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les décaissements (C08).
 * Même esprit que pgContributionStore.ts : TOUTE décision reste dans les
 * fonctions pures de `@kombe/domain` (disbursement.ts) — séparation des
 * pouvoirs, indépendance du contrôle, contre-écriture unique, aucun
 * remboursement externe. Ce fichier ne fait qu'exécuter ces décisions contre
 * des lignes Postgres réelles, sous verrou, et s'appuie sur les GARDES
 * STRUCTURELLES déjà posées par la migration 0011 (CHECK
 * `disbursement_substitute_required`, trigger d'indépendance de la
 * contre-écriture, PRIMARY KEY de `disbursement_reversal`, trigger
 * d'indépendance/anti-cumul de `disbursement_act`) comme défense en
 * profondeur — jamais comme unique garde-fou.
 *
 * `beneficiaryConfirmedBy`/`controllerIdentityIds` n'ont pas de colonne
 * dédiée sur `disbursement` : ils se LISENT depuis `disbursement_act`
 * (append-only, UNIQUE (group_id, disbursement_id, actor_identity_id)), qui
 * est la source de vérité structurelle pour ces actes (même esprit que
 * `contribution_act` pour C07).
 */
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  approveDisbursementReversal,
  assertAllowed,
  confirmDisbursement,
  controlDisbursement,
  declareDisbursement,
  isCrossGroupAccess,
  reconcileRound,
  requestDisbursementReversal,
  sealEventV1,
  sumGroupFees,
  sumNetDisbursed,
  type DisbursementRecord,
  type DisbursementState,
  type RoundReconciliationResult,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";
import type {
  DeclareInput,
  DisbursementActReceipt,
  DisbursementContext,
  DisbursementView,
  ReversalReceipt,
} from "../disbursementStore.js";

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

interface DisbursementRow {
  readonly disbursement_id: string;
  readonly group_id: string;
  readonly round_id: string;
  readonly obligation_id: string;
  readonly beneficiary_identity_id: string;
  readonly declarant_identity_id: string;
  readonly net_amount: string;
  readonly group_fees: string;
  readonly personal_fees_out_of_pot: string;
  readonly alleged_date: string | null;
  readonly server_date: string | null;
  readonly state: DisbursementState;
  readonly required_controllers: number;
  readonly reversal_requested_by: string | null;
  readonly reversal_reason: string | null;
  readonly version: number;
}

async function loadRecord(
  client: pg.PoolClient,
  disbursementId: string,
): Promise<{ record: DisbursementRecord; version: number } | null> {
  const res = await client.query<DisbursementRow>(
    `SELECT disbursement_id, group_id, round_id, obligation_id, beneficiary_identity_id,
            declarant_identity_id, net_amount, group_fees, personal_fees_out_of_pot,
            alleged_date, server_date, state, required_controllers,
            reversal_requested_by, reversal_reason, version
     FROM disbursement WHERE disbursement_id = $1 FOR UPDATE`,
    [disbursementId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const actsRes = await client.query<{ actor_identity_id: string; act: string }>(
    `SELECT actor_identity_id, act FROM disbursement_act WHERE disbursement_id = $1 ORDER BY acted_at`,
    [disbursementId],
  );
  let beneficiaryConfirmedBy: string | null = null;
  const controllerIdentityIds: string[] = [];
  for (const a of actsRes.rows) {
    if (a.act === "confirm") beneficiaryConfirmedBy = a.actor_identity_id;
    else if (a.act === "control") controllerIdentityIds.push(a.actor_identity_id);
  }
  const reversalRes = await client.query<{ disbursement_id: string }>(
    `SELECT disbursement_id FROM disbursement_reversal WHERE disbursement_id = $1`,
    [disbursementId],
  );
  const record: DisbursementRecord = {
    disbursementId: row.disbursement_id,
    groupId: row.group_id,
    roundId: row.round_id,
    obligationId: row.obligation_id,
    beneficiaryIdentityId: row.beneficiary_identity_id,
    declarantIdentityId: row.declarant_identity_id,
    netAmount: BigInt(row.net_amount),
    groupFees: BigInt(row.group_fees),
    personalFeesOutOfPot: BigInt(row.personal_fees_out_of_pot),
    allegedDate: row.alleged_date ? new Date(row.alleged_date).getTime() : 0,
    serverDate: row.server_date ? new Date(row.server_date).getTime() : 0,
    state: row.state,
    requiredControllers: row.required_controllers,
    beneficiaryConfirmedBy,
    controllerIdentityIds,
    reversalRequestedBy: row.reversal_requested_by,
    reversalReason: row.reversal_reason,
    reversedById: reversalRes.rows[0] ? `${disbursementId}#reversal` : null,
    reversalCount: reversalRes.rows[0] ? 1 : 0,
    refundedExternally: false,
  };
  return { record, version: row.version };
}

function toView(record: DisbursementRecord, version: number): DisbursementView {
  return {
    disbursementId: record.disbursementId,
    groupId: record.groupId,
    roundId: record.roundId,
    obligationId: record.obligationId,
    beneficiaryIdentityId: record.beneficiaryIdentityId,
    declarantIdentityId: record.declarantIdentityId,
    netAmount: record.netAmount.toString(),
    groupFees: record.groupFees.toString(),
    personalFeesOutOfPot: record.personalFeesOutOfPot.toString(),
    state: record.state,
    requiredControllers: record.requiredControllers,
    beneficiaryConfirmedBy: record.beneficiaryConfirmedBy,
    controllerIdentityIds: record.controllerIdentityIds,
    reversalCount: record.reversalCount,
    refundedExternally: false,
    version,
  };
}

async function appendJournal(
  client: pg.PoolClient,
  ctx: DisbursementContext,
  groupId: string,
  type: "disbursement.requested" | "disbursement.completed" | "disbursement.reversed",
  body: Readonly<Record<string, unknown>>,
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
    body,
  });
  await client.query(
    `INSERT INTO journal (group_id, seq, event_type, version, previous_hash, hash, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [groupId, event.seq, event.type, event.version, event.previousHash, event.hash, jsonSafe(event)],
  );
  return event.hash;
}

export class PgDisbursementStore {
  constructor(private readonly pool: pg.Pool) {}

  async declare(ctx: DisbursementContext, groupId: string, input: DeclareInput): Promise<DisbursementView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    assertAllowed(ctx.actorRole, "disbursement.request");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const existing = await client.query(`SELECT 1 FROM disbursement WHERE disbursement_id = $1`, [
        input.disbursementId,
      ]);
      if (existing.rows.length > 0) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Décaissement déjà déclaré");
      }
      const record = declareDisbursement({
        disbursementId: input.disbursementId,
        groupId,
        roundId: input.roundId,
        obligationId: input.obligationId,
        beneficiaryIdentityId: input.beneficiaryIdentityId,
        declarantIdentityId: ctx.actorIdentityId,
        netAmount: input.netAmount,
        groupFees: input.groupFees,
        ...(input.personalFeesOutOfPot !== undefined ? { personalFeesOutOfPot: input.personalFeesOutOfPot } : {}),
        requiredControllers: input.requiredControllers,
        allegedDate: input.allegedDate,
        serverDate: Date.parse(ctx.serverDate) || Date.now(),
      });
      await client.query(
        `INSERT INTO disbursement
           (disbursement_id, group_id, round_id, amount, state, version,
            obligation_id, beneficiary_identity_id, declarant_identity_id,
            net_amount, group_fees, personal_fees_out_of_pot, required_controllers,
            alleged_date, server_date)
         VALUES ($1,$2,$3,$4,'requested',1,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          record.disbursementId,
          groupId,
          record.roundId,
          record.netAmount.toString(),
          record.obligationId,
          record.beneficiaryIdentityId,
          record.declarantIdentityId,
          record.netAmount.toString(),
          record.groupFees.toString(),
          record.personalFeesOutOfPot.toString(),
          record.requiredControllers,
          new Date(record.allegedDate).toISOString(),
          new Date(record.serverDate).toISOString(),
        ],
      );
      await appendJournal(client, ctx, groupId, "disbursement.requested", {
        disbursementId: record.disbursementId,
        obligationId: record.obligationId,
        netAmount: record.netAmount,
        groupFees: record.groupFees,
      });
      return toView(record, 1);
    });
  }

  private async actOrView(
    groupId: string,
    ctx: DisbursementContext,
    disbursementId: string,
    perform: (client: pg.PoolClient, held: { record: DisbursementRecord; version: number }) => Promise<{
      actAccepted: boolean;
      completed: boolean;
      record: DisbursementRecord;
      reason?: string;
    }>,
  ): Promise<DisbursementActReceipt> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, disbursementId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
      this.gateAccess(ctx, held);
      const result = await perform(client, held);
      if (!result.actAccepted) {
        return {
          actAccepted: false,
          completed: false,
          disbursementId,
          state: held.record.state,
          version: held.version,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        };
      }
      const newVersion = held.version + 1;
      const updated = await client.query(
        `UPDATE disbursement SET state = $2, version = $3 WHERE disbursement_id = $1 AND version = $4`,
        [disbursementId, result.record.state, newVersion, held.version],
      );
      if (updated.rowCount !== 1) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }
      let eventHash: string | undefined;
      if (result.completed) {
        eventHash = await appendJournal(client, ctx, held.record.groupId, "disbursement.completed", {
          disbursementId,
          obligationId: held.record.obligationId,
          netAmount: held.record.netAmount.toString(),
        });
      }
      return {
        actAccepted: true,
        completed: result.completed,
        disbursementId,
        state: result.record.state,
        version: newVersion,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
        ...(eventHash !== undefined ? { eventHash } : {}),
      };
    });
  }

  /** Le groupId vient de l'appelant (route/session) : sous RLS `kombe_app`
   *  (sans BYPASSRLS), toute lecture group-scopée exige `kombe.group_id`
   *  AVANT le SELECT — un « peek » hors contexte ne verrait aucune ligne. */

  private gateAccess(ctx: DisbursementContext, held: { record: DisbursementRecord; version: number }): void {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, held.record.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (!Number.isInteger(ctx.expectedVersion) || ctx.expectedVersion < 1 || ctx.expectedVersion !== held.version) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  async confirm(groupId: string, ctx: DisbursementContext, disbursementId: string): Promise<DisbursementActReceipt> {
    return this.actOrView(groupId, ctx, disbursementId, async (client, held) => {
      const result = confirmDisbursement(held.record, ctx.actorIdentityId);
      if (result.actAccepted) {
        await client.query(
          `INSERT INTO disbursement_act (disbursement_id, group_id, actor_identity_id, act)
           VALUES ($1,$2,$3,'confirm')`,
          [disbursementId, held.record.groupId, ctx.actorIdentityId],
        );
      }
      return result;
    });
  }

  async control(groupId: string, ctx: DisbursementContext, disbursementId: string): Promise<DisbursementActReceipt> {
    return this.actOrView(groupId, ctx, disbursementId, async (client, held) => {
      const result = controlDisbursement(held.record, ctx.actorIdentityId);
      if (result.actAccepted) {
        await client.query(
          `INSERT INTO disbursement_act (disbursement_id, group_id, actor_identity_id, act)
           VALUES ($1,$2,$3,'control')`,
          [disbursementId, held.record.groupId, ctx.actorIdentityId],
        );
      }
      return result;
    });
  }

  async requestReversal(groupId: string, ctx: DisbursementContext, disbursementId: string, reason: string): Promise<ReversalReceipt> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    assertAllowed(ctx.actorRole, "disbursement.reverse");
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, disbursementId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
      this.gateAccess(ctx, held);
      const updatedRecord = requestDisbursementReversal(held.record, ctx.actorIdentityId, reason);
      const newVersion = held.version + 1;
      const updated = await client.query(
        `UPDATE disbursement SET state='reversal_requested', reversal_requested_by=$2, reversal_reason=$3, version=$4
         WHERE disbursement_id=$1 AND version=$5`,
        [disbursementId, ctx.actorIdentityId, reason, newVersion, held.version],
      );
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      return {
        disbursementId,
        state: updatedRecord.state,
        reversalCount: updatedRecord.reversalCount,
        refundedExternally: false as const,
        version: newVersion,
      };
    });
  }

  async approveReversal(groupId: string, ctx: DisbursementContext, disbursementId: string): Promise<ReversalReceipt> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    assertAllowed(ctx.actorRole, "disbursement.reverse");
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, disbursementId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
      this.gateAccess(ctx, held);
      const updatedRecord = approveDisbursementReversal(held.record, ctx.actorIdentityId);
      const newVersion = held.version + 1;
      // INSERT **avant** l'UPDATE : le trigger 0011
      // `kombe_disbursement_reversal_independence` lit l'état VIVANT de
      // `disbursement` et exige `reversal_requested` au moment de l'insertion
      // de la contre-écriture.
      try {
        await client.query(
          `INSERT INTO disbursement_reversal (disbursement_id, group_id, approved_by_identity_id, reversal_reason)
           VALUES ($1,$2,$3,$4)`,
          [disbursementId, held.record.groupId, ctx.actorIdentityId, held.record.reversalReason ?? ""],
        );
      } catch (error) {
        // Contre-écriture concurrente ayant gagné la course sur la PRIMARY KEY
        // de `disbursement_reversal` (C08-CORRECTION) : traduit en erreur stable,
        // jamais le detail Postgres brut.
        if ((error as { code?: string }).code === "23505") {
          throw new DomainError("DISBURSEMENT_ALREADY_REVERSED", "Décaissement déjà corrigé une fois");
        }
        throw error;
      }
      const updated = await client.query(
        `UPDATE disbursement SET state='reversed', version=$2 WHERE disbursement_id=$1 AND version=$3`,
        [disbursementId, newVersion, held.version],
      );
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      const eventHash = await appendJournal(client, ctx, held.record.groupId, "disbursement.reversed", {
        disbursementId,
        obligationId: held.record.obligationId,
        netAmount: held.record.netAmount.toString(),
      });
      return {
        disbursementId,
        state: updatedRecord.state,
        reversalCount: 1,
        refundedExternally: false as const,
        version: newVersion,
        eventHash,
      };
    });
  }

  async reconcile(
    ctx: DisbursementContext,
    groupId: string,
    roundId: string,
  ): Promise<RoundReconciliationResult & { readonly netDisbursed: string; readonly groupFees: string }> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query<DisbursementRow>(
        `SELECT disbursement_id, group_id, round_id, obligation_id, beneficiary_identity_id,
                declarant_identity_id, net_amount, group_fees, personal_fees_out_of_pot,
                alleged_date, server_date, state, required_controllers,
                reversal_requested_by, reversal_reason, version
         FROM disbursement WHERE group_id = $1 AND round_id = $2`,
        [groupId, roundId],
      );
      const records: DisbursementRecord[] = res.rows.map((row) => ({
        disbursementId: row.disbursement_id,
        groupId: row.group_id,
        roundId: row.round_id,
        obligationId: row.obligation_id,
        beneficiaryIdentityId: row.beneficiary_identity_id,
        declarantIdentityId: row.declarant_identity_id,
        netAmount: BigInt(row.net_amount),
        groupFees: BigInt(row.group_fees),
        personalFeesOutOfPot: BigInt(row.personal_fees_out_of_pot),
        allegedDate: row.alleged_date ? new Date(row.alleged_date).getTime() : 0,
        serverDate: row.server_date ? new Date(row.server_date).getTime() : 0,
        state: row.state,
        requiredControllers: row.required_controllers,
        beneficiaryConfirmedBy: null,
        controllerIdentityIds: [],
        reversalRequestedBy: row.reversal_requested_by,
        reversalReason: row.reversal_reason,
        reversedById: null,
        reversalCount: 0,
        refundedExternally: false,
      }));
      const roundRes = await client.query<{ validated_net: string }>(
        `SELECT COALESCE(SUM(validated_net), 0)::text AS validated_net FROM obligation WHERE group_id = $1 AND round_id = $2`,
        [groupId, roundId],
      );
      if (records.length === 0 && roundRes.rows.length === 0) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Tour introuvable pour ce groupe");
      }
      const netDisbursed = sumNetDisbursed(records);
      const groupFees = sumGroupFees(records);
      const validatedNetTotal = BigInt(roundRes.rows[0]?.validated_net ?? "0");
      const result = reconcileRound({
        validatedNetTotal,
        netDisbursedTotal: netDisbursed,
        groupFeesTotal: groupFees,
      });
      return { ...result, netDisbursed: netDisbursed.toString(), groupFees: groupFees.toString() };
    });
  }

  async view(ctx: DisbursementContext, groupId: string, disbursementId: string): Promise<DisbursementView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, disbursementId);
      if (!held || held.record.groupId !== groupId) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
      }
      return toView(held.record, held.version);
    });
  }

  async eventCount(
    groupId: string,
    type: "disbursement.requested" | "disbursement.completed" | "disbursement.reversed",
  ): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(`SELECT count(*)::int AS n FROM journal WHERE group_id = $1 AND event_type = $2`, [
        groupId,
        type,
      ]);
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
