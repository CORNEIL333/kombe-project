/**
 * Moteur de règles versionnées et acceptations (C04 ; stories 3.1–3.7, 6.7).
 * Logique **pure**, horloge injectée, sans persistance. Montants bigints bornés
 * (`money`/`perAmount`), versions **immuables** identifiées par un hash
 * canonique RFC 8785 (`canonicalHash`), engagements **non rétroactifs**.
 *
 * Invariants cardinaux du pilote :
 * - rotation égale, **une part** par membre → `rounds === memberCount` ;
 * - **pénalités désactivées** au pilote : le serveur normalise `penaltyEnabled`
 *   à `false` quelle que soit la demande client (C04-PENALTY) ;
 * - une nouvelle règle ne **réécrit aucune échéance passée** (C04-RETRO) ;
 * - un engagement financier **essentiel** ne s'applique qu'au **cycle suivant**,
 *   sauf acceptation explicite de **toutes** les personnes concernées
 *   (C04-ACCEPT : un refus ⇒ `new_rule_executed = false`) ;
 * - chaque acceptation porte sur le **hash exact** de la version publiée.
 *
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md §Snapshot de règles ; ADR-0003 (hash
 * canonique), ADR-0002 (monnaie), ADR-0005 (barrières serveur du pilote).
 */
import { DomainError } from "./errors.js";
import { canonicalHash } from "./canonical.js";
import { perAmount } from "./money.js";

export const FREQUENCIES = ["monthly", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** Paramétrage de vote versionné (quorum, grâce) — cf. vote.ts pour l'oracle. */
export interface QuorumParams {
  readonly numerator: number;
  readonly denominator: number;
}

/** Schéma canonique d'un jeu de règles (instantané immuable). */
export interface RuleSet {
  readonly memberCount: number;
  readonly contribution: bigint; // XAF entier, borné
  readonly rounds: number; // pilote : === memberCount (une part)
  readonly frequency: Frequency;
  readonly dueDay: number; // quantième mensuel (borné au mois réel en C05)
  readonly quorum: QuorumParams;
  readonly gracePeriodDays: number; // P1 : borné, versionné, accepté
  readonly penaltyEnabled: boolean; // FORCÉ false au pilote
}

/**
 * Valide et normalise un jeu de règles pour l'exécution visée. Au pilote
 * (`pilot = true`), les pénalités sont **imposablement fermées** et une part par
 * membre est exigée (`rounds === memberCount`). Aucune valeur n'est déduite
 * d'un prompt : tout est vérifié ici.
 */
export function compileRuleSet(input: RuleSet, opts: { pilot: boolean }): RuleSet {
  if (!Number.isInteger(input.memberCount) || input.memberCount < 2) {
    throw new DomainError("RULE_INVALID", "Nombre de membres invalide");
  }
  if (!Number.isInteger(input.rounds) || input.rounds < 1) {
    throw new DomainError("RULE_INVALID", "Nombre de tours invalide");
  }
  perAmount(input.contribution, { positive: true });
  if (!FREQUENCIES.includes(input.frequency)) {
    throw new DomainError("RULE_INVALID", "Fréquence invalide");
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new DomainError("RULE_INVALID", "Quantième d'échéance invalide");
  }
  const { numerator, denominator } = input.quorum;
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    denominator < 1 ||
    numerator < 1 ||
    numerator > denominator
  ) {
    throw new DomainError("RULE_INVALID", "Quorum invalide");
  }
  if (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0) {
    throw new DomainError("RULE_INVALID", "Période de grâce invalide");
  }
  if (opts.pilot && input.rounds !== input.memberCount) {
    throw new DomainError("RULE_INVALID", "Pilote : une part par membre (rounds == memberCount)");
  }
  return {
    ...input,
    // Barrière serveur : la demande client d'activer les pénalités est ignorée.
    penaltyEnabled: opts.pilot ? false : input.penaltyEnabled,
  };
}

/** Version publiée, immuable, identifiée par le hash canonique de son instantané. */
export interface PublishedRule {
  readonly version: number;
  readonly groupId: string;
  readonly snapshot: RuleSet;
  readonly hash: string;
  readonly publishedAt: number;
  readonly supersedes: number | null;
}

/** Publie une version : le hash canonique scelle l'instantané (immuabilité). */
export function publishRule(input: {
  version: number;
  groupId: string;
  snapshot: RuleSet;
  publishedAt: number;
  supersedes?: number | null;
}): PublishedRule {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new DomainError("RULE_INVALID", "Version invalide");
  }
  const snapshot = freezeRuleSet(input.snapshot);
  return Object.freeze({
    version: input.version,
    groupId: input.groupId,
    snapshot,
    hash: canonicalHash(snapshot),
    publishedAt: input.publishedAt,
    supersedes: input.supersedes ?? null,
  });
}

function freezeRuleSet(s: RuleSet): RuleSet {
  return Object.freeze({ ...s, quorum: Object.freeze({ ...s.quorum }) });
}

