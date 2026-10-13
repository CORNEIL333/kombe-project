/**
 * Décisions votées de l'assemblée (ADR-0038) : pause des séances (L-03),
 * destitution (L-11), exclusion, suspension du droit de bouffer (L-09),
 * reprise de place (L-10) — et graduation des sanctions suggérée.
 *
 * Le serveur ne décide rien : il ouvre le scrutin, compte les bulletins,
 * et n'exécute QUE ce que la majorité absolue des électeurs a adopté, dans
 * la même transaction que le dernier bulletin ou le dépouillement.
 */
import type pg from "pg";
import {
  DECISION_OPENERS,
  DomainError,
  assertDecisionWindow,
  assertPauseOccurrences,
  deadlineUtcMs,
  isDecisionKind,
  isGroupRole,
  memberDueForRound,
  shiftedRoundDates,
  suggestedSanction,
  tallyDecision,
  targetExcludedFromElectorate,
  type BallotChoice,
  type Cadence,
  type DecisionKind,
  type DecisionView,
  type GroupRole,
  type SanctionView,
} from "@kombe/domain";
import {
  type Actor,
  type Db,
  activeMemberIdentities,
  appendEvent,
  groupActor,
  inTx,
  isoInstant,
  m,
  may,
  newId,
  notify,
  requireAct,
  sessionIdentity,
  todayDouala,
} from "./infra.js";
import { computeDues, cycleStarted, fundOfKind, loadGroup, loadNames, loadRoundRows, loadShareHoldings, sharesAt } from "./views.js";

const HOUR_MS = 3_600_000;

export interface OpenDecisionInput {
  readonly kind: string;
  readonly reason: string;
  readonly targetMembershipId?: string | undefined;
  readonly targetRole?: string | undefined;
  readonly hours?: number | undefined;
  readonly occurrences?: number | undefined;
  readonly fromSeq?: number | undefined;
  readonly incomingMembershipId?: string | undefined;
}

type Row = Record<string, unknown>;

/** Électeurs : membres actifs ayant un téléphone, admis avant l'ouverture. */
async function electors(db: Db, groupId: string, excludeMembershipId: string | null, at: string | null): Promise<string[]> {
  const r = await db.query(
    `SELECT membership_id FROM membership
      WHERE group_id = $1 AND state = 'active' AND identity_id NOT LIKE 'offline\\_%'
        AND ($2::text IS NULL OR membership_id <> $2)
        AND ($3::timestamptz IS NULL OR joined_at IS NULL OR joined_at <= $3)`,
    [groupId, excludeMembershipId, at],
  );
  return r.rows.map((x) => String(x.membership_id));
}

/** Tours encore décalables : ouverts, sans remise déclarée, séance non entamée. */
async function shiftableRounds(db: Db, groupId: string, fromSeq: number): Promise<{ seq: number; date: string }[]> {
  const rotation = await fundOfKind(db, groupId, "rotation");
  const r = await db.query(
    `SELECT r.seq, r.due_date_business::text AS d FROM round r
      WHERE r.group_id = $1 AND r.seq >= $2 AND r.state = 'open'
        AND NOT EXISTS (SELECT 1 FROM fund_movement f WHERE f.group_id = r.group_id AND f.fund_id = $3 AND f.kind = 'payout'
                          AND f.round_seq = r.seq AND f.state NOT IN ('rejected','compensated'))
        AND NOT EXISTS (SELECT 1 FROM meeting mt WHERE mt.group_id = r.group_id AND mt.round_seq = r.seq AND mt.state <> 'planned')
      ORDER BY r.seq`,
    [groupId, fromSeq, rotation?.fundId ?? ""],
  );
  return r.rows.map((x) => ({ seq: Number(x.seq), date: String(x.d) }));
}

/** Tours dont la remise a déjà été déclarée (le titulaire « a bouffé »). */
async function paidSeqs(db: Db, groupId: string): Promise<Set<number>> {
  const rotation = await fundOfKind(db, groupId, "rotation");
  const r = await db.query(
    `SELECT DISTINCT round_seq FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND kind = 'payout' AND state NOT IN ('rejected','compensated')`,
    [groupId, rotation?.fundId ?? ""],
  );
  return new Set(r.rows.map((x) => Number(x.round_seq)));
}

