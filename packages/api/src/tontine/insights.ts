/**
 * KÓMBE @kombe/api — ce que les autres applications de tontine ne font pas :
 *
 *  - Simulateur de cycle avant création (dates réelles, cagnotte, fin du
 *    cycle) : on voit EXACTEMENT ce qu'on s'engage à faire.
 *  - « Mon tour » : quand je reçois, combien, et si la tontine m'avance de
 *    l'argent (je reçois avant d'avoir tout versé) ou si c'est moi qui avance
 *    au groupe — la vérité financière du njangi, dite simplement.
 *  - Régularité : part des échéances réglées à temps, retards, amendes en
 *    cours ; chacun voit la sienne, le bureau voit celle de tous.
 *  - Résumé de séance prêt pour WhatsApp, avec l'empreinte du procès-verbal
 *    que chacun peut comparer dans l'application.
 *  - Rappels automatiques (veille de séance, échéance proche) en boîte de
 *    réception, sans montant ni nom (écran verrouillé).
 */
import type pg from "pg";
import {
  DomainError,
  canAct,
  cycleSpanDays,
  describeCadence,
  lateness,
  meetingDates,
  type Cadence,
} from "@kombe/domain";
import { withGroupTx } from "../db/txContext.js";
import { notify, toBig, type TontineActor } from "./context.js";
import { loadGroup } from "./groups.js";

