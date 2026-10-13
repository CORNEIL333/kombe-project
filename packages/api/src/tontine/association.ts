/**
 * KÓMBE @kombe/api — la vie de l'association : séances et appel (L-05),
 * remises devant témoins et procès-verbal (L-06), caisses et mouvements
 * externes (L-07), amendes (L-09), secours (L-08), dettes et avances (L-10),
 * statuts (L-12), notifications (L-15), reprise d'historique (L-20).
 *
 * KÓMBE ne garde pas l'argent : un « mouvement » documente un paiement fait
 * HORS de KÓMBE (espèces, Orange Money, MTN MoMo, banque). Il est déclaré par
 * une personne, confirmé par une autre (trésorerie, ou le bénéficiaire pour
 * une remise), puis validé (contrôle du commissaire si la caisse l'exige).
 */
import type pg from "pg";
import {
  AID_EVENTS,
  DomainError,
  FINE_KINDS,
  PAYMENT_CHANNELS,
  aidAmount,
  assertAidDecider,
  assertAttendance,
  assertAttendanceEditable,
  assertCanAct,
  assertChannelReference,
  assertFineIssuable,
  assertMinutesApproval,
  assertOutflowCovered,
  assertPayoutWitnesses,
  buildMinutes,
  buildStatutes,
  canAct,
  confirmMovement,
  controlMovement,
  fineAmount,
  fiscalYear,
  fundLedger,
  lateContributionFine,
  lateness,
  netAfterFees,
  reserveDistribution,
  openDebt,
  planLegacyImport,
  rejectMovement,
  settleDebt,
  splitByWeight,
  transitionAid,
  transitionFine,
  transitionMeeting,
  writeOffDebt,
  type AidEvent,
  type AttendanceStatus,
  type Cadence,
  type DebtOrigin,
  type FineKind,
  type FundKind,
  type FundRules,
  type GroupRole,
  type LegacyNjangi,
  type MeetingState,
  type MovementKind,
  type MovementState,
  type PaymentChannel,
} from "@kombe/domain";
import { appendEvent, identitiesWithRoles, newId, notify, toBig, type TontineActor } from "./context.js";
import { loadGroup, potForRound } from "./groups.js";

const TREASURY: readonly GroupRole[] = ["treasurer", "treasurer_deputy"];

function isoDate(v: unknown): string {
  if (v instanceof Date) {
    // Date SQL lue par pg en minuit local : on reformate sans décalage.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function doualaToday(nowMs: number): string {
  return new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
}

async function membershipIdentity(client: pg.PoolClient, groupId: string, membershipId: string): Promise<{ identityId: string; name: string }> {
  const res = await client.query(`SELECT identity_id, display_name FROM membership WHERE group_id = $1 AND membership_id = $2`, [
    groupId,
    membershipId,
  ]);
  const row = res.rows[0] as { identity_id: string; display_name: string | null } | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
  return { identityId: row.identity_id, name: row.display_name ?? "Membre" };
}

/* ── Caisses ─────────────────────────────────────────────────────────── */

interface FundRow {
  readonly fundId: string;
  readonly kind: FundKind;
  readonly name: string;
  readonly rules: FundRules;
}

function reviveFundRules(raw: unknown): FundRules {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    perMeetingAmount: toBig(r["perMeetingAmount"]),
    annualAmount: toBig(r["annualAmount"]),
    controlRequired: r["controlRequired"] === true,
    allowNegative: r["allowNegative"] === true,
  };
}

async function loadFund(client: pg.PoolClient, groupId: string, fundId: string): Promise<FundRow> {
  const res = await client.query(`SELECT fund_id, kind, name, rules FROM fund WHERE group_id = $1 AND fund_id = $2 AND state = 'active'`, [
    groupId,
    fundId,
  ]);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Caisse introuvable");
  return { fundId: String(row["fund_id"]), kind: row["kind"] as FundKind, name: String(row["name"]), rules: reviveFundRules(row["rules"]) };
}

async function fundOfKind(client: pg.PoolClient, groupId: string, kind: FundKind): Promise<FundRow> {
  const res = await client.query(`SELECT fund_id FROM fund WHERE group_id = $1 AND kind = $2 AND state = 'active' ORDER BY created_at LIMIT 1`, [
    groupId,
    kind,
  ]);
  const id = res.rows[0]?.fund_id as string | undefined;
  if (!id) throw new DomainError("OBJET_INTROUVABLE", "Caisse absente de ce groupe");
  return loadFund(client, groupId, id);
}

async function ledgerOf(client: pg.PoolClient, groupId: string, fundId: string): Promise<ReturnType<typeof fundLedger> & { confirmedIn: bigint }> {
  const res = await client.query(`SELECT kind, amount, state, compensates_movement_id FROM fund_movement WHERE group_id = $1 AND fund_id = $2`, [
    groupId,
    fundId,
  ]);
  const lines = res.rows.map((r: Record<string, unknown>) => ({
    kind: r["kind"] as MovementKind,
    amount: toBig(r["amount"]),
    state: r["state"] as MovementState,
    compensatesId: (r["compensates_movement_id"] as string | null) ?? null,
  }));
  let confirmedIn = 0n;
  for (const l of lines) {
    if (l.state === "confirmed" && ["contribution", "fine_payment", "advance_repayment", "transfer_in"].includes(l.kind)) confirmedIn += l.amount;
  }
  return { ...fundLedger(lines), confirmedIn };
}

export async function listFunds(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(`SELECT fund_id, kind, name, rules, state FROM fund WHERE group_id = $1 ORDER BY created_at`, [groupId]);
  const out: unknown[] = [];
  for (const r of res.rows as Record<string, unknown>[]) {
    const l = await ledgerOf(client, groupId, String(r["fund_id"]));
    out.push({
      fundId: r["fund_id"],
      kind: r["kind"],
      name: r["name"],
      state: r["state"],
      rules: r["rules"],
      registerBalance: l.registerBalance.toString(),
      inProgressIn: l.inProgressIn.toString(),
      inProgressOut: l.inProgressOut.toString(),
    });
  }
  return out;
}

