/**
 * Discipline (amendes), caisse de secours (aides) et dettes suivies
 * (L-09, L-10, I-12). Toute décision est prise par une personne distincte
 * de celle qu'elle concerne, motivée et chaînée au journal.
 */
import type pg from "pg";
import {
  DomainError,
  aidAmount,
  assertAidDecider,
  assertChannelReference,
  assertFineIssuable,
  fineAmount,
  fiscalYear,
  transitionAid,
  transitionFine,
  writeOffDebt,
  type AidEvent,
  type AidState,
  type AidView,
  type DebtView,
  type FineKind,
  type FineState,
  type FineView,
  type MovementView,
  type PaymentChannel,
} from "@kombe/domain";
import {
  type Actor,
  type Db,
  appendEvent,
  groupActor,
  identitiesWithRoles,
  inTx,
  isoDate,
  isoInstant,
  m,
  may,
  money,
  newId,
  notify,
  requireAct,
  sessionIdentity,
  todayDouala,
} from "./infra.js";
import { aidScaleOf, fineScheduleOf } from "./settings.js";
import { fundConfirmedBalance, fundOfKind, loadGroup, loadNames, movementViews } from "./views.js";

/* ── Lectures ─────────────────────────────────────────────────────────── */

export async function fineViews(db: Db, groupId: string, filter: { meetingId?: string; fineId?: string; membershipId?: string } = {}): Promise<FineView[]> {
  const names = await loadNames(db, groupId);
  const where = ["group_id = $1"];
  const args: unknown[] = [groupId];
  if (filter.meetingId) {
    args.push(filter.meetingId);
    where.push(`meeting_id = $${args.length}`);
  }
  if (filter.fineId) {
    args.push(filter.fineId);
    where.push(`fine_id = $${args.length}`);
  }
  if (filter.membershipId) {
    args.push(filter.membershipId);
    where.push(`membership_id = $${args.length}`);
  }
  const r = await db.query(`SELECT * FROM fine WHERE ${where.join(" AND ")} ORDER BY issued_at DESC, fine_id LIMIT 500`, args);
  return r.rows.map((row) => ({
    fineId: String(row.fine_id),
    membershipId: String(row.membership_id),
    memberName: names.byMembership.get(String(row.membership_id)) ?? "",
    kind: row.kind as FineKind,
    amount: String(row.amount),
    reason: String(row.reason),
    state: row.state as FineState,
    issuedAt: isoInstant(row.issued_at) as string,
    issuedByName: names.byIdentity.get(String(row.issued_by_identity_id)) ?? null,
    meetingId: row.meeting_id ? String(row.meeting_id) : null,
  }));
}

export async function aidViews(db: Db, groupId: string, aidId?: string): Promise<AidView[]> {
  const names = await loadNames(db, groupId);
  const r = await db.query(
    `SELECT * FROM aid_request WHERE group_id = $1 ${aidId ? "AND aid_id = $2" : ""} ORDER BY requested_at DESC LIMIT 300`,
    aidId ? [groupId, aidId] : [groupId],
  );
  return r.rows.map((row) => ({
    aidId: String(row.aid_id),
    beneficiaryMembershipId: String(row.beneficiary_membership_id),
    beneficiaryName: names.byMembership.get(String(row.beneficiary_membership_id)) ?? "",
    event: row.event as AidEvent,
    eventDate: isoDate(row.event_date) as string,
    amount: String(row.amount),
    state: row.state as AidState,
    note: row.note ?? null,
    requestedAt: isoInstant(row.requested_at) as string,
    decisionNote: row.decision_note ?? null,
  }));
}

