/**
 * Recette C08 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur du circuit de décaissement : séparation des pouvoirs (le
 * bénéficiaire ne déclare pas le sien), confirmation par le bénéficiaire seul,
 * contrôle distinct/indépendant, **contre-écriture unique** d'une correction
 * (C08-CORRECTION), rapprochement adossé à l'**oracle indépendant** (C08-BALANCE
 * / C08-GAP) dont TOUTES les entrées de décision sont DÉTENUES SERVEUR (le
 * client ne peut ni forcer une clôture ni masquer un écart), permission objet,
 * anti-IDOR sur les lectures et concurrence optimiste sur les mutations. Chaque
 * refus est aussi vérifié par **absence d'écriture** (compteur d'événements
 * scellés).
 * Ne prétend PAS prouver la sérialisation concurrente réelle sous verrou ni
 * l'atomicité événement/projection/outbox en base : contrat SQL `disbursement`,
 * **BLOCKED** sans PostgreSQL (ADR-0007 / ADR-0016 / ADR-0018).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousDisbursementStore } from "../src/disbursementStore.js";

const json = { "content-type": "application/json" };

function actorHeaders(role: string, identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return { "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }) };
}

function dHeaders(
  role: string,
  identityId: string,
  version: number,
  groupIds: readonly string[] = ["grpA"],
) {
  return { ...actorHeaders(role, identityId, groupIds), "if-match-version": String(version) };
}

const base = "/v1/groups/grpA/disbursements";

function appWithStore(store: FictitiousDisbursementStore) {
  return buildApp({ disbursements: store });
}

function declarePayload(over: Record<string, unknown> = {}) {
  return {
    disbursementId: "d1",
    roundId: "r1",
    obligationId: "g1_r1_b2",
    beneficiaryIdentityId: "idn_benef",
    netAmount: "49000",
    groupFees: "1000",
    requiredControllers: 0,
    allegedDate: 1000,
    ...over,
  };
}

/** Mène un décaissement à `completed` via les vraies commandes HTTP. */
async function toCompleted(
  app: ReturnType<typeof buildApp>,
  id: string,
  requiredControllers = 0,
  over: Record<string, unknown> = {},
): Promise<number> {
  await app.inject({
    method: "POST",
    url: base,
    headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
    payload: declarePayload({ disbursementId: id, requiredControllers, ...over }),
  });
  const confirm = await app.inject({
    method: "POST",
    url: `${base}/${id}/confirmations`,
    headers: dHeaders("member", "idn_benef", 1),
  });
  return confirm.json().version as number;
}

