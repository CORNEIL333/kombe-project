/**
 * C06 — Déclarations de cotisation à montants partiels et idempotence.
 *
 * Logique **pure**, testable sans PostgreSQL : la capacité sous verrou, la
 * résolution d'idempotence par hash de corps et la validation de déclaration.
 * Les preuves de **verrouillage réel**, de **sérialisation concurrente** et
 * d'**atomicité** événement/projection/outbox exigent PostgreSQL (BLOCKED tant
 * qu'aucune base réelle n'est raccordée — ADR-0007/ADR-0016).
 *
 * Contrats tenus (stories 6.1, 6.9, 18.1, 18.2, 18.3) :
 *  - montant XAF entier positif, obligation accessible, **date alléguée
 *    distincte de la date serveur** (6.1) ;
 *  - espèces sans référence admises ; **électronique sans référence exige un
 *    motif**, et une référence ne vaut jamais preuve authentifiée (6.1) ;
 *  - **capacité sous verrou = dû − réservations actives** (reposé sur l'oracle
 *    `remaining` de balance.ts), **restant dû affiché = dû − validé net**
 *    (18.3) ; plusieurs déclarations couvrent une obligation, **excédent
 *    bloqué**, aucune affectation automatique au tour suivant ;
 *  - **registre durable** acteur/groupe/type/clé avec **hash de corps** :
 *    même clé / même corps = **rejeu** du résultat d'origine sans second
 *    événement ; même clé / corps différent = **conflit 409** (18.1) ;
 *  - droits **relus avant** de servir un rejeu ; un cache expiré **ne recrée
 *    jamais** une exécution (l'idempotence naît du registre durable, pas d'un
 *    cache TTL). Cf. ARCHITECTURE_CIBLE §Commande, §« Sous verrou ».
 */
import { canonicalHash } from "./canonical.js";
import { DomainError } from "./errors.js";
import { perAmount } from "./money.js";
import { remaining } from "./balance.js";

/** Canal de la preuve de paiement. Une référence ne prouve pas l'authenticité. */
export type ContributionChannel = "cash" | "electronic";

/**
 * Déclaration soumise. `amountMinor` est un entier XAF (bigint, jamais un
 * float). `allegedDate` est la date **affirmée par le client** ; la date
 * **serveur** est injectée séparément au scellement (jamais dérivable d'ici).
 */
export interface ContributionDeclaration {
  readonly obligationId: string;
  readonly amountMinor: bigint;
  readonly channel: ContributionChannel;
  readonly reference?: string;
  readonly justification?: string;
  readonly allegedDate: string;
}

/**
 * Hash canonique RFC 8785 du **corps sémantique** de la déclaration. Deux
 * corps identiques donnent le même hash ; tout changement de montant, canal,
 * référence, motif ou date alléguée le change. Les propriétés optionnelles
 * absentes ne sont pas sérialisées (absent ≠ valeur).
 */
export function contributionBodyHash(decl: ContributionDeclaration): string {
  return canonicalHash({
    obligationId: decl.obligationId,
    amountMinor: decl.amountMinor,
    channel: decl.channel,
    ...(decl.reference !== undefined ? { reference: decl.reference } : {}),
    ...(decl.justification !== undefined ? { justification: decl.justification } : {}),
    allegedDate: decl.allegedDate,
  });
}

/**
 * Validation d'une déclaration (6.1) : montant entier positif sous plafond ;
 * canal électronique **sans référence exige un motif** non vide. Une référence
 * d'espèces est facultative ; la présence d'une référence n'authentifie jamais
 * la transaction externe (le registre l'enregistre comme affirmation).
 */
export function validateDeclaration(decl: ContributionDeclaration): void {
  perAmount(decl.amountMinor, { positive: true });
  if (decl.channel === "electronic" && !decl.reference) {
    if (!decl.justification || decl.justification.trim().length === 0) {
      throw new DomainError(
        "REFERENCE_JUSTIFICATION_REQUIRED",
        "Motif requis pour une preuve électronique sans référence",
      );
    }
  }
}

