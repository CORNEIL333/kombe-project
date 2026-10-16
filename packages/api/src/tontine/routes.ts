/**
 * Routes HTTP de la tontine réelle (docs/API_TONTINE.md). Mode RÉEL seulement
 * (pool PostgreSQL) : chaque entrée est validée par zod, chaque écriture
 * accepte un en-tête `Idempotency-Key` (réponse rejouée à l'identique).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { CreateTontineInput, DeclareMovementInput, PayoutInput } from "@kombe/domain";
import { AID_EVENTS, ATTENDANCE_STATUSES, BALLOT_CHOICES, DECISION_KINDS, FINE_KINDS, GROUP_ROLES, PAYMENT_CHANNELS } from "@kombe/domain";
import type { EmailSender } from "../email/emailSender.js";
import { TontineAuth, neonAuthFromEnv, type NeonAuthConfig } from "./auth.js";
import { CycleService } from "./cycle.js";
import { DecisionService } from "./decisions.js";
import { DisciplineService } from "./discipline.js";
import { GroupService } from "./groups.js";
import { HistoryService, type HistoryImportInput } from "./history.js";
import { InboxService } from "./inbox.js";
import { InsightService, type CycleSimulationInput } from "./insights.js";
import { MeetingService } from "./meetings.js";
import { MoneyService } from "./money.js";
import { cadenceSchema, settingsSchema } from "./settings.js";
import { EmailCodeSender, codeSenderFromEnv, type CodeSender } from "./sms.js";

const id = z.string().min(3).max(200);
// Plafond aligné sur le domaine base `kombe_money` (bigint ≤ 1e9, 0001_init) :
// au-delà, l'insertion échouait en STATE_CONFLICT générique — ici le refus est
// précoce et porte le bon message.
const moneyStr = z
  .string()
  .regex(/^\d{1,10}$/)
  .refine((s) => BigInt(s) <= 1_000_000_000n, "Montant au-delà du plafond XAF (1 000 000 000)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const channelFields = {
  channel: z.enum(PAYMENT_CHANNELS),
  reference: z.string().trim().min(1).max(64).optional(),
  justification: z.string().trim().min(1).max(500).optional(),
};

const S = {
  codeRequest: z.object({ login: z.string().min(3).max(120), channel: z.enum(["sms", "whatsapp", "email"]).optional() }),
  neonExchange: z.object({ token: z.string().min(20).max(8000) }),
  codeVerify: z.object({ login: z.string().min(3).max(120), code: z.string().regex(/^\d{6}$/) }),
  meUpdate: z.object({ displayName: z.string().max(80).optional(), language: z.enum(["fr", "en"]).optional() }),
  create: z.object({ name: z.string().min(1).max(120), founderDisplayName: z.string().min(1).max(80), settings: settingsSchema }),
  settings: z.object({ name: z.string().min(1).max(120).optional(), settings: settingsSchema }),
  offline: z.object({ displayName: z.string().min(1).max(80), proxyMembershipId: id }),
  admission: z.object({ decision: z.enum(["admit", "reject"]), shares: z.number().int().min(1).max(5).optional() }),
  shares: z.object({ shares: z.number().int().min(1).max(5), sharedWith: id.nullable().optional() }),
  role: z.object({ membershipId: id, role: z.enum(GROUP_ROLES), mandateEnd: isoDate.nullable().optional() }),
  roleAccept: z.object({ role: z.enum(GROUP_ROLES) }),
  invitation: z.object({ maxUses: z.number().int().min(1).max(200).optional(), days: z.number().int().min(1).max(90).optional() }),
  join: z.object({ displayName: z.string().min(1).max(80), sponsorMembershipId: id.optional() }),
  hash: z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  start: z.object({
    order: z.enum(["draw", "manual", "join_order"]),
    drawId: id.optional(),
    membershipOrder: z.array(id).max(300).optional(),
  }),
  payout: z.object({
    ...channelFields,
    witnessMembershipIds: z.array(id).max(10),
    amount: moneyStr.optional(),
    policy: z.enum(["full_with_advance", "reduced", "wait"]).optional(),
    meetingId: id.optional(),
  }),
  swap: z.object({ kind: z.enum(["swap", "priority"]).optional(), seqA: z.number().int().min(1), seqB: z.number().int().min(1), reason: z.string().max(300).optional() }),
  attendance: z.object({
    entries: z
      .array(z.object({ membershipId: id, status: z.enum(ATTENDANCE_STATUSES), representedByMembershipId: id.nullable().optional() }))
      .min(1)
      .max(300),
  }),
  close: z.object({ notes: z.string().max(4000).optional(), decisions: z.array(z.string().max(300)).max(30).optional() }),
  declare: z.object({
    fundId: id,
    kind: z.enum(["contribution", "fine_payment", "advance_repayment", "expense", "fee"]),
    amount: moneyStr,
    membershipId: id.optional(),
    roundSeq: z.number().int().min(1).optional(),
    meetingId: id.optional(),
    ...channelFields,
    payerNote: z.string().trim().max(120).optional(),
    allegedDate: isoDate.optional(),
    relatedKind: z.enum(["fine", "debt"]).optional(),
    relatedId: id.optional(),
  }),
  confirmations: z.object({ movementIds: z.array(id).min(1).max(200) }),
  fine: z.object({
    membershipId: id,
    kind: z.enum(FINE_KINDS),
    amount: moneyStr.optional(),
    reason: z.string().trim().min(3).max(500),
    meetingId: id.optional(),
  }),
  aid: z.object({ beneficiaryMembershipId: id.optional(), event: z.enum(AID_EVENTS), eventDate: isoDate, note: z.string().max(500).optional() }),
  aidDecision: z.object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().max(500).optional(),
    overrideAmount: moneyStr.optional(),
    overrideReason: z.string().max(300).optional(),
  }),
  aidPayout: z.object(channelFields),
  decision: z.object({
    kind: z.enum(DECISION_KINDS),
    reason: z.string().trim().min(3).max(500),
    targetMembershipId: id.optional(),
    targetRole: z.enum(GROUP_ROLES).optional(),
    hours: z.number().int().min(1).max(336).optional(),
    occurrences: z.number().int().min(1).max(6).optional(),
    fromSeq: z.number().int().min(1).optional(),
    incomingMembershipId: id.optional(),
  }),
  ballot: z.object({ choice: z.enum(BALLOT_CHOICES) }),
  renewal: z.object({
    order: z.enum(["draw", "manual", "join_order"]),
    drawId: id.optional(),
    membershipOrder: z.array(id).max(300).optional(),
    firstMeetingDate: isoDate.optional(),
  }),
  reserve: z.object(channelFields),
  simulation: z.object({
    cadence: cadenceSchema,
    firstMeetingDate: isoDate,
    shares: z.number().int().min(2).max(60),
    contributionPerShare: moneyStr,
    sidePerMeeting: moneyStr.optional(),
  }),
  historyImport: z.object({
    source: z.enum(["kombe_v1", "cahier"]),
    label: z.string().trim().max(80).optional(),
    njangi: z
      .object({
        id: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        members: z.array(z.object({ uid: z.string().max(200), name: z.string().max(120), phone: z.string().max(40).optional(), email: z.string().max(200).optional(), role: z.string().max(40).optional() })).max(1000),
        contributions: z.array(z.object({ id: z.string().max(200), uid: z.string().max(200), amount: z.number().int().min(0).max(1_000_000_000), date: z.string().max(40), status: z.string().max(40).optional() })).max(5000),
      })
      .optional(),
    rows: z.array(z.object({ memberName: z.string().max(120), date: z.string().max(40), amount: z.number().int().min(0).max(1_000_000_000) })).max(5000).optional(),
  }),
  notificationsRead: z.object({ ids: z.union([z.array(z.string().max(20)).max(500), z.literal("all")]) }),
  reason,
};

type P = Record<string, string>;
type Q = Record<string, string | undefined>;

export interface TontineRoutesOptions {
  readonly pool: pg.Pool;
  readonly now: () => number;
  readonly emailSender: EmailSender;
  /** Expéditeur e-mail simulé (pas de clé Resend hors production). */
  readonly emailSimulated: boolean;
  /** Faux si la production n'a pas de clé Resend : voie e-mail fermée. */
  readonly emailAvailable?: boolean;
  readonly codeSender?: CodeSender;
  /** Neon Auth (ADR-0040) ; `null` = désactivé ; absent = lu dans l'environnement. */
  readonly neonAuth?: NeonAuthConfig | null;
}

