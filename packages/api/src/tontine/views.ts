/**
 * Lectures (projections) de l'API produit. Toujours dans la transaction du
 * groupe courant (RLS `tenant_isolation`) ; aucun total n'est stocké : tout
 * est recalculé depuis les mouvements, les tours et les parts.
 */
import {
  DomainError,
  lateness,
  memberDueForRound,
  movementSign,
  type DueView,
  type FundKind,
  type FundView,
  type GroupRole,
  type MeetingSummary,
  type MemberView,
  type MovementKind,
  type MovementView,
  type RoundView,
  type Share,
  type TontineSettings,
  type TontineState,
} from "@kombe/domain";
import { type Actor, type Db, isoDate, isoInstant, m, maskLogin, may, membershipsWithRoles, onlyHolderIsSubject } from "./infra.js";

export interface GroupRow {
  readonly groupId: string;
  readonly name: string;
  readonly state: TontineState;
  readonly settings: TontineSettings;
  readonly createdBy: string | null;
  readonly createdAt: string;
}

export async function loadGroup(db: Db, groupId: string, forUpdate = false): Promise<GroupRow> {
  const r = await db.query(
    `SELECT group_id, display_name AS name, state, settings, created_by_identity_id, created_at FROM "group" WHERE group_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [groupId],
  );
  const row = r.rows[0];
  if (!row || !row.settings || !row.settings.cadence) throw new DomainError("OBJET_INTROUVABLE", "Objet hors portée");
  return {
    groupId: String(row.group_id),
    name: String(row.name ?? ""),
    state: row.state as TontineState,
    settings: row.settings as TontineSettings,
    createdBy: row.created_by_identity_id ? String(row.created_by_identity_id) : null,
    createdAt: isoInstant(row.created_at) as string,
  };
}

/** Nom affiché de chaque adhésion et de chaque identité du groupe. */
export interface Names {
  readonly byMembership: ReadonlyMap<string, string>;
  readonly byIdentity: ReadonlyMap<string, string>;
  readonly identityOf: ReadonlyMap<string, string>;
  readonly membershipOf: ReadonlyMap<string, string>;
}

export async function loadNames(db: Db, groupId: string): Promise<Names> {
  const r = await db.query(`SELECT membership_id, identity_id, display_name, state FROM membership WHERE group_id = $1`, [groupId]);
  const byMembership = new Map<string, string>();
  const byIdentity = new Map<string, string>();
  const identityOf = new Map<string, string>();
  const membershipOf = new Map<string, string>();
  for (const row of r.rows) {
    const name = row.display_name ? String(row.display_name) : maskLogin(String(row.identity_id));
    byMembership.set(String(row.membership_id), name);
    identityOf.set(String(row.membership_id), String(row.identity_id));
    if (row.state === "active" || !byIdentity.has(String(row.identity_id))) {
      byIdentity.set(String(row.identity_id), name);
      membershipOf.set(String(row.identity_id), String(row.membership_id));
    }
  }
  return { byMembership, byIdentity, identityOf, membershipOf };
}

export async function cycleStarted(db: Db, groupId: string): Promise<boolean> {
  const r = await db.query(`SELECT state FROM cycle_schedule WHERE group_id = $1`, [groupId]);
  return r.rows[0]?.state === "started";
}

/** Cycle en cours : démarré et au moins un tour encore ouvert (entre deux cycles : faux). */
export async function cycleInProgress(db: Db, groupId: string): Promise<boolean> {
  if (!(await cycleStarted(db, groupId))) return false;
  const r = await db.query(`SELECT 1 FROM round WHERE group_id = $1 AND state = 'open' LIMIT 1`, [groupId]);
  return r.rows.length > 0;
}

/** Cycle courant (le dernier démarré) ; null avant le premier démarrage. */
export async function currentCycle(db: Db, groupId: string): Promise<{ number: number; firstSeq: number; lastSeq: number; finished: boolean } | null> {
  const r = await db.query(`SELECT cycle_no, first_seq, last_seq FROM tontine_cycle WHERE group_id = $1 ORDER BY cycle_no DESC LIMIT 1`, [groupId]);
  const row = r.rows[0];
  if (!row) return null;
  return { number: Number(row.cycle_no), firstSeq: Number(row.first_seq), lastSeq: Number(row.last_seq), finished: !(await cycleInProgress(db, groupId)) };
}

/** Titulaire d'une part sur une plage de tours (reprise de place, 0030). */
export interface ShareHolding {
  readonly shareId: string;
  readonly membershipId: string;
  readonly weight: number;
  readonly fromSeq: number;
  readonly untilSeq: number | null;
}

export async function loadShareHoldings(db: Db, groupId: string): Promise<ShareHolding[]> {
  const r = await db.query(
    `SELECT s.share_id, h.membership_id, h.weight, h.from_seq, h.until_seq FROM share s
       JOIN share_holder h ON h.group_id = s.group_id AND h.share_id = s.share_id
      WHERE s.group_id = $1 ORDER BY s.share_id, h.from_seq, h.membership_id`,
    [groupId],
  );
  return r.rows.map((row) => ({
    shareId: String(row.share_id),
    membershipId: String(row.membership_id),
    weight: Number(row.weight),
    fromSeq: Number(row.from_seq),
    untilSeq: row.until_seq === null || row.until_seq === undefined ? null : Number(row.until_seq),
  }));
}

/**
 * Parts et titulaires au tour `seq` (ou titulaires actuels si absent). Une
 * part sans titulaire à ce tour (place vacante après exclusion) disparaît :
 * elle ne doit rien et ne compte pas dans la remise attendue.
 */
export function sharesAt(holdings: readonly ShareHolding[], seq?: number): Share[] {
  const map = new Map<string, { membershipId: string; weight: number }[]>();
  for (const h of holdings) {
    const covers = seq === undefined ? h.untilSeq === null : h.fromSeq <= seq && (h.untilSeq === null || h.untilSeq >= seq);
    if (!covers) continue;
    const list = map.get(h.shareId) ?? [];
    list.push({ membershipId: h.membershipId, weight: h.weight });
    map.set(h.shareId, list);
  }
  return [...map.entries()].map(([shareId, holders]) => ({ shareId, holders }));
}

/** Parts du cycle démarré (L-14). Vide avant le démarrage. */
export async function loadShares(db: Db, groupId: string, seq?: number): Promise<Share[]> {
  return sharesAt(await loadShareHoldings(db, groupId), seq);
}

export async function loadMembers(db: Db, actor: Actor, opts: { readonly includeInactive?: boolean } = {}): Promise<MemberView[]> {
  // Entre deux cycles, on affiche les parts voulues pour le prochain.
  const started = await cycleInProgress(db, actor.groupId);
  const shares = started ? await loadShares(db, actor.groupId) : [];
  const shareCount = new Map<string, number>();
  for (const s of shares) for (const h of s.holders) shareCount.set(h.membershipId, (shareCount.get(h.membershipId) ?? 0) + 1);
  const rolesRes = await db.query(
    `SELECT membership_id, role, accepted_at IS NOT NULL AS accepted FROM role_assignment
      WHERE group_id = $1 AND ended_at IS NULL`,
    [actor.groupId],
  );
  const roles = new Map<string, GroupRole[]>();
  const pending = new Map<string, GroupRole[]>();
  for (const row of rolesRes.rows) {
    const target = row.accepted ? roles : pending;
    const list = target.get(String(row.membership_id)) ?? [];
    if (row.role !== "member" || row.accepted) list.push(row.role as GroupRole);
    target.set(String(row.membership_id), list.filter((x) => x !== "member"));
  }
  const r = await db.query(
    `SELECT membership_id, identity_id, display_name, state, sponsor_membership_id, proxy_membership_id, joined_at, share_count, share_partner_membership_id
       FROM membership WHERE group_id = $1 ${opts.includeInactive ? "" : "AND state IN ('active','pending')"}
      ORDER BY joined_at NULLS LAST, membership_id`,
    [actor.groupId],
  );
  const seeFull = may(actor, "member.admit") || may(actor, "group.manage") || may(actor, "movement.confirm");
  return r.rows.map((row) => {
    const id = String(row.membership_id);
    const login = String(row.identity_id);
    const isMe = id === actor.membershipId;
    const offline = login.startsWith("offline_");
    const memberRoles = roles.get(id) ?? [];
    return {
      membershipId: id,
      displayName: row.display_name ? String(row.display_name) : maskLogin(login),
      state: row.state,
      roles: memberRoles.length > 0 ? memberRoles : row.state === "active" ? (["member"] as GroupRole[]) : [],
      pendingRoles: pending.get(id) ?? [],
      login: offline ? null : isMe || seeFull ? login : maskLogin(login),
      isMe,
      sponsorMembershipId: row.sponsor_membership_id ? String(row.sponsor_membership_id) : null,
      proxyMembershipId: row.proxy_membership_id ? String(row.proxy_membership_id) : null,
      offline,
      joinedAt: isoInstant(row.joined_at),
      shares: started ? (shareCount.get(id) ?? 0) : Number(row.share_count ?? 1),
      sharePartnerMembershipId: row.share_partner_membership_id ? String(row.share_partner_membership_id) : null,
    } satisfies MemberView;
  });
}

/* ── Caisses ─────────────────────────────────────────────────────────── */

export interface FundRow {
  readonly fundId: string;
  readonly kind: FundKind;
  readonly name: string;
  readonly state: "active" | "closed";
  readonly perMeeting: bigint;
}

export async function loadFundRows(db: Db, groupId: string): Promise<FundRow[]> {
  const r = await db.query(`SELECT fund_id, kind, name, state, rules FROM fund WHERE group_id = $1 ORDER BY created_at, fund_id`, [groupId]);
  return r.rows.map((row) => ({
    fundId: String(row.fund_id),
    kind: row.kind as FundKind,
    name: String(row.name),
    state: row.state as "active" | "closed",
    perMeeting: BigInt(String(row.rules?.perMeeting ?? "0")),
  }));
}

export async function fundOfKind(db: Db, groupId: string, kind: FundKind): Promise<FundRow | null> {
  const funds = await loadFundRows(db, groupId);
  return funds.find((f) => f.kind === kind && f.state === "active") ?? null;
}

const IN_KINDS = ["contribution", "fine_payment", "advance_repayment", "transfer_in"];

/** Écart confirmé d'une caisse : entrées − sorties confirmées ou validées. */
export async function fundConfirmedBalance(db: Db, groupId: string, fundId: string): Promise<bigint> {
  const r = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN kind = ANY($3) THEN amount ELSE -amount END), 0)::text AS bal
       FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND state IN ('confirmed','validated')`,
    [groupId, fundId, IN_KINDS],
  );
  return BigInt(String(r.rows[0]?.bal ?? "0"));
}

