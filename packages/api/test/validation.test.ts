/**
 * Recette C07 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur : machine à états, indépendance (anti-collusion), rejet
 * avant validation seulement, compensation unique (C07-REVERSE), contestation
 * (fenêtre + blocage avant validation + gel des dépendances après validation).
 * Ne prétend PAS prouver la sérialisation concurrente réelle ni l'atomicité
 * événement/projection/outbox en base : contrat `0009_contribution_validation.sql`,
 * **BLOCKED** sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousValidationStore } from "../src/validationStore.js";

const json = { "content-type": "application/json" };
const WINDOW = 7 * 24 * 60 * 60;

function actorHeaders(role: string, identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return { "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }) };
}

function vHeaders(
  role: string,
  identityId: string,
  version: number,
  groupIds: readonly string[] = ["grpA"],
) {
  // Sans corps pour les commandes confirm/control/reject : pas de content-type
  // JSON forcé (Fastify refuse un corps vide avec content-type application/json).
  // Les appels à payload (compensation) passent un objet → JSON auto par inject.
  return { ...actorHeaders(role, identityId, groupIds), "if-match-version": String(version) };
}

function url(cid: string, action: string) {
  return `/v1/groups/grpA/contributions/${cid}/${action}`;
}

/** Seed d'une cotisation et construction de l'app sur un store dédié. */
function appWith(
  cid: string,
  declarant: string,
  requiredControllers = 0,
): { app: ReturnType<typeof buildApp>; store: FictitiousValidationStore } {
  const store = new FictitiousValidationStore();
  store.seedContribution(cid, "grpA", "obl1", 3000n, declarant, requiredControllers);
  return { app: buildApp({ validation: store }), store };
}

describe("C07-SELF — le déclarant ne peut confirmer sa propre déclaration (6.3, 6.4)", () => {
  it("trésorier se confirme lui-même → validation_accepted = false, aucune écriture", async () => {
    const { app, store } = appWith("c1", "idn_treasurer");
    const res = await app.inject({
      method: "POST",
      url: url("c1", "confirmations"),
      headers: vHeaders("treasurer", "idn_treasurer", 1),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ validationAccepted: false, reason: "SELF_DECLARANT" });
    expect(store.validatedEventCount("grpA")).toBe(0);
    const view = await app.inject({ method: "GET", url: url("c1", "x").replace("/x", ""), headers: actorHeaders("member", "idn_m1") });
    expect(view.json().state).toBe("declared");
  });

  it("confirmation par un acteur distinct et autorisé valide atomiquement", async () => {
    const { app, store } = appWith("c1", "idn_m1");
    const res = await app.inject({
      method: "POST",
      url: url("c1", "confirmations"),
      headers: vHeaders("treasurer", "idn_treasurer", 1),
    });
    expect(res.json()).toMatchObject({ validationAccepted: true, validationCompleted: true, state: "validated" });
    expect(store.validatedEventCount("grpA")).toBe(1);
  });
});

describe("C07-TRIPLE — un acteur ne cumule confirmer puis contrôler (6.3)", () => {
  it("le même qui a confirmé ne peut contrôler → validation_accepted = false", async () => {
    const { app, store } = appWith("c1", "idn_m1", 1);
    const confirm = await app.inject({
      method: "POST",
      url: url("c1", "confirmations"),
      headers: vHeaders("treasurer", "idn_t1", 1),
    });
    expect(confirm.json()).toMatchObject({ validationAccepted: true, validationCompleted: false, state: "confirmed" });
    // Le même acteur tente de contrôler (version courante = 2).
    const control = await app.inject({
      method: "POST",
      url: url("c1", "control"),
      headers: vHeaders("treasurer", "idn_t1", 2),
    });
    expect(control.json()).toMatchObject({ validationAccepted: false, reason: "ACTOR_ALREADY_ACTED" });
    expect(store.validatedEventCount("grpA")).toBe(0);
  });

  it("un contrôleur distinct parachève la validation", async () => {
    const { app, store } = appWith("c1", "idn_m1", 1);
    await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1) });
    const control = await app.inject({ method: "POST", url: url("c1", "control"), headers: vHeaders("treasurer", "idn_t2", 2) });
    expect(control.json()).toMatchObject({ validationAccepted: true, validationCompleted: true, state: "validated" });
    expect(store.validatedEventCount("grpA")).toBe(1);
  });
});

describe("C07 — rejet avant validation seulement (6.2)", () => {
  it("rejet d'une cotisation validée → 409, écriture conservée", async () => {
    const { app } = appWith("c1", "idn_m1");
    await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1) });
    const rej = await app.inject({ method: "POST", url: url("c1", "rejections"), headers: vHeaders("treasurer", "idn_t2", 2) });
    expect(rej.statusCode).toBe(409);
    expect(rej.json().code).toBe("CONTRIBUTION_STATE_INVALID");
  });
});

