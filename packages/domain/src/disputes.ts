/**
 * C10 — Litiges et recours (stories 8.1, 8.2, 8.3, 8.4).
 *
 * Logique **pure**, horloge injectée, sans persistance. Prolonge le socle de
 * contestation C07 (`validation.ts` : ouverture, fenêtre ordinaire 7 j, fraude
 * et erreur grave toujours recevables, blocage avant validation, gel après)
 * avec le **circuit complet** : vue privée vs vue commune (8.1), désignation de
 * résolveurs **non impliqués** (8.2), **résolution qui ne touche aucun montant**
 * (8.3 — la correction passe exclusivement par le circuit de compensation
 * C07/C08), **recours/reprise liée à l'original**, et **temps calendaire vs
 * ouvré** (8.4). Les preuves de verrouillage réel, d'unicité en base et
 * d'atomicité exigent PostgreSQL — **BLOCKED** tant qu'aucune base réelle
 * n'est raccordée (ADR-0007 / ADR-0016 / ADR-0018).
 *
 * Contrats tenus :
 *  - 8.1 : litige sur objet du **même groupe accessible** ; motif **et**
 *    correction demandée ; **pièces désactivées** au pilote (aucun champ) ;
 *    **statut commun visible de tous** dans le groupe, **détails sensibles
 *    réservés** aux parties et résolveurs autorisés (C10-PRIVACY).
 *  - 8.2 : résolveurs **désignés non impliqués** dans l'opération ; une
 *    **hiérarchie de rôle ne remplace pas l'indépendance** — le rôle ouvre la
 *    porte, l'objet la ferme ; **si tous sont impliqués**, aucun résolveur
 *    possible : le gel ciblé **demeure** et la procédure externe acceptée
 *    s'applique (le serveur ne résout rien).
 *  - 8.3 : **clôturer le ticket ne change aucun montant** (`validated_total_delta
 *    = 0`, C10-RESOLVE — structurellement : la résolution n'émet **aucun**
 *    événement monétaire et ne reçoit **aucun** montant) ; décision avec
 *    **motif** et actions ; **correction uniquement** via compensation C07/C08,
 *    l'issue **référence** ces écritures ; **recours** rouvre le dossier
 *    **lié à l'original** (la première résolution reste historisée).
 *  - 8.4 (mesure, P1 gated) : **temps calendaire et temps ouvré distincts** ;
 *    médiane 48 h calendaires visée, p90 et dossiers ouverts publiés — la
 *    **production** de statistiques relève d'un lot pilote gated, ici vit le
 *    **calcul** déterministe.
 */
import { DomainError } from "./errors.js";
import type { DisputeCategory } from "./validation.js";

/**
 * Dossier de litige complet. `reason`/`requestedCorrection` sont les données
 * **privées** ; `outcome` est l'issue **utile commune**. Les pièces sont
 * désactivées au pilote : **aucun champ de pièce** n'existe ici (8.1).
 */
export interface DisputeRecord {
  readonly disputeId: string;
  readonly groupId: string;
  readonly obligationId: string;
  readonly category: DisputeCategory;
  readonly raisedBy: string;
  readonly reason: string;
  readonly requestedCorrection: string;
  /** Identités impliquées dans l'opération contestée (déclarant, confirmateurs…). */
  readonly involvedIdentityIds: readonly string[];
  /** Résolveurs **désignés** (8.2) — jamais un rôle, toujours une désignation objet. */
  readonly resolverIdentityIds: readonly string[];
  readonly notifiedAt: number;
  readonly raisedAt: number;
  readonly state: "open" | "resolved";
  readonly outcome: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: number | null;
  /** Écritures de compensation (C07/C08) que l'issue référence — jamais créées ici. */
  readonly correctionContributionIds: readonly string[];
  /** Liens de reprise : dossier courant → original d'un recours (8.3). */
  readonly reopenedFromDisputeId: string | null;
  readonly reopenCount: number;
}