export async function createFund(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly kind: FundKind; readonly name: string; readonly perMeetingAmount: bigint; readonly annualAmount: bigint; readonly controlRequired: boolean },
  enabledKinds: readonly FundKind[],
  nowMs: number,
): Promise<{ fundId: string }> {
  assertCanAct(actor.roles, "fund.manage");
  if ((input.kind === "loan" || input.kind === "collector") && !enabledKinds.includes(input.kind)) {
    throw new DomainError("FUND_KIND_DISABLED", "Caisse fermée tant que le porteur ne l'a pas ouverte");
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw new DomainError("FUND_INVALID", "Nom de caisse invalide");
  const fundId = newId("fund");
  await client.query(
    `INSERT INTO fund (fund_id, group_id, kind, name, rules, state, created_by_identity_id) VALUES ($1, $2, $3, $4, $5::jsonb, 'active', $6)`,
    [
      fundId,
      groupId,
      input.kind,
      name,
      JSON.stringify({
        perMeetingAmount: input.perMeetingAmount.toString(),
        annualAmount: input.annualAmount.toString(),
        controlRequired: input.controlRequired,
        allowNegative: false,
      }),
      actor.identityId,
    ],
  );
  await appendEvent(client, groupId, actor, "fund.created", { fundId, kind: input.kind, name }, nowMs);
  return { fundId };
}

/* ── Mouvements (déclaré → confirmé → validé) ────────────────────────── */

export interface MovementInput {
  readonly fundId: string;
  readonly kind: MovementKind;
  readonly amount: bigint;
  readonly channel: PaymentChannel;
  readonly reference?: string | null | undefined;
  readonly justification?: string | null | undefined;
  readonly allegedDate?: string | null | undefined;
  readonly membershipId?: string | null | undefined;
  readonly meetingId?: string | null | undefined;
  readonly obligationId?: string | null | undefined;
  readonly relatedKind?: "fine" | "aid" | "debt" | "payout" | "advance" | null | undefined;
  readonly relatedId?: string | null | undefined;
  readonly witnessMembershipIds?: readonly string[] | undefined;
  readonly payerNote?: string | null | undefined;
}

const MEMBER_INFLOWS: readonly MovementKind[] = ["contribution", "fine_payment", "advance_repayment"];

/** Déclaration d'un mouvement. Un membre déclare SES versements ; la trésorerie
 *  et le secrétariat de séance déclarent pour le compte d'un membre et les
 *  sorties (remise, secours, avance, dépense). */
export async function declareMovement(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: MovementInput,
  nowMs: number,
  idempotencyKey?: string,
): Promise<{ movementId: string; state: MovementState }> {
  assertCanAct(actor.roles, "movement.declare");
  if (!(PAYMENT_CHANNELS as readonly string[]).includes(input.channel)) throw new DomainError("FUND_INVALID", "Moyen de paiement inconnu");
  if (input.amount <= 0n || input.amount > 1_000_000_000n) throw new DomainError("FUND_INVALID", "Montant invalide");
  assertChannelReference({ channel: input.channel, reference: input.reference ?? null, justification: input.justification ?? null });
  const movementId = idempotencyKey ? `mv_${actor.membershipId}_${idempotencyKey}`.slice(0, 120) : newId("mv");
  if (idempotencyKey) {
    const prior = await client.query(`SELECT state, amount FROM fund_movement WHERE group_id = $1 AND movement_id = $2`, [groupId, movementId]);
    if (prior.rows[0]) {
      if (toBig(prior.rows[0].amount) !== input.amount) throw new DomainError("IDEMPOTENCY_BODY_CONFLICT", "Clé déjà utilisée");
      return { movementId, state: prior.rows[0].state as MovementState };
    }
  }
  const fund = await loadFund(client, groupId, input.fundId);
  const onBehalf = input.membershipId && input.membershipId !== actor.membershipId;
  const isInflowFromMember = MEMBER_INFLOWS.includes(input.kind);
  if (!isInflowFromMember || onBehalf) {
    // Sorties et saisies pour autrui : trésorerie ou secrétariat de séance.
    if (!canAct(actor.roles, "movement.confirm") && !canAct(actor.roles, "meeting.attendance")) {
      throw new DomainError("TONTINE_FORBIDDEN", "Action réservée à la trésorerie ou au secrétariat");
    }
  }
  const membershipId = input.membershipId ?? (isInflowFromMember ? actor.membershipId : null);
  let relatedKind: string | null = input.relatedKind ?? null;
  let relatedId: string | null = input.relatedId ?? null;

  // Cotisation de rotation rattachée à son obligation (réservation du restant dû).
  if (input.kind === "contribution" && fund.kind === "rotation") {
    let obligationId = input.obligationId ?? null;
    if (!obligationId && input.meetingId) {
      const ob = await client.query(
        `SELECT o.obligation_id FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
           JOIN meeting m ON m.group_id = r.group_id AND m.round_seq = r.seq
          WHERE o.group_id = $1 AND m.meeting_id = $2 AND o.member_membership_id = $3`,
        [groupId, input.meetingId, membershipId],
      );
      obligationId = (ob.rows[0]?.obligation_id as string | undefined) ?? null;
    }
    if (!obligationId) throw new DomainError("OBJET_INTROUVABLE", "Cotisation sans échéance correspondante");
    const ob = await client.query(
      `SELECT due_amount, active_reserved, member_membership_id FROM obligation WHERE group_id = $1 AND obligation_id = $2 FOR UPDATE`,
      [groupId, obligationId],
    );
    const o = ob.rows[0] as Record<string, unknown> | undefined;
    if (!o || o["member_membership_id"] !== membershipId) throw new DomainError("OBJET_INTROUVABLE", "Échéance introuvable");
    const remaining = toBig(o["due_amount"]) - toBig(o["active_reserved"]);
    if (input.amount > remaining) throw new DomainError("CONTRIBUTION_EXCEEDS_REMAINING", "Montant supérieur au restant dû");
    await client.query(`UPDATE obligation SET active_reserved = active_reserved + $3, version = version + 1 WHERE group_id = $1 AND obligation_id = $2`, [
      groupId,
      obligationId,
      input.amount.toString(),
    ]);
    relatedKind = null;
    relatedId = obligationId;
  }
  if (input.kind === "fine_payment") {
    if (!relatedId) throw new DomainError("FINE_INVALID", "Amende non précisée");
    relatedKind = "fine";
  }
  if (input.kind === "advance_repayment") {
    if (!relatedId) throw new DomainError("DEBT_INVALID", "Dette non précisée");
    relatedKind = "debt";
  }
  if (!MEMBER_INFLOWS.includes(input.kind) && input.kind !== "transfer_in") {
    // Sortie : couverte par l'écart du registre (validé + confirmé en entrée).
    const l = await ledgerOf(client, groupId, fund.fundId);
    assertOutflowCovered(l.registerBalance + l.confirmedIn - l.inProgressOut, input.amount, fund.rules);
  }

  await client.query(
    `INSERT INTO fund_movement (movement_id, group_id, fund_id, kind, amount, membership_id, meeting_id, state, channel, reference,
                                justification, payer_note, alleged_date, declared_by_identity_id, related_kind, related_id,
                                witness_membership_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'declared',$8,$9,$10,$11,$12::date,$13,$14,$15,$16)`,
    [
      movementId,
      groupId,
      fund.fundId,
      input.kind,
      input.amount.toString(),
      membershipId,
      input.meetingId ?? null,
      input.channel,
      input.reference ?? null,
      input.justification ?? null,
      input.payerNote ?? null,
      input.allegedDate ?? doualaToday(nowMs),
      actor.identityId,
      relatedKind,
      relatedId,
      input.witnessMembershipIds ?? [],
    ],
  );
  await appendEvent(
    client,
    groupId,
    actor,
    "movement.declared",
    { movementId, fundId: fund.fundId, kind: input.kind, amount: input.amount, channel: input.channel, membershipId },
    nowMs,
  );
  const confirmers = (await identitiesWithRoles(client, groupId, TREASURY)).filter((i) => i !== actor.identityId);
  await notify(client, groupId, confirmers, "validation_waiting", `group:${groupId}:validations`, `mv:${movementId}`);
  return { movementId, state: "declared" };
}

interface MovementRow {
  movementId: string;
  fundId: string;
  kind: MovementKind;
  amount: bigint;
  state: MovementState;
  declarant: string;
  confirmer: string | null;
  controller: string | null;
  membershipId: string | null;
  relatedKind: string | null;
  relatedId: string | null;
}

async function lockMovement(client: pg.PoolClient, groupId: string, movementId: string): Promise<MovementRow> {
  const res = await client.query(
    `SELECT movement_id, fund_id, kind, amount, state, declared_by_identity_id, confirmed_by_identity_id, controlled_by_identity_id,
            membership_id, related_kind, related_id
       FROM fund_movement WHERE group_id = $1 AND movement_id = $2 FOR UPDATE`,
    [groupId, movementId],
  );
  const r = res.rows[0] as Record<string, unknown> | undefined;
  if (!r) throw new DomainError("OBJET_INTROUVABLE", "Mouvement introuvable");
  return {
    movementId: String(r["movement_id"]),
    fundId: String(r["fund_id"]),
    kind: r["kind"] as MovementKind,
    amount: toBig(r["amount"]),
    state: r["state"] as MovementState,
    declarant: String(r["declared_by_identity_id"]),
    confirmer: (r["confirmed_by_identity_id"] as string | null) ?? null,
    controller: (r["controlled_by_identity_id"] as string | null) ?? null,
    membershipId: (r["membership_id"] as string | null) ?? null,
    relatedKind: (r["related_kind"] as string | null) ?? null,
    relatedId: (r["related_id"] as string | null) ?? null,
  };
}

/** Effets d'un mouvement VALIDÉ sur les objets liés (échéance, amende, secours, dette). */
async function onValidated(client: pg.PoolClient, groupId: string, mv: MovementRow, actor: TontineActor, nowMs: number): Promise<void> {
  if (mv.kind === "contribution" && mv.relatedKind === null && mv.relatedId) {
    await client.query(
      `UPDATE obligation SET validated_net = validated_net + $3, version = version + 1 WHERE group_id = $1 AND obligation_id = $2`,
      [groupId, mv.relatedId, mv.amount.toString()],
    );
  }
  if (mv.kind === "fine_payment" && mv.relatedKind === "fine" && mv.relatedId) {
    const f = await client.query(`SELECT state, amount FROM fine WHERE group_id = $1 AND fine_id = $2 FOR UPDATE`, [groupId, mv.relatedId]);
    const row = f.rows[0] as { state: string; amount: string } | undefined;
    if (row && row.state === "issued" && toBig(row.amount) <= mv.amount) {
      transitionFine("issued", "paid");
      await client.query(`UPDATE fine SET state = 'paid', movement_id = $3, version = version + 1 WHERE group_id = $1 AND fine_id = $2`, [
        groupId,
        mv.relatedId,
        mv.movementId,
      ]);
    }
  }
  if (mv.kind === "payout" && mv.relatedKind === "aid" && mv.relatedId) {
    const a = await client.query(`SELECT state FROM aid_request WHERE group_id = $1 AND aid_id = $2 FOR UPDATE`, [groupId, mv.relatedId]);
    if (a.rows[0]?.state === "approved") {
      transitionAid("approved", "paid");
      await client.query(`UPDATE aid_request SET state = 'paid', movement_id = $3, version = version + 1 WHERE group_id = $1 AND aid_id = $2`, [
        groupId,
        mv.relatedId,
        mv.movementId,
      ]);
    }
  }
  if (mv.kind === "advance_repayment" && mv.relatedKind === "debt" && mv.relatedId) {
    await applyDebtSettlement(client, groupId, mv.relatedId, mv.amount);
  }
  if (mv.kind === "payout" && mv.relatedKind === "payout" && mv.relatedId) {
    // Tour remis : il ne pourra plus être échangé (le reste est tracé au journal).
    await appendEvent(client, groupId, actor, "round.payout_validated", { roundId: mv.relatedId, movementId: mv.movementId }, nowMs);
    // Toutes les remises du tour (parts partagées comprises) validées : tour clos.
    const pending = await client.query(
      `SELECT count(*)::int AS n FROM fund_movement
        WHERE group_id = $1 AND kind = 'payout' AND related_kind = 'payout' AND related_id = $2
          AND state IN ('declared','confirmed') AND movement_id <> $3`,
      [groupId, mv.relatedId, mv.movementId],
    );
    if (Number(pending.rows[0]?.n ?? 0) === 0) {
      const closed = await client.query(`UPDATE round SET state = 'closed' WHERE group_id = $1 AND round_id = $2 AND state = 'open' RETURNING seq`, [
        groupId,
        mv.relatedId,
      ]);
      if (closed.rows.length > 0) {
        await appendEvent(client, groupId, actor, "round.closed", { roundId: mv.relatedId }, nowMs);
      }
    }
  }
}

async function applyDebtSettlement(client: pg.PoolClient, groupId: string, debtId: string, amount: bigint): Promise<void> {
  const d = await client.query(
    `SELECT debt_id, debtor_membership_id, origin, amount, settled, state, creditor_fund_id, guarantor_membership_id
       FROM member_debt WHERE group_id = $1 AND debt_id = $2 FOR UPDATE`,
    [groupId, debtId],
  );
  const r = d.rows[0] as Record<string, unknown> | undefined;
  if (!r) return;
  const debt = settleDebt(
    {
      debtId,
      debtorMembershipId: String(r["debtor_membership_id"]),
      origin: r["origin"] as DebtOrigin,
      amount: toBig(r["amount"]),
      settled: toBig(r["settled"]),
      state: r["state"] as "open",
      creditorFundId: (r["creditor_fund_id"] as string | null) ?? null,
      guarantorMembershipId: (r["guarantor_membership_id"] as string | null) ?? null,
    },
    amount,
  );
  await client.query(
    `UPDATE member_debt SET settled = $3, state = $4, closed_at = CASE WHEN $4 = 'settled' THEN now() ELSE NULL END, version = version + 1
      WHERE group_id = $1 AND debt_id = $2`,
    [groupId, debtId, debt.settled.toString(), debt.state],
  );
}

export async function confirmMovementAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  movementId: string,
  nowMs: number,
): Promise<{ state: MovementState }> {
  const mv = await lockMovement(client, groupId, movementId);
  const fund = await loadFund(client, groupId, mv.fundId);
  if (mv.kind === "payout") {
    // Une remise est confirmée par son BÉNÉFICIAIRE (réception), pas par la trésorerie.
    if (mv.membershipId !== actor.membershipId) throw new DomainError("TONTINE_FORBIDDEN", "Seul le bénéficiaire confirme la réception");
  } else {
    assertCanAct(actor.roles, "movement.confirm");
  }
  const next = confirmMovement(mv.state, { declarantIdentityId: mv.declarant, confirmerIdentityId: mv.confirmer, controllerIdentityId: mv.controller }, actor.identityId, fund.rules.controlRequired);
  await client.query(
    `UPDATE fund_movement SET state = $3, confirmed_by_identity_id = $4, confirmed_at = now(),
            beneficiary_confirmed_at = CASE WHEN kind = 'payout' THEN now() ELSE beneficiary_confirmed_at END, version = version + 1
      WHERE group_id = $1 AND movement_id = $2`,
    [groupId, movementId, next.state, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "movement.confirmed", { movementId, state: next.state }, nowMs);
  if (next.state === "validated") await onValidated(client, groupId, { ...mv, state: next.state, confirmer: actor.identityId }, actor, nowMs);
  else {
    let auditors = (await identitiesWithRoles(client, groupId, ["auditor"])).filter((i) => i !== actor.identityId && i !== mv.declarant);
    if (auditors.length === 0) {
      auditors = (await identitiesWithRoles(client, groupId, ["censor", "animator", "vice_president"])).filter((i) => i !== actor.identityId && i !== mv.declarant);
    }
    await notify(client, groupId, auditors, "validation_waiting", `group:${groupId}:validations`, `ctl:${movementId}`);
  }
  return next;
}

export async function controlMovementAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  movementId: string,
  nowMs: number,
): Promise<{ state: MovementState }> {
  const mv = await lockMovement(client, groupId, movementId);
  if (!canAct(actor.roles, "movement.control")) {
    // Conflit d'intérêts : quand aucun commissaire ne peut contrôler (il a
    // lui-même déclaré ou confirmé, par exemple en recevant sa remise), le
    // censeur ou, à défaut, la présidence contrôle à sa place.
    const auditors = (await identitiesWithRoles(client, groupId, ["auditor"])).filter((i) => i !== mv.declarant && i !== mv.confirmer);
    const substitute = actor.roles.some((r) => r === "censor" || r === "animator" || r === "vice_president");
    if (auditors.length > 0 || !substitute) throw new DomainError("TONTINE_FORBIDDEN", "Contrôle réservé au commissaire aux comptes");
  }
  const next = controlMovement(mv.state, { declarantIdentityId: mv.declarant, confirmerIdentityId: mv.confirmer, controllerIdentityId: mv.controller }, actor.identityId);
  await client.query(
    `UPDATE fund_movement SET state = $3, controlled_by_identity_id = $4, controlled_at = now(), version = version + 1
      WHERE group_id = $1 AND movement_id = $2`,
    [groupId, movementId, next.state, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "movement.validated", { movementId }, nowMs);
  await onValidated(client, groupId, { ...mv, state: next.state, controller: actor.identityId }, actor, nowMs);
  return next;
}

export async function rejectMovementAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  movementId: string,
  reason: string,
  nowMs: number,
): Promise<{ state: MovementState }> {
  const mv = await lockMovement(client, groupId, movementId);
  if (!(canAct(actor.roles, "movement.confirm") || canAct(actor.roles, "movement.control") || (mv.kind === "payout" && mv.membershipId === actor.membershipId))) {
    throw new DomainError("TONTINE_FORBIDDEN", "Accès refusé");
  }
  if (actor.identityId === mv.declarant) throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "Le déclarant ne rejette pas sa propre opération");
  const next = rejectMovement(mv.state, reason);
  await client.query(
    `UPDATE fund_movement SET state = 'rejected', rejected_reason = $3, version = version + 1 WHERE group_id = $1 AND movement_id = $2`,
    [groupId, movementId, reason.trim().slice(0, 500)],
  );
  if (mv.kind === "contribution" && mv.relatedKind === null && mv.relatedId) {
    await client.query(
      `UPDATE obligation SET active_reserved = active_reserved - $3, version = version + 1 WHERE group_id = $1 AND obligation_id = $2`,
      [groupId, mv.relatedId, mv.amount.toString()],
    );
  }
  await appendEvent(client, groupId, actor, "movement.rejected", { movementId, reason: reason.slice(0, 200) }, nowMs);
  const declarant = [mv.declarant];
  await notify(client, groupId, declarant, "general", `group:${groupId}:movements`, `rej:${movementId}`);
  return next;
}