describe("C08 — déclaration et séparation des pouvoirs (6.10)", () => {
  it("trésorier déclare un décaissement pour autrui → 201, requested, jamais remboursé", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      state: "requested",
      declarantIdentityId: "idn_treasurer",
      reversalCount: 0,
      refundedExternally: false,
      version: 1,
    });
    expect(store.eventCount("grpA", "disbursement.requested")).toBe(1);
  });

  it("un membre sans droit de déclarer un décaissement → 403, aucune écriture", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("member", "idn_benef") },
      payload: declarePayload({ beneficiaryIdentityId: "idn_m2" }),
    });
    expect(res.statusCode).toBe(403);
    expect(store.eventCount("grpA", "disbursement.requested")).toBe(0);
  });

  it("le bénéficiaire ne peut déclarer son propre décaissement → 422 suppléant requis", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload({ beneficiaryIdentityId: "idn_treasurer" }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("DISBURSEMENT_SUBSTITUTE_REQUIRED");
  });

  it("objet hors portée (groupIds vides) → 403", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer", []) },
      payload: declarePayload(),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("C08 — confirmation et contrôle (6.10)", () => {
  it("un acteur autre que le bénéficiaire ne confirme pas → refus sans écriture", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload(),
    });
    const res = await app.inject({
      method: "POST",
      url: `${base}/d1/confirmations`,
      headers: dHeaders("member", "idn_quelquun", 1),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ actAccepted: false, reason: "NOT_BENEFICIARY", state: "requested" });
    expect(store.eventCount("grpA", "disbursement.completed")).toBe(0);
  });

  it("confirmation du bénéficiaire parachève si aucun contrôleur requis", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0);
    expect(store.eventCount("grpA", "disbursement.completed")).toBe(1);
    const view = await app.inject({
      method: "GET",
      url: `${base}/d1`,
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(view.json()).toMatchObject({ state: "completed", beneficiaryConfirmedBy: "idn_benef" });
  });

  it("contrôle du déclarant ou du bénéficiaire est refusé (non indépendant)", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload({ requiredControllers: 1 }),
    });
    await app.inject({ method: "POST", url: `${base}/d1/confirmations`, headers: dHeaders("member", "idn_benef", 1) });
    const byDeclarant = await app.inject({
      method: "POST",
      url: `${base}/d1/control`,
      headers: dHeaders("treasurer", "idn_treasurer", 2),
    });
    expect(byDeclarant.json()).toMatchObject({ actAccepted: false, reason: "NOT_INDEPENDENT" });
    const byBenef = await app.inject({
      method: "POST",
      url: `${base}/d1/control`,
      headers: dHeaders("member", "idn_benef", 2),
    });
    expect(byBenef.json()).toMatchObject({ actAccepted: false, reason: "NOT_INDEPENDENT" });
  });

  it("un contrôleur distinct parachève au seuil", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload({ requiredControllers: 1 }),
    });
    await app.inject({ method: "POST", url: `${base}/d1/confirmations`, headers: dHeaders("member", "idn_benef", 1) });
    const control = await app.inject({
      method: "POST",
      url: `${base}/d1/control`,
      headers: dHeaders("treasurer", "idn_treas2", 2),
    });
    expect(control.json()).toMatchObject({ actAccepted: true, completed: true, state: "completed" });
    expect(store.eventCount("grpA", "disbursement.completed")).toBe(1);
  });
});