async function firstOpenSeq(db: Db, groupId: string): Promise<number | null> {
  const r = await db.query(`SELECT min(seq) AS s FROM round WHERE group_id = $1 AND state = 'open'`, [groupId]);
  return r.rows[0]?.s === null || r.rows[0]?.s === undefined ? null : Number(r.rows[0].s);
}

/** Parts dont `membershipId` est le DERNIER titulaire et dont le tour n'est pas encore remis. */
async function transferableShares(db: Db, groupId: string, membershipId: string): Promise<{ shareId: string; seq: number; weight: number }[]> {
  const holdings = await loadShareHoldings(db, groupId);
  const rounds = await loadRoundRows(db, groupId);
  const paid = await paidSeqs(db, groupId);
  const out: { shareId: string; seq: number; weight: number }[] = [];
  const byShare = new Map<string, typeof holdings>();
  for (const h of holdings) byShare.set(h.shareId, [...(byShare.get(h.shareId) ?? []), h]);
  for (const [shareId, list] of byShare) {
    const last = [...list].sort((a, b) => b.fromSeq - a.fromSeq).find((h) => h.membershipId === membershipId);
    const latestFrom = Math.max(...list.map((h) => h.fromSeq));
    if (!last || last.fromSeq !== latestFrom) continue;
    const round = rounds.find((r) => r.shareId === shareId);
    if (!round || round.state !== "open" || paid.has(round.seq)) continue;
    out.push({ shareId, seq: round.seq, weight: last.weight });
  }
  return out;
}

