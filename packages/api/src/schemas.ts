/**
 * Schémas de requête/réponse de l'API (zod), miroir contractuel de
 * docs/openapi.yaml. C00 pose le contrat ; la validation d'identité/rôles
 * applicative et la persistance relèvent de C01 sur PostgreSQL réel.
 *
 * Règle monétaire : un montant est un entier (chaîne de chiffres ou number
 * entier), jamais un flottant. Il est converti en bigint pour le domaine.
 */
import { z } from "zod";
import { DomainError, parseAmount } from "@kombe/domain";

/** Montant XAF : chaîne de chiffres ou entier JSON. Refuse tout flottant. */
export const moneyInput = z
  .union([z.string().regex(/^\d+$/), z.number().int()])
  .transform((v, ctx) => {
    try {
      return parseAmount(v);
    } catch (e) {
      if (e instanceof DomainError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: e.code });
        return z.NEVER;
      }
      throw e;
    }
  });

export const idempotencyKey = z.string().min(8).max(200);
export const expectedVersion = z.coerce.number().int().min(1);

export const inviteMemberBody = z.object({
  handle: z.string().min(1).max(120),
});

export const roleNominationBody = z.object({
  nominations: z
    .array(
      z.object({
        handle: z.string().min(1),
        role: z.enum(["animator", "treasurer", "secretary", "auditor", "member"]),
      }),
    )
    .min(1),
});

export const declareContributionBody = z.object({
  obligationId: z.string().min(1),
  amount: moneyInput,
});

export const openVoteBody = z.object({
  subject: z.string().min(1).max(200),
  quorumNumerator: z.number().int().min(0),
  quorumDenominator: z.number().int().min(1),
});

export const castBallotBody = z.object({
  choice: z.enum(["yes", "no", "abstain"]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberBody>;
export type DeclareContributionInput = z.infer<typeof declareContributionBody>;
export type RoleNominationInput = z.infer<typeof roleNominationBody>;
