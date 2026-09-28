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
import {
  FictitiousCommandStore,
  type Actor,
  type CommandContext,
} from "./commandPipeline.js";
import { FictitiousAccessStore } from "./accessStore.js";
import { FictitiousGovernanceStore } from "./governanceStore.js";
import { FictitiousRulesStore } from "./rulesStore.js";
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

  return app;
}