export async function debtViews(db: Db, actor: Actor, debtId?: string): Promise<DebtView[]> {
  const names = await loadNames(db, actor.groupId);
  const seeAll = may(actor, "debt.manage") || may(actor, "movement.confirm") || may(actor, "movement.control");
  const args: unknown[] = [actor.groupId];
  let where = "group_id = $1";
  if (debtId) {
    args.push(debtId);
    where += ` AND debt_id = $${args.length}`;
  }
  if (!seeAll) {
    const proxied = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND proxy_membership_id = $2`, [actor.groupId, actor.membershipId]);
    args.push([actor.membershipId, ...proxied.rows.map((x) => String(x.membership_id))]);
    where += ` AND debtor_membership_id = ANY($${args.length})`;
  }
  const r = await db.query(`SELECT * FROM member_debt WHERE ${where} ORDER BY created_at DESC LIMIT 500`, args);
  return r.rows.map((row) => {
    const amount = BigInt(String(row.amount));
    const settled = BigInt(String(row.settled));
    return {
      debtId: String(row.debt_id),
      debtorMembershipId: String(row.debtor_membership_id),
      debtorName: names.byMembership.get(String(row.debtor_membership_id)) ?? "",
      origin: row.origin,
      amount: m(amount),
      settled: m(settled),
      remaining: m(row.state === "open" ? amount - settled : 0n),
      state: row.state,
      guarantorName: row.guarantor_membership_id ? (names.byMembership.get(String(row.guarantor_membership_id)) ?? null) : null,
      createdAt: isoInstant(row.created_at) as string,
    } satisfies DebtView;
  });
}

async function representsOrIs(db: Db, actor: Actor, membershipId: string): Promise<boolean> {
  if (membershipId === actor.membershipId) return true;
  const r = await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND membership_id = $2 AND proxy_membership_id = $3`, [
    actor.groupId,
    membershipId,
    actor.membershipId,
  ]);
  return r.rows.length > 0;
}

/* ── Création automatique d'amendes (fin de séance) ───────────────────── */

