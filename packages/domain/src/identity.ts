/**
 * Adhésion et identité — machine à états et invariants de portée (C01).
 *
 * Règle 14.1/14.2 : l'autorisation dépend d'une adhésion **active** dans le
 * groupe cible ; une identité révoquée ou départie ne peut plus agir, et ne
 * peut pas non plus apparaître dans un autre groupe via son identifiant.
 * Ces règles sont décidées **côté serveur** et testées en pur ici ; leur
 * application en base (contrainte d'unicité, RLS) est le contrat de
 * `packages/db/migrations` et sa **preuve base réelle**, BLOCKED sans
 * PostgreSQL.
 */
import { DomainError } from "./errors.js";

/** États d'une adhésion (miroir de la CHECK SQL `membership.state`). */
export const MEMBERSHIP_STATES = [
  "pending",
  "active",
  "departed",
  "revoked",
] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/**
 * Transitions autorisées. `departed` (départ volontaire) et `revoked`
 * (retrait par gouvernance) sont **terminaux** : une adhésion close ne se
 * rouvre pas, il faut une nouvelle invitation. `pending` → `active` sur
 * acceptation ; révocation possible depuis `pending` ou `active`.
 */
const TRANSITIONS: Readonly<Record<MembershipState, readonly MembershipState[]>> = {
  pending: ["active", "revoked"],
  active: ["departed", "revoked"],
  departed: [],
  revoked: [],
};

export interface Membership {
  readonly membershipId: string;
  readonly identityId: string;
  readonly groupId: string;
  readonly state: MembershipState;
}

export function isActiveMembership(m: Membership): boolean {
  return m.state === "active";
}

/** Applique une transition d'état, en refusant toute transition illégale. */
export function transitionMembership(m: Membership, to: MembershipState): Membership {
  if (!MEMBERSHIP_STATES.includes(to)) {
    throw new DomainError("MEMBERSHIP_STATE_INVALID", "État d'adhésion inconnu");
  }
  if (!TRANSITIONS[m.state].includes(to)) {
    throw new DomainError(
      "MEMBERSHIP_STATE_INVALID",
      "Transition d'adhésion non autorisée",
    );
  }
  return { ...m, state: to };
}

/**
 * Invariant d'unicité structurelle (miroir de l'index SQL `active_marker`) :
 * au plus UNE adhésion active par (groupe, identité). Tenter d'en activer une
 * seconde lève une erreur stable, sans divulguer l'autre adhésion.
 */
export function assertSingleActive(
  existing: readonly Membership[],
  candidate: Membership,
): void {
  if (candidate.state !== "active") return;
  const clash = existing.some(
    (m) =>
      m.groupId === candidate.groupId &&
      m.identityId === candidate.identityId &&
      m.state === "active" &&
      m.membershipId !== candidate.membershipId,
  );
  if (clash) {
    throw new DomainError(
      "MEMBERSHIP_ALREADY_ACTIVE",
      "Une adhésion active existe déjà pour ce groupe et cette identité",
    );
  }
}

/**
 * Garde d'action : une identité ne peut agir dans un groupe que si elle y a
 * une adhésion active. Sinon erreur non divulguante (même motif que objet
 * hors portée — pas de distinction inexistant vs révoqué vs non-membre).
 */
export function assertIdentityActiveInGroup(
  memberships: readonly Membership[],
  identityId: string,
  groupId: string,
): void {
  const active = memberships.some(
    (m) => m.identityId === identityId && m.groupId === groupId && m.state === "active",
  );
  if (!active) {
    throw new DomainError("IDENTITY_NOT_ACTIVE", "Identité sans adhésion active dans ce groupe");
  }
}
