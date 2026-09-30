/**
 * C08 — Décaissements, frais, rapprochement et clôture (stories 2.8, 6.10, 18.4, 18.9).
 *
 * Logique **pure**, horloge injectée, sans persistance : KÓMBE **ne transfère
 * jamais** de fonds — le décaissement est une **sortie externe documentée**, pas
 * une exécution. Ce module contracte le missing piece pointé par le prompt C08 :
 * « une correction de décaissement/frais suit **demande, approbation
 * indépendante et contre-écriture unique** ». Le **rapprochement** d'un tour
 * (contributions validées nettes = décaissements nets + frais groupe) naît de
 * l'**oracle indépendant** `reconciliation` (C00), jamais d'une constante lue.
 * Les preuves de verrou réel, de sérialisation concurrente des contre-écritures
 * et d'atomicité exigent PostgreSQL — **BLOCKED** (ADR-0007/ADR-0016/ADR-0018).
 *
 * Contrats tenus :
 *  - 6.10 : le **trésorier déclare** net bénéficiaire + frais groupe ; si le
 *    trésorier **est** le bénéficiaire, un **suppléant déclare** (séparation des
 *    pouvoirs) ; le **bénéficiaire confirme** ; un **contrôleur distinct**
 *    intervient selon la règle ; **frais personnels hors pot** jamais déduits.
 *  - 18.4 : **frais groupe ≠ frais individuels** ; `contributions nettes =
 *    décaissements nets + frais groupe` pour une clôture normale ; l'**écart
 *    reste visible** et **bloque** la clôture (jamais masqué).
 *  - 18.9 / 2.8 : **clôture normale** refusée si écart non nul OU litige
 *    bloquant OU impayé affectant le pot ; **arrêt exceptionnel** conserve les
 *    écarts et les obligations restantes et **ne se présente jamais** comme une
 *    clôture équilibrée ; **aucune correction ne rembourse automatiquement** un
 *    mouvement externe (`refundedExternally = false`, structurel).
 */
import { DomainError } from "./errors.js";
import { money, perAmount } from "./money.js";
import { reconciliation } from "./reconciliation.js";

/** États du décaissement — miroir exact de la CHECK SQL `disbursement.state` (0001). */
export type DisbursementState =
  | "requested"
  | "completed"
  | "reversal_requested"
  | "reversed";

/**
 * Décaissement documenté. `netAmount` est la somme perçue par le bénéficiaire,
 * `groupFees` la part du pot consommée en frais, `personalFeesOutOfPot` les
 * frais supportés personnellement — **hors pot**, jamais déduits d'un total.
 * `refundedExternally` est **figé à false** : corriger n'annule pas un
 * mouvement bancaire réel (6.10, 18.9).
 */
export interface DisbursementRecord {
  readonly disbursementId: string;
  readonly groupId: string;
  readonly roundId: string;
  readonly obligationId: string;
  readonly beneficiaryIdentityId: string;
  readonly declarantIdentityId: string;
  readonly netAmount: bigint;
  readonly groupFees: bigint;
  readonly personalFeesOutOfPot: bigint;
  readonly allegedDate: number;
  readonly serverDate: number;
  readonly state: DisbursementState;
  readonly requiredControllers: number;
  readonly beneficiaryConfirmedBy: string | null;
  readonly controllerIdentityIds: readonly string[];
  readonly reversalRequestedBy: string | null;
  readonly reversalReason: string | null;
  readonly reversedById: string | null;
  readonly reversalCount: number;
  readonly refundedExternally: false;
}

export interface DeclareDisbursementInput {
  readonly disbursementId: string;
  readonly groupId: string;
  readonly roundId: string;
  readonly obligationId: string;
  readonly beneficiaryIdentityId: string;
  readonly declarantIdentityId: string;
  readonly netAmount: bigint;
  readonly groupFees: bigint;
  readonly personalFeesOutOfPot?: bigint;
  readonly requiredControllers: number;
  readonly allegedDate: number;
  readonly serverDate: number;
}

/**
 * Déclaration d'un décaissement externe (6.10). Montants entiers vérifiés
 * (ADR-0002). **Séparation des pouvoirs** : le déclarant ne peut être le
 * bénéficiaire — si le trésorier est bénéficiaire, un **suppléant déclare**
 * (`DISBURSEMENT_SUBSTITUTE_REQUIRED`, 422). L'écriture naît en `requested`,
 * `reversalCount = 0`, `refundedExternally = false`.
 */