export async function issueFineRow(
  db: Db,
  actor: Actor,
  input: { membershipId: string; kind: FineKind; amount: bigint; reason: string; meetingId: string | null },
  nowMs: number,
): Promise<string> {
  const fineId = newId("fin");
  await db.query(
    `INSERT INTO fine (fine_id, group_id, membership_id, meeting_id, kind, amount, reason, issued_by_identity_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [fineId, actor.groupId, input.membershipId, input.meetingId, input.kind, m(input.amount), input.reason, actor.identityId],
  );
  await appendEvent(db, actor, "fine.issued", { fineId, membershipId: input.membershipId, kind: input.kind, amount: m(input.amount) }, nowMs);
  const names = await loadNames(db, actor.groupId);
  const target = names.identityOf.get(input.membershipId);
  if (target) await notify(db, actor.groupId, [target], "fine_issued", `/tontines/${actor.groupId}/discipline`, `fine:${fineId}`);
  return fineId;
}

export class DisciplineService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  private async actor(db: Db, headers: Record<string, unknown>, groupId: string, nowMs: number): Promise<Actor> {
    return groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
  }

  /* ── Amendes ────────────────────────────────────────────────────────── */

  async fines(headers: Record<string, unknown>, groupId: string): Promise<FineView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await this.actor(db, headers, groupId, nowMs);
      return fineViews(db, groupId);
    });
  }

  async issueFine(
    headers: Record<string, unknown>,
    groupId: string,
    input: { membershipId: string; kind: FineKind; amount?: string | undefined; reason: string; meetingId?: string | undefined },
  ): Promise<FineView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "fine.issue");
      const group = await loadGroup(db, groupId);
      if (group.state !== "active") throw new DomainError("STATE_CONFLICT", "Les amendes s'appliquent pendant le cycle");
      const names = await loadNames(db, groupId);
      const target = names.identityOf.get(input.membershipId);
      if (!target) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
      assertFineIssuable({ issuerIdentityId: actor.identityId, targetIdentityId: target, reason: input.reason });
      const amount = fineAmount(fineScheduleOf(group.settings), input.kind, input.amount !== undefined ? money(input.amount) : null);
      if (amount <= 0n) throw new DomainError("FINE_INVALID", "Le règlement ne prévoit pas d'amende de ce type");
      if (input.meetingId) {
        const mt = await db.query(`SELECT 1 FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, input.meetingId]);
        if (mt.rows.length === 0) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
      }
      const fineId = await issueFineRow(db, actor, { membershipId: input.membershipId, kind: input.kind, amount, reason: input.reason.trim(), meetingId: input.meetingId ?? null }, nowMs);
      return (await fineViews(db, groupId, { fineId }))[0] as FineView;
    });
  }

  async contestFine(headers: Record<string, unknown>, groupId: string, fineId: string, reason: string): Promise<FineView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const f = await db.query(`SELECT membership_id, state FROM fine WHERE group_id = $1 AND fine_id = $2 FOR UPDATE`, [groupId, fineId]);
      const row = f.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Amende introuvable");
      if (!(await representsOrIs(db, actor, String(row.membership_id)))) throw new DomainError("TONTINE_FORBIDDEN", "Seul le membre concerné conteste");
      if (reason.trim().length < 3) throw new DomainError("FINE_INVALID", "Motif de contestation obligatoire");
      transitionFine(row.state as FineState, "contested");
      await db.query(`UPDATE fine SET state = 'contested', version = version + 1 WHERE group_id = $1 AND fine_id = $2`, [groupId, fineId]);
      await appendEvent(db, actor, "fine.contested", { fineId, reason: reason.trim().slice(0, 500) }, nowMs);
      const deciders = await identitiesWithRoles(db, groupId, ["animator", "vice_president"]);
      await notify(db, groupId, deciders.filter((i) => i !== actor.identityId), "general", `/tontines/${groupId}/discipline`, `contest:${fineId}`);
      return (await fineViews(db, groupId, { fineId }))[0] as FineView;
    });
  }

  /** La présidence tranche une contestation : annuler (motif) ou maintenir. */
  async decideFine(headers: Record<string, unknown>, groupId: string, fineId: string, decision: "cancel" | "maintain", reason: string): Promise<FineView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "member.admit"); // présidence (président, vice-président)
      const f = await db.query(`SELECT membership_id, state, issued_by_identity_id FROM fine WHERE group_id = $1 AND fine_id = $2 FOR UPDATE`, [groupId, fineId]);
      const row = f.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Amende introuvable");
      if (String(row.membership_id) === actor.membershipId) throw new DomainError("APPROVER_NOT_DISTINCT", "On ne tranche pas sa propre amende");
      if (reason.trim().length < 3) throw new DomainError("FINE_INVALID", "Motif obligatoire");
      if (decision === "cancel") {
        transitionFine(row.state as FineState, "cancelled");
        await db.query(`UPDATE fine SET state = 'cancelled', cancel_reason = $3, version = version + 1 WHERE group_id = $1 AND fine_id = $2`, [
          groupId,
          fineId,
          reason.trim().slice(0, 500),
        ]);
      } else {
        if (row.state !== "contested") throw new DomainError("FINE_INVALID", "Seule une amende contestée se maintient");
        transitionFine("contested", "issued");
        await db.query(`UPDATE fine SET state = 'issued', version = version + 1 WHERE group_id = $1 AND fine_id = $2`, [groupId, fineId]);
      }
      await appendEvent(db, actor, decision === "cancel" ? "fine.cancelled" : "fine.maintained", { fineId, reason: reason.trim().slice(0, 500) }, nowMs);
      const names = await loadNames(db, groupId);
      const target = names.identityOf.get(String(row.membership_id));
      if (target) await notify(db, groupId, [target], "fine_issued", `/tontines/${groupId}/discipline`, `fineDecision:${fineId}:${decision}`);
      return (await fineViews(db, groupId, { fineId }))[0] as FineView;
    });
  }

  /* ── Secours ────────────────────────────────────────────────────────── */

  async aids(headers: Record<string, unknown>, groupId: string): Promise<AidView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await this.actor(db, headers, groupId, nowMs);
      return aidViews(db, groupId);
    });
  }

  async requestAid(
    headers: Record<string, unknown>,
    groupId: string,
    input: { beneficiaryMembershipId?: string | undefined; event: AidEvent; eventDate: string; note?: string | undefined },
  ): Promise<AidView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "aid.request");
      const group = await loadGroup(db, groupId);
      if (!group.settings.solidarity.enabled) throw new DomainError("AID_INVALID", "Pas de caisse de secours dans ce règlement");
      const fund = await fundOfKind(db, groupId, "solidarity");
      if (!fund) throw new DomainError("AID_INVALID", "Caisse de secours absente");
      const beneficiary = input.beneficiaryMembershipId ?? actor.membershipId;
      const ben = await db.query(`SELECT state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, beneficiary]);
      if (ben.rows[0]?.state !== "active") throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
      if (input.eventDate > todayDouala(nowMs)) throw new DomainError("AID_INVALID", "L'événement est déjà survenu");
      const year = fiscalYear(input.eventDate);
      const already = await db.query(
        `SELECT count(*) AS c FROM aid_request WHERE group_id = $1 AND beneficiary_membership_id = $2 AND event = $3
            AND state IN ('approved','paid') AND extract(year FROM event_date) = $4`,
        [groupId, beneficiary, input.event, year],
      );
      const amount = aidAmount({ scale: aidScaleOf(group.settings), event: input.event, alreadyThisYear: Number(already.rows[0]?.c ?? 0) });
      const aidId = newId("aid");
      await db.query(
        `INSERT INTO aid_request (aid_id, group_id, fund_id, beneficiary_membership_id, event, event_date, amount, note, requested_by_identity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [aidId, groupId, fund.fundId, beneficiary, input.event, input.eventDate, m(amount), input.note?.trim().slice(0, 500) || null, actor.identityId],
      );
      await appendEvent(db, actor, "aid.requested", { aidId, beneficiary, event: input.event, amount: m(amount) }, nowMs);
      const deciders = await identitiesWithRoles(db, groupId, ["animator", "vice_president", "secretary", "treasurer"]);
      await notify(db, groupId, deciders.filter((i) => i !== actor.identityId), "validation_waiting", `/tontines/${groupId}/secours`, `aid:${aidId}`);
      return (await aidViews(db, groupId, aidId))[0] as AidView;
    });
  }

  async decideAid(
    headers: Record<string, unknown>,
    groupId: string,
    aidId: string,
    input: { decision: "approve" | "reject"; note?: string | undefined; overrideAmount?: string | undefined; overrideReason?: string | undefined },
  ): Promise<AidView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "aid.decide");
      const group = await loadGroup(db, groupId);
      const r = await db.query(`SELECT * FROM aid_request WHERE group_id = $1 AND aid_id = $2 FOR UPDATE`, [groupId, aidId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      const names = await loadNames(db, groupId);
      const benIdentity = names.identityOf.get(String(row.beneficiary_membership_id)) ?? "";
      assertAidDecider(actor.identityId, benIdentity);
      if (String(row.requested_by_identity_id) === actor.identityId && input.decision === "approve") {
        throw new DomainError("APPROVER_NOT_DISTINCT", "On n'approuve pas une demande que l'on a soi-même déposée");
      }
      const next = transitionAid(row.state as AidState, input.decision === "approve" ? "approved" : "rejected");
      let amount = BigInt(String(row.amount));
      if (input.decision === "approve" && input.overrideAmount !== undefined) {
        const year = fiscalYear(isoDate(row.event_date) as string);
        const already = await db.query(
          `SELECT count(*) AS c FROM aid_request WHERE group_id = $1 AND beneficiary_membership_id = $2 AND event = $3
              AND state IN ('approved','paid') AND extract(year FROM event_date) = $4`,
          [groupId, row.beneficiary_membership_id, row.event, year],
        );
        amount = aidAmount({
          scale: aidScaleOf(group.settings),
          event: row.event as AidEvent,
          alreadyThisYear: Number(already.rows[0]?.c ?? 0),
          overrideAmount: money(input.overrideAmount),
          overrideReason: input.overrideReason ?? null,
        });
      }
      await db.query(
        `UPDATE aid_request SET state = $3, decided_by_identity_id = $4, decided_at = $5, decision_note = $6, amount = $7, override_reason = $8, version = version + 1
          WHERE group_id = $1 AND aid_id = $2`,
        [groupId, aidId, next, actor.identityId, new Date(nowMs), input.note?.trim().slice(0, 500) || null, m(amount), input.overrideReason?.trim() || null],
      );
      await appendEvent(db, actor, input.decision === "approve" ? "aid.approved" : "aid.rejected", { aidId, amount: m(amount) }, nowMs);
      if (benIdentity) await notify(db, groupId, [benIdentity], "aid_decided", `/tontines/${groupId}/secours`, `aidDecision:${aidId}`);
      return (await aidViews(db, groupId, aidId))[0] as AidView;
    });
  }

  /** Le trésorier remet l'aide : remise déclarée, que le bénéficiaire confirme. */
  async payAid(
    headers: Record<string, unknown>,
    groupId: string,
    aidId: string,
    input: { channel: PaymentChannel; reference?: string | undefined; justification?: string | undefined },
  ): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "movement.confirm");
      const r = await db.query(`SELECT * FROM aid_request WHERE group_id = $1 AND aid_id = $2 FOR UPDATE`, [groupId, aidId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      transitionAid(row.state as AidState, "paid");
      if (String(row.beneficiary_membership_id) === actor.membershipId) {
        throw new DomainError("APPROVER_NOT_DISTINCT", "On ne se remet pas sa propre aide");
      }
      assertChannelReference({ channel: input.channel, reference: input.reference ?? null, justification: input.justification ?? null });
      const amount = BigInt(String(row.amount));
      const bal = await fundConfirmedBalance(db, groupId, String(row.fund_id));
      if (bal < amount) throw new DomainError("FUND_INVALID", "La caisse de secours ne couvre pas ce montant : cotisation exceptionnelle à voter");
      const mt = await db.query(`SELECT meeting_id FROM meeting WHERE group_id = $1 AND state = 'open' LIMIT 1`, [groupId]);
      const movementId = newId("mvt");
      await db.query(
        `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, membership_id, meeting_id, channel, reference, justification,
                                    declared_by_identity_id, related_kind, related_id)
         VALUES ($1,$2,$3,'payout',$4,$5,$6,$7,$8,$9,$10,'aid',$11)`,
        [movementId, groupId, row.fund_id, m(amount), row.beneficiary_membership_id, mt.rows[0]?.meeting_id ?? null, input.channel, input.reference ?? null, input.justification ?? null, actor.identityId, aidId],
      );
      await db.query(`UPDATE aid_request SET state = 'paid', movement_id = $3, version = version + 1 WHERE group_id = $1 AND aid_id = $2`, [groupId, aidId, movementId]);
      await appendEvent(db, actor, "aid.paid", { aidId, movementId, amount: m(amount) }, nowMs);
      const names = await loadNames(db, groupId);
      const ben = names.identityOf.get(String(row.beneficiary_membership_id));
      if (ben) await notify(db, groupId, [ben], "payout_recorded", `/tontines/${groupId}/secours`, `aidPaid:${aidId}`);
      return (await movementViews(db, actor, { movementIds: [movementId] }))[0] as MovementView;
    });
  }

  /* ── Dettes ─────────────────────────────────────────────────────────── */

  async debts(headers: Record<string, unknown>, groupId: string): Promise<DebtView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => debtViews(db, await this.actor(db, headers, groupId, nowMs)));
  }

  async writeOff(headers: Record<string, unknown>, groupId: string, debtId: string, reason: string): Promise<DebtView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "member.admit"); // présidence
      const r = await db.query(`SELECT * FROM member_debt WHERE group_id = $1 AND debt_id = $2 FOR UPDATE`, [groupId, debtId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Dette introuvable");
      const names = await loadNames(db, groupId);
      writeOffDebt(
        {
          debtId,
          debtorMembershipId: String(row.debtor_membership_id),
          origin: row.origin,
          amount: BigInt(String(row.amount)),
          settled: BigInt(String(row.settled)),
          state: row.state,
          creditorFundId: row.creditor_fund_id ?? null,
          guarantorMembershipId: row.guarantor_membership_id ?? null,
        },
        { reason, deciderIdentityId: actor.identityId, debtorIdentityId: names.identityOf.get(String(row.debtor_membership_id)) ?? "" },
      );
      await db.query(
        `UPDATE member_debt SET state = 'written_off', write_off_reason = $3, decided_by_identity_id = $4, closed_at = now(), version = version + 1
          WHERE group_id = $1 AND debt_id = $2`,
        [groupId, debtId, reason.trim().slice(0, 500), actor.identityId],
      );
      await appendEvent(db, actor, "debt.written_off", { debtId, reason: reason.trim().slice(0, 500) }, nowMs);
      return (await debtViews(db, actor, debtId))[0] as DebtView;
    });
  }
}
