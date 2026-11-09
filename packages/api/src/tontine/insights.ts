/**
 * Ce que les cahiers et les autres applications de tontine ne montrent pas
 * (ADR-0039) :
 *
 *  - Simulateur de cycle avant création : dates réelles, cagnotte, fin du
 *    cycle ; on voit exactement ce qu'on s'engage à faire.
 *  - « Mon tour » : quand je reçois, combien, et si le groupe m'avance de
 *    l'argent (je reçois avant d'avoir tout versé) ou si c'est moi qui avance
 *    au groupe.
 *  - Régularité : part des échéances réglées à temps, retards, amendes en
 *    cours ; chacun voit la sienne, le bureau voit celle de tous.
 *  - Résumé de séance prêt pour WhatsApp, avec l'empreinte du procès-verbal.
 *
 * Lecture seule : aucune écriture, aucun journal.
 */
import type pg from "pg";
import {
  DomainError,
  cycleSpanDays,
  describeCadence,
  lateness,
  meetingDates,
  memberDueForRound,
  splitByWeight,
  type Cadence,
} from "@kombe/domain";
import { groupActor, inTx, may, sessionIdentity, todayDouala } from "./infra.js";
import { currentCycle, loadGroup, loadNames, loadRoundRows, loadShareHoldings, sharesAt, roundSettingsOf } from "./views.js";

function xaf(n: bigint): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

export interface CycleSimulationInput {
  readonly cadence: Cadence;
  readonly firstMeetingDate: string;
  readonly shares: number;
  readonly contributionPerShare: string;
  /** Cotisations par séance des autres caisses (secours, fonds de caisse, réserve). */
  readonly sidePerMeeting?: string | undefined;
}

export interface CycleSimulation {
  readonly cadenceLabel: string;
  readonly meetings: number;
  readonly firstMeeting: string;
  readonly lastMeeting: string;
  readonly spanDays: number;
  readonly pot: string;
  readonly perMeetingPerShare: string;
  readonly totalPerShare: string;
  readonly dates: readonly string[];
  readonly summary: string;
}

/** Simulation pure : une séance par part, la cagnotte est reçue une fois par part. */
export function simulateCycle(input: CycleSimulationInput): CycleSimulation {
  if (!Number.isInteger(input.shares) || input.shares < 2 || input.shares > 60) {
    throw new DomainError("SHARES_INVALID", "De 2 à 60 parts");
  }
  const per = BigInt(input.contributionPerShare);
  const side = BigInt(input.sidePerMeeting ?? "0");
  if (per <= 0n || side < 0n) throw new DomainError("FUND_INVALID", "Cotisation invalide");
  const dates = meetingDates(input.cadence, input.firstMeetingDate, input.shares);
  const pot = per * BigInt(input.shares);
  const label = describeCadence(input.cadence, "fr");
  const first = dates[0] as string;
  const last = dates[dates.length - 1] as string;
  return {
    cadenceLabel: label,
    meetings: dates.length,
    firstMeeting: first,
    lastMeeting: last,
    spanDays: cycleSpanDays(dates),
    pot: pot.toString(),
    perMeetingPerShare: (per + side).toString(),
    totalPerShare: ((per + side) * BigInt(dates.length)).toString(),
    dates,
    summary:
      `${dates.length} séances (${label.toLowerCase()}), du ${first} au ${last}. ` +
      `Chaque part verse ${xaf(per + side)} par séance et reçoit une fois la cagnotte de ${xaf(pot)}.`,
  };
}

export interface ForecastTurn {
  readonly seq: number;
  readonly date: string;
  readonly amount: string;
  readonly paidBeforeReceiving: string;
  readonly position: "group_advances_you" | "you_advance_group" | "even";
  readonly gap: string;
  readonly explanation: string;
  readonly received: boolean;
}

export interface MyForecast {
  readonly cycle: number | null;
  readonly totalDue: string;
  readonly totalToReceive: string;
  readonly confirmedSoFar: string;
  readonly turns: readonly ForecastTurn[];
}

export interface RegularityRow {
  readonly membershipId: string;
  readonly name: string;
  readonly isMe: boolean;
  readonly dueSoFar: number;
  readonly onTime: number;
  readonly late: number;
  readonly unpaidLate: number;
  readonly openFines: number;
  readonly onTimeRate: number;
  readonly badge: "nouveau" | "exemplaire" | "régulier" | "à suivre" | "en retard";
}