/**
 * Une version publiée ne peut être modifiée : produire un nouvel instantané
 * revient à créer une nouvelle version (`supersedes`). Tenter d'altérer
 * l'instantané d'une version existante est une erreur d'usage explicite.
 */
export function assertVersionImmutable(published: PublishedRule, candidateSnapshot: RuleSet): void {
  if (canonicalHash(candidateSnapshot) !== published.hash) {
    throw new DomainError("RULE_VERSION_IMMUTABLE", "Version de règle immuable");
  }
}

/** Acceptation horodatée portant sur le hash EXACT d'une version publiée. */
export interface RuleAcceptance {
  readonly identityId: string;
  readonly groupId: string;
  readonly version: number;
  readonly hash: string;
  readonly acceptedAt: number;
}

export function acceptRuleVersion(
  published: PublishedRule,
  identityId: string,
  expectedHash: string,
  acceptedAt: number,
): RuleAcceptance {
  if (expectedHash !== published.hash) {
    // Le consentement doit porter sur la version exacte ; jamais un hash approximé.
    throw new DomainError("RULE_ACCEPT_HASH_MISMATCH", "Acceptation sur hash exact requise");
  }
  return Object.freeze({
    identityId,
    groupId: published.groupId,
    version: published.version,
    hash: published.hash,
    acceptedAt,
  });
}

/** Un changement financier essentiel touche ce qui est dû (montants/effectif/tours). */
export function isEssentialFinancialChange(prev: RuleSet, next: RuleSet): boolean {
  return prev.contribution !== next.contribution || prev.memberCount !== next.memberCount || prev.rounds !== next.rounds;
}

export interface ChangePlan {
  readonly essential: boolean;
  readonly appliesTo: "next_cycle" | "immediate";
  readonly requiresAllConcernedAcceptance: boolean;
}

/**
 * Plan d'application d'un changement de règle (3.7) : un engagement financier
 * essentiel s'applique au **cycle suivant** par défaut ; il n'est immédiat que
 * sur acceptation explicite de **toutes** les personnes concernées.
 */
export function planRuleChange(prev: RuleSet, next: RuleSet): ChangePlan {
  const essential = isEssentialFinancialChange(prev, next);
  return {
    essential,
    appliesTo: essential ? "next_cycle" : "immediate",
    requiresAllConcernedAcceptance: essential,
  };
}

/**
 * Une nouvelle règle essentielle n'est exécutée que si chaque personne
 * concernée a accepté la version exacte. Un seul refus ⇒ non exécutée
 * (C04-ACCEPT : `new_rule_executed = false`), la règle courante reste en vigueur.
 */
export function newRuleEffective(
  plan: ChangePlan,
  acceptances: readonly RuleAcceptance[],
  newVersion: number,
  allConcerned: readonly string[],
): boolean {
  if (!plan.requiresAllConcernedAcceptance) return true;
  return allConcerned.every((id) =>
    acceptances.some((a) => a.identityId === id && a.version === newVersion),
  );
}

/** Échéance déjà matérialisée pour le cycle courant (obligation unique membre/tour). */
export interface ExistingDue {
  readonly obligationId: string;
  readonly dueAtMs: number; // instant UTC de l'échéance
  readonly amount: bigint;
}

/**
 * Garde de non-rétroactivité (C04-RETRO) : comparer l'état des échéances avant
 * et après application d'une nouvelle règle ; toute modification d'une échéance
 * **déjà passée** (`dueAtMs < nowMs`) est refusée (`RULE_RETROACTIVE`). Les
 * échéances futures peuvent évoluer. Renvoie les seules échéances inchangées
 * dans le passé, garantissant `past_due_changed = false`.
 */
export function assertNonRetroactive(
  before: readonly ExistingDue[],
  after: readonly ExistingDue[],
  nowMs: number,
): void {
  const beforeById = new Map(before.map((d) => [d.obligationId, d]));
  for (const now of after) {
    const old = beforeById.get(now.obligationId);
    if (!old) continue; // nouvelle échéance future : non rétroactive
    const wasPast = old.dueAtMs < nowMs;
    const changed = old.dueAtMs !== now.dueAtMs || old.amount !== now.amount;
    if (wasPast && changed) {
      throw new DomainError("RULE_RETROACTIVE", "Une échéance passée ne peut être modifiée");
    }
  }
}

/**
 * Demande d'activation des pénalités (3.3). Au pilote, la réponse est **toujours**
 * `penalty_enabled = false` : la demande est refusée, aucune valeur imposée.
 * La fonction n'est pas une exécution financière — simple décision de garde.
 */
export function requestPenaltyEnabled(
  desired: boolean,
  pilot: boolean,
): { readonly requested: boolean; readonly penalty_enabled: boolean; readonly rejected: boolean } {
  const penalty_enabled = pilot ? false : desired;
  return { requested: desired, penalty_enabled, rejected: desired && !penalty_enabled };
}
