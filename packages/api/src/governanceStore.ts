/**
 * Store de gouvernance FICTIF en mémoire pour la recette du squelette C03. Il
 * héberge groupes, adhésions, invitations et acceptations de règles, et délègue
 * TOUTE décision aux fonctions pures de `@kombe/domain`. Comme les stores C00/
 * C01/C02, il ne prétend NI persister, NI verrouiller, NI isoler (RLS) : la
 * preuve base réelle (unicité d'une adhésion active, transitions gardées,
 * FK composites, RLS) est le contrat `0004_group_governance.sql` et reste
 * **BLOCKED** sans PostgreSQL. Horloge injectée (`setNow`).
 */
import {
  DomainError,
  transitionGroupState,
  assertGroupMutable,
  assertCycleStartable,
  allMembersAccepted,
  issueInvitation,
  redeemInvitation,
  acceptRules,
  assertContributionAllowed,
  transitionMembership,
  assertIdentityActiveInGroup,
  assertGroupDefaults,
  assertRotationTypeKnown,
  assertRotationTypeStartable,
  assertParentAssignable,
  modelPreset,
  CURRENCY,
  PILOT_TIMEZONE,
  requestSponsorship,
  decideSponsorship,
  type CycleReadiness,
  type GroupState,
  type Invitation,
  type Membership,
  type RulesAcceptance,
  type Sponsorship,
  type TontineModel,
  type RotationType,
} from "@kombe/domain";

interface GroupRecord {
  readonly groupId: string;
  state: GroupState;
  currentRulesVersion: number;
  minimumMembers: number;
  requiredIndependentRoles: number;
  acceptedIndependentRoles: number;
  treasurerSubstituteDesignated: boolean;
  displayName: string;
  tontineModel: TontineModel;
  rotationType: RotationType;
  currency: string;
  timezone: string;
  parentGroupId: string | null;
}

interface CreateGroupInput {
  groupId: string;
  displayName?: string | undefined;
  tontineModel?: TontineModel | undefined;
  rotationType?: RotationType | undefined;
  currency?: string | undefined;
  timezone?: string | undefined;
  parentGroupId?: string | undefined;
  minimumMembers?: number | undefined;
  requiredIndependentRoles?: number | undefined;
}

export class FictitiousGovernanceStore {
  private readonly groups = new Map<string, GroupRecord>();
  private readonly memberships = new Map<string, Membership>();
  private readonly acceptances: RulesAcceptance[] = [];
  private readonly invitations = new Map<string, Invitation>();
  private readonly sponsorships = new Map<string, Sponsorship>();
  private now = 1_700_000_000;

  setNow(now: number): void {
    this.now = now;
  }

  createGroup(input: CreateGroupInput): {
    state: GroupState;
    groupId: string;
    tontineModel: TontineModel;
    rotationType: RotationType;
  } {
    const currency = input.currency ?? CURRENCY;
    const timezone = input.timezone ?? PILOT_TIMEZONE;
    const rotationType = input.rotationType ?? "rotative_fermee";
    const tontineModel = input.tontineModel ?? "personnalise";
    // Garde d'amorçage (C03 §2.1-2.3), évaluée AVANT toute écriture : refus
    // serveur (jamais seulement UI) sur devise/fuseau non du pilote ou
    // typologie/modèle inconnus.
    assertGroupDefaults({ currency, timezone });
    assertRotationTypeKnown(rotationType);
    modelPreset(tontineModel);
    if (input.parentGroupId !== undefined) {
      const parent = this.groups.get(input.parentGroupId);
      if (!parent) throw new DomainError("GROUP_PARENT_UNKNOWN", "Groupe parent introuvable");
      assertParentAssignable({
        groupId: input.groupId,
        parentId: input.parentGroupId,
        ancestorIds: this.ancestorChain(input.parentGroupId),
      });
    }
    this.groups.set(input.groupId, {
      groupId: input.groupId,
      state: "configuration",
      currentRulesVersion: 1,
      minimumMembers: input.minimumMembers ?? 3,
      requiredIndependentRoles: input.requiredIndependentRoles ?? 4,
      acceptedIndependentRoles: 0,
      treasurerSubstituteDesignated: false,
      displayName: input.displayName ?? input.groupId,
      tontineModel,
      rotationType,
      currency,
      timezone,
      parentGroupId: input.parentGroupId ?? null,
    });
    return { state: "configuration", groupId: input.groupId, tontineModel, rotationType };
  }

