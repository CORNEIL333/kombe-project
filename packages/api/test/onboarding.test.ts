/**
 * Recette AMORÇAGE TONTINE (C03 §2.1-2.3, C05 §5.3, C21, parrainage) via
 * l'application Fastify (fastify.inject, mode fictif, sans base). Comble la
 * dérive produit signalée : le parcours ne proposait que « rejoindre » — ici on
 * prouve la décision SERVEUR de création (nom, modèle, typologie), de garde
 * fermée sur une typologie P1, de hiérarchie parent/enfant, de parrainage
 * (cooptation) et de découvrabilité. Ne prétend PAS prouver persistance/RLS :
 * contrat `0024_group_onboarding.sql`, voir pgOnboardingStore.proof.mjs.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousGovernanceStore } from "../src/governanceStore.js";

const json = { "content-type": "application/json" };

describe("Amorçage — créer une tontine avec modèle et typologie (2.1-2.3)", () => {
  it("POST /v1/groups accepte nom + modèle + typologie et les renvoie", async () => {
    const app = buildApp({ governance: new FictitiousGovernanceStore() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: json,
      payload: { groupId: "grpFam", displayName: "Tontine famille", tontineModel: "famille" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      state: "configuration",
      groupId: "grpFam",
      tontineModel: "famille",
      rotationType: "rotative_fermee",
    });
  });

  it("devise non du pilote refusée serveur (jamais seulement UI)", async () => {
    const app = buildApp({ governance: new FictitiousGovernanceStore() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: json,
      payload: { groupId: "grpUSD", currency: "USD" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("GROUP_CURRENCY_UNSUPPORTED");
  });
});

describe("Amorçage — typologie P1 reconnue à la création, non démarrable (2.3, C05 §5.3)", () => {
  it("« tirage » crée le groupe mais le démarrage du cycle échoue fermé", async () => {
    const g = new FictitiousGovernanceStore();
    const app = buildApp({ governance: g });
    const created = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: json,
      payload: { groupId: "grpTir", rotationType: "tirage" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().rotationType).toBe("tirage");

    // Amorçage complet (sans quoi la porte CYCLE_START NOT READY passe avant).
    for (const id of ["idn_a", "idn_b", "idn_c"]) {
      g.seedActiveMember("grpTir", id);
      g.acceptGroupRules("grpTir", id);
    }
    g.setAcceptedIndependentRoles("grpTir", 4);
    g.designateTreasurerSubstitute("grpTir");

    const start = await app.inject({
      method: "POST",
      url: "/v1/groups/grpTir/cycle-starts",
      headers: json,
      payload: {},
    });
    expect(start.statusCode).toBe(409);
    expect(start.json().code).toBe("ROTATION_TYPE_NOT_READY");
  });
});

describe("Amorçage — hiérarchie de supervision parent/enfant (C21)", () => {
  it("parent inconnu refusé", async () => {
    const app = buildApp({ governance: new FictitiousGovernanceStore() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: json,
      payload: { groupId: "grpChild", parentGroupId: "grpGhost" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("GROUP_PARENT_UNKNOWN");
  });

  it("enfant rattaché à un parent existant accepté", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpParent" });
    const app = buildApp({ governance: g });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups",
      headers: json,
      payload: { groupId: "grpChild", parentGroupId: "grpParent" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("Amorçage — parrainage / cooptation (rejoindre sous caution d'un membre)", () => {
  it("parrain non membre actif → refus serveur", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    const app = buildApp({ governance: g });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/sponsorships",
      headers: json,
      payload: { sponsorshipId: "sp_1", candidateId: "idn_cand", sponsorId: "idn_ghost" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("SPONSOR_NOT_ACTIVE_MEMBER");
  });

  it("parrain actif → demande ouverte, puis décision endossée", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA" });
    g.seedActiveMember("grpA", "idn_sponsor");
    const app = buildApp({ governance: g });
    const created = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/sponsorships",
      headers: json,
      payload: { sponsorshipId: "sp_1", candidateId: "idn_cand", sponsorId: "idn_sponsor" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().state).toBe("requested");

    const dupe = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/sponsorships",
      headers: json,
      payload: { sponsorshipId: "sp_2", candidateId: "idn_cand", sponsorId: "idn_sponsor" },
    });
    expect(dupe.statusCode).toBe(409);
    expect(dupe.json().code).toBe("SPONSORSHIP_ALREADY_OPEN");

    const decided = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/sponsorships/sp_1/decision",
      headers: json,
      payload: { decision: "endorsed" },
    });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().state).toBe("endorsed");
  });
});

describe("Amorçage — découvrabilité sans registre réel (4.1)", () => {
  it("liste des groupes : vue minimale, jamais de registre", async () => {
    const g = new FictitiousGovernanceStore();
    g.createGroup({ groupId: "grpA", displayName: "Tontine A", tontineModel: "collegues" });
    const app = buildApp({ governance: g });
    const res = await app.inject({ method: "GET", url: "/v1/discoverable-groups" });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      groupId: "grpA",
      groupName: "Tontine A",
      tontineModel: "collegues",
      rotationType: "rotative_fermee",
      revealsRegistry: false,
    });
  });
});