export class DecisionService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  /* ── Lectures ─────────────────────────────────────────────────────── */

  private async views(db: Db, actor: Actor, decisionId?: string): Promise<DecisionView[]> {
    const names = await loadNames(db, actor.groupId);
    const r = await db.query(
      `SELECT d.*, (SELECT count(*) FROM decision_ballot b WHERE b.decision_id = d.decision_id) AS ballots,
              (SELECT choice FROM decision_ballot b WHERE b.decision_id = d.decision_id AND b.membership_id = $2) AS my_choice
         FROM group_decision d WHERE d.group_id = $1 ${decisionId ? "AND d.decision_id = $3" : ""}
        ORDER BY (d.state = 'open') DESC, d.opened_at DESC LIMIT 200`,
      decisionId ? [actor.groupId, actor.membershipId, decisionId] : [actor.groupId, actor.membershipId],
    );
    const nowMs = this.now();
    return r.rows.map((row: Row) => {
      const kind = String(row.kind) as DecisionKind;
      const state = String(row.state) as DecisionView["state"];
      const target = row.target_membership_id ? String(row.target_membership_id) : null;
      const params = (row.params ?? {}) as Record<string, string | number | null>;
      const incoming = typeof params.incomingMembershipId === "string" ? params.incomingMembershipId : null;
      const isTarget = target !== null && target === actor.membershipId && targetExcludedFromElectorate(kind);
      const open = state === "open";
      return {
        decisionId: String(row.decision_id),
        kind,
        state,
        targetMembershipId: target,
        targetName: target ? (names.byMembership.get(target) ?? null) : null,
        targetRole: row.target_role ? (String(row.target_role) as GroupRole) : null,
        params: incoming ? { ...params, incomingName: names.byMembership.get(incoming) ?? null } : params,
        reason: String(row.reason),
        openedByName: names.byIdentity.get(String(row.opened_by_identity_id)) ?? null,
        openedAt: isoInstant(row.opened_at) as string,
        closesAt: isoInstant(row.closes_at) as string,
        electorate: Number(row.electorate),
        ballots: Number(row.ballots),
        result: row.yes_count === null || row.yes_count === undefined ? null : { yes: Number(row.yes_count), no: Number(row.no_count), abstain: Number(row.abstain_count) },
        myChoice: row.my_choice ? (String(row.my_choice) as BallotChoice) : null,
        outcomeNote: row.outcome_note ? String(row.outcome_note) : null,
        closedAt: isoInstant(row.closed_at),
        can: {
          vote: open && !isTarget && !row.my_choice && actor.membershipState === "active" && nowMs < new Date(String(row.closes_at)).getTime(),
          close: open && actor.membershipState === "active",
          cancel: open && (String(row.opened_by_identity_id) === actor.identityId || may(actor, "member.remove")),
          lift: state === "adopted" && kind === "payout_suspension" && may(actor, "member.remove") && target !== actor.membershipId,
        },
      } satisfies DecisionView;
    });
  }

  async list(headers: Record<string, unknown>, groupId: string): Promise<DecisionView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      return this.views(db, actor);
    });
  }

  /* ── Ouverture ───────────────────────────────────────────────────── */

  async open(headers: Record<string, unknown>, groupId: string, input: OpenDecisionInput): Promise<DecisionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      if (!isDecisionKind(input.kind)) throw new DomainError("DECISION_INVALID", "Décision inconnue");
      const kind = input.kind;
      requireAct(actor, DECISION_OPENERS[kind]);
      const group = await loadGroup(db, groupId, true);
      if (group.state === "closed") throw new DomainError("GROUP_READ_ONLY", "Association close");
      const started = await cycleStarted(db, groupId);
      const hours = input.hours ?? (kind === "removal" || kind === "exclusion" ? 72 : 24);
      assertDecisionWindow(kind, hours);
      const params: Record<string, string | number> = {};
      let target: { membershipId: string; identityId: string; state: string } | null = null;
      if (kind !== "pause") {
        if (!input.targetMembershipId) throw new DomainError("DECISION_INVALID", "Personne visée manquante");
        const t = await db.query(`SELECT membership_id, identity_id, state FROM membership WHERE group_id = $1 AND membership_id = $2`, [
          groupId,
          input.targetMembershipId,
        ]);
        if (!t.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
        target = { membershipId: String(t.rows[0].membership_id), identityId: String(t.rows[0].identity_id), state: String(t.rows[0].state) };
        if (kind !== "replacement" && target.state !== "active") throw new DomainError("DECISION_INVALID", "Ce membre n'est plus actif");
        if (kind !== "removal" && kind !== "replacement" && target.membershipId === actor.membershipId) {
          throw new DomainError("APPROVER_NOT_DISTINCT", "On ne demande pas un vote contre soi-même");
        }
      }
      switch (kind) {
        case "pause": {
          if (!started) throw new DomainError("DECISION_INVALID", "Le cycle n'a pas démarré : modifiez simplement le calendrier");
          const occurrences = input.occurrences ?? 1;
          assertPauseOccurrences(occurrences);
          const fromSeq = input.fromSeq ?? (await shiftableRounds(db, groupId, 1)).find((r) => r.date >= todayDouala(nowMs))?.seq;
          if (!fromSeq) throw new DomainError("DECISION_INVALID", "Aucune séance à venir à décaler");
          const rounds = await shiftableRounds(db, groupId, fromSeq);
          if (rounds[0]?.seq !== fromSeq) throw new DomainError("DECISION_INVALID", "Cette séance est déjà entamée ou remise");
          params.occurrences = occurrences;
          params.fromSeq = fromSeq;
          break;
        }
        case "removal": {
          if (!input.targetRole || !isGroupRole(input.targetRole) || input.targetRole === "member") {
            throw new DomainError("DECISION_INVALID", "Fonction du bureau manquante");
          }
          const held = await db.query(
            `SELECT 1 FROM role_assignment WHERE group_id = $1 AND membership_id = $2 AND role = $3 AND accepted_at IS NOT NULL AND ended_at IS NULL`,
            [groupId, target?.membershipId, input.targetRole],
          );
          if (held.rows.length === 0) throw new DomainError("DECISION_INVALID", "Cette personne ne tient pas cette fonction");
          break;
        }
        case "payout_suspension": {
          if (!started) throw new DomainError("DECISION_INVALID", "Le cycle n'a pas démarré");
          const s = await db.query(
            `SELECT 1 FROM group_decision WHERE group_id = $1 AND kind = 'payout_suspension' AND state = 'adopted' AND target_membership_id = $2`,
            [groupId, target?.membershipId],
          );
          if (s.rows.length > 0) throw new DomainError("DECISION_INVALID", "Droit de bouffer déjà suspendu");
          break;
        }
        case "replacement": {
          if (!started) throw new DomainError("DECISION_INVALID", "Avant le démarrage, ajoutez ou retirez simplement le membre");
          if (!input.incomingMembershipId || input.incomingMembershipId === target?.membershipId) {
            throw new DomainError("DECISION_INVALID", "Indiquez qui reprend la place");
          }
          const inc = await db.query(`SELECT state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, input.incomingMembershipId]);
          if (inc.rows[0]?.state !== "active") throw new DomainError("DECISION_INVALID", "La personne qui reprend la place doit être membre active");
          const shares = await transferableShares(db, groupId, target?.membershipId as string);
          if (shares.length === 0) {
            throw new DomainError("DECISION_INVALID", "Aucune place à reprendre : le tour de ce membre est déjà remis (sa dette reste suivie)");
          }
          params.incomingMembershipId = input.incomingMembershipId;
          break;
        }
        case "exclusion":
          break;
      }
      const exclude = target && targetExcludedFromElectorate(kind) ? target.membershipId : null;
      const openedAt = new Date(nowMs).toISOString();
      const voters = await electors(db, groupId, exclude, openedAt);
      if (voters.length === 0) throw new DomainError("DECISION_INVALID", "Aucun électeur");
      const decisionId = newId("dec");
      await db.query(
        `INSERT INTO group_decision (decision_id, group_id, kind, target_membership_id, target_role, params, reason, opened_by_identity_id, opened_at, closes_at, electorate)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
        [
          decisionId,
          groupId,
          kind,
          target?.membershipId ?? null,
          kind === "removal" ? input.targetRole : null,
          JSON.stringify(params),
          input.reason.trim(),
          actor.identityId,
          openedAt,
          new Date(nowMs + hours * HOUR_MS).toISOString(),
          voters.length,
        ],
      );
      await appendEvent(db, actor, "decision.opened", { decisionId, kind, targetMembershipId: target?.membershipId ?? null, params, electorate: voters.length }, nowMs);
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "decision", `/tontines/${groupId}/decisions`, `decision:${decisionId}`);
      return (await this.views(db, actor, decisionId))[0] as DecisionView;
    });
  }

  /* ── Vote, dépouillement, annulation, levée ─────────────────────── */

  async vote(headers: Record<string, unknown>, groupId: string, decisionId: string, choice: BallotChoice): Promise<DecisionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "group.read");
      const row = await this.lock(db, groupId, decisionId);
      if (row.state !== "open") throw new DomainError("DECISION_STATE_INVALID", "Scrutin clos");
      if (nowMs >= new Date(String(row.closes_at)).getTime()) throw new DomainError("DECISION_STATE_INVALID", "Délai de vote dépassé : dépouillez");
      const kind = String(row.kind) as DecisionKind;
      const exclude = row.target_membership_id && targetExcludedFromElectorate(kind) ? String(row.target_membership_id) : null;
      const voters = await electors(db, groupId, exclude, isoInstant(row.opened_at));
      if (!voters.includes(actor.membershipId)) throw new DomainError("TONTINE_FORBIDDEN", "Vous ne faites pas partie des électeurs de ce scrutin");
      await db.query(`INSERT INTO decision_ballot (group_id, decision_id, membership_id, choice) VALUES ($1,$2,$3,$4)`, [
        groupId,
        decisionId,
        actor.membershipId,
        choice,
      ]);
      // Bulletin secret : le journal garde le dépôt, jamais le choix.
      await appendEvent(db, actor, "decision.ballot_cast", { decisionId }, nowMs);
      await this.settleIfDecided(db, actor, row, nowMs, false);
      return (await this.views(db, actor, decisionId))[0] as DecisionView;
    });
  }

  async close(headers: Record<string, unknown>, groupId: string, decisionId: string): Promise<DecisionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "group.read");
      const row = await this.lock(db, groupId, decisionId);
      if (row.state !== "open") throw new DomainError("DECISION_STATE_INVALID", "Scrutin déjà clos");
      const settled = await this.settleIfDecided(db, actor, row, nowMs, true);
      if (!settled) throw new DomainError("DECISION_STATE_INVALID", "Le résultat n'est pas encore acquis : attendez la fin du vote");
      return (await this.views(db, actor, decisionId))[0] as DecisionView;
    });
  }

  async cancel(headers: Record<string, unknown>, groupId: string, decisionId: string, reason: string): Promise<DecisionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const row = await this.lock(db, groupId, decisionId);
      if (row.state !== "open") throw new DomainError("DECISION_STATE_INVALID", "Scrutin déjà clos");
      if (String(row.opened_by_identity_id) !== actor.identityId) requireAct(actor, "member.remove");
      await db.query(
        `UPDATE group_decision SET state = 'cancelled', closed_at = now(), closed_by_identity_id = $3, outcome_note = $4, version = version + 1
          WHERE group_id = $1 AND decision_id = $2`,
        [groupId, decisionId, actor.identityId, `Annulé : ${reason.trim()}`],
      );
      await appendEvent(db, actor, "decision.cancelled", { decisionId, reason: reason.trim() }, nowMs);
      return (await this.views(db, actor, decisionId))[0] as DecisionView;
    });
  }

  async lift(headers: Record<string, unknown>, groupId: string, decisionId: string, reason: string): Promise<DecisionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.remove");
      const row = await this.lock(db, groupId, decisionId);
      if (row.kind !== "payout_suspension" || row.state !== "adopted") throw new DomainError("DECISION_STATE_INVALID", "Rien à lever");
      if (String(row.target_membership_id) === actor.membershipId) throw new DomainError("APPROVER_NOT_DISTINCT", "On ne lève pas sa propre suspension");
      await db.query(
        `UPDATE group_decision SET state = 'lifted', lifted_at = now(), lifted_by_identity_id = $3, lift_reason = $4, version = version + 1
          WHERE group_id = $1 AND decision_id = $2`,
        [groupId, decisionId, actor.identityId, reason.trim()],
      );
      await appendEvent(db, actor, "decision.lifted", { decisionId, reason: reason.trim() }, nowMs);
      const names = await loadNames(db, groupId);
      const who = names.identityOf.get(String(row.target_membership_id));
      if (who) await notify(db, groupId, [who], "decision", `/tontines/${groupId}/decisions`, `decision-lifted:${decisionId}`);
      return (await this.views(db, actor, decisionId))[0] as DecisionView;
    });
  }

  private async lock(db: Db, groupId: string, decisionId: string): Promise<Row> {
    const r = await db.query(`SELECT * FROM group_decision WHERE group_id = $1 AND decision_id = $2 FOR UPDATE`, [groupId, decisionId]);
    if (!r.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Décision introuvable");
    return r.rows[0] as Row;
  }

  /** Clôt le scrutin si l'issue est acquise ; exécute la décision adoptée. */
  private async settleIfDecided(db: Db, actor: Actor, row: Row, nowMs: number, explicit: boolean): Promise<boolean> {
    const decisionId = String(row.decision_id);
    const c = await db.query(`SELECT choice, count(*) AS n FROM decision_ballot WHERE group_id = $1 AND decision_id = $2 GROUP BY choice`, [
      actor.groupId,
      decisionId,
    ]);
    const n = (k: string): number => Number(c.rows.find((x) => x.choice === k)?.n ?? 0);
    const kind = String(row.kind) as DecisionKind;
    const outcome = tallyDecision({
      kind,
      electorate: Number(row.electorate),
      yes: n("yes"),
      no: n("no"),
      abstain: n("abstain"),
      windowElapsed: nowMs >= new Date(String(row.closes_at)).getTime(),
    });
    if (outcome === "pending") return false;
    let note: string | null = null;
    if (outcome === "adopted") note = await this.execute(db, actor, row, nowMs);
    await db.query(
      `UPDATE group_decision SET state = $3, yes_count = $4, no_count = $5, abstain_count = $6, closed_at = now(),
              closed_by_identity_id = $7, outcome_note = $8, version = version + 1
        WHERE group_id = $1 AND decision_id = $2`,
      [actor.groupId, decisionId, outcome, n("yes"), n("no"), n("abstain"), actor.identityId, note],
    );
    await appendEvent(
      db,
      actor,
      outcome === "adopted" ? "decision.adopted" : "decision.rejected",
      { decisionId, kind, yes: n("yes"), no: n("no"), abstain: n("abstain"), electorate: Number(row.electorate), explicit },
      nowMs,
    );
    await notify(db, actor.groupId, await activeMemberIdentities(db, actor.groupId), "decision", `/tontines/${actor.groupId}/decisions`, `decision-closed:${decisionId}`);
    return true;
  }

  /** Effets d'une décision adoptée (même transaction que le vote décisif). */
  private async execute(db: Db, actor: Actor, row: Row, nowMs: number): Promise<string | null> {
    const groupId = actor.groupId;
    const kind = String(row.kind) as DecisionKind;
    const params = (row.params ?? {}) as Record<string, unknown>;
    const target = row.target_membership_id ? String(row.target_membership_id) : null;
    const names = await loadNames(db, groupId);
    switch (kind) {
      case "pause": {
        const group = await loadGroup(db, groupId);
        const rounds = await shiftableRounds(db, groupId, Number(params.fromSeq));
        if (rounds.length === 0) return "Plus aucune séance à décaler : rien n'a changé.";
        const occurrences = Number(params.occurrences);
        const dates = shiftedRoundDates(group.settings.cadence as Cadence, (rounds[0] as { date: string }).date, rounds.length, occurrences);
        await db.query("SELECT set_config('kombe.schedule_shift', 'approved', true)");
        for (const [i, r] of rounds.entries()) {
          const date = dates[i] as string;
          await db.query(`UPDATE round SET due_date_business = $3, due_at_utc = $4 WHERE group_id = $1 AND seq = $2`, [
            groupId,
            r.seq,
            date,
            new Date(deadlineUtcMs(date, group.settings.deadlineTime)),
          ]);
          await db.query(`UPDATE meeting SET scheduled_date = $3, version = version + 1 WHERE group_id = $1 AND round_seq = $2 AND state = 'planned'`, [
            groupId,
            r.seq,
            date,
          ]);
        }
        await appendEvent(db, actor, "schedule.paused", { fromSeq: rounds[0]?.seq, occurrences, newFirstDate: dates[0] }, nowMs);
        return `Séances décalées de ${occurrences} occurrence(s) : prochaine séance le ${dates[0]}.`;
      }
      case "removal": {
        await db.query(
          `UPDATE role_assignment SET ended_at = now() WHERE group_id = $1 AND membership_id = $2 AND role = $3 AND ended_at IS NULL`,
          [groupId, target, String(row.target_role)],
        );
        return "Fonction retirée. Le bureau propose un remplaçant, qui doit accepter.";
      }
      case "payout_suspension":
        return "Droit de bouffer suspendu jusqu'à levée par la présidence.";
      case "exclusion":
        return this.executeExclusion(db, actor, target as string, String(row.decision_id), names.byMembership.get(target as string) ?? "");
      case "replacement":
        return this.executeReplacement(db, actor, target as string, String(params.incomingMembershipId), nowMs);
    }
  }

  private async executeExclusion(db: Db, actor: Actor, target: string, decisionId: string, _name: string): Promise<string> {
    const groupId = actor.groupId;
    const group = await loadGroup(db, groupId);
    const parts: string[] = ["Membre exclu ; ses fonctions prennent fin."];
    await db.query(`UPDATE role_assignment SET ended_at = now() WHERE group_id = $1 AND membership_id = $2 AND ended_at IS NULL`, [groupId, target]);
    const cut = await firstOpenSeq(db, groupId);
    if (cut !== null) {
      const holdings = await loadShareHoldings(db, groupId);
      const rounds = await loadRoundRows(db, groupId);
      const paid = await paidSeqs(db, groupId);
      const mine = holdings.filter((h) => h.membershipId === target && h.untilSeq === null);
      const ate = rounds.some((r) => paid.has(r.seq) && r.beneficiaryMembershipId === target);
      if (ate) {
        // Il a déjà bouffé : ce qu'il doit encore jusqu'à la fin du cycle devient une dette suivie.
        const perShare = BigInt(group.settings.contributionPerShare);
        const dues = await computeDues(db, group, target, "9999-12-31", {});
        let owed = 0n;
        for (const r of rounds.filter((x) => x.state === "open" && x.seq >= cut)) {
          const due = memberDueForRound(sharesAt(holdings, r.seq), perShare).get(target) ?? 0n;
          const already = dues.filter((d) => d.roundSeq === r.seq && d.fundKind === "rotation").reduce((s, d) => s + BigInt(d.confirmed) + BigInt(d.declared), 0n);
          owed += due > already ? due - already : 0n;
        }
        if (owed > 0n) {
          const rotation = await fundOfKind(db, groupId, "rotation");
          const sp = await db.query(
            `SELECT s.membership_id FROM membership t JOIN membership s ON s.group_id = t.group_id AND s.membership_id = t.sponsor_membership_id
              WHERE t.group_id = $1 AND t.membership_id = $2 AND s.state = 'active'`,
            [groupId, target],
          );
          await db.query(
            `INSERT INTO member_debt (debt_id, group_id, debtor_membership_id, origin, origin_ref, amount, creditor_fund_id, guarantor_membership_id, created_by_identity_id)
             VALUES ($1,$2,$3,'catch_up',$4,$5,$6,$7,$8)`,
            [newId("dbt"), groupId, target, `exclusion:${decisionId}`, m(owed), rotation?.fundId ?? null, sp.rows[0]?.membership_id ?? null, actor.identityId],
          );
          parts.push(`Il a déjà reçu sa remise : ${m(owed)} FCFA restant dus jusqu'à la fin du cycle deviennent une dette suivie${sp.rows[0] ? " (son parrain en est l'avaliseur)" : ""}.`);
        }
      } else if (mine.length > 0) {
        parts.push("Sa place est vacante : faites voter une reprise de place avant son tour. Ce qu'il a déjà versé lui revient selon les statuts.");
      }
      if (mine.length > 0) {
        await db.query(
          `UPDATE share_holder SET until_seq = $3 WHERE group_id = $1 AND membership_id = $2 AND until_seq IS NULL`,
          [groupId, target, Math.max(cut - 1, 0)],
        );
      }
    }
    await db.query(`UPDATE membership SET state = 'revoked' WHERE group_id = $1 AND membership_id = $2`, [groupId, target]);
    return parts.join(" ");
  }

  private async executeReplacement(db: Db, actor: Actor, outgoing: string, incoming: string, nowMs: number): Promise<string> {
    const groupId = actor.groupId;
    const inc = await db.query(`SELECT state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, incoming]);
    if (inc.rows[0]?.state !== "active") return "La personne désignée n'est plus membre : rien n'a changé.";
    const cut = await firstOpenSeq(db, groupId);
    const shares = await transferableShares(db, groupId, outgoing);
    if (cut === null || shares.length === 0) return "Plus aucune place à reprendre : rien n'a changé.";
    await db.query("SELECT set_config('kombe.order_change', 'approved', true)");
    for (const s of shares) {
      await db.query(
        `UPDATE share_holder SET until_seq = LEAST(COALESCE(until_seq, $4), $4) WHERE group_id = $1 AND share_id = $2 AND membership_id = $3`,
        [groupId, s.shareId, outgoing, cut - 1],
      );
      await db.query(
        `INSERT INTO share_holder (group_id, share_id, membership_id, weight, from_seq) VALUES ($1,$2,$3,$4,$5)`,
        [groupId, s.shareId, incoming, s.weight, cut],
      );
      await db.query(`UPDATE round SET beneficiary_membership_id = $3 WHERE group_id = $1 AND seq = $2`, [groupId, s.seq, incoming]);
      await db.query(`UPDATE meeting SET host_membership_id = $3 WHERE group_id = $1 AND round_seq = $2 AND state = 'planned'`, [groupId, s.seq, incoming]);
    }
    // Ce que l'ancien titulaire a déjà versé sur la rotation (rachat de place à régler entre eux).
    const rotation = await fundOfKind(db, groupId, "rotation");
    const paid = await db.query(
      `SELECT COALESCE(SUM(amount),0)::text AS s FROM fund_movement
        WHERE group_id = $1 AND fund_id = $2 AND membership_id = $3 AND kind = 'contribution' AND state IN ('confirmed','validated')`,
      [groupId, rotation?.fundId ?? "", outgoing],
    );
    const left = await db.query(`SELECT 1 FROM share_holder WHERE group_id = $1 AND membership_id = $2 AND until_seq IS NULL`, [groupId, outgoing]);
    const st = await db.query(`SELECT state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, outgoing]);
    if (left.rows.length === 0 && st.rows[0]?.state === "active") {
      await db.query(`UPDATE membership SET state = 'departed' WHERE group_id = $1 AND membership_id = $2`, [groupId, outgoing]);
      await db.query(`UPDATE role_assignment SET ended_at = now() WHERE group_id = $1 AND membership_id = $2 AND ended_at IS NULL`, [groupId, outgoing]);
    }
    await appendEvent(db, actor, "order.place_taken_over", { outgoing, incoming, fromSeq: cut, rounds: shares.map((s) => s.seq) }, nowMs);
    return `Place reprise à partir du tour ${cut} (tour${shares.length > 1 ? "s" : ""} ${shares.map((s) => s.seq).join(", ")}). Rachat de place à régler devant le bureau : ${String(paid.rows[0]?.s ?? "0")} FCFA déjà versés par l'ancien titulaire.`;
  }

  /* ── Graduation des sanctions (L-09) ─────────────────────────────── */

  async sanctions(headers: Record<string, unknown>, groupId: string): Promise<SanctionView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const seeAll = may(actor, "fine.issue") || may(actor, "group.manage") || may(actor, "movement.confirm");
      const group = await loadGroup(db, groupId);
      const today = todayDouala(nowMs);
      const mem = await db.query(
        `SELECT membership_id, display_name FROM membership WHERE group_id = $1 AND state = 'active' ${seeAll ? "" : "AND membership_id = $2"} ORDER BY joined_at, membership_id`,
        seeAll ? [groupId] : [groupId, actor.membershipId],
      );
      const susp = await db.query(`SELECT target_membership_id FROM group_decision WHERE group_id = $1 AND kind = 'payout_suspension' AND state = 'adopted'`, [groupId]);
      const suspended = new Set(susp.rows.map((x) => String(x.target_membership_id)));
      const out: SanctionView[] = [];
      for (const row of mem.rows) {
        const id = String(row.membership_id);
        const dues = (await computeDues(db, group, id, today, { onlyOpen: true })).filter((d) => d.lateness === "late");
        const debts = await db.query(
          `SELECT count(*) AS c, COALESCE(SUM(amount - settled),0)::text AS s FROM member_debt WHERE group_id = $1 AND debtor_membership_id = $2 AND state = 'open'`,
          [groupId, id],
        );
        const lateCount = dues.length + Number(debts.rows[0]?.c ?? 0);
        out.push({
          membershipId: id,
          displayName: row.display_name ? String(row.display_name) : "",
          lateCount,
          lateAmount: m(dues.reduce((s, d) => s + BigInt(d.remaining), 0n)),
          openDebt: String(debts.rows[0]?.s ?? "0"),
          suggested: suggestedSanction(lateCount),
          payoutSuspended: suspended.has(id),
        });
      }
      return out;
    });
  }
}