export interface OpenDisputeCaseInput {
  readonly disputeId: string;
  readonly groupId: string;
  readonly obligationId: string;
  readonly category: DisputeCategory;
  readonly raisedBy: string;
  readonly reason: string;
  readonly requestedCorrection: string;
  readonly involvedIdentityIds: readonly string[];
  readonly notifiedAt: number;
  readonly raisedAt: number;
}

/**
 * Ouverture du dossier (8.1). Le **motif** et la **correction demandée** sont
 * tous deux obligatoires ; l'objet appartient au même groupe (garde anti-IDOR
 * du store). Aucun champ de pièce : désactivées au pilote.
 */
export function openDisputeCase(input: OpenDisputeCaseInput): DisputeRecord {
  if (input.reason.trim().length === 0) {
    throw new DomainError("DISPUTE_REASON_REQUIRED", "Motif de contestation requis");
  }
  if (input.requestedCorrection.trim().length === 0) {
    throw new DomainError(
      "DISPUTE_RESOLUTION_REQUIRED",
      "Correction demandée requise pour ouvrir le dossier",
    );
  }
  return {
    disputeId: input.disputeId,
    groupId: input.groupId,
    obligationId: input.obligationId,
    category: input.category,
    raisedBy: input.raisedBy,
    reason: input.reason,
    requestedCorrection: input.requestedCorrection,
    involvedIdentityIds: [...new Set([input.raisedBy, ...input.involvedIdentityIds])],
    resolverIdentityIds: [],
    notifiedAt: input.notifiedAt,
    raisedAt: input.raisedAt,
    state: "open",
    outcome: null,
    resolvedBy: null,
    resolvedAt: null,
    correctionContributionIds: [],
    reopenedFromDisputeId: null,
    reopenCount: 0,
  };
}

/**
 * Désignation des résolveurs (8.2). Un résolveur **ne peut pas** être un
 * impliqué ni le levant du litige : l'indépendance se vérifie **à la
 * désignation**, avant tout acte. Si la désignation est vide, personne ne peut
 * résoudre — c'est l'état « tous impliqués » : le gel ciblé **demeure** et la
 * procédure externe s'applique (8.2, jamais un contournement par rôle).
 */
export function designateResolvers(
  record: DisputeRecord,
  resolverIdentityIds: readonly string[],
): DisputeRecord {
  if (resolverIdentityIds.length === 0) {
    throw new DomainError(
      "DISPUTE_RESOLVER_NOT_DESIGNATED",
      "Aucun résolveur indépendant désigné — gel maintenu, procédure externe",
    );
  }
  for (const r of resolverIdentityIds) {
    if (record.involvedIdentityIds.includes(r)) {
      throw new DomainError(
        "DISPUTE_RESOLVER_NOT_INDEPENDENT",
        "Un résolveur désigné est impliqué dans l'operation contestee",
      );
    }
  }
  return { ...record, resolverIdentityIds: [...new Set(resolverIdentityIds)] };
}

/**
 * Le demandeur d'accès au **détail privé** est-il une partie autorisée ?
 * Parties = levant, impliqués, résolveurs désignés. La règle est **structurelle
 * et non désactivable** : le rôle seul n'ouvre pas le détail (l'auditeur non
 * partie reste hors des parties — cf. limite documentée ADR-0019).
 */
export function isDisputeParty(record: DisputeRecord, identityId: string): boolean {
  return (
    identityId === record.raisedBy ||
    record.involvedIdentityIds.includes(identityId) ||
    record.resolverIdentityIds.includes(identityId)
  );
}

/**
 * Vue **commune** (8.1) — limitée à `existence / statut / issue utile`, visible
 * de tout membre du groupe. **Aucun** motif, **aucune** correction demandée,
 * **aucune** identité de partie n'y transite : c'est la garde de la recette
 * C10-PRIVACY (`private_details_returned = false`).
 */