export async function listMovements(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  filter: { readonly state?: string | undefined; readonly fundId?: string | undefined; readonly mine?: boolean | undefined; readonly meetingId?: string | undefined },
): Promise<unknown[]> {
  const g = await loadGroup(client, groupId);
  const bureau = actor.roles.some((r) => r !== "member");
  const onlyMine = filter.mine === true || (g.settings.transparency === "bureau_only" && !bureau);
  const res = await client.query(
    `SELECT fm.movement_id, fm.fund_id, f.name AS fund_name, f.kind AS fund_kind, fm.kind, fm.amount, fm.state, fm.channel, fm.reference,
            fm.alleged_date, fm.declared_at, fm.membership_id, m.display_name, fm.meeting_id, fm.related_kind, fm.related_id,
            fm.declared_by_identity_id = $2 AS declared_by_me, fm.witness_membership_ids, fm.rejected_reason
       FROM fund_movement fm JOIN fund f ON f.group_id = fm.group_id AND f.fund_id = fm.fund_id
       LEFT JOIN membership m ON m.group_id = fm.group_id AND m.membership_id = fm.membership_id
      WHERE fm.group_id = $1
        AND ($3::text IS NULL OR fm.state = $3)
        AND ($4::text IS NULL OR fm.fund_id = $4)
        AND ($5::text IS NULL OR fm.meeting_id = $5)
        AND (NOT $6::boolean OR fm.membership_id = $7 OR fm.declared_by_identity_id = $2)
      ORDER BY fm.declared_at DESC LIMIT 200`,
    [groupId, actor.identityId, filter.state ?? null, filter.fundId ?? null, filter.meetingId ?? null, onlyMine, actor.membershipId],
  );
  const anonymize = g.settings.transparency === "anonymized" && !bureau;
  return res.rows.map((r: Record<string, unknown>) => ({
    movementId: r["movement_id"],
    fundId: r["fund_id"],
    fundName: r["fund_name"],
    fundKind: r["fund_kind"],
    kind: r["kind"],
    amount: String(r["amount"]),
    state: r["state"],
    channel: r["channel"],
    reference: bureau || r["declared_by_me"] ? r["reference"] : null,
    allegedDate: r["alleged_date"] ? isoDate(r["alleged_date"]) : null,
    declaredAt: r["declared_at"],
    membershipId: anonymize && r["membership_id"] !== actor.membershipId ? null : r["membership_id"],
    memberName: anonymize && r["membership_id"] !== actor.membershipId ? null : r["display_name"],
    meetingId: r["meeting_id"],
    relatedKind: r["related_kind"],
    relatedId: r["related_id"],
    declaredByMe: r["declared_by_me"],
    rejectedReason: r["rejected_reason"],
  }));
}

/** File « à valider » de l'acteur : ce que SA fonction lui permet de confirmer ou contrôler. */
export async function pendingForActor(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown[]> {
  const all = (await listMovements(client, groupId, actor, {})) as Record<string, unknown>[];
  const canConfirm = canAct(actor.roles, "movement.confirm");
  const canControl = canAct(actor.roles, "movement.control");
  return all.filter((m) => {
    if (m["declaredByMe"]) return false;
    if (m["state"] === "declared") {
      if (m["kind"] === "payout") return m["membershipId"] === actor.membershipId;
      return canConfirm;
    }
    if (m["state"] === "confirmed") return canControl;
    return false;
  });
}

/* ── Séances (L-05, L-06) ────────────────────────────────────────────── */

async function lockMeeting(client: pg.PoolClient, groupId: string, meetingId: string): Promise<Record<string, unknown>> {
  const res = await client.query(`SELECT * FROM meeting WHERE group_id = $1 AND meeting_id = $2 FOR UPDATE`, [groupId, meetingId]);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
  return row;
}

export async function listMeetings(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(
    `SELECT m.meeting_id, m.seq, m.scheduled_date, m.state, m.location, m.host_membership_id, h.display_name AS host_name, m.round_seq,
            m.minutes_hash, m.minutes_approved_at
       FROM meeting m LEFT JOIN membership h ON h.group_id = m.group_id AND h.membership_id = m.host_membership_id
      WHERE m.group_id = $1 ORDER BY m.seq`,
    [groupId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, scheduled_date: isoDate(r["scheduled_date"]) }));
}

