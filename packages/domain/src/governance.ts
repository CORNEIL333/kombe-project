/**
 * Gouvernance d'adhésion — invitations (4.1) et acceptation des règles (4.2)
 * (C03). Logique **pure**, horloge injectée, sans persistance.
 *
 * Invitation : **limitée** (nombre d'usages), **expirante**, **révocable**, et
 * ne **révèle pas le registre réel** avant adhésion — l'invité ne voit qu'une
 * vue publique minimale (4.1, 1.1 « invité limité aux fixtures »).
 *
 * Acceptation des règles : consentement **horodaté** à une **version exacte** ;
 * impossible de participer aux cotisations avant cette acceptation (4.2).
 */
import { DomainError } from "./errors.js";

export interface Invitation {
  readonly invitationId: string;
  readonly groupId: string;
  readonly maxUses: number;
  readonly usedCount: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}

export function issueInvitation(input: {
  invitationId: string;
  groupId: string;
  maxUses: number;
  now: number;
  ttlSeconds: number;
}): Invitation {
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1) {
    throw new DomainError("INVITATION_INVALID", "Nombre d'usages invalide");
  }
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1) {
    throw new DomainError("INVITATION_INVALID", "Durée d'invitation invalide");
  }
  return {
    invitationId: input.invitationId,
    groupId: input.groupId,
    maxUses: input.maxUses,
    usedCount: 0,
    issuedAt: input.now,
    expiresAt: input.now + input.ttlSeconds,
    revokedAt: null,
  };
}

export function revokeInvitation(inv: Invitation, now: number): Invitation {
  return inv.revokedAt === null ? { ...inv, revokedAt: now } : inv;
}

/**
 * Une invitation est utilisable si elle n'est pas révoquée, pas expirée et pas
 * épuisée. Toute autre réponse est une erreur **unique et non divulguante**
 * (pas de distinction expiré vs révoqué vs épuisé pour un observateur externe).
 */
export function assertInvitationRedeemable(inv: Invitation, now: number): void {
  if (inv.revokedAt !== null || now >= inv.expiresAt || inv.usedCount >= inv.maxUses) {
    throw new DomainError("INVITATION_INVALID", "Invitation non utilisable");
  }
}

/** Consomme un usage de l'invitation (après vérification de sa portée groupe). */
export function redeemInvitation(inv: Invitation, now: number): Invitation {
  assertInvitationRedeemable(inv, now);
  return { ...inv, usedCount: inv.usedCount + 1 };
}

/**
 * Vue publique d'une invitation AVANT adhésion : ne contient AUCUNE donnée du
 * registre réel (aucun membre, montant ni historique) — seulement le nom du
 * groupe (4.1). Le serveur ne renvoie jamais cette vue avec du contenu métier.
 */
export interface InvitationPublicView {
  readonly groupName: string;
  readonly revealsRegistry: false;
}
export function invitationPublicView(groupName: string): InvitationPublicView {
  return { groupName, revealsRegistry: false };
}

/** Acceptation horodatée d'une version EXACTE des règles (4.2). */
export interface RulesAcceptance {
  readonly identityId: string;
  readonly groupId: string;
  readonly rulesVersion: number;
  readonly acceptedAt: number;
}

export function acceptRules(
  identityId: string,
  groupId: string,
  rulesVersion: number,
  now: number,
): RulesAcceptance {
  if (!Number.isInteger(rulesVersion) || rulesVersion < 1) {
    throw new DomainError("RULES_NOT_ACCEPTED", "Version de règles invalide");
  }
  return { identityId, groupId, rulesVersion, acceptedAt: now };
}

/**
 * Garde de participation : une identité ne peut cotiser que si elle a accepté
 * la version COURANTE des règles du groupe. Une acceptation d'une version
 * périmée ne compte pas (4.2 « version exacte »).
 */
export function assertContributionAllowed(
  acceptances: readonly RulesAcceptance[],
  identityId: string,
  groupId: string,
  currentRulesVersion: number,
): void {
  const ok = acceptances.some(
    (a) =>
      a.identityId === identityId &&
      a.groupId === groupId &&
      a.rulesVersion === currentRulesVersion,
  );
  if (!ok) {
    throw new DomainError("RULES_NOT_ACCEPTED", "Acceptation des règles en vigueur requise");
  }
}

/** Tous les membres actifs ont-ils accepté la version courante ? (pour C03-BOOT). */
export function allMembersAccepted(
  acceptances: readonly RulesAcceptance[],
  activeMemberIdentityIds: readonly string[],
  groupId: string,
  currentRulesVersion: number,
): boolean {
  return activeMemberIdentityIds.every((id) =>
    acceptances.some(
      (a) => a.identityId === id && a.groupId === groupId && a.rulesVersion === currentRulesVersion,
    ),
  );
}