export async function loadFunds(db: Db, groupId: string): Promise<FundView[]> {
  const funds = await loadFundRows(db, groupId);
  const r = await db.query(
    `SELECT fund_id,
            COALESCE(SUM(CASE WHEN state IN ('confirmed','validated') THEN (CASE WHEN kind = ANY($2) THEN amount ELSE -amount END) ELSE 0 END), 0)::text AS confirmed,
            COALESCE(SUM(CASE WHEN state = 'declared' AND kind = ANY($2) THEN amount ELSE 0 END), 0)::text AS pending_in
       FROM fund_movement WHERE group_id = $1 GROUP BY fund_id`,
    [groupId, IN_KINDS],
  );
  const sums = new Map(r.rows.map((x) => [String(x.fund_id), { c: String(x.confirmed), p: String(x.pending_in) }]));
  return funds.map((f) => ({
    fundId: f.fundId,
    kind: f.kind,
    name: f.name,
    state: f.state,
    confirmedBalance: sums.get(f.fundId)?.c ?? "0",
    pendingIn: sums.get(f.fundId)?.p ?? "0",
    perMeeting: m(f.perMeeting),
  }));
}

/* ── Tours ───────────────────────────────────────────────────────────── */

export interface RoundRow {
  readonly seq: number;
  readonly date: string;
  readonly state: "open" | "closed";
  readonly beneficiaryMembershipId: string | null;
  readonly shareId: string | null;
}