  /** Chaîne d'ascendance (parents) du plus proche au plus lointain, anti-boucle. */
  private ancestorChain(groupId: string): string[] {
    const chain: string[] = [];
    let cur = this.groups.get(groupId)?.parentGroupId ?? null;
    while (cur && chain.length < 64) {
      chain.push(cur);
      cur = this.groups.get(cur)?.parentGroupId ?? null;
    }
    return chain;
  }

  private group(groupId: string): GroupRecord {
    const g = this.groups.get(groupId);
    if (!g) throw new DomainError("RESERVATION_INCOHERENTE", "Groupe introuvable");
    return g;
  }

  private activeMemberIds(groupId: string): string[] {
    return [...this.memberships.values()]
      .filter((m) => m.groupId === groupId && m.state === "active")
      .map((m) => m.identityId);
  }

  seedActiveMember(groupId: string, identityId: string, membershipId?: string): void {
    const mid = membershipId ?? `mem_${groupId}_${identityId}`;
    this.memberships.set(mid, {
      membershipId: mid,
      identityId,
      groupId,
      state: "active",
    });
  }

  setAcceptedIndependentRoles(groupId: string, n: number): void {
    this.group(groupId).acceptedIndependentRoles = n;
  }

  designateTreasurerSubstitute(groupId: string): void {
    this.group(groupId).treasurerSubstituteDesignated = true;
  }

  readiness(groupId: string): CycleReadiness {
    const g = this.group(groupId);
    const activeIds = this.activeMemberIds(groupId);
    return {
      groupState: g.state,
      acceptedIndependentRoles: g.acceptedIndependentRoles,
      requiredIndependentRoles: g.requiredIndependentRoles,
      rulesAcceptedByAllMembers: allMembersAccepted(
        this.acceptances,
        activeIds,
        groupId,
        g.currentRulesVersion,
      ),
      treasurerSubstituteDesignated: g.treasurerSubstituteDesignated,
      activeMembers: activeIds.length,
      minimumMembers: g.minimumMembers,
    };
  }

  /**
   * Démarre le cycle (2.1) : évalue la porte serveur ; si une condition manque
   * (fondateur seul), refuse (`CYCLE_START_NOT_READY`, C03-BOOT). Sinon passe le
   * groupe de `configuration` à `active`.
   */
  startCycle(groupId: string): { state: GroupState } {
    // Typologie P1 (tirage/négocié) : reconnue à la création mais non
    // démarrable au pilote — refus fermé (C03 §2.3, C05 §5.3).
    assertRotationTypeStartable(this.group(groupId).rotationType);
    assertCycleStartable(this.readiness(groupId));
    this.group(groupId).state = transitionGroupState(this.group(groupId).state, "active");
    return { state: "active" };
  }

  transition(groupId: string, to: GroupState): { state: GroupState } {
    const g = this.group(groupId);
    g.state = transitionGroupState(g.state, to);
    return { state: g.state };
  }

  /**
   * Sonde de mutation (C03-REVOKE) : la mutation n'est acceptée que si le
   * groupe est mutable ET si l'identité y a une adhésion ACTIVE. Une adhésion
   * terminée (departed/revoked) → refus `IDENTITY_NOT_ACTIVE`.
   */
  attemptMutation(groupId: string, identityId: string): { mutation_accepted: true } {
    assertGroupMutable(this.group(groupId).state);
    assertIdentityActiveInGroup([...this.memberships.values()], identityId, groupId);
    return { mutation_accepted: true };
  }