export async function meetingDetail(client: pg.PoolClient, groupId: string, meetingId: string): Promise<unknown> {
  const m = await client.query(`SELECT * FROM meeting WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId]);
  const row = m.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Séance introuvable");
  const att = await client.query(
    `SELECT a.membership_id, mm.display_name, a.status, a.represented_by_membership_id
       FROM attendance a JOIN membership mm ON mm.group_id = a.group_id AND mm.membership_id = a.membership_id
      WHERE a.group_id = $1 AND a.meeting_id = $2 ORDER BY mm.display_name`,
    [groupId, meetingId],
  );
  const round = row["round_seq"]
    ? await client.query(
        `SELECT r.round_id, r.seq, r.share_id,
                COALESCE((SELECT array_agg(json_build_object('membershipId', h.membership_id, 'name', mm.display_name, 'weight', h.weight))
                            FROM share_holder h JOIN membership mm ON mm.group_id = h.group_id AND mm.membership_id = h.membership_id
                           WHERE h.group_id = r.group_id AND h.share_id = r.share_id), ARRAY[]::json[]) AS holders
           FROM round r WHERE r.group_id = $1 AND r.seq = $2`,
        [groupId, row["round_seq"]],
      )
    : null;
  const dues = row["round_seq"]
    ? await client.query(
        `SELECT o.obligation_id, o.member_membership_id, mm.display_name, o.due_amount, o.active_reserved, o.validated_net
           FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
           JOIN membership mm ON mm.group_id = o.group_id AND mm.membership_id = o.member_membership_id
          WHERE o.group_id = $1 AND r.seq = $2 ORDER BY mm.display_name`,
        [groupId, row["round_seq"]],
      )
    : null;
  return {
    meetingId,
    seq: row["seq"],
    scheduledDate: isoDate(row["scheduled_date"]),
    state: row["state"],
    location: row["location"],
    hostMembershipId: row["host_membership_id"],
    notes: row["notes"],
    minutesText: row["minutes_text"],
    minutesHash: row["minutes_hash"],
    minutesApprovedAt: row["minutes_approved_at"],
    attendance: att.rows,
    round: round?.rows[0] ?? null,
    pot: round?.rows[0] ? (await potForRound(client, groupId, String((round.rows[0] as Record<string, unknown>)["round_id"]))).toString() : "0",
    dues: (dues?.rows ?? []).map((d: Record<string, unknown>) => ({
      obligationId: d["obligation_id"],
      membershipId: d["member_membership_id"],
      name: d["display_name"],
      due: String(d["due_amount"]),
      declared: String(d["active_reserved"]),
      validated: String(d["validated_net"]),
    })),
  };
}

export async function updateMeeting(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  input: { readonly location?: string | null | undefined; readonly hostMembershipId?: string | null | undefined; readonly scheduledDate?: string | undefined; readonly notes?: string | null | undefined },
  nowMs: number,
): Promise<void> {
  assertCanAct(actor.roles, "meeting.manage");
  const m = await lockMeeting(client, groupId, meetingId);
  if (m["state"] !== "planned" && m["state"] !== "open") throw new DomainError("MEETING_STATE_INVALID", "Séance close");
  await client.query(
    `UPDATE meeting SET location = COALESCE($3, location), host_membership_id = COALESCE($4, host_membership_id),
            notes = COALESCE($5, notes), version = version + 1 WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId, input.location ?? null, input.hostMembershipId ?? null, input.notes ?? null],
  );
  if (input.scheduledDate && input.scheduledDate !== isoDate(m["scheduled_date"])) {
    // Report d'une séance : décision tracée ; le tour suit (décalage autorisé).
    await client.query("SELECT set_config('kombe.schedule_shift', 'approved', true)");
    await client.query(`UPDATE meeting SET scheduled_date = $3::date WHERE group_id = $1 AND meeting_id = $2`, [groupId, meetingId, input.scheduledDate]);
    if (m["round_seq"]) {
      await client.query(`UPDATE round SET due_date_business = $3::date WHERE group_id = $1 AND seq = $2`, [groupId, m["round_seq"], input.scheduledDate]);
    }
    await client.query("SELECT set_config('kombe.schedule_shift', '', true)");
  }
  await appendEvent(client, groupId, actor, "meeting.updated", { meetingId, ...input }, nowMs);
}

export async function transitionMeetingAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  to: "open" | "cancelled",
  reason: string | null,
  nowMs: number,
): Promise<{ state: MeetingState }> {
  assertCanAct(actor.roles, "meeting.manage");
  const m = await lockMeeting(client, groupId, meetingId);
  const next = transitionMeeting(m["state"] as MeetingState, to);
  if (to === "cancelled" && (!reason || reason.trim().length < 3)) throw new DomainError("MEETING_STATE_INVALID", "Motif d'annulation obligatoire");
  await client.query(
    `UPDATE meeting SET state = $3, opened_at = CASE WHEN $3 = 'open' THEN now() ELSE opened_at END,
            opened_by_identity_id = CASE WHEN $3 = 'open' THEN $4 ELSE opened_by_identity_id END,
            cancel_reason = CASE WHEN $3 = 'cancelled' THEN $5 ELSE cancel_reason END, version = version + 1
      WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId, next, actor.identityId, reason],
  );
  if (next === "open") {
    // Appel pré-rempli « absent » pour chaque membre actif, corrigé ensuite.
    await client.query(
      `INSERT INTO attendance (group_id, meeting_id, membership_id, status, recorded_by_identity_id)
       SELECT $1, $2, membership_id, 'absent', $3 FROM membership WHERE group_id = $1 AND state = 'active'
       ON CONFLICT DO NOTHING`,
      [groupId, meetingId, actor.identityId],
    );
  }
  await appendEvent(client, groupId, actor, `meeting.${next}`, { meetingId, reason }, nowMs);
  return { state: next };
}

export async function recordAttendance(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  entries: readonly { readonly membershipId: string; readonly status: AttendanceStatus; readonly representedByMembershipId?: string | null | undefined }[],
  nowMs: number,
): Promise<{ present: number; absent: number; excused: number }> {
  assertCanAct(actor.roles, "meeting.attendance");
  const m = await lockMeeting(client, groupId, meetingId);
  assertAttendanceEditable(m["state"] as MeetingState);
  for (const e of entries) {
    assertAttendance({ status: e.status, membershipId: e.membershipId, representedByMembershipId: e.representedByMembershipId ?? null });
    await client.query(
      `INSERT INTO attendance (group_id, meeting_id, membership_id, status, represented_by_membership_id, recorded_by_identity_id, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (meeting_id, membership_id) DO UPDATE SET status = EXCLUDED.status,
         represented_by_membership_id = EXCLUDED.represented_by_membership_id,
         recorded_by_identity_id = EXCLUDED.recorded_by_identity_id, recorded_at = now()`,
      [groupId, meetingId, e.membershipId, e.status, e.representedByMembershipId ?? null, actor.identityId],
    );
  }
  const tally = await client.query(
    `SELECT count(*) FILTER (WHERE status IN ('present','late','represented'))::int AS present,
            count(*) FILTER (WHERE status = 'absent')::int AS absent,
            count(*) FILTER (WHERE status = 'excused')::int AS excused
       FROM attendance WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId],
  );
  await appendEvent(client, groupId, actor, "meeting.attendance", { meetingId, entries: entries.length }, nowMs);
  const t = tally.rows[0] as { present: number; absent: number; excused: number };
  return { present: t.present, absent: t.absent, excused: t.excused };
}

/** Collecte en séance : plusieurs cotisations reçues d'un coup (espèces le plus souvent). */
export async function batchCollect(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  items: readonly { readonly membershipId: string; readonly amount: bigint; readonly channel: PaymentChannel; readonly reference?: string | null | undefined; readonly fundId?: string | undefined }[],
  nowMs: number,
): Promise<{ movementIds: string[] }> {
  const m = await lockMeeting(client, groupId, meetingId);
  if (m["state"] !== "open") throw new DomainError("MEETING_STATE_INVALID", "La collecte se fait en séance ouverte");
  const rotation = await fundOfKind(client, groupId, "rotation");
  const ids: string[] = [];
  for (const it of items) {
    const out = await declareMovement(
      client,
      groupId,
      actor,
      {
        fundId: it.fundId ?? rotation.fundId,
        kind: "contribution",
        amount: it.amount,
        channel: it.channel,
        reference: it.reference ?? null,
        justification: it.channel === "cash" ? null : it.reference ? null : "Reçu en séance",
        membershipId: it.membershipId,
        meetingId,
      },
      nowMs,
    );
    ids.push(out.movementId);
  }
  return { movementIds: ids };
}

