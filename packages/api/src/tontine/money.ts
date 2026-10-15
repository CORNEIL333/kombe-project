/**
 * Registre de l'argent du groupe (L-03, L-07, L-08, I-12) : déclarations,
 * confirmations par la trésorerie, contrôle par le commissaire aux comptes,
 * rejets motivés, accusé de réception des remises par le bénéficiaire.
 *
 * KÓMBE ne garde pas l'argent : chaque ligne trace ce qu'une personne dit
 * avoir versé ou remis, puis qui l'a confirmé et qui l'a contrôlé. Les
 * effets liés (amende payée, dette réglée) ne s'appliquent qu'à la
 * confirmation, et se défont si le mouvement est rejeté ensuite.
 */
import type pg from "pg";
import {
  DomainError,
  planReserveDistribution,
  type PaymentChannel,
  assertChannelReference,
  confirmMovement,
  controlMovement,
  rejectMovement,
  type DeclareMovementInput,
  type DueView,
  type FundView,
  type MovementState,
  type MovementView,
} from "@kombe/domain";
import {
  type Actor,
  type Db,
  appendEvent,
  groupActor,
  identitiesWithRoles,
  inTx,
  m,
  may,
  membershipsWithRoles,
  money,
  newId,
  notify,
  onlyHolderIsSubject,
  requireAct,
  scopeGroup,
  sessionIdentity,
  todayDouala,
} from "./infra.js";
import {
  PAYOUT_REJECTED_REASON,
  computeDues,
  fundConfirmedBalance,
  fundOfKind,
  loadFundRows,
  loadFunds,
  loadGroup,
  loadNames,
  movementViews,
  type GroupRow,
} from "./views.js";

export interface ReserveDistributionView {
  readonly year: number;
  /** Disponible dans la réserve avant cette redistribution (confirmé, moins les sorties déclarées). */
  readonly available: string;
  /** Vrai si la réserve ne couvrait pas tout : partage au prorata. */
  readonly shortfall: boolean;
  readonly movements: readonly MovementView[];
  /** Remises que cette personne ne peut pas déclarer (la sienne, ou déjà faite cette année). */
  readonly waiting: readonly { readonly membershipId: string; readonly name: string | null; readonly amount: string; readonly reason: string }[];
}

const SIDE_FUND_KINDS = ["rotation", "solidarity", "operating", "year_end_reserve"];

/** Le contrôle par un commissaire est exigé dès qu'un commissaire est en fonction. */
export async function controlRequired(db: Db, groupId: string): Promise<boolean> {
  return (await identitiesWithRoles(db, groupId, ["auditor"])).length > 0;
}

interface MovementRow {
  readonly movementId: string;
  readonly fundId: string;
  readonly kind: string;
  readonly amount: bigint;
  readonly membershipId: string | null;
  readonly state: MovementState;
  readonly declaredBy: string;
  readonly confirmedBy: string | null;
  readonly relatedKind: string | null;
  readonly relatedId: string | null;
  readonly roundSeq: number | null;
  readonly beneficiaryConfirmedAt: string | null;
}

async function lockMovement(db: Db, groupId: string, movementId: string): Promise<MovementRow> {
  const r = await db.query(`SELECT * FROM fund_movement WHERE group_id = $1 AND movement_id = $2 FOR UPDATE`, [groupId, movementId]);
  const row = r.rows[0];
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Mouvement introuvable");
  return {
    movementId: String(row.movement_id),
    fundId: String(row.fund_id),
    kind: String(row.kind),
    amount: BigInt(String(row.amount)),
    membershipId: row.membership_id ? String(row.membership_id) : null,
    state: row.state as MovementState,
    declaredBy: String(row.declared_by_identity_id),
    confirmedBy: row.confirmed_by_identity_id ? String(row.confirmed_by_identity_id) : null,
    relatedKind: row.related_kind ? String(row.related_kind) : null,
    relatedId: row.related_id ? String(row.related_id) : null,
    roundSeq: row.round_seq === null ? null : Number(row.round_seq),
    beneficiaryConfirmedAt: row.beneficiary_confirmed_at ? String(row.beneficiary_confirmed_at) : null,
  };
}

