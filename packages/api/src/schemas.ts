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

// Ouverture d'une proposition/volée (7.1, 18.5). Ni l'électorat NI les règles
// (quorum, version) ne sont fournis ici : l'électorat est scellé côté serveur
// depuis les membres actifs du groupe, et le quorum/version des règles sont
// résolus côté serveur (règles versionnées C04/C05). Un client ne choisit
// jamais son corps électoral ni son quorum. L'identité de l'ouvreur vient de
// l'en-tête résolu (C01), jamais du corps. Durée = volée gouvernée par
// l'horloge serveur (échéance = ouverture + durée).
export const openVoteBody = z.object({
  proposalId: z.string().min(1).max(120),
  subjectKind: z.string().min(1).max(60),
  subjectRef: z.string().min(1).max(120),
  reason: z.string().min(1).max(500),
  durationSeconds: z.number().int().min(1).max(31_536_000),
});

// Bulletin (7.2) : le votant est l'identité résolue côté serveur (en-tête),
// jamais un champ du corps — d'où l'absence de tout `voterIdentityId`.
export const castBallotBody = z.object({
  choice: z.enum(["yes", "no", "abstain"]),
});

// Annulation motivée (7.3, 18.5) : motif obligatoire, la voie légale pour
// reprendre un électorat en cours de volée (puis rouvrir une nouvelle proposition).
export const cancelProposalBody = z.object({
  reason: z.string().min(1).max(500),
});

/* --- C17 : console support, accès JIT, double approbation (8.5, 9.6, 18.17) --- */

// Demande d'accès support. La décision (motif obligatoire, permission financière
// ou inconnue refusée) est DÉLÉGUÉE au domaine, d'où des permissions laissées
// ouvertes côté schéma : le schéma ne fait pas la politique de sécurité.
export const supportAccessRequestBody = z.object({
  requestId: z.string().min(1).max(120),
  targetGroupId: z.string().min(1).max(120),
  motif: z.string().min(1).max(500),
  permissions: z.array(z.string().min(1).max(40)).min(1).max(8),
  ttlSeconds: z.number().int().min(60).max(86_400),
});

// L'approbateur et l'acteur d'une action sont des identités résolues SERVEUR
// (en-tête), jamais un champ du corps — d'où l'absence de tout `approverIdentityId`.
export const supportActionBody = z.object({
  action: z.string().min(1).max(40),
});

// L'approbation porte la durée d'accès (ttl) appliquée au passage granted ;
// l'identité de l'approbateur vient de l'en-tête serveur, jamais du corps.
export const supportApprovalBody = z.object({
  ttlSeconds: z.number().int().min(60).max(86_400),
});

// C12 — corps optionnel de generation d'export : la sequence de coupure, si
// fournie, reste inferieure ou egale a l'etat courant (bornee par le store serveur).
export const createExportBody = z.object({
  cutoffSequence: z.number().int().min(0).max(10_000_000).optional(),
});

// C12 — verification independante : le client soumet les octets (base64) du
// fichier qu'il detient ; le serveur recalcule l'empreinte et compare au manifeste.
export const exportVerificationBody = z.object({
  bytesBase64: z.string().min(0).max(4_000_000),
});

export type InviteMemberInput = z.infer<typeof inviteMemberBody>;
export type DeclareContributionInput = z.infer<typeof declareContributionBody>;
export type RoleNominationInput = z.infer<typeof roleNominationBody>;

/* --- C02 : inscription, sessions, récupération (1.1 → 1.5) --- */

const identityId = z.string().min(1).max(120);
const tokenId = z.string().min(1).max(120);

export const registrationRequest = z.object({
  identityId,
  channel: z.enum(["email", "phone"]),
});
export const registrationVerification = z.object({ identityId, tokenId });
export const recoveryRequest = z.object({ identityId });
export const recoveryCompletion = z.object({
  identityId,
  tokenId,
  suspensionSeconds: z.number().int().positive().max(86_400).optional(),
});
export const sessionLogin = z.object({ identityId, sessionId: z.string().min(1).max(120) });

export type RegistrationRequestInput = z.infer<typeof registrationRequest>;
export type RecoveryCompletionInput = z.infer<typeof recoveryCompletion>;

/* --- C03 : groupes, gouvernance, invitations, règles (2.1, 2.7, 4.1, 4.2) --- */

export const createGroupBody = z.object({
  groupId: z.string().min(1).max(120),
  minimumMembers: z.number().int().min(2).max(1000).optional(),
  requiredIndependentRoles: z.number().int().min(0).max(10).optional(),
});
export const groupTransitionBody = z.object({
  to: z.enum(["active", "paused", "closed", "stopped_with_discrepancies", "archived"]),
});
export const membershipTerminationBody = z.object({ identityId });
export const groupMutationBody = z.object({ identityId });
export const rulesAcceptanceBody = z.object({ identityId });
export const contributionDeclarationBody = z.object({ identityId });

