/**
 * KÓMBE @kombe/api — routes HTTP « tontine réelle » (mode réel uniquement).
 * Session Bearer obligatoire ; groupe toujours dans le chemin ; acteur et
 * fonctions résolus côté serveur ; décisions dans `@kombe/domain`.
 */
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import {
  AID_EVENTS,
  ATTENDANCE_STATUSES,
  DEBT_ORIGINS,
  FINE_KINDS,
  FUND_KINDS,
  MOVEMENT_KINDS,
  PAYMENT_CHANNELS,
  POSITIONING,
  type Cadence,
  type FeatureFlag,
  type FundKind,
  type LegacyNjangi,
} from "@kombe/domain";
import { withGroupTx } from "../db/txContext.js";
import { sessionIdentity, withActor, withSessionIdentity, newId } from "./context.js";
import * as G from "./groups.js";
import * as A from "./association.js";
import * as I from "./insights.js";

const id = z.string().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z
  .union([z.number().int().positive().max(1_000_000_000), z.string().regex(/^\d{1,10}$/)])
  .transform((v) => BigInt(v));
const moneyOrZero = z
  .union([z.number().int().min(0).max(1_000_000_000), z.string().regex(/^\d{1,10}$/)])
  .transform((v) => BigInt(v));
const weekday = z.number().int().min(0).max(6);
const cadence: z.ZodType<Cadence> = z.union([
  z.object({ kind: z.literal("daily"), excludedWeekdays: z.array(weekday).max(6).optional() }),
  z.object({ kind: z.literal("every_n_days"), n: z.number().int() }),
  z.object({ kind: z.literal("weekly"), weekday }),
  z.object({ kind: z.literal("biweekly"), weekday }),
  z.object({ kind: z.literal("monthly_day"), day: z.number().int() }),
  z.object({ kind: z.literal("monthly_nth_weekday"), nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]), weekday }),
]) as z.ZodType<Cadence>;
const channel = z.enum(PAYMENT_CHANNELS);
const optText = (max: number) => z.string().max(max).nullable().optional();

const fineSchedule = z.object({
  lateContributionFixed: moneyOrZero,
  lateContributionPerDay: moneyOrZero,
  lateContributionCap: moneyOrZero,
  meetingLate: moneyOrZero,
  meetingAbsence: moneyOrZero,
  indisciplineCap: moneyOrZero,
  graceDays: z.number().int().min(0).max(60),
});
const settingsPatch = z
  .object({
    transparency: z.enum(["all_members", "bureau_only", "anonymized"]),
    feeBearer: z.enum(["member", "beneficiary", "fund"]),
    guarantorRequired: z.boolean(),
    newcomersLast: z.boolean(),
    minMembers: z.number().int(),
    maxMembers: z.number().int(),
    fines: fineSchedule,
    aidScale: z.array(z.object({ event: z.enum(AID_EVENTS), amount: money, maxPerYear: z.number().int().min(0).max(52) })).max(20),
    seat: z.string().max(120).nullable(),
    purpose: z.string().max(300).nullable(),
    meetingPlace: z.string().max(120).nullable(),
    minimumWitnesses: z.number().int(),
  })
  .partial();

function gid(params: unknown): string {
  return id.parse((params as { groupId?: unknown }).groupId);
}
function pid(params: unknown, key: string): string {
  return id.parse((params as Record<string, unknown>)[key]);
}

export interface TontineDeps {
  readonly pool: pg.Pool;
  readonly now: () => number;
  readonly featureFlags: readonly FeatureFlag[];
}