  /**
   * Invitation directe d'un membre connu (handle = identifiant logique fictif,
   * cf. `InviteMemberRequest` OpenAPI) : crée une adhésion `pending`, distincte
   * du rachat d'invitation anonyme (`redeemInvitation`). Un groupe en lecture
   * seule refuse (`GROUP_READ_ONLY`) ; une adhésion pending/active déjà
   * ouverte pour ce handle refuse (`MEMBERSHIP_ALREADY_ACTIVE`, pas de nouvelle
   * invitation tant que l'adhésion existante n'est pas close).
   */
  inviteMember(groupId: string, handle: string): { membershipId: string; groupId: string; state: Membership["state"] } {
    const g = this.group(groupId);
    assertGroupMutable(g.state);
    const membershipId = `mem_${groupId}_${handle}`;
    const existing = this.memberships.get(membershipId);
    if (existing && (existing.state === "pending" || existing.state === "active")) {
      throw new DomainError(
        "MEMBERSHIP_ALREADY_ACTIVE",
        "Une adhésion est déjà en cours pour cette identité",
      );
    }
    const membership: Membership = { membershipId, identityId: handle, groupId, state: "pending" };
    this.memberships.set(membershipId, membership);
    return { membershipId, groupId, state: membership.state };
  }

  terminateMembership(groupId: string, identityId: string): { state: Membership["state"] } {
    const entry = [...this.memberships.entries()].find(
      ([, m]) => m.groupId === groupId && m.identityId === identityId,
    );
    if (!entry) throw new DomainError("IDENTITY_NOT_ACTIVE", "Adhésion introuvable");
    const terminated = transitionMembership(entry[1], "revoked");
    this.memberships.set(terminated.membershipId, terminated);
    return { state: terminated.state };
  }

  acceptGroupRules(groupId: string, identityId: string): RulesAcceptance {
    const g = this.group(groupId);
    const acceptance = acceptRules(identityId, groupId, g.currentRulesVersion, this.now);
    this.acceptances.push(acceptance);
    return acceptance;
  }

  declareContribution(groupId: string, identityId: string): { allowed: true } {
    const g = this.group(groupId);
    assertContributionAllowed(this.acceptances, identityId, groupId, g.currentRulesVersion);
    return { allowed: true };
  }

  seedInvitation(invitationId: string, groupId: string, maxUses: number): void {
    this.invitations.set(
      invitationId,
      issueInvitation({ invitationId, groupId, maxUses, now: this.now, ttlSeconds: 3600 }),
    );
  }

  redeemInvitation(invitationId: string): { usedCount: number; groupId: string } {
    const inv = this.invitations.get(invitationId);
    if (!inv) throw new DomainError("INVITATION_INVALID", "Invitation inconnue");
    const next = redeemInvitation(inv, this.now);
    this.invitations.set(invitationId, next);
    return { usedCount: next.usedCount, groupId: next.groupId };
  }

  /* --- Parrainage / cooptation (le parrain doit être un membre actif réel) --- */

  requestSponsorship(input: {
    sponsorshipId: string;
    groupId: string;
    candidateId: string;
    sponsorId: string;
  }): Sponsorship {
    const g = this.group(input.groupId);
    assertGroupMutable(g.state);
    const open = [...this.sponsorships.values()].find(
      (s) => s.groupId === input.groupId && s.candidateId === input.candidateId && s.state === "requested",
    );
    if (open) throw new DomainError("SPONSORSHIP_ALREADY_OPEN", "Un parrainage est déjà ouvert pour ce candidat");
    const sponsorActive = this.memberships.get(`mem_${input.groupId}_${input.sponsorId}`)?.state === "active";
    const s = requestSponsorship({ ...input, sponsorIsActiveMember: sponsorActive, now: this.now });
    this.sponsorships.set(s.sponsorshipId, s);
    return s;
  }

  decideSponsorship(sponsorshipId: string, decision: "endorsed" | "rejected"): Sponsorship {
    const s = this.sponsorships.get(sponsorshipId);
    if (!s) throw new DomainError("SPONSORSHIP_STATE_INVALID", "Parrainage introuvable");
    const next = decideSponsorship(s, decision, this.now);
    this.sponsorships.set(sponsorshipId, next);
    return next;
  }

  /**
   * Vue publique des groupes découvrables : uniquement nom + modèle + typologie,
   * JAMAIS de registre réel (membres, montants, historique) avant adhésion (4.1).
   */
  listDiscoverable(): Array<{
    groupId: string;
    groupName: string;
    tontineModel: TontineModel;
    rotationType: RotationType;
    revealsRegistry: false;
  }> {
    return [...this.groups.values()].map((g) => ({
      groupId: g.groupId,
      groupName: g.displayName,
      tontineModel: g.tontineModel,
      rotationType: g.rotationType,
      revealsRegistry: false as const,
    }));
  }
}