/** Effets liés à la confirmation : amende payée, dette réglée (même transaction). */
async function applyLinkedEffects(db: Db, groupId: string, mv: MovementRow): Promise<void> {
  if (mv.relatedKind === "fine" && mv.relatedId) {
    const f = await db.query(`SELECT state, amount FROM fine WHERE group_id = $1 AND fine_id = $2 FOR UPDATE`, [groupId, mv.relatedId]);
    if (!f.rows[0] || f.rows[0].state !== "issued") throw new DomainError("STATE_CONFLICT", "Amende déjà réglée, contestée ou annulée");
    await db.query(`UPDATE fine SET state = 'paid', movement_id = $3, version = version + 1 WHERE group_id = $1 AND fine_id = $2`, [
      groupId,
      mv.relatedId,
      mv.movementId,
    ]);
  }
  if (mv.relatedKind === "debt" && mv.relatedId) {
    const d = await db.query(`SELECT amount, settled, state FROM member_debt WHERE group_id = $1 AND debt_id = $2 FOR UPDATE`, [groupId, mv.relatedId]);
    const row = d.rows[0];
    if (!row || row.state !== "open") throw new DomainError("STATE_CONFLICT", "Dette déjà close");
    const settled = BigInt(String(row.settled)) + mv.amount;
    const amount = BigInt(String(row.amount));
    if (settled > amount) throw new DomainError("DEBT_INVALID", "Règlement supérieur à la dette");
    await db.query(
      `UPDATE member_debt SET settled = $3, state = $4, closed_at = CASE WHEN $4 = 'settled' THEN now() ELSE NULL END, version = version + 1
        WHERE group_id = $1 AND debt_id = $2`,
      [groupId, mv.relatedId, m(settled), settled === amount ? "settled" : "open"],
    );
  }
}

/** Rejet après confirmation : on défait les effets liés. */
async function undoLinkedEffects(db: Db, groupId: string, mv: MovementRow): Promise<void> {
  if (mv.relatedKind === "fine" && mv.relatedId) {
    await db.query(
      `UPDATE fine SET state = 'issued', movement_id = NULL, version = version + 1 WHERE group_id = $1 AND fine_id = $2 AND movement_id = $3`,
      [groupId, mv.relatedId, mv.movementId],
    );
  }
  if (mv.relatedKind === "debt" && mv.relatedId) {
    await db.query(
      `UPDATE member_debt SET settled = settled - $3, state = 'open', closed_at = NULL, version = version + 1
        WHERE group_id = $1 AND debt_id = $2 AND state IN ('open','settled')`,
      [groupId, mv.relatedId, m(mv.amount)],
    );
  }
}

/** Adhésions qui tiennent la trésorerie (trésorier, adjoint). */
export async function treasuryMemberships(db: Db, groupId: string): Promise<Set<string>> {
  const r = await db.query(
    `SELECT membership_id FROM role_assignment WHERE group_id = $1 AND role IN ('treasurer','treasurer_deputy') AND accepted_at IS NOT NULL AND ended_at IS NULL`,
    [groupId],
  );
  return new Set(r.rows.map((x) => String(x.membership_id)));
}

const PRESIDENCY_ROLES = ["animator", "vice_president"] as const;
const CONTROL_SUBSTITUTE_ROLES = ["censor", "animator", "vice_president"] as const;

function holds(actor: Actor, roles: readonly string[]): boolean {
  return actor.membershipState === "active" && actor.roles.some((r) => roles.includes(r));
}

/**
 * Qui déclare une remise (tour ou secours) : la trésorerie, jamais le
 * bénéficiaire lui-même. Quand toute la trésorerie est le bénéficiaire
 * (trésorier unique qui bouffe), la présidence déclare à sa place.
 */
export async function mayDeclarePayout(db: Db, actor: Actor, groupId: string, beneficiaryMembershipId: string): Promise<boolean> {
  if (beneficiaryMembershipId === actor.membershipId) return false;
  if (may(actor, "movement.confirm")) return true;
  const treasury = await membershipsWithRoles(db, groupId, ["treasurer", "treasurer_deputy"]);
  return holds(actor, PRESIDENCY_ROLES) && onlyHolderIsSubject(treasury, beneficiaryMembershipId);
}

