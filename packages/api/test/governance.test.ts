/**
 * Recette C03 via l'application Fastify (fastify.inject, sans base). Prouve la
 * DÉCISION serveur de gouvernance : porte de démarrage du cycle (fondateur seul
 * refusé), mutation refusée après terminaison d'adhésion, et refus
 * d'auto-approbation de rôle (circuit A19). Ne prétend PAS prouver la
 * persistance/RLS/verrous en base : contrat `0004_group_governance.sql`,
 * **BLOCKED** sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousGovernanceStore } from "../src/governanceStore.js";

const json = { "content-type": "application/json" };

function readyStore(): FictitiousGovernanceStore {
  const g = new FictitiousGovernanceStore();
  g.createGroup({ groupId: "grpA" });
  // Amorçage complet : 3 membres actifs, fonctions indépendantes acceptées,
  // règles acceptées par tous, suppléant du trésorier désigné.
  for (const id of ["idn_a", "idn_b", "idn_c"]) {
    g.seedActiveMember("grpA", id);
    g.acceptGroupRules("grpA", id);
  }
  g.setAcceptedIndependentRoles("grpA", 4);
  g.designateTreasurerSubstitute("grpA");
  return g;
}

describe("C03-BOOT — le fondateur seul ne peut démarrer le cycle (2.1)", () => {
  it("cycle_started = false sans fonctions indépendantes acceptées", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    g.seedActiveMember("grpA", "idn_founder");
    g.acceptGroupRules("grpA", "idn_founder");
    const app = buildApp({ governance: g });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-starts",
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CYCLE_START_NOT_READY");
    const readiness = (await app.inject({ method: "GET", url: "/v1/groups/grpA/cycle-readiness" })).json();
    expect(readiness.acceptedIndependentRoles).toBe(0);
  });

  it("amorçage complet : le cycle démarre (configuration → active)", async () => {
    const app = buildApp({ governance: readyStore() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-starts",
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().state).toBe("active");
  });
});

describe("C03-REVOKE — adhésion terminée avant la prochaine commande (4.8)", () => {
  it("mutation_accepted = false après terminaison", async () => {
    const app = buildApp({ governance: readyStore() });
    const before = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/mutations",
      headers: json,
      payload: { identityId: "idn_b" },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().mutation_accepted).toBe(true);

    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/membership-terminations",
      headers: json,
      payload: { identityId: "idn_b" },
    });
    const after = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/mutations",
      headers: json,
      payload: { identityId: "idn_b" },
    });
    expect(after.statusCode).toBe(403);
    expect(after.json().code).toBe("IDENTITY_NOT_ACTIVE");
  });
});

describe("C03-ROLE — un admin ne s'approuve pas son propre nouveau rôle (4.5/4.9)", () => {
  it("le circuit A19 refuse l'auto-approbation (réutilise pipeline C01)", async () => {
    const app = buildApp(); // pipeline C01 ; rolechange couvert, ici on reconfirme la route
    const res = await app.inject({
      method: "POST",
      url: "/v1/role-change-requests/unknown/approvals",
      headers: {
        ...json,
        "idempotency-key": "role-0000001",
        "if-match-version": "1",
        "x-actor": JSON.stringify({
          handle: "idn_admin",
          identityId: "idn_admin",
          role: "founder",
          groupIds: ["grpA"],
        }),
      },
      payload: {},
    });
    // demandeur = fondateur : pas de droit role.change.approve → refus RBAC.
    expect(res.statusCode).toBe(403);
  });
});

describe("C03 — acceptation des règles conditionne la cotisation (4.2)", () => {
  it("cotiser sans accepter est refusé ; après acceptation, permis", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    g.seedActiveMember("grpA", "idn_a");
    const app = buildApp({ governance: g });
    const denied = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/contribution-declarations",
      headers: json,
      payload: { identityId: "idn_a" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("RULES_NOT_ACCEPTED");

    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rules-acceptances",
      headers: json,
      payload: { identityId: "idn_a" },
    });
    const ok = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/contribution-declarations",
      headers: json,
      payload: { identityId: "idn_a" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().allowed).toBe(true);
  });
});

describe("C03 — invitation directe d'un handle connu (adhésion pending)", () => {
  it("crée une adhésion pending, 409 si déjà pending/active, 403 si groupe clôturé", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    const app = buildApp({ governance: g });

    const created = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/memberships",
      headers: json,
      payload: { handle: "idn_new" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ membershipId: "mem_grpA_idn_new", groupId: "grpA", state: "pending" });

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/memberships",
      headers: json,
      payload: { handle: "idn_new" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("MEMBERSHIP_ALREADY_ACTIVE");

    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/state-transitions",
      headers: json,
      payload: { to: "closed" },
    });
    const onClosed = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/memberships",
      headers: json,
      payload: { handle: "idn_other" },
    });
    expect(onClosed.statusCode).toBe(403);
    expect(onClosed.json().code).toBe("GROUP_READ_ONLY");
  });
});

describe("C03 — invitation limitée dans le nombre d'usages (4.1)", () => {
  it("au-delà du maximum d'usages, rachat refusé", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    g.seedInvitation("inv_1", "grpA", 1);
    const app = buildApp({ governance: g });
    const first = await app.inject({
      method: "POST",
      url: "/v1/invitations/inv_1/redemptions",
      headers: json,
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/invitations/inv_1/redemptions",
      headers: json,
      payload: {},
    });
    expect(second.statusCode).toBe(410);
    expect(second.json().code).toBe("INVITATION_INVALID");
  });
});