export interface DisputeCommonView {
  readonly disputeId: string;
  readonly obligationId: string;
  readonly category: DisputeCategory;
  readonly state: "open" | "resolved";
  readonly outcome: string | null;
  readonly raisedAt: number;
  readonly resolvedAt: number | null;
  readonly reopenCount: number;
}

export function disputeCommonView(record: DisputeRecord): DisputeCommonView {
  return {
    disputeId: record.disputeId,
    obligationId: record.obligationId,
    category: record.category,
    state: record.state,
    outcome: record.outcome,
    raisedAt: record.raisedAt,
    resolvedAt: record.resolvedAt,
    reopenCount: record.reopenCount,
  };
}

/** Vue **complète**, réservée aux parties autorisées (le store garde avant). */
export function disputeDetailView(record: DisputeRecord): DisputeRecord {
  return record;
}

export interface ResolveInput {
  /** Acteur qui résout — doit être désigné ET indépendant (double garde). */
  readonly actorIdentityId: string;
  /** Décision documentée : motif de résolution non vide (8.3). */
  readonly outcome: string;
  readonly resolvedAt: number;
  /** Écritures de compensation C07/C08 que l'issue **référence** (peut être vide). */
  readonly correctionContributionIds?: readonly string[];
}

/**
 * Résolution (8.3, C10-RESOLVE). **Clôturer le ticket ne modifie aucun
 * montant** : la signature ne reçoit **aucun** montant et n'émet **aucun**
 * événement monétaire — `validated_total_delta = 0` est structurel, pas une
 * promesse. La correction d'un montant s'obtient **uniquement** par le circuit
 * de compensation (C07/C08) ; l'issue peut en **référencer** les écritures.
 * Indépendance : l'acteur doit être **désigné** et n'être **ni impliqué ni le
 * levant** (8.2 — une hiérarchie de rôle ne remplace pas l'indépendance).
 */
export function resolveDispute(record: DisputeRecord, input: ResolveInput): DisputeRecord {
  if (record.state !== "open") {
    throw new DomainError("DISPUTE_ALREADY_RESOLVED", "Litige deja resolu");
  }
  if (
    record.resolverIdentityIds.length === 0 ||
    !record.resolverIdentityIds.includes(input.actorIdentityId)
  ) {
    throw new DomainError(
      "DISPUTE_RESOLVER_NOT_DESIGNATED",
      "Seul un resolveur designé peut resoudre",
    );
  }
  if (
    input.actorIdentityId === record.raisedBy ||
    record.involvedIdentityIds.includes(input.actorIdentityId)
  ) {
    throw new DomainError(
      "DISPUTE_RESOLVER_NOT_INDEPENDENT",
      "Resolveur non independant de l'operation contestee",
    );
  }
  if (input.outcome.trim().length === 0) {
    throw new DomainError(
      "DISPUTE_RESOLUTION_REQUIRED",
      "La decision exige un motif documente",
    );
  }
  return {
    ...record,
    state: "resolved",
    outcome: input.outcome,
    resolvedBy: input.actorIdentityId,
    resolvedAt: input.resolvedAt,
    correctionContributionIds: [...(input.correctionContributionIds ?? [])],
  };
}

/**
 * Recours (8.3) : un litige **résolu** peut être **rouvert** par le levant,
 * **lié à l'original** — la première résolution reste historisée
 * (`previousOutcome`/`previousResolvedAt`), `reopenCount` borne la reprise.
 * La réouverture **rétablit le gel** ciblé (les opérations dépendantes
 * redeviennent bloquées) sans toucher aux montants.
 */
export function reopenDispute(record: DisputeRecord): DisputeRecord {
  if (record.state !== "resolved") {
    throw new DomainError("DISPUTE_NOT_RESOLVABLE", "Un recours porte sur un litige resolu");
  }
  return {
    ...record,
    state: "open",
    outcome: null,
    resolvedBy: null,
    resolvedAt: null,
    correctionContributionIds: [],
    reopenedFromDisputeId: record.reopenedFromDisputeId ?? record.disputeId,
    reopenCount: record.reopenCount + 1,
  };
}