export function registerTontineRoutes(app: FastifyInstance, deps: TontineDeps): void {
  const { pool, now } = deps;
  const enabledKinds: FundKind[] = [
    ...(deps.featureFlags.includes("loan_register") ? (["loan"] as const) : []),
    ...(deps.featureFlags.includes("daily_collector") ? (["collector"] as const) : []),
  ];
  const act = <T>(request: { headers: Record<string, unknown>; params: unknown }, fn: Parameters<typeof withActor<T>>[4]) =>
    withActor<T>(pool, request, gid(request.params), now, fn);

  /* Produit */
  app.get("/v1/product", async () => ({ positioning: POSITIONING, featureFlags: deps.featureFlags }));

  /* Identité */
  app.get("/v1/me/groups", async (request) => withSessionIdentity(pool, request, now, (c) => G.myGroups(c)));
  app.get("/v1/me/profile", async (request) => withSessionIdentity(pool, request, now, (c, me) => A.getProfile(c, me)));
  app.put("/v1/me/profile", async (request) => {
    const body = z.object({ displayName: z.string().min(1).max(80).nullable(), language: z.enum(["fr", "en", "pcm"]) }).parse(request.body);
    return withSessionIdentity(pool, request, now, (c, me) => A.putProfile(c, me, body));
  });
  app.get("/v1/me/notifications", async (request) => withSessionIdentity(pool, request, now, (c) => A.listNotifications(c)));
  app.post("/v1/me/notifications/:notificationId/read", async (request, reply) => {
    const nid = z.string().regex(/^\d{1,18}$/).parse((request.params as { notificationId?: unknown }).notificationId);
    await withSessionIdentity(pool, request, now, (c) => A.markNotificationRead(c, nid));
    return reply.code(204).send();
  });

  /* Création de groupe : le créateur devient Président. */
  app.post("/v1/tontine/groups", async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        displayName: z.string().min(1).max(80),
        funds: z.array(z.enum(FUND_KINDS)).max(7).optional(),
        settings: settingsPatch.optional(),
      })
      .parse(request.body);
    const identityId = await sessionIdentity(pool, request, now);
    const groupId = newId("grp");
    const out = await withGroupTx(pool, groupId, (c) =>
      G.createGroup(c, identityId, groupId, { name: body.name, displayName: body.displayName, funds: body.funds, settings: body.settings as Partial<G.GroupSettings> | undefined }, now()),
    );
    return reply.code(201).send(out);
  });

  /* Simulateur de cycle (avant création) */
  app.post("/v1/tontine/simulations", async (request) => {
    const body = z.object({ cadence, startDate: isoDate, shares: z.number().int(), contributionPerShare: money }).parse(request.body);
    await sessionIdentity(pool, request, now);
    return I.simulateCycle(body);
  });

  /* Rejoindre avec un code */
  app.get("/v1/invitations/by-code/:code", async (request) => {
    const code = z.string().regex(/^[A-Za-z0-9]{8}$/).parse((request.params as { code?: unknown }).code);
    const inv = await withSessionIdentity(pool, request, now, (c) => G.invitationByCode(c, code));
    return { groupId: inv.groupId, groupName: inv.groupName, usable: inv.usable };
  });
  app.post("/v1/invitations/by-code/:code/requests", async (request, reply) => {
    const code = z.string().regex(/^[A-Za-z0-9]{8}$/).parse((request.params as { code?: unknown }).code);
    const body = z.object({ displayName: z.string().min(1).max(80), sponsorMembershipId: id.nullable().optional() }).parse(request.body);
    const identityId = await sessionIdentity(pool, request, now);
    const inv = await withSessionIdentity(pool, request, now, (c) => G.invitationByCode(c, code));
    if (!inv.usable) return reply.code(410).send({ code: "INVITATION_INVALID", message: "Requête refusée" });
    const out = await withGroupTx(pool, inv.groupId, (c) => G.requestMembership(c, inv.groupId, identityId, inv.invitationId, body, now()));
    return reply.code(201).send({ ...out, groupId: inv.groupId });
  });

  /* Groupe */
  app.get("/v1/groups/:groupId/overview", async (request) => act(request, (c, a) => G.overview(c, gid(request.params), a)));
  app.get("/v1/groups/:groupId/members", async (request) => act(request, (c, a) => G.members(c, gid(request.params), a)));
  app.patch("/v1/groups/:groupId/settings", async (request) => {
    const body = settingsPatch.parse(request.body);
    return act(request, (c, a) => G.updateSettings(c, gid(request.params), a, body as Partial<G.GroupSettings>, now()));
  });
  app.get("/v1/groups/:groupId/invitations", async (request) => act(request, (c, a) => G.listInvitations(c, gid(request.params), a)));
  app.post("/v1/groups/:groupId/invitations", async (request, reply) => {
    const body = z
      .object({ maxUses: z.number().int().default(20), ttlHours: z.number().int().default(168), channel: z.enum(["link", "whatsapp"]).default("link") })
      .parse(request.body ?? {});
    const out = await act(request, (c, a) => G.createInvitation(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/invitations/:invitationId/revocations", async (request, reply) => {
    await act(request, (c, a) => G.revokeInvitation(c, gid(request.params), a, pid(request.params, "invitationId"), now()));
    return reply.code(204).send();
  });
  app.post("/v1/groups/:groupId/memberships/:membershipId/decisions", async (request) => {
    const body = z.object({ decision: z.enum(["admit", "refuse"]) }).parse(request.body);
    return act(request, (c, a) => G.decideMembership(c, gid(request.params), a, pid(request.params, "membershipId"), body.decision, now()));
  });

  /* Bureau */
  app.get("/v1/groups/:groupId/roles", async (request) => act(request, (c) => G.listRoles(c, gid(request.params))));
  app.post("/v1/groups/:groupId/roles", async (request, reply) => {
    const body = z.object({ membershipId: id, role: z.string().max(40), mandateStart: isoDate, mandateEnd: isoDate.nullable().default(null) }).parse(request.body);
    const out = await act(request, (c, a) => G.proposeRole(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/roles/:roleAssignmentId/acceptances", async (request, reply) => {
    await act(request, (c, a) => G.acceptRole(c, gid(request.params), a, pid(request.params, "roleAssignmentId"), now()));
    return reply.code(204).send();
  });
  app.post("/v1/groups/:groupId/roles/:roleAssignmentId/end", async (request, reply) => {
    const body = z.object({ reason: z.string().max(300).default("") }).parse(request.body ?? {});
    await act(request, (c, a) => G.endRole(c, gid(request.params), a, pid(request.params, "roleAssignmentId"), body.reason, now()));
    return reply.code(204).send();
  });

  /* Calendrier, parts, tirage, échanges */
  app.get("/v1/groups/:groupId/tontine-schedule", async (request) => act(request, (c) => G.getSchedule(c, gid(request.params))));
  app.put("/v1/groups/:groupId/tontine-schedule", async (request) => {
    const body = z
      .object({
        cadence,
        startDate: isoDate,
        contributionPerShare: money,
        dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        order: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("join_order") }),
          z.object({ mode: z.literal("manual"), membershipIds: z.array(id).max(200) }),
          z.object({ mode: z.literal("draw"), drawId: id }),
        ]),
        shares: z.array(z.object({ holders: z.array(z.object({ membershipId: id, weight: z.number().int() })).min(1).max(4) })).max(400).optional(),
      })
      .parse(request.body);
    return act(request, (c, a) => G.buildSchedule(c, gid(request.params), a, body, now()));
  });
  app.post("/v1/groups/:groupId/tontine-schedule/start", async (request) => act(request, (c, a) => G.startSchedule(c, gid(request.params), a, now())));
  app.post("/v1/groups/:groupId/draws", async (request, reply) => {
    const body = z.object({ commitment: z.string().regex(/^[0-9a-f]{64}$/) }).parse(request.body);
    const out = await act(request, (c, a) => G.commitDraw(c, gid(request.params), a, body.commitment, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/draws/:drawId/reveal", async (request) => {
    const body = z.object({ seed: z.string().min(16).max(200) }).parse(request.body);
    return act(request, (c, a) => G.revealDraw(c, gid(request.params), a, pid(request.params, "drawId"), body.seed, now()));
  });
  app.get("/v1/groups/:groupId/order-changes", async (request) => act(request, (c) => G.listOrderChanges(c, gid(request.params))));
  app.post("/v1/groups/:groupId/order-changes", async (request, reply) => {
    const body = z.object({ seqA: z.number().int().min(1), seqB: z.number().int().min(1), reason: z.string().max(500).nullable().default(null) }).parse(request.body);
    const out = await act(request, (c, a) => G.requestSwap(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/order-changes/:changeId/:act", async (request) => {
    const verb = z.enum(["accept", "approve", "reject"]).parse((request.params as { act?: unknown }).act);
    return act(request, (c, a) => G.actOnSwap(c, gid(request.params), a, pid(request.params, "changeId"), verb, now()));
  });

  /* Mes échéances, file à valider */
  app.get("/v1/groups/:groupId/my-obligations", async (request) => act(request, (c, a) => A.myObligations(c, gid(request.params), a, now())));
  app.get("/v1/groups/:groupId/pending-validations", async (request) => act(request, (c, a) => A.pendingForActor(c, gid(request.params), a)));

  /* Mon tour, régularité, résumé partageable */
  app.get("/v1/groups/:groupId/my-forecast", async (request) => act(request, (c, a) => I.myForecast(c, gid(request.params), a)));
  app.get("/v1/groups/:groupId/regularity", async (request) => act(request, (c, a) => I.regularity(c, gid(request.params), a, now())));
  app.get("/v1/groups/:groupId/meetings/:meetingId/share-text", async (request) =>
    act(request, (c, a) => I.meetingShareText(c, gid(request.params), a, pid(request.params, "meetingId"))),
  );

  /* Caisses et mouvements */
  app.get("/v1/groups/:groupId/funds", async (request) => act(request, (c) => A.listFunds(c, gid(request.params))));
  app.post("/v1/groups/:groupId/funds", async (request, reply) => {
    const body = z
      .object({ kind: z.enum(FUND_KINDS), name: z.string().min(1).max(80), perMeetingAmount: moneyOrZero.default(0), annualAmount: moneyOrZero.default(0), controlRequired: z.boolean().default(true) })
      .parse(request.body);
    const out = await act(request, (c, a) => A.createFund(c, gid(request.params), a, body, enabledKinds, now()));
    return reply.code(201).send(out);
  });
  app.get("/v1/groups/:groupId/movements", async (request) => {
    const q = z
      .object({ state: z.enum(["declared", "confirmed", "validated", "rejected", "compensated"]).optional(), fundId: id.optional(), meetingId: id.optional(), mine: z.enum(["true", "false"]).optional() })
      .parse(request.query ?? {});
    return act(request, (c, a) => A.listMovements(c, gid(request.params), a, { state: q.state, fundId: q.fundId, meetingId: q.meetingId, mine: q.mine === "true" }));
  });
  app.post("/v1/groups/:groupId/movements", async (request, reply) => {
    const body = z
      .object({
        fundId: id,
        kind: z.enum(MOVEMENT_KINDS),
        amount: money,
        channel,
        reference: optText(64),
        justification: optText(500),
        allegedDate: isoDate.nullable().optional(),
        membershipId: id.nullable().optional(),
        meetingId: id.nullable().optional(),
        obligationId: id.nullable().optional(),
        relatedKind: z.enum(["fine", "aid", "debt", "advance"]).nullable().optional(),
        relatedId: id.nullable().optional(),
        payerNote: optText(120),
      })
      .parse(request.body);
    const key = request.headers["idempotency-key"];
    const idem = typeof key === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(key) ? key : undefined;
    const out = await act(request, (c, a) => A.declareMovement(c, gid(request.params), a, body, now(), idem));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/movements/:movementId/confirmations", async (request) =>
    act(request, (c, a) => A.confirmMovementAct(c, gid(request.params), a, pid(request.params, "movementId"), now())),
  );
  app.post("/v1/groups/:groupId/movements/:movementId/controls", async (request) =>
    act(request, (c, a) => A.controlMovementAct(c, gid(request.params), a, pid(request.params, "movementId"), now())),
  );
  app.post("/v1/groups/:groupId/movements/:movementId/rejections", async (request) => {
    const body = z.object({ reason: z.string().min(3).max(500) }).parse(request.body);
    return act(request, (c, a) => A.rejectMovementAct(c, gid(request.params), a, pid(request.params, "movementId"), body.reason, now()));
  });
  app.post("/v1/groups/:groupId/movements/confirmations", async (request) => {
    const body = z.object({ movementIds: z.array(id).min(1).max(100) }).parse(request.body);
    return act(request, async (c, a) => {
      const out: Record<string, string> = {};
      for (const m of body.movementIds) out[m] = (await A.confirmMovementAct(c, gid(request.params), a, m, now())).state;
      return out;
    });
  });

  /* Séances */
  app.get("/v1/groups/:groupId/meetings", async (request) => act(request, (c) => A.listMeetings(c, gid(request.params))));
  app.get("/v1/groups/:groupId/meetings/:meetingId", async (request) => act(request, (c) => A.meetingDetail(c, gid(request.params), pid(request.params, "meetingId"))));
  app.patch("/v1/groups/:groupId/meetings/:meetingId", async (request, reply) => {
    const body = z
      .object({ location: z.string().max(120).nullable().optional(), hostMembershipId: id.nullable().optional(), scheduledDate: isoDate.optional(), notes: z.string().max(4000).nullable().optional() })
      .parse(request.body);
    await act(request, (c, a) => A.updateMeeting(c, gid(request.params), a, pid(request.params, "meetingId"), body, now()));
    return reply.code(204).send();
  });
  app.post("/v1/groups/:groupId/meetings/:meetingId/open", async (request) =>
    act(request, (c, a) => A.transitionMeetingAct(c, gid(request.params), a, pid(request.params, "meetingId"), "open", null, now())),
  );
  app.post("/v1/groups/:groupId/meetings/:meetingId/cancel", async (request) => {
    const body = z.object({ reason: z.string().min(3).max(300) }).parse(request.body);
    return act(request, (c, a) => A.transitionMeetingAct(c, gid(request.params), a, pid(request.params, "meetingId"), "cancelled", body.reason, now()));
  });
  app.put("/v1/groups/:groupId/meetings/:meetingId/attendance", async (request) => {
    const body = z
      .object({ entries: z.array(z.object({ membershipId: id, status: z.enum(ATTENDANCE_STATUSES), representedByMembershipId: id.nullable().optional() })).min(1).max(400) })
      .parse(request.body);
    return act(request, (c, a) => A.recordAttendance(c, gid(request.params), a, pid(request.params, "meetingId"), body.entries, now()));
  });
  app.post("/v1/groups/:groupId/meetings/:meetingId/collections", async (request, reply) => {
    const body = z
      .object({ items: z.array(z.object({ membershipId: id, amount: money, channel, reference: optText(64), fundId: id.optional() })).min(1).max(400) })
      .parse(request.body);
    const out = await act(request, (c, a) => A.batchCollect(c, gid(request.params), a, pid(request.params, "meetingId"), body.items, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/meetings/:meetingId/payouts", async (request, reply) => {
    const body = z
      .object({ channel, reference: optText(64), justification: optText(500), witnessMembershipIds: z.array(id).max(10), amount: money.optional(), fee: moneyOrZero.optional() })
      .parse(request.body);
    const out = await act(request, (c, a) => A.recordPayout(c, gid(request.params), a, pid(request.params, "meetingId"), body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/meetings/:meetingId/close", async (request) => {
    const body = z
      .object({ decisions: z.array(z.string().max(500)).max(50).default([]), notes: z.string().max(4000).nullable().default(null), autoFines: z.boolean().default(true) })
      .parse(request.body ?? {});
    return act(request, (c, a) => A.closeMeeting(c, gid(request.params), a, pid(request.params, "meetingId"), body, now()));
  });
  app.post("/v1/groups/:groupId/meetings/:meetingId/minutes-approval", async (request, reply) => {
    const body = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/), inMeetingId: id.nullable().default(null) }).parse(request.body);
    await act(request, (c, a) => A.approveMinutes(c, gid(request.params), a, pid(request.params, "meetingId"), body, now()));
    return reply.code(204).send();
  });

  /* Amendes */
  app.get("/v1/groups/:groupId/fines", async (request) => act(request, (c, a) => A.listFines(c, gid(request.params), a)));
  app.post("/v1/groups/:groupId/fines", async (request, reply) => {
    const body = z
      .object({ membershipId: id, kind: z.enum(FINE_KINDS), amount: money.nullable().optional(), reason: z.string().min(3).max(300), meetingId: id.nullable().optional(), obligationId: id.nullable().optional() })
      .parse(request.body);
    const out = await act(request, (c, a) => A.issueFine(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/fines/:fineId/:act", async (request) => {
    const verb = z.enum(["contest", "uphold", "cancel"]).parse((request.params as { act?: unknown }).act);
    const body = z.object({ reason: z.string().max(300).default("") }).parse(request.body ?? {});
    return act(request, (c, a) => A.actOnFine(c, gid(request.params), a, pid(request.params, "fineId"), verb, body.reason, now()));
  });

  /* Secours */
  app.get("/v1/groups/:groupId/aids", async (request) => act(request, (c) => A.listAids(c, gid(request.params))));
  app.post("/v1/groups/:groupId/aids", async (request, reply) => {
    const body = z.object({ beneficiaryMembershipId: id, event: z.enum(AID_EVENTS), eventDate: isoDate, note: z.string().max(500).nullable().default(null) }).parse(request.body);
    const out = await act(request, (c, a) => A.requestAid(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/aids/:aidId/decisions", async (request) => {
    const body = z
      .object({ decision: z.enum(["approve", "reject"]), overrideAmount: money.nullable().optional(), overrideReason: z.string().max(300).nullable().optional(), note: z.string().max(500).nullable().optional() })
      .parse(request.body);
    return act(request, (c, a) => A.decideAid(c, gid(request.params), a, pid(request.params, "aidId"), body, now()));
  });
  app.post("/v1/groups/:groupId/aids/:aidId/payments", async (request, reply) => {
    const body = z.object({ channel, reference: optText(64), justification: optText(500) }).parse(request.body);
    const out = await act(request, (c, a) => A.payAid(c, gid(request.params), a, pid(request.params, "aidId"), body, now()));
    return reply.code(201).send(out);
  });

  /* Dettes */
  app.get("/v1/groups/:groupId/debts", async (request) => act(request, (c, a) => A.listDebts(c, gid(request.params), a)));
  app.post("/v1/groups/:groupId/debts", async (request, reply) => {
    const body = z
      .object({ debtorMembershipId: id, origin: z.enum(DEBT_ORIGINS), amount: money, creditorFundId: id.nullable().optional(), originRef: z.string().max(200).nullable().optional() })
      .parse(request.body);
    const out = await act(request, (c, a) => A.openDebtAct(c, gid(request.params), a, body, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/debts/:debtId/write-off", async (request, reply) => {
    const body = z.object({ reason: z.string().min(3).max(300) }).parse(request.body);
    await act(request, (c, a) => A.writeOffDebtAct(c, gid(request.params), a, pid(request.params, "debtId"), body.reason, now()));
    return reply.code(204).send();
  });

  /* Statuts */
  app.get("/v1/groups/:groupId/statutes", async (request) => act(request, (c, a) => A.latestStatutes(c, gid(request.params), a)));
  app.post("/v1/groups/:groupId/statutes", async (request, reply) => {
    const out = await act(request, (c, a) => A.publishStatutes(c, gid(request.params), a, now()));
    return reply.code(201).send(out);
  });
  app.post("/v1/groups/:groupId/statutes/:version/acceptances", async (request, reply) => {
    const version = z.coerce.number().int().min(1).parse((request.params as { version?: unknown }).version);
    const body = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }).parse(request.body);
    await act(request, (c, a) => A.acceptStatutes(c, gid(request.params), a, version, body.hash, now()));
    return reply.code(204).send();
  });

  /* Reprise d'historique (lecture seule) */
  app.post("/v1/groups/:groupId/history-imports", async (request, reply) => {
    const body = z
      .object({
        njangi: z.object({
          id: z.string().min(1).max(200),
          name: z.string().min(1).max(200),
          members: z.array(z.object({ uid: z.string().max(200), name: z.string().max(200), phone: z.string().max(40).optional(), email: z.string().max(200).optional(), role: z.string().max(40).optional() })).max(500),
          contributions: z.array(z.object({ id: z.string().max(200), uid: z.string().max(200), amount: z.number(), date: z.string().max(40), status: z.string().max(40).optional() })).max(20000),
        }),
      })
      .parse(request.body);
    const out = await act(request, (c, a) => A.importHistory(c, gid(request.params), a, body.njangi as LegacyNjangi, now()));
    return reply.code(201).send(out);
  });
  app.get("/v1/groups/:groupId/history", async (request) => act(request, (c) => A.listLegacyContributions(c, gid(request.params))));
}
