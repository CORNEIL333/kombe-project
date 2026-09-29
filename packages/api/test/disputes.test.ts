/**
 * Recette C10 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur : dossier 8.1 (motif + correction, pièces désactivées),
 * C10-PRIVACY (vue commune vs détail privé, anti-IDOR), 8.2 (désignation
 * indépendante — un rôle ne remplace pas l'indépendance objet), C10-RESOLVE
 * (résoudre ne change AUCUN total — absence structurelle de canal monétaire),
 * recours lié à l'original, C10-FREEZE (clôture gelée, reprise après résolution).
 * Ne prétend PAS prouver verrouillage/unicité/append-only en base : contrat
 * `0010_dispute_cases.sql`, **BLOCKED** sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousDisputeStore } from "../src/disputeStore.js";
import { FictitiousValidationStore } from "../src/validationStore.js";

const json = { "content-type": "application/json" };

function actorHeaders(role: string, identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return { "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }) };
}

function hWithVersion(role: string, identityId: string, version: number, groupIds?: readonly string[]) {
  return { ...actorHeaders(role, identityId, groupIds), "if-match-version": String(version) };
}

const BASE = {
  disputeId: "dsp1",
  obligationId: "g1_r1_m2",
  reason: "Le montant declare ne correspond pas au recu",
  requestedCorrection: "Compenser puis redeclarer le montant exact",
  category: "ordinary" as const,
  involvedIdentityIds: ["idn_t1"],
  notifiedAt: 1_790_586_000,
  raisedAt: 1_790_589_600,
};

const casesUrl = "/v1/groups/grpA/dispute-cases";
const caseUrl = (action?: string) => `${casesUrl}/dsp1${action ? `/${action}` : ""}`;

function appWith(): {
  app: ReturnType<typeof buildApp>;
  disputes: FictitiousDisputeStore;
  validation: FictitiousValidationStore;
} {
  const disputes = new FictitiousDisputeStore();
  const validation = new FictitiousValidationStore();
  // Cotisation validée sur l'obligation litigieuse : ancre de C10-RESOLVE —
  // le total validé du registre doit rester BIT-PER-BIT identique.
  validation.seedContribution("c1", "grpA", "g1_r1_m2", 3000n, "idn_m1");
  return { app: buildApp({ disputes, validation }), disputes, validation };
}

async function openCase(app: ReturnType<typeof buildApp>, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: casesUrl,
    headers: { ...actorHeaders("member", "idn_m1"), ...json },
    body: JSON.stringify({ ...BASE, ...over }),
  });
}

describe("C10 — ouverture du dossier (8.1)", () => {
  it("membre ouvre un dossier → 201, état ouvert, levant résolu côté serveur", async () => {
    const { app, disputes } = appWith();
    const res = await openCase(app);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ disputeId: "dsp1", state: "open", raisedBy: "idn_m1", reopenCount: 0 });
    expect(disputes.caseCount).toBe(1);
  });

  it("correction demandée absente → 422 DISPUTE_RESOLUTION_REQUIRED, aucune écriture", async () => {
    const { app, disputes } = appWith();
    const res = await openCase(app, { requestedCorrection: " " });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("DISPUTE_RESOLUTION_REQUIRED");
    expect(disputes.caseCount).toBe(0);
  });

  it("rôle sans dispute.raise (trésorier) → 403, aucune écriture", async () => {
    const { app, disputes } = appWith();
    const res = await app.inject({
      method: "POST",
      url: casesUrl,
      headers: { ...actorHeaders("treasurer", "idn_t9"), ...json },
      body: JSON.stringify(BASE),
    });
    expect(res.statusCode).toBe(403);
    expect(disputes.caseCount).toBe(0);
  });
});

describe("C10-PRIVACY — vue commune vs détail privé (8.1)", () => {
  it("membre non partie → private_details_returned = false (vue commune seules)", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "GET",
      url: caseUrl(),
      headers: actorHeaders("member", "idn_outsider"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body["state"]).toBe("open");
    expect(JSON.stringify(body)).not.toMatch(/reason|requestedCorrection|raisedBy|involvedIdentityIds|resolverIdentityIds|idn_m1|idn_t1/);
    // La vue commune porte l'essentiel : existence, statut, issue utile.
    expect(body).toHaveProperty("outcome");
  });

  it("le levant (partie) → détail complet", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({ method: "GET", url: caseUrl(), headers: actorHeaders("member", "idn_m1") });
    expect(res.json()).toMatchObject({ disputeId: "dsp1", reason: BASE.reason, requestedCorrection: BASE.requestedCorrection });
  });

  it("liste du groupe = vues communes seulement, sans mutation de lecture", async () => {
    const { app, disputes } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "GET",
      url: casesUrl,
      headers: actorHeaders("member", "idn_outsider"),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toMatch(/reason|raisedBy|idn_m1/);
    expect(disputes.caseCount).toBe(1);
  });

  it("acteur hors du groupe → 403 (anti-IDOR, sans divulgation d'existence)", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "GET",
      url: caseUrl(),
      headers: actorHeaders("member", "idn_z", ["grpZ"]),
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toMatch(/reason|dsp1/);
  });

  it("dossier inconnu → 404 non-divulgant", async () => {
    const { app } = appWith();
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/dispute-cases/dsp_inconnu",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("C10 — désignation indépendante des résolveurs (8.2)", () => {
  it("désigner un impliqué → 403 DISPUTE_RESOLVER_NOT_INDEPENDENT", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_t1"] }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("DISPUTE_RESOLVER_NOT_INDEPENDENT");
  });

  it("rôle sans dispute.resolve (membre) → 403 — la désignation n'est pas démocratique", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("member", "idn_m2", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });

  it("secrétaire non impliqué désigné → 200, version incrémentée", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec", "idn_aud"] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 2 });
    expect(res.json().record.resolverIdentityIds).toEqual(["idn_sec", "idn_aud"]);
  });
});

describe("C10-RESOLVE — résoudre un litige ne change aucun total (8.3)", () => {
  it("résolution par le résolveur désigné : validated_total_delta = 0, événements monétaires = 0", async () => {
    const { app, validation } = appWith();
    await openCase(app);
    // La cotisation est validée via C07 — ancre de total.
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/contributions/c1/confirmations",
      headers: hWithVersion("treasurer", "idn_t2", 1),
    });
    const before = validation.view("c1");
    expect(before.state).toBe("validated");
    expect(validation.validatedEventCount("grpA")).toBe(1);
    expect(validation.compensatedEventCount("grpA")).toBe(0);
    const tailBefore = validation.journalTailHash("grpA");

    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "Ecart confirme ; compensation c-rev-1 referencee", resolvedAt: 1_790_676_000, correctionContributionIds: ["c-rev-1"] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().record).toMatchObject({ state: "resolved", resolvedBy: "idn_sec" });

    // Observation obligatoire : le total validé et la chaîne sont INTACTS.
    const after = validation.view("c1");
    expect(after).toEqual(before);
    expect(validation.validatedEventCount("grpA")).toBe(1);
    expect(validation.compensatedEventCount("grpA")).toBe(0);
    expect(validation.journalTailHash("grpA")).toBe(tailBefore);
  });

  it("acteur non désigné (même secrétaire) → 403 DISPUTE_RESOLVER_NOT_DESIGNATED", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("DISPUTE_RESOLVER_NOT_DESIGNATED");
  });

  it("décision sans motif → 422, le dossier reste ouvert", async () => {
    const { app } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "   ", resolvedAt: 1_790_676_000 }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("DISPUTE_RESOLUTION_REQUIRED");
    const view = await app.inject({ method: "GET", url: caseUrl(), headers: actorHeaders("secretary", "idn_sec") });
    expect(view.json().state).toBe("open");
  });

  it("résoudre deux fois → 409 DISPUTE_ALREADY_RESOLVED", async () => {
    const { app } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    const second = await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 3), ...json },
      body: JSON.stringify({ outcome: "encore", resolvedAt: 1_790_679_600 }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("DISPUTE_ALREADY_RESOLVED");
  });

  it("version d'objet dépassée → 409 EVENT_CHAIN_BREAK, sans écriture", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 7), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EVENT_CHAIN_BREAK");
    const view = await app.inject({ method: "GET", url: caseUrl(), headers: actorHeaders("member", "idn_m1") });
    expect(view.json().resolverIdentityIds).toEqual([]);
  });
});

describe("C10 — recours lié à l'original (8.3)", () => {
  it("le levant rouvre son dossier résolu → reopen_count = 1, lié à dsp1", async () => {
    const { app } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    const appeal = await app.inject({
      method: "POST",
      url: caseUrl("appeals"),
      headers: hWithVersion("member", "idn_m1", 3),
    });
    expect(appeal.statusCode).toBe(200);
    expect(appeal.json().record).toMatchObject({ state: "open", reopenCount: 1, reopenedFromDisputeId: "dsp1" });
  });

  it("recours d'un autre membre → 403, sans divulguer l'identité du levant", async () => {
    const { app } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    const res = await app.inject({ method: "POST", url: caseUrl("appeals"), headers: hWithVersion("member", "idn_m2", 3) });
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toMatch(/idn_m1/);
  });
});

describe("C10-FREEZE — clôture de tour gelée par un litige ouvert", () => {
  const closeBody = { obligationIds: ["g1_r1_m1", "g1_r1_m2", "g1_r1_m3"] };

  it("litige ouvert sur une obligation du tour → normal_close_accepted = false (409)", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/round-close-attempts",
      headers: { ...actorHeaders("animator", "idn_anim"), ...json },
      body: JSON.stringify(closeBody),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
  });

  it("après résolution indépendante → clôture normale admise, écriture conservée", async () => {
    const { app, validation } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/contributions/c1/confirmations",
      headers: hWithVersion("treasurer", "idn_t2", 1),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    const close = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/round-close-attempts",
      headers: { ...actorHeaders("animator", "idn_anim"), ...json },
      body: JSON.stringify(closeBody),
    });
    expect(close.statusCode).toBe(200);
    expect(close.json()).toEqual({ normalCloseAccepted: true });
    // Le gel levé n'a rien effacé : la cotisation validée est toujours là.
    expect(validation.view("c1").state).toBe("validated");
  });

  it("gel rétabli par un recours → clôture de nouveau refusée", async () => {
    const { app } = appWith();
    await openCase(app);
    await app.inject({
      method: "POST",
      url: caseUrl("resolvers"),
      headers: { ...hWithVersion("secretary", "idn_sec", 1), ...json },
      body: JSON.stringify({ resolverIdentityIds: ["idn_sec"] }),
    });
    await app.inject({
      method: "POST",
      url: caseUrl("resolution"),
      headers: { ...hWithVersion("secretary", "idn_sec", 2), ...json },
      body: JSON.stringify({ outcome: "clos", resolvedAt: 1_790_676_000 }),
    });
    await app.inject({ method: "POST", url: caseUrl("appeals"), headers: hWithVersion("member", "idn_m1", 3) });
    const close = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/round-close-attempts",
      headers: { ...actorHeaders("animator", "idn_anim"), ...json },
      body: JSON.stringify(closeBody),
    });
    expect(close.statusCode).toBe(409);
  });

  it("rôle sans round.close → 403", async () => {
    const { app } = appWith();
    await openCase(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/round-close-attempts",
      headers: { ...actorHeaders("member", "idn_m1"), ...json },
      body: JSON.stringify(closeBody),
    });
    expect(res.statusCode).toBe(403);
  });
});