describe("C08-CORRECTION — contre-écriture unique d'un décaissement achevé (6.10, 18.9)", () => {
  it("demander puis approuver (indépendant) reverse une fois ; seconde course → 409", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    const versionAfterConfirm = await toCompleted(app, "d1", 0); // → v2, completed
    const req = await app.inject({
      method: "POST",
      url: `${base}/d1/reversal-requests`,
      headers: { ...json, ...dHeaders("treasurer", "idn_treasurer", versionAfterConfirm) },
      payload: { reason: "montant errone" },
    });
    expect(req.statusCode).toBe(200);
    expect(req.json()).toMatchObject({ state: "reversal_requested", refundedExternally: false });
    const approve = await app.inject({
      method: "POST",
      url: `${base}/d1/reversals`,
      headers: dHeaders("treasurer", "idn_treas2", req.json().version),
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ state: "reversed", reversalCount: 1 });
    expect(store.eventCount("grpA", "disbursement.reversed")).toBe(1);
    // Seconde course sur l'original déjà reversé : 409, compteur figé à 1.
    const second = await app.inject({
      method: "POST",
      url: `${base}/d1/reversals`,
      headers: dHeaders("treasurer", "idn_treas3", approve.json().version),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("DISBURSEMENT_ALREADY_REVERSED");
    expect(store.eventCount("grpA", "disbursement.reversed")).toBe(1);
    const view = await app.inject({
      method: "GET",
      url: `${base}/d1`,
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(view.json()).toMatchObject({ reversalCount: 1, state: "reversed", refundedExternally: false });
  });

  it("approbateur non indépendant du demandeur → 403", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    const v = await toCompleted(app, "d1", 0);
    const req = await app.inject({
      method: "POST",
      url: `${base}/d1/reversal-requests`,
      headers: { ...json, ...dHeaders("treasurer", "idn_treasurer", v) },
      payload: { reason: "erreur" },
    });
    const approve = await app.inject({
      method: "POST",
      url: `${base}/d1/reversals`,
      headers: dHeaders("treasurer", "idn_treasurer", req.json().version),
    });
    expect(approve.statusCode).toBe(403);
    expect(approve.json().code).toBe("DISBURSEMENT_REVERSAL_NOT_INDEPENDENT");
  });

  it("le bénéficiaire n'approuve pas la correction du sien → 403, aucune écriture", async () => {
    // Il jugerait sa propre cause (barrière d'indépendance, 6.10). L'acteur
    // porte le rôle `treasurer` (donc la permission objet `disbursement.reverse`)
    // MAIS EST le bénéficiaire : la permission ouvre la porte, l'indépendance
    // de l'objet la ferme — on atteint le garde domain, pas le refus de rôle.
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    const v = await toCompleted(app, "d1", 0);
    const req = await app.inject({
      method: "POST",
      url: `${base}/d1/reversal-requests`,
      headers: { ...json, ...dHeaders("treasurer", "idn_treasurer", v) },
      payload: { reason: "erreur" },
    });
    const approve = await app.inject({
      method: "POST",
      url: `${base}/d1/reversals`,
      headers: dHeaders("treasurer", "idn_benef", req.json().version),
    });
    expect(approve.statusCode).toBe(403);
    expect(approve.json().code).toBe("DISBURSEMENT_REVERSAL_NOT_INDEPENDENT");
    expect(store.eventCount("grpA", "disbursement.reversed")).toBe(0);
  });

  it("demander une correction d'un décaissement non achevé → 409", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload(),
    });
    const req = await app.inject({
      method: "POST",
      url: `${base}/d1/reversal-requests`,
      headers: { ...json, ...dHeaders("treasurer", "idn_treasurer", 1) },
      payload: { reason: "trop tot" },
    });
    expect(req.statusCode).toBe(409);
    expect(req.json().code).toBe("DISBURSEMENT_STATE_INVALID");
  });
});

describe("C08-BALANCE / C08-GAP — rapprochement par l'oracle indépendant (18.4, 18.9)", () => {
  it("50000 validés (serveur), 49000 décaissés, 1000 frais ⇒ gap = 0, clôture normale admise", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0, { netAmount: "49000", groupFees: "1000" });
    // Total validé net posé par le SERVEUR (flux cotisations/recette), jamais
    // par la requête.
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/r1/reconciliation",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      reconciliationGap: "0",
      normalCloseAccepted: true,
      netDisbursed: "49000",
      groupFees: "1000",
    });
  });

  it("50000 validés, 48000 décaissés, 1000 frais ⇒ gap = 1000, clôture refusée", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0, { netAmount: "48000", groupFees: "1000" });
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/r1/reconciliation",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.json()).toMatchObject({ reconciliationGap: "1000", normalCloseAccepted: false });
  });

  it("un client NE PEUT pas forcer la clôture par la query : les paramètres sont ignorés", async () => {
    // Barrières serveur (règle 18, ADR-0005) : la décision se lit depuis l'état
    // SERVEUR du tour. Avec un total serveur de 50000 (gap = 1000), les
    // paramètres `validatedNetTotal=50000`/`hasBlockingDispute=false` d'un
    // client malveillant ne changent rien — et le gap de 1000 reste visible.
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0, { netAmount: "48000", groupFees: "1000" });
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    const res = await app.inject({
      method: "GET",
      url:
        "/v1/groups/grpA/rounds/r1/reconciliation" +
        "?validatedNetTotal=49000&hasBlockingDispute=false&hasUnpaidAffectingPot=false",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reconciliationGap: "1000", normalCloseAccepted: false });
  });

  it("à écart nul, un litige bloquant SERVEUR refuse la clôture normale", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0, { netAmount: "49000", groupFees: "1000" });
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    store.setRoundBlockers("grpA", "r1", { hasBlockingDispute: true });
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/r1/reconciliation",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.json()).toMatchObject({
      reconciliationGap: "0",
      normalCloseAccepted: false,
      blockedByDispute: true,
    });
  });

  it("les frais personnels hors pot ne sont jamais déduits du rapprochement", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await toCompleted(app, "d1", 0, { netAmount: "49000", groupFees: "1000", personalFeesOutOfPot: "2000" });
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/r1/reconciliation",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    // gap reste 0 : le personnel (2000) est exclu du total imputable au pot.
    expect(res.json()).toMatchObject({ reconciliationGap: "0", groupFees: "1000" });
  });
});

