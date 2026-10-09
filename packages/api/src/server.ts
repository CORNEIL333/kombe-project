/**
 * Application Fastify KÓMBE. Deux modes, SANS mélange :
 *  - FICTIF (défaut, `options.pool` absent) : pipeline de domaine en mémoire,
 *    identité injectée par en-têtes de recette (x-actor). Recette du squelette
 *    uniquement, jamais servi en production.
 *  - RÉEL (`options.pool` fourni) : la session Bearer est résolue côté serveur
 *    (C01, table session + RLS) et les routes critiques persistent via les
 *    stores PostgreSQL sous RLS. Une route sans implémentation PG n'existe PAS
 *    en mode réel (404 Fastify) : aucune donnée fictive n'est jamais servie.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type pg from "pg";
import { registerHttpGuards } from "./httpGuards.js";
import { DISPLAY_TZ, DomainError, type DomainErrorCode } from "@kombe/domain";
import type { CycleSchedule, ContributionDeclaration } from "@kombe/domain";
import { PgContributionStore } from "./db/pgContributionStore.js";
import { PgAccessStore } from "./db/pgAccessStore.js";
import { PgMetricsStore } from "./db/pgMetricsStore.js";
import { PgGovernanceStore } from "./db/pgGovernanceStore.js";
import {
  PgValidationStore,
  type ValidationContext as PgValidationContext,
} from "./db/pgValidationStore.js";
import { PgDisputeStore, type DisputeActor as PgDisputeActor } from "./db/pgDisputeStore.js";
import { PgDisbursementStore } from "./db/pgDisbursementStore.js";
import { PgProposalStore } from "./db/pgProposalStore.js";
import { PgJournalStore } from "./db/pgJournalStore.js";
import { PgSupportStore, type SupportContext as PgSupportContext } from "./db/pgSupportStore.js";
import { PgExportStore, type ExportContext as PgExportContext } from "./db/pgExportStore.js";
import { PgPrivacyStore, type PrivacyContext as PgPrivacyContext } from "./db/pgPrivacyStore.js";
import { PgRulesStore } from "./db/pgRulesStore.js";
import { PgScheduleStore } from "./db/pgScheduleStore.js";
import {
  invitationGroup,
  voteGroup,
  exportManifestGroup,
  supportRequestGroup,
  privacyRightsGroup,
  privacySubjectGroup,
} from "./db/pgGroupResolvers.js";
import { resolveSession, resolveGroupActor, type GroupActor } from "./db/pgSessionResolver.js";
import { ResendEmailSender, type EmailSender } from "./email/emailSender.js";
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
  FictitiousContributionStore,
  type DeclareContext,
} from "./contributionStore.js";
import {
  FictitiousValidationStore,
  type ValidationContext,
} from "./validationStore.js";
import {
  FictitiousDisputeStore,
  type DisputeActor,
} from "./disputeStore.js";
import {
  FictitiousDisbursementStore,
  type DisbursementContext,
} from "./disbursementStore.js";
import {
  FictitiousProposalStore,
  type GroupDecisionRules,
  type ProposalContext,
} from "./proposalStore.js";
import {
  FictitiousSupportStore,
  type SupportContext,
} from "./supportStore.js";
import {
  FictitiousExportStore,
  type ExportContext,
} from "./exportStore.js";
import {
  FictitiousPrivacyStore,
  type PrivacyContext,
} from "./privacyStore.js";
import {
  FictitiousMetricsStore,
  type MetricsContext,
  type MetricsStore,
} from "./metricsStore.js";
import {
  declareContributionBody,
  declareContributionBody_c06,
  contributionDraftBody,
  compensateBody,
  disputeBody,
  disputeCaseBody,
  disputeResolutionBody,
  resolversBody,
  roundCloseBody,
  idempotencyKey,
  expectedVersion,
  registrationRequest,
  registrationVerification,
  recoveryRequest,
  recoveryCompletion,
  sessionLogin,
  loginRequest,
  loginCompletion,
  createGroupBody,
  sponsorshipRequestBody,
  sponsorshipDecisionBody,
  groupTransitionBody,
  membershipTerminationBody,
  inviteMemberBody,
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
  declareDisbursementBody,
  reversalRequestBody,
  openVoteBody,
  castBallotBody,
  cancelProposalBody,
  supportAccessRequestBody,
  supportApprovalBody,
  supportActionBody,
  createExportBody,
  exportVerificationBody,
  legalNoticeBody,
  consentBody,
  processingRecordBody,
  rightsRequestOpenBody,
  rightsVerificationBody,
  rightsRestrictionBody,
  restorationBody,
  analyticsEventBody,
  cohortBody,
  economicsBody,
  riskBody,
} from "./schemas.js";

/** Code d'erreur domaine → statut HTTP (erreurs stables, non divulguantes). */
const STATUS_BY_CODE: Partial<Record<DomainErrorCode, number>> = {
  FEATURE_PILOT_FORBIDDEN: 403,
  EMAIL_DELIVERY_FAILED: 502,
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
  IDEMPOTENCY_BODY_CONFLICT: 409,
  CONTRIBUTION_EXCEEDS_REMAINING: 409,
  REFERENCE_JUSTIFICATION_REQUIRED: 422,
  CONTRIBUTION_STATE_INVALID: 409,
  CONTRIBUTION_ALREADY_COMPENSATED: 409,
  VALIDATION_BLOCKED_BY_DISPUTE: 409,
  ROUND_CLOSE_BLOCKED_BY_DISPUTE: 409,
  DISPUTE_WINDOW_CLOSED: 422,
  DISPUTE_REASON_REQUIRED: 422,
  DISPUTE_NOT_RESOLVABLE: 409,
  DISPUTE_ALREADY_RESOLVED: 409,
  DISPUTE_RESOLVER_NOT_DESIGNATED: 403,
  DISPUTE_RESOLVER_NOT_INDEPENDENT: 403,
  DISPUTE_RESOLUTION_REQUIRED: 422,
  DISBURSEMENT_STATE_INVALID: 409,
  DISBURSEMENT_SUBSTITUTE_REQUIRED: 422,
  DISBURSEMENT_ALREADY_REVERSED: 409,
  DISBURSEMENT_REVERSAL_NOT_INDEPENDENT: 403,
  DISBURSEMENT_SERVER_DATE_INVALID: 422,
  PROPOSAL_REASON_REQUIRED: 422,
  PROPOSAL_DEADLINE_INVALID: 422,
  PROPOSAL_STATE_INVALID: 409,
  PROPOSAL_NOT_DUE: 409,
  PROPOSAL_NOT_APPROVED: 409,
  PROPOSAL_CANCEL_REASON_REQUIRED: 422,
  PROPOSAL_SERVER_DATE_INVALID: 422,
  ELECTORATE_INVALIDE: 422,
  VOTE_HORS_LIMITES: 422,
  MEMBERSHIP_STATE_INVALID: 422,
  PASSWORD_TOO_WEAK: 422,
  PASSWORD_COMPROMISED: 422,
  MONEY_NOT_INTEGER: 422,
  MONEY_NEGATIVE: 422,
  MONEY_OVER_PER_AMOUNT_CEILING: 422,
  MONEY_OVER_SAFE_CEILING: 422,
  ROTATION_MEMBERS_MIN: 422,
  ROTATION_CONTRIBUTION_POSITIVE: 422,
  SUPPORT_MOTIF_REQUIRED: 422,
  SUPPORT_ACCESS_EXPIRED: 403,
  SUPPORT_FINANCIAL_FORBIDDEN: 403,
  EXPORT_CUTOPE_INVALID: 422,
  EXPORT_IDENTIFIANT_REQUIS: 422,
  PRIVACY_IDENTIFIANT_REQUIS: 422,
  PRIVACY_CONTENU_PLACEHOLDER: 422,
  PRIVACY_CONSENTEMENT_CATEGORIE_INCONNUE: 422,
  PRIVACY_VERIFICATION_INSUFFISANTE: 403,
  PRIVACY_MOTIF_GEL_REQUIS: 422,
  METRICS_IDENTIFIANT_REQUIS: 422,
  METRICS_ETAPE_ANALYTICS_INCONNUE: 422,
  METRICS_CHAMPS_FINANCIER_INDIVIDUEL: 422,
  METRICS_DENOMINATEUR_NUL: 422,
  METRICS_SEVERITE_INCONNUE: 422,
  METRICS_VALEUR_INVALIDE: 422,
  METRICS_RISQUE_CRITIQUE_SANS_CONTROLE: 409,
  /* Amorçage tontine (C03 §2.1-2.3, C05 §5.3, C21, parrainage) */
  TONTINE_MODEL_UNKNOWN: 422,
  ROTATION_TYPE_UNKNOWN: 422,
  ROTATION_TYPE_NOT_READY: 409,
  GROUP_CURRENCY_UNSUPPORTED: 422,
  GROUP_TIMEZONE_UNSUPPORTED: 422,
  GROUP_PARENT_UNKNOWN: 422,
  GROUP_PARENT_SELF_FORBIDDEN: 422,
  GROUP_PARENT_CYCLE: 422,
  GROUP_PARENT_DEPTH_EXCEEDED: 422,
  SUPERVISOR_NOT_MEMBER: 403,
  SUPERVISOR_FINANCIAL_FORBIDDEN: 403,
  SPONSOR_NOT_ACTIVE_MEMBER: 403,
  SPONSOR_SELF_FORBIDDEN: 422,
  SPONSORSHIP_ALREADY_OPEN: 409,
  SPONSORSHIP_STATE_INVALID: 409,
};

export interface BuildAppOptions {
  readonly store?: FictitiousCommandStore;
  readonly access?: FictitiousAccessStore;
  readonly governance?: FictitiousGovernanceStore;
  readonly rules?: FictitiousRulesStore;
  readonly schedule?: FictitiousScheduleStore;
  readonly journal?: FictitiousJournalStore;
  readonly contribution?: FictitiousContributionStore;
  readonly validation?: FictitiousValidationStore;
  readonly disputes?: FictitiousDisputeStore;
  readonly disbursements?: FictitiousDisbursementStore;
  readonly proposals?: FictitiousProposalStore;
  readonly support?: FictitiousSupportStore;
  readonly exports?: FictitiousExportStore;
  readonly privacy?: FictitiousPrivacyStore;
  readonly metrics?: MetricsStore;
  /**
   * Mode RÉEL (Piste A3) : quand fourni, active l'authentification par
   * session réelle (`Authorization: Bearer <sessionId>`, `resolveSession`/
   * `resolveGroupActor`, Piste A2) et les stores PostgreSQL sous RLS pour
   * TOUTES les routes qui ont une implémentation PG (accès C02, gouvernance
   * C03, cotisations C06, validation C07, décaissements C08, propositions
   * C09, litiges C10, journal C11, export C12, droits C16, support C17,
   * métriques C18). Les routes SANS implémentation PG n'existent pas en mode
   * réel (404). Absent (défaut, tous les tests existants) : comportement
   * 100% inchangé, stores fictifs partout, `x-actor` toujours fictif.
   */
  readonly pool?: pg.Pool;
  /** Injectable pour les tests du mode réel (jamais un envoi réel hors
   *  G0) ; par défaut `ResendEmailSender` lue depuis `RESEND_API_KEY`/
   *  `KOMBE_EMAIL_FROM` quand `pool` est fourni sans substitut explicite. */
  readonly emailSender?: EmailSender;
  /** Horloge SERVEUR injectable (tests du mode réel) ; `Date.now` par défaut.
   *  L'heure client n'est JAMAIS consultée pour un scellement (règle 18). */
  readonly now?: () => number;
  /** Pool VÉRIFICATEUR (rôle de vérification du journal, C11) pour les
   *  checkpoints : distinct du pool applicatif, il signe les checkpoints
   *  hors RLS applicative. Absent : `journal.checkpoint` reste indisponible
   *  en mode réel (RESERVATION_INCOHERENTE côté store). */
  readonly journalVerifierPool?: pg.Pool;
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

/**
 * Contexte C06 : la date SERVEUR (`x-server-date`, défaut fictif fixe) est
 * distincte de la date alléguée fournie dans le corps ; l'identité et les
 * groupes actifs de l'acteur viennent de l'en-tête fictif (C01 les résoudra
 * depuis une session réelle + RLS). `commandId` defaulted to the idempotency
 * key keeps the receipt deterministic without a clock.
 */
function declareCtxFrom(
  request: { headers: Record<string, unknown> },
): DeclareContext {
  const actor = actorFrom(request);
  const key = idempotencyKey.parse(request.headers["idempotency-key"]);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    idempotencyKey: key,
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId: typeof commandIdHeader === "string" ? commandIdHeader : `cmd-${key}`,
  };
}

