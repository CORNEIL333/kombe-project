/**
 * Cycle : tirage vérifiable, démarrage (parts, tours, séances), grille des
 * cotisations, remise devant témoins, clôture d'un tour, échanges de tour.
 */
import { randomBytes } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  assertPayoutWitnesses,
  deadlineUtcMs,
  drawCommitment,
  drawOrder,
  meetingDates,
  memberDueForRound,
  newcomersLast,
  planPayoutWithArrears,
  assertChannelReference,
  swapRounds,
  type Cadence,
  type MovementView,
  type OrderChangeView,
  type PayoutInput,
  type PayoutPolicy,
  type RoundGridView,
  type RoundView,
  type TontineDetail,
} from "@kombe/domain";
import {
  type Actor,
  type Db,
  activeMemberIdentities,
  appendEvent,
  groupActor,
  identitiesWithRoles,
  inTx,
  m,
  may,
  money,
  newId,
  notify,
  requireAct,
  sessionIdentity,
  todayDouala,
} from "./infra.js";
import {
  computeDues,
  cycleStarted,
  fundConfirmedBalance,
  fundOfKind,
  loadGroup,
  loadNames,
  loadRoundRows,
  loadRounds,
  loadShares,
  movementViews,
} from "./views.js";
import { tontineDetail } from "./groups.js";