export function declareDisbursement(input: DeclareDisbursementInput): DisbursementRecord {
  // Plafond par montant (ADR-0002, `kombe_money` ≤ 1 000 000 000) : la borne
  // basse `money()` seule acceptait un montant irréalisable en base.
  perAmount(input.netAmount);
  perAmount(input.groupFees);
  const personal = input.personalFeesOutOfPot ?? 0n;
  perAmount(personal);
  if (!Number.isInteger(input.requiredControllers) || input.requiredControllers < 0) {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Nombre de contrôleurs requis invalide");
  }
  if (input.declarantIdentityId === input.beneficiaryIdentityId) {
    throw new DomainError(
      "DISBURSEMENT_SUBSTITUTE_REQUIRED",
      "Le beneficiaire ne declare pas son propre decaissement : un suppleant doit declarer",
    );
  }
  return {
    disbursementId: input.disbursementId,
    groupId: input.groupId,
    roundId: input.roundId,
    obligationId: input.obligationId,
    beneficiaryIdentityId: input.beneficiaryIdentityId,
    declarantIdentityId: input.declarantIdentityId,
    netAmount: input.netAmount,
    groupFees: input.groupFees,
    personalFeesOutOfPot: personal,
    allegedDate: input.allegedDate,
    serverDate: input.serverDate,
    state: "requested",
    requiredControllers: input.requiredControllers,
    beneficiaryConfirmedBy: null,
    controllerIdentityIds: [],
    reversalRequestedBy: null,
    reversalReason: null,
    reversedById: null,
    reversalCount: 0,
    refundedExternally: false,
  };
}

/** Motif d'un acte sur décaissement **non accepté** (indépendance, attente). */
export type DisbursementRefusalReason =
  | "NOT_BENEFICIARY"
  | "NOT_INDEPENDENT"
  | "ACTOR_ALREADY_ACTED"
  | "AWAITING_CONTROLLERS";

export interface DisbursementActResult {
  readonly actAccepted: boolean;
  readonly completed: boolean;
  readonly record: DisbursementRecord;
  readonly reason?: DisbursementRefusalReason;
}

/**
 * Confirmation par le **bénéficiaire** (6.10). Seul le bénéficiaire confirme
 * (`NOT_BENEFICIARY` sinon, refus **sans écriture**). Sans contrôleur requis,
 * confirmer **achève** (`completed`) ; sinon l'objet reste `requested` en
 * attente d'un **contrôleur distinct**. Un **contrôle** suppose la confirmation
 * préalable du bénéficiaire.
 */
export function confirmDisbursement(
  record: DisbursementRecord,
  actorIdentityId: string,
): DisbursementActResult {
  if (record.state !== "requested") {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Confirmation permise seulement sur demande ouverte");
  }
  if (actorIdentityId !== record.beneficiaryIdentityId) {
    return { actAccepted: false, completed: false, record, reason: "NOT_BENEFICIARY" };
  }
  if (record.requiredControllers === 0) {
    return {
      actAccepted: true,
      completed: true,
      record: { ...record, state: "completed", beneficiaryConfirmedBy: actorIdentityId },
    };
  }
  return {
    actAccepted: true,
    completed: false,
    record: { ...record, beneficiaryConfirmedBy: actorIdentityId },
    reason: "AWAITING_CONTROLLERS",
  };
}

/**
 * Contrôle **distinct et indépendant** (6.10). Le contrôleur ne peut être ni le
 * déclarant ni le bénéficiaire (`NOT_INDEPENDENT`, refus sans écriture), ni un
 * acteur ayant déjà contrôlé (`ACTOR_ALREADY_ACTED`). Au seuil atteint, le
 * décaissement est **achevé**.
 */
