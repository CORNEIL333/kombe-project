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
import {
  declareContributionBody,
  idempotencyKey,
  expectedVersion,
  registrationRequest,
  registrationVerification,
  recoveryRequest,
  recoveryCompletion,
  sessionLogin,
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

  return app;
}
