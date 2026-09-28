/**
 * Tests C03 — cycle de vie du groupe, porte de démarrage, invitations et
 * acceptation des règles (logique pure). Les preuves d'isolation/verrous en
 * base réelle relèvent du lot C03 d'exécution, BLOCKED sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  transitionGroupState,
  assertGroupMutable,
  isGroupReadOnly,
  assertCycleStartable,
  cycleStartable,
  type CycleReadiness,
  issueInvitation,
  redeemInvitation,
  revokeInvitation,
  assertInvitationRedeemable,
  invitationPublicView,
  acceptRules,
  assertContributionAllowed,
  allMembersAccepted,
  assertApproverDistinct,
  acceptNomination,
  type RoleChangeRequest,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const T0 = 1_700_000_000;

const ready = (over: Partial<CycleReadiness> = {}): CycleReadiness => ({
  groupState: "configuration",
  acceptedIndependentRoles: 4,
  requiredIndependentRoles: 4,
  rulesAcceptedByAllMembers: true,
  treasurerSubstituteDesignated: true,
  activeMembers: 5,
  minimumMembers: 3,
  ...over,
});

describe("group — cycle de vie (2.7)", () => {
  it("configuration → active est la transition de démarrage", () => {
    expect(transitionGroupState("configuration", "active")).toBe("active");
  });
  it("archived est terminal ; closed/archived sont en lecture seule", () => {
    expect(codes(() => transitionGroupState("archived", "active"))).toBe("GROUP_STATE_INVALID");
    expect(isGroupReadOnly("closed")).toBe(true);
    expect(isGroupReadOnly("archived")).toBe(true);
    expect(codes(() => assertGroupMutable("closed"))).toBe("GROUP_READ_ONLY");
  });
  it("on ne peut rouvrir un groupe clos directement en actif", () => {
    expect(codes(() => transitionGroupState("closed", "active"))).toBe("GROUP_STATE_INVALID");
  });
});

describe("group — porte de demarrage du cycle (C03-BOOT, 2.1)", () => {
  it("fondateur seul (aucune fonction independante acceptee) : refus", () => {
    expect(cycleStartable(ready({ acceptedIndependentRoles: 0 }))).toBe(false);
    expect(codes(() => assertCycleStartable(ready({ acceptedIndependentRoles: 0 }))))
      .toBe("CYCLE_START_NOT_READY");
  });
  it("chacune des cinq conditions manquante bloque le demarrage", () => {
    expect(codes(() => assertCycleStartable(ready({ groupState: "active" })))).toBe("CYCLE_START_NOT_READY");
    expect(codes(() => assertCycleStartable(ready({ activeMembers: 2 })))).toBe("CYCLE_START_NOT_READY");
    expect(codes(() => assertCycleStartable(ready({ rulesAcceptedByAllMembers: false })))).toBe("CYCLE_START_NOT_READY");
    expect(codes(() => assertCycleStartable(ready({ treasurerSubstituteDesignated: false })))).toBe("CYCLE_START_NOT_READY");
  });
  it("toutes les conditions reunies : demarrage permis", () => {
    expect(cycleStartable(ready())).toBe(true);
  });
});

describe("invitation — limitee, expirante, revocable, non revelatrice (4.1)", () => {
  const inv = () =>
    issueInvitation({ invitationId: "inv_1", groupId: "grpA", maxUses: 2, now: T0, ttlSeconds: 3600 });

  it(" consommee jusqu'au maximum puis refusee ", () => {
    let i = redeemInvitation(inv(), T0 + 10);
    i = redeemInvitation(i, T0 + 20);
    expect(codes(() => assertInvitationRedeemable(i, T0 + 30))).toBe("INVITATION_INVALID");
  });
  it("expirree ou revoquee : refus non divulguant (même code)", () => {
    expect(codes(() => assertInvitationRedeemable(inv(), T0 + 3600))).toBe("INVITATION_INVALID");
    const revoked = revokeInvitation(inv(), T0 + 5);
    expect(codes(() => assertInvitationRedeemable(revoked, T0 + 10))).toBe("INVITATION_INVALID");
  });
  it("la vue publique avant adhesion ne revele pas le registre", () => {
    expect(invitationPublicView("Famille Dupont")).toEqual({ groupName: "Famille Dupont", revealsRegistry: false });
  });
});

describe("rules acceptance — version exacte, participation conditionnee (4.2)", () => {
  it("cotiser sans accepter la version courante est refuse", () => {
    const stale = [acceptRules("idn_a", "grpA", 1, T0)];
    expect(codes(() => assertContributionAllowed(stale, "idn_a", "grpA", 2))).toBe("RULES_NOT_ACCEPTED");
    const current = [...stale, acceptRules("idn_a", "grpA", 2, T0 + 5)];
    expect(codes(() => assertContributionAllowed(current, "idn_a", "grpA", 2))).toBeNull();
  });
  it("tous-les-membres-ont-accepte pour la porte de demarrage", () => {
    const members = ["idn_a", "idn_b"];
    const acc = [acceptRules("idn_a", "grpA", 3, T0)];
    expect(allMembersAccepted(acc, members, "grpA", 3)).toBe(false);
    expect(allMembersAccepted([...acc, acceptRules("idn_b", "grpA", 3, T0)], members, "grpA", 3)).toBe(true);
  });
});

describe("separation des pouvoirs — un admin ne s'approuve pas soi-meme (C03-ROLE, 4.5)", () => {
  const req = (over: Partial<RoleChangeRequest> = {}): RoleChangeRequest => ({
    requestId: "rc_1",
    groupId: "grpA",
    targetIdentityId: "idn_admin",
    newRole: "treasurer",
    proposedBy: "idn_admin",
    state: "accepted",
    ...over,
  });
  it("auto-approbation (proposant == approbateur) refusee", () => {
    expect(codes(() => assertApproverDistinct(req(), "idn_admin"))).toBe("APPROVER_NOT_DISTINCT");
  });
  it("approbateur distinct du proposant et du nomme acceptee", () => {
    const accepted = acceptNomination({ ...req(), proposedBy: "idn_founder", state: "nominated" }, "idn_admin");
    expect(accepted.state).toBe("accepted");
    expect(codes(() => assertApproverDistinct(accepted, "idn_auditor"))).toBeNull();
  });
});