/** Remise de la cagnotte en séance, devant témoins présents (L-06). */
export async function recordPayout(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  input: {
    readonly channel: PaymentChannel;
    readonly reference?: string | null | undefined;
    readonly justification?: string | null | undefined;
    readonly witnessMembershipIds: readonly string[];
    readonly amount?: bigint | undefined;
    readonly fee?: bigint | undefined;
  },
  nowMs: number,
): Promise<{ movementIds: string[] }> {
  const m = await lockMeeting(client, groupId, meetingId);
  if (m["state"] !== "open") throw new DomainError("MEETING_STATE_INVALID", "La remise se fait en séance ouverte");
  if (!m["round_seq"]) throw new DomainError("OBJET_INTROUVABLE", "Séance sans tour");
  const round = await client.query(`SELECT round_id, share_id FROM round WHERE group_id = $1 AND seq = $2`, [groupId, m["round_seq"]]);
  const r = round.rows[0] as { round_id: string; share_id: string | null } | undefined;
  if (!r || !r.share_id) throw new DomainError("OBJET_INTROUVABLE", "Tour sans titulaire");
  const already = await client.query(
    `SELECT 1 FROM fund_movement WHERE group_id = $1 AND kind = 'payout' AND related_kind = 'payout' AND related_id = $2 AND state <> 'rejected'`,
    [groupId, r.round_id],
  );
  if (already.rows.length > 0) throw new DomainError("DISBURSEMENT_STATE_INVALID", "Ce tour a déjà sa remise");
  const holders = await client.query(`SELECT membership_id, weight FROM share_holder WHERE group_id = $1 AND share_id = $2`, [groupId, r.share_id]);
  // Personne ne déclare sa propre remise. Quand toute la trésorerie est
  // titulaire du tour (la trésorière « bouffe »), la présidence déclare.
  const holderIds = (holders.rows as { membership_id: string }[]).map((h) => h.membership_id);
  if (holderIds.includes(actor.membershipId)) {
    throw new DomainError("TONTINE_FORBIDDEN", "Votre propre remise est déclarée par un autre membre du bureau");
  }
  if (!actor.roles.some((x) => TREASURY.includes(x))) {
    const treasury = await client.query(
      `SELECT DISTINCT membership_id FROM role_assignment
        WHERE group_id = $1 AND role = ANY($2::text[]) AND accepted_at IS NOT NULL AND ended_at IS NULL`,
      [groupId, TREASURY as unknown as string[]],
    );
    const available = treasury.rows.filter((t: { membership_id: string }) => !holderIds.includes(t.membership_id));
    const presidency = actor.roles.some((x) => x === "animator" || x === "vice_president");
    if (available.length > 0 || !presidency) throw new DomainError("TONTINE_FORBIDDEN", "La remise est déclarée par la trésorerie");
  }
  const present = await client.query(
    `SELECT membership_id FROM attendance WHERE group_id = $1 AND meeting_id = $2 AND status IN ('present','late','represented')`,
    [groupId, meetingId],
  );
  const presentIds = present.rows.map((x: { membership_id: string }) => x.membership_id);
  const g = await loadGroup(client, groupId);
  for (const h of holders.rows as { membership_id: string }[]) {
    assertPayoutWitnesses({
      beneficiaryMembershipId: h.membership_id,
      declarantMembershipId: actor.membershipId,
      witnessMembershipIds: input.witnessMembershipIds,
      presentMembershipIds: presentIds,
      minimumWitnesses: g.settings.minimumWitnesses,
    });
  }
  const gross = input.amount ?? (await potForRound(client, groupId, r.round_id));
  const { net, fundFee } = netAfterFees(gross, input.fee ?? 0n, g.settings.feeBearer);
  const rotation = await fundOfKind(client, groupId, "rotation");
  const parts = splitByWeight(
    net,
    (holders.rows as { membership_id: string; weight: number }[]).map((h) => ({ membershipId: h.membership_id, weight: Number(h.weight) })),
  );
  const ids: string[] = [];
  for (const p of parts) {
    const out = await declareMovement(
      client,
      groupId,
      actor,
      {
        fundId: rotation.fundId,
        kind: "payout",
        amount: p.amount,
        channel: input.channel,
        reference: input.reference ?? null,
        justification: input.justification ?? null,
        membershipId: p.membershipId,
        meetingId,
        relatedKind: "payout",
        relatedId: r.round_id,
        witnessMembershipIds: input.witnessMembershipIds,
      },
      nowMs,
    );
    ids.push(out.movementId);
    const ben = await membershipIdentity(client, groupId, p.membershipId);
    await notify(client, groupId, [ben.identityId], "payout_recorded", `group:${groupId}:validations`, `payout:${out.movementId}`);
  }
  if (fundFee > 0n) {
    const fee = await declareMovement(
      client,
      groupId,
      actor,
      { fundId: rotation.fundId, kind: "fee", amount: fundFee, channel: input.channel, justification: "Frais Mobile Money de la remise", meetingId },
      nowMs,
    );
    ids.push(fee.movementId);
  }
  return { movementIds: ids };
}

export async function closeMeeting(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  input: { readonly decisions: readonly string[]; readonly notes: string | null; readonly autoFines: boolean },
  nowMs: number,
): Promise<{ minutesHash: string; finesIssued: number }> {
  assertCanAct(actor.roles, "meeting.manage");
  const m = await lockMeeting(client, groupId, meetingId);
  transitionMeeting(m["state"] as MeetingState, "closed");
  const g = await loadGroup(client, groupId);
  const att = await client.query(
    `SELECT a.membership_id, mm.identity_id, mm.display_name, a.status, rep.display_name AS rep_name
       FROM attendance a JOIN membership mm ON mm.group_id = a.group_id AND mm.membership_id = a.membership_id
       LEFT JOIN membership rep ON rep.group_id = a.group_id AND rep.membership_id = a.represented_by_membership_id
      WHERE a.group_id = $1 AND a.meeting_id = $2 ORDER BY mm.display_name`,
    [groupId, meetingId],
  );
  let finesIssued = 0;
  if (input.autoFines) {
    for (const a of att.rows as Record<string, unknown>[]) {
      const kind: FineKind | null = a["status"] === "absent" ? "meeting_absence" : a["status"] === "late" ? "meeting_late" : null;
      if (!kind || a["identity_id"] === actor.identityId) continue;
      const amount = fineAmount(g.settings.fines, kind, null);
      if (amount <= 0n) continue;
      await client.query(
        `INSERT INTO fine (fine_id, group_id, membership_id, meeting_id, kind, amount, reason, issued_by_identity_id, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'issued')`,
        [newId("fine"), groupId, a["membership_id"], meetingId, kind, amount.toString(), kind === "meeting_absence" ? "Absence non excusée" : "Retard en séance", actor.identityId],
      );
      finesIssued += 1;
      await notify(client, groupId, [String(a["identity_id"])], "fine_issued", `group:${groupId}:fines`, `fine:${meetingId}:${String(a["membership_id"])}`);
    }
  }
  const mv = await client.query(
    `SELECT fm.kind, fm.amount, fm.state, f.name AS fund, mm.display_name AS member, fm.witness_membership_ids, fm.confirmed_at
       FROM fund_movement fm JOIN fund f ON f.group_id = fm.group_id AND f.fund_id = fm.fund_id
       LEFT JOIN membership mm ON mm.group_id = fm.group_id AND mm.membership_id = fm.membership_id
      WHERE fm.group_id = $1 AND fm.meeting_id = $2 AND fm.state <> 'rejected' ORDER BY fm.declared_at`,
    [groupId, meetingId],
  );
  const names = new Map<string, string>();
  const allMembers = await client.query(`SELECT membership_id, display_name FROM membership WHERE group_id = $1`, [groupId]);
  for (const r of allMembers.rows as { membership_id: string; display_name: string | null }[]) names.set(r.membership_id, r.display_name ?? "Membre");
  const fines = await client.query(
    `SELECT mm.display_name, fi.reason, fi.amount FROM fine fi JOIN membership mm ON mm.group_id = fi.group_id AND mm.membership_id = fi.membership_id
      WHERE fi.group_id = $1 AND fi.meeting_id = $2 AND fi.state <> 'cancelled'`,
    [groupId, meetingId],
  );
  const host = m["host_membership_id"] ? (names.get(String(m["host_membership_id"])) ?? null) : null;
  const minutes = buildMinutes({
    groupName: g.name,
    meetingSeq: Number(m["seq"]),
    date: isoDate(m["scheduled_date"]),
    location: (m["location"] as string | null) ?? null,
    host,
    attendance: (att.rows as Record<string, unknown>[]).map((a) => ({
      name: String(a["display_name"] ?? "Membre"),
      status: a["status"] as AttendanceStatus,
      representedBy: (a["rep_name"] as string | null) ?? null,
    })),
    collections: (mv.rows as Record<string, unknown>[])
      .filter((x) => x["kind"] !== "payout" && x["kind"] !== "fee")
      .map((x) => ({ fund: String(x["fund"]), member: String(x["member"] ?? "—"), amount: toBig(x["amount"]), state: String(x["state"]) })),
    payouts: (mv.rows as Record<string, unknown>[])
      .filter((x) => x["kind"] === "payout")
      .map((x) => ({
        fund: String(x["fund"]),
        beneficiary: String(x["member"] ?? "—"),
        amount: toBig(x["amount"]),
        witnesses: ((x["witness_membership_ids"] as string[] | null) ?? []).map((w) => names.get(w) ?? "Membre"),
        confirmed: x["confirmed_at"] !== null,
      })),
    fines: (fines.rows as Record<string, unknown>[]).map((f) => ({ member: String(f["display_name"] ?? "Membre"), reason: String(f["reason"]), amount: toBig(f["amount"]) })),
    aids: [],
    decisions: input.decisions.map((d) => d.trim()).filter((d) => d.length > 0).slice(0, 50),
    notes: input.notes ?? ((m["notes"] as string | null) ?? null),
  });
  await client.query(
    `UPDATE meeting SET state = 'closed', closed_at = now(), closed_by_identity_id = $3, minutes_text = $4, minutes_hash = $5, version = version + 1
      WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId, actor.identityId, minutes.text, minutes.hash],
  );
  await appendEvent(client, groupId, actor, "meeting.closed", { meetingId, minutesHash: minutes.hash, finesIssued }, nowMs);
  const everyone = await client.query(`SELECT identity_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
  await notify(client, groupId, everyone.rows.map((r: { identity_id: string }) => r.identity_id), "minutes_ready", `group:${groupId}:meetings:${meetingId}`, `minutes:${meetingId}`);
  return { minutesHash: minutes.hash, finesIssued };
}

export async function approveMinutes(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  meetingId: string,
  input: { readonly hash: string; readonly inMeetingId: string | null },
  nowMs: number,
): Promise<void> {
  assertCanAct(actor.roles, "meeting.manage");
  const m = await lockMeeting(client, groupId, meetingId);
  if (m["state"] !== "closed" || m["minutes_approved_at"] !== null) throw new DomainError("MEETING_STATE_INVALID", "Procès-verbal non approuvable");
  assertMinutesApproval(String(m["minutes_hash"]), input.hash);
  await client.query(
    `UPDATE meeting SET minutes_approved_at = now(), minutes_approved_in = $3, version = version + 1 WHERE group_id = $1 AND meeting_id = $2`,
    [groupId, meetingId, input.inMeetingId],
  );
  await appendEvent(client, groupId, actor, "meeting.minutes_approved", { meetingId, hash: input.hash, inMeetingId: input.inMeetingId }, nowMs);
}

/* ── Amendes (L-09) ──────────────────────────────────────────────────── */

export async function issueFine(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly membershipId: string; readonly kind: FineKind; readonly amount?: bigint | null | undefined; readonly reason: string; readonly meetingId?: string | null | undefined; readonly obligationId?: string | null | undefined },
  nowMs: number,
): Promise<{ fineId: string; amount: string }> {
  assertCanAct(actor.roles, "fine.issue");
  if (!(FINE_KINDS as readonly string[]).includes(input.kind)) throw new DomainError("FINE_INVALID", "Type d'amende inconnu");
  const target = await membershipIdentity(client, groupId, input.membershipId);
  assertFineIssuable({ issuerIdentityId: actor.identityId, targetIdentityId: target.identityId, reason: input.reason });
  const g = await loadGroup(client, groupId);
  let requested = input.amount ?? null;
  if (input.kind === "late_contribution") {
    if (!input.obligationId) throw new DomainError("FINE_INVALID", "Échéance concernée requise");
    const ob = await client.query(
      `SELECT r.due_date_business, o.due_amount, o.validated_net FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
        WHERE o.group_id = $1 AND o.obligation_id = $2 AND o.member_membership_id = $3`,
      [groupId, input.obligationId, input.membershipId],
    );
    const o = ob.rows[0] as Record<string, unknown> | undefined;
    if (!o) throw new DomainError("OBJET_INTROUVABLE", "Échéance introuvable");
    requested = lateContributionFine(g.settings.fines, isoDate(o["due_date_business"]), doualaToday(nowMs));
    if (requested <= 0n) throw new DomainError("FINE_INVALID", "Pas de retard au-delà du délai de grâce");
  }
  const amount = fineAmount(g.settings.fines, input.kind, requested);
  if (amount <= 0n) throw new DomainError("FINE_INVALID", "Ce manquement n'a pas d'amende au règlement");
  const fineId = newId("fine");
  await client.query(
    `INSERT INTO fine (fine_id, group_id, membership_id, meeting_id, kind, amount, reason, issued_by_identity_id, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'issued')`,
    [fineId, groupId, input.membershipId, input.meetingId ?? null, input.kind, amount.toString(), input.reason.trim().slice(0, 300), actor.identityId],
  );
  await appendEvent(client, groupId, actor, "fine.issued", { fineId, membershipId: input.membershipId, kind: input.kind, amount }, nowMs);
  await notify(client, groupId, [target.identityId], "fine_issued", `group:${groupId}:fines`, `fine:${fineId}`);
  return { fineId, amount: amount.toString() };
}