/**
 * Acteur C10 : un acte sur dossier de litige (ouverture, désignation,
 * résolution, recours, sondes) — identité et groupes viennent de l'en-tête
 * fictif (C01 les résoudra depuis session + RLS). Aucun montant n'entre.
 */
function disputeActorFrom(
  request: { headers: Record<string, unknown> },
): DisputeActor {
  const actor = actorFrom(request);
  return {
    identityId: actor.identityId ?? actor.handle,
    role: actor.role,
    groupIds: actor.groupIds,
  };
}

/**
 * Contexte C07 : un acte de validation (confirmation/contrôle/rejet/
 * compensation) est une commande MUTANTE — il porte la version d'objet
 * attendue (`if-match-version`) et une date SERVEUR distincte. L'identité et
 * les rôles viennent de l'en-tête fictif (C01 les résoudra depuis session + RLS).
 */
function validationCtxFrom(
  request: { headers: Record<string, unknown> },
): ValidationContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId: typeof commandIdHeader === "string" ? commandIdHeader : `cmd-${actor.identityId ?? actor.handle}`,
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/**
 * Contexte C08 : un acte sur décaissement (déclaration/confirmation/contrôle/
 * correction) est une commande MUTANTE — version d'objet attendue et date
 * SERVEUR distincte de la date alléguée. Identité et rôles viennent de l'en-tête
 * fictif (C01 les résoudra depuis session + RLS). Aucun transfert de fonds.
 * La version est EXIGÉE sur les mutations (18.2) : pas de défaut silencieux.
 */
function disbursementCtxFrom(
  request: { headers: Record<string, unknown> },
): DisbursementContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId:
      typeof commandIdHeader === "string"
        ? commandIdHeader
        : `cmd-${actor.identityId ?? actor.handle}`,
    // Mutation : `if-match-version` OBLIGATOIRE — l'absence ou une valeur
    // invalide est un refus 422, jamais un défaut à 1 qui affaiblirait la
    // concurrence optimiste (ADR-0006, règle 18.2).
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/**
 * Contexte C08 en LECTURE (vue, rapprochement) : authentification + scopage
 * anti-IDOR uniquement, sans version d'objet — une lecture ne mute rien et le
 * verrou optimiste ne s'applique pas.
 */
function disbursementReadCtxFrom(
  request: { headers: Record<string, unknown> },
): DisbursementContext {
  const actor = actorFrom(request);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: "2026-09-28",
    commandId: `read-${actor.identityId ?? actor.handle}`,
    expectedVersion: 0,
  };
}

/**
 * Contexte C08 pour une DÉCLARATION (CREATE) : aucun objet préexistant, donc
 * aucune version d'objet à vérifier — le store n'évalue pas `expectedVersion`
 * sur cette voie (doublon ⇒ 409 par registre d'objet, pas par version).
 */
function disbursementDeclareCtxFrom(
  request: { headers: Record<string, unknown> },
): DisbursementContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId:
      typeof commandIdHeader === "string"
        ? commandIdHeader
        : `cmd-${actor.identityId ?? actor.handle}`,
    expectedVersion: 0,
  };
}

/**
 * Contexte C09 pour une MUTATION sur proposition existante (bulletin, clôture,
 * annulation, exécution) : version d'objet EXIGÉE (`if-match-version`), date
 * SERVEUR distincte. Identité/rôles viennent de l'en-tête fictif (C01 les
 * résoudra via session + RLS). L'absence de version est un refus 422, jamais un
 * défaut silencieux (concurrence optimiste, ADR-0006 / règle 18.2).
 */
function proposalCtxFrom(
  request: { headers: Record<string, unknown> },
): ProposalContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId:
      typeof commandIdHeader === "string"
        ? commandIdHeader
        : `cmd-${actor.identityId ?? actor.handle}`,
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/**
 * Contexte C09 à l'OUVERTURE (CREATE) : aucun objet préexistant, donc aucune
 * version à vérifier (doublon ⇒ 409 par registre d'objet, pas par version).
 */
function proposalOpenCtxFrom(
  request: { headers: Record<string, unknown> },
): ProposalContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28",
    commandId:
      typeof commandIdHeader === "string"
        ? commandIdHeader
        : `cmd-${actor.identityId ?? actor.handle}`,
    expectedVersion: 0,
  };
}

/**
 * Contexte C09 en LECTURE (vue, historique) : authentification + scopage
 * anti-IDOR uniquement, sans version d'objet — une lecture ne mute rien.
 */
function proposalReadCtxFrom(
  request: { headers: Record<string, unknown> },
): ProposalContext {
  const actor = actorFrom(request);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverDate: "2026-09-28",
    commandId: `read-${actor.identityId ?? actor.handle}`,
    expectedVersion: 0,
  };
}

/**
 * Contexte C17 (console support) : l'horloge est une date SERVEUR en secondes
 * d'époque, injectée (`x-server-date`, défaut fictif fixe) et jamais fournie par
 * le client. Identité/rôles/groupes viennent de l'en-tête fictif (C01 les
 * résoudra via session + RLS). Le support n'a aucun pouvoir financier : aucune
 * action de montant n'entre par ce contexte.
 */
function supportCtxFrom(
  request: { headers: Record<string, unknown> },
): SupportContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const commandIdHeader = request.headers["x-command-id"];
  const iso = typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28T00:00:00Z";
  const ms = Date.parse(iso);
  const serverNow = Number.isNaN(ms)
    ? Math.floor(Date.parse("2026-09-28T00:00:00Z") / 1000)
    : Math.floor(ms / 1000);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverNow,
    commandId:
      typeof commandIdHeader === "string"
        ? commandIdHeader
        : `cmd-${actor.identityId ?? actor.handle}`,
  };
}

/**
 * Contexte C17 en LECTURE (vue scopée) : authentification uniquement, une
 * lecture ne mute rien et ne pose aucune décision d'accès.
 */
function supportReadCtxFrom(
  request: { headers: Record<string, unknown> },
): SupportContext {
  const actor = actorFrom(request);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    actorGroupIds: actor.groupIds,
    serverNow: Math.floor(Date.parse("2026-09-28T00:00:00Z") / 1000),
    commandId: `read-${actor.identityId ?? actor.handle}`,
  };
}

/**
 * Contexte C12 (export du relevé) : la date de capture est une date SERVEUR
 * injectée (`x-server-date`) ; le demandeur et son appartenance au groupe sont
 * résolus côté serveur, jamais déclarés par le client (ADR-0005/0006).
 */
function exportCtxFrom(
  request: { headers: Record<string, unknown> },
): ExportContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    serverDate: typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28T00:00:00Z",
  };
}

/**
 * Contexte C16 (données personnelles) : l'horloge est une date SERVEUR en
 * secondes d'époque injectée (`x-server-date`) ; le sujet d'un droit et son
 * appartenance active (service cœur) sont résolus côté serveur, jamais déclarés
 * par le client (ADR-0005/0006). Aucun montant ne transite par ce contexte.
 */
function privacyCtxFrom(
  request: { headers: Record<string, unknown> },
): PrivacyContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const iso = typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28T00:00:00Z";
  const ms = Date.parse(iso);
  const serverNow = Number.isNaN(ms)
    ? Math.floor(Date.parse("2026-09-28T00:00:00Z") / 1000)
    : Math.floor(ms / 1000);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    serverNow,
  };
}

/**
 * Contexte C18 (mesure pilote / économie unitaire) : l'horloge est une
 * seconde d'époque SERVEUR dérivée de `x-server-date` (jamais fournie par le
 * client) ; l'acteur et son rôle sont résolus serveur (ADR-0005/0006). Aucun
 * champ financier individuel ne transite par l'analytics — la garantie est
 * portées par le domaine (`metrics.ts`) et vérifiée à la construction.
 */
function metricsCtxFrom(
  request: { headers: Record<string, unknown> },
): MetricsContext {
  const actor = actorFrom(request);
  const serverDateHeader = request.headers["x-server-date"];
  const iso = typeof serverDateHeader === "string" ? serverDateHeader : "2026-09-28T00:00:00Z";
  const ms = Date.parse(iso);
  const serverNow = Number.isNaN(ms)
    ? Math.floor(Date.parse("2026-09-28T00:00:00Z") / 1000)
    : Math.floor(ms / 1000);
  return {
    actorIdentityId: actor.identityId ?? actor.handle,
    actorRole: actor.role,
    serverNow,
  };
}

/** Construit l'expéditeur Resend réel depuis l'environnement. Échec explicite
 *  (jamais un repli silencieux) si `RESEND_API_KEY` est absente : un pool réel
 *  sans expéditeur réel serait un mode réel partiellement simulé, exclu. */
function requireResendSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY absente : mode réel (pool fourni) exige un expéditeur email réel (ADR-0023/0024).",
    );
  }
  const from = process.env.KOMBE_EMAIL_FROM && process.env.KOMBE_EMAIL_FROM.length > 0
    ? process.env.KOMBE_EMAIL_FROM
    : "KÓMBE <onboarding@resend.dev>";
  return new ResendEmailSender(apiKey, from);
}

/**
 * Authentification RÉELLE (Piste A3) : résout `Authorization: Bearer
 * <sessionId>` en identité (`resolveSession`, SECURITY DEFINER, Piste A2),
 * PUIS l'adhésion active + rôle accepté dans le groupe ciblé
 * (`resolveGroupActor`) — une seule transaction courte, dédiée à
 * l'authentification (distincte de la transaction d'écriture/lecture
 * métier qui suit, ouverte séparément par `PgContributionStore`). Absence ou
 * malformation de l'en-tête répond par le même `SESSION_INVALID` qu'une
 * session invalide (non-divulgation) — jamais une distinction observable.
 */
