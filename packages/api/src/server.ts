/**
 * Squelette d'application Fastify KÓMBE (C00). Il cablle les routes de
 * commandes sur le pipeline de domaine fictif. Il NE prétend PAS authentifier
 * une session réelle ni verrouiller une ligne : l'identité est injectée par
 * en-têtes fictifs pour la recette du squelette, la résolution de session et
 * RLS relèvent de C01 (PostgreSQL réel). Aucune donnée réelle ici.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DomainError, type DomainErrorCode } from "@kombe/domain";
import type { CycleSchedule } from "@kombe/domain";
import {
  FictitiousCommandStore,
  type Actor,
  type CommandContext,
} from "./commandPipeline.js";
import { FictitiousAccessStore } from "./accessStore.js";
import { FictitiousGovernanceStore } from "./governanceStore.js";
import { FictitiousRulesStore } from "./rulesStore.js";
import { FictitiousScheduleStore } from "./scheduleStore.js";
import { FictitiousJournalStore } from "./journalStore.js";
import {
  declareContributionBody,
  idempotencyKey,
  expectedVersion,
  registrationRequest,
  registrationVerification,
  recoveryRequest,
  recoveryCompletion,
  sessionLogin,
  createGroupBody,
  groupTransitionBody,
  membershipTerminationBody,
  groupMutationBody,
  rulesAcceptanceBody,
  contributionDeclarationBody,
  publishRuleBody,
  ruleVersionAcceptanceBody,
  ruleChangeBody,
  penaltyRequestBody,
  buildScheduleBody,
  beneficiaryReassignmentBody,
  departureBody,
  cycleRenewalBody,
  checkpointBody,
  journalAppendBody,
  tamperBody,
} from "./schemas.js";

/** Code d'erreur domaine → statut HTTP (erreurs stables, non divulguantes). */
const STATUS_BY_CODE: Partial<Record<DomainErrorCode, number>> = {
  FEATURE_PILOT_FORBIDDEN: 403,
  IDENTITY_NOT_ACTIVE: 403,
  APPROVER_NOT_DISTINCT: 403,
  CHANNEL_NOT_VERIFIED: 403,
  PRIVILEGE_NOT_GRANTED: 403,
  RESERVATION_INCOHERENTE: 404,
  EVENT_CHAIN_BREAK: 409,
  ROLE_ACCEPTANCE_REQUIRED: 409,
  MEMBERSHIP_ALREADY_ACTIVE: 409,
  TOKEN_EXPIRED: 409,
  TOKEN_ALREADY_USED: 409,
  TOKEN_INVALID: 400,
  SESSION_INVALID: 401,
  GROUP_STATE_INVALID: 422,
  GROUP_READ_ONLY: 403,
  CYCLE_START_NOT_READY: 409,
  INVITATION_INVALID: 410,
  RULES_NOT_ACCEPTED: 403,
  RULE_INVALID: 422,
  RULE_VERSION_IMMUTABLE: 409,
  RULE_ACCEPT_HASH_MISMATCH: 412,
  RULE_RETROACTIVE: 409,
  SCHEDULE_ROUNDS_MISMATCH: 422,
  SCHEDULE_BENEFICIARY_DUPLICATE: 422,
  SCHEDULE_MEMBER_UNKNOWN: 422,
  SCHEDULE_OBLIGATION_DUPLICATE: 409,
  SCHEDULE_FROZEN: 409,
  REPLAY_VERSION_UNKNOWN: 422,
  CHECKPOINT_MISMATCH: 409,
  MEMBERSHIP_STATE_INVALID: 422,
  PASSWORD_TOO_WEAK: 422,
  PASSWORD_COMPROMISED: 422,
  MONEY_NOT_INTEGER: 422,
  MONEY_NEGATIVE: 422,
  MONEY_OVER_PER_AMOUNT_CEILING: 422,
  MONEY_OVER_SAFE_CEILING: 422,
  ROTATION_MEMBERS_MIN: 422,
  ROTATION_CONTRIBUTION_POSITIVE: 422,
};