function isoDate(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function xaf(n: bigint): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/* ── Simulateur ───────────────────────────────────────────────────────── */

export function simulateCycle(input: {
  readonly cadence: Cadence;
  readonly startDate: string;
  readonly shares: number;
  readonly contributionPerShare: bigint;
}): unknown {
  if (!Number.isInteger(input.shares) || input.shares < 2 || input.shares > 400) {
    throw new DomainError("SHARES_INVALID", "De 2 à 400 parts");
  }
  if (input.contributionPerShare <= 0n) throw new DomainError("RULE_INVALID", "Cotisation invalide");
  const dates = meetingDates(input.cadence, input.startDate, input.shares);
  const pot = input.contributionPerShare * BigInt(input.shares);
  return {
    cadenceLabel: describeCadence(input.cadence, "fr"),
    meetings: dates.length,
    firstMeeting: dates[0],
    lastMeeting: dates[dates.length - 1],
    spanDays: cycleSpanDays(dates),
    potPerMeeting: pot.toString(),
    totalPerShare: (input.contributionPerShare * BigInt(input.shares)).toString(),
    dates,
    summary: `${dates.length} séances, ${describeCadence(input.cadence, "fr").toLowerCase()}, du ${dates[0]} au ${dates[dates.length - 1]}. Chaque part verse ${xaf(input.contributionPerShare)} par séance et reçoit une fois ${xaf(pot)}.`,
  };
}

/* ── « Mon tour » ─────────────────────────────────────────────────────── */

export async function myForecast(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown> {
  const rounds = await client.query(
    `SELECT r.seq, r.due_date_business, r.share_id, h.weight,
            (SELECT sum(h2.weight) FROM share_holder h2 WHERE h2.group_id = r.group_id AND h2.share_id = r.share_id) AS total_weight
       FROM round r JOIN share_holder h ON h.group_id = r.group_id AND h.share_id = r.share_id AND h.membership_id = $2
      WHERE r.group_id = $1 ORDER BY r.seq`,
    [groupId, actor.membershipId],
  );
  const dues = await client.query(
    `SELECT r.seq, o.due_amount, o.validated_net FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
      WHERE o.group_id = $1 AND o.member_membership_id = $2 ORDER BY r.seq`,
    [groupId, actor.membershipId],
  );
  const potRes = await client.query(
    `SELECT COALESCE(sum(o.due_amount), 0) AS pot, r.seq FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
      WHERE o.group_id = $1 GROUP BY r.seq ORDER BY r.seq`,
    [groupId],
  );
  const potBySeq = new Map((potRes.rows as { seq: number; pot: string }[]).map((r) => [Number(r.seq), toBig(r.pot)]));
  const totalDue = (dues.rows as { due_amount: string }[]).reduce((a, r) => a + toBig(r.due_amount), 0n);
  const paid = (dues.rows as { validated_net: string }[]).reduce((a, r) => a + toBig(r.validated_net), 0n);
  const turns = (rounds.rows as Record<string, unknown>[]).map((r) => {
    const seq = Number(r["seq"]);
    const pot = potBySeq.get(seq) ?? 0n;
    const share = (pot * BigInt(Number(r["weight"]))) / BigInt(Number(r["total_weight"] ?? 1));
    // Ce que j'aurai versé au moment de recevoir (séances 1..seq incluses).
    const paidBefore = (dues.rows as { seq: number; due_amount: string }[])
      .filter((d) => Number(d.seq) <= seq)
      .reduce((a, d) => a + toBig(d.due_amount), 0n);
    const advance = share - paidBefore;
    return {
      seq,
      date: r["due_date_business"] ? isoDate(r["due_date_business"]) : null,
      amount: share.toString(),
      paidBeforeReceiving: paidBefore.toString(),
      position: advance > 0n ? "group_advances_you" : advance < 0n ? "you_advance_group" : "even",
      advance: (advance < 0n ? -advance : advance).toString(),
      explanation:
        advance > 0n
          ? `Vous recevez ${xaf(share)} après avoir versé ${xaf(paidBefore)} : le groupe vous avance ${xaf(advance)}, que vous continuerez à verser ensuite.`
          : advance < 0n
            ? `Vous recevez ${xaf(share)} après avoir versé ${xaf(paidBefore)} : vous avez avancé ${xaf(-advance)} au groupe, il vous les rend à ce tour.`
            : `Vous recevez exactement ce que vous avez versé.`,
    };
  });
  return {
    totalDue: totalDue.toString(),
    validatedSoFar: paid.toString(),
    remaining: (totalDue - paid).toString(),
    turns,
  };
}

/* ── Régularité ───────────────────────────────────────────────────────── */

export async function regularity(client: pg.PoolClient, groupId: string, actor: TontineActor, nowMs: number): Promise<unknown[]> {
  const g = await loadGroup(client, groupId);
  const bureau = canAct(actor.roles, "fine.issue") || canAct(actor.roles, "movement.confirm") || canAct(actor.roles, "member.admit");
  const seeAll = bureau || g.settings.transparency === "all_members";
  const today = new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
  const obl = await client.query(
    `SELECT o.member_membership_id, m.display_name, r.due_date_business, o.due_amount, o.validated_net,
            (SELECT min(fm.alleged_date) FROM fund_movement fm WHERE fm.group_id = o.group_id AND fm.related_id = o.obligation_id
                AND fm.state IN ('confirmed','validated')) AS paid_on
       FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
       JOIN membership m ON m.group_id = o.group_id AND m.membership_id = o.member_membership_id
      WHERE o.group_id = $1 AND m.state = 'active' AND (r.due_date_business <= $2::date OR o.validated_net >= o.due_amount)`,
    [groupId, today],
  );
  const fines = await client.query(
    `SELECT membership_id, count(*) FILTER (WHERE state IN ('issued','contested'))::int AS open_fines FROM fine WHERE group_id = $1 GROUP BY membership_id`,
    [groupId],
  );
  const openFines = new Map((fines.rows as { membership_id: string; open_fines: number }[]).map((r) => [r.membership_id, r.open_fines]));
  const by = new Map<string, { name: string; due: number; onTime: number; late: number; unpaid: number }>();
  for (const r of obl.rows as Record<string, unknown>[]) {
    const id = String(r["member_membership_id"]);
    const cur = by.get(id) ?? { name: String(r["display_name"] ?? "Membre"), due: 0, onTime: 0, late: 0, unpaid: 0 };
    cur.due += 1;
    const dueDate = isoDate(r["due_date_business"]);
    const settled = toBig(r["validated_net"]) >= toBig(r["due_amount"]) || r["paid_on"] !== null;
    if (!settled) {
      if (lateness(dueDate, today, g.settings.fines.graceDays) === "late") cur.unpaid += 1;
    } else {
      const paidOn = r["paid_on"] ? isoDate(r["paid_on"]) : dueDate;
      if (lateness(dueDate, paidOn, g.settings.fines.graceDays) === "late") cur.late += 1;
      else cur.onTime += 1;
    }
    by.set(id, cur);
  }
  const out: unknown[] = [];
  for (const [membershipId, v] of by) {
    if (!seeAll && membershipId !== actor.membershipId) continue;
    const rate = v.due === 0 ? 100 : Math.round((v.onTime * 100) / v.due);
    out.push({
      membershipId,
      name: g.settings.transparency === "anonymized" && !bureau && membershipId !== actor.membershipId ? "Membre" : v.name,
      dueSoFar: v.due,
      onTime: v.onTime,
      late: v.late,
      unpaidLate: v.unpaid,
      openFines: openFines.get(membershipId) ?? 0,
      onTimeRate: rate,
      badge: v.due === 0 ? "nouveau" : rate >= 90 && v.unpaid === 0 ? "exemplaire" : rate >= 70 && v.unpaid === 0 ? "régulier" : v.unpaid > 0 ? "en retard" : "à suivre",
      isMe: membershipId === actor.membershipId,
    });
  }
  return out;
}

/* ── Résumé de séance pour WhatsApp ───────────────────────────────────── */

export async function meetingShareText(client: pg.PoolClient, groupId: string, actor: TontineActor, meetingId: string): Promise<{ text: string }> {
  const g = await loadGroup(client, groupId);
  const m = await client.query(`SELECT seq, scheduled_date, state, minutes_hash, location FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
  const row = m.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
  const att = await client.query(
    `SELECT count(*) FILTER (WHERE status IN ('present','late','represented'))::int AS present, count(*)::int AS total
       FROM attendance WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId],
  );
  const payout = await client.query(
    `SELECT mm.display_name, fm.amount, fm.state FROM fund_movement fm JOIN membership mm ON mm.group_id = fm.group_id AND mm.membership_id = fm.membership_id
      WHERE fm.group_id = $1 AND fm.meeting_id = $2 AND fm.kind = 'payout' AND fm.related_kind = 'payout' AND fm.state <> 'rejected'`,
    [groupId, meetingId],
  );
  const next = await client.query(
    `SELECT mt.scheduled_date, mt.location, h.display_name AS host FROM meeting mt
       LEFT JOIN membership h ON h.group_id = mt.group_id AND h.membership_id = mt.host_membership_id
      WHERE mt.group_id = $1 AND mt.seq > $2 AND mt.state IN ('planned','open') ORDER BY mt.seq LIMIT 1`,
    [groupId, row["seq"]],
  );
  const showNames = g.settings.transparency !== "anonymized" || actor.roles.some((r) => r !== "member");
  const lines: string[] = [];
  lines.push(`*${g.name}* — séance n° ${String(row["seq"])} du ${isoDate(row["scheduled_date"])}`);
  const a = att.rows[0] as { present: number; total: number } | undefined;
  if (a && a.total > 0) lines.push(`Présents : ${a.present}/${a.total}`);
  for (const p of payout.rows as Record<string, unknown>[]) {
    const who = showNames ? String(p["display_name"] ?? "le bénéficiaire") : "le bénéficiaire du tour";
    lines.push(`Remise : ${xaf(toBig(p["amount"]))} à ${who}${p["state"] === "declared" ? " (réception à confirmer)" : ""}`);
  }
  const n = next.rows[0] as Record<string, unknown> | undefined;
  if (n) {
    lines.push(`Prochaine séance : ${isoDate(n["scheduled_date"])}${n["host"] ? `, chez ${String(n["host"])}` : n["location"] ? `, ${String(n["location"])}` : ""}`);
  }
  if (row["minutes_hash"]) lines.push(`Empreinte du procès-verbal : ${String(row["minutes_hash"]).slice(0, 12)}… (à comparer dans KÓMBE)`);
  lines.push("KÓMBE tient le registre de notre groupe. Il ne garde pas notre argent.");
  return { text: lines.join("\n") };
}

/* ── Rappels automatiques (tâche planifiée) ───────────────────────────── */

/**
 * Crée les rappels de la veille (J-1) et de l'avant-veille (J-2) pour chaque
 * séance prévue : un rappel de séance pour tous, un rappel d'échéance pour
 * ceux qui n'ont pas encore déclaré leur cotisation. Idempotent (clé de
 * déduplication par séance et par jour). Les groupes concernés sont trouvés
 * par une fonction SECURITY DEFINER à sortie minimale (0026), puis chaque
 * groupe est traité dans SA transaction RLS.
 */
export async function runReminders(pool: pg.Pool, nowMs: number): Promise<{ groups: number; meetings: number }> {
  const today = new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
  const client = await pool.connect();
  let due: { group_id: string; meeting_id: string; scheduled_date: unknown; days_before: number }[];
  try {
    const res = await client.query(`SELECT * FROM kombe_upcoming_meetings($1::date, 2)`, [today]);
    due = res.rows as typeof due;
  } finally {
    client.release();
  }
  const groups = new Set<string>();
  for (const d of due) {
    groups.add(d.group_id);
    await withGroupTx(pool, d.group_id, async (c) => {
      const members = await c.query(`SELECT identity_id, membership_id FROM membership WHERE group_id = $1 AND state = 'active'`, [d.group_id]);
      const ids = (members.rows as { identity_id: string }[]).map((r) => r.identity_id);
      await notify(c, d.group_id, ids, "meeting_reminder", `group:${d.group_id}:meetings:${d.meeting_id}`, `remind:${d.meeting_id}:J-${d.days_before}`);
      const unpaid = await c.query(
        `SELECT DISTINCT m.identity_id FROM obligation o
           JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
           JOIN meeting mt ON mt.group_id = r.group_id AND mt.round_seq = r.seq
           JOIN membership m ON m.group_id = o.group_id AND m.membership_id = o.member_membership_id
          WHERE o.group_id = $1 AND mt.meeting_id = $2 AND o.active_reserved < o.due_amount`,
        [d.group_id, d.meeting_id],
      );
      await notify(c, d.group_id, (unpaid.rows as { identity_id: string }[]).map((r) => r.identity_id), "due_reminder", `group:${d.group_id}:obligations`, `due:${d.meeting_id}:J-${d.days_before}`);
    });
  }
  return { groups: groups.size, meetings: due.length };
}