async function realGroupActorFrom(
  dbPool: pg.Pool,
  request: { headers: Record<string, unknown> },
  groupId: string,
  now: () => number,
): Promise<GroupActor> {
  const authHeader = request.headers["authorization"];
  const sessionId =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
  if (!sessionId) {
    throw new DomainError("SESSION_INVALID", "Session non applicable");
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const identity = await resolveSession(client, sessionId, now());
    await client.query("SELECT set_config('kombe.group_id', $1, true)", [groupId]);
    const actor = await resolveGroupActor(client, identity.identityId, groupId);
    await client.query("COMMIT");
    return actor;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Connexion perdue : rien à faire, le pool la recréera. */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Date SERVEUR (AAAA-MM-JJ) dans le fuseau de référence projet KÓMBE
 *  (`DISPLAY_TZ`, Afrique/Douala) — jamais l'horloge du client (§27). */
function doualaToday(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

/**
 * Authentification RÉELLE SANS GROUPE (routes C12 export, C16 droits, C17
 * support) : résout la session en identité SEULE. Le groupe de la ressource
 * est ensuite résolu par les résolveurs étroits 0020 (SECURITY DEFINER) —
 * l'appartenance (ou non) à un groupe ne doit jamais devenir un oracle
 * d'existence sur ces routes : tout est indistinguablement 401/404.
 */
async function realIdentityFrom(
  dbPool: pg.Pool,
  request: { headers: Record<string, unknown> },
  now: () => number,
): Promise<string> {
  const authHeader = request.headers["authorization"];
  const sessionId =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
  if (!sessionId) {
    throw new DomainError("SESSION_INVALID", "Session non applicable");
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const identity = await resolveSession(client, sessionId, now());
    await client.query("COMMIT");
    return identity.identityId;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Connexion perdue : rien à faire, le pool la recréera. */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Règles de décision RÉELLES du groupe : relues depuis `kombe.rule_version`
 * (règles VERSIONNÉES C04 — la plus récente applicable gagne). Le client ne
 * fournit JAMAIS quorum ni version (règle 18 / ADR-0005). Aucune règle
 * publiée → `RULES_NOT_ACCEPTED` ; instantané sans quorum valide → `RULE_INVALID`
 * (jamais de valeur par défaut inventée).
 */
async function realGroupDecisionRules(dbPool: pg.Pool, groupId: string): Promise<GroupDecisionRules> {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('kombe.group_id', $1, true)", [groupId]);
    const res = await client.query(
      `SELECT rules_version, snapshot FROM rule_version
        WHERE group_id = $1 ORDER BY rules_version DESC LIMIT 1`,
      [groupId],
    );
    await client.query("COMMIT");
    const row = res.rows[0] as { rules_version?: unknown; snapshot?: unknown } | undefined;
    if (!row) {
      throw new DomainError("RULES_NOT_ACCEPTED", "Aucune règle publiée pour ce groupe");
    }
    const snapshot = row.snapshot as { quorum?: { numerator?: unknown; denominator?: unknown } } | null;
    const numerator = snapshot?.quorum?.numerator;
    const denominator = snapshot?.quorum?.denominator;
    if (
      typeof numerator !== "number" ||
      typeof denominator !== "number" ||
      !Number.isInteger(numerator) ||
      !Number.isInteger(denominator) ||
      numerator < 1 ||
      denominator < 1 ||
      numerator > denominator
    ) {
      throw new DomainError("RULE_INVALID", "Instantané de règles sans quorum valide");
    }
    return {
      quorumNumerator: numerator,
      quorumDenominator: denominator,
      rulesVersion: Number(row.rules_version),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Connexion perdue : rien à faire, le pool la recréera. */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Base des contextes RÉELS : acteur résolu côté serveur, groupe scopé explicitement. */
function realCtxBase(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): {
  actorIdentityId: string;
  actorRole: GroupActor["role"];
  actorGroupIds: readonly string[];
  serverDate: string;
  commandId: string;
} {
  const key = idempotencyKey.parse(request.headers["idempotency-key"]);
  return {
    actorIdentityId: actor.identityId,
    actorRole: actor.role,
    actorGroupIds: [groupId],
    serverDate: new Date(nowMs).toISOString(),
    commandId: `cmd-${key}`,
  };
}

/** Contexte C07 réel : acte de validation MUTANT, `if-match-version` EXIGÉ. */
function realValidationCtxFrom(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): PgValidationContext {
  return {
    ...realCtxBase(actor, groupId, request, nowMs),
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/** Contexte C08 réel : acte sur décaissement MUTANT, `if-match-version` EXIGÉ. */
function realDisbursementCtxFrom(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): DisbursementContext {
  return {
    ...realCtxBase(actor, groupId, request, nowMs),
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/** Contexte C08 réel pour une DÉCLARATION (CREATE) : aucune version préexistante. */
function realDisbursementDeclareCtxFrom(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): DisbursementContext {
  return {
    ...realCtxBase(actor, groupId, request, nowMs),
    expectedVersion: 0,
  };
}

/** Contexte C08 réel en LECTURE : pas de version d'objet (aucune mutation). */
function realDisbursementReadCtxFrom(
  actor: GroupActor,
  groupId: string,
  nowMs: number,
): DisbursementContext {
  return {
    actorIdentityId: actor.identityId,
    actorRole: actor.role,
    actorGroupIds: [groupId],
    serverDate: new Date(nowMs).toISOString(),
    commandId: `read-${actor.identityId}`,
    expectedVersion: 0,
  };
}

/** Contexte C09 réel : mutation sur proposition, `if-match-version` EXIGÉ.
 *  `serverDate` = instant ISO complet : le store en dérive l'échéance (ms). */
function realProposalCtxFrom(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): ProposalContext {
  return {
    ...realCtxBase(actor, groupId, request, nowMs),
    expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
  };
}

/** Contexte C09 réel à l'OUVERTURE (CREATE) : aucune version préexistante. */
function realProposalOpenCtxFrom(
  actor: GroupActor,
  groupId: string,
  request: { headers: Record<string, unknown> },
  nowMs: number,
): ProposalContext {
  return {
    ...realCtxBase(actor, groupId, request, nowMs),
    expectedVersion: 0,
  };
}

/** Contexte C09 réel en LECTURE : pas de version d'objet. */
function realProposalReadCtxFrom(actor: GroupActor, groupId: string, nowMs: number): ProposalContext {
  return {
    actorIdentityId: actor.identityId,
    actorRole: actor.role,
    actorGroupIds: [groupId],
    serverDate: new Date(nowMs).toISOString(),
    commandId: `read-${actor.identityId}`,
    expectedVersion: 0,
  };
}

/** Contexte C17 réel (console support) : session seule, horloge serveur en
 *  secondes d'époque. `actorRole`/`actorGroupIds` ne participent à AUCUNE
 *  décision du store support (rôle le moins privilégié, valeurs inertes). */
function realSupportCtxFrom(identityId: string, nowMs: number): PgSupportContext {
  return {
    actorIdentityId: identityId,
    actorRole: "member",
    actorGroupIds: [],
    serverNow: Math.floor(nowMs / 1000),
    commandId: `cmd-${identityId}`,
  };
}

/** Contexte C16 réel (droits) : session seule, horloge serveur. */
function realPrivacyCtxFrom(identityId: string, nowMs: number): PgPrivacyContext {
  return {
    actorIdentityId: identityId,
    actorRole: "member",
    serverNow: Math.floor(nowMs / 1000),
  };
}

/** Contexte C12 réel (export) : session seule, date serveur ISO. */
function realExportCtxFrom(identityId: string, nowMs: number): PgExportContext {
  return {
    actorIdentityId: identityId,
    actorRole: "member",
    serverDate: new Date(nowMs).toISOString(),
  };
}

/** Contexte C18 réel (mesure pilote) : session seule (§14 — jamais `x-actor`),
 *  horloge SERVEUR en secondes d'époque (§27 — jamais `x-server-date`) ;
 *  `actorRole` ne participe à aucune décision du store mesure (inerte). */
function realMetricsCtxFrom(identityId: string, nowMs: number): MetricsContext {
  return {
    actorIdentityId: identityId,
    actorRole: "member",
    serverNow: Math.floor(nowMs / 1000),
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // CORS multi-origines + limitation de débit (§20/§25) : enregistrées avant
  // tout autre hook pour que le pré-flight OPTIONS soit répondu sans toucher
  // aux routes ni aux stores.
  registerHttpGuards(app);

  // Durcissement sécurité (§20) : en-têtes de base posés sur CHAQUE réponse
  // de l'API (JSON authentifiée — aucune route à servir en frame ni en cache
  // partagé, aucun contenu mixte). Pas de dépendance helmet : le besoin tient
  // en cinq lignes, un plugin serait une abstraction prématurée.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    reply.header("cache-control", "no-store");
  });

  const store = options.store ?? new FictitiousCommandStore();
  const access = options.access ?? new FictitiousAccessStore();
  const governance = options.governance ?? new FictitiousGovernanceStore();
  const rules = options.rules ?? new FictitiousRulesStore();
  const schedule = options.schedule ?? new FictitiousScheduleStore();
  const journal = options.journal ?? new FictitiousJournalStore();
  const contribution = options.contribution ?? new FictitiousContributionStore();
  const validation = options.validation ?? new FictitiousValidationStore();
  const disputes = options.disputes ?? new FictitiousDisputeStore();
  const disbursements = options.disbursements ?? new FictitiousDisbursementStore();
  const proposals = options.proposals ?? new FictitiousProposalStore();
  const support = options.support ?? new FictitiousSupportStore();
  const exportStore = options.exports ?? new FictitiousExportStore();
  const privacyStore = options.privacy ?? new FictitiousPrivacyStore();
  // Mode RÉEL : quand un pool Postgres est fourni, la mesure pilote persiste
  // dans les tables `0017_pilot_metrics` (analytics/cohortes/risques réels).
  // Sans pool (défaut, tous les tests C18 existants), store fictif en mémoire.
  const realMetrics = options.pool ? new PgMetricsStore(options.pool) : undefined;
  const metricsStore: MetricsStore = options.metrics ?? realMetrics ?? new FictitiousMetricsStore();

  // Mode RÉEL (Piste A3, cf. BuildAppOptions.pool) : construit seulement si
  // un pool est fourni. Jamais de repli silencieux sur NullEmailSender ici
  // (un pool réel sans expéditeur réel configuré est une erreur de
  // déploiement — échec explicite au démarrage, jamais un faux succès).
  const pool = options.pool;
  const now = options.now ?? (() => Date.now());
  const realContribution = pool ? new PgContributionStore(pool) : undefined;
  const realAccess = pool
    ? new PgAccessStore(pool, options.emailSender ?? requireResendSender())
    : undefined;
  const realGovernance = pool ? new PgGovernanceStore(pool) : undefined;
  const realValidation = pool ? new PgValidationStore(pool) : undefined;
  const realDisputes = pool ? new PgDisputeStore(pool) : undefined;
  const realDisbursements = pool ? new PgDisbursementStore(pool) : undefined;
  const realProposals = pool ? new PgProposalStore(pool) : undefined;
  const realJournal = pool ? new PgJournalStore(pool, options.journalVerifierPool) : undefined;
  const realSupport = pool ? new PgSupportStore(pool) : undefined;
  const realExports = pool ? new PgExportStore(pool) : undefined;
  const realPrivacy = pool ? new PgPrivacyStore(pool) : undefined;
  const realRules = pool ? new PgRulesStore(pool, now) : undefined;
  const realSchedule = pool ? new PgScheduleStore(pool) : undefined;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(422).send({ code: "VALIDATION", message: "Requête invalide" });
    }
    if (error instanceof DomainError) {
      const status = STATUS_BY_CODE[error.code] ?? 400;
      return reply.code(status).send({ code: error.code, message: "Requête refusée" });
    }
    // Erreurs de PROTOCOLE Fastify (corps JSON vide/malformé, type de contenu
    // refusé…) : statut 4xx porté par l'erreur elle-même ; jamais 500.
    const proto = (error as { statusCode?: number }).statusCode;
    if (typeof proto === "number" && proto >= 400 && proto < 500) {
      return reply.code(proto).send({ code: "INVALID_REQUEST", message: "Requête invalide" });
    }
    app.log.error(error);
    return reply.code(500).send({ code: "INTERNAL", message: "Erreur interne" });
  });

  // Santé d'exploitation (DÉPLOIEMENT) : liveness = le process répond ;
  // readiness = en mode RÉEL, vérifie réellement PostgreSQL (jamais une
  // constante) ; en mode FICTIF, le service est honnêtement « prêt » sans base.
  app.get("/v1/health/live", async () => ({ status: "ok" }));
  app.get("/v1/health/ready", async (request, reply) => {
    if (!pool) return { status: "ready", mode: "fictif" };
    try {
      await pool.query("SELECT 1");
      return { status: "ready", mode: "réel" };
    } catch (error) {
      request.log.error({ err: error }, "readiness : PostgreSQL injoignable");
      return reply.code(503).send({ status: "degraded", mode: "réel" });
    }
  });
  // Alias générique (docker-compose) : même sémantique que /ready.
  app.get("/v1/health", async (request, reply) => {
    if (!pool) return { status: "ok", mode: "fictif" };
    try {
      await pool.query("SELECT 1");
      return { status: "ok", mode: "réel" };
    } catch (error) {
      request.log.error({ err: error }, "santé : PostgreSQL injoignable");
      return reply.code(503).send({ status: "degraded", mode: "réel" });
    }
  });

  // Routes du squelette C00 (pipeline fictif) : n'existent PAS en mode réel
  // (aucune implémentation PG) — 404 Fastify, jamais de données fictives.
  if (!pool) {
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
  }

  /* --- C02 : inscription / sessions / récupération (1.1 → 1.5) --- */

  // Demande d'inscription — réponse anti-énumération (202 uniforme).
  // Même contrat {identityId, channel} fictif/réel (PgAccessStore, Piste A2
  // suite) : bascule transparente selon `pool`, aucun changement de route.
  app.post("/v1/access/registrations", async (request, reply) => {
    const body = registrationRequest.parse(request.body);
    const receipt = realAccess
      ? await realAccess.requestRegistration(body.identityId, body.channel)
      : access.requestRegistration(body.identityId, body.channel);
    return reply.code(202).send(receipt);
  });

  // Vérification du canal par CODE (ADR-0024) — même contrat fictif/réel.
  app.post("/v1/access/registrations/verifications", async (request, reply) => {
    const body = registrationVerification.parse(request.body);
    const out = realAccess
      ? await realAccess.verifyRegistration(body.identityId, body.code)
      : access.verifyRegistration(body.identityId, body.code);
    return reply.code(200).send(out);
  });

  // Demande de récupération — gabarit identique compte connu/inconnu (1.4).
  app.post("/v1/access/recovery-requests", async (request, reply) => {
    const body = recoveryRequest.parse(request.body);
    const receipt = realAccess
      ? await realAccess.requestRecovery(body.identityId)
      : access.requestRecovery(body.identityId);
    return reply.code(202).send(receipt);
  });

  // Achèvement de la récupération : jeton à usage unique + révocation de
  // toutes les sessions antérieures (C02-RECOVERY, C02-SESSION).
  app.post("/v1/access/recovery-completions", async (request, reply) => {
    const body = recoveryCompletion.parse(request.body);
    const out = realAccess
      ? await realAccess.completeRecovery(body.identityId, body.code, body.suspensionSeconds)
      : access.completeRecovery(body.identityId, body.code, body.suspensionSeconds);
    return reply.code(200).send(out);
  });

  // Ouverture de session FICTIVE (1.2, squelette C00) — `sessionId` client,
  // volontairement NON touchée (ADR-0024 §limites) : le mode réel a sa PROPRE
  // paire de routes ci-dessous (`sessionId` généré serveur, jamais client).
  // Ces trois routes fictives n'existent PAS en mode réel.
  if (!pool) {
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
  }

  // Privilège opérateur RECALCULÉ serveur, jamais depuis le jeton (C02-PRIVILEGE).
  app.get("/v1/access/operators/:identityId/privilege", async (request, reply) => {
    const { identityId } = request.params as { identityId: string };
    const out = realAccess
      ? await realAccess.operatorAccess(identityId)
      : access.operatorAccess(identityId);
    return reply.code(200).send(out);
  });

  // --- Connexion RÉELLE (ADR-0024, Piste A3) : additive, active SEULEMENT
  // quand `pool` est fourni — n'existe pas du tout en mode fictif (jamais un
  // 404 masqué derrière un faux succès). `sessionId` toujours généré serveur.
  if (realAccess) {
    const realAccessStore = realAccess;

    app.post("/v1/access/login-requests", async (request, reply) => {
      const body = loginRequest.parse(request.body);
      const receipt = await realAccessStore.requestLogin(body.identityId);
      return reply.code(202).send(receipt);
    });

    app.post("/v1/access/login-completions", async (request, reply) => {
      const body = loginCompletion.parse(request.body);
      const out = await realAccessStore.completeLogin(body.identityId, body.code);
      return reply.code(201).send(out);
    });
  }

  /* --- C03 : groupes, gouvernance, invitations, règles (2.1, 2.7, 4.1, 4.2) --- */

  // Création d'un groupe en configuration (2.1). Mode réel : session
  // OBLIGATOIRE (anti-spam anonyme) ; le socle 0001 ne stocke pas le créateur
  // — limite assumée, documentée (aucune migration nouvelle ici).
  app.post("/v1/groups", async (request, reply) => {
    const body = createGroupBody.parse(request.body);
    if (pool && realGovernance) {
      await realIdentityFrom(pool, request, now);
      return reply.code(201).send(await realGovernance.createGroup(body));
    }
    const out = governance.createGroup(body);
    return reply.code(201).send(out);
  });

  // Lecture de la préparation au démarrage du cycle.
  app.get("/v1/groups/:groupId/cycle-readiness", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realGovernance) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.readiness(groupId));
    }
    return reply.code(200).send(governance.readiness(groupId));
  });

  // Démarrage du cycle — porte serveur (C03-BOOT : fondateur seul ⇒ 409).
  app.post("/v1/groups/:groupId/cycle-starts", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realGovernance) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realGovernance.startCycle(groupId));
    }
    return reply.code(201).send(governance.startCycle(groupId));
  });

  // Transition d'état du groupe (2.7).
  app.post("/v1/groups/:groupId/state-transitions", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = groupTransitionBody.parse(request.body);
    if (pool && realGovernance) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.transition(groupId, body.to));
    }
    return reply.code(200).send(governance.transition(groupId, body.to));
  });

  // Sonde de mutation gardée par adhésion active + groupe mutable (C03-REVOKE).
  // Mode réel : l'identité sondée est l'ACTEUR résolu (le corps est validé
  // mais son identityId est IGNORÉ — §14, le client ne choisit jamais son
  // identité métier).
  app.post("/v1/groups/:groupId/mutations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = groupMutationBody.parse(request.body);
    if (pool && realGovernance) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.attemptMutation(groupId, actor.identityId));
    }
    return reply.code(200).send(governance.attemptMutation(groupId, body.identityId));
  });

  // Invitation directe d'un handle connu (adhésion pending) — distincte du
  // rachat d'invitation anonyme (4.1).
  app.post("/v1/groups/:groupId/memberships", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = inviteMemberBody.parse(request.body);
    if (pool && realGovernance) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realGovernance.inviteMember(groupId, body.handle));
    }
    return reply.code(201).send(governance.inviteMember(groupId, body.handle));
  });

  // Terminaison d'une adhésion (départ/révocation), avant la prochaine commande.
  // `body.identityId` est la CIBLE (objet métier légitime), pas l'acteur.
  app.post("/v1/groups/:groupId/membership-terminations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = membershipTerminationBody.parse(request.body);
    if (pool && realGovernance) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.terminateMembership(groupId, body.identityId));
    }
    return reply.code(200).send(governance.terminateMembership(groupId, body.identityId));
  });

  // Acceptation horodatée de la version courante des règles (4.2).
  // Mode réel : l'accepteur est l'ACTEUR résolu (corps ignoré, §14).
  app.post("/v1/groups/:groupId/rules-acceptances", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = rulesAcceptanceBody.parse(request.body);
    if (pool && realGovernance) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realGovernance.acceptGroupRules(groupId, actor.identityId));
    }
    return reply.code(201).send(governance.acceptGroupRules(groupId, body.identityId));
  });

  // Déclaration de cotisation — refusée sans acceptation des règles en vigueur.
  // Mode réel : le déclarant testé est l'ACTEUR résolu (corps ignoré, §14).
  app.post("/v1/groups/:groupId/contribution-declarations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = contributionDeclarationBody.parse(request.body);
    if (pool && realGovernance) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.declareContribution(groupId, actor.identityId));
    }
    return reply.code(200).send(governance.declareContribution(groupId, body.identityId));
  });

  // Rachat d'une invitation limitée/expirante/révocable (4.1). Capability
  // anonyme + session du racheteur ; groupe résolu par résolveur étroit 0020.
  app.post("/v1/invitations/:invitationId/redemptions", async (request, reply) => {
    const { invitationId } = request.params as { invitationId: string };
    if (pool && realGovernance) {
      await realIdentityFrom(pool, request, now);
      const groupId = await invitationGroup(pool, invitationId);
      if (!groupId) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Invitation introuvable");
      }
      return reply.code(200).send(await realGovernance.redeemInvitation(groupId, invitationId));
    }
    return reply.code(200).send(governance.redeemInvitation(invitationId));
  });

  // Parrainage / cooptation : un candidat demande à rejoindre sous la caution
  // d'un membre actif. Mode réel : le CANDIDAT est l'acteur de session (le
  // corps est ignoré, §14) ; le parrain (CIBLE) doit être membre actif réel.
  app.post("/v1/groups/:groupId/sponsorships", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = sponsorshipRequestBody.parse(request.body);
    if (pool && realGovernance) {
      const candidateId = await realIdentityFrom(pool, request, now);
      return reply
        .code(201)
        .send(await realGovernance.requestSponsorship({
          sponsorshipId: body.sponsorshipId,
          groupId,
          candidateId,
          sponsorId: body.sponsorId,
        }));
    }
    return reply.code(201).send(governance.requestSponsorship({
      sponsorshipId: body.sponsorshipId,
      groupId,
      candidateId: body.candidateId,
      sponsorId: body.sponsorId,
    }));
  });

  // Décision d'un parrainage ouvert (endorsed/rejected). Mode réel : le
  // décideur doit être membre actif du groupe (anti-IVOR). En fictif, la
  // décision est appliquée telle quelle.
  app.post("/v1/groups/:groupId/sponsorships/:sponsorshipId/decision", async (request, reply) => {
    const { sponsorshipId } = request.params as { groupId: string; sponsorshipId: string };
    const body = sponsorshipDecisionBody.parse(request.body);
    if (pool && realGovernance) {
      const { groupId } = request.params as { groupId: string };
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realGovernance.decideSponsorship(groupId, sponsorshipId, body.decision));
    }
    return reply.code(200).send(governance.decideSponsorship(sponsorshipId, body.decision));
  });

  // Découvrabilité : vue publique minimale des groupes (nom + modèle +
  // typologie), sans registre réel (4.1).
  app.get("/v1/discoverable-groups", async (_request, reply) => {
    if (pool && realGovernance) return reply.code(200).send(await realGovernance.listDiscoverable());
    return reply.code(200).send(governance.listDiscoverable());
  });

  // Vue MULTI-ADHÉSION d'un membre (C21 §2.5) : la liste des tontines dont il
  // fait partie, avec modèle/typologie/hiérarchie (parent) et état d'adhésion.
  // Mode RÉEL : l'identité listée est celle de la SESSION Bearer, résolue
  // SERVEUR (§14) — le client ne choisit jamais de quelle identité il liste.
  // Mode fictif : identité du squelette via query (C01 la résoudra depuis
  // session + RLS). Aucune donnée financière n'est exposée.
  app.get("/v1/me/groups", async (request, reply) => {
    if (pool && realGovernance) {
      const identityId = await realIdentityFrom(pool, request, now);
      return reply.code(200).send(await realGovernance.listGroupsForMember(identityId));
    }
    const { identityId } = request.query as { identityId?: string };
    return reply.code(200).send(governance.listGroupsForMember(identityId ?? ""));
  });

  /* --- C04 : moteur de règles versionnées et acceptations (3.1 → 3.7, 6.7) --- */

  // Publication d'une version de règle (compiler pour le pilote ; pénalités forcées
  // à false). Le hash canonique scelle l'instantané (immuabilité).
  // Mode réel : persistance `rule_version` (append-only) sous session Bearer.
  app.post("/v1/groups/:groupId/rule-versions", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = publishRuleBody.parse(request.body);
    if (pool && realRules) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realRules.publish(groupId, body.snapshot, body.supersedes));
    }
    const pub = rules.publish(groupId, body.snapshot, body.supersedes);
    return reply.code(201).send({
      version: pub.version,
      hash: pub.hash,
      penaltyEnabled: pub.snapshot.penaltyEnabled,
    });
  });

  // Acceptation horodatée portant sur le hash EXACT d'une version publiée.
  // Mode réel : l'accepteur est l'ACTEUR résolu par session (§14 — jamais le
  // corps) ; le hash soumis doit correspondre exactement (sinon 412).
  app.post("/v1/groups/:groupId/rule-versions/:version/acceptances", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { version } = request.params as { version: string };
    const body = ruleVersionAcceptanceBody.parse(request.body);
    if (pool && realRules) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realRules.accept(groupId, actor.identityId, Number(version), body.hash));
    }
    const acc = rules.accept(groupId, body.identityId, Number(version), body.hash);
    return reply.code(201).send(acc);
  });

  // Changement de règle déjà publié : plan d'application + effectivité (C04-ACCEPT).
  // Mode réel : les personnes concernées sont les membres ACTIFS du groupe
  // (source serveur) ; l'effectivité naît des acceptations PERSISTÉES.
  app.post("/v1/groups/:groupId/rule-changes", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = ruleChangeBody.parse(request.body);
    if (pool && realRules) {
      await realGroupActorFrom(pool, request, groupId, now);
      const concerned = await realRules.activeMemberIdentities(groupId);
      return reply.code(200).send(await realRules.evaluateChange(groupId, body.version, concerned));
    }
    return reply.code(200).send(rules.evaluateChange(groupId, body.version, body.concerned));
  });

  // Recalcul du cycle courant sous garde de non-rétroactivité (C04-RETRO).
  app.post("/v1/groups/:groupId/cycle-recalculations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realRules) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realRules.recalculateCurrentCycle(groupId));
    }
    return reply.code(200).send(rules.recalculateCurrentCycle(groupId));
  });

  // Demande d'activation des pénalités — barrière serveur du pilote (C04-PENALTY).
  app.post("/v1/groups/:groupId/penalty-requests", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = penaltyRequestBody.parse(request.body);
    if (pool && realRules) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(realRules.requestPenalty(body.desired));
    }
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
  // Mode réel : la cotisation, la fréquence et le jour d'échéance font AUTORITÉ
  // depuis l'instantané de la règle publiée (`ruleVersion`) — jamais du corps
  // de requête (§10/§12 : le client ne choisit pas ses données métier).
  app.post("/v1/groups/:groupId/schedules", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = buildScheduleBody.parse(request.body);
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      const s = await realSchedule.build(groupId, {
        ruleVersion: body.ruleVersion,
        members: body.members,
        beneficiaryOrder: body.beneficiaryOrder,
        startYear: body.startYear,
        startMonth: body.startMonth,
      });
      return reply.code(201).send(viewSchedule(s));
    }
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
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(viewSchedule(await realSchedule.get(groupId)));
    }
    return reply.code(200).send(viewSchedule(schedule.get(groupId)));
  });

  // Démarrage (gel) du calendrier — ordre des bénéficiaires figé (5.3).
  app.post("/v1/groups/:groupId/schedule-starts", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realSchedule.start(groupId));
    }
    return reply.code(201).send(schedule.start(groupId));
  });

  // Réassignation d'un bénéficiaire — refusée après démarrage (SCHEDULE_FROZEN).
  app.post("/v1/groups/:groupId/rounds/:seq/beneficiary", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { seq } = request.params as { seq: string };
    const body = beneficiaryReassignmentBody.parse(request.body);
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      const s = await realSchedule.reassign(groupId, Number(seq), body.newBeneficiaryId);
      return reply.code(200).send({ seq: Number(seq), beneficiaryId: s.schedule[Number(seq) - 1]!.beneficiaryId });
    }
    const s = schedule.reassign(groupId, Number(seq), body.newBeneficiaryId);
    return reply.code(200).send({ seq: Number(seq), beneficiaryId: s.schedule[Number(seq) - 1]!.beneficiaryId });
  });

  // Départ d'un membre — la dette reste affectée, les tours non réduits.
  // `body.identityId` désigne la CIBLE du départ ; l'acteur vient de la session.
  app.post("/v1/groups/:groupId/departures", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = departureBody.parse(request.body);
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realSchedule.depart(groupId, body.identityId));
    }
    return reply.code(200).send(schedule.depart(groupId, body.identityId));
  });

  // Plan de renouvellement (5.5) — nouvelles acceptations si engagement changé.
  app.post("/v1/groups/:groupId/cycle-renewals", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = cycleRenewalBody.parse(request.body);
    if (pool && realSchedule) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply
        .code(200)
        .send(await realSchedule.renew(groupId, { version: body.version, memberCount: body.memberCount, contribution: body.contribution, rounds: body.rounds }));
    }
    return reply
      .code(200)
      .send(schedule.renew(groupId, { version: body.version, memberCount: body.memberCount, contribution: body.contribution, rounds: body.rounds }));
  });

  /* --- C11 : journal d'événements, checkpoints, timeline (9.1 → 9.5) --- */

  // Vérification indépendante de la chaîne : le serveur ne lit que ce qui
  // est écrit, il ne recalcule jamais de quoi masquer une altération (9.2).
  app.get("/v1/groups/:groupId/journal/verify", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realJournal) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realJournal.verify(groupId));
    }
    return reply.code(200).send(journal.verify(groupId));
  });

  // Timeline en langage clair, filtrée par les droits de l'acteur (9.1/9.3).
  // Le paramètre `type` filtre par type d'événement ; le payload brut n'est
  // jamais servi.
  app.get("/v1/groups/:groupId/timeline", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const { type } = request.query as { type?: string };
    if (pool && realJournal) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      let realEntries = await realJournal.timeline(groupId, actor.role);
      if (type !== undefined) realEntries = realEntries.filter((e) => e.type === type);
      return reply.code(200).send({ entries: realEntries });
    }
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
    if (pool && realJournal) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(201).send(await realJournal.checkpoint(groupId, actor.role, body.issuedBy, body.issuedAt));
    }
    const actor = actorFrom(request);
    return reply.code(201).send(journal.checkpoint(groupId, actor.role, body.issuedBy, body.issuedAt));
  });

  // Reconstruction des projections par replay, réconciliée avec la projection
  // de référence (C11-REBUILD, 9.5) : effacer une projection ne change rien.
  app.post("/v1/groups/:groupId/projections-rebuild", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realJournal) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realJournal.rebuild(groupId));
    }
    return reply.code(200).send(journal.rebuild(groupId));
  });

  // C11-TAMPER : altère une COPIE du journal puis la soumet au vérificateur.
  // `tamper_detected` doit être vrai ; la chaîne interne reste intacte
  // (re-verify ensuite = intact, absence d'effet). Lecture seule en mode
  // RÉEL : la copie altérée ne touche jamais la base, seule la copie fournie
  // change — la démonstration porte sur la chaîne RÉELLE relue.
  app.post("/v1/groups/:groupId/journal-tamper-tests", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = tamperBody.parse(request.body);
    if (pool && realJournal) {
      await realGroupActorFrom(pool, request, groupId, now);
      const events = await realJournal.events(groupId);
      const copy = realJournal.tamperCopyOf(events, body.seq, body.amount);
      const copyResult = realJournal.verifyCopy(copy);
      const stillIntact = (await realJournal.verify(groupId)).intact;
      return reply
        .code(200)
        .send({ tamper_detected: !copyResult.intact, error: copyResult.error ?? null, internal_chain_intact: stillIntact });
    }
    const copy = journal.tamperCopyOf(groupId, body.seq, body.amount);
    const copyResult = journal.verifyCopy(copy);
    const stillIntact = journal.verify(groupId).intact;
    return reply
      .code(200)
      .send({ tamper_detected: !copyResult.intact, error: copyResult.error ?? null, internal_chain_intact: stillIntact });
  });

  // TRACE DE TEST, NON PROD — injecte un événement d'audit dans la chaîne
  // fictive. En mode RÉEL cette route n'existe pas (404) : le journal réel
  // n'est écrit que par les commandes métier (C06/C07/…), jamais par un
  // en-tête de test.
  if (!pool) {
    app.post("/v1/groups/:groupId/journal-appends", async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const body = journalAppendBody.parse(request.body);
      const ev = journal.append({ groupId, ...body });
      return reply.code(201).send({ seq: ev.seq, hash: ev.hash });
    });
  }

  /* --- C06 : déclarations partielles, idempotence, capacité sous verrou --- */

  // Déclaration idempotente d'une cotisation partielle. Rejeu (même clé/même
  // corps) renvoie le résultat d'origine SANS second événement ; corps
  // différent → 409 ; excédent → 409 (aucune écriture). 18.1 / 18.3.
  app.post("/v1/groups/:groupId/declarations", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = declareContributionBody_c06.parse(request.body);
    const decl: ContributionDeclaration = {
      obligationId: body.obligationId,
      amountMinor: body.amount,
      channel: body.channel,
      allegedDate: body.allegedDate,
      ...(body.reference !== undefined ? { reference: body.reference } : {}),
      ...(body.justification !== undefined ? { justification: body.justification } : {}),
    };
    // Mode RÉEL (Piste A3) : session Bearer authentifiée + adhésion/rôle
    // RELUS en base (jamais depuis un en-tête client) avant toute écriture.
    const r = pool && realContribution
      ? await (async () => {
          const actor = await realGroupActorFrom(pool, request, groupId, now);
          const idemKey = idempotencyKey.parse(request.headers["idempotency-key"]);
          const commandIdHeader = request.headers["x-command-id"];
          const realCtx: DeclareContext = {
            actorIdentityId: actor.identityId,
            actorRole: actor.role,
            actorGroupIds: [groupId],
            idempotencyKey: idemKey,
            expectedVersion: expectedVersion.parse(request.headers["if-match-version"]),
            // §27 : horloge SERVEUR uniquement — jamais une date client
            // (`x-server-date` a été retiré du mode réel ; l'heure client
            // ne scelle aucun événement).
            serverDate: new Date(now()).toISOString(),
            commandId: typeof commandIdHeader === "string" ? commandIdHeader : `cmd-${idemKey}`,
          };
          return realContribution.declare(groupId, realCtx, decl);
        })()
      : contribution.declare(declareCtxFrom(request), decl);
    return reply
      .code(r.status === "applied" ? 201 : 200)
      .send({
        commandId: r.commandId,
        status: r.status,
        resultVersion: r.resultVersion,
        eventHash: r.eventHash,
        obligationId: r.obligationId,
        remainingDue: r.remainingDue.toString(),
        availableToDeclare: r.availableToDeclare.toString(),
      });
  });

  // Brouillon local (6.9) : action DISTINCTE de la soumission ; n'écrit ni
  // événement, ni réservation, ni registre (absence d'effet prouvée en test).
  // Pas d'implémentation PG (le brouillon est local par nature) : en mode
  // réel cette route n'existe pas (404) — jamais de données fictives.
  if (!pool) {
    app.post("/v1/groups/:groupId/drafts", async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const body = contributionDraftBody.parse(request.body);
      const actor = actorFrom(request);
      const decl: ContributionDeclaration = {
        obligationId: body.obligationId,
        amountMinor: body.amount,
        channel: body.channel,
        allegedDate: body.allegedDate,
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.justification !== undefined ? { justification: body.justification } : {}),
      };
      return reply
        .code(200)
        .send(contribution.saveDraft(actor.identityId ?? actor.handle, `${groupId}:${decl.obligationId}`, decl));
    });
  }

  // Vue de l'obligation : capacité sous verrou et restant dû sur validé net.
  app.get("/v1/groups/:groupId/obligations/:obligationId", async (request, reply) => {
    const { groupId, obligationId } = request.params as { groupId: string; obligationId: string };
    if (pool && realContribution) {
      // Authentification + anti-IDOR : adhésion active requise dans CE
      // groupe avant toute lecture (sinon FEATURE_PILOT_FORBIDDEN, 403).
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realContribution.view(groupId, obligationId));
    }
    return reply.code(200).send(contribution.view(obligationId));
  });

  /* --- C07 : validations, corrections et contestation (6.2 → 6.6) --- */

  // Confirmation d'une cotisation. Indépendance : le déclarant qui se confirme
  // lui-même est REFUSÉ (200, `validationAccepted = false`, aucune écriture).
  app.post("/v1/groups/:groupId/contributions/:contributionId/confirmations", async (request, reply) => {
    const { groupId, contributionId } = request.params as { groupId: string; contributionId: string };
    if (pool && realValidation) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realValidationCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realValidation.confirm(groupId, ctx, contributionId));
    }
    const ctx = validationCtxFrom(request);
    return reply.code(200).send(validation.confirm(ctx, contributionId));
  });

  // Contrôle par un tiers distinct ; parachève la validation au seuil requis.
  app.post("/v1/groups/:groupId/contributions/:contributionId/control", async (request, reply) => {
    const { groupId, contributionId } = request.params as { groupId: string; contributionId: string };
    if (pool && realValidation) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realValidationCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realValidation.control(groupId, ctx, contributionId));
    }
    const ctx = validationCtxFrom(request);
    return reply.code(200).send(validation.control(ctx, contributionId));
  });

  // Rejet seulement avant validation (après validation ⇒ 409, correction par
  // compensation, jamais rejet rétroactif).
  app.post("/v1/groups/:groupId/contributions/:contributionId/rejections", async (request, reply) => {
    const { groupId, contributionId } = request.params as { groupId: string; contributionId: string };
    if (pool && realValidation) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realValidationCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realValidation.reject(groupId, ctx, contributionId));
    }
    const ctx = validationCtxFrom(request);
    return reply.code(200).send(validation.reject(ctx, contributionId));
  });

  // Compensation d'un original validé — au plus une fois (C07-REVERSE) ; la
  // seconde course sur le même original reçoit 409 et `reversalCount` reste 1.
  app.post("/v1/groups/:groupId/contributions/:contributionId/compensations", async (request, reply) => {
    const { groupId, contributionId } = request.params as { groupId: string; contributionId: string };
    const body = compensateBody.parse(request.body);
    if (pool && realValidation) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realValidationCtxFrom(actor, groupId, request, now());
      return reply.code(201).send(await realValidation.compensate(groupId, ctx, contributionId, body.reversalContributionId));
    }
    const ctx = validationCtxFrom(request);
    const r = validation.compensate(ctx, contributionId, body.reversalContributionId);
    return reply.code(201).send(r);
  });

  // Ouverture d'un litige (fenêtre, motif) — permission `dispute.raise`.
  app.post("/v1/groups/:groupId/disputes", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = disputeBody.parse(request.body);
    if (pool && realValidation) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      // CREATE : aucune version d'objet préexistante à vérifier ; le store
      // n'évalue pas `expectedVersion` sur cette voie (le registre d'objet
      // rejette un doublon, pas la version).
      const ctx = { ...realCtxBase(actor, groupId, request, now()), expectedVersion: 0 };
      return reply.code(201).send(await realValidation.raise(groupId, ctx, { ...body, groupId, raisedBy: actor.identityId }));
    }
    const actor = actorFrom(request);
    const ctx: ValidationContext = {
      actorIdentityId: actor.identityId ?? actor.handle,
      actorRole: actor.role,
      actorGroupIds: actor.groupIds,
      serverDate: "2026-09-28",
      commandId: `cmd-${actor.identityId ?? actor.handle}`,
      expectedVersion: 1,
    };
    return reply.code(201).send(validation.raise(ctx, { ...body, groupId, raisedBy: ctx.actorIdentityId }));
  });

  // Sonde d'opération dépendante (clôture de tour) gelée par un litige ouvert.
  app.post(
    "/v1/groups/:groupId/obligations/:obligationId/dependent-operation-attempts",
    async (request, reply) => {
      const { groupId, obligationId } = request.params as { groupId: string; obligationId: string };
      if (pool && realValidation) {
        await realGroupActorFrom(pool, request, groupId, now);
        return reply.code(200).send(await realValidation.attemptDependentOperation(groupId, obligationId));
      }
      return reply.code(200).send(validation.attemptDependentOperation(obligationId));
    },
  );

  // Vue d'une cotisation : état, acteurs d'indépendance, compensation, version.
  app.get("/v1/groups/:groupId/contributions/:contributionId", async (request, reply) => {
    const { groupId, contributionId } = request.params as { groupId: string; contributionId: string };
    if (pool && realValidation) {
      await realGroupActorFrom(pool, request, groupId, now);
      return reply.code(200).send(await realValidation.view(groupId, contributionId));
    }
    return reply.code(200).send(validation.view(contributionId));
  });

  /* --- C10 : litiges, recours et résolution (8.1 → 8.4) --- */

  // Ouverture d'un DOSSIER (8.1) : motif + correction demandée, pièces
  // désactivées, aucun montant acceptable (le schéma n'en porte pas).
  app.post("/v1/groups/:groupId/dispute-cases", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = disputeCaseBody.parse(request.body);
    if (pool && realDisputes) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
      const record = await realDisputes.open(groupId, dActor, { ...body, groupId, raisedBy: actor.identityId });
      return reply.code(201).send(record);
    }
    const actor = disputeActorFrom(request);
    const record = disputes.open(actor, { ...body, groupId, raisedBy: actor.identityId });
    return reply.code(201).send(record);
  });

  // Liste des vues COMMUNES du groupe (8.1) — le détail privé n'y transite
  // jamais ; lecture seule, sans mutation ni divulgation d'un autre groupe.
  app.get("/v1/groups/:groupId/dispute-cases", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realDisputes) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
      return reply.code(200).send(await realDisputes.listCommon(groupId, dActor));
    }
    const actor = disputeActorFrom(request);
    return reply.code(200).send(disputes.listCommon(actor, groupId));
  });

  // Vue d'un dossier (C10-PRIVACY) : commune pour un non-partie, détail
  // complet pour les parties seules (levant, impliqués, résolveurs désignés).
  app.get("/v1/groups/:groupId/dispute-cases/:disputeId", async (request, reply) => {
    const { groupId, disputeId } = request.params as { groupId: string; disputeId: string };
    if (pool && realDisputes) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
      return reply.code(200).send(await realDisputes.view(groupId, dActor, disputeId));
    }
    const actor = disputeActorFrom(request);
    return reply.code(200).send(disputes.view(actor, disputeId));
  });

  // Désignation des résolveurs (8.2) — un impliqué est refusé 403 par le
  // domaine ; une hiérarchie de rôle ne remplace pas l'indépendance.
  app.post(
    "/v1/groups/:groupId/dispute-cases/:disputeId/resolvers",
    async (request, reply) => {
      const { groupId, disputeId } = request.params as { groupId: string; disputeId: string };
      const body = resolversBody.parse(request.body);
      if (pool && realDisputes) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
        const { record, version } = await realDisputes.assignResolvers(
          groupId,
          dActor,
          disputeId,
          body.resolverIdentityIds,
          expectedVersion.parse(request.headers["if-match-version"]),
        );
        return reply.code(200).send({ record, version });
      }
      const actor = disputeActorFrom(request);
      const { record, version } = disputes.assignResolvers(
        actor,
        disputeId,
        body.resolverIdentityIds,
        expectedVersion.parse(request.headers["if-match-version"]),
      );
      return reply.code(200).send({ record, version });
    },
  );

  // Résolution (8.3, C10-RESOLVE) : ferme le dossier, ne touche AUCUN total —
  // structurel : ce routeur n'a aucun canal vers une chaîne d'événements.
  app.post(
    "/v1/groups/:groupId/dispute-cases/:disputeId/resolution",
    async (request, reply) => {
      const { groupId, disputeId } = request.params as { groupId: string; disputeId: string };
      const body = disputeResolutionBody.parse(request.body);
      if (pool && realDisputes) {
        // Les références de correction ne sont PAS persistées par le store
        // PostgreSQL (aucune colonne au schéma) : les accepter en mode réel
        // serait une perte silencieuse — refus explicite, jamais un drop.
        if (body.correctionContributionIds.length > 0) {
          throw new DomainError(
            "FEATURE_PILOT_FORBIDDEN",
            "Références de correction non persistées en mode réel (aucune colonne de schéma)",
          );
        }
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
        const { record, version } = await realDisputes.resolve(
          groupId,
          dActor,
          disputeId,
          body.outcome,
          // §27 : l'heure de résolution scellée est celle du SERVEUR (secondes
          // d'époque) — `body.resolvedAt` n'est pas consulté en mode réel.
          Math.floor(now() / 1000),
          expectedVersion.parse(request.headers["if-match-version"]),
        );
        return reply.code(200).send({ record, version });
      }
      const actor = disputeActorFrom(request);
      const { record, version } = disputes.resolve(
        actor,
        disputeId,
        body.outcome,
        body.resolvedAt,
        expectedVersion.parse(request.headers["if-match-version"]),
        body.correctionContributionIds,
      );
      return reply.code(200).send({ record, version });
    },
  );

  // Recours (8.3) : le levant rouvre le dossier résolu, lié à l'original ;
  // la première résolution reste historisée, le gel ciblé revient.
  app.post(
    "/v1/groups/:groupId/dispute-cases/:disputeId/appeals",
    async (request, reply) => {
      const { groupId, disputeId } = request.params as { groupId: string; disputeId: string };
      if (pool && realDisputes) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
        const { record, version } = await realDisputes.appeal(
          groupId,
          dActor,
          disputeId,
          expectedVersion.parse(request.headers["if-match-version"]),
        );
        return reply.code(200).send({ record, version });
      }
      const actor = disputeActorFrom(request);
      const { record, version } = disputes.appeal(
        actor,
        disputeId,
        expectedVersion.parse(request.headers["if-match-version"]),
      );
      return reply.code(200).send({ record, version });
    },
  );

  // Sonde de clôture normale d'un tour (C10-FREEZE) : gelée si une obligation
  // du tour porte un litige ouvert — sans écriture ni effacement.
  app.post("/v1/groups/:groupId/round-close-attempts", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = roundCloseBody.parse(request.body);
    if (pool && realDisputes) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const dActor: PgDisputeActor = { identityId: actor.identityId, role: actor.role, groupIds: [groupId] };
      return reply.code(200).send(await realDisputes.attemptRoundClose(groupId, dActor, body.obligationIds));
    }
    const actor = disputeActorFrom(request);
    return reply.code(200).send(disputes.attemptRoundClose(actor, groupId, body.obligationIds));
  });

  /* --- C08 : décaissements, corrections, rapprochement et clôture (6.10, 18.4, 18.9, 2.8) --- */

  // Déclaration d'un décaissement externe (6.10). KÓMBE ne transfère RIEN : la
  // sortie est documentée. Séparation des pouvoirs gardée par le domaine (le
  // déclarant n'est jamais le bénéficiaire). Le membre sans droit → 403.
  app.post("/v1/groups/:groupId/disbursements", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = declareDisbursementBody.parse(request.body);
    const input = {
      disbursementId: body.disbursementId,
      roundId: body.roundId,
      obligationId: body.obligationId,
      beneficiaryIdentityId: body.beneficiaryIdentityId,
      netAmount: body.netAmount,
      groupFees: body.groupFees,
      ...(body.personalFeesOutOfPot !== undefined
        ? { personalFeesOutOfPot: body.personalFeesOutOfPot }
        : {}),
      requiredControllers: body.requiredControllers,
      allegedDate: body.allegedDate,
    };
    if (pool && realDisbursements) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realDisbursementDeclareCtxFrom(actor, groupId, request, now());
      return reply.code(201).send(await realDisbursements.declare(ctx, groupId, input));
    }
    const ctx = disbursementDeclareCtxFrom(request);
    return reply.code(201).send(disbursements.declare(ctx, groupId, input));
  });

  // Confirmation par le bénéficiaire (6.10). Refus non-bénéficiaire = 200,
  // `actAccepted = false`, aucune écriture (vérifiée en test par compteur d'événements).
  app.post(
    "/v1/groups/:groupId/disbursements/:disbursementId/confirmations",
    async (request, reply) => {
      const { groupId, disbursementId } = request.params as { groupId: string; disbursementId: string };
      if (pool && realDisbursements) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const ctx = realDisbursementCtxFrom(actor, groupId, request, now());
        return reply.code(200).send(await realDisbursements.confirm(groupId, ctx, disbursementId));
      }
      const ctx = disbursementCtxFrom(request);
      return reply.code(200).send(disbursements.confirm(ctx, disbursementId));
    },
  );

  // Contrôle par un tiers distinct et indépendant (6.10) ; parachève au seuil.
  app.post(
    "/v1/groups/:groupId/disbursements/:disbursementId/control",
    async (request, reply) => {
      const { groupId, disbursementId } = request.params as { groupId: string; disbursementId: string };
      if (pool && realDisbursements) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const ctx = realDisbursementCtxFrom(actor, groupId, request, now());
        return reply.code(200).send(await realDisbursements.control(groupId, ctx, disbursementId));
      }
      const ctx = disbursementCtxFrom(request);
      return reply.code(200).send(disbursements.control(ctx, disbursementId));
    },
  );

  // Demande de correction d'un décaissement achevé (6.10, 18.9) ; motif requis,
  // jamais de remboursement automatique externe (`refundedExternally = false`).
  app.post(
    "/v1/groups/:groupId/disbursements/:disbursementId/reversal-requests",
    async (request, reply) => {
      const { groupId, disbursementId } = request.params as { groupId: string; disbursementId: string };
      const body = reversalRequestBody.parse(request.body);
      if (pool && realDisbursements) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const ctx = realDisbursementCtxFrom(actor, groupId, request, now());
        return reply
          .code(200)
          .send(await realDisbursements.requestReversal(groupId, ctx, disbursementId, body.reason));
      }
      const ctx = disbursementCtxFrom(request);
      return reply.code(200).send(disbursements.requestReversal(ctx, disbursementId, body.reason));
    },
  );

  // Approbation INDÉPENDANTE → contre-écriture unique (C08-CORRECTION) ; une
  // seconde approbation sur le même original → 409, `reversalCount` figé à 1.
  // Feuille `reversals` alignée sur le contrat C00 (`confirmDisbursementReversal`).
  app.post(
    "/v1/groups/:groupId/disbursements/:disbursementId/reversals",
    async (request, reply) => {
      const { groupId, disbursementId } = request.params as { groupId: string; disbursementId: string };
      if (pool && realDisbursements) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const ctx = realDisbursementCtxFrom(actor, groupId, request, now());
        return reply.code(200).send(await realDisbursements.approveReversal(groupId, ctx, disbursementId));
      }
      const ctx = disbursementCtxFrom(request);
      return reply.code(200).send(disbursements.approveReversal(ctx, disbursementId));
    },
  );

  // Vue d'un décaissement : état, acteurs d'indépendance, correction, version.
  // Lecture authentifiée et SCOPEE par le groupe du chemin (anti-IDOR : un
  // objet d'un autre groupe répond 404 non-divulgation, jamais ses données).
  app.get("/v1/groups/:groupId/disbursements/:disbursementId", async (request, reply) => {
    const { groupId, disbursementId } = request.params as { groupId: string; disbursementId: string };
    if (pool && realDisbursements) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realDisbursementReadCtxFrom(actor, groupId, now());
      return reply.code(200).send(await realDisbursements.view(ctx, groupId, disbursementId));
    }
    const ctx = disbursementReadCtxFrom(request);
    return reply.code(200).send(disbursements.view(ctx, groupId, disbursementId));
  });

  // Rapprochement d'un tour et décision de clôture normale (18.4, 18.9), via
  // l'oracle indépendant. TOUTES les entrées de décision sont SERVEUR : totaux
  // recalculés depuis les écritures stockées, total validé net et bloqueurs
  // posés par les flux serveur. Aucun paramètre client n'est accepté — un
  // client ne peut ni forcer une clôture ni masquer un écart (barrières serveur,
  // règle 18 ; ADR-0005).
  app.get(
    "/v1/groups/:groupId/rounds/:roundId/reconciliation",
    async (request, reply) => {
      const { groupId, roundId } = request.params as { groupId: string; roundId: string };
      if (pool && realDisbursements) {
        const actor = await realGroupActorFrom(pool, request, groupId, now);
        const ctx = realDisbursementReadCtxFrom(actor, groupId, now());
        const out = await realDisbursements.reconcile(ctx, groupId, roundId);
        return reply
          .code(200)
          .send({
            ...out,
            reconciliationGap: out.reconciliationGap.toString(),
          });
      }
      const ctx = disbursementReadCtxFrom(request);
      const out = disbursements.reconcile(ctx, groupId, roundId);
      return reply
        .code(200)
        .send({
          ...out,
          reconciliationGap: out.reconciliationGap.toString(),
        });
    },
  );

  /* --- C09 : propositions, votes et décisions (7.1 → 7.5, 18.5) --- */

  // Ouverture d'une proposition (7.1). L'électorat est scellé côté SERVEUR
  // (membres actifs du groupe), jamais fourni par le client. Ouvreur gardé par
  // l'action objet `vote.open` ; le corps ne porte aucun acteur.
  app.post("/v1/groups/:groupId/votes", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = openVoteBody.parse(request.body);
    const input = {
      proposalId: body.proposalId,
      subjectKind: body.subjectKind,
      subjectRef: body.subjectRef,
      reason: body.reason,
      durationSeconds: body.durationSeconds,
    };
    if (pool && realProposals) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalOpenCtxFrom(actor, groupId, request, now());
      const rules = await realGroupDecisionRules(pool, groupId);
      return reply.code(201).send(await realProposals.open(ctx, groupId, input, rules));
    }
    const ctx = proposalOpenCtxFrom(request);
    return reply.code(201).send(proposals.open(ctx, groupId, input));
  });

  // Bulletin (7.2) : votant = identité résolue serveur ; refus sans écriture
  // (non-électeur, double vote, hors échéance). Voie A19 `/votes/{voteId}/ballots`.
  // Un bulletin ACCEPTÉ crée une ressource (201) ; un refus (double vote, hors
  // échéance, non-électeur) n'écrit rien et répond 200 + voteAccepted=false
  // (convention C07/C08), pas une création.
  app.post("/v1/votes/:voteId/ballots", async (request, reply) => {
    const { voteId } = request.params as { voteId: string };
    const body = castBallotBody.parse(request.body);
    if (pool && realProposals) {
      const groupId = await voteGroup(pool, voteId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalCtxFrom(actor, groupId, request, now());
      const receipt = await realProposals.cast(groupId, ctx, voteId, body.choice);
      return reply.code(receipt.voteAccepted ? 201 : 200).send(receipt);
    }
    const ctx = proposalCtxFrom(request);
    const receipt = proposals.cast(ctx, voteId, body.choice);
    return reply.code(receipt.voteAccepted ? 201 : 200).send(receipt);
  });

  // Clôture (7.3, 7.4) : seulement échéance serveur atteinte ; résultat figé
  // via l'oracle indépendant. Voie A19 `/proposals/{proposalId}/closures`.
  app.post("/v1/proposals/:voteId/closures", async (request, reply) => {
    const { voteId } = request.params as { voteId: string };
    if (pool && realProposals) {
      const groupId = await voteGroup(pool, voteId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realProposals.close(groupId, ctx, voteId));
    }
    const ctx = proposalCtxFrom(request);
    return reply.code(200).send(proposals.close(ctx, voteId));
  });

  // Annulation motivée (7.3, 18.5). Voie A19 `/proposals/{proposalId}/cancellations`.
  app.post("/v1/proposals/:voteId/cancellations", async (request, reply) => {
    const { voteId } = request.params as { voteId: string };
    const body = cancelProposalBody.parse(request.body);
    if (pool && realProposals) {
      const groupId = await voteGroup(pool, voteId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realProposals.cancel(groupId, ctx, voteId, body.reason));
    }
    const ctx = proposalCtxFrom(request);
    return reply.code(200).send(proposals.cancel(ctx, voteId, body.reason));
  });

  // Exécution idempotente (7.4) : seulement une décision approuvée ; une
  // seconde exécution rend le même état sans nouvel effet.
  app.post("/v1/votes/:voteId/executions", async (request, reply) => {
    const { voteId } = request.params as { voteId: string };
    if (pool && realProposals) {
      const groupId = await voteGroup(pool, voteId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalCtxFrom(actor, groupId, request, now());
      return reply.code(200).send(await realProposals.execute(groupId, ctx, voteId));
    }
    const ctx = proposalCtxFrom(request);
    return reply.code(200).send(proposals.execute(ctx, voteId));
  });

  // Vue scopée et authentifiée d'une proposition (anti-IDOR : un objet d'un
  // autre groupe sous un chemin tiers → 404 non-divulgation).
  app.get("/v1/groups/:groupId/votes/:voteId", async (request, reply) => {
    const { groupId, voteId } = request.params as { groupId: string; voteId: string };
    if (pool && realProposals) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalReadCtxFrom(actor, groupId, now());
      return reply.code(200).send(await realProposals.view(ctx, groupId, voteId));
    }
    const ctx = proposalReadCtxFrom(request);
    return reply.code(200).send(proposals.view(ctx, groupId, voteId));
  });

  // Historique des décisions d'un groupe (7.5) : closes / exécutées / annulées.
  app.get("/v1/groups/:groupId/decisions", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realProposals) {
      const actor = await realGroupActorFrom(pool, request, groupId, now);
      const ctx = realProposalReadCtxFrom(actor, groupId, now());
      return reply.code(200).send({ decisions: await realProposals.history(ctx, groupId) });
    }
    const ctx = proposalReadCtxFrom(request);
    return reply.code(200).send({ decisions: proposals.history(ctx, groupId) });
  });

  /* --- C17 : console support, accès JIT, double approbation (8.5, 9.6, 18.17) --- */

  // Demande d'accès support (9.6). Le demandeur = identité résolue serveur ; le
  // motif est obligatoire et toute permission financière/inconnue est refusée par
  // le domaine (`PRIVILEGE_NOT_GRANTED`, 403). Naît `pending_approval`, zéro accès.
  app.post("/v1/support/access-requests", async (request, reply) => {
    const body = supportAccessRequestBody.parse(request.body);
    const input = {
      requestId: body.requestId,
      targetGroupId: body.targetGroupId,
      motif: body.motif,
      permissions: body.permissions,
      ttlSeconds: body.ttlSeconds,
    };
    if (pool && realSupport) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realSupportCtxFrom(identityId, now());
      return reply.code(201).send(await realSupport.request(ctx, input));
    }
    const ctx = supportCtxFrom(request);
    return reply.code(201).send(support.request(ctx, input));
  });

  // Approbation par une identité DISTINCTE serveur (COM05). Au seuil de deux
  // approbateurs distincts → granted (expiration posée) ; sinon reste pending.
  app.post("/v1/support/access-requests/:requestId/approvals", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const body = supportApprovalBody.parse(request.body);
    if (pool && realSupport) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await supportRequestGroup(pool, requestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
      const ctx = realSupportCtxFrom(identityId, now());
      return reply.code(200).send(await realSupport.approve(ctx, groupId, requestId, body.ttlSeconds));
    }
    const ctx = supportCtxFrom(request);
    return reply.code(200).send(support.approve(ctx, requestId, body.ttlSeconds));
  });

  // Épreuve d'une action sensible (8.5, 18.17, C17-JIT). Le domaine juge : une
  // action financière → 403 SUPPORT_FINANCIAL_FORBIDDEN (jamais exécutée) ; accès
  // non granted/expiré → 403 ; hors périmètre/permission absente → 403. Le refus
  // est consigné au journal de sécurité expurgé.
  app.post("/v1/support/access-requests/:requestId/actions", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const body = supportActionBody.parse(request.body);
    if (pool && realSupport) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await supportRequestGroup(pool, requestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
      const ctx = realSupportCtxFrom(identityId, now());
      return reply.code(200).send(await realSupport.act(ctx, groupId, requestId, body.action));
    }
    const ctx = supportCtxFrom(request);
    return reply.code(200).send(support.act(ctx, requestId, body.action));
  });

  // Révocation immédiate (fin d'assistance / incident) — coupe l'accès.
  app.post("/v1/support/access-requests/:requestId/revocations", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    if (pool && realSupport) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await supportRequestGroup(pool, requestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
      const ctx = realSupportCtxFrom(identityId, now());
      return reply.code(200).send(await realSupport.revoke(ctx, groupId, requestId));
    }
    const ctx = supportCtxFrom(request);
    return reply.code(200).send(support.revoke(ctx, requestId));
  });

  // Vue scopée et authentifiée d'une demande (anti-IDOR : un objet d'un autre
  // groupe sous un chemin tiers → 404 non-divulgation).
  app.get("/v1/groups/:groupId/support/access-requests/:requestId", async (request, reply) => {
    const { groupId, requestId } = request.params as { groupId: string; requestId: string };
    if (pool && realSupport) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realSupportCtxFrom(identityId, now());
      return reply.code(200).send(await realSupport.view(ctx, groupId, requestId));
    }
    const ctx = supportReadCtxFrom(request);
    return reply.code(200).send(support.view(ctx, groupId, requestId));
  });

  /* --- C12 : exports du relevé (PDF/CSV, empreinte, vérification, ACL) --- */

  // Génération d'un export au cutoff courant (10.1, 18.8). Le demandeur doit être
  // membre (sinon 404) ; la coupure est résolue SERVEUR, jamais au-delà de l'état
  // réel ; l'empreinte est posée sur les octets finalisés dans un manifeste séparé.
  app.post("/v1/groups/:groupId/exports", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const body = createExportBody.parse(request.body ?? {});
    if (pool && realExports) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realExportCtxFrom(identityId, now());
      return reply.code(201).send(await realExports.create(ctx, groupId, body.cutoffSequence));
    }
    const ctx = exportCtxFrom(request);
    const view = exportStore.create(ctx, groupId, body.cutoffSequence);
    return reply.code(201).send(view);
  });

  // Vue du manifeste (empreintes, coupure, mention prudente) si accessible.
  app.get("/v1/exports/:manifestId/manifest", async (request, reply) => {
    const { manifestId } = request.params as { manifestId: string };
    if (pool && realExports) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await exportManifestGroup(pool, manifestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
      const ctx = realExportCtxFrom(identityId, now());
      return reply.code(200).send(await realExports.viewScoped(ctx, groupId, manifestId));
    }
    const ctx = exportCtxFrom(request);
    return reply.code(200).send(exportStore.view(ctx, manifestId));
  });

  // Téléchargement privé du PDF : ACL recontrôlée à l'acheminement (C12-DOWNLOAD).
  // Un membre sortant → 404 non-divulguant, jamais les octets.
  app.get("/v1/exports/:manifestId/download", async (request, reply) => {
    const { manifestId } = request.params as { manifestId: string };
    if (pool && realExports) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await exportManifestGroup(pool, manifestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
      const ctx = realExportCtxFrom(identityId, now());
      const file = await realExports.downloadScoped(ctx, groupId, manifestId);
      return reply
        .code(200)
        .header("content-type", file.contentType)
        .header("content-disposition", `attachment; filename="${file.fileName}"`)
        .send(Buffer.from(file.bytes));
    }
    const ctx = exportCtxFrom(request);
    const file = exportStore.download(ctx, manifestId);
    return reply
      .code(200)
      .header("content-type", file.contentType)
      .header("content-disposition", `attachment; filename="${file.fileName}"`)
      .send(Buffer.from(file.bytes));
  });

  // Téléchargement du CSV neutralisé (10.1) — mêmes ACL qu'au PDF.
  app.get("/v1/exports/:manifestId/csv", async (request, reply) => {
    const { manifestId } = request.params as { manifestId: string };
    if (pool && realExports) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await exportManifestGroup(pool, manifestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
      const ctx = realExportCtxFrom(identityId, now());
      const file = await realExports.csvScoped(ctx, groupId, manifestId);
      return reply
        .code(200)
        .header("content-type", `${file.contentType}; charset=utf-8`)
        .header("content-disposition", `attachment; filename="${file.fileName}"`)
        .send(file.body);
    }
    const ctx = exportCtxFrom(request);
    const file = exportStore.csv(ctx, manifestId);
    return reply
      .code(200)
      .header("content-type", `${file.contentType}; charset=utf-8`)
      .header("content-disposition", `attachment; filename="${file.fileName}"`)
      .send(file.body);
  });

  // Vérification INDÉPENDANTE (C12-HASH) : octets soumis en base64 → empreinte
  // recalculée et comparée au manifeste ; un octet altéré → verification_passed false.
  app.post("/v1/exports/:manifestId/verifications", async (request, reply) => {
    const { manifestId } = request.params as { manifestId: string };
    const body = exportVerificationBody.parse(request.body);
    if (pool && realExports) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await exportManifestGroup(pool, manifestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
      const ctx = realExportCtxFrom(identityId, now());
      return reply.code(200).send(await realExports.verifyScoped(ctx, groupId, manifestId, body.bytesBase64));
    }
    const ctx = exportCtxFrom(request);
    return reply.code(200).send(exportStore.verify(ctx, manifestId, body.bytesBase64));
  });

  /* --- C16 : données personnelles — notices, consentement, droits, purge (13.x, 18.10, 18.19) --- */

  // Publication d'une notice légale versionnée (13.1). Le domaine refuse une
  // notice à placeholder ou promettant une garantie/preuve (422 stable).
  app.post("/v1/privacy/notices", async (request, reply) => {
    const body = legalNoticeBody.parse(request.body);
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(201).send(await realPrivacy.publishNotice(ctx, body));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(201).send(privacyStore.publishNotice(ctx, body));
  });

  // Lecture d'une notice (404 non-divulguant si absente).
  app.get("/v1/privacy/notices/:noticeId", async (request, reply) => {
    const { noticeId } = request.params as { noticeId: string };
    if (pool && realPrivacy) {
      return reply.code(200).send(await realPrivacy.getNotice(noticeId));
    }
    return reply.code(200).send(privacyStore.getNotice(noticeId));
  });

  // Enregistrement d'un traitement au registre (13.3) — factuel, base connue.
  app.post("/v1/privacy/processing-records", async (request, reply) => {
    const body = processingRecordBody.parse(request.body);
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(201).send(await realPrivacy.registerProcessing(ctx, body));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(201).send(privacyStore.registerProcessing(ctx, body));
  });

  // Consentement facultatif (13.4) pour la catégorie donnée. La vue porte le
  // service cœur RÉSOLU SERVEUR : un refus de recherche ne le coupe pas.
  app.post("/v1/privacy/consents", async (request, reply) => {
    const body = consentBody.parse(request.body);
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(200).send(await realPrivacy.setConsentFor(ctx, body.category, body.granted));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(200).send(privacyStore.setConsentFor(ctx, body.category, body.granted));
  });

  app.get("/v1/privacy/consents", async (request, reply) => {
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(200).send(await realPrivacy.getConsent(ctx));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(200).send(privacyStore.getConsent(ctx));
  });

  // Ouverture d'une demande de droit (18.19). Le sujet = identité serveur ;
  // aucune exécution ici (statut `received`).
  app.post("/v1/privacy/rights-requests", async (request, reply) => {
    const body = rightsRequestOpenBody.parse(request.body);
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await privacySubjectGroup(pool, identityId);
      if (!groupId) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Aucune adhésion active pour ce sujet");
      }
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(201).send(await realPrivacy.openRequest(ctx, groupId, body.requestId, body.kind));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(201).send(privacyStore.openRequest(ctx, body.requestId, body.kind));
  });

  // Vérification proportionnée : au seuil du type de droit ⇒ `ready`, sinon
  // `requires_more_info` (jamais un refus automatique).
  app.post(
    "/v1/privacy/rights-requests/:requestId/verifications",
    async (request, reply) => {
      const { requestId } = request.params as { requestId: string };
      const body = rightsVerificationBody.parse(request.body);
      if (pool && realPrivacy) {
        const identityId = await realIdentityFrom(pool, request, now);
        const groupId = await privacyRightsGroup(pool, requestId);
        if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droits introuvable");
        const ctx = realPrivacyCtxFrom(identityId, now());
        return reply.code(200).send(await realPrivacy.verifyRequest(ctx, groupId, requestId, body.level));
      }
      const ctx = privacyCtxFrom(request);
      return reply.code(200).send(privacyStore.verifyRequest(ctx, requestId, body.level));
    },
  );

  // Gel/restiction MOTIVÉE (18.19) — motif obligatoire (422 sinon), daté.
  app.post(
    "/v1/privacy/rights-requests/:requestId/restrictions",
    async (request, reply) => {
      const { requestId } = request.params as { requestId: string };
      const body = rightsRestrictionBody.parse(request.body);
      if (pool && realPrivacy) {
        const identityId = await realIdentityFrom(pool, request, now);
        const groupId = await privacyRightsGroup(pool, requestId);
        if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droits introuvable");
        const ctx = realPrivacyCtxFrom(identityId, now());
        return reply.code(200).send(await realPrivacy.restrictRequest(ctx, groupId, requestId, body.reason));
      }
      const ctx = privacyCtxFrom(request);
      return reply.code(200).send(privacyStore.restrictRequest(ctx, requestId, body.reason));
    },
  );

  // Exécution d'un export personnel FILTRÉ (C16-EXPORT). Anti-IDOR : la demande
  // doit appartenir au caller (sinon 404) ; vérification insuffisante ⇒ 403.
  app.post("/v1/privacy/rights-requests/:requestId/export", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await privacyRightsGroup(pool, requestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droits introuvable");
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(201).send(await realPrivacy.executeExport(ctx, groupId, requestId));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(201).send(privacyStore.executeExport(ctx, requestId));
  });

  // Exécution d'un effacement (18.10) après vérification proportionnée : pose un
  // tombstone et retire l'identité du service cœur.
  app.post("/v1/privacy/rights-requests/:requestId/erasure", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const groupId = await privacyRightsGroup(pool, requestId);
      if (!groupId) throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droits introuvable");
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(200).send(await realPrivacy.executeErasure(ctx, groupId, requestId));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(200).send(privacyStore.executeErasure(ctx, requestId));
  });

  // Point de restauration (18.10) : instantané des identités visibles.
  app.post("/v1/privacy/restore-points", async (request, reply) => {
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(201).send(await realPrivacy.snapshotRestorePoint(ctx));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(201).send(privacyStore.snapshotRestorePoint(ctx));
  });

  // Restauration (C16-RESTORE) : réapplique effacements ET révocations ; une
  // identité effacée après le point reste invisible (deleted_identity_visible false).
  app.post("/v1/privacy/restorations", async (request, reply) => {
    const body = restorationBody.parse(request.body);
    if (pool && realPrivacy) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realPrivacyCtxFrom(identityId, now());
      return reply.code(200).send(await realPrivacy.restoreLatest(ctx, body.probeIdentityId));
    }
    const ctx = privacyCtxFrom(request);
    return reply.code(200).send(privacyStore.restoreLatest(ctx, body.probeIdentityId));
  });

  /* --- C18 : mesure pilote / économie unitaire (16.1, 16.2, 16.3, 18.13) --- */

  // Journalisation d'un événement d'analytics pseudonymisé (16.1). Le domaine
  // REFUSE tout champ financier ou identitaire individuel (C18-ANALYTICS, 422
  // METRICS_CHAMPS_FINANCIER_INDIVIDUEL) et toute étape inconnue.
  app.post("/v1/metrics/analytics/events", async (request, reply) => {
    const body = analyticsEventBody.parse(request.body);
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply
        .code(201)
        .send(
          await realMetrics.trackAnalyticsEvent(ctx, {
            cohortId: body.cohortId,
            ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
            step: body.step,
            properties: body.properties,
          }),
        );
    }
    const ctx = metricsCtxFrom(request);
    return reply
      .code(201)
      .send(
        await metricsStore.trackAnalyticsEvent(ctx, {
          cohortId: body.cohortId,
          // Le groupe porteur est transmis au store RÉEL (RLS + FK NOT NULL) ;
          // omis quand absent (le store fictif l'ignore, compatibilité C18).
          ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
          step: body.step,
          properties: body.properties,
        }),
      );
  });

  // Entonnoir d'une cohorte : compte par étape + garde C18-ANALYTICS
  // (`individualFinancialFields` toujours 0 — l'export n'en porte jamais).
  app.get("/v1/metrics/analytics/funnel/:cohortId", async (request, reply) => {
    const { cohortId } = request.params as { cohortId: string };
    const query = request.query as { groupId?: string };
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.analyticsFunnel(ctx, cohortId, query.groupId));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.analyticsFunnel(ctx, cohortId, query.groupId));
  });

  // Création/mise à jour d'une cohorte (18.13) : un cycle = memberCount tours
  // (rotation égale) ; l'éligibilité rétention trois cycles est jugée domaine
  // (C18-COHORT : 3 tours / 10 membres ⇒ 0 cycle ⇒ non éligible).
  app.post("/v1/metrics/cohorts", async (request, reply) => {
    const body = cohortBody.parse(request.body);
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(201).send(await realMetrics.upsertCohort(ctx, body));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(201).send(await metricsStore.upsertCohort(ctx, body));
  });

  // Lecture d'une cohorte (404 non-divulguant si absente).
  app.get("/v1/metrics/cohorts/:groupId", async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.getCohort(ctx, groupId));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.getCohort(ctx, groupId));
  });

  // Économie unitaire (16.2) : paiement RÉEL distinct de la PROMESSE ; taux
  // réel et porte G2 dérivés par le domaine (C18-PAYERS : 2/10 = 20 % < 25 %
  // ⇒ gate_g2_met false). Montants XAF entiers sérialisés en chaînes.
  app.post("/v1/metrics/economics", async (request, reply) => {
    const body = economicsBody.parse(request.body);
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.computeEconomics(ctx, body));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.computeEconomics(ctx, body));
  });

  // Enregistrement d'un risque au registre (16.3) : sévérité connue, proba/
  // impact bornés, date AAAA-MM-JJ (le domaine juge, 422 sinon).
  app.post("/v1/metrics/risks", async (request, reply) => {
    const body = riskBody.parse(request.body);
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(201).send(await realMetrics.addRisk(ctx, body));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(201).send(await metricsStore.addRisk(ctx, body));
  });

  // Listage du registre des risques du pilote.
  app.get("/v1/metrics/risks", async (request, reply) => {
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.listRisks(ctx));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.listRisks(ctx));
  });

  // Contrôle d'extension du pilote (16.3) : un risque critique SANS contrôle
  // effectif bloque l'extension (extensionAllowed false + liste des blocages).
  app.post("/v1/metrics/extension-check", async (request, reply) => {
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.extensionStatus(ctx));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.extensionStatus(ctx));
  });

  // Même verdict en GET (lecture sans corps) : c'est la forme appelée par le
  // dashboard DIRECTION (`DirectionApi.extensionCheck()`), pour aligner le
  // contrat client/serveur sans imposer un POST factice côté navigateur.
  app.get("/v1/metrics/extension-check", async (request, reply) => {
    if (pool && realMetrics) {
      const identityId = await realIdentityFrom(pool, request, now);
      const ctx = realMetricsCtxFrom(identityId, now());
      return reply.code(200).send(await realMetrics.extensionStatus(ctx));
    }
    const ctx = metricsCtxFrom(request);
    return reply.code(200).send(await metricsStore.extensionStatus(ctx));
  });

  return app;
}