export async function actOnFine(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  fineId: string,
  act: "contest" | "uphold" | "cancel",
  reason: string,
  nowMs: number,
): Promise<{ state: string }> {
  const f = await client.query(`SELECT membership_id, state FROM fine WHERE group_id = $1 AND fine_id = $2 FOR UPDATE`, [groupId, fineId]);
  const row = f.rows[0] as { membership_id: string; state: "issued" | "contested" | "paid" | "cancelled" } | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Amende introuvable");
  let to: "contested" | "issued" | "cancelled";
  if (act === "contest") {
    if (row.membership_id !== actor.membershipId) throw new DomainError("TONTINE_FORBIDDEN", "Seul le membre concerné conteste");
    if (reason.trim().length < 3) throw new DomainError("FINE_INVALID", "Motif de contestation obligatoire");
    to = "contested";
  } else {
    assertCanAct(actor.roles, "member.admit"); // présidence : arbitre la contestation
    if (row.membership_id === actor.membershipId) throw new DomainError("APPROVER_NOT_DISTINCT", "On n'arbitre pas sa propre amende");
    to = act === "uphold" ? "issued" : "cancelled";
    if (to === "cancelled" && reason.trim().length < 3) throw new DomainError("FINE_INVALID", "Motif d'annulation obligatoire");
  }
  transitionFine(row.state, to);
  await client.query(
    `UPDATE fine SET state = $3, cancel_reason = CASE WHEN $3 = 'cancelled' THEN $4 ELSE cancel_reason END, version = version + 1
      WHERE group_id = $1 AND fine_id = $2`,
    [groupId, fineId, to, reason.trim().slice(0, 300)],
  );
  await appendEvent(client, groupId, actor, `fine.${act}`, { fineId, reason: reason.slice(0, 200) }, nowMs);
  return { state: to };
}

export async function listFines(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown[]> {
  const g = await loadGroup(client, groupId);
  const bureau = actor.roles.some((r) => r !== "member");
  const res = await client.query(
    `SELECT fi.fine_id, fi.membership_id, mm.display_name, fi.kind, fi.amount, fi.reason, fi.state, fi.issued_at, fi.meeting_id
       FROM fine fi JOIN membership mm ON mm.group_id = fi.group_id AND mm.membership_id = fi.membership_id
      WHERE fi.group_id = $1 AND ($2::boolean OR fi.membership_id = $3) ORDER BY fi.issued_at DESC LIMIT 200`,
    [groupId, bureau || g.settings.transparency === "all_members", actor.membershipId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, amount: String(r["amount"]) }));
}

/* ── Secours (L-08) ──────────────────────────────────────────────────── */

export async function requestAid(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly beneficiaryMembershipId: string; readonly event: AidEvent; readonly eventDate: string; readonly note: string | null },
  nowMs: number,
): Promise<{ aidId: string; amount: string }> {
  assertCanAct(actor.roles, "aid.request");
  if (!(AID_EVENTS as readonly string[]).includes(input.event)) throw new DomainError("AID_INVALID", "Événement inconnu");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) throw new DomainError("AID_INVALID", "Date invalide");
  await membershipIdentity(client, groupId, input.beneficiaryMembershipId);
  const g = await loadGroup(client, groupId);
  const year = fiscalYear(input.eventDate);
  const prior = await client.query(
    `SELECT count(*)::int AS n FROM aid_request WHERE group_id = $1 AND beneficiary_membership_id = $2 AND event = $3
        AND state IN ('approved','paid') AND extract(year FROM event_date) = $4`,
    [groupId, input.beneficiaryMembershipId, input.event, year],
  );
  const amount = aidAmount({ scale: g.settings.aidScale, event: input.event, alreadyThisYear: Number(prior.rows[0]?.n ?? 0) });
  const fund = await fundOfKind(client, groupId, "solidarity");
  const aidId = newId("aid");
  await client.query(
    `INSERT INTO aid_request (aid_id, group_id, fund_id, beneficiary_membership_id, event, event_date, amount, note, state, requested_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, 'requested', $9)`,
    [aidId, groupId, fund.fundId, input.beneficiaryMembershipId, input.event, input.eventDate, amount.toString(), input.note, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "aid.requested", { aidId, event: input.event, amount }, nowMs);
  await notify(client, groupId, await identitiesWithRoles(client, groupId, ["animator", "vice_president", "secretary", "treasurer"]), "aid_decided", `group:${groupId}:aids`, `aidreq:${aidId}`);
  return { aidId, amount: amount.toString() };
}

export async function decideAid(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  aidId: string,
  input: { readonly decision: "approve" | "reject"; readonly overrideAmount?: bigint | null | undefined; readonly overrideReason?: string | null | undefined; readonly note?: string | null | undefined },
  nowMs: number,
): Promise<{ state: string; amount: string }> {
  assertCanAct(actor.roles, "aid.decide");
  const a = await client.query(
    `SELECT beneficiary_membership_id, event, event_date, amount, state FROM aid_request WHERE group_id = $1 AND aid_id = $2 FOR UPDATE`,
    [groupId, aidId],
  );
  const row = a.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
  const ben = await membershipIdentity(client, groupId, String(row["beneficiary_membership_id"]));
  assertAidDecider(actor.identityId, ben.identityId);
  const to = transitionAid(row["state"] as "requested", input.decision === "approve" ? "approved" : "rejected");
  let amount = toBig(row["amount"]);
  if (input.decision === "approve" && input.overrideAmount) {
    const g = await loadGroup(client, groupId);
    amount = aidAmount({
      scale: g.settings.aidScale,
      event: row["event"] as AidEvent,
      alreadyThisYear: 0,
      overrideAmount: input.overrideAmount,
      overrideReason: input.overrideReason ?? null,
    });
  }
  await client.query(
    `UPDATE aid_request SET state = $3, amount = $4, override_reason = $5, decided_by_identity_id = $6, decided_at = now(), decision_note = $7,
            version = version + 1 WHERE group_id = $1 AND aid_id = $2`,
    [groupId, aidId, to, amount.toString(), input.overrideReason ?? null, actor.identityId, input.note ?? null],
  );
  await appendEvent(client, groupId, actor, `aid.${to}`, { aidId, amount }, nowMs);
  await notify(client, groupId, [ben.identityId], "aid_decided", `group:${groupId}:aids`, `aid:${aidId}`);
  return { state: to, amount: amount.toString() };
}