export function controlDisbursement(
  record: DisbursementRecord,
  controllerIdentityId: string,
): DisbursementActResult {
  if (record.state !== "requested") {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Contrôle permis seulement sur demande ouverte");
  }
  if (record.beneficiaryConfirmedBy === null) {
    throw new DomainError(
      "DISBURSEMENT_STATE_INVALID",
      "Le controle suppose la confirmation prealable du beneficiaire",
    );
  }
  if (
    controllerIdentityId === record.declarantIdentityId ||
    controllerIdentityId === record.beneficiaryIdentityId
  ) {
    return { actAccepted: false, completed: false, record, reason: "NOT_INDEPENDENT" };
  }
  if (record.controllerIdentityIds.includes(controllerIdentityId)) {
    return { actAccepted: false, completed: false, record, reason: "ACTOR_ALREADY_ACTED" };
  }
  const controllerIdentityIds = [...record.controllerIdentityIds, controllerIdentityId];
  const done = controllerIdentityIds.length >= record.requiredControllers;
  return {
    actAccepted: true,
    completed: done,
    record: { ...record, controllerIdentityIds, state: done ? "completed" : "requested" },
    ...(done ? {} : { reason: "AWAITING_CONTROLLERS" as const }),
  };
}

/**
 * **Demande** de correction d'un décaissement **achevé** (6.10, 18.9). La
 * correction ne rembourse **jamais** un mouvement externe : `refundedExternally`
 * reste `false`. Un motif non vide est exigé ; l'état passe en
 * `reversal_requested` dans l'attente d'une **approbation indépendante**.
 */
export function requestDisbursementReversal(
  record: DisbursementRecord,
  requesterIdentityId: string,
  reason: string,
): DisbursementRecord {
  if (record.state !== "completed") {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Seul un decaissement acheve peut etre corrige");
  }
  if (reason.trim().length === 0) {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Motif de correction requis");
  }
  return {
    ...record,
    state: "reversal_requested",
    reversalRequestedBy: requesterIdentityId,
    reversalReason: reason,
  };
}

/**
 * **Approbation indépendante → contre-écriture unique** (contrat manquant posé
 * par C08, 6.10). L'approbateur ne peut être ni le demandeur de la correction,
 * ni le déclarant d'origine, **ni le bénéficiaire** (il jugerait sa propre
 * cause — `DISBURSEMENT_REVERSAL_NOT_INDEPENDENT`, 403) ; la contre-écriture
 * n'est **jamais automatique** sur le mouvement externe. Un
 * original **déjà reversé** ne l'est **qu'une fois**
 * (`DISBURSEMENT_ALREADY_REVERSED`, 409) — c'est la garde qui borne
 * `reversalCount` à 1 sous deux courses (C08-CORRECTION ; sérialisation réelle =
 * verrou DB, **BLOCKED**). L'écriture d'origine est **conservée** (reversée,
 * jamais effacée).
 */
export function approveDisbursementReversal(
  original: DisbursementRecord,
  approverIdentityId: string,
): DisbursementRecord {
  if (original.reversedById !== null) {
    throw new DomainError("DISBURSEMENT_ALREADY_REVERSED", "Decaissement deja corrige une fois");
  }
  if (original.state !== "reversal_requested") {
    throw new DomainError("DISBURSEMENT_STATE_INVALID", "Approbation permise seulement sur demande de correction");
  }
  if (
    approverIdentityId === original.reversalRequestedBy ||
    approverIdentityId === original.declarantIdentityId ||
    approverIdentityId === original.beneficiaryIdentityId
  ) {
    throw new DomainError(
      "DISBURSEMENT_REVERSAL_NOT_INDEPENDENT",
      "Approbateur de correction non independant",
    );
  }
  return {
    ...original,
    state: "reversed",
    reversedById: `${original.disbursementId}#reversal`,
    reversalCount: original.reversalCount + 1,
  };
}

/* ── Frais — grand livre DISTINCT pot / personnel (18.4) ─────────────────── */

export type FeeBearer = "group" | "member_personal";

export interface FeeEntry {
  readonly amount: bigint;
  /** `group` = imputable au pot ; `member_personal` = hors pot, JAMAIS déduit. */
  readonly borneBy: FeeBearer;
}

export interface FeeLedgerTotals {
  readonly groupFees: bigint;
  readonly personalFeesOutOfPot: bigint;
}

/**
 * Grand livre des frais : les **frais groupe** entrent dans le rapprochement,
 * les **frais personnels hors pot** en restent **exclus** (18.4 — évite la
 * double déduction). Séparation structurelle : les deux totaux ne se
 * mélangent jamais.
 */
export function feeLedger(entries: readonly FeeEntry[]): FeeLedgerTotals {
  let groupFees = 0n;
  let personal = 0n;
  for (const entry of entries) {
    money(entry.amount);
    if (entry.borneBy === "group") groupFees += entry.amount;
    else personal += entry.amount;
  }
  return { groupFees, personalFeesOutOfPot: personal };
}

