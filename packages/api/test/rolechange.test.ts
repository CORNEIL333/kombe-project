/**
 * Recette C01 du circuit A19 via la chaîne de commande (fastify.inject, sans
 * base). Prouve la DÉCISION serveur : acceptation par le nommé, approbation
 * par un auditeur distinct, refus de self-approval, refus hors-portée (IDOR),
 * refus avant acceptation, conflit de version. Ne prouve PAS l'isolation RLS
 * ni les verrous (PostgreSQL réel, BLOCKED sur cet hôte).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousCommandStore } from "../src/commandPipeline.js";
import type { RoleChangeRequest } from "@kombe/domain";

function appWithRole(state: RoleChangeRequest["state"], over: Partial<RoleChangeRequest> = {}) {
  const store = new FictitiousCommandStore();
  store.seedRoleRequest({
    requestId: "rc_1",
    groupId: "grpA",
    targetIdentityId: "idn_bob",
    newRole: "treasurer",
    proposedBy: "idn_founder",
    state,
    ...over,
  });
  return buildApp({ store });
}

const actor = (identityId: string, role: string, groupIds: string[]) =>
  JSON.stringify({ handle: identityId, identityId, role, groupIds });

function post(app: ReturnType<typeof buildApp>, url: string, idem: string, version: string, xActor: string) {
  return app.inject({
    method: "POST",
    url,
    payload: {},
    headers: {
      "content-type": "application/json",
      "idempotency-key": idem,
      "if-match-version": version,
      "x-actor": xActor,
    },
  });
}

describe("A19 acceptation de nomination", () => {
  it("le nommé accepte sa nomination (rôle member, groupe actif)", async () => {
    const app = appWithRole("nominated");
    const res = await post(
      app,
      "/v1/role-nominations/rc_1/acceptances",
      "acc-00000001",
      "1",
      actor("idn_bob", "member", ["grpA"]),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().resultVersion).toBe(2);
  });
  it("un autre que le nommé ne peut accepter (non-divulgation)", async () => {
    const app = appWithRole("nominated");
    const res = await post(
      app,
      "/v1/role-nominations/rc_1/acceptances",
      "acc-00000002",
      "1",
      actor("idn_eve", "member", ["grpA"]),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ROLE_ACCEPTANCE_REQUIRED");
  });
});

describe("A19 approbation par un approbateur distinct", () => {
  it("l'auditeur distinct approuve une demande acceptée", async () => {
    const app = appWithRole("accepted");
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000001",
      "1",
      actor("idn_auditor", "auditor", ["grpA"]),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().journalEventHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("le fondateur ne peut approuver (rôle sans droit)", async () => {
    const app = appWithRole("accepted");
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000002",
      "1",
      actor("idn_founder", "founder", ["grpA"]),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });
  it("approbateur == proposant → refus APPROVER_NOT_DISTINCT", async () => {
    const app = appWithRole("accepted", { proposedBy: "idn_auditor" });
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000003",
      "1",
      actor("idn_auditor", "auditor", ["grpA"]),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("APPROVER_NOT_DISTINCT");
  });
  it("approbateur hors du groupe → refus anti-IDOR, aucun effet", async () => {
    const app = appWithRole("accepted");
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000004",
      "1",
      actor("idn_auditor", "auditor", ["grpB"]),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
    // Non-effet : la même commande depuis le bon groupe passe encore (version 1 intacte).
    const ok = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000005",
      "1",
      actor("idn_auditor", "auditor", ["grpA"]),
    );
    expect(ok.statusCode).toBe(201);
  });
  it("pas d'approbation avant acceptation (état nominated)", async () => {
    const app = appWithRole("nominated");
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000006",
      "1",
      actor("idn_auditor", "auditor", ["grpA"]),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ROLE_ACCEPTANCE_REQUIRED");
  });
  it("version d'objet dépassée → conflit explicite", async () => {
    const app = appWithRole("accepted");
    const res = await post(
      app,
      "/v1/role-change-requests/rc_1/approvals",
      "apr-00000007",
      "99",
      actor("idn_auditor", "auditor", ["grpA"]),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EVENT_CHAIN_BREAK");
  });
});
