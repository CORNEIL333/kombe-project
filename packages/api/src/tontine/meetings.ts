/**
 * La séance (L-04, L-05, L-06) : ouverture, appel, clôture avec procès-verbal
 * généré depuis les faits (jamais saisi pour les montants), amendes
 * d'absence et de retard selon le règlement, approbation du PV à la séance
 * suivante sur son empreinte exacte.
 */
import type pg from "pg";
import {
  DomainError,
  assertAttendance,
  assertMinutesApproval,
  buildMinutes,
  transitionMeeting,
  type AttendanceStatus,
  type AttendanceView,
  type MeetingDetail,
  type MeetingState,
  type MeetingSummary,
} from "@kombe/domain";
import { type Actor, type Db, activeMemberIdentities, appendEvent, groupActor, inTx, notify, requireAct, sessionIdentity } from "./infra.js";
import { fineScheduleOf } from "./settings.js";
import { fineViews, issueFineRow } from "./discipline.js";
import { loadGroup, loadNames, meetingSummaries, movementViews } from "./views.js";

const FUND_LABEL: Readonly<Record<string, string>> = {
  rotation: "Cagnotte",
  solidarity: "Secours",
  operating: "Fonds de caisse",
  year_end_reserve: "Réserve de fin d'année",
  fines: "Amendes",
};

