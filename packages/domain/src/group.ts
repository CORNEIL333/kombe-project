/**
 * Cycle de vie du groupe et porte de démarrage du cycle (C03, stories 2.1,
 * 2.7 ; ARCHITECTURE_CIBLE §Démarrage). Logique **pure** sans persistance.
 *
 * Règle cardinale du pilote : **amorçage sans pouvoir financier**. Le cycle ne
 * démarre que lorsque (a) les fonctions indépendantes requises ont été **nommées
 * ET acceptées**, (b) les membres ont **accepté la version en vigueur des
 * règles**, et (c) un **suppléant** est prévu pour la cotisation du trésorier.
 * Le fondateur seul ne peut donc pas démarrer (scénario C03-BOOT :
 * `cycle_started = false`).
 */
import { DomainError } from "./errors.js";

/**
 * États du groupe (miroir élargi de la CHECK SQL `group.state`). `closed` et
 * `archived` sont en **lecture seule** ; `stopped_with_discrepancies` conserve
 * les obligations non résolues (2.7).
 */
export const GROUP_STATES = [
  "configuration",
  "active",
  "paused",
  "closed",
  "stopped_with_discrepancies",
  "archived",
] as const;
export type GroupState = (typeof GROUP_STATES)[number];

/**
 * Transitions autorisées. `configuration` ne va à `active` QUE via la porte de
 * démarrage (assertCycleStartable). Depuis `active`/`paused` on peut clôturer
 * ou marquer un arrêt avec écarts. `archived` est terminal.
 */
const GROUP_TRANSITIONS: Readonly<Record<GroupState, readonly GroupState[]>> = {
  configuration: ["active", "closed", "stopped_with_discrepancies"],
  active: ["paused", "closed", "stopped_with_discrepancies"],
  paused: ["active", "closed", "stopped_with_discrepancies"],
  stopped_with_discrepancies: ["closed", "archived"],
  closed: ["archived"],
  archived: [],
};

/** États de lecture seule : plus aucune mutation métier (2.7). */
export function isGroupReadOnly(state: GroupState): boolean {
  return state === "closed" || state === "archived";
}

/** Transition d'état du groupe ; refuse toute transition illégale. */
export function transitionGroupState(from: GroupState, to: GroupState): GroupState {
  if (!GROUP_TRANSITIONS[from].includes(to)) {
    throw new DomainError("GROUP_STATE_INVALID", "Transition d'état de groupe non autorisée");
  }
  return to;
}

/** Garde de mutation : un groupe clôturé/archivé rejette toute écriture. */
export function assertGroupMutable(state: GroupState): void {
  if (isGroupReadOnly(state)) {
    throw new DomainError("GROUP_READ_ONLY", "Groupe en lecture seule");
  }
}

/**
 * Préconditions évaluées pour démarrer le cycle. Ces faits sont agrégés
 * **côté serveur** à partir des nominations acceptées, des acceptations de
 * règles et des adhésions actives ; ils ne viennent jamais du client.
 */
export interface CycleReadiness {
  readonly groupState: GroupState;
  /** Nombre de fonctions indépendantes REQUISES effectivement acceptées. */
  readonly acceptedIndependentRoles: number;
  readonly requiredIndependentRoles: number;
  /** Tous les membres actifs ont accepté la version courante des règles. */
  readonly rulesAcceptedByAllMembers: boolean;
  /** Un suppléant est désigné pour la cotisation du trésorier (4.4). */
  readonly treasurerSubstituteDesignated: boolean;
  /** Membre minimum pour une rotation fermée (2.3, P0). */
  readonly activeMembers: number;
  readonly minimumMembers: number;
}

/**
 * Porte de démarrage du cycle. Lève `CYCLE_START_NOT_READY` si une condition
 * manque ; le cas « fondateur seul » (aucune fonction indépendante acceptée)
 * est refusé, ce qui observe `cycle_started = false` (C03-BOOT).
 */
export function assertCycleStartable(r: CycleReadiness): void {
  if (r.groupState !== "configuration") {
    throw new DomainError("CYCLE_START_NOT_READY", "Groupe non en configuration");
  }
  if (r.activeMembers < r.minimumMembers) {
    throw new DomainError("CYCLE_START_NOT_READY", "Effectif de membres actifs insuffisant");
  }
  if (r.acceptedIndependentRoles < r.requiredIndependentRoles) {
    throw new DomainError("CYCLE_START_NOT_READY", "Fonctions indépendantes non toutes acceptées");
  }
  if (!r.rulesAcceptedByAllMembers) {
    throw new DomainError("CYCLE_START_NOT_READY", "Règles non acceptées par tous les membres");
  }
  if (!r.treasurerSubstituteDesignated) {
    throw new DomainError("CYCLE_START_NOT_READY", "Suppléant du trésorier non désigné");
  }
}

/** Décision booléenne (sans lever) pour l'observation `cycle_started`. */
export function cycleStartable(r: CycleReadiness): boolean {
  try {
    assertCycleStartable(r);
    return true;
  } catch (e) {
    if (e instanceof DomainError) return false;
    throw e;
  }
}
