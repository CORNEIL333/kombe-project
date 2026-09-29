/**
 * C07 — Validations et corrections de cotisations (stories 6.2, 6.3, 6.4, 6.5, 6.6).
 *
 * Logique **pure**, horloge injectée, sans persistance : la machine à états
 * d'une cotisation, les règles d'**indépendance** (anti-collusion), les circuits
 * de **correction par compensation** et la **contestation** (litige) comme objet
 * séparé. Les preuves de **verrouillage réel**, de **sérialisation concurrente**
 * et d'**atomicité** événement/projection/outbox exigent PostgreSQL (BLOCKED tant
 * qu'aucune base réelle n'est raccordée — ADR-0007/ADR-0016/ADR-0017).
 *
 * Contrats tenus :
 *  - 6.2 machine déclarée → confirmée → validée ; rejet **avant validation
 *    seulement** ; compensation **après validation** par événement inverse lié à
 *    l'original ; litige sur objet séparé (une contestation **ne supprime pas**
 *    la validation historique).
 *  - 6.3 double/triple validation : déclarer par une personne, **confirmer par
 *    une autre** ; **troisième contrôleur distinct** si requis ; sans contrôleur
 *    requis, la confirmation **entraîne la validation** dans la même transaction
 *    ; une **notification ne compte pas** comme validation.
 *  - 6.4 anti-collusion : **indépendance non désactivable** entre déclarant et
 *    confirmateur (et contrôleur) ; l'acte refusé ne produit **aucune** écriture.
 *  - 6.5 contestation : fenêtre ordinaire de 7 jours après notification ;
 *    signalement **tardif de fraude ou erreur grave toujours possible** ; motif
 *    **obligatoire**, pièces **désactivées** au pilote ; avant validation
 *    **bloque** la validation, après validation **gèle** les opérations
 *    dépendantes **sans effacer** l'écriture.
 *  - 6.6 correction : **aucun UPDATE/DELETE** silencieux d'une écriture validée ;
 *    contre-écriture de l'original puis nouvelle déclaration ; **original
 *    compensé au plus une fois**.
 */
import { DomainError } from "./errors.js";

/** États de la machine à états d'une cotisation (6.2). */
export type ContributionState =
  | "declared"
  | "confirmed"
  | "validated"
  | "rejected"
  | "compensated";

/**
 * Cotisation en cours de validation. Le `declarantIdentityId` est le déclarant
 * effectif ; confirmateur et contrôleurs doivent lui être **distincts** (6.3,
 * 6.4). `requiredControllers` vaut 0 (double validation : confirmer ⇒ valider)
 * ou ≥ 1 (triple : un ou plusieurs contrôleurs distincts requis).
 */
export interface ContributionRecord {
  readonly contributionId: string;
  readonly obligationId: string;
  readonly groupId: string;
  readonly amountMinor: bigint;
  readonly declarantIdentityId: string;
  readonly state: ContributionState;
  readonly requiredControllers: number;
  readonly confirmerIdentityId: string | null;
  readonly controllerIdentityIds: readonly string[];
  /** Identité de la compensation qui a déjà retiré cet original (au plus une). */
  readonly compensatedById: string | null;
}

export interface NewContributionInput {
  readonly contributionId: string;
  readonly obligationId: string;
  readonly groupId: string;
  readonly amountMinor: bigint;
  readonly declarantIdentityId: string;
  readonly requiredControllers: number;
}

export function newContribution(input: NewContributionInput): ContributionRecord {
  if (!Number.isInteger(input.requiredControllers) || input.requiredControllers < 0) {
    throw new DomainError("CONTRIBUTION_STATE_INVALID", "Nombre de contrôleurs requis invalide");
  }
  return {
    contributionId: input.contributionId,
    obligationId: input.obligationId,
    groupId: input.groupId,
    amountMinor: input.amountMinor,
    declarantIdentityId: input.declarantIdentityId,
    state: "declared",
    requiredControllers: input.requiredControllers,
    confirmerIdentityId: null,
    controllerIdentityIds: [],
    compensatedById: null,
  };
}

/** Motif d'un acte de validation **non accepté** (indépendance violée, attente). */
export type ValidationRefusalReason =
  | "SELF_DECLARANT"
  | "ACTOR_ALREADY_ACTED"
  | "AWAITING_CONTROLLERS";

/**
 * Résultat d'un acte (confirmation ou contrôle). `validationAccepted` = false est
 * l'**observation obligatoire** des recettes C07-SELF / C07-TRIPLE : l'acte est
 * **refusé sans aucune écriture** (record inchangé). `validationCompleted` = true
 * signifie que l'acte a **paracheté** la validation (événement `validated`).
 */
