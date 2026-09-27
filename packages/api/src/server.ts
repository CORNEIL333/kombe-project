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
import { declareContributionBody, idempotencyKey, expectedVersion } from "./schemas.js";

/** Code d'erreur domaine → statut HTTP (erreurs stables, non divulguantes). */
const STATUS_BY_CODE: Partial<Record<DomainErrorCode, number>> = {
  FEATURE_PILOT_FORBIDDEN: 403,
  RESERVATION_INCOHERENTE: 404,
  EVENT_CHAIN_BREAK: 409,
  MONEY_NOT_INTEGER: 422,
  MONEY_NEGATIVE: 422,
  MONEY_OVER_PER_AMOUNT_CEILING: 422,
  MONEY_OVER_SAFE_CEILING: 422,
  ROTATION_MEMBERS_MIN: 422,
  ROTATION_CONTRIBUTION_POSITIVE: 422,
};

export interface BuildAppOptions {
  readonly store?: FictitiousCommandStore;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = options.store ?? new FictitiousCommandStore();

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

    const key = idempotencyKey.parse(request.headers["idempotency-key"]);
    const version = expectedVersion.parse(request.headers["if-match-version"]);

    // Résolution d'acteur FICTIVE pour la recette du squelette (C01 la remplacera).
    const actorHeader = request.headers["x-actor"];
    const actor: Actor = typeof actorHeader === "string" ? JSON.parse(actorHeader) : {
      handle: "",
      role: "member",
      groupIds: [],
    };

    const ctx: CommandContext = {
      actor,
      idempotencyKey: key,
      expectedVersion: version,
    };
    const receipt = store.declareContribution(ctx, body.obligationId, body.amount);
    return reply.code(201).send(receipt);
  });

  return app;
}