export async function loadRoundRows(db: Db, groupId: string): Promise<RoundRow[]> {
  const r = await db.query(
    `SELECT seq, due_date_business::text AS d, state, beneficiary_membership_id, share_id FROM round WHERE group_id = $1 ORDER BY seq`,
    [groupId],
  );
  return r.rows.map((row) => ({
    seq: Number(row.seq),
    date: String(row.d),
    state: row.state as "open" | "closed",
    beneficiaryMembershipId: row.beneficiary_membership_id ? String(row.beneficiary_membership_id) : null,
    shareId: row.share_id ? String(row.share_id) : null,
  }));
}

export async function loadRounds(db: Db, group: GroupRow): Promise<RoundView[]> {
  const rows = await loadRoundRows(db, group.groupId);
  if (rows.length === 0) return [];
  const names = await loadNames(db, group.groupId);
  const rotation = await fundOfKind(db, group.groupId, "rotation");
  const holdings = await loadShareHoldings(db, group.groupId);
  const perShare = BigInt(group.settings.contributionPerShare);
  const potAt = (seq: number): bigint => (holdings.length > 0 ? BigInt(sharesAt(holdings, seq).length) : BigInt(rows.length)) * perShare;
  const coll = await db.query(
    `SELECT round_seq, COALESCE(SUM(amount),0)::text AS s FROM fund_movement
      WHERE group_id = $1 AND fund_id = $2 AND kind = 'contribution' AND state IN ('confirmed','validated')
      GROUP BY round_seq`,
    [group.groupId, rotation?.fundId ?? ""],
  );
  const collected = new Map(coll.rows.map((x) => [Number(x.round_seq), String(x.s)]));
  const pay = await db.query(
    `SELECT round_seq, state, beneficiary_confirmed_at FROM fund_movement
      WHERE group_id = $1 AND fund_id = $2 AND kind = 'payout' AND related_kind = 'payout' AND state NOT IN ('rejected','compensated')`,
    [group.groupId, rotation?.fundId ?? ""],
  );
  const payout = new Map<number, RoundView["payoutState"]>();
  for (const p of pay.rows) {
    payout.set(Number(p.round_seq), p.beneficiary_confirmed_at ? "received" : p.state === "declared" ? "declared" : "confirmed");
  }
  const meetings = await db.query(`SELECT meeting_id, round_seq FROM meeting WHERE group_id = $1 AND round_seq IS NOT NULL`, [group.groupId]);
  const meetingOf = new Map(meetings.rows.map((x) => [Number(x.round_seq), String(x.meeting_id)]));
  return rows.map((r) => ({
    seq: r.seq,
    date: r.date,
    state: r.state,
    beneficiaryMembershipId: r.beneficiaryMembershipId,
    beneficiaryName: r.beneficiaryMembershipId ? (names.byMembership.get(r.beneficiaryMembershipId) ?? null) : null,
    meetingId: meetingOf.get(r.seq) ?? null,
    expectedPot: m(potAt(r.seq)),
    collected: collected.get(r.seq) ?? "0",
    payoutState: payout.get(r.seq) ?? "none",
  }));
}