/* ── Idempotence par hash de corps (18.1) ─────────────────────────────────── */

/** Résultat mis en réserve dans le registre durable, rejouable à l'identique. */
export interface StoredCommandResult {
  readonly commandId: string;
  readonly status: "applied";
  readonly resultVersion: number;
  readonly eventHash: string;
}

/** Entrée durable du registre d'idempotence, scopée par acteur + groupe + type. */
export interface IdempotencyEntry {
  readonly actorIdentityId: string;
  readonly groupId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly bodyHash: string;
  readonly result: StoredCommandResult;
}

/** Décision d'idempotence avant exécution. */
export type IdempotencyOutcome =
  | { readonly kind: "execute" }
  | { readonly kind: "replay"; readonly result: StoredCommandResult }
  | { readonly kind: "conflict" };

/**
 * Résout une commande au regard du registre durable (18.1) :
 *  - aucune entrée → `execute` (première exécution) ;
 *  - même clé, **même hash de corps** → `replay` du résultat d'origine, sans
 *    second événement métier (résiste aux rejeux après timeout/coupure) ;
 *  - même clé, **corps différent** → `conflict` (l'appelant lève
 *    `IDEMPOTENCY_BODY_CONFLICT`, HTTP 409). Jamais d'écrasement silencieux.
 * La clé est scopée par acteur : un autre acteur réutilisant la même chaîne
 * n'atteint pas ce registre (traité en amont par le stockage scopé).
 */
export function decideIdempotency(
  existing: { readonly bodyHash: string; readonly result: StoredCommandResult } | undefined,
  incomingBodyHash: string,
): IdempotencyOutcome {
  if (!existing) return { kind: "execute" };
  if (existing.bodyHash === incomingBodyHash) {
    return { kind: "replay", result: existing.result };
  }
  return { kind: "conflict" };
}

/* ── Capacité sous verrou et partiels (18.3, 18.2) ────────────────────────── */

/**
 * État d'une obligation au moment du verrou : dû total, net validé (écritures
 * validées moins compensations) et réservations actives (déclarations en cours
 * non encore validées). En base, ces valeurs sont lues **sous verrou** (SELECT
 * … FOR UPDATE) ; ici elles sont passées en argument pour isoler la règle.
 */
export interface ObligationBalance {
  readonly due: bigint;
  readonly validatedNet: bigint;
  readonly activeReserved: bigint;
}

export interface ReservationOutcome {
  readonly accepted: bigint;
  readonly activeReserved: bigint;
  readonly remainingDue: bigint;
  readonly availableToDeclare: bigint;
}

/**
 * Réserve une déclaration partielle sous la capacité disponible (18.3) :
 *  - montant entier positif (sinon erreur money/rotation) ;
 *  - capacité = dû − réservations actives ; un montant **supérieur à la
 *    capacité** lève `CONTRIBUTION_EXCEEDS_REMAINING` (**excédent bloqué**,
 *    aucune affectation automatique au tour suivant) ;
 *  - le **restant dû affiché** naît du **validé net** (`due − validatedNet`),
 *    non des réservations ; la réservation n'efface aucune écriture existante.
 * Sous verrou réel, deux courses concurrentes sont sérialisées : la seconde ne
 * voit que la capacité restante après la première (scénario C06-RACE).
 */
export function reserveObligation(
  balance: ObligationBalance,
  amount: bigint,
): ReservationOutcome {
  perAmount(amount, { positive: true });
  const before = remaining(balance.due, balance.validatedNet, balance.activeReserved);
  if (amount > before.availableToDeclare) {
    throw new DomainError(
      "CONTRIBUTION_EXCEEDS_REMAINING",
      "Excédent bloqué : montant au-dessus du restant à déclarer",
    );
  }
  const activeReserved = balance.activeReserved + amount;
  const after = remaining(balance.due, balance.validatedNet, activeReserved);
  return Object.freeze({
    accepted: amount,
    activeReserved,
    remainingDue: after.remainingDue,
    availableToDeclare: after.availableToDeclare,
  });
}