export class InsightService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async simulate(headers: Record<string, unknown>, input: CycleSimulationInput): Promise<CycleSimulation> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, nowMs);
      return simulateCycle(input);
    });
  }

  /** « Mon tour » sur le cycle courant : ce que je reçois et ce que j'aurai versé avant. */
  async myForecast(headers: Record<string, unknown>, groupId: string): Promise<MyForecast> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const group = await loadGroup(db, groupId);
      const cycle = await currentCycle(db, groupId);
      const rounds = (await loadRoundRows(db, groupId)).filter((r) => !cycle || (r.seq >= cycle.firstSeq && r.seq <= cycle.lastSeq));
      const holdings = await loadShareHoldings(db, groupId);
      const rulesAt = await roundSettingsOf(db, group);
      const me = actor.membershipId;
      let cumulative = 0n;
      let totalToReceive = 0n;
      const turns: ForecastTurn[] = [];
      const received = await db.query(
        `SELECT round_seq FROM fund_movement WHERE group_id = $1 AND membership_id = $2 AND kind = 'payout' AND related_kind = 'payout'
            AND beneficiary_confirmed_at IS NOT NULL AND state NOT IN ('rejected','compensated')`,
        [groupId, me],
      );
      const receivedSeqs = new Set(received.rows.map((x) => Number(x.round_seq)));
      for (const r of rounds) {
        const at = sharesAt(holdings, r.seq);
        const per = BigInt(rulesAt(r.seq).contributionPerShare);
        cumulative += at.length > 0 ? (memberDueForRound(at, per).get(me) ?? 0n) : 0n;
        const share = at.find((s) => s.shareId === r.shareId);
        const mine = share ? splitByWeight(per * BigInt(at.length), share.holders).find((p) => p.membershipId === me) : undefined;
        if (!mine) continue;
        totalToReceive += mine.amount;
        const gap = mine.amount - cumulative;
        turns.push({
          seq: r.seq,
          date: r.date,
          amount: mine.amount.toString(),
          paidBeforeReceiving: cumulative.toString(),
          position: gap > 0n ? "group_advances_you" : gap < 0n ? "you_advance_group" : "even",
          gap: (gap < 0n ? -gap : gap).toString(),
          explanation:
            gap > 0n
              ? `Vous recevez ${xaf(mine.amount)} après avoir versé ${xaf(cumulative)} : le groupe vous avance ${xaf(gap)}, que vous continuerez à verser aux séances suivantes.`
              : gap < 0n
                ? `Vous recevez ${xaf(mine.amount)} après avoir versé ${xaf(cumulative)} : vous avez avancé ${xaf(-gap)} au groupe, qui vous les rend à ce tour.`
                : `Vous recevez exactement ce que vous avez versé.`,
          received: receivedSeqs.has(r.seq),
        });
      }
      const seqs = rounds.map((r) => r.seq);
      const conf = await db.query(
        `SELECT COALESCE(SUM(mv.amount), 0)::text AS s FROM fund_movement mv JOIN fund f ON f.group_id = mv.group_id AND f.fund_id = mv.fund_id
          WHERE mv.group_id = $1 AND mv.membership_id = $2 AND f.kind = 'rotation' AND mv.kind = 'contribution'
            AND mv.state IN ('confirmed','validated') AND (mv.round_seq = ANY($3::int[]) OR mv.related_kind = 'debt')`,
        [groupId, me, seqs],
      );
      return {
        cycle: cycle?.number ?? null,
        totalDue: cumulative.toString(),
        totalToReceive: totalToReceive.toString(),
        confirmedSoFar: String(conf.rows[0]?.s ?? "0"),
        turns,
      };
    });
  }

  /** Régularité de chacun sur les tours échus (tous cycles) : à temps, en retard, impayé. */
  async regularity(headers: Record<string, unknown>, groupId: string): Promise<RegularityRow[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const group = await loadGroup(db, groupId);
      const today = todayDouala(nowMs);
      const bureau = may(actor, "fine.issue") || may(actor, "movement.confirm") || may(actor, "member.admit") || may(actor, "movement.control");
      const transparency = group.settings.transparency;
      const seeAll = bureau || transparency !== "bureau_only";
      const showNames = bureau || transparency === "all_members";
      const grace = group.settings.fines.graceDays;
      const rulesAt = await roundSettingsOf(db, group);
      const rounds = (await loadRoundRows(db, groupId)).filter((r) => r.date <= today);
      const holdings = await loadShareHoldings(db, groupId);
      const paidRes = await db.query(
        `SELECT mv.membership_id, mv.round_seq, COALESCE(SUM(mv.amount), 0)::text AS s,
                max(COALESCE(mv.alleged_date, (mv.declared_at AT TIME ZONE 'Africa/Douala')::date))::text AS d
           FROM fund_movement mv JOIN fund f ON f.group_id = mv.group_id AND f.fund_id = mv.fund_id
          WHERE mv.group_id = $1 AND f.kind = 'rotation' AND mv.kind = 'contribution' AND mv.round_seq IS NOT NULL
            AND mv.state IN ('declared','confirmed','validated') AND mv.related_kind IS DISTINCT FROM 'debt'
          GROUP BY mv.membership_id, mv.round_seq`,
        [groupId],
      );
      const paid = new Map(paidRes.rows.map((x) => [`${x.membership_id}|${x.round_seq}`, { amount: BigInt(String(x.s)), date: String(x.d) }]));
      const fines = await db.query(
        `SELECT membership_id, count(*)::int AS n FROM fine WHERE group_id = $1 AND state IN ('issued','contested') GROUP BY membership_id`,
        [groupId],
      );
      const openFines = new Map(fines.rows.map((x) => [String(x.membership_id), Number(x.n)]));
      const members = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND state = 'active' ORDER BY joined_at, membership_id`, [groupId]);
      const names = await loadNames(db, groupId);
      const out: RegularityRow[] = [];
      for (const row of members.rows) {
        const id = String(row.membership_id);
        if (!seeAll && id !== actor.membershipId) continue;
        let due = 0;
        let onTime = 0;
        let late = 0;
        let unpaid = 0;
        for (const r of rounds) {
          const at = sharesAt(holdings, r.seq);
          const owed = at.length > 0 ? (memberDueForRound(at, BigInt(rulesAt(r.seq).contributionPerShare)).get(id) ?? 0n) : 0n;
          if (owed === 0n) continue;
          const p = paid.get(`${id}|${r.seq}`);
          if (p && p.amount >= owed) {
            due += 1;
            if (lateness(r.date, p.date, grace) === "late") late += 1;
            else onTime += 1;
          } else if (lateness(r.date, today, grace) === "late") {
            due += 1;
            unpaid += 1;
          }
        }
        const rate = due === 0 ? 100 : Math.round((onTime * 100) / due);
        const isMe = id === actor.membershipId;
        out.push({
          membershipId: id,
          name: isMe || showNames ? (names.byMembership.get(id) ?? "Membre") : "Membre",
          isMe,
          dueSoFar: due,
          onTime,
          late,
          unpaidLate: unpaid,
          openFines: openFines.get(id) ?? 0,
          onTimeRate: rate,
          badge: due === 0 ? "nouveau" : unpaid > 0 ? "en retard" : rate >= 90 ? "exemplaire" : rate >= 70 ? "régulier" : "à suivre",
        });
      }
      return out;
    });
  }

  /** Résumé de séance à coller dans le groupe WhatsApp (sans numéro de téléphone). */
  async meetingShareText(headers: Record<string, unknown>, groupId: string, meetingId: string): Promise<{ text: string }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const group = await loadGroup(db, groupId);
      const mt = await db.query(
        `SELECT seq, scheduled_date::text AS d, state, minutes_hash, round_seq FROM meeting WHERE group_id = $1 AND meeting_id = $2`,
        [groupId, meetingId],
      );
      const row = mt.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
      const att = await db.query(
        `SELECT count(*) FILTER (WHERE status IN ('present','late','represented'))::int AS present, count(*)::int AS total
           FROM attendance WHERE group_id = $1 AND meeting_id = $2`,
        [groupId, meetingId],
      );
      const payout = await db.query(
        `SELECT membership_id, amount::text AS amount, beneficiary_confirmed_at IS NOT NULL AS received FROM fund_movement
          WHERE group_id = $1 AND kind = 'payout' AND related_kind = 'payout' AND round_seq = $2 AND state NOT IN ('rejected','compensated')`,
        [groupId, row.round_seq],
      );
      const next = await db.query(
        `SELECT scheduled_date::text AS d, location, host_membership_id FROM meeting
          WHERE group_id = $1 AND seq > $2 AND state IN ('planned','open') ORDER BY seq LIMIT 1`,
        [groupId, row.seq],
      );
      const names = await loadNames(db, groupId);
      const bureau = actor.roles.some((r) => r !== "member");
      const showNames = bureau || group.settings.transparency === "all_members";
      const lines: string[] = [`*${group.name}* : séance n° ${String(row.seq)} du ${String(row.d)}`];
      const a = att.rows[0];
      if (a && Number(a.total) > 0) lines.push(`Présents : ${a.present}/${a.total}`);
      for (const p of payout.rows) {
        const who = showNames ? (names.byMembership.get(String(p.membership_id)) ?? "le bénéficiaire") : "le bénéficiaire du tour";
        lines.push(`Remise : ${xaf(BigInt(String(p.amount)))} à ${who}${p.received ? " (réception confirmée)" : " (réception à confirmer)"}`);
      }
      const n = next.rows[0];
      if (n) {
        const host = n.host_membership_id ? names.byMembership.get(String(n.host_membership_id)) : null;
        lines.push(`Prochaine séance : ${String(n.d)}${host ? `, chez ${host}` : n.location ? `, ${String(n.location)}` : ""}`);
      }
      if (row.minutes_hash) lines.push(`Empreinte du procès-verbal : ${String(row.minutes_hash).slice(0, 12)}… (à comparer dans KÓMBE)`);
      lines.push("KÓMBE tient le registre de notre groupe. Il ne garde pas notre argent.");
      return { text: lines.join("\n") };
    });
  }
}
