/**
 * Tests C01 — identité/adhésion et circuit de rôle A19 (logique pure,
 * indépendante de la persistance). Les preuves d'isolation/RLS/verrous en
 * base réelle sont livrées séparément et restent BLOCKED sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  type Membership,
  type RoleChangeRequest,
  transitionMembership,
  assertSingleActive,
  assertIdentityActiveInGroup,
  acceptNomination,
  assertApproverDistinct,
  approveRoleChange,
  can,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const mem = (over: Partial<Membership> = {}): Membership => ({
  membershipId: "mem_1",
  identityId: "idn_alice",
  groupId: "grpA",
  state: "pending",
  ...over,
});

describe("membership — machine à états", () => {
  it("pending → active sur acceptation", () => {
    expect(transitionMembership(mem(), "active").state).toBe("active");
  });
  it("refuse une réouverture depuis un état terminal", () => {
    const gone = mem({ state: "departed" });
    expect(codes(() => transitionMembership(gone, "active"))).toBe("MEMBERSHIP_STATE_INVALID");
  });
  it("active → revoked est permis, revoked → active non", () => {
    const revoked = transitionMembership(mem({ state: "active" }), "revoked");
    expect(revoked.state).toBe("revoked");
    expect(codes(() => transitionMembership(revoked, "active"))).toBe("MEMBERSHIP_STATE_INVALID");
  });
});

describe("membership — unicité active et garde d'action", () => {
  const active = mem({ state: "active" });
  it("une seconde adhésion active du même (groupe, identité) est refusée", () => {
    const second = mem({ membershipId: "mem_2", state: "active" });
    expect(codes(() => assertSingleActive([active], second))).toBe("MEMBERSHIP_ALREADY_ACTIVE");
  });
  it("un autre groupe peut avoir sa propre adhésion active", () => {
    const otherGroup = mem({ membershipId: "mem_9", groupId: "grpB", state: "active" });
    expect(codes(() => assertSingleActive([active], otherGroup))).toBeNull();
  });
  it("identité inactive/révoquée : refus non divulguant", () => {
    expect(codes(() => assertIdentityActiveInGroup([active], "idn_alice", "grpA"))).toBeNull();
    expect(codes(() => assertIdentityActiveInGroup([active], "idn_alice", "grpB"))).toBe(
      "IDENTITY_NOT_ACTIVE",
    );
    const revoked = mem({ state: "revoked" });
    expect(codes(() => assertIdentityActiveInGroup([revoked], "idn_alice", "grpA"))).toBe(
      "IDENTITY_NOT_ACTIVE",
    );
  });
});

const req = (over: Partial<RoleChangeRequest> = {}): RoleChangeRequest => ({
  requestId: "rc_1",
  groupId: "grpA",
  targetIdentityId: "idn_bob",
  newRole: "treasurer",
  proposedBy: "idn_founder",
  state: "nominated",
  ...over,
});

describe("role_change — circuit A19 (acceptation puis approbation distincte)", () => {
  it("le nommé accepte ; un autre que le nommé est refusé", () => {
    expect(acceptNomination(req(), "idn_bob").state).toBe("accepted");
    expect(codes(() => acceptNomination(req(), "idn_eve"))).toBe("ROLE_ACCEPTANCE_REQUIRED");
  });
  it("pas d'approbation sans acceptation préalable du nommé", () => {
    expect(codes(() => approveRoleChange(req(), "idn_auditor"))).toBe("ROLE_ACCEPTANCE_REQUIRED");
  });
  it("l'approbateur doit différer du proposant ET du nommé", () => {
    const accepted = acceptNomination(req(), "idn_bob");
    // proposant = idn_founder ; nommé = idn_bob
    expect(codes(() => assertApproverDistinct(accepted, "idn_founder"))).toBe("APPROVER_NOT_DISTINCT");
    expect(codes(() => assertApproverDistinct(accepted, "idn_bob"))).toBe("APPROVER_NOT_DISTINCT");
    const approved = approveRoleChange(accepted, "idn_auditor");
    expect(approved.state).toBe("approved");
    expect(approved.approvedBy).toBe("idn_auditor");
  });
  it("RBAC : l'auditeur approuve, le fondateur ne peut pas s'auto-approuver", () => {
    expect(can("auditor", "role.change.approve")).toBe(true);
    expect(can("founder", "role.change.approve")).toBe(false);
    expect(can("member", "role.change.approve")).toBe(false);
  });
});