describe("C08 — concurrence optimiste et non-divulgation (14.1, 18.2)", () => {
  it("version d'objet dépassée → 409 EVENT_CHAIN_BREAK, sans écriture", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload(),
    });
    const res = await app.inject({
      method: "POST",
      url: `${base}/d1/confirmations`,
      headers: dHeaders("member", "idn_benef", 99),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EVENT_CHAIN_BREAK");
    expect(store.eventCount("grpA", "disbursement.completed")).toBe(0);
  });

  it("mutation SANS en-tête de version → 422 (aucun défaut silencieux à 1)", async () => {
    // Concurrence optimiste (18.2, ADR-0006) : `if-match-version` est exigé
    // sur les actes mutants ; omettre l'en-tête ne peut plus valider v1 par
    // défaut et écraser un objet existant.
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    await app.inject({
      method: "POST",
      url: base,
      headers: { ...json, ...actorHeaders("treasurer", "idn_treasurer") },
      payload: declarePayload(),
    });
    const res = await app.inject({
      method: "POST",
      url: `${base}/d1/confirmations`,
      headers: actorHeaders("member", "idn_benef"),
    });
    expect(res.statusCode).toBe(422);
    expect(store.eventCount("grpA", "disbursement.completed")).toBe(0);
  });

  it("décaissement inconnu → 404 sans révéler son existence", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    const res = await app.inject({
      method: "GET",
      url: `${base}/inexistant`,
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.statusCode).toBe(404);
  });

  it("lecture par un acteur d'un autre groupe → 403, aucune donnée divulguée", async () => {
    const app = appWithStore(new FictitiousDisbursementStore());
    await toCompleted(app, "d1", 0);
    const res = await app.inject({
      method: "GET",
      url: `${base}/d1`,
      headers: actorHeaders("treasurer", "idn_externe", ["grpZ"]),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });

  it("objet dont le groupe réel diffère du groupe du chemin → 404 non-divulgation", async () => {
    // Anti-IDOR structurel : d1 appartient à grpA ; un acteur membre des deux
    // groupes qui le demande sous grpB reçoit 404, jamais le contenu de grpA.
    const app = appWithStore(new FictitiousDisbursementStore());
    await toCompleted(app, "d1", 0);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpB/disbursements/d1",
      headers: actorHeaders("treasurer", "idn_double", ["grpA", "grpB"]),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });

  it("rapprochement par un acteur d'un autre groupe → 403", async () => {
    const store = new FictitiousDisbursementStore();
    const app = appWithStore(store);
    store.setRoundValidatedNet("grpA", "r1", 50000n);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/r1/reconciliation",
      headers: actorHeaders("treasurer", "idn_externe", ["grpZ"]),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rapprochement d'un tour inconnu (aucune écriture serveur) → 404, jamais un solde inventé", async () => {
    // Honnêteté : ni état de tour posé, ni décaissement ⇒ le tour n'existe pas.
    // On ne répond PAS `normalCloseAccepted: true` par défaut sur un fantôme.
    const app = appWithStore(new FictitiousDisbursementStore());
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/rounds/rINCONNU/reconciliation",
      headers: actorHeaders("treasurer", "idn_treasurer"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });
});