export async function meetingDetail(db: Db, actor: Actor, meetingId: string): Promise<MeetingDetail> {
  const summary = (await meetingSummaries(db, actor.groupId, meetingId))[0];
  if (!summary) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
  const r = await db.query(`SELECT notes, minutes_text, minutes_hash, minutes_approved_at FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [
    actor.groupId,
    meetingId,
  ]);
  const row = r.rows[0];
  const names = await loadNames(db, actor.groupId);
  const att = await db.query(`SELECT membership_id, status, represented_by_membership_id FROM attendance WHERE group_id = $1 AND meeting_id = $2`, [
    actor.groupId,
    meetingId,
  ]);
  const byMember = new Map(att.rows.map((x) => [String(x.membership_id), x]));
  const members = await db.query(
    `SELECT membership_id FROM membership WHERE group_id = $1 AND (state = 'active' OR membership_id = ANY($2)) ORDER BY joined_at, membership_id`,
    [actor.groupId, [...byMember.keys()]],
  );
  const attendance: AttendanceView[] = members.rows.map((x) => {
    const id = String(x.membership_id);
    const a = byMember.get(id);
    return {
      membershipId: id,
      displayName: names.byMembership.get(id) ?? "",
      status: a ? (a.status as AttendanceStatus) : null,
      representedByMembershipId: a?.represented_by_membership_id ? String(a.represented_by_membership_id) : null,
    };
  });
  return {
    ...summary,
    notes: row?.notes ?? null,
    attendance,
    movements: await movementViews(db, actor, { meetingId }),
    fines: await fineViews(db, actor.groupId, { meetingId }),
    minutes: row?.minutes_hash
      ? { text: String(row.minutes_text), hash: String(row.minutes_hash), approvedAt: row.minutes_approved_at ? new Date(row.minutes_approved_at).toISOString() : null }
      : null,
  };
}

async function lockMeeting(db: Db, groupId: string, meetingId: string): Promise<{ state: MeetingState; seq: number; date: string }> {
  const r = await db.query(`SELECT state, seq, scheduled_date::text AS d FROM meeting WHERE group_id = $1 AND meeting_id = $2 FOR UPDATE`, [groupId, meetingId]);
  if (!r.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
  return { state: r.rows[0].state as MeetingState, seq: Number(r.rows[0].seq), date: String(r.rows[0].d) };
}

export class MeetingService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  private async actor(db: Db, headers: Record<string, unknown>, groupId: string, nowMs: number): Promise<Actor> {
    return groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
  }

  async list(headers: Record<string, unknown>, groupId: string): Promise<MeetingSummary[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      return meetingSummaries(db, actor.groupId);
    });
  }

  async detail(headers: Record<string, unknown>, groupId: string, meetingId: string): Promise<MeetingDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => meetingDetail(db, await this.actor(db, headers, groupId, nowMs), meetingId));
  }

  async open(headers: Record<string, unknown>, groupId: string, meetingId: string): Promise<MeetingDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "meeting.manage");
      const mt = await lockMeeting(db, groupId, meetingId);
      transitionMeeting(mt.state, "open");
      const other = await db.query(`SELECT 1 FROM meeting WHERE group_id = $1 AND state = 'open' AND meeting_id <> $2`, [groupId, meetingId]);
      if (other.rows.length > 0) throw new DomainError("MEETING_STATE_INVALID", "Une autre séance est déjà ouverte");
      await db.query(
        `UPDATE meeting SET state = 'open', opened_at = $3, opened_by_identity_id = $4, version = version + 1 WHERE group_id = $1 AND meeting_id = $2`,
        [groupId, meetingId, new Date(nowMs), actor.identityId],
      );
      await appendEvent(db, actor, "meeting.opened", { meetingId, seq: mt.seq }, nowMs);
      await notify(db, groupId, (await activeMemberIdentities(db, groupId)).filter((i) => i !== actor.identityId), "meeting_opened", `/tontines/${groupId}/seances/${meetingId}`, `meetingOpen:${meetingId}`, {
        seq: Number(mt.seq),
      });
      return meetingDetail(db, actor, meetingId);
    });
  }

  async attendance(
    headers: Record<string, unknown>,
    groupId: string,
    meetingId: string,
    entries: readonly { membershipId: string; status: AttendanceStatus; representedByMembershipId?: string | null | undefined }[],
  ): Promise<MeetingDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "meeting.attendance");
      const mt = await lockMeeting(db, groupId, meetingId);
      if (mt.state !== "open") throw new DomainError("MEETING_STATE_INVALID", "La présence se note pendant la séance ouverte");
      const active = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
      const members = new Set(active.rows.map((x) => String(x.membership_id)));
      for (const e of entries) {
        if (!members.has(e.membershipId)) throw new DomainError("ATTENDANCE_INVALID", "Membre inconnu de l'association");
        const rep = e.representedByMembershipId ?? null;
        assertAttendance({ status: e.status, membershipId: e.membershipId, representedByMembershipId: rep });
        if (rep && !members.has(rep)) throw new DomainError("ATTENDANCE_INVALID", "Représentant inconnu");
        await db.query(
          `INSERT INTO attendance (group_id, meeting_id, membership_id, status, represented_by_membership_id, recorded_by_identity_id, recorded_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (meeting_id, membership_id) DO UPDATE
             SET status = EXCLUDED.status, represented_by_membership_id = EXCLUDED.represented_by_membership_id,
                 recorded_by_identity_id = EXCLUDED.recorded_by_identity_id, recorded_at = EXCLUDED.recorded_at`,
          [groupId, meetingId, e.membershipId, e.status, rep, actor.identityId, new Date(nowMs)],
        );
      }
      await appendEvent(db, actor, "meeting.attendance", { meetingId, entries: entries.map((e) => ({ m: e.membershipId, s: e.status })) }, nowMs);
      return meetingDetail(db, actor, meetingId);
    });
  }

  async close(headers: Record<string, unknown>, groupId: string, meetingId: string, input: { notes?: string | undefined; decisions?: readonly string[] | undefined }): Promise<MeetingDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "meeting.manage");
      const group = await loadGroup(db, groupId);
      const mt = await lockMeeting(db, groupId, meetingId);
      transitionMeeting(mt.state, "closed");

      // Appel complété : qui n'a pas été noté est absent.
      const active = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
      const att = await db.query(`SELECT membership_id, status FROM attendance WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
      const noted = new Map(att.rows.map((x) => [String(x.membership_id), String(x.status)]));
      for (const row of active.rows) {
        const id = String(row.membership_id);
        if (noted.has(id)) continue;
        await db.query(
          `INSERT INTO attendance (group_id, meeting_id, membership_id, status, recorded_by_identity_id, recorded_at) VALUES ($1,$2,$3,'absent',$4,$5)`,
          [groupId, meetingId, id, actor.identityId, new Date(nowMs)],
        );
        noted.set(id, "absent");
      }

      // Amendes du règlement (absence non excusée, retard), jamais à soi-même.
      const schedule = fineScheduleOf(group.settings);
      const names = await loadNames(db, groupId);
      const existing = await db.query(`SELECT membership_id, kind FROM fine WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
      const already = new Set(existing.rows.map((x) => `${x.membership_id}|${x.kind}`));
      for (const [id, status] of noted) {
        const kind = status === "absent" ? "meeting_absence" : status === "late" ? "meeting_late" : null;
        if (!kind) continue;
        const amount = kind === "meeting_absence" ? schedule.meetingAbsence : schedule.meetingLate;
        if (amount <= 0n || already.has(`${id}|${kind}`)) continue;
        if (names.identityOf.get(id) === actor.identityId) continue;
        const reason = kind === "meeting_absence" ? `Absence non excusée à la séance n° ${mt.seq}` : `Retard à la séance n° ${mt.seq}`;
        await issueFineRow(db, actor, { membershipId: id, kind, amount, reason, meetingId }, nowMs);
      }

      // Procès-verbal depuis les faits.
      const mv = await db.query(
        `SELECT mv.kind, mv.amount, mv.state, mv.membership_id, mv.witness_membership_ids, mv.beneficiary_confirmed_at, mv.related_kind, f.kind AS fund_kind
           FROM fund_movement mv JOIN fund f ON f.group_id = mv.group_id AND f.fund_id = mv.fund_id
          WHERE mv.group_id = $1 AND mv.meeting_id = $2 AND mv.state NOT IN ('rejected','compensated')
          ORDER BY mv.declared_at, mv.movement_id`,
        [groupId, meetingId],
      );
      const nameOf = (id: unknown): string => (id ? (names.byMembership.get(String(id)) ?? "") : "");
      const stateFr = (s: string): string => (s === "declared" ? "déclaré" : s === "confirmed" ? "confirmé" : "validé");
      const collections = mv.rows
        .filter((x) => x.kind === "contribution" || x.kind === "fine_payment" || x.kind === "advance_repayment")
        .map((x) => ({ fund: FUND_LABEL[String(x.fund_kind)] ?? String(x.fund_kind), member: nameOf(x.membership_id), amount: BigInt(String(x.amount)), state: stateFr(String(x.state)) }));
      const payouts = mv.rows
        .filter((x) => x.kind === "payout" && x.related_kind !== "aid")
        .map((x) => ({
          fund: FUND_LABEL[String(x.fund_kind)] ?? String(x.fund_kind),
          beneficiary: nameOf(x.membership_id),
          amount: BigInt(String(x.amount)),
          witnesses: ((x.witness_membership_ids as string[] | null) ?? []).map(nameOf),
          confirmed: x.beneficiary_confirmed_at !== null,
        }));
      const fines = (await fineViews(db, groupId, { meetingId })).filter((f) => f.state !== "cancelled").map((f) => ({ member: f.memberName, reason: f.reason, amount: BigInt(f.amount) }));
      const aidRows = mv.rows.filter((x) => x.kind === "payout" && x.related_kind === "aid");
      const attRows = await db.query(`SELECT membership_id, status, represented_by_membership_id FROM attendance WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
      const meetingRow = await db.query(`SELECT location, host_membership_id FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
      const decisions = (input.decisions ?? []).map((d) => d.trim()).filter((d) => d.length > 0).slice(0, 30).map((d) => d.slice(0, 300));
      const notes = input.notes?.trim().slice(0, 4000) || null;
      const minutes = buildMinutes({
        groupName: group.name,
        meetingSeq: mt.seq,
        date: mt.date,
        location: meetingRow.rows[0]?.location ?? null,
        host: meetingRow.rows[0]?.host_membership_id ? nameOf(meetingRow.rows[0].host_membership_id) : null,
        attendance: attRows.rows
          .map((x) => ({ name: nameOf(x.membership_id), status: x.status as AttendanceStatus, representedBy: x.represented_by_membership_id ? nameOf(x.represented_by_membership_id) : null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        collections,
        payouts,
        fines,
        aids: aidRows.map((x) => ({ member: nameOf(x.membership_id), event: "secours", amount: BigInt(String(x.amount)) })),
        decisions,
        notes,
      });
      await db.query(
        `UPDATE meeting SET state = 'closed', closed_at = $3, closed_by_identity_id = $4, notes = $5, minutes_text = $6, minutes_hash = $7, version = version + 1
          WHERE group_id = $1 AND meeting_id = $2`,
        [groupId, meetingId, new Date(nowMs), actor.identityId, notes, minutes.text, minutes.hash],
      );
      await appendEvent(db, actor, "meeting.closed", { meetingId, seq: mt.seq, minutesHash: minutes.hash }, nowMs);
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "minutes_ready", `/tontines/${groupId}/seances/${meetingId}`, `minutes:${meetingId}`);
      return meetingDetail(db, actor, meetingId);
    });
  }

  async approveMinutes(headers: Record<string, unknown>, groupId: string, meetingId: string, hash: string): Promise<MeetingDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "meeting.manage");
      const r = await db.query(`SELECT state, minutes_hash, minutes_approved_at FROM meeting WHERE group_id = $1 AND meeting_id = $2 FOR UPDATE`, [groupId, meetingId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
      if (row.state !== "closed" || !row.minutes_hash) throw new DomainError("MEETING_STATE_INVALID", "Le PV existe à la clôture de la séance");
      if (row.minutes_approved_at) throw new DomainError("STATE_CONFLICT", "PV déjà approuvé");
      assertMinutesApproval(String(row.minutes_hash), hash);
      const open = await db.query(`SELECT meeting_id FROM meeting WHERE group_id = $1 AND state = 'open' LIMIT 1`, [groupId]);
      await db.query(
        `UPDATE meeting SET minutes_approved_at = $3, minutes_approved_in = $4, version = version + 1 WHERE group_id = $1 AND meeting_id = $2`,
        [groupId, meetingId, new Date(nowMs), open.rows[0]?.meeting_id ?? null],
      );
      await appendEvent(db, actor, "meeting.minutes_approved", { meetingId, hash }, nowMs);
      return meetingDetail(db, actor, meetingId);
    });
  }
}
