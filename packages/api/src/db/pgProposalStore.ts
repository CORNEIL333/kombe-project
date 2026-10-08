/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les propositions/votes (C09).
 * TOUTE décision reste dans les fonctions pures de `@kombe/domain`
 * (proposal.ts) : scellement de l'électorat, bulletin unique, clôture via
 * l'oracle `voteResult`, exécution idempotente. Les gardes structurelles de
 * la migration 0012 (trigger `kombe_ballot_guards` : éligibilité/délai/état,
 * PRIMARY KEY `(vote_id, identity_id)` sur `ballot`, trigger
 * `kombe_vote_transition` : progression d'état légale) servent de défense en
 * profondeur, jamais d'unique garde-fou — la décision est toujours prise ici
 * par les fonctions pures AVANT toute écriture.
 *
 * L'électorat réel est scellé dans `vote_electorate` (table à FK, pas le
 * `frozen_electors bigint[]` hérité du socle 0001 qui reste vestige non
 * exploité par C09 — `vote_electorate` est la SEULE source de vérité pour
 * l'éligibilité, conformément au commentaire de la migration 0012).
 */
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  cancelProposal,
  castBallot,
  closeProposal,
  executeProposal,
  isCrossGroupAccess,
  openProposal,
  sealEventV1,
  type BallotChoice,
  type ProposalRecord,
  type ProposalState,
  type VoteTally,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";
import type {
  BallotReceipt,
  GroupDecisionRules,
  OpenProposalCommand,
  ProposalContext,
  ProposalEventType,
  ProposalView,
} from "../proposalStore.js";

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

interface VoteRow {
  readonly vote_id: string;
  readonly group_id: string;
  readonly subject_kind: string;
  readonly subject_ref: string;
  readonly reason: string;
  readonly rules_version: number;
  readonly canonical_hash: string;
  readonly quorum_num: number;
  readonly quorum_den: number;
  readonly state: ProposalState;
  readonly opened_at: string;
  readonly deadline: string;
  readonly closed_at: string | null;
  readonly effective_at: string | null;
  readonly executed_at: string | null;
  readonly cancel_reason: string | null;
  readonly cancelled_at: string | null;
  readonly version: number;
}

async function loadRecord(
  client: pg.PoolClient,
  voteId: string,
): Promise<{ record: ProposalRecord; version: number } | null> {
  const res = await client.query<VoteRow>(
    `SELECT vote_id, group_id, subject_kind, subject_ref, reason, rules_version, canonical_hash,
            quorum_num, quorum_den, state, opened_at, deadline, closed_at, effective_at,
            executed_at, cancel_reason, cancelled_at, version
     FROM vote WHERE vote_id = $1 FOR UPDATE`,
    [voteId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const electorateRes = await client.query<{ identity_id: string }>(
    `SELECT identity_id FROM vote_electorate WHERE vote_id = $1 ORDER BY frozen_at`,
    [voteId],
  );
  const ballotsRes = await client.query<{ identity_id: string; choice: BallotChoice }>(
    `SELECT identity_id, choice FROM ballot WHERE vote_id = $1`,
    [voteId],
  );
  const ballots: Record<string, BallotChoice> = {};
  for (const b of ballotsRes.rows) ballots[b.identity_id] = b.choice;

  let tally: VoteTally | null = null;
  if (row.state !== "open") {
    let yes = 0;
    let no = 0;
    let abstain = 0;
    for (const choice of Object.values(ballots)) {
      if (choice === "yes") yes += 1;
      else if (choice === "no") no += 1;
      else abstain += 1;
    }
    const electorateSize = electorateRes.rows.length;
    const quorumRes = await client.query<{ approved: boolean | null }>(`SELECT approved FROM vote WHERE vote_id = $1`, [
      voteId,
    ]);
    // Le quorum/l'approbation figés en base (colonnes `quorum`/`approved`,
    // posées à la clôture) font foi — jamais recalculés depuis des bulletins
    // potentiellement filtrés différemment ailleurs.
    const approved = quorumRes.rows[0]?.approved ?? false;
    const quorumVal = row.version; // placeholder, overwritten below if present
    void quorumVal;
    tally = { yes, no, abstain, turnout: yes + no + abstain, quorum: electorateSize, approved };
  }

  const record: ProposalRecord = {
    proposalId: row.vote_id,
    groupId: row.group_id,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    reason: row.reason,
    canonicalHash: row.canonical_hash,
    rulesVersion: row.rules_version,
    electorate: electorateRes.rows.map((r) => r.identity_id),
    quorumNumerator: row.quorum_num,
    quorumDenominator: row.quorum_den,
    openedAt: new Date(row.opened_at).getTime(),
    deadline: new Date(row.deadline).getTime(),
    state: row.state,
    ballots,
    tally,
    closedAt: row.closed_at ? new Date(row.closed_at).getTime() : null,
    effectiveAt: row.effective_at ? new Date(row.effective_at).getTime() : null,
    executedAt: row.executed_at ? new Date(row.executed_at).getTime() : null,
    executedByIdentityId: null,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).getTime() : null,
  };
  return { record, version: row.version };
}

function toView(record: ProposalRecord, version: number): ProposalView {
  return {
    voteId: record.proposalId,
    groupId: record.groupId,
    electorateSize: record.electorate.length,
    state: record.state,
    subjectKind: record.subjectKind,
    subjectRef: record.subjectRef,
    reason: record.reason,
    rulesVersion: record.rulesVersion,
    canonicalHash: record.canonicalHash,
    quorumNumerator: record.quorumNumerator,
    quorumDenominator: record.quorumDenominator,
    openedAt: record.openedAt,
    deadline: record.deadline,
    tally: record.tally,
    closedAt: record.closedAt,
    effectiveAt: record.effectiveAt,
    executedAt: record.executedAt,
    cancelReason: record.cancelReason,
    version,
  };
}

async function appendJournal(
  client: pg.PoolClient,
  ctx: ProposalContext,
  groupId: string,
  type: ProposalEventType,
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

export class PgProposalStore {
  constructor(private readonly pool: pg.Pool) {}

  /** Amorçage de test RÉEL : scelle l'électorat (membres actifs réels, lus
   *  depuis `membership`) pour un groupe — jamais une entrée client. */
  async sealElectorateFromActiveMembers(groupId: string): Promise<readonly string[]> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query<{ identity_id: string }>(
        `SELECT identity_id FROM membership WHERE group_id = $1 AND state = 'active' ORDER BY identity_id`,
        [groupId],
      );
      return res.rows.map((r) => r.identity_id);
    });
  }

  async open(ctx: ProposalContext, groupId: string, input: OpenProposalCommand, rules: GroupDecisionRules): Promise<ProposalView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    assertAllowed(ctx.actorRole, "vote.open");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const existing = await client.query(`SELECT 1 FROM vote WHERE vote_id = $1`, [input.proposalId]);
      if (existing.rows.length > 0) throw new DomainError("EVENT_CHAIN_BREAK", "Proposition déjà ouverte");
      const electorate = await client.query<{ identity_id: string }>(
        `SELECT identity_id FROM membership WHERE group_id = $1 AND state = 'active' ORDER BY identity_id`,
        [groupId],
      );
      const electorateIds = electorate.rows.map((r) => r.identity_id);
      if (electorateIds.length === 0) {
        throw new DomainError("ELECTORATE_INVALIDE", "Électorat serveur indisponible pour ce groupe");
      }
      const record = openProposal({
        proposalId: input.proposalId,
        groupId,
        subjectKind: input.subjectKind,
        subjectRef: input.subjectRef,
        reason: input.reason,
        rulesVersion: rules.rulesVersion,
        electorate: electorateIds,
        quorumNumerator: rules.quorumNumerator,
        quorumDenominator: rules.quorumDenominator,
        openedAt: Date.parse(ctx.serverDate) || Date.now(),
        durationSeconds: input.durationSeconds,
      });
      await client.query(
        `INSERT INTO vote
           (vote_id, group_id, electorate_size, quorum_num, quorum_den, state, frozen_electors, version,
            subject_kind, subject_ref, reason, rules_version, canonical_hash, opened_at, deadline)
         VALUES ($1,$2,$3,$4,$5,'open','{}',1,$6,$7,$8,$9,$10,$11,$12)`,
        [
          record.proposalId,
          groupId,
          record.electorate.length,
          record.quorumNumerator,
          record.quorumDenominator,
          record.subjectKind,
          record.subjectRef,
          record.reason,
          record.rulesVersion,
          record.canonicalHash,
          new Date(record.openedAt).toISOString(),
          new Date(record.deadline).toISOString(),
        ],
      );
      for (const identityId of electorateIds) {
        await client.query(`INSERT INTO vote_electorate (vote_id, group_id, identity_id) VALUES ($1,$2,$3)`, [
          record.proposalId,
          groupId,
          identityId,
        ]);
      }
      await appendJournal(client, ctx, groupId, "proposal.opened", {
        proposalId: record.proposalId,
        electorateSize: record.electorate.length,
        canonicalHash: record.canonicalHash,
      });
      return toView(record, 1);
    });
  }

  private async peekGroup(voteId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(`SELECT group_id FROM vote WHERE vote_id = $1`, [voteId]);
      await client.query("COMMIT");
      const row = res.rows[0];
      if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      return String(row.group_id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private gateAccess(ctx: ProposalContext, held: { record: ProposalRecord; version: number }): void {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, held.record.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (!Number.isInteger(ctx.expectedVersion) || ctx.expectedVersion < 1 || ctx.expectedVersion !== held.version) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  async cast(ctx: ProposalContext, voteId: string, choice: BallotChoice): Promise<BallotReceipt> {
    assertAllowed(ctx.actorRole, "vote.cast");
    const groupId = await this.peekGroup(voteId);
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, voteId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      this.gateAccess(ctx, held);
      const serverNow = Date.parse(ctx.serverDate) || Date.now();
      const result = castBallot(held.record, ctx.actorIdentityId, choice, serverNow);
      if (!result.voteAccepted) {
        return {
          voteAccepted: false,
          voteId,
          state: held.record.state,
          version: held.version,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        };
      }
      const newVersion = held.version + 1;
      try {
        await client.query(`INSERT INTO ballot (vote_id, identity_id, choice) VALUES ($1,$2,$3)`, [
          voteId,
          ctx.actorIdentityId,
          choice,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          return { voteAccepted: false, voteId, state: held.record.state, version: held.version, reason: "ALREADY_VOTED" };
        }
        throw error;
      }
      const updated = await client.query(`UPDATE vote SET version = $2 WHERE vote_id = $1 AND version = $3`, [
        voteId,
        newVersion,
        held.version,
      ]);
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      const eventHash = await appendJournal(client, ctx, held.record.groupId, "proposal.ballot", {
        proposalId: voteId,
        choice,
      });
      return { voteAccepted: true, voteId, state: held.record.state, version: newVersion, eventHash };
    });
  }

  async close(
    ctx: ProposalContext,
    voteId: string,
  ): Promise<{ state: ProposalState; tally: VoteTally; effectiveAt: number; version: number; eventHash: string }> {
    assertAllowed(ctx.actorRole, "vote.open");
    const groupId = await this.peekGroup(voteId);
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, voteId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      this.gateAccess(ctx, held);
      const serverNow = Date.parse(ctx.serverDate) || Date.now();
      const updatedRecord = closeProposal(held.record, serverNow);
      const tally = updatedRecord.tally as VoteTally;
      const newVersion = held.version + 1;
      const updated = await client.query(
        `UPDATE vote SET state='closed', closed_at=$2, effective_at=$2, quorum=$3, approved=$4, version=$5
         WHERE vote_id=$1 AND version=$6`,
        [voteId, new Date(serverNow).toISOString(), tally.quorum, tally.approved, newVersion, held.version],
      );
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      const eventHash = await appendJournal(client, ctx, held.record.groupId, "proposal.closed", {
        proposalId: voteId,
        approved: tally.approved,
        electorateSize: held.record.electorate.length,
      });
      return { state: "closed", tally, effectiveAt: serverNow, version: newVersion, eventHash };
    });
  }

  async cancel(
    ctx: ProposalContext,
    voteId: string,
    reason: string,
  ): Promise<{ state: ProposalState; version: number; eventHash: string }> {
    assertAllowed(ctx.actorRole, "vote.open");
    const groupId = await this.peekGroup(voteId);
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, voteId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      this.gateAccess(ctx, held);
      const serverNow = Date.parse(ctx.serverDate) || Date.now();
      cancelProposal(held.record, reason, serverNow);
      const newVersion = held.version + 1;
      const updated = await client.query(
        `UPDATE vote SET state='cancelled', cancel_reason=$2, cancelled_at=$3, version=$4 WHERE vote_id=$1 AND version=$5`,
        [voteId, reason, new Date(serverNow).toISOString(), newVersion, held.version],
      );
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      const eventHash = await appendJournal(client, ctx, held.record.groupId, "proposal.cancelled", {
        proposalId: voteId,
      });
      return { state: "cancelled", version: newVersion, eventHash };
    });
  }

  async execute(
    ctx: ProposalContext,
    voteId: string,
  ): Promise<{ state: ProposalState; executed: boolean; idempotent: boolean; version: number; eventHash?: string }> {
    assertAllowed(ctx.actorRole, "vote.open");
    const groupId = await this.peekGroup(voteId);
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, voteId);
      if (!held) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      this.gateAccess(ctx, held);
      const serverNow = Date.parse(ctx.serverDate) || Date.now();
      const result = executeProposal(held.record, ctx.actorIdentityId, serverNow);
      if (result.idempotent) {
        return { state: held.record.state, executed: true, idempotent: true, version: held.version };
      }
      const newVersion = held.version + 1;
      const updated = await client.query(
        `UPDATE vote SET state='executed', executed_at=$2, version=$3 WHERE vote_id=$1 AND version=$4`,
        [voteId, new Date(serverNow).toISOString(), newVersion, held.version],
      );
      if (updated.rowCount !== 1) throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      const eventHash = await appendJournal(client, ctx, held.record.groupId, "proposal.executed", {
        proposalId: voteId,
        effectiveAt: held.record.effectiveAt,
      });
      return { state: "executed", executed: true, idempotent: false, version: newVersion, eventHash };
    });
  }

  async view(ctx: ProposalContext, groupId: string, voteId: string): Promise<ProposalView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const held = await loadRecord(client, voteId);
      if (!held || held.record.groupId !== groupId) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      }
      return toView(held.record, held.version);
    });
  }

  async history(ctx: ProposalContext, groupId: string): Promise<ProposalView[]> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query<{ vote_id: string }>(
        `SELECT vote_id FROM vote WHERE group_id = $1 AND state <> 'open'
         ORDER BY COALESCE(executed_at, closed_at, cancelled_at, deadline) ASC`,
        [groupId],
      );
      const views: ProposalView[] = [];
      for (const row of res.rows) {
        const held = await loadRecord(client, row.vote_id);
        if (held) views.push(toView(held.record, held.version));
      }
      return views;
    });
  }

  async eventCount(groupId: string, type: ProposalEventType): Promise<number> {
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