/**
 * Garde de clôture d'un tour portant sur **plusieurs** obligations
 * (C10-FREEZE) : si **une seule** porte un litige ouvert, la clôture normale
 * est refusée — `normal_close_accepted = false` — **sans aucun effacement**
 * des écritures (le gel se lève par résolution indépendante, jamais par
 * passage en force).
 */
export function assertRoundCloseNotFrozen(
  disputes: readonly DisputeRecord[],
  obligationIds: readonly string[],
): void {
  const frozen = new Set(
    disputes.filter((d) => d.state === "open").map((d) => d.obligationId),
  );
  for (const oid of obligationIds) {
    if (frozen.has(oid)) {
      throw new DomainError(
        "ROUND_CLOSE_BLOCKED_BY_DISPUTE",
        "Cloture gelee par un litige ouvert sur une obligation du tour",
      );
    }
  }
}

/* ── Mesure 8.4 — temps calendaire et temps ouvré DISTINCTS ──────────────── */

/**
 * Fenêtre ouvrée du pilote : 08:00–18:00 UTC, lundi–vendredi. Choix assumé,
 * unique et versionnée (ADR-0019) — « ouvré » ne veut rien dire sans fenêtre
 * explicite ; les deux mesures (calendaire/ouvré) restent toujours distinctes.
 */
export const BUSINESS_WINDOW_START_HOUR_UTC = 8;
export const BUSINESS_WINDOW_END_HOUR_UTC = 18;

/** Un jour « ouvré » : lundi–vendredi (UTC). */
export function isBusinessDay(epochSeconds: number): boolean {
  const day = new Date(epochSeconds * 1000).getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Durée **calendaire** de traitement (8.4) : secondes écoulées, week-ends et
 * nuits compris — c'est l'unité de la cible « médiane sous 48 h calendaires ».
 */
export function calendarProcessingSeconds(openedAt: number, closedAt: number): number {
  if (closedAt < openedAt) {
    throw new DomainError("DISPUTE_NOT_RESOLVABLE", "Horodatage de cloture anterieur a l'ouverture");
  }
  return closedAt - openedAt;
}

/**
 * Durée **ouvrée** de traitement (8.4) : seules comptent les secondes passées
 * dans la fenêtre ouvrée (lundi–vendredi, 08:00–18:00 UTC). Résoudre lundi
 * 09:00 un litige ouvert samedi 09:00 vaut 48 h calendaires mais **0 h ouvrée**
 * ; la cible 8.4 (médiane 48 h) s'évalue en **calendaire**, l'effort réel du
 * responsable en **ouvré** — les deux chiffres sont publiés, jamais confondus.
 */
export function businessProcessingSeconds(openedAt: number, closedAt: number): number {
  const calendar = calendarProcessingSeconds(openedAt, closedAt);
  if (calendar === 0) return 0;
  let business = 0;
  for (let cursor = openedAt; cursor < closedAt; ) {
    // Tranche jusqu'à la fin du jour courant (minuit UTC) ou jusqu'à closedAt.
    const dayStart = Math.floor(cursor / 86400) * 86400;
    const dayEnd = dayStart + 86400;
    const sliceEnd = Math.min(dayEnd, closedAt);
    // Le jour ouvré est celui de la tranche (dayStart), pas du curseur : une
    // tranche qui se termine à minuit appartient au jour qu'elle couvre.
    if (isBusinessDay(dayStart)) {
      const windowStart = dayStart + BUSINESS_WINDOW_START_HOUR_UTC * 3600;
      const windowEnd = dayStart + BUSINESS_WINDOW_END_HOUR_UTC * 3600;
      const from = Math.max(cursor, windowStart);
      const to = Math.min(sliceEnd, windowEnd);
      if (to > from) business += to - from;
    }
    cursor = sliceEnd;
  }
  return business;
}