export class CycleService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  /* ── Tirage vérifiable (commit → reveal) ──────────────────────────── */

  async createDraw(headers: Record<string, unknown>, groupId: string): Promise<{ drawId: string; commitment: string }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "schedule.manage");
      if (await cycleStarted(db, groupId)) throw new DomainError("SCHEDULE_FROZEN", "Cycle déjà démarré");
      const seed = randomBytes(24).toString("hex");
      const commitment = drawCommitment(seed);
      const drawId = newId("drw");
      await db.query(
        `INSERT INTO draw (draw_id, group_id, commitment, sealed_seed, committed_by_identity_id) VALUES ($1,$2,$3,$4,$5)`,
        [drawId, groupId, commitment, seed, actor.identityId],
      );
      await appendEvent(db, actor, "draw.committed", { drawId, commitment }, nowMs);
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "order_change", `/tontines/${groupId}/calendrier`, `draw:${drawId}`);
      return { drawId, commitment };
    });
  }

  async getDraw(headers: Record<string, unknown>, groupId: string, drawId: string): Promise<{ drawId: string; commitment: string; seed: string | null; result: string[] | null; resultNames: string[] | null }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const r = await db.query(`SELECT commitment, seed, result FROM draw WHERE group_id = $1 AND draw_id = $2`, [groupId, drawId]);
      if (!r.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Tirage introuvable");
      const names = await loadNames(db, groupId);
      const shares = await loadShares(db, groupId, 1);
      const holderOf = new Map(shares.map((s) => [s.shareId, s.holders[0]?.membershipId ?? ""]));
      const result = (r.rows[0].result as string[] | null) ?? null;
      return {
        drawId,
        commitment: String(r.rows[0].commitment),
        seed: r.rows[0].seed ?? null,
        result,
        resultNames: result ? result.map((s) => names.byMembership.get(holderOf.get(s) ?? "") ?? s) : null,
      };
    });
  }

  /* ── Démarrage du cycle ───────────────────────────────────────────── */

  async start(
    headers: Record<string, unknown>,
    groupId: string,
    input: { order: "draw" | "manual" | "join_order"; drawId?: string | undefined; membershipOrder?: readonly string[] | undefined },
  ): Promise<TontineDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "schedule.manage");
      const group = await loadGroup(db, groupId, true);
      if (group.state !== "configuration" || (await cycleStarted(db, groupId))) {
        throw new DomainError("SCHEDULE_FROZEN", "Cycle déjà démarré");
      }
      const members = await db.query(
        `SELECT membership_id, identity_id, share_count, joined_at, share_partner_membership_id FROM membership WHERE group_id = $1 AND state = 'active' ORDER BY joined_at, membership_id`,
        [groupId],
      );
      if (members.rows.length < 2) throw new DomainError("CYCLE_START_NOT_READY", "Au moins deux membres actifs");
      const treasurer = await identitiesWithRoles(db, groupId, ["treasurer", "treasurer_deputy"]);
      if (treasurer.length === 0) throw new DomainError("CYCLE_START_NOT_READY", "Désignez un trésorier avant de démarrer");
      // Statuts acceptés par chaque membre qui a un téléphone (L-12).
      const st = await db.query(`SELECT version FROM statutes_version WHERE group_id = $1 ORDER BY version DESC LIMIT 1`, [groupId]);
      if (!st.rows[0]) throw new DomainError("CYCLE_START_NOT_READY", "Générez les statuts et faites-les accepter");
      const missing = await db.query(
        `SELECT count(*) AS c FROM membership m
          WHERE m.group_id = $1 AND m.state = 'active' AND m.identity_id NOT LIKE 'offline\\_%'
            AND NOT EXISTS (SELECT 1 FROM statutes_acceptance a WHERE a.group_id = m.group_id AND a.version = $2 AND a.identity_id = m.identity_id)`,
        [groupId, st.rows[0].version],
      );
      if (Number(missing.rows[0]?.c ?? 0) > 0) {
        throw new DomainError("RULES_NOT_ACCEPTED", "Tous les membres doivent accepter la dernière version des statuts");
      }

      // Parts : une ligne par « main » voulue par chaque membre (L-14) ; deux
      // membres qui partagent une part (« demi-main ») la tiennent ensemble,
      // chacun pour moitié.
      const holders: { shareId: string; membershipId: string; joinedAt: string; partnerId: string | null }[] = [];
      const activeIds = new Set(members.rows.map((x) => String(x.membership_id)));
      const paired = new Set<string>();
      for (const row of members.rows) {
        const id = String(row.membership_id);
        const partner = row.share_partner_membership_id ? String(row.share_partner_membership_id) : null;
        const joinedAt = new Date(row.joined_at as string).toISOString().slice(0, 10);
        if (partner) {
          if (!activeIds.has(partner)) throw new DomainError("SHARES_INVALID", "Part partagée avec un membre inactif");
          if (paired.has(id)) continue;
          paired.add(id).add(partner);
          holders.push({ shareId: newId("shr"), membershipId: id, joinedAt, partnerId: partner });
          continue;
        }
        const n = Number(row.share_count ?? 1);
        for (let i = 1; i <= n; i++) holders.push({ shareId: newId("shr"), membershipId: id, joinedAt, partnerId: null });
      }
      if (holders.length < 2) throw new DomainError("CYCLE_START_NOT_READY", "Au moins deux parts");
      if (holders.length > 60) throw new DomainError("SHARES_INVALID", "Au plus 60 parts par cycle");
      for (const [i, h] of holders.entries()) {
        await db.query(`INSERT INTO share (share_id, group_id, label) VALUES ($1,$2,$3)`, [h.shareId, groupId, h.partnerId ? `Part ${i + 1} (partagée)` : `Part ${i + 1}`]);
        await db.query(`INSERT INTO share_holder (group_id, share_id, membership_id, weight) VALUES ($1,$2,$3,1)`, [groupId, h.shareId, h.membershipId]);
        if (h.partnerId) {
          await db.query(`INSERT INTO share_holder (group_id, share_id, membership_id, weight) VALUES ($1,$2,$3,1)`, [groupId, h.shareId, h.partnerId]);
        }
      }

      // Ordre de passage.
      let order: string[];
      let drawBody: Record<string, unknown> = {};
      const ids = holders.map((h) => h.shareId);
      if (input.order === "manual") {
        const wanted = input.membershipOrder ?? [];
        if (wanted.length !== holders.length) throw new DomainError("SCHEDULE_ROUNDS_MISMATCH", "Un tour par part : liste incomplète");
        const pool = new Map<string, string[]>();
        for (const h of holders) pool.set(h.membershipId, [...(pool.get(h.membershipId) ?? []), h.shareId]);
        order = wanted.map((mid) => {
          const list = pool.get(mid);
          const s = list?.shift();
          if (!s) throw new DomainError("SCHEDULE_MEMBER_UNKNOWN", "Membre ou nombre de parts incohérent");
          return s;
        });
      } else if (input.order === "draw") {
        if (!input.drawId) throw new DomainError("DRAW_INVALID", "Tirage manquant");
        const d = await db.query(`SELECT commitment, sealed_seed, revealed_at FROM draw WHERE group_id = $1 AND draw_id = $2 FOR UPDATE`, [groupId, input.drawId]);
        const draw = d.rows[0];
        if (!draw || draw.revealed_at || !draw.sealed_seed) throw new DomainError("DRAW_INVALID", "Tirage déjà utilisé ou inconnu");
        const seed = String(draw.sealed_seed);
        order = ids.length >= 2 ? drawOrder(seed, String(draw.commitment), ids) : ids;
        await db.query(`UPDATE draw SET seed = $3, sealed_seed = NULL, revealed_at = now(), result = $4 WHERE group_id = $1 AND draw_id = $2`, [
          groupId,
          input.drawId,
          seed,
          order,
        ]);
        drawBody = { drawId: input.drawId, seed, commitment: String(draw.commitment) };
      } else {
        order = ids;
      }
      if (group.settings.newcomersLast && input.order !== "manual") {
        // Ordre de confiance : membres admis après la première version des statuts en dernier.
        const first = await db.query(`SELECT published_at::date::text AS d FROM statutes_version WHERE group_id = $1 ORDER BY version LIMIT 1`, [groupId]);
        const cutoff = String(first.rows[0]?.d ?? "9999-12-31");
        const joinedAt = Object.fromEntries(holders.map((h) => [h.shareId, h.joinedAt]));
        order = newcomersLast(order, joinedAt, cutoff);
      }

      // Calendrier réel (L-03) : une séance par tour, heure limite à Douala.
      const dates = meetingDates(group.settings.cadence as Cadence, group.settings.firstMeetingDate, order.length);
      const rv = await db.query(`SELECT max(rules_version) AS v FROM rule_version WHERE group_id = $1`, [groupId]);
      const rulesVersion = Number(rv.rows[0]?.v ?? 1);
      const holderOf = new Map(holders.map((h) => [h.shareId, h.membershipId]));
      for (const [i, shareId] of order.entries()) {
        const seq = i + 1;
        const date = dates[i] as string;
        await db.query(
          `INSERT INTO round (round_id, group_id, seq, state, beneficiary_membership_id, due_date_business, due_at_utc, rules_version, share_id)
           VALUES ($1,$2,$3,'open',$4,$5,$6,$7,$8)`,
          [newId("rnd"), groupId, seq, holderOf.get(shareId), date, new Date(deadlineUtcMs(date, group.settings.deadlineTime)), rulesVersion, shareId],
        );
        await db.query(
          `INSERT INTO meeting (meeting_id, group_id, seq, scheduled_date, location, host_membership_id, round_seq) VALUES ($1,$2,$3,$4,$5,$6,$3)`,
          [newId("mtg"), groupId, seq, date, group.settings.meetingPlace, holderOf.get(shareId)],
        );
      }
      await db.query(
        `INSERT INTO cycle_schedule (group_id, rules_version, frequency, state, started_at, cadence) VALUES ($1,$2,$3,'started',now(),$4::jsonb)`,
        [groupId, rulesVersion, (group.settings.cadence as Cadence).kind, JSON.stringify(group.settings.cadence)],
      );
      await db.query(`UPDATE "group" SET state = 'active', version = version + 1 WHERE group_id = $1`, [groupId]);
      await appendEvent(
        db,
        actor,
        "cycle.started",
        { order: input.order, rounds: order.length, firstDate: dates[0], lastDate: dates[dates.length - 1], ...drawBody },
        nowMs,
      );
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "general", `/tontines/${groupId}/calendrier`, `cycle:${groupId}`);
      return tontineDetail(db, actor, nowMs);
    });
  }

  async rounds(headers: Record<string, unknown>, groupId: string): Promise<RoundView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      return loadRounds(db, await loadGroup(db, groupId));
    });
  }

  /** Grille « qui a cotisé » d'un tour, filtrée par la règle de transparence (L-18). */
  async grid(headers: Record<string, unknown>, groupId: string, seq: number): Promise<RoundGridView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const group = await loadGroup(db, groupId);
      const rounds = await loadRoundRows(db, groupId);
      if (!rounds.some((r) => r.seq === seq)) throw new DomainError("OBJET_INTROUVABLE", "Tour introuvable");
      const rotation = await fundOfKind(db, groupId, "rotation");
      const shares = await loadShares(db, groupId, seq);
      const dueMap = memberDueForRound(shares, BigInt(group.settings.contributionPerShare));
      const names = await loadNames(db, groupId);
      const sums = await db.query(
        `SELECT membership_id, state, COALESCE(SUM(amount),0)::text AS s FROM fund_movement
          WHERE group_id = $1 AND fund_id = $2 AND round_seq = $3 AND kind = 'contribution' AND state IN ('declared','confirmed','validated')
          GROUP BY membership_id, state`,
        [groupId, rotation?.fundId ?? "", seq],
      );
      const per = new Map<string, { c: bigint; d: bigint }>();
      for (const row of sums.rows) {
        const cur = per.get(String(row.membership_id)) ?? { c: 0n, d: 0n };
        if (row.state === "declared") cur.d += BigInt(String(row.s));
        else cur.c += BigInt(String(row.s));
        per.set(String(row.membership_id), cur);
      }
      const bureau = may(actor, "movement.confirm") || may(actor, "group.manage") || may(actor, "movement.control");
      const t = group.settings.transparency;
      const rows = [...dueMap.entries()].map(([mid, due]) => {
        const p = per.get(mid) ?? { c: 0n, d: 0n };
        const status: "paid" | "partial" | "declared" | "unpaid" =
          p.c >= due ? "paid" : p.c > 0n ? "partial" : p.d > 0n ? "declared" : "unpaid";
        const visible = t === "all_members" || bureau || mid === actor.membershipId;
        const named = t !== "anonymized" || bureau || mid === actor.membershipId;
        return {
          membershipId: visible && named ? mid : null,
          displayName: visible && named ? (names.byMembership.get(mid) ?? null) : null,
          due: m(due),
          confirmed: visible ? m(p.c) : "0",
          declared: visible ? m(p.d) : "0",
          status,
          _visible: visible,
        };
      });
      const summary = {
        paid: rows.filter((r) => r.status === "paid").length,
        partial: rows.filter((r) => r.status === "partial" || r.status === "declared").length,
        unpaid: rows.filter((r) => r.status === "unpaid").length,
        total: rows.length,
      };
      return {
        seq,
        transparency: t,
        rows: rows.filter((r) => r._visible || t === "anonymized").map(({ _visible, ...r }) => r),
        summary,
      };
    });
  }

  /* ── Remise du tour devant témoins (L-06, I-12) ───────────────────── */

  async payout(headers: Record<string, unknown>, groupId: string, seq: number, input: PayoutInput): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "movement.confirm");
      const group = await loadGroup(db, groupId);
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':payout'))", [groupId]);
      const r = await db.query(`SELECT seq, state, beneficiary_membership_id FROM round WHERE group_id = $1 AND seq = $2`, [groupId, seq]);
      const round = r.rows[0];
      if (!round) throw new DomainError("OBJET_INTROUVABLE", "Tour introuvable");
      if (round.state !== "open") throw new DomainError("STATE_CONFLICT", "Tour déjà clos");
      const beneficiary = String(round.beneficiary_membership_id);
      if (beneficiary === actor.membershipId) {
        throw new DomainError("APPROVER_NOT_DISTINCT", "Le bénéficiaire ne déclare pas sa propre remise : le trésorier adjoint s'en charge");
      }
      // Place vacante (membre exclu ou parti) : une reprise de place doit d'abord être votée.
      const bstate = await db.query(`SELECT state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, beneficiary]);
      if (bstate.rows[0]?.state !== "active") {
        throw new DomainError("DECISION_STATE_INVALID", "Place vacante : faites voter une reprise de place avant la remise");
      }
      // Suspension du droit de bouffer votée et non levée (L-09).
      const susp = await db.query(
        `SELECT 1 FROM group_decision WHERE group_id = $1 AND kind = 'payout_suspension' AND state = 'adopted' AND target_membership_id = $2`,
        [groupId, beneficiary],
      );
      if (susp.rows.length > 0) throw new DomainError("PAYOUT_SUSPENDED", "Droit de bouffer suspendu par vote de l'assemblée");
      const rotation = await fundOfKind(db, groupId, "rotation");
      if (!rotation) throw new DomainError("FUND_INVALID", "Caisse de rotation absente");
      const prior = await db.query(
        `SELECT 1 FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND kind = 'payout' AND related_kind = 'payout' AND round_seq = $3 AND state NOT IN ('rejected','compensated')`,
        [groupId, rotation.fundId, seq],
      );
      if (prior.rows.length > 0) throw new DomainError("STATE_CONFLICT", "Remise déjà déclarée pour ce tour");
      assertChannelReference({ channel: input.channel, reference: input.reference ?? null, justification: input.justification ?? null });

      // Séance : témoins présents exigés quand la remise a lieu en séance.
      const mt = await db.query(`SELECT meeting_id, state FROM meeting WHERE group_id = $1 AND round_seq = $2`, [groupId, seq]);
      const meeting = input.meetingId
        ? (await db.query(`SELECT meeting_id, state FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, input.meetingId])).rows[0]
        : mt.rows[0];
      const inMeeting = meeting?.state === "open";
      if (inMeeting && group.settings.payoutWitnesses > 0) {
        const present = await db.query(
          `SELECT membership_id FROM attendance WHERE group_id = $1 AND meeting_id = $2 AND status IN ('present','late','represented')`,
          [groupId, meeting.meeting_id],
        );
        assertPayoutWitnesses({
          beneficiaryMembershipId: beneficiary,
          declarantMembershipId: actor.membershipId,
          witnessMembershipIds: input.witnessMembershipIds,
          presentMembershipIds: present.rows.map((x) => String(x.membership_id)),
          minimumWitnesses: group.settings.payoutWitnesses,
        });
      } else if (!inMeeting && input.channel === "cash" && group.settings.payoutWitnesses > 0) {
        throw new DomainError("WITNESS_REQUIRED", "Une remise en espèces se fait en séance ouverte, devant témoins");
      }

      // Impayés du tour : avance du fonds de caisse, remise réduite ou attente.
      const shares = await loadShares(db, groupId, seq);
      const perShare = BigInt(group.settings.contributionPerShare);
      const expectedPot = BigInt(shares.length) * perShare;
      const dueMap = memberDueForRound(shares, perShare);
      const conf = await db.query(
        `SELECT membership_id, COALESCE(SUM(amount),0)::text AS s FROM fund_movement
          WHERE group_id = $1 AND fund_id = $2 AND round_seq = $3 AND kind = 'contribution' AND state IN ('confirmed','validated')
          GROUP BY membership_id`,
        [groupId, rotation.fundId, seq],
      );
      const paid = new Map(conf.rows.map((x) => [String(x.membership_id), BigInt(String(x.s))]));
      let collected = 0n;
      const arrears: { membershipId: string; missing: bigint }[] = [];
      for (const [mid, due] of dueMap) {
        const p = paid.get(mid) ?? 0n;
        const counted = p > due ? due : p;
        collected += counted;
        if (counted < due) arrears.push({ membershipId: mid, missing: due - counted });
      }
      const policy: PayoutPolicy = input.policy ?? group.settings.payoutPolicy;
      const operating = await fundOfKind(db, groupId, "operating");
      const plan = planPayoutWithArrears({
        policy,
        expectedPot,
        validatedCollected: collected,
        arrears,
        advanceFundId: operating?.fundId ?? null,
      });
      if (plan.advanceAmount > 0n && operating) {
        const bal = await fundConfirmedBalance(db, groupId, operating.fundId);
        if (bal < plan.advanceAmount) {
          throw new DomainError("FUND_INVALID", "Le fonds de caisse ne couvre pas l'avance : remise réduite ou attente");
        }
      }
      const amount = input.amount !== undefined ? money(input.amount) : plan.payoutAmount;
      if (amount <= 0n || amount > plan.payoutAmount) throw new DomainError("FUND_INVALID", "Montant de remise incohérent avec la collecte");

      const movementId = newId("mvt");
      await db.query(
        `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, membership_id, meeting_id, round_seq, channel, reference, justification,
                                    declared_by_identity_id, related_kind, related_id, witness_membership_ids)
         VALUES ($1,$2,$3,'payout',$4,$5,$6,$7,$8,$9,$10,$11,'payout',$12,$13)`,
        [
          movementId, groupId, rotation.fundId, m(amount), beneficiary, meeting?.meeting_id ?? null, seq, input.channel,
          input.reference ?? null, input.justification ?? null, actor.identityId, `round:${seq}`, [...input.witnessMembershipIds],
        ],
      );
      if (plan.advanceAmount > 0n && operating) {
        // Avance du fonds de caisse vers la cagnotte (écriture tracée, ADR-0030).
        await db.query(
          `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, meeting_id, round_seq, channel, justification,
                                      declared_by_identity_id, related_kind, related_id)
           VALUES ($1,$2,$3,'advance',$4,$5,$6,'other','Avance pour la remise du tour',$7,'advance',$8)`,
          [newId("mvt"), groupId, operating.fundId, m(plan.advanceAmount), meeting?.meeting_id ?? null, seq, actor.identityId, movementId],
        );
        // Contrepartie dans la cagnotte : l'avance entre en rotation (pas de double compte).
        await db.query(
          `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, meeting_id, round_seq, channel, justification,
                                      declared_by_identity_id, related_kind, related_id)
           VALUES ($1,$2,$3,'transfer_in',$4,$5,$6,'other','Avance reçue du fonds de caisse',$7,'advance',$8)`,
          [newId("mvt"), groupId, rotation.fundId, m(plan.advanceAmount), meeting?.meeting_id ?? null, seq, actor.identityId, movementId],
        );
      }
      const sponsors = await db.query(`SELECT membership_id, sponsor_membership_id FROM membership WHERE group_id = $1`, [groupId]);
      const sponsorOf = new Map(sponsors.rows.map((x) => [String(x.membership_id), x.sponsor_membership_id ? String(x.sponsor_membership_id) : null]));
      for (const d of plan.debts) {
        await db.query(
          `INSERT INTO member_debt (debt_id, group_id, debtor_membership_id, origin, origin_ref, amount, creditor_fund_id, guarantor_membership_id, created_by_identity_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            newId("dbt"), groupId, d.membershipId, d.creditorFundId ? "fund_advance" : "unpaid_obligation", `round:${seq}`, m(d.amount),
            d.creditorFundId ?? rotation.fundId, group.settings.guarantorRequired ? (sponsorOf.get(d.membershipId) ?? null) : null, actor.identityId,
          ],
        );
      }
      await appendEvent(
        db,
        actor,
        "payout.declared",
        { movementId, seq, beneficiary, amount: m(amount), policy, advance: m(plan.advanceAmount), debts: plan.debts.length, witnesses: [...input.witnessMembershipIds] },
        nowMs,
      );
      const names = await loadNames(db, groupId);
      const benIdentity = names.identityOf.get(beneficiary);
      const proxy = await db.query(`SELECT proxy_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, beneficiary]);
      const proxyIdentity = proxy.rows[0]?.proxy_membership_id ? names.identityOf.get(String(proxy.rows[0].proxy_membership_id)) : undefined;
      await notify(db, groupId, [benIdentity, proxyIdentity].filter((x): x is string => !!x), "payout_recorded", `/tontines/${groupId}`, `payout:${movementId}`);
      const view = await movementViews(db, actor, { movementIds: [movementId] });
      return view[0] as MovementView;
    });
  }

  async closeRound(headers: Record<string, unknown>, groupId: string, seq: number): Promise<RoundView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "meeting.manage");
      const group = await loadGroup(db, groupId);
      const r = await db.query(`SELECT state FROM round WHERE group_id = $1 AND seq = $2 FOR UPDATE`, [groupId, seq]);
      if (!r.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Tour introuvable");
      if (r.rows[0].state !== "open") throw new DomainError("STATE_CONFLICT", "Tour déjà clos");
      const rotation = await fundOfKind(db, groupId, "rotation");
      const pay = await db.query(
        `SELECT beneficiary_confirmed_at FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND kind = 'payout' AND related_kind = 'payout' AND round_seq = $3 AND state NOT IN ('rejected','compensated')`,
        [groupId, rotation?.fundId ?? "", seq],
      );
      if (!pay.rows[0] || !pay.rows[0].beneficiary_confirmed_at) {
        throw new DomainError("STATE_CONFLICT", "Le bénéficiaire doit d'abord confirmer la réception de la remise");
      }
      // Impayés restants (non couverts par une dette déjà ouverte) → dettes suivies (I-12).
      const today = todayDouala(nowMs);
      const mem = await db.query(`SELECT membership_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
      let opened = 0;
      for (const row of mem.rows) {
        const mid = String(row.membership_id);
        const dues = await computeDues(db, group, mid, today, { roundSeq: seq });
        for (const d of dues.filter((x) => x.fundKind === "rotation" && BigInt(x.remaining) > 0n)) {
          const has = await db.query(
            `SELECT 1 FROM member_debt WHERE group_id = $1 AND debtor_membership_id = $2 AND origin_ref = $3 AND state = 'open'`,
            [groupId, mid, `round:${seq}`],
          );
          if (has.rows.length > 0) continue;
          await db.query(
            `INSERT INTO member_debt (debt_id, group_id, debtor_membership_id, origin, origin_ref, amount, creditor_fund_id, created_by_identity_id)
             VALUES ($1,$2,$3,'unpaid_obligation',$4,$5,$6,$7)`,
            [newId("dbt"), groupId, mid, `round:${seq}`, d.remaining, d.fundId, actor.identityId],
          );
          opened += 1;
        }
      }
      await db.query(`UPDATE round SET state = 'closed' WHERE group_id = $1 AND seq = $2`, [groupId, seq]);
      const left = await db.query(`SELECT count(*) AS c FROM round WHERE group_id = $1 AND state = 'open'`, [groupId]);
      if (Number(left.rows[0]?.c ?? 0) === 0) {
        await db.query(`UPDATE "group" SET state = 'closed', version = version + 1 WHERE group_id = $1 AND state = 'active'`, [groupId]);
      }
      await appendEvent(db, actor, "round.closed", { seq, debtsOpened: opened }, nowMs);
      const rounds = await loadRounds(db, await loadGroup(db, groupId));
      return rounds.find((x) => x.seq === seq) as RoundView;
    });
  }

  /* ── Échange de tour (L-13) ───────────────────────────────────────── */

  private async changeViews(db: Db, actor: Actor, changeId?: string): Promise<OrderChangeView[]> {
    const names = await loadNames(db, actor.groupId);
    const r = await db.query(
      `SELECT * FROM order_change WHERE group_id = $1 ${changeId ? "AND change_id = $2" : ""} ORDER BY created_at DESC LIMIT 100`,
      changeId ? [actor.groupId, changeId] : [actor.groupId],
    );
    return r.rows.map((row) => {
      const required = (row.required_identity_ids as string[]) ?? [];
      const accepted = (row.accepted_identity_ids as string[]) ?? [];
      return {
        changeId: String(row.change_id),
        kind: row.kind,
        seqA: Number(row.seq_a),
        seqB: Number(row.seq_b),
        reason: row.reason ?? null,
        state: row.state,
        requiredNames: required.map((i) => names.byIdentity.get(i) ?? ""),
        acceptedNames: accepted.map((i) => names.byIdentity.get(i) ?? ""),
        needsMyAcceptance: row.state === "requested" && required.includes(actor.identityId) && !accepted.includes(actor.identityId),
      };
    });
  }

  async orderChanges(headers: Record<string, unknown>, groupId: string): Promise<OrderChangeView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => this.changeViews(db, await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId)));
  }

  async requestSwap(headers: Record<string, unknown>, groupId: string, input: { seqA: number; seqB: number; reason?: string | undefined }): Promise<OrderChangeView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "order.swap.request");
      const rounds = await loadRoundRows(db, groupId);
      const a = rounds.find((r) => r.seq === input.seqA);
      const b = rounds.find((r) => r.seq === input.seqB);
      if (!a || !b || a.state !== "open" || b.state !== "open") throw new DomainError("ORDER_CHANGE_INVALID", "Seuls deux tours ouverts s'échangent");
      const names = await loadNames(db, groupId);
      const required = [a.beneficiaryMembershipId, b.beneficiaryMembershipId].map((x) => names.identityOf.get(x ?? "") ?? "");
      if (required.some((x) => !x) || required[0] === required[1]) throw new DomainError("ORDER_CHANGE_INVALID", "Même titulaire");
      // Un membre sans téléphone accepte par son représentant.
      const resolved: string[] = [];
      for (const [i, id] of required.entries()) {
        if (!id.startsWith("offline_")) {
          resolved.push(id);
          continue;
        }
        const mid = i === 0 ? a.beneficiaryMembershipId : b.beneficiaryMembershipId;
        const p = await db.query(`SELECT proxy_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, mid]);
        resolved.push(names.identityOf.get(String(p.rows[0]?.proxy_membership_id ?? "")) ?? id);
      }
      const changeId = newId("chg");
      const accepted = resolved.includes(actor.identityId) ? [actor.identityId] : [];
      await db.query(
        `INSERT INTO order_change (change_id, group_id, kind, seq_a, seq_b, reason, required_identity_ids, accepted_identity_ids, requested_by_identity_id)
         VALUES ($1,$2,'swap',$3,$4,$5,$6,$7,$8)`,
        [changeId, groupId, input.seqA, input.seqB, input.reason ?? null, resolved, accepted, actor.identityId],
      );
      await appendEvent(db, actor, "order.swap_requested", { changeId, seqA: input.seqA, seqB: input.seqB }, nowMs);
      await notify(db, groupId, resolved.filter((x) => x !== actor.identityId), "order_change", `/tontines/${groupId}/calendrier`, `swap:${changeId}`);
      return (await this.changeViews(db, actor, changeId))[0] as OrderChangeView;
    });
  }

  async acceptSwap(headers: Record<string, unknown>, groupId: string, changeId: string): Promise<OrderChangeView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const r = await db.query(`SELECT * FROM order_change WHERE group_id = $1 AND change_id = $2 FOR UPDATE`, [groupId, changeId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      if (row.state !== "requested") throw new DomainError("ORDER_CHANGE_INVALID", "Demande déjà traitée");
      const required = row.required_identity_ids as string[];
      if (!required.includes(actor.identityId)) throw new DomainError("TONTINE_FORBIDDEN", "Vous n'êtes pas concerné par cet échange");
      const accepted = new Set([...(row.accepted_identity_ids as string[]), actor.identityId]);
      await db.query(`UPDATE order_change SET accepted_identity_ids = $3, version = version + 1 WHERE group_id = $1 AND change_id = $2`, [
        groupId,
        changeId,
        [...accepted],
      ]);
      await appendEvent(db, actor, "order.swap_accepted", { changeId }, nowMs);
      if (required.every((x) => accepted.has(x))) {
        const admins = await identitiesWithRoles(db, groupId, ["animator", "vice_president", "secretary"]);
        await notify(db, groupId, admins.filter((x) => !required.includes(x)), "order_change", `/tontines/${groupId}/calendrier`, `swap-ready:${changeId}`);
      }
      return (await this.changeViews(db, actor, changeId))[0] as OrderChangeView;
    });
  }

  async approveSwap(headers: Record<string, unknown>, groupId: string, changeId: string): Promise<OrderChangeView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "order.manage");
      const r = await db.query(`SELECT * FROM order_change WHERE group_id = $1 AND change_id = $2 FOR UPDATE`, [groupId, changeId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      if (row.state !== "requested") throw new DomainError("ORDER_CHANGE_INVALID", "Demande déjà traitée");
      const required = row.required_identity_ids as string[];
      if (required.includes(actor.identityId)) throw new DomainError("APPROVER_NOT_DISTINCT", "Un membre concerné n'approuve pas son propre échange");
      const accepted = row.accepted_identity_ids as string[];
      if (!required.every((x) => accepted.includes(x))) throw new DomainError("ORDER_CHANGE_INVALID", "Les deux titulaires doivent d'abord accepter");
      const rounds = await loadRoundRows(db, groupId);
      const rotation = await fundOfKind(db, groupId, "rotation");
      const paidRes = await db.query(
        `SELECT DISTINCT round_seq FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND kind = 'payout' AND state NOT IN ('rejected','compensated')`,
        [groupId, rotation?.fundId ?? ""],
      );
      const paidSeqs = new Set(paidRes.rows.map((x) => Number(x.round_seq)));
      const slots = rounds.map((x) => ({ seq: x.seq, holder: `${x.beneficiaryMembershipId}|${x.shareId}`, paid: x.state === "closed" || paidSeqs.has(x.seq) }));
      const next = swapRounds(slots, Number(row.seq_a), Number(row.seq_b));
      await db.query("SELECT set_config('kombe.order_change', 'approved', true)");
      for (const s of next.filter((x) => x.seq === Number(row.seq_a) || x.seq === Number(row.seq_b))) {
        const [mid, share] = s.holder.split("|");
        await db.query(`UPDATE round SET beneficiary_membership_id = $3, share_id = $4 WHERE group_id = $1 AND seq = $2`, [
          groupId,
          s.seq,
          mid,
          share === "null" ? null : share,
        ]);
        await db.query(`UPDATE meeting SET host_membership_id = $3 WHERE group_id = $1 AND round_seq = $2 AND state = 'planned'`, [groupId, s.seq, mid]);
      }
      await db.query(
        `UPDATE order_change SET state = 'applied', approved_by_identity_id = $3, applied_at = now(), version = version + 1 WHERE group_id = $1 AND change_id = $2`,
        [groupId, changeId, actor.identityId],
      );
      await appendEvent(db, actor, "order.swap_applied", { changeId, seqA: Number(row.seq_a), seqB: Number(row.seq_b) }, nowMs);
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "order_change", `/tontines/${groupId}/calendrier`, `swap-applied:${changeId}`);
      return (await this.changeViews(db, actor, changeId))[0] as OrderChangeView;
    });
  }
}