/* --- C04 : moteur de règles versionnées et acceptations (3.1 → 3.7, 6.7) --- */

export const ruleSetInput = z.object({
  memberCount: z.number().int().min(2),
  contribution: moneyInput,
  rounds: z.number().int().min(1),
  frequency: z.enum(["monthly", "weekly"]),
  dueDay: z.number().int().min(1).max(31),
  quorum: z.object({
    numerator: z.number().int().min(1),
    denominator: z.number().int().min(1),
  }),
  gracePeriodDays: z.number().int().min(0),
  penaltyEnabled: z.boolean(),
});

export const publishRuleBody = z.object({
  snapshot: ruleSetInput,
  supersedes: z.number().int().min(1).optional(),
});
export const ruleVersionAcceptanceBody = z.object({
  identityId,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export const ruleChangeBody = z.object({
  version: z.number().int().min(1),
  concerned: z.array(identityId).min(1),
});
export const penaltyRequestBody = z.object({ desired: z.boolean() });

export type PublishRuleInput = z.infer<typeof publishRuleBody>;
export type RuleChangeInput = z.infer<typeof ruleChangeBody>;

/* --- C05 : cycles, tours, échéances, bénéficiaires (5.1 → 5.5) --- */

const memberList = z.array(identityId).min(2);
const groupId = z.string().min(1).max(120);

export const buildScheduleBody = z.object({
  groupId,
  ruleVersion: z.number().int().min(1),
  members: memberList,
  contribution: moneyInput,
  frequency: z.enum(["monthly", "weekly"]),
  dueDay: z.number().int().min(1).max(31),
  startYear: z.number().int().min(1).max(9999),
  startMonth: z.number().int().min(1).max(12),
  beneficiaryOrder: z.array(identityId).min(2),
});
export const beneficiaryReassignmentBody = z.object({
  seq: z.number().int().min(1),
  newBeneficiaryId: identityId,
});
export const departureBody = z.object({ identityId });
export const cycleRenewalBody = z.object({
  version: z.number().int().min(1),
  memberCount: z.number().int().min(2),
  contribution: moneyInput,
  rounds: z.number().int().min(1),
});

export type BuildScheduleInput = z.infer<typeof buildScheduleBody>;
export type CycleRenewalInput = z.infer<typeof cycleRenewalBody>;

/* --- C11 : journal d'événements, checkpoints, timeline (9.1 → 9.5) --- */

export const checkpointBody = z.object({
  issuedBy: z.string().min(1).max(120),
  issuedAt: z.string().datetime({ offset: true }),
});

// Trace de test (marquée NON PROD) : injecte un événement d'audit dans la
// chaîne fictive, avec enveloppe complète — acteur, rôle instantané, date
// serveur, commande. Les montants du corps sont des entiers sûrs.
export const journalAppendBody = z.object({
  actorIdentityId: identityId,
  actorRole: z.enum(["animator", "treasurer", "secretary", "auditor", "member"]),
  serverDate: z.string().date(),
  commandId: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  body: z.record(z.union([
    z.number().int().min(0).max(9007199254740991),
    z.string().max(120),
  ])),
});

export type CheckpointInput = z.infer<typeof checkpointBody>;
export type JournalAppendInput = z.infer<typeof journalAppendBody>;

// TRACE DE TEST, NON PROD — C11-TAMPER : altération d'une copie du journal.
export const tamperBody = z.object({
  seq: z.number().int().min(1),
  amount: z.number().int().min(0).max(9007199254740991),
});

/* --- C06 : déclarations partielles, idempotence, capacité sous verrou --- */

const c06ObligationId = z.string().min(1).max(120);

// Déclaration serveur (6.1/18.1/18.3). La date SERVEUR est injectée séparément
// (en-tête), jamais fournie ici : `allegedDate` est l'affirmation du client.
export const declareContributionBody_c06 = z.object({
  obligationId: c06ObligationId,
  amount: moneyInput,
  channel: z.enum(["cash", "electronic"]),
  reference: z.string().min(1).max(120).optional(),
  justification: z.string().min(1).max(500).optional(),
  allegedDate: z.string().date(),
});

// Brouillon local (6.9) : même forme, action DISTINCTE de la soumission.
export const contributionDraftBody = declareContributionBody_c06;

export type DeclareContributionC06Input = z.infer<typeof declareContributionBody_c06>;

/* --- C07 : validations, corrections et contestation (6.2 → 6.6) --- */

const contributionIdC07 = z.string().min(1).max(120);

// Compensation d'un original validé (6.6) : la contre-écriture liée porte une
// identité fournie par le serveur (le client ne choisit pas l'identité appliquée).
export const compensateBody = z.object({
  reversalContributionId: contributionIdC07,
});

// Ouverture d'un litige (6.5) : motif obligatoire (validé par le domaine,
// jamais pré-rempli ici), fenêtre ordinaire de 7 jours, pièces désactivées.
// `raisedBy` est l'acteur résolu côté serveur, jamais fourni ici.
export const disputeBody = z.object({
  disputeId: z.string().min(1).max(120),
  obligationId: z.string().min(1).max(120),
  reason: z.string().max(500),
  category: z.enum(["ordinary", "fraud", "serious_error"]),
  notifiedAt: z.number().int().min(0),
  raisedAt: z.number().int().min(0),
});

export type CompensateInput = z.infer<typeof compensateBody>;
export type DisputeInput = z.infer<typeof disputeBody>;

/* --- C10 : litiges, recours et résolution (8.1 → 8.4) --- */

// Ouverture d'un DOSSIER de litige (8.1) : motif ET correction demandée ;
// `raisedBy` est résolu côté serveur, jamais fourni ici. Pièces désactivées
// au pilote : aucun champ de pièce n'existe. Aucun montant : un litige ne
// touche jamais un total (C10-RESOLVE).
export const disputeCaseBody = z.object({
  disputeId: z.string().min(1).max(120),
  obligationId: z.string().min(1).max(120),
  reason: z.string().max(500),
  requestedCorrection: z.string().max(500),
  category: z.enum(["ordinary", "fraud", "serious_error"]),
  involvedIdentityIds: z.array(z.string().min(1).max(120)).max(20).default([]),
  notifiedAt: z.number().int().min(0),
  raisedAt: z.number().int().min(0),
});
export type DisputeCaseInput = z.infer<typeof disputeCaseBody>;

// Désignation des résolveurs (8.2) — jamais un impliqué ; liste vide refusée.
export const resolversBody = z.object({
  resolverIdentityIds: z.array(z.string().min(1).max(120)).min(1).max(10),
});
export type ResolversInput = z.infer<typeof resolversBody>;

// Résolution (8.3) : décision documentée ; les identifiants de compensation
// sont des RÉFÉRENCES à des écritures posées via C07/C08, jamais des montants.
export const disputeResolutionBody = z.object({
  outcome: z.string().max(500),
  resolvedAt: z.number().int().min(0),
  correctionContributionIds: z.array(z.string().min(1).max(120)).max(10).default([]),
});
export type DisputeResolutionInput = z.infer<typeof disputeResolutionBody>;

// Clôture de tour sondée (C10-FREEZE) : les obligations du tour, pas de montant.
export const roundCloseBody = z.object({
  obligationIds: z.array(z.string().min(1).max(120)).min(1).max(50),
});
export type RoundCloseInput = z.infer<typeof roundCloseBody>;

/* --- C08 : décaissements, corrections et rapprochement (6.10, 18.4, 18.9, 2.8) --- */

const disbursementIdC08 = z.string().min(1).max(120);

// Déclaration d'un décaissement externe (6.10). KÓMBE ne transfère rien : ce
// corps documente une sortie déjà effectuée hors système. La date SERVEUR vient
// de l'en-tête (jamais d'ici) ; `allegedDate` est l'affirmation du déclarant. Le
// déclarant est l'acteur résolu côté serveur, jamais fourni — d'où l'absence de
// champ `declarantIdentityId` (impossible de se déclarer soi-même bénéficiaire).
export const declareDisbursementBody = z.object({
  disbursementId: disbursementIdC08,
  roundId: z.string().min(1).max(120),
  obligationId: z.string().min(1).max(120),
  beneficiaryIdentityId: identityId,
  netAmount: moneyInput,
  groupFees: moneyInput,
  // Frais personnels hors pot : séparés, JAMAIS déduits du rapprochement (18.4).
  personalFeesOutOfPot: moneyInput.optional(),
  requiredControllers: z.number().int().min(0).max(10),
  allegedDate: z.number().int().min(0),
});
export type DeclareDisbursementC08Input = z.infer<typeof declareDisbursementBody>;

// Demande de correction (6.10, 18.9) : motif obligatoire, approuvé ensuite par
// un acteur INDÉPENDANT. Aucun montant, aucune référence de remboursement.
export const reversalRequestBody = z.object({
  reason: z.string().min(1).max(500),
});
export type ReversalRequestInput = z.infer<typeof reversalRequestBody>;