/** Tour courant : le premier tour ouvert (ou null si tout est clos / non démarré). */
export function currentRound(rounds: readonly RoundView[]): RoundView | null {
  return rounds.find((r) => r.state === "open") ?? null;
}

/* ── Échéances ───────────────────────────────────────────────────────── */

/** Motif posé sur les dettes annulées avec la remise rejetée qui les avait ouvertes. */
export const PAYOUT_REJECTED_REASON = "Remise rejetée : écriture annulée";

interface PaidSums {
  confirmed: bigint;
  declared: bigint;
}

/**
 * Échéances d'un membre : rotation (selon ses quotes-parts) et caisses à
 * cotisation par séance, pour chaque tour échu et le prochain à venir.
 * `onlyOpen` : ne garde que ce qui reste à verser.
 */
export async function computeDues(
  db: Db,
  group: GroupRow,
  membershipId: string,
  today: string,
  opts: { readonly onlyOpen?: boolean; readonly roundSeq?: number } = {},
): Promise<DueView[]> {
  const rounds = await loadRoundRows(db, group.groupId);
  if (rounds.length === 0) return [];
  const funds = (await loadFundRows(db, group.groupId)).filter((f) => f.state === "active");
  const holdings = await loadShareHoldings(db, group.groupId);
  const perShare = BigInt(group.settings.contributionPerShare);
  const rotationDueAt = (seq: number): bigint => {
    const at = sharesAt(holdings, seq);
    return at.length > 0 ? (memberDueForRound(at, perShare).get(membershipId) ?? 0n) : 0n;
  };
  const mem = await db.query(`SELECT joined_at FROM membership WHERE group_id = $1 AND membership_id = $2`, [group.groupId, membershipId]);
  const joined = mem.rows[0]?.joined_at ? (isoInstant(mem.rows[0].joined_at) as string).slice(0, 10) : "0000-00-00";

  const paidRes = await db.query(
    `SELECT fund_id, round_seq, state, COALESCE(SUM(amount),0)::text AS s FROM fund_movement
      WHERE group_id = $1 AND membership_id = $2 AND kind = 'contribution' AND state IN ('declared','confirmed','validated')
        AND related_kind IS DISTINCT FROM 'debt'
      GROUP BY fund_id, round_seq, state`,
    [group.groupId, membershipId],
  );
  const paid = new Map<string, PaidSums>();
  for (const row of paidRes.rows) {
    const key = `${row.fund_id}|${row.round_seq}`;
    const cur = paid.get(key) ?? { confirmed: 0n, declared: 0n };
    if (row.state === "declared") cur.declared += BigInt(String(row.s));
    else cur.confirmed += BigInt(String(row.s));
    paid.set(key, cur);
  }

  // Part d'un tour « transférée » en dette (avance de caisse ou impayé suivi) :
  // elle se règle depuis l'écran des dettes, plus depuis les échéances.
  const tr = await db.query(
    `SELECT origin_ref, COALESCE(SUM(amount),0)::text AS s FROM member_debt
      WHERE group_id = $1 AND debtor_membership_id = $2 AND origin_ref LIKE 'round:%'
        AND NOT (state = 'written_off' AND write_off_reason = $3)
      GROUP BY origin_ref`,
    [group.groupId, membershipId, PAYOUT_REJECTED_REASON],
  );
  const transferred = new Map(tr.rows.map((x) => [Number(String(x.origin_ref).slice(6)), BigInt(String(x.s))]));
  const upcoming = rounds.find((r) => r.date > today);
  const relevant = rounds.filter((r) =>
    opts.roundSeq !== undefined ? r.seq === opts.roundSeq : r.date <= today || r.seq === upcoming?.seq,
  );
  const graceDays = group.settings.fines.graceDays;
  const out: DueView[] = [];
  for (const r of relevant) {
    for (const f of funds) {
      let due = 0n;
      if (f.kind === "rotation") due = rotationDueAt(r.seq);
      else if (f.perMeeting > 0n && r.date >= joined) due = f.perMeeting;
      if (due === 0n) continue;
      const p = paid.get(`${f.fundId}|${r.seq}`) ?? { confirmed: 0n, declared: 0n };
      const moved = f.kind === "rotation" ? (transferred.get(r.seq) ?? 0n) : 0n;
      const remaining = due - p.confirmed - p.declared - moved;
      const rem = remaining > 0n ? remaining : 0n;
      if (opts.onlyOpen && rem === 0n) continue;
      out.push({
        groupId: group.groupId,
        fundId: f.fundId,
        fundKind: f.kind,
        fundName: f.name,
        roundSeq: r.seq,
        date: r.date,
        due: m(due),
        confirmed: m(p.confirmed),
        declared: m(p.declared),
        remaining: m(rem),
        lateness: r.date > today ? "upcoming" : rem === 0n ? "on_time" : lateness(r.date, today, graceDays),
      });
    }
  }
  return out;
}