export async function assertMayDeclarePayout(db: Db, actor: Actor, groupId: string, beneficiaryMembershipId: string): Promise<void> {
  if (beneficiaryMembershipId === actor.membershipId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "Le bénéficiaire ne déclare pas sa propre remise");
  }
  if (!(await mayDeclarePayout(db, actor, groupId, beneficiaryMembershipId))) requireAct(actor, "movement.confirm");
}

/**
 * Qui contrôle un mouvement : le commissaire, jamais sur son propre
 * mouvement. Quand tous les commissaires sont la personne concernée, le
 * censeur ou la présidence contrôle à leur place.
 */
export async function mayControl(db: Db, actor: Actor, groupId: string, subjectMembershipId: string | null): Promise<boolean> {
  if (subjectMembershipId !== null && subjectMembershipId === actor.membershipId) return false;
  if (may(actor, "movement.control")) return true;
  if (!holds(actor, CONTROL_SUBSTITUTE_ROLES)) return false;
  return onlyHolderIsSubject(await membershipsWithRoles(db, groupId, ["auditor"]), subjectMembershipId);
}

async function isProxyOf(db: Db, groupId: string, proxyMembershipId: string, membershipId: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND membership_id = $2 AND proxy_membership_id = $3`, [
    groupId,
    membershipId,
    proxyMembershipId,
  ]);
  return r.rows.length > 0;
}

export class MoneyService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  private async actor(db: Db, headers: Record<string, unknown>, groupId: string, nowMs: number): Promise<Actor> {
    return groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
  }

  async funds(headers: Record<string, unknown>, groupId: string): Promise<FundView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await this.actor(db, headers, groupId, nowMs);
      return loadFunds(db, groupId);
    });
  }

  async movements(
    headers: Record<string, unknown>,
    groupId: string,
    filter: { fundId?: string | undefined; roundSeq?: number | undefined; state?: string | undefined; meetingId?: string | undefined; mine?: boolean | undefined },
  ): Promise<MovementView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      return movementViews(db, actor, { ...filter, membershipId: filter.mine ? actor.membershipId : undefined });
    });
  }

  /** Échéances ouvertes de la personne connectée (toutes ses associations, ou une seule). */
  async myDues(headers: Record<string, unknown>, groupId?: string): Promise<DueView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, nowMs);
      const r = await db.query(`SELECT group_id, membership_id FROM kombe_my_memberships() WHERE membership_state = 'active'`);
      const out: DueView[] = [];
      for (const row of r.rows) {
        const gid = String(row.group_id);
        if (groupId && gid !== groupId) continue;
        await scopeGroup(db, gid);
        let group: GroupRow;
        try {
          group = await loadGroup(db, gid);
        } catch {
          continue;
        }
        out.push(...(await computeDues(db, group, String(row.membership_id), todayDouala(nowMs), { onlyOpen: true })));
      }
      return out.sort((a, b) => (a.date === b.date ? a.fundName.localeCompare(b.fundName) : a.date.localeCompare(b.date)));
    });
  }

  async declare(headers: Record<string, unknown>, groupId: string, input: DeclareMovementInput): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "movement.declare");
      const group = await loadGroup(db, groupId);
      if (group.state !== "active" && input.kind !== "expense" && input.kind !== "fee") {
        throw new DomainError("STATE_CONFLICT", "Les cotisations commencent au démarrage du cycle");
      }
      let amount = money(input.amount);
      if (amount <= 0n) throw new DomainError("MONEY_NOT_INTEGER", "Montant positif attendu");
      let kind: string = input.kind;
      let fundId = input.fundId;
      let roundSeq: number | null = input.roundSeq ?? null;
      let relatedKind: string | null = input.relatedKind ?? null;
      const relatedId: string | null = input.relatedId ?? null;
      let memberId = input.membershipId ?? actor.membershipId;

      // Pour qui ? Soi-même, un membre que l'on représente, ou tout membre pour la trésorerie.
      if (memberId !== actor.membershipId && !may(actor, "movement.confirm") && !(await isProxyOf(db, groupId, actor.membershipId, memberId))) {
        throw new DomainError("TONTINE_FORBIDDEN", "Vous déclarez pour vous-même ou pour un membre que vous représentez");
      }

      if (relatedKind === "debt") {
        if (!relatedId) throw new DomainError("DEBT_INVALID", "Dette à régler non précisée");
        const d = await db.query(`SELECT * FROM member_debt WHERE group_id = $1 AND debt_id = $2`, [groupId, relatedId]);
        const debt = d.rows[0];
        if (!debt || debt.state !== "open") throw new DomainError("DEBT_INVALID", "Dette introuvable ou déjà close");
        memberId = String(debt.debtor_membership_id);
        if (memberId !== actor.membershipId && !may(actor, "movement.confirm") && !(await isProxyOf(db, groupId, actor.membershipId, memberId))) {
          throw new DomainError("TONTINE_FORBIDDEN", "Cette dette n'est pas la vôtre");
        }
        const pending = await db.query(
          `SELECT COALESCE(SUM(amount),0)::text AS s FROM fund_movement WHERE group_id = $1 AND related_kind = 'debt' AND related_id = $2 AND state = 'declared'`,
          [groupId, relatedId],
        );
        const left = BigInt(String(debt.amount)) - BigInt(String(debt.settled)) - BigInt(String(pending.rows[0]?.s ?? "0"));
        if (amount > left) throw new DomainError("DEBT_INVALID", `Il reste ${left} FCFA à régler sur cette dette (déclarations en attente comprises)`);
        // Routage : une avance se rembourse au fonds qui l'a faite ; un impayé revient à la rotation.
        fundId = String(debt.creditor_fund_id);
        if (debt.origin === "fund_advance") {
          kind = "advance_repayment";
        } else {
          kind = "contribution";
          const ref = String(debt.origin_ref ?? "");
          roundSeq = ref.startsWith("round:") ? Number(ref.slice(6)) : null;
        }
      }

      const funds = await loadFundRows(db, groupId);
      const fund = funds.find((f) => f.fundId === fundId);
      if (!fund || fund.state !== "active") throw new DomainError("FUND_INVALID", "Caisse introuvable ou fermée");
      if (fund.kind === "loan" || fund.kind === "collector") throw new DomainError("FUND_INVALID", "Cette caisse n'est pas ouverte");

      if (kind === "fine_payment") {
        if (fund.kind !== "fines" || relatedKind !== "fine" || !relatedId) {
          throw new DomainError("FINE_INVALID", "Une amende se paie dans la caisse des amendes, en citant l'amende");
        }
        const f = await db.query(`SELECT membership_id, amount, state FROM fine WHERE group_id = $1 AND fine_id = $2`, [groupId, relatedId]);
        const fine = f.rows[0];
        if (!fine || fine.state !== "issued") throw new DomainError("FINE_INVALID", "Amende introuvable, contestée ou déjà réglée");
        memberId = String(fine.membership_id);
        if (memberId !== actor.membershipId && !may(actor, "movement.confirm") && !(await isProxyOf(db, groupId, actor.membershipId, memberId))) {
          throw new DomainError("TONTINE_FORBIDDEN", "Cette amende n'est pas la vôtre");
        }
        const pend = await db.query(
          `SELECT 1 FROM fund_movement WHERE group_id = $1 AND related_kind = 'fine' AND related_id = $2 AND state = 'declared'`,
          [groupId, relatedId],
        );
        if (pend.rows.length > 0) throw new DomainError("STATE_CONFLICT", "Paiement de cette amende déjà déclaré");
        amount = BigInt(String(fine.amount));
      } else if (kind === "contribution") {
        if (!SIDE_FUND_KINDS.includes(fund.kind)) throw new DomainError("FUND_INVALID", "Cette caisse ne reçoit pas de cotisation");
        if (relatedKind !== "debt") {
          relatedKind = null;
          const open = await computeDues(db, group, memberId, todayDouala(nowMs), { onlyOpen: true });
          const mine = open.filter((d) => d.fundId === fund.fundId && (roundSeq === null || d.roundSeq === roundSeq));
          const target = mine[0];
          if (!target) throw new DomainError("STATE_CONFLICT", "Rien à verser sur cette caisse pour ce tour");
          roundSeq = target.roundSeq;
          if (amount > BigInt(target.remaining)) {
            throw new DomainError("STATE_CONFLICT", `Il reste ${target.remaining} FCFA à verser pour le tour ${target.roundSeq}`);
          }
        }
      } else if (kind === "advance_repayment") {
        if (relatedKind !== "debt") throw new DomainError("DEBT_INVALID", "Un remboursement cite la dette concernée");
      } else if (kind === "expense" || kind === "fee") {
        requireAct(actor, "fund.manage");
        if (fund.kind === "rotation") throw new DomainError("FUND_INVALID", "La cagnotte ne sert qu'aux remises");
        if (!input.justification || input.justification.trim().length < 3) {
          throw new DomainError("FUND_INVALID", "Une dépense se justifie (objet, facture)");
        }
        const bal = await fundConfirmedBalance(db, groupId, fund.fundId);
        if (bal < amount) throw new DomainError("FUND_INVALID", "Le total confirmé de la caisse ne couvre pas cette dépense");
        memberId = actor.membershipId;
        relatedKind = null;
      } else {
        throw new DomainError("FUND_INVALID", "Type de mouvement non déclarable ici");
      }

      assertChannelReference({ channel: input.channel, reference: input.reference ?? null, justification: input.justification ?? null });
      let meetingId = input.meetingId ?? null;
      if (meetingId) {
        const mt = await db.query(`SELECT 1 FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
        if (mt.rows.length === 0) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
      } else {
        const mt = await db.query(`SELECT meeting_id FROM meeting WHERE group_id = $1 AND state = 'open' ORDER BY seq LIMIT 1`, [groupId]);
        meetingId = mt.rows[0] ? String(mt.rows[0].meeting_id) : null;
      }
      const movementId = newId("mvt");
      await db.query(
        `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, membership_id, meeting_id, round_seq, channel, reference,
                                    justification, payer_note, alleged_date, declared_by_identity_id, related_kind, related_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          movementId, groupId, fund.fundId, kind, m(amount), memberId, meetingId, roundSeq, input.channel, input.reference ?? null,
          input.justification ?? null, input.payerNote ?? null, input.allegedDate ?? null, actor.identityId,
          relatedKind, relatedKind ? relatedId : null,
        ],
      );
      await appendEvent(db, actor, "movement.declared", { movementId, fundId: fund.fundId, kind, amount: m(amount), membershipId: memberId, roundSeq, relatedKind, relatedId }, nowMs);
      const treasury = await identitiesWithRoles(db, groupId, ["treasurer", "treasurer_deputy"]);
      await notify(db, groupId, treasury.filter((i) => i !== actor.identityId), "validation_waiting", `/tontines/${groupId}/argent`, `declared:${movementId}`);
      return (await movementViews(db, actor, { movementIds: [movementId] }))[0] as MovementView;
    });
  }

  /** Confirmation groupée par la trésorerie (fin de séance : « tout est reçu »). */
  async confirm(headers: Record<string, unknown>, groupId: string, movementIds: readonly string[]): Promise<MovementView[]> {
    const nowMs = this.now();
    if (movementIds.length === 0 || movementIds.length > 200) throw new DomainError("STATE_CONFLICT", "Entre 1 et 200 mouvements");
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const treasury = await treasuryMemberships(db, groupId);
      const presidency = actor.roles.includes("animator") || actor.roles.includes("vice_president");
      if (!may(actor, "movement.confirm") && !presidency) requireAct(actor, "movement.confirm");
      const control = await controlRequired(db, groupId);
      for (const id of [...new Set(movementIds)].sort()) {
        const mv = await lockMovement(db, groupId, id);
        // Les versements de la trésorerie elle-même sont confirmés par la présidence.
        if (!may(actor, "movement.confirm") && !(mv.membershipId && treasury.has(mv.membershipId))) {
          throw new DomainError("TONTINE_FORBIDDEN", "Confirmation réservée à la trésorerie");
        }
        if (mv.kind === "payout" || mv.kind === "advance" || mv.relatedKind === "advance") {
          throw new DomainError("STATE_CONFLICT", "Une remise est confirmée par son bénéficiaire");
        }
        if (mv.membershipId === actor.membershipId) {
          throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "On ne confirme pas son propre versement");
        }
        const next = confirmMovement(mv.state, { declarantIdentityId: mv.declaredBy, confirmerIdentityId: null, controllerIdentityId: null }, actor.identityId, control);
        await db.query(
          `UPDATE fund_movement SET state = $3, confirmed_by_identity_id = $4, confirmed_at = $5, version = version + 1 WHERE group_id = $1 AND movement_id = $2`,
          [groupId, id, next.state, actor.identityId, new Date(nowMs)],
        );
        await applyLinkedEffects(db, groupId, mv);
      }
      await appendEvent(db, actor, "movement.confirmed", { movementIds: [...movementIds], controlRequired: control }, nowMs);
      if (control) {
        const auditors = await identitiesWithRoles(db, groupId, ["auditor"]);
        await notify(db, groupId, auditors, "validation_waiting", `/tontines/${groupId}/argent`, `toControl:${movementIds[0]}:${movementIds.length}`);
      }
      return movementViews(db, actor, { movementIds });
    });
  }

  async control(headers: Record<string, unknown>, groupId: string, movementId: string): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const mv = await lockMovement(db, groupId, movementId);
      if (mv.membershipId === actor.membershipId) throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "On ne contrôle pas son propre mouvement");
      if (!(await mayControl(db, actor, groupId, mv.membershipId))) requireAct(actor, "movement.control");
      const next = controlMovement(mv.state, { declarantIdentityId: mv.declaredBy, confirmerIdentityId: mv.confirmedBy, controllerIdentityId: null }, actor.identityId);
      await db.query(
        `UPDATE fund_movement SET state = $3, controlled_by_identity_id = $4, controlled_at = $5, version = version + 1 WHERE group_id = $1 AND movement_id = $2`,
        [groupId, movementId, next.state, actor.identityId, new Date(nowMs)],
      );
      await appendEvent(db, actor, "movement.validated", { movementId }, nowMs);
      return (await movementViews(db, actor, { movementIds: [movementId] }))[0] as MovementView;
    });
  }

  async reject(headers: Record<string, unknown>, groupId: string, movementId: string, reason: string): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const mv = await lockMovement(db, groupId, movementId);
      const isPayout = mv.kind === "payout" && mv.relatedKind === "payout";
      const beneficiarySide =
        mv.kind === "payout" && mv.membershipId !== null && (mv.membershipId === actor.membershipId || (await isProxyOf(db, groupId, actor.membershipId, mv.membershipId)));
      if (!beneficiarySide) {
        requireAct(actor, "movement.confirm");
        if (mv.declaredBy === actor.identityId) throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "On ne rejette pas sa propre déclaration : annulez-la avec la trésorerie");
        if (mv.membershipId === actor.membershipId) throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "On ne rejette pas son propre versement");
      }
      if (mv.kind === "advance" || mv.relatedKind === "advance") throw new DomainError("STATE_CONFLICT", "L'avance suit sa remise");
      if (mv.kind === "payout" && mv.beneficiaryConfirmedAt) throw new DomainError("STATE_CONFLICT", "Réception déjà confirmée par le bénéficiaire");
      const next = rejectMovement(mv.state, reason);
      if (mv.state !== "declared") await undoLinkedEffects(db, groupId, mv);
      await db.query(
        `UPDATE fund_movement SET state = $3, rejected_reason = $4, version = version + 1 WHERE group_id = $1 AND movement_id = $2`,
        [groupId, movementId, next.state, reason.trim().slice(0, 500)],
      );
      if (mv.kind === "payout" && mv.relatedKind === "aid" && mv.relatedId) {
        await db.query(
          `UPDATE aid_request SET state = 'approved', movement_id = NULL, version = version + 1 WHERE group_id = $1 AND aid_id = $2 AND movement_id = $3`,
          [groupId, mv.relatedId, movementId],
        );
      }
      if (isPayout && mv.roundSeq !== null) {
        // La remise tombe : l'avance et les dettes qu'elle avait ouvertes aussi.
        const paid = await db.query(
          `SELECT 1 FROM member_debt WHERE group_id = $1 AND origin_ref = $2 AND state <> 'written_off' AND settled > 0`,
          [groupId, `round:${mv.roundSeq}`],
        );
        if (paid.rows.length > 0) throw new DomainError("STATE_CONFLICT", "Des remboursements liés à cette remise existent déjà");
        await db.query(
          `UPDATE fund_movement SET state = 'rejected', rejected_reason = $3, version = version + 1
            WHERE group_id = $1 AND related_kind = 'advance' AND related_id = $2 AND state = 'declared'`,
          [groupId, movementId, "Remise rejetée"],
        );
        await db.query(
          `UPDATE member_debt SET state = 'written_off', write_off_reason = $3, decided_by_identity_id = $4, closed_at = now(), version = version + 1
            WHERE group_id = $1 AND origin_ref = $2 AND state = 'open'`,
          [groupId, `round:${mv.roundSeq}`, PAYOUT_REJECTED_REASON, actor.identityId],
        );
      }
      await appendEvent(db, actor, "movement.rejected", { movementId, reason: reason.trim().slice(0, 500) }, nowMs);
      const names = await loadNames(db, groupId);
      const declarant = mv.declaredBy;
      const member = mv.membershipId ? names.identityOf.get(mv.membershipId) : undefined;
      await notify(db, groupId, [declarant, member].filter((x): x is string => !!x && x !== actor.identityId), "general", `/tontines/${groupId}/argent`, `rejected:${movementId}`);
      return (await movementViews(db, actor, { movementIds: [movementId] }))[0] as MovementView;
    });
  }

  /**
   * Redistribution de la réserve de fin d'année (ADR-0039) : chacun reprend ce
   * qu'il a versé et qui ne lui a pas encore été rendu, au prorata si la caisse
   * est courte. Une remise par membre et par exercice, déclarée par la
   * trésorerie et accusée par le membre, comme toute remise. La remise d'un
   * membre de la trésorerie est déclarée par un autre (adjoint ou présidence) :
   * elle reste « à déclarer » dans la réponse.
   */
  async distributeReserve(
    headers: Record<string, unknown>,
    groupId: string,
    input: { channel: PaymentChannel; reference?: string | undefined; justification?: string | undefined },
  ): Promise<ReserveDistributionView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const presidency = holds(actor, PRESIDENCY_ROLES);
      if (!may(actor, "movement.confirm") && !presidency) requireAct(actor, "movement.confirm");
      assertChannelReference({ channel: input.channel, reference: input.reference ?? null, justification: input.justification ?? null });
      const fund = await fundOfKind(db, groupId, "year_end_reserve");
      if (!fund || fund.state !== "active") throw new DomainError("FUND_INVALID", "Cette association n'a pas de réserve de fin d'année");
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':reserve'))", [groupId]);
      const year = Number(todayDouala(nowMs).slice(0, 4));
      const sums = await db.query(
        `SELECT mv.membership_id,
                COALESCE(SUM(mv.amount) FILTER (WHERE mv.kind = 'contribution' AND mv.state IN ('confirmed','validated')), 0)::text AS put,
                COALESCE(SUM(mv.amount) FILTER (WHERE mv.kind = 'payout' AND mv.related_kind = 'reserve' AND mv.state NOT IN ('rejected','compensated')), 0)::text AS back,
                bool_or(mv.kind = 'payout' AND mv.related_kind = 'reserve' AND mv.related_id = $3 AND mv.state NOT IN ('rejected','compensated')) AS this_year
           FROM fund_movement mv JOIN membership m ON m.group_id = mv.group_id AND m.membership_id = mv.membership_id AND m.state = 'active'
          WHERE mv.group_id = $1 AND mv.fund_id = $2 AND mv.membership_id IS NOT NULL
          GROUP BY mv.membership_id`,
        [groupId, fund.fundId, String(year)],
      );
      const pendingOut = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::text AS s FROM fund_movement WHERE group_id = $1 AND fund_id = $2 AND state = 'declared' AND kind IN ('payout','advance','transfer_out','fee','expense')`,
        [groupId, fund.fundId],
      );
      const available = (await fundConfirmedBalance(db, groupId, fund.fundId)) - BigInt(String(pendingOut.rows[0]?.s ?? "0"));
      const doneThisYear = new Set(sums.rows.filter((r) => r.this_year === true).map((r) => String(r.membership_id)));
      const plan = planReserveDistribution(
        available,
        sums.rows.map((r) => ({ membershipId: String(r.membership_id), contributed: BigInt(String(r.put)), returned: BigInt(String(r.back)) })),
      );
      const names = await loadNames(db, groupId);
      const mt = await db.query(`SELECT meeting_id FROM meeting WHERE group_id = $1 AND state = 'open' LIMIT 1`, [groupId]);
      const created: string[] = [];
      const waiting: { membershipId: string; name: string | null; amount: string; reason: string }[] = [];
      let total = 0n;
      for (const line of plan) {
        const name = names.byMembership.get(line.membershipId) ?? null;
        if (doneThisYear.has(line.membershipId)) {
          waiting.push({ membershipId: line.membershipId, name, amount: m(line.amount), reason: "Déjà une remise de réserve cette année : attendez qu'elle soit reçue ou rejetée" });
          continue;
        }
        if (!(await mayDeclarePayout(db, actor, groupId, line.membershipId))) {
          waiting.push({
            membershipId: line.membershipId,
            name,
            amount: m(line.amount),
            reason: line.membershipId === actor.membershipId ? "Votre propre remise est déclarée par un autre membre de la trésorerie ou la présidence" : "Remise déclarée par la trésorerie",
          });
          continue;
        }
        const movementId = newId("mvt");
        await db.query(
          `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, membership_id, meeting_id, channel, reference, justification,
                                      declared_by_identity_id, related_kind, related_id)
           VALUES ($1,$2,$3,'payout',$4,$5,$6,$7,$8,$9,$10,'reserve',$11)`,
          [movementId, groupId, fund.fundId, m(line.amount), line.membershipId, mt.rows[0]?.meeting_id ?? null, input.channel, input.reference ?? null, input.justification ?? null, actor.identityId, String(year)],
        );
        created.push(movementId);
        total += line.amount;
      }
      if (created.length > 0) {
        await appendEvent(db, actor, "reserve.distributed", { year, movements: created.length, total: m(total), shortfall: plan.some((l) => l.amount < l.owed) }, nowMs);
        const ids = plan.filter((l) => !waiting.some((w) => w.membershipId === l.membershipId)).map((l) => names.identityOf.get(l.membershipId)).filter((x): x is string => !!x);
        await notify(db, groupId, ids, "payout_recorded", `/tontines/${groupId}/argent`, `reserve:${year}`);
      }
      return {
        year,
        available: m(available > 0n ? available : 0n),
        shortfall: plan.some((l) => l.amount < l.owed),
        movements: created.length > 0 ? await movementViews(db, actor, { movementIds: created }) : [],
        waiting,
      };
    });
  }

  /** Le bénéficiaire (ou son mandataire) confirme avoir reçu la remise. */
  async acknowledge(headers: Record<string, unknown>, groupId: string, movementId: string): Promise<MovementView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      const mv = await lockMovement(db, groupId, movementId);
      if (mv.kind !== "payout") throw new DomainError("STATE_CONFLICT", "Seule une remise s'accuse en réception");
      if (!mv.membershipId || (mv.membershipId !== actor.membershipId && !(await isProxyOf(db, groupId, actor.membershipId, mv.membershipId)))) {
        throw new DomainError("TONTINE_FORBIDDEN", "Seul le bénéficiaire ou son mandataire confirme la réception");
      }
      if (mv.beneficiaryConfirmedAt) throw new DomainError("STATE_CONFLICT", "Réception déjà confirmée");
      const control = await controlRequired(db, groupId);
      const next = confirmMovement(mv.state, { declarantIdentityId: mv.declaredBy, confirmerIdentityId: null, controllerIdentityId: null }, actor.identityId, control);
      await db.query(
        `UPDATE fund_movement SET state = $3, confirmed_by_identity_id = $4, confirmed_at = $5, beneficiary_confirmed_at = $5, version = version + 1
          WHERE group_id = $1 AND movement_id = $2`,
        [groupId, movementId, next.state, actor.identityId, new Date(nowMs)],
      );
      await db.query(
        `UPDATE fund_movement SET state = $3, confirmed_by_identity_id = $4, confirmed_at = $5, version = version + 1
          WHERE group_id = $1 AND related_kind = 'advance' AND related_id = $2 AND state = 'declared' AND declared_by_identity_id <> $4`,
        [groupId, movementId, next.state, actor.identityId, new Date(nowMs)],
      );
      await appendEvent(db, actor, "payout.received", { movementId, roundSeq: mv.roundSeq }, nowMs);
      const bureau = await identitiesWithRoles(db, groupId, ["animator", "treasurer", "treasurer_deputy"]);
      await notify(db, groupId, bureau.filter((i) => i !== actor.identityId), "payout_recorded", `/tontines/${groupId}`, `received:${movementId}`);
      return (await movementViews(db, actor, { movementIds: [movementId] }))[0] as MovementView;
    });
  }
}