export interface ValidationActResult {
  readonly validationAccepted: boolean;
  readonly validationCompleted: boolean;
  readonly record: ContributionRecord;
  readonly reason?: ValidationRefusalReason;
}

/**
 * Confirmation d'une cotisation (6.3, 6.4). Règle d'**indépendance non
 * désactivable** : le déclarant ne peut **jamais** confirmer sa propre
 * déclaration (C07-SELF). Si aucun contrôleur n'est requis, confirmer ⇒ valider
 * **atomiquement** ; sinon l'acte move `declared → confirmed` en attente de
 * contrôleur distinct. L'appelant (store) fait la garde de **permission** en
 * amont ; ici ne vit que la règle d'état et d'indépendance.
 */
export function confirmContribution(
  record: ContributionRecord,
  confirmerIdentityId: string,
): ValidationActResult {
  if (record.state !== "declared") {
    throw new DomainError("CONTRIBUTION_STATE_INVALID", "Confirmation permise seulement sur declaration");
  }
  if (confirmerIdentityId === record.declarantIdentityId) {
    return { validationAccepted: false, validationCompleted: false, record, reason: "SELF_DECLARANT" };
  }
  if (record.requiredControllers === 0) {
    return {
      validationAccepted: true,
      validationCompleted: true,
      record: { ...record, state: "validated", confirmerIdentityId },
    };
  }
  return {
    validationAccepted: true,
    validationCompleted: false,
    record: { ...record, state: "confirmed", confirmerIdentityId },
    reason: "AWAITING_CONTROLLERS",
  };
}

/**
 * Contrôle par un **troisième acteur distinct** (6.3, 6.4). Un acteur ne peut
 * cumuler les rôles : le **même** qui a confirmé ne peut contrôler (C07-TRIPLE →
 * `validationAccepted = false`, aucune écriture). Chaque contrôleur est unique ;
 * une fois le seuil `requiredControllers` atteint, la cotisation est **validée**.
 */
export function controlContribution(
  record: ContributionRecord,
  controllerIdentityId: string,
): ValidationActResult {
  if (record.state !== "confirmed") {
    throw new DomainError("CONTRIBUTION_STATE_INVALID", "Contrôle permis seulement apres confirmation");
  }
  if (controllerIdentityId === record.declarantIdentityId) {
    return { validationAccepted: false, validationCompleted: false, record, reason: "SELF_DECLARANT" };
  }
  if (
    controllerIdentityId === record.confirmerIdentityId ||
    record.controllerIdentityIds.includes(controllerIdentityId)
  ) {
    return { validationAccepted: false, validationCompleted: false, record, reason: "ACTOR_ALREADY_ACTED" };
  }
  const controllerIdentityIds = [...record.controllerIdentityIds, controllerIdentityId];
  const done = controllerIdentityIds.length >= record.requiredControllers;
  return {
    validationAccepted: true,
    validationCompleted: done,
    record: { ...record, controllerIdentityIds, state: done ? "validated" : "confirmed" },
    ...(done ? {} : { reason: "AWAITING_CONTROLLERS" as const }),
  };
}

/**
 * Rejet d'une cotisation (6.2). **Seulement avant validation** : rejeter une
 * écriture déjà validée ou compensée est **interdit** (`CONTRIBUTION_STATE_INVALID`)
 * — la correction d'une écriture validée passe par la **compensation**, jamais
 * par un rejet rétroactif.
 */
export function rejectContribution(record: ContributionRecord): ContributionRecord {
  if (record.state !== "declared" && record.state !== "confirmed") {
    throw new DomainError(
      "CONTRIBUTION_STATE_INVALID",
      "Rejet permis seulement avant validation",
    );
  }
  return { ...record, state: "rejected" };
}

/** Compensation : l'original validé et sa contre-écriture liée (6.2, 6.6). */
export interface CompensationResult {
  readonly original: ContributionRecord;
  readonly reversal: ContributionRecord;
}

/**
 * Contre-écriture d'un original **validé** (6.2, 6.6). Aucun UPDATE/DELETE
 * silencieux : l'original passe à `compensated` et porte `compensatedById` vers
 * la contre-écriture liée ; la contre-écriture est elle-même soumise au même
 * circuit de validation. Un original **déjà compensé** ne l'est **qu'une fois**
 * (`CONTRIBUTION_ALREADY_COMPENSATED`) — c'est la garde qui borne `reversal_count`
 * à 1 sous deux courses concurrentes (C07-REVERSE ; sérialisation réelle =
 * verrou DB, **BLOCKED**).
 */