export interface BuildAppOptions {
  readonly store?: FictitiousCommandStore;
  readonly access?: FictitiousAccessStore;
  readonly governance?: FictitiousGovernanceStore;
  readonly rules?: FictitiousRulesStore;
  readonly schedule?: FictitiousScheduleStore;
  readonly journal?: FictitiousJournalStore;
}

/** Résolution d'acteur FICTIVE pour la recette du squelette (C01 la remplacera
 *  par une session résolue côté serveur + RLS). */
function actorFrom(request: { headers: Record<string, unknown> }): Actor {
  const actorHeader = request.headers["x-actor"];
  return typeof actorHeader === "string"
    ? (JSON.parse(actorHeader) as Actor)
    : { handle: "", role: "member", groupIds: [] };
}

function ctxFrom(
  request: { headers: Record<string, unknown> },
): CommandContext {
  return {
    actor: actorFrom(request),
    idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = options.store ?? new FictitiousCommandStore();
  const access = options.access ?? new FictitiousAccessStore();
  const governance = options.governance ?? new FictitiousGovernanceStore();
  const rules = options.rules ?? new FictitiousRulesStore();
  const schedule = options.schedule ?? new FictitiousScheduleStore();
  const journal = options.journal ?? new FictitiousJournalStore();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(422).send({ code: "VALIDATION", message: "Requête invalide" });
    }
    if (error instanceof DomainError) {
      const status = STATUS_BY_CODE[error.code] ?? 400;
      return reply.code(status).send({ code: error.code, message: "Requête refusée" });
    }
    app.log.error(error);
    return reply.code(500).send({ code: "INTERNAL", message: "Erreur interne" });
  });

  app.get("/v1/health", async () => ({ status: "ok", phase: "c00-skeleton" }));

  app.post("/v1/groups/:groupId/contributions", async (request, reply) => {
    const body = declareContributionBody.parse(request.body);
    const ctx = ctxFrom(request);
    const receipt = store.declareContribution(ctx, body.obligationId, body.amount);
    return reply.code(201).send(receipt);
  });

  // Circuit A19 — acceptation de nomination par le nommé.
  app.post("/v1/role-nominations/:requestId/acceptances", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const ctx = ctxFrom(request);
    const receipt = store.acceptNomination(ctx, requestId);
    return reply.code(201).send(receipt);
  });

  // Circuit A19 — approbation par un approbateur distinct (auditeur).
  app.post("/v1/role-change-requests/:requestId/approvals", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const ctx = ctxFrom(request);
    const receipt = store.approveRoleChange(ctx, requestId);
    return reply.code(201).send(receipt);
  });

  /* --- C02 : inscription / sessions / récupération (1.1 → 1.5) --- */

  // Demande d'inscription — réponse anti-énumération (202 uniforme).
  app.post("/v1/access/registrations", async (request, reply) => {
    const body = registrationRequest.parse(request.body);
    const receipt = access.requestRegistration(body.identityId, body.channel);
    return reply.code(202).send(receipt);
  });

  // Vérification du canal par jeton à usage unique (1.1).
  app.post("/v1/access/registrations/verifications", async (request, reply) => {
    const body = registrationVerification.parse(request.body);
    const out = access.verifyRegistration(body.identityId, body.tokenId);
    return reply.code(200).send(out);
  });

  // Demande de récupération — gabarit identique compte connu/inconnu (1.4).
  app.post("/v1/access/recovery-requests", async (request, reply) => {
    const body = recoveryRequest.parse(request.body);
    const receipt = access.requestRecovery(body.identityId);
    return reply.code(202).send(receipt);
  });

  // Achèvement de la récupération : jeton à usage unique + révocation de
  // toutes les sessions antérieures (C02-RECOVERY, C02-SESSION).
  app.post("/v1/access/recovery-completions", async (request, reply) => {
    const body = recoveryCompletion.parse(request.body);
    const out = access.completeRecovery(body.identityId, body.tokenId, body.suspensionSeconds);
    return reply.code(200).send(out);
  });

  // Ouverture de session (1.2) — la session est liée à la génération courante.
  app.post("/v1/access/sessions", async (request, reply) => {
    const body = sessionLogin.parse(request.body);
    const out = access.login(body.identityId, body.sessionId);
    return reply.code(201).send(out);
  });

  // Épreuve d'usage d'une session : révoquée/expirée/supplantée → 401.
  app.get("/v1/access/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    return reply.code(200).send(access.useSession(sessionId));
  });

  // Révocation d'une session active (1.2 « sessions consultables et révocables »).
  app.post("/v1/access/sessions/:sessionId/revocations", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    access.revokeSession(sessionId);
    return reply.code(204).send();
  });

  // Privilège opérateur RECALCULÉ serveur, jamais depuis le jeton (C02-PRIVILEGE).
  app.get("/v1/access/operators/:identityId/privilege", async (request, reply) => {
    const { identityId } = request.params as { identityId: string };
    return reply.code(200).send(access.operatorAccess(identityId));
  });

  /* --- C03 : groupes, gouvernance, invitations, règles (2.1, 2.7, 4.1, 4.2) --- */

  // Création d'un groupe en configuration (2.1).
  app.post("/v1/groups", async (request, reply) => {
    const body = createGroupBody.parse(request.body);
    const out = governance.createGroup(body);
    return reply.code(201).send(out);
  });

  // Lecture de la préparation au démarrage du cycle.
  app.get("/v1/groups/:groupId/cycle-readiness", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(200).send(governance.readiness(groupId));
  });

  // Démarrage du cycle — porte serveur (C03-BOOT : fondateur seul ⇒ 409).
  app.post("/v1/groups/:groupId/cycle-starts", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(201).send(governance.startCycle(groupId));
  });

  // Transition d'état du groupe (2.7).
  app.post("/v1/groups/:groupId/state-transitions", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = groupTransitionBody.parse(request.body);
    return reply.code(200).send(governance.transition(groupId, body.to));
  });

  // Sonde de mutation gardée par adhésion active + groupe mutable (C03-REVOKE).
  app.post("/v1/groups/:groupId/mutations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = groupMutationBody.parse(request.body);
    return reply.code(200).send(governance.attemptMutation(groupId, body.identityId));
  });

  // Terminaison d'une adhésion (départ/révocation), avant la prochaine commande.
  app.post("/v1/groups/:groupId/membership-terminations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = membershipTerminationBody.parse(request.body);
    return reply.code(200).send(governance.terminateMembership(groupId, body.identityId));
  });

  // Acceptation horodatée de la version courante des règles (4.2).
  app.post("/v1/groups/:groupId/rules-acceptances", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = rulesAcceptanceBody.parse(request.body);
    return reply.code(201).send(governance.acceptGroupRules(groupId, body.identityId));
  });

  // Déclaration de cotisation — refusée sans acceptation des règles en vigueur.
  app.post("/v1/groups/:groupId/contribution-declarations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = contributionDeclarationBody.parse(request.body);
    return reply.code(200).send(governance.declareContribution(groupId, body.identityId));
  });

  // Rachat d'une invitation limitée/expirante/révocable (4.1).
  app.post("/v1/invitations/:invitationId/redemptions", async (request, reply) => {
    const { invitationId } = request.params as { invitationId: string };
    return reply.code(200).send(governance.redeemInvitation(invitationId));
  });

  /* --- C04 : moteur de règles versionnées et acceptations (3.1 → 3.7, 6.7) --- */

  // Publication d'une version de règle (compiler pour le pilote ; pénalités forcées
  // à false). Le hash canonique scelle l'instantané (immuabilité).
  app.post("/v1/groups/:groupId/rule-versions", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = publishRuleBody.parse(request.body);
    const pub = rules.publish(groupId, body.snapshot, body.supersedes);
    return reply.code(201).send({
      version: pub.version,
      hash: pub.hash,
      penaltyEnabled: pub.snapshot.penaltyEnabled,
    });
  });

  // Acceptation horodatée portant sur le hash EXACT d'une version publiée.
  app.post("/v1/groups/:groupId/rule-versions/:version/acceptances", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { version } = request.params as { version: string };
    const body = ruleVersionAcceptanceBody.parse(request.body);
    const acc = rules.accept(groupId, body.identityId, Number(version), body.hash);
    return reply.code(201).send(acc);
  });

  // Changement de règle déjà publié : plan d'application + effectivité (C04-ACCEPT).
  app.post("/v1/groups/:groupId/rule-changes", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = ruleChangeBody.parse(request.body);
    return reply.code(200).send(rules.evaluateChange(groupId, body.version, body.concerned));
  });

  // Recalcul du cycle courant sous garde de non-rétroactivité (C04-RETRO).
  app.post("/v1/groups/:groupId/cycle-recalculations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(200).send(rules.recalculateCurrentCycle(groupId));
  });

  // Demande d'activation des pénalités — barrière serveur du pilote (C04-PENALTY).
  app.post("/v1/groups/:groupId/penalty-requests", async (request, reply) => {
    const body = penaltyRequestBody.parse(request.body);
    return reply.code(200).send(rules.requestPenalty(body.desired));
  });

  /* --- C05 : cycles, tours, échéances, bénéficiaires (5.1 → 5.5) --- */

  // Sérialise un calendrier en JSON : les montants bigints deviennent des chaînes.
  const viewSchedule = (s: CycleSchedule) => ({
    groupId: s.groupId,
    ruleVersion: s.ruleVersion,
    memberCount: s.memberCount,
    rounds: s.rounds,
    frequency: s.frequency,
    state: s.state,
    displayTz: s.displayTz,
    contribution: s.contribution.toString(),
    roundPot: s.roundPot.toString(),
    cycleExpectedTotal: s.cycleExpectedTotal.toString(),
    schedule: s.schedule.map((r) => ({
      seq: r.seq,
      beneficiaryId: r.beneficiaryId,
      dueDate: r.dueDate,
      dueAtMs: r.dueAtMs,
      roundPot: r.roundPot.toString(),
      obligations: r.obligations.map((o) => ({
        obligationId: o.obligationId,
        memberId: o.memberId,
        amount: o.amount.toString(),
        dueDate: o.dueDate,
        dueAtMs: o.dueAtMs,
        ruleVersion: o.ruleVersion,
      })),
    })),
  });

  // Construction du calendrier (brouillon) — refus si bénéficiaire dupliqué
  // (C05-UNIQUE : `schedule_accepted = false` réalisé par refus 422, aucune écriture).
  app.post("/v1/groups/:groupId/schedules", async (request, reply) => {
    const body = buildScheduleBody.parse(request.body);
    const s = schedule.build({
      groupId: body.groupId,
      ruleVersion: body.ruleVersion,
      members: body.members,
      contribution: body.contribution,
      frequency: body.frequency,
      dueDay: body.dueDay,
      startYear: body.startYear,
      startMonth: body.startMonth,
      beneficiaryOrder: body.beneficiaryOrder,
    });
    return reply.code(201).send(viewSchedule(s));
  });

  // Lecture du calendrier courant d'un groupe.
  app.get("/v1/groups/:groupId/schedules", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(200).send(viewSchedule(schedule.get(groupId)));
  });

  // Démarrage (gel) du calendrier — ordre des bénéficiaires figé (5.3).
  app.post("/v1/groups/:groupId/schedule-starts", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(201).send(schedule.start(groupId));
  });

  // Réassignation d'un bénéficiaire — refusée après démarrage (SCHEDULE_FROZEN).
  app.post("/v1/groups/:groupId/rounds/:seq/beneficiary", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { seq } = request.params as { seq: string };
    const body = beneficiaryReassignmentBody.parse(request.body);
    const s = schedule.reassign(groupId, Number(seq), body.newBeneficiaryId);
    return reply.code(200).send({ seq: Number(seq), beneficiaryId: s.schedule[Number(seq) - 1]!.beneficiaryId });
  });

  // Départ d'un membre — la dette reste affectée, les tours non réduits.
  app.post("/v1/groups/:groupId/departures", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = departureBody.parse(request.body);
    return reply.code(200).send(schedule.depart(groupId, body.identityId));
  });

  // Plan de renouvellement (5.5) — nouvelles acceptations si engagement changé.
  app.post("/v1/groups/:groupId/cycle-renewals", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = cycleRenewalBody.parse(request.body);
    return reply
      .code(200)
      .send(schedule.renew(groupId, { version: body.version, memberCount: body.memberCount, contribution: body.contribution, rounds: body.rounds }));
  });

  /* --- C11 : journal d'événements, checkpoints, timeline (9.1 → 9.5) --- */

  // Vérification indépendante de la chaîne : le serveur ne lit que ce qui
  // est écrit, il ne recalcule jamais de quoi masquer une altération (9.2).
  app.get("/v1/groups/:groupId/journal/verify", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(200).send(journal.verify(groupId));
  });

  // Timeline en langage clair, filtrée par les droits de l'acteur (9.1/9.3).
  // Le paramètre `type` filtre par type d'événement ; le payload brut n'est
  // jamais servi.
  app.get("/v1/groups/:groupId/timeline", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { type } = request.query as { type?: string };
    const actor = actorFrom(request);
    let entries = journal.timeline(groupId, actor.role);
    if (type !== undefined) entries = entries.filter((e) => e.type === type);
    return reply.code(200).send({ entries });
  });

  // Émission d'un checkpoint externe scellé — rôle tenant l'action
  // `journal.checkpoint` uniquement (auditor/secretary/treasurer) (9.2).
  app.post("/v1/groups/:groupId/journal-checkpoints", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = checkpointBody.parse(request.body);
    const actor = actorFrom(request);
    return reply.code(201).send(journal.checkpoint(groupId, actor.role, body.issuedBy, body.issuedAt));
  });

  // Reconstruction des projections par replay, réconciliée avec la projection
  // de référence (C11-REBUILD, 9.5) : effacer une projection ne change rien.
  app.post("/v1/groups/:groupId/projections-rebuild", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    return reply.code(200).send(journal.rebuild(groupId));
  });

  // TRACE DE TEST, NON PROD — injecte un événement d'audit dans la chaîne
  // fictive (les commandes métier réelles écriront via C06/C07).
  app.post("/v1/groups/:groupId/journal-appends", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = journalAppendBody.parse(request.body);
    const ev = journal.append({ groupId, ...body });
    return reply.code(201).send({ seq: ev.seq, hash: ev.hash });
  });

  // TRACE DE TEST, NON PROD — C11-TAMPER : altère une COPIE du journal puis
  // la soumet au vérificateur. `tamper_detected` doit être vrai ; la chaîne
  // interne reste intacte (re-verify ensuite = intact, absence d'effet).
  app.post("/v1/groups/:groupId/journal-tamper-tests", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = tamperBody.parse(request.body);
    const copy = journal.tamperCopyOf(groupId, body.seq, body.amount);
    const copyResult = journal.verifyCopy(copy);
    const stillIntact = journal.verify(groupId).intact;
    return reply
      .code(200)
      .send({ tamper_detected: !copyResult.intact, error: copyResult.error ?? null, internal_chain_intact: stillIntact });
  });

  return app;
}
