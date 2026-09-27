/**
 * Circuit de changement de rôle A19 (C01) — nomination → acceptation du
 * nommé → demande de changement → approbation par un **approbateur distinct**.
 *
 * Origine : `ARCHITECTURE_CIBLE.md` §Démarrage et story A19. Le fondateur
 * **PROPOSE** une liste de fonctions ; les nommés **acceptent** ; la demande
 * est ensuite **approuvée par un tiers différent** du proposant et du nommé.
 * Aucun fondateur ne s'auto-approuve un droit universel : `role.change.approve`
 * est absent de sa matrice (cf. `authorization.ts`), et l'approbateur doit
 * détenir cette action ET être distinct.
 */
import { DomainError } from "./errors.js";
import { type Role } from "./authorization.js";

export const ROLE_REQUEST_STATES = [
  "nominated",
  "accepted",
  "declined",
  "approved",
  "rejected",
] as const;
export type RoleRequestState = (typeof ROLE_REQUEST_STATES)[number];

/** Rôles attribuables par le circuit (le fondateur n'est pas ré-attribué ici). */
export const ASSIGNABLE_ROLES: readonly Role[] = [
  "animator",
  "treasurer",
  "secretary",
  "auditor",
  "member",
];

export interface RoleChangeRequest {
  readonly requestId: string;
  readonly groupId: string;
  readonly targetIdentityId: string;
  readonly newRole: Role;
  /** Identité qui a proposé/ouvert la demande. */
  readonly proposedBy: string;
  readonly state: RoleRequestState;
  /** Identité ayant approuvé (une fois `approved`). */
  readonly approvedBy?: string;
}

/** Le nommé doit accepter sa nomination avant toute approbation. */
export function acceptNomination(
  req: RoleChangeRequest,
  nomineeIdentityId: string,
): RoleChangeRequest {
  if (req.state !== "nominated") {
    throw new DomainError("ROLE_ACCEPTANCE_REQUIRED", "Nomination déjà traitée");
  }
  if (nomineeIdentityId !== req.targetIdentityId) {
    // Seul le nommé peut accepter ; refus non divulguant.
    throw new DomainError("ROLE_ACCEPTANCE_REQUIRED", "Seul le nommé peut accepter");
  }
  return { ...req, state: "accepted" };
}

/**
 * Le circuit n'avance pas sans acceptation explicite du nommé : approuver un
 * dossier non accepté est refusé (jamais d'affectation silencieuse).
 */
export function assertAcceptedForApproval(req: RoleChangeRequest): void {
  if (req.state !== "accepted") {
    throw new DomainError("ROLE_ACCEPTANCE_REQUIRED", "Acceptation du nommé requise");
  }
}

/**
 * Garde d'approbation A19 : l'approbateur doit (a) exister, (b) être distinct
 * du proposant, (c) être distinct du nommé. La vérification que l'approbateur
 * DÉTIENT `role.change.approve` relève du RBAC (`can`), testée séparément.
 */
export function assertApproverDistinct(
  req: RoleChangeRequest,
  approverIdentityId: string,
): void {
  if (!approverIdentityId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "Approbateur requis");
  }
  if (
    approverIdentityId === req.proposedBy ||
    approverIdentityId === req.targetIdentityId
  ) {
    throw new DomainError(
      "APPROVER_NOT_DISTINCT",
      "L'approbateur doit être distinct du proposant et du nommé",
    );
  }
}

/** Applique l'approbation (après acceptation et distinction de l'approbateur). */
export function approveRoleChange(
  req: RoleChangeRequest,
  approverIdentityId: string,
): RoleChangeRequest {
  assertAcceptedForApproval(req);
  assertApproverDistinct(req, approverIdentityId);
  return { ...req, state: "approved", approvedBy: approverIdentityId };
}