export function compensateContribution(
  original: ContributionRecord,
  reversalContributionId: string,
): CompensationResult {
  // Garde « au plus une fois » vérifiée EN PREMIER : un original déjà muni d'une
  // compensation (état `compensated`, `compensatedById` posé) est refusé comme
  // déjà compensé — c'est le signal distinct d'une seconde course concurrente
  // (C07-REVERSE) plutôt qu'un simple état invalide.
  if (original.compensatedById !== null) {
    throw new DomainError("CONTRIBUTION_ALREADY_COMPENSATED", "Original deja compense une fois");
  }
  if (original.state !== "validated") {
    throw new DomainError("CONTRIBUTION_STATE_INVALID", "Compensation permise seulement apres validation");
  }
  const reversal = newContribution({
    contributionId: reversalContributionId,
    obligationId: original.obligationId,
    groupId: original.groupId,
    amountMinor: original.amountMinor,
    declarantIdentityId: original.declarantIdentityId,
    requiredControllers: original.requiredControllers,
  });
  return {
    original: { ...original, state: "compensated", compensatedById: reversalContributionId },
    reversal,
  };
}

/* ── Contestation / litige — objet séparé (6.5) ───────────────────────────── */

export type DisputeCategory = "ordinary" | "fraud" | "serious_error";
export type DisputeState = "open" | "resolved";

/** Fenêtre ordinaire de contestation : 7 jours après notification (6.5). */
export const ORDINARY_DISPUTE_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export interface Dispute {
  readonly disputeId: string;
  readonly groupId: string;
  readonly obligationId: string;
  readonly reason: string;
  readonly category: DisputeCategory;
  readonly raisedBy: string;
  /** Horodatage de la notification de référence (ouverture de la fenêtre). */
  readonly notifiedAt: number;
  readonly raisedAt: number;
  readonly state: DisputeState;
}

export interface RaiseDisputeInput {
  readonly disputeId: string;
  readonly groupId: string;
  readonly obligationId: string;
  readonly reason: string;
  readonly category: DisputeCategory;
  readonly raisedBy: string;
  readonly notifiedAt: number;
  readonly raisedAt: number;
}

/**
 * Ouverture d'un litige (6.5). **Motif obligatoire** ; les pièces sont
 * **désactivées au pilote** (aucun champ de pièce ici). Fenêtre : une
 * contestation **ordinaire** n'est recevable que dans les 7 jours suivant la
 * notification ; la **fraude** et l'**erreur grave** restent signalables
 * **toujours**. Non-divulgation : une même erreur stable pour motif manquant ou
 * fenêtre dépassée de catégorie ordinaire.
 */
export function raiseDispute(input: RaiseDisputeInput): Dispute {
  if (input.reason.trim().length === 0) {
    throw new DomainError("DISPUTE_REASON_REQUIRED", "Motif de contestation requis");
  }
  if (
    input.category === "ordinary" &&
    input.raisedAt - input.notifiedAt > ORDINARY_DISPUTE_WINDOW_SECONDS
  ) {
    throw new DomainError("DISPUTE_WINDOW_CLOSED", "Hors delai ordinaire de contestation");
  }
  return {
    disputeId: input.disputeId,
    groupId: input.groupId,
    obligationId: input.obligationId,
    reason: input.reason,
    category: input.category,
    raisedBy: input.raisedBy,
    notifiedAt: input.notifiedAt,
    raisedAt: input.raisedAt,
    state: "open",
  };
}

/** Un litige ouvert porte-t-il sur cette obligation ? */
function hasOpenDispute(disputes: readonly Dispute[], obligationId: string): boolean {
  return disputes.some((d) => d.obligationId === obligationId && d.state === "open");
}

/**
 * **Avant validation**, un litige ouvert sur l'obligation **bloque** la
 * validation (6.5). La garde est appelée par le store avant de parachever une
 * validation ; elle n'efface rien, elle **retarde** la transition.
 */
export function assertValidationNotBlocked(
  disputes: readonly Dispute[],
  obligationId: string,
  state: ContributionState,
): void {
  if ((state === "declared" || state === "confirmed") && hasOpenDispute(disputes, obligationId)) {
    throw new DomainError("VALIDATION_BLOCKED_BY_DISPUTE", "Validation bloquee par un litige ouvert");
  }
}

/**
 * **Après validation**, un litige ouvert **gèle** les opérations dépendantes du
 * montant contesté (clôture de tour, décaissement) **sans effacer** l'écriture
 * (6.5, 6.6). L'historique reste intact : on **gèle**, on ne **supprime** pas.
 */
export function assertDependentOperationsNotBlocked(
  disputes: readonly Dispute[],
  obligationId: string,
): void {
  if (hasOpenDispute(disputes, obligationId)) {
    throw new DomainError("ROUND_CLOSE_BLOCKED_BY_DISPUTE", "Operations dependantes gelees par un litige ouvert");
  }
}
