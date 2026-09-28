/**
 * Modèle d'identité, de rôles et d'autorisation objet (RBAC serveur).
 *
 * Le contrôle d'accès est décidé CÔTÉ SERVEUR : le RBAC n'est jamais délégué
 * à un JWT durable ni au client. Règle 14.1 (autorisation objet, anti-IDOR)
 * et 18.2 (version d'objet attendue, conflit explicite). RLS PostgreSQL est
 * une défense ADDITIONNELLE, testée en C01 sur base réelle, pas substituée.
 *
 * Démarrage des rôles (ARCHITECTURE_CIBLE §Démarrage) : le créateur invite et
 * PROPOSE une liste de fonctions ; les nommés acceptent ; aucun fondateur ne
 * s'accorde un droit d'approbation universel. Après démarrage, toute
 * modification passe par un circuit à approbateur distinct.
 */
import { DomainError } from "./errors.js";

export const ROLES = [
  "founder",
  "animator",
  "treasurer",
  "secretary",
  "auditor",
  "member",
] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "group.read",
  "member.invite",
  "role.nominate",
  "role.accept",
  "rules.accept",
  "contribution.declare",
  "contribution.validate",
  "disbursement.request",
  "disbursement.reverse",
  "vote.open",
  "vote.cast",
  "round.close",
  "dispute.raise",
  "dispute.resolve",
  "export.private",
  "role.change.approve",
  "journal.read",
  "journal.checkpoint",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Matrice rôles → actions. Aucune ligne n'accorde `role.change.approve` au
 * fondateur : le droit d'approbation universel est explicitement exclu.
 * Toute action absente de la liste d'un rôle est refusée par défaut.
 */
const MATRIX: Record<Role, readonly Action[]> = {
  founder: [
    "group.read",
    "member.invite",
    "role.nominate",
    "rules.accept",
    "vote.open",
    "vote.cast",
    "journal.read",
  ],
  animator: [
    "group.read",
    "member.invite",
    "role.nominate",
    "rules.accept",
    "vote.open",
    "vote.cast",
    "round.close",
    "journal.read",
  ],
  treasurer: [
    "group.read",
    "contribution.declare",
    "contribution.validate",
    "disbursement.request",
    "disbursement.reverse",
    "export.private",
    "journal.read",
    "journal.checkpoint",
  ],
  secretary: ["group.read", "vote.open", "export.private", "journal.read", "journal.checkpoint"],
  // L'auditeur est l'approbateur INDÉPENDANT du circuit A19 : il détient
  // `role.change.approve`, distinct du fondateur/animator qui proposent. Le
  // fondateur ne l'a jamais (auto-approbation universelle exclue).
  auditor: [
    "group.read",
    "export.private",
    "role.change.approve",
    "journal.read",
    "journal.checkpoint",
  ],
  member: [
    "group.read",
    "role.accept",
    "rules.accept",
    "contribution.declare",
    "vote.cast",
    "dispute.raise",
    "journal.read",
  ],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}

/** Autorisation d'un acteur unique pour une action. */
export function assertAllowed(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Action non autorisée pour ce rôle");
  }
}

/**
 * Garde anti-IDOR (14.1) : un acteur dont les groupes actifs ne contiennent
 * pas l'objet cible est refusé, SANS divulguer l'existence de l'objet.
 * Retourne true si l'accès intergroupe a été refusé.
 */
export function isCrossGroupAccess(
  actorGroupIds: readonly string[],
  targetGroupId: string,
): boolean {
  return !actorGroupIds.includes(targetGroupId);
}

/**
 * Concurrence optimiste (18.2) : une commande mutante sur un objet existant
 * doit porter la version attendue. En cas de dépassement, conflit explicite
 * — jamais d'écrasement silencieux.
 */
export function assertExpectedVersion(current: number, expected: number): void {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new DomainError("RESERVATION_INCOHERENTE", "Version attendue absente ou invalide");
  }
  if (expected !== current) {
    throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
  }
}