/* ── Mouvements ──────────────────────────────────────────────────────── */

export async function movementViews(
  db: Db,
  actor: Actor,
  filter: { readonly fundId?: string | undefined; readonly roundSeq?: number | undefined; readonly state?: string | undefined; readonly meetingId?: string | undefined; readonly movementIds?: readonly string[] | undefined; readonly membershipId?: string | undefined } = {},
): Promise<MovementView[]> {
  const where = ["mv.group_id = $1"];
  const args: unknown[] = [actor.groupId];
  if (filter.fundId) {
    args.push(filter.fundId);
    where.push(`mv.fund_id = $${args.length}`);
  }
  if (filter.roundSeq !== undefined) {
    args.push(filter.roundSeq);
    where.push(`mv.round_seq = $${args.length}`);
  }
  if (filter.state) {
    args.push(filter.state);
    where.push(`mv.state = $${args.length}`);
  }
  if (filter.meetingId) {
    args.push(filter.meetingId);
    where.push(`mv.meeting_id = $${args.length}`);
  }
  if (filter.movementIds) {
    args.push(filter.movementIds as string[]);
    where.push(`mv.movement_id = ANY($${args.length})`);
  }
  if (filter.membershipId) {
    args.push(filter.membershipId);
    where.push(`mv.membership_id = $${args.length}`);
  }
  const r = await db.query(
    `SELECT mv.*, f.kind AS fund_kind FROM fund_movement mv
       JOIN fund f ON f.group_id = mv.group_id AND f.fund_id = mv.fund_id
      WHERE ${where.join(" AND ")}
      ORDER BY mv.declared_at DESC, mv.movement_id LIMIT 500`,
    args,
  );
  const names = await loadNames(db, actor.groupId);
  const proxied = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND proxy_membership_id = $2`, [
    actor.groupId,
    actor.membershipId,
  ]);
  const represents = new Set(proxied.rows.map((x) => String(x.membership_id)));
  const treasuryRes = await db.query(
    `SELECT membership_id FROM role_assignment WHERE group_id = $1 AND role IN ('treasurer','treasurer_deputy') AND accepted_at IS NOT NULL AND ended_at IS NULL`,
    [actor.groupId],
  );
  const treasury = new Set(treasuryRes.rows.map((x) => String(x.membership_id)));
  const presidency = actor.membershipState === "active" && (actor.roles.includes("animator") || actor.roles.includes("vice_president"));
  const canConfirm = may(actor, "movement.confirm");
  const canControl = may(actor, "movement.control");
  // Suppléance : quand tous les commissaires sont la personne concernée, le censeur ou la présidence contrôle.
  const auditors = await membershipsWithRoles(db, actor.groupId, ["auditor"]);
  const controlSubstitute = actor.membershipState === "active" && actor.roles.some((r) => r === "censor" || r === "animator" || r === "vice_president");
  return r.rows.map((row) => {
    const declaredBy = String(row.declared_by_identity_id);
    const confirmedBy = row.confirmed_by_identity_id ? String(row.confirmed_by_identity_id) : null;
    const memberId = row.membership_id ? String(row.membership_id) : null;
    const kind = row.kind as MovementKind;
    const mine = memberId === actor.membershipId;
    const state = row.state as MovementView["state"];
    const isPayout = kind === "payout" || kind === "advance";
    return {
      movementId: String(row.movement_id),
      fundId: String(row.fund_id),
      fundKind: row.fund_kind as FundKind,
      kind,
      amount: String(row.amount),
      membershipId: memberId,
      memberName: memberId ? (names.byMembership.get(memberId) ?? null) : null,
      roundSeq: row.round_seq === null ? null : Number(row.round_seq),
      meetingId: row.meeting_id ? String(row.meeting_id) : null,
      state,
      channel: row.channel,
      reference: row.reference ?? null,
      payerNote: row.payer_note ?? null,
      declaredBy: names.membershipOf.get(declaredBy) ?? "",
      declaredByName: names.byIdentity.get(declaredBy) ?? null,
      declaredAt: isoInstant(row.declared_at) as string,
      confirmedByName: confirmedBy ? (names.byIdentity.get(confirmedBy) ?? null) : null,
      controlledByName: row.controlled_by_identity_id ? (names.byIdentity.get(String(row.controlled_by_identity_id)) ?? null) : null,
      rejectedReason: row.rejected_reason ?? null,
      relatedKind: row.related_kind ?? null,
      relatedId: row.related_id ?? null,
      witnesses: (row.witness_membership_ids as string[] | null ?? []).map((w) => names.byMembership.get(w) ?? w),
      beneficiaryConfirmedAt: isoInstant(row.beneficiary_confirmed_at),
      can: {
        confirm:
          (canConfirm || (presidency && memberId !== null && treasury.has(memberId))) &&
          state === "declared" && !isPayout && row.related_kind !== "advance" && declaredBy !== actor.identityId && !mine,
        control:
          (canControl || (controlSubstitute && onlyHolderIsSubject(auditors, memberId))) && state === "confirmed" && declaredBy !== actor.identityId && confirmedBy !== actor.identityId && !mine,
        reject: canConfirm && (state === "declared" || state === "confirmed") && declaredBy !== actor.identityId && !mine,
        acknowledge:
          kind === "payout" && state === "declared" && !row.beneficiary_confirmed_at && declaredBy !== actor.identityId &&
          (mine || (memberId !== null && represents.has(memberId))),
      },
    } satisfies MovementView;
  });
}

export function signedAmount(kind: MovementKind, amount: bigint): bigint {
  return BigInt(movementSign(kind)) * amount;
}

/* ── Séances ─────────────────────────────────────────────────────────── */

export async function meetingSummaries(db: Db, groupId: string, meetingId?: string): Promise<MeetingSummary[]> {
  const names = await loadNames(db, groupId);
  const r = await db.query(
    `SELECT meeting_id, seq, scheduled_date::text AS d, state, location, host_membership_id, round_seq, minutes_approved_at
       FROM meeting WHERE group_id = $1 ${meetingId ? "AND meeting_id = $2" : ""} ORDER BY seq`,
    meetingId ? [groupId, meetingId] : [groupId],
  );
  return r.rows.map((row) => ({
    meetingId: String(row.meeting_id),
    seq: Number(row.seq),
    date: String(row.d),
    state: row.state,
    location: row.location ?? null,
    hostName: row.host_membership_id ? (names.byMembership.get(String(row.host_membership_id)) ?? null) : null,
    roundSeq: row.round_seq === null ? null : Number(row.round_seq),
    minutesApproved: row.minutes_approved_at !== null,
  }));
}

export function nextMeeting(meetings: readonly MeetingSummary[], today: string): MeetingSummary | null {
  return (
    meetings.find((x) => x.state === "open") ??
    meetings.find((x) => x.state === "planned" && x.date >= today) ??
    meetings.find((x) => x.state === "planned") ??
    null
  );
}

export { isoDate };