/* ── Rapprochement et clôture (6.10, 18.4, 18.9, 2.8) ────────────────────── */

export interface RoundReconciliationInput {
  readonly validatedNetTotal: bigint;
  readonly netDisbursedTotal: bigint;
  readonly groupFeesTotal: bigint;
  readonly hasBlockingDispute?: boolean;
  readonly hasUnpaidAffectingPot?: boolean;
}

export interface RoundReconciliationResult {
  readonly reconciliationGap: bigint;
  readonly normalCloseAccepted: boolean;
  readonly blockedByGap: boolean;
  readonly blockedByDispute: boolean;
  readonly blockedByUnpaid: boolean;
}

/**
 * Rapprochement d'un tour et **décision de clôture normale** via l'**oracle
 * indépendant** `reconciliation` (C00) : `gap = validé net − décaissements nets
 * − frais groupe`. La clôture normale n'est admise que si **gap = 0** ET
 * **aucun litige bloquant** ET **aucun impayé affectant le pot**. L'écart est
 * **rendu visible**, jamais masqué (C08-BALANCE gap=0 ; C08-GAP ⇒
 * `normal_close_accepted = false`).
 */
export function reconcileRound(input: RoundReconciliationInput): RoundReconciliationResult {
  const disputed = input.hasBlockingDispute ?? false;
  const { gap } = reconciliation(
    input.validatedNetTotal,
    input.netDisbursedTotal,
    input.groupFeesTotal,
    disputed,
  );
  const blockedByGap = gap !== 0n;
  const blockedByDispute = disputed;
  const blockedByUnpaid = input.hasUnpaidAffectingPot ?? false;
  return {
    reconciliationGap: gap,
    normalCloseAccepted: !blockedByGap && !blockedByDispute && !blockedByUnpaid,
    blockedByGap,
    blockedByDispute,
    blockedByUnpaid,
  };
}

/**
 * Somme des décaissements **nets** effectivement sortis. Un décaissement
 * `reversal_requested` compte **encore** : les fonds sont physiquement sortis
 * et ne réintègrent le pot qu'**une fois** la contre-écriture approuvée
 * (sinon l'écart serait masqué pendant la correction — 18.4, jamais masqué).
 */
export function sumNetDisbursed(records: readonly DisbursementRecord[]): bigint {
  let total = 0n;
  for (const r of records) {
    if (r.state === "completed" || r.state === "reversal_requested") total += r.netAmount;
  }
  return total;
}

/** Somme des **frais groupe** des décaissements sortis (les frais personnels en sont exclus). */
export function sumGroupFees(records: readonly DisbursementRecord[]): bigint {
  let total = 0n;
  for (const r of records) {
    if (r.state === "completed" || r.state === "reversal_requested") total += r.groupFees;
  }
  return total;
}

export interface RemainingObligation {
  readonly obligationId: string;
  readonly remainingDue: bigint;
}

export interface ExceptionalStopResult {
  readonly kind: "exceptional_stop";
  readonly reconciliationGap: bigint;
  /** **Toujours false** : un arrêt exceptionnel n'est JAMAIS une clôture équilibrée. */
  readonly balanced: false;
  readonly remainingObligations: readonly RemainingObligation[];
}

/**
 * **Arrêt exceptionnel** (18.9) : produit un **bilan avec les obligations
 * restantes** et **conserve l'écart**, sans jamais le présenter comme un
 * équilibre. La décision de passer en arrêt (plutôt que clôture normale)
 * appartient au serveur ; ici vit la **non-masquation** de l'écart.
 */
export function stopGroupWithDiscrepancies(
  validatedNetTotal: bigint,
  netDisbursedTotal: bigint,
  groupFeesTotal: bigint,
  remainingObligations: readonly RemainingObligation[],
): ExceptionalStopResult {
  const { gap } = reconciliation(validatedNetTotal, netDisbursedTotal, groupFeesTotal, false);
  const remaining = remainingObligations.map((o) => {
    money(o.remainingDue);
    return { obligationId: o.obligationId, remainingDue: o.remainingDue };
  });
  return {
    kind: "exceptional_stop",
    reconciliationGap: gap,
    balanced: false,
    remainingObligations: remaining,
  };
}