describe("C07-REVERSE — compensation unique de l'original (6.2, 6.6)", () => {
  it("deux compensations du même original → reversal_count = 1", async () => {
    const { app, store } = appWith("c1", "idn_m1");
    await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1) });
    const first = await app.inject({
      method: "POST",
      url: url("c1", "compensations"),
      headers: vHeaders("treasurer", "idn_t2", 2),
      payload: { reversalContributionId: "c1_rvs" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ reversalCount: 1, state: "compensated" });
    // Seconde course (version courante = 3) sur le même original.
    const second = await app.inject({
      method: "POST",
      url: url("c1", "compensations"),
      headers: vHeaders("treasurer", "idn_t3", 3),
      payload: { reversalContributionId: "c1_rvs2" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("CONTRIBUTION_ALREADY_COMPENSATED");
    expect(store.compensatedEventCount("grpA")).toBe(1);
    const view = await app.inject({ method: "GET", url: "/v1/groups/grpA/contributions/c1", headers: actorHeaders("member", "idn_m1") });
    expect(view.json()).toMatchObject({ reversalCount: 1, compensated: true, state: "compensated" });
  });
});

describe("C07 — contestation et fenêtre (6.5)", () => {
  it("un litige ouvert avant validation bloque la validation (409, sans écriture)", async () => {
    const { app, store } = appWith("c1", "idn_m1");
    const dsp = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/disputes",
      headers: { ...json, ...actorHeaders("member", "idn_m1") },
      payload: { disputeId: "d1", obligationId: "obl1", reason: "montant errone", category: "ordinary", notifiedAt: 1000, raisedAt: 1000 + WINDOW },
    });
    expect(dsp.statusCode).toBe(201);
    const confirm = await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1) });
    expect(confirm.statusCode).toBe(409);
    expect(confirm.json().code).toBe("VALIDATION_BLOCKED_BY_DISPUTE");
    expect(store.validatedEventCount("grpA")).toBe(0);
  });

  it("ordinaire hors fenêtre → 422 ; fraude hors fenêtre → toujours recevable", async () => {
    const { app } = appWith("c1", "idn_m1");
    const late = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/disputes",
      headers: { ...json, ...actorHeaders("member", "idn_m1") },
      payload: { disputeId: "d1", obligationId: "obl1", reason: "oubli", category: "ordinary", notifiedAt: 1000, raisedAt: 1000 + WINDOW + 1 },
    });
    expect(late.statusCode).toBe(422);
    expect(late.json().code).toBe("DISPUTE_WINDOW_CLOSED");
    const fraud = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/disputes",
      headers: { ...json, ...actorHeaders("member", "idn_m1") },
      payload: { disputeId: "d2", obligationId: "obl1", reason: "fraude", category: "fraud", notifiedAt: 1000, raisedAt: 1000 + WINDOW * 40 },
    });
    expect(fraud.statusCode).toBe(201);
  });

  it("après validation, un litige gèle les opérations dépendantes sans effacer", async () => {
    const { app } = appWith("c1", "idn_m1");
    await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1) });
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/disputes",
      headers: { ...json, ...actorHeaders("member", "idn_m1") },
      payload: { disputeId: "d1", obligationId: "obl1", reason: "litige", category: "ordinary", notifiedAt: 1000, raisedAt: 1000 + 10 },
    });
    const op = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/obligations/obl1/dependent-operation-attempts",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(op.statusCode).toBe(409);
    expect(op.json().code).toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
  });
});

describe("C07 — permission objet, anti-IDOR et concurrence optimiste (6.4, 14.1, 18.2)", () => {
  it("rôle sans droit de valider (member) → 403", async () => {
    const { app } = appWith("c1", "idn_m1");
    const res = await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("member", "idn_m2", 1) });
    expect(res.statusCode).toBe(403);
  });

  it("objet hors portée (groupIds vides) → 403", async () => {
    const { app } = appWith("c1", "idn_m1");
    const res = await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 1, []) });
    expect(res.statusCode).toBe(403);
  });

  it("version d'objet dépassée → 409 EVENT_CHAIN_BREAK, sans écriture", async () => {
    const { app, store } = appWith("c1", "idn_m1");
    const res = await app.inject({ method: "POST", url: url("c1", "confirmations"), headers: vHeaders("treasurer", "idn_t1", 99) });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EVENT_CHAIN_BREAK");
    expect(store.validatedEventCount("grpA")).toBe(0);
  });
});