export async function payAid(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  aidId: string,
  input: { readonly channel: PaymentChannel; readonly reference?: string | null | undefined; readonly justification?: string | null | undefined },
  nowMs: number,
): Promise<{ movementId: string }> {
  if (!actor.roles.some((r) => TREASURY.includes(r))) throw new DomainError("TONTINE_FORBIDDEN", "Versement déclaré par la trésorerie");
  const a = await client.query(`SELECT fund_id, beneficiary_membership_id, amount, state FROM aid_request WHERE group_id = $1 AND aid_id = $2`, [groupId, aidId]);
  const row = a.rows[0] as Record<string, unknown> | undefined;
  if (!row || row["state"] !== "approved") throw new DomainError("AID_INVALID", "Secours non approuvé");
  const out = await declareMovement(
    client,
    groupId,
    actor,
    {
      fundId: String(row["fund_id"]),
      kind: "payout",
      amount: toBig(row["amount"]),
      channel: input.channel,
      reference: input.reference ?? null,
      justification: input.justification ?? null,
      membershipId: String(row["beneficiary_membership_id"]),
      relatedKind: "aid",
      relatedId: aidId,
    },
    nowMs,
  );
  const ben = await membershipIdentity(client, groupId, String(row["beneficiary_membership_id"]));
  await notify(client, groupId, [ben.identityId], "payout_recorded", `group:${groupId}:validations`, `aidpay:${out.movementId}`);
  return out;
}

export async function listAids(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(
    `SELECT a.aid_id, a.beneficiary_membership_id, mm.display_name, a.event, a.event_date, a.amount, a.state, a.requested_at, a.decided_at
       FROM aid_request a JOIN membership mm ON mm.group_id = a.group_id AND mm.membership_id = a.beneficiary_membership_id
      WHERE a.group_id = $1 ORDER BY a.requested_at DESC LIMIT 200`,
    [groupId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, amount: String(r["amount"]), event_date: isoDate(r["event_date"]) }));
}

/* ── Dettes, avances, avaliseur (L-10) ───────────────────────────────── */