export function registerTontineRoutes(app: FastifyInstance, opts: TontineRoutesOptions): void {
  const { pool, now } = opts;
  const auth = new TontineAuth(
    pool,
    opts.codeSender ?? codeSenderFromEnv(),
    new EmailCodeSender(opts.emailSender, opts.emailSimulated, opts.emailAvailable !== false),
    now,
    opts.neonAuth === undefined ? neonAuthFromEnv() : opts.neonAuth,
  );
  const groups = new GroupService(pool, now);
  const cycle = new CycleService(pool, now);
  const meetings = new MeetingService(pool, now);
  const money = new MoneyService(pool, now);
  const discipline = new DisciplineService(pool, now);
  const inbox = new InboxService(pool, now);
  const decisions = new DecisionService(pool, now);
  const history = new HistoryService(pool, now);
  const insights = new InsightService(pool, now);

  const H = (r: FastifyRequest): Record<string, unknown> => r.headers as Record<string, unknown>;
  const seqOf = (raw: string | undefined): number => z.coerce.number().int().min(1).max(10_000).parse(raw);

  /** Écriture idempotente : rejoue la réponse mémorisée pour la même clé. */
  async function write<T>(req: FastifyRequest, reply: FastifyReply, status: number, run: () => Promise<T>): Promise<unknown> {
    const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;
    const route = `${req.method} ${req.url.split("?")[0]}`;
    if (key) {
      const prior = await inbox.replay(H(req), key, route, req.body);
      if (prior) {
        reply.header("idempotent-replay", "true");
        return reply.code(prior.status).send(prior.body);
      }
    }
    const out = await run();
    if (key) await inbox.remember(H(req), key, route, req.body, status, out);
    return reply.code(status).send(out === undefined ? null : out);
  }

  /* ── Connexion ─────────────────────────────────────────────────────── */
  app.get("/v1/auth/channels", async () => auth.channels());
  app.post("/v1/auth/code-requests", async (req, reply) => reply.code(202).send(await auth.requestCode(S.codeRequest.parse(req.body))));
  app.post("/v1/auth/code-verifications", async (req, reply) => reply.code(201).send(await auth.verifyCode(S.codeVerify.parse(req.body))));
  app.post("/v1/auth/neon-exchange", async (req, reply) => reply.code(201).send(await auth.exchangeNeonToken(S.neonExchange.parse(req.body))));
  app.post("/v1/auth/logout", async (req, reply) => {
    await auth.logout(H(req));
    return reply.code(204).send();
  });

  /* ── Moi ───────────────────────────────────────────────────────────── */
  app.get("/v1/me", async (req) => auth.me(H(req)));
  app.patch("/v1/me", async (req) => auth.updateMe(H(req), S.meUpdate.parse(req.body)));
  app.get("/v1/me/tontines", async (req) => groups.mine(H(req)));
  app.get("/v1/me/dues", async (req) => money.myDues(H(req), (req.query as Q).groupId));
  app.get("/v1/me/notifications", async (req) => inbox.notifications(H(req), { unreadOnly: (req.query as Q).unread === "1" }));
  app.post("/v1/me/notifications/read", async (req) => inbox.markRead(H(req), S.notificationsRead.parse(req.body).ids));

  /* ── Associations ──────────────────────────────────────────────────── */
  app.post("/v1/tontines", async (req, reply) => write(req, reply, 201, () => groups.create(H(req), S.create.parse(req.body) as CreateTontineInput)));
  app.get("/v1/tontines/:id", async (req) => groups.detail(H(req), (req.params as P).id as string));
  app.patch("/v1/tontines/:id/settings", async (req) => groups.updateSettings(H(req), (req.params as P).id as string, S.settings.parse(req.body)));
  app.get("/v1/tontines/:id/members", async (req) => groups.members(H(req), (req.params as P).id as string, (req.query as Q).all === "1"));
  app.post("/v1/tontines/:id/members/offline", async (req, reply) =>
    write(req, reply, 201, () => groups.addOffline(H(req), (req.params as P).id as string, S.offline.parse(req.body))),
  );
  app.post("/v1/tontines/:id/members/:mid/admission", async (req) => {
    const p = req.params as P;
    return groups.admission(H(req), p.id as string, p.mid as string, S.admission.parse(req.body));
  });
  app.post("/v1/tontines/:id/members/:mid/shares", async (req) => {
    const p = req.params as P;
    return groups.setShares(H(req), p.id as string, p.mid as string, S.shares.parse(req.body));
  });
  app.post("/v1/tontines/:id/roles", async (req) => groups.proposeRole(H(req), (req.params as P).id as string, S.role.parse(req.body)));
  app.post("/v1/tontines/:id/roles/acceptance", async (req) => groups.acceptRole(H(req), (req.params as P).id as string, S.roleAccept.parse(req.body).role));
  app.post("/v1/tontines/:id/invitations", async (req, reply) =>
    write(req, reply, 201, () => groups.createInvitation(H(req), (req.params as P).id as string, S.invitation.parse(req.body ?? {}))),
  );
  app.get("/v1/tontines/:id/invitations", async (req) => groups.invitations(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/invitations/:iid/revocation", async (req, reply) => {
    const p = req.params as P;
    await groups.revokeInvitation(H(req), p.id as string, p.iid as string);
    return reply.code(204).send();
  });
  app.get("/v1/invitations/:code", async (req) => groups.previewInvitation(H(req), (req.params as P).code as string));
  app.post("/v1/invitations/:code/join", async (req, reply) =>
    write(req, reply, 201, () => groups.join(H(req), (req.params as P).code as string, S.join.parse(req.body))),
  );

  /* ── Statuts ───────────────────────────────────────────────────────── */
  app.get("/v1/tontines/:id/statutes", async (req) => groups.statutes(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/statutes", async (req) => groups.publishStatutes(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/statutes/acceptance", async (req) => groups.acceptStatutes(H(req), (req.params as P).id as string, S.hash.parse(req.body).hash));

  /* ── Cycle ─────────────────────────────────────────────────────────── */
  app.post("/v1/tontines/:id/draws", async (req, reply) => reply.code(201).send(await cycle.createDraw(H(req), (req.params as P).id as string)));
  app.get("/v1/tontines/:id/draws/:drawId", async (req) => {
    const p = req.params as P;
    return cycle.getDraw(H(req), p.id as string, p.drawId as string);
  });
  app.post("/v1/tontines/:id/cycle", async (req) => cycle.start(H(req), (req.params as P).id as string, S.start.parse(req.body)));
  app.post("/v1/tontines/:id/cycle-renewals", async (req, reply) =>
    write(req, reply, 201, () => cycle.renew(H(req), (req.params as P).id as string, S.renewal.parse(req.body))),
  );
  app.get("/v1/tontines/:id/rounds", async (req) => cycle.rounds(H(req), (req.params as P).id as string));
  app.get("/v1/tontines/:id/rounds/:seq/grid", async (req) => {
    const p = req.params as P;
    return cycle.grid(H(req), p.id as string, seqOf(p.seq));
  });
  app.post("/v1/tontines/:id/rounds/:seq/payout", async (req, reply) => {
    const p = req.params as P;
    return write(req, reply, 201, () => cycle.payout(H(req), p.id as string, seqOf(p.seq), S.payout.parse(req.body) as PayoutInput));
  });
  app.post("/v1/tontines/:id/rounds/:seq/close", async (req) => {
    const p = req.params as P;
    return cycle.closeRound(H(req), p.id as string, seqOf(p.seq));
  });
  app.get("/v1/tontines/:id/order-changes", async (req) => cycle.orderChanges(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/order-changes", async (req, reply) =>
    write(req, reply, 201, () => cycle.requestSwap(H(req), (req.params as P).id as string, S.swap.parse(req.body))),
  );
  app.post("/v1/tontines/:id/order-changes/:cid/acceptance", async (req) => {
    const p = req.params as P;
    return cycle.acceptSwap(H(req), p.id as string, p.cid as string);
  });
  app.post("/v1/tontines/:id/order-changes/:cid/approval", async (req) => {
    const p = req.params as P;
    return cycle.approveSwap(H(req), p.id as string, p.cid as string);
  });

  /* ── Repères : simulateur, mon tour, régularité, réserve ─────────────── */
  app.post("/v1/cycle-simulations", async (req) => insights.simulate(H(req), S.simulation.parse(req.body) as CycleSimulationInput));
  app.get("/v1/tontines/:id/my-forecast", async (req) => insights.myForecast(H(req), (req.params as P).id as string));
  app.get("/v1/tontines/:id/regularity", async (req) => insights.regularity(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/reserve-distributions", async (req, reply) =>
    write(req, reply, 201, () => money.distributeReserve(H(req), (req.params as P).id as string, S.reserve.parse(req.body))),
  );

  /* ── Séances ───────────────────────────────────────────────────────── */
  app.get("/v1/tontines/:id/meetings", async (req) => meetings.list(H(req), (req.params as P).id as string));
  app.get("/v1/tontines/:id/meetings/:mid/share-text", async (req) => {
    const p = req.params as P;
    return insights.meetingShareText(H(req), p.id as string, p.mid as string);
  });
  app.get("/v1/tontines/:id/meetings/:mid", async (req) => {
    const p = req.params as P;
    return meetings.detail(H(req), p.id as string, p.mid as string);
  });
  app.post("/v1/tontines/:id/meetings/:mid/open", async (req) => {
    const p = req.params as P;
    return meetings.open(H(req), p.id as string, p.mid as string);
  });
  app.put("/v1/tontines/:id/meetings/:mid/attendance", async (req) => {
    const p = req.params as P;
    return meetings.attendance(H(req), p.id as string, p.mid as string, S.attendance.parse(req.body).entries);
  });
  app.post("/v1/tontines/:id/meetings/:mid/close", async (req) => {
    const p = req.params as P;
    return meetings.close(H(req), p.id as string, p.mid as string, S.close.parse(req.body ?? {}));
  });
  app.post("/v1/tontines/:id/meetings/:mid/minutes-approval", async (req) => {
    const p = req.params as P;
    return meetings.approveMinutes(H(req), p.id as string, p.mid as string, S.hash.parse(req.body).hash);
  });

  /* ── Caisses et mouvements ─────────────────────────────────────────── */
  app.get("/v1/tontines/:id/funds", async (req) => money.funds(H(req), (req.params as P).id as string));
  app.get("/v1/tontines/:id/movements", async (req) => {
    const q = req.query as Q;
    return money.movements(H(req), (req.params as P).id as string, {
      fundId: q.fundId,
      roundSeq: q.roundSeq ? seqOf(q.roundSeq) : undefined,
      state: q.state && ["declared", "confirmed", "validated", "rejected", "compensated"].includes(q.state) ? q.state : undefined,
      meetingId: q.meetingId,
      mine: q.mine === "1",
    });
  });
  app.post("/v1/tontines/:id/movements", async (req, reply) =>
    write(req, reply, 201, () => money.declare(H(req), (req.params as P).id as string, S.declare.parse(req.body) as DeclareMovementInput)),
  );
  app.post("/v1/tontines/:id/movements/confirmations", async (req, reply) =>
    write(req, reply, 200, () => money.confirm(H(req), (req.params as P).id as string, S.confirmations.parse(req.body).movementIds)),
  );
  app.post("/v1/tontines/:id/movements/:mvid/control", async (req) => {
    const p = req.params as P;
    return money.control(H(req), p.id as string, p.mvid as string);
  });
  app.post("/v1/tontines/:id/movements/:mvid/rejection", async (req) => {
    const p = req.params as P;
    return money.reject(H(req), p.id as string, p.mvid as string, S.reason.parse(req.body).reason);
  });
  app.post("/v1/tontines/:id/movements/:mvid/acknowledgement", async (req) => {
    const p = req.params as P;
    return money.acknowledge(H(req), p.id as string, p.mvid as string);
  });

  /* ── Discipline, secours, dettes ───────────────────────────────────── */
  app.get("/v1/tontines/:id/fines", async (req) => discipline.fines(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/fines", async (req, reply) =>
    write(req, reply, 201, () => discipline.issueFine(H(req), (req.params as P).id as string, S.fine.parse(req.body))),
  );
  app.post("/v1/tontines/:id/fines/:fid/contest", async (req) => {
    const p = req.params as P;
    return discipline.contestFine(H(req), p.id as string, p.fid as string, S.reason.parse(req.body).reason);
  });
  app.post("/v1/tontines/:id/fines/:fid/cancel", async (req) => {
    const p = req.params as P;
    return discipline.decideFine(H(req), p.id as string, p.fid as string, "cancel", S.reason.parse(req.body).reason);
  });
  app.post("/v1/tontines/:id/fines/:fid/maintain", async (req) => {
    const p = req.params as P;
    return discipline.decideFine(H(req), p.id as string, p.fid as string, "maintain", S.reason.parse(req.body).reason);
  });
  app.get("/v1/tontines/:id/aids", async (req) => discipline.aids(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/aids", async (req, reply) =>
    write(req, reply, 201, () => discipline.requestAid(H(req), (req.params as P).id as string, S.aid.parse(req.body))),
  );
  app.post("/v1/tontines/:id/aids/:aid/decision", async (req) => {
    const p = req.params as P;
    return discipline.decideAid(H(req), p.id as string, p.aid as string, S.aidDecision.parse(req.body));
  });
  app.post("/v1/tontines/:id/aids/:aid/payout", async (req, reply) => {
    const p = req.params as P;
    return write(req, reply, 201, () => discipline.payAid(H(req), p.id as string, p.aid as string, S.aidPayout.parse(req.body)));
  });
  app.get("/v1/tontines/:id/debts", async (req) => discipline.debts(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/debts/:did/write-off", async (req) => {
    const p = req.params as P;
    return discipline.writeOff(H(req), p.id as string, p.did as string, S.reason.parse(req.body).reason);
  });

  /* ── Décisions votées, sanctions (ADR-0038) ───────────────────────── */
  app.get("/v1/tontines/:id/decisions", async (req) => decisions.list(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/decisions", async (req, reply) =>
    write(req, reply, 201, () => decisions.open(H(req), (req.params as P).id as string, S.decision.parse(req.body))),
  );
  app.post("/v1/tontines/:id/decisions/:did/ballots", async (req, reply) => {
    const p = req.params as P;
    return write(req, reply, 201, () => decisions.vote(H(req), p.id as string, p.did as string, S.ballot.parse(req.body).choice));
  });
  app.post("/v1/tontines/:id/decisions/:did/close", async (req) => {
    const p = req.params as P;
    return decisions.close(H(req), p.id as string, p.did as string);
  });
  app.post("/v1/tontines/:id/decisions/:did/cancel", async (req) => {
    const p = req.params as P;
    return decisions.cancel(H(req), p.id as string, p.did as string, S.reason.parse(req.body).reason);
  });
  app.post("/v1/tontines/:id/decisions/:did/lift", async (req) => {
    const p = req.params as P;
    return decisions.lift(H(req), p.id as string, p.did as string, S.reason.parse(req.body).reason);
  });
  app.get("/v1/tontines/:id/sanctions", async (req) => decisions.sanctions(H(req), (req.params as P).id as string));

  /* ── Reprise de l'historique (L-20) ─────────────────────────────── */
  app.get("/v1/tontines/:id/history", async (req) => history.summary(H(req), (req.params as P).id as string));
  app.post("/v1/tontines/:id/history-imports", async (req, reply) =>
    write(req, reply, 201, () => history.importHistory(H(req), (req.params as P).id as string, S.historyImport.parse(req.body) as HistoryImportInput)),
  );

  /* ── Registre ──────────────────────────────────────────────────────── */
  app.get("/v1/tontines/:id/journal", async (req) => inbox.journal(H(req), (req.params as P).id as string));
}