export async function openDebtAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly debtorMembershipId: string; readonly origin: DebtOrigin; readonly amount: bigint; readonly creditorFundId?: string | null | undefined; readonly originRef?: string | null | undefined },
  nowMs: number,
): Promise<{ debtId: string }> {
  assertCanAct(actor.roles, "debt.manage");
  const sponsor = await client.query(`SELECT sponsor_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2`, [
    groupId,
    input.debtorMembershipId,
  ]);
  if (!sponsor.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
  const guarantor = (sponsor.rows[0].sponsor_membership_id as string | null) ?? null;
  const debtId = newId("debt");
  const debt = openDebt({
    debtId,
    debtorMembershipId: input.debtorMembershipId,
    origin: input.origin,
    amount: input.amount,
    creditorFundId: input.creditorFundId ?? null,
    guarantorMembershipId: guarantor,
  });
  await client.query(
    `INSERT INTO member_debt (debt_id, group_id, debtor_membership_id, origin, origin_ref, amount, settled, state, creditor_fund_id,
                              guarantor_membership_id, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 'open', $7, $8, $9)`,
    [debtId, groupId, debt.debtorMembershipId, debt.origin, input.originRef ?? null, debt.amount.toString(), debt.creditorFundId, guarantor, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "debt.opened", { debtId, debtor: debt.debtorMembershipId, origin: debt.origin, amount: debt.amount }, nowMs);
  const notified = [(await membershipIdentity(client, groupId, debt.debtorMembershipId)).identityId];
  if (guarantor) notified.push((await membershipIdentity(client, groupId, guarantor)).identityId);
  await notify(client, groupId, notified, "due_reminder", `group:${groupId}:debts`, `debt:${debtId}`);
  return { debtId };
}

export async function writeOffDebtAct(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  debtId: string,
  reason: string,
  nowMs: number,
): Promise<void> {
  assertCanAct(actor.roles, "debt.manage");
  const d = await client.query(
    `SELECT debtor_membership_id, origin, amount, settled, state, creditor_fund_id, guarantor_membership_id FROM member_debt
      WHERE group_id = $1 AND debt_id = $2 FOR UPDATE`,
    [groupId, debtId],
  );
  const r = d.rows[0] as Record<string, unknown> | undefined;
  if (!r) throw new DomainError("OBJET_INTROUVABLE", "Dette introuvable");
  const debtor = await membershipIdentity(client, groupId, String(r["debtor_membership_id"]));
  writeOffDebt(
    {
      debtId,
      debtorMembershipId: String(r["debtor_membership_id"]),
      origin: r["origin"] as DebtOrigin,
      amount: toBig(r["amount"]),
      settled: toBig(r["settled"]),
      state: r["state"] as "open",
      creditorFundId: (r["creditor_fund_id"] as string | null) ?? null,
      guarantorMembershipId: (r["guarantor_membership_id"] as string | null) ?? null,
    },
    { reason, deciderIdentityId: actor.identityId, debtorIdentityId: debtor.identityId },
  );
  await client.query(
    `UPDATE member_debt SET state = 'written_off', write_off_reason = $3, decided_by_identity_id = $4, closed_at = now(), version = version + 1
      WHERE group_id = $1 AND debt_id = $2`,
    [groupId, debtId, reason.trim().slice(0, 300), actor.identityId],
  );
  await appendEvent(client, groupId, actor, "debt.written_off", { debtId, reason: reason.slice(0, 200) }, nowMs);
}

export async function listDebts(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown[]> {
  const bureau = actor.roles.some((r) => r !== "member");
  const res = await client.query(
    `SELECT d.debt_id, d.debtor_membership_id, mm.display_name, d.origin, d.amount, d.settled, d.state, d.guarantor_membership_id,
            g.display_name AS guarantor_name, d.created_at
       FROM member_debt d JOIN membership mm ON mm.group_id = d.group_id AND mm.membership_id = d.debtor_membership_id
       LEFT JOIN membership g ON g.group_id = d.group_id AND g.membership_id = d.guarantor_membership_id
      WHERE d.group_id = $1 AND ($2::boolean OR d.debtor_membership_id = $3 OR d.guarantor_membership_id = $3)
      ORDER BY d.created_at DESC LIMIT 200`,
    [groupId, bureau, actor.membershipId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, amount: String(r["amount"]), settled: String(r["settled"]) }));
}

/* ── Mes échéances (I-06) ────────────────────────────────────────────── */

export async function myObligations(client: pg.PoolClient, groupId: string, actor: TontineActor, nowMs: number): Promise<unknown[]> {
  const g = await loadGroup(client, groupId);
  const res = await client.query(
    `SELECT o.obligation_id, r.seq, r.due_date_business, o.due_amount, o.active_reserved, o.validated_net,
            (SELECT meeting_id FROM meeting mt WHERE mt.group_id = r.group_id AND mt.round_seq = r.seq LIMIT 1) AS meeting_id
       FROM obligation o JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
      WHERE o.group_id = $1 AND o.member_membership_id = $2 ORDER BY r.seq`,
    [groupId, actor.membershipId],
  );
  const today = doualaToday(nowMs);
  return res.rows.map((r: Record<string, unknown>) => {
    const due = toBig(r["due_amount"]);
    const validated = toBig(r["validated_net"]);
    const date = r["due_date_business"] ? isoDate(r["due_date_business"]) : null;
    const settled = validated >= due;
    return {
      obligationId: r["obligation_id"],
      roundSeq: r["seq"],
      dueDate: date,
      due: due.toString(),
      declared: String(r["active_reserved"]),
      validated: validated.toString(),
      remaining: (due - toBig(r["active_reserved"])).toString(),
      status: settled ? "settled" : date ? lateness(date, today, g.settings.fines.graceDays) : "on_time",
      meetingId: r["meeting_id"],
    };
  });
}

/* ── Réserve de fin d'année : redistribution ─────────────────────────── */

/**
 * Redistribue la réserve de fin d'année : chaque membre récupère ce qu'il y a
 * versé (moins ce qu'il a déjà reçu), au prorata si la caisse ne couvre pas
 * tout. Une remise déclarée par membre ; chaque bénéficiaire confirme la
 * réception (règle des remises). Aucun mouvement de la réserve ne doit être
 * en attente, ce qui empêche une double redistribution.
 */
export async function distributeYearEndReserve(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly channel: PaymentChannel; readonly reference?: string | null | undefined; readonly justification?: string | null | undefined },
  nowMs: number,
): Promise<{ distributions: { membershipId: string; amount: string; movementId: string }[] }> {
  if (!actor.roles.some((r) => TREASURY.includes(r))) throw new DomainError("TONTINE_FORBIDDEN", "La redistribution est déclarée par la trésorerie");
  const fund = await fundOfKind(client, groupId, "year_end_reserve");
  await client.query(`SELECT 1 FROM fund WHERE group_id = $1 AND fund_id = $2 FOR UPDATE`, [groupId, fund.fundId]);
  const l = await ledgerOf(client, groupId, fund.fundId);
  if (l.inProgressOut > 0n || l.inProgressIn > 0n) {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Des mouvements de la réserve attendent encore leur validation");
  }
  if (l.registerBalance <= 0n) throw new DomainError("FUND_INVALID", "La réserve est vide");
  const per = await client.query(
    `SELECT membership_id,
            COALESCE(sum(amount) FILTER (WHERE kind = 'contribution'), 0)::text AS contributed,
            COALESCE(sum(amount) FILTER (WHERE kind = 'payout'), 0)::text AS received
       FROM fund_movement
      WHERE group_id = $1 AND fund_id = $2 AND state = 'validated' AND membership_id IS NOT NULL
      GROUP BY membership_id`,
    [groupId, fund.fundId],
  );
  const shares = reserveDistribution(
    per.rows.map((r: Record<string, unknown>) => ({
      membershipId: String(r["membership_id"]),
      contributed: toBig(r["contributed"]),
      received: toBig(r["received"]),
    })),
    l.registerBalance,
  );
  if (shares.length === 0) throw new DomainError("FUND_INVALID", "Aucun versement à redistribuer");
  const out: { membershipId: string; amount: string; movementId: string }[] = [];
  for (const sh of shares) {
    const mv = await declareMovement(
      client,
      groupId,
      actor,
      {
        fundId: fund.fundId,
        kind: "payout",
        amount: sh.amount,
        channel: input.channel,
        reference: input.reference ?? null,
        justification: input.justification ?? "Redistribution de la réserve de fin d'année",
        membershipId: sh.membershipId,
      },
      nowMs,
    );
    out.push({ membershipId: sh.membershipId, amount: sh.amount.toString(), movementId: mv.movementId });
    const ben = await membershipIdentity(client, groupId, sh.membershipId);
    await notify(client, groupId, [ben.identityId], "payout_recorded", `group:${groupId}:validations`, `reserve:${mv.movementId}`);
  }
  await appendEvent(client, groupId, actor, "reserve.distributed", { fundId: fund.fundId, members: out.length, total: l.registerBalance }, nowMs);
  return { distributions: out };
}

/* ── Statuts générés (L-12) ──────────────────────────────────────────── */

export async function publishStatutes(client: pg.PoolClient, groupId: string, actor: TontineActor, nowMs: number): Promise<{ version: number; hash: string }> {
  assertCanAct(actor.roles, "statutes.publish");
  const g = await loadGroup(client, groupId);
  const sched = await client.query(
    `SELECT cs.cadence, cs.rules_version, rv.snapshot FROM cycle_schedule cs
       JOIN rule_version rv ON rv.group_id = cs.group_id AND rv.rules_version = cs.rules_version WHERE cs.group_id = $1`,
    [groupId],
  );
  const s = sched.rows[0] as Record<string, unknown> | undefined;
  const cadence = (s?.["cadence"] as Cadence | null | undefined) ?? { kind: "monthly_day", day: 1 };
  const funds = await client.query(`SELECT kind, name, rules FROM fund WHERE group_id = $1 AND state = 'active' ORDER BY created_at`, [groupId]);
  const bureau = await client.query(
    `SELECT r.role, m.display_name, r.mandate_end FROM role_assignment r JOIN membership m USING (group_id, membership_id)
      WHERE r.group_id = $1 AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL AND r.role <> 'member' ORDER BY r.role`,
    [groupId],
  );
  const doc = buildStatutes({
    groupName: g.name,
    seat: g.settings.seat,
    purpose: g.settings.purpose,
    cadence,
    meetingPlace: g.settings.meetingPlace,
    funds: (funds.rows as Record<string, unknown>[]).map((f) => {
      const rules = reviveFundRules(f["rules"]);
      return { kind: f["kind"] as FundKind, name: String(f["name"]), perMeetingAmount: rules.perMeetingAmount, annualAmount: rules.annualAmount };
    }),
    rotationContribution: s ? toBig((s["snapshot"] as Record<string, unknown>)["contribution"]) : null,
    fines: g.settings.fines,
    aidScale: g.settings.aidScale,
    bureau: (bureau.rows as Record<string, unknown>[]).map((b) => ({
      role: b["role"] as GroupRole,
      name: String(b["display_name"] ?? "Membre"),
      mandateEnd: b["mandate_end"] ? isoDate(b["mandate_end"]) : null,
    })),
    feeBearer: g.settings.feeBearer,
    transparency: g.settings.transparency,
    guarantorRequired: g.settings.guarantorRequired,
    newcomersLast: g.settings.newcomersLast,
    rulesVersion: s ? Number(s["rules_version"]) : 0,
  });
  const last = await client.query(`SELECT version, hash FROM statutes_version WHERE group_id = $1 ORDER BY version DESC LIMIT 1`, [groupId]);
  if (last.rows[0]?.hash === doc.hash) return { version: Number(last.rows[0].version), hash: doc.hash };
  const version = Number(last.rows[0]?.version ?? 0) + 1;
  await client.query(
    `INSERT INTO statutes_version (group_id, version, title, body, hash, rules_version, published_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [groupId, version, doc.title, doc.text, doc.hash, s ? Number(s["rules_version"]) : null, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "statutes.published", { version, hash: doc.hash }, nowMs);
  return { version, hash: doc.hash };
}

export async function latestStatutes(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown> {
  const res = await client.query(
    `SELECT s.version, s.title, s.body, s.hash, s.published_at,
            EXISTS (SELECT 1 FROM statutes_acceptance a WHERE a.group_id = s.group_id AND a.version = s.version AND a.identity_id = $2) AS accepted_by_me,
            (SELECT count(*)::int FROM statutes_acceptance a WHERE a.group_id = s.group_id AND a.version = s.version) AS acceptances
       FROM statutes_version s WHERE s.group_id = $1 ORDER BY s.version DESC LIMIT 1`,
    [groupId, actor.identityId],
  );
  return res.rows[0] ?? null;
}

export async function acceptStatutes(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  version: number,
  hash: string,
  nowMs: number,
): Promise<void> {
  const res = await client.query(`SELECT hash FROM statutes_version WHERE group_id = $1 AND version = $2`, [groupId, version]);
  if (!res.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Statuts introuvables");
  if (res.rows[0].hash !== hash) throw new DomainError("RULE_ACCEPT_HASH_MISMATCH", "Le texte a changé : relisez la dernière version");
  await client.query(
    `INSERT INTO statutes_acceptance (group_id, version, identity_id, hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [groupId, version, actor.identityId, hash],
  );
  await appendEvent(client, groupId, actor, "statutes.accepted", { version, hash }, nowMs);
}

/* ── Reprise d'historique (L-20) ─────────────────────────────────────── */

export async function importHistory(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  njangi: LegacyNjangi,
  nowMs: number,
): Promise<{ importId: string; accepted: number; rejected: number; report: unknown[] }> {
  assertCanAct(actor.roles, "import.history");
  const plan = planLegacyImport(njangi);
  const prior = await client.query(`SELECT 1 FROM legacy_import WHERE group_id = $1 AND legacy_group_id = $2`, [groupId, plan.legacyGroupId]);
  if (prior.rows.length > 0) throw new DomainError("IMPORT_INVALID", "Historique déjà importé pour ce groupe");
  const importId = newId("imp");
  const nameByUid = new Map(plan.members.map((m) => [m.legacyUid, m.displayName]));
  const byName = await client.query(`SELECT membership_id, display_name FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
  const memberByName = new Map((byName.rows as { membership_id: string; display_name: string | null }[]).map((r) => [(r.display_name ?? "").toLowerCase(), r.membership_id]));
  await client.query(
    `INSERT INTO legacy_import (import_id, group_id, legacy_group_id, report, imported_by_identity_id) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [importId, groupId, plan.legacyGroupId, JSON.stringify(plan.report), actor.identityId],
  );
  for (const c of plan.contributions) {
    const name = nameByUid.get(c.legacyUid) ?? "Membre";
    await client.query(
      `INSERT INTO legacy_contribution (group_id, legacy_id, import_id, legacy_member_name, membership_id, amount, contribution_date, imported_historical)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, true)`,
      [groupId, c.legacyId, importId, name, memberByName.get(name.toLowerCase()) ?? null, c.amount.toString(), c.date],
    );
  }
  const accepted = plan.report.filter((r) => r.accepted).length;
  await appendEvent(client, groupId, actor, "history.imported", { importId, legacyGroupId: plan.legacyGroupId, accepted, rejected: plan.report.length - accepted }, nowMs);
  return { importId, accepted, rejected: plan.report.length - accepted, report: [...plan.report] };
}

export async function listLegacyContributions(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(
    `SELECT legacy_id, legacy_member_name, membership_id, amount, contribution_date FROM legacy_contribution
      WHERE group_id = $1 ORDER BY contribution_date DESC LIMIT 500`,
    [groupId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, amount: String(r["amount"]), contribution_date: isoDate(r["contribution_date"]) }));
}

/* ── Profil et notifications (self-scope identité) ───────────────────── */

export async function getProfile(client: pg.PoolClient, identityId: string): Promise<unknown> {
  const res = await client.query(`SELECT display_name, language FROM identity_profile WHERE identity_id = $1`, [identityId]);
  return { identityId, displayName: res.rows[0]?.display_name ?? null, language: res.rows[0]?.language ?? "fr" };
}

export async function putProfile(client: pg.PoolClient, identityId: string, input: { readonly displayName: string | null; readonly language: "fr" | "en" | "pcm" }): Promise<unknown> {
  await client.query(
    `INSERT INTO identity_profile (identity_id, display_name, language, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (identity_id) DO UPDATE SET display_name = EXCLUDED.display_name, language = EXCLUDED.language, updated_at = now()`,
    [identityId, input.displayName, input.language],
  );
  return getProfile(client, identityId);
}

export async function listNotifications(client: pg.PoolClient): Promise<unknown[]> {
  const res = await client.query(
    `SELECT n.notification_id, n.group_id, n.kind, n.target, n.created_at, n.read_at
       FROM inbox_notification n ORDER BY n.created_at DESC LIMIT 100`,
  );
  return res.rows.map((r: Record<string, unknown>) => ({ ...r, notification_id: String(r["notification_id"]) }));
}

export async function markNotificationRead(client: pg.PoolClient, id: string): Promise<void> {
  await client.query(`UPDATE inbox_notification SET read_at = now() WHERE notification_id = $1 AND read_at IS NULL`, [id]);
}
