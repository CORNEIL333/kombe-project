/**
 * Recette C06 via l'application Fastify (fastify.inject, sans base). Prouve
 * les DÉCISIONS serveur : idempotence par hash de corps (rejeu sans second
 * événement, conflit 409 corps différent), capacité sous verrou et excédent
 * bloqué, relecture des droits AVANT rejeu, séparation brouillon/soumission,
 * validation canal/référence/motif. Ne prétend PAS prouver la sérialisation
 * concurrente réelle ni l'atomicité événement/projection/outbox en base :
 * contrat `0008_contribution_idempotency.sql`, **BLOCKED** sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousContributionStore } from "../src/contributionStore.js";

const json = { "content-type": "application/json" };

function actorHeaders(
  role: string,
  identityId: string,
  groupIds: readonly string[] = ["grpA"],
) {
  return {
    "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }),
  };
}

function declareHeaders(
  role: string,
  identityId: string,
  key: string,
  version: number,
  groupIds: readonly string[] = ["grpA"],
) {
  return {
    ...json,
    ...actorHeaders(role, identityId, groupIds),
    "idempotency-key": key,
    "if-match-version": String(version),
  };
}

function cash(obligationId: string, amount: number) {
  return { obligationId, amount, channel: "cash", allegedDate: "2026-09-10" };
}

function newStore(validatedNet = 0n, activeReserved = 0n) {
  const contribution = new FictitiousContributionStore();
  contribution.seedObligation("obl1", "grpA", 5000n, { validatedNet, activeReserved });
  return contribution;
}

describe("C06-REPLAY — rejouer la même déclaration ne crée qu'un événement", () => {
  it("20 rejeux de la même clé/corps → contribution_count = 1", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const first = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "key-replay", 1),
      payload: cash("obl1", 2000),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().status).toBe("applied");

    for (let i = 0; i < 19; i += 1) {
      const again = await app.inject({
        method: "POST",
        url: "/v1/groups/grpA/declarations",
        headers: declareHeaders("member", "idn_m1", "key-replay", 1),
        payload: cash("obl1", 2000),
      });
      expect(again.statusCode).toBe(200);
      expect(again.json().status).toBe("duplicate");
    }

    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json()).toMatchObject({ contributionCount: 1, activeReserved: "2000" });
    expect(contribution.declaredEventCount("grpA")).toBe(1);
  });
});

describe("C06-BODY — même clé, corps différent → conflit 409 sans écriture", () => {
  it("réutiliser la clé avec un montant différent → 409 et aucun effet", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "key-body", 1),
      payload: cash("obl1", 1000),
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "key-body", 1),
      payload: cash("obl1", 1500),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("IDEMPOTENCY_BODY_CONFLICT");
    // Absence d'effet : la seconde tentative n'a rien réservé ni écrit.
    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json()).toMatchObject({ activeReserved: "1000", contributionCount: 1 });
  });
});

describe("C06-RACE — deux courses de 3000 sur 5000, sérialisées → total accepté 3000", () => {
  it("la seconde dépasse la capacité restante → 409, réservé = 3000", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const a = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "race-key-1", 1),
      payload: cash("obl1", 3000),
    });
    expect(a.statusCode).toBe(201);
    // Seconde course : relit la version (2) puis tente 3000 ; capacité = 2000.
    const b = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m2", "race-key-2", 2),
      payload: cash("obl1", 3000),
    });
    expect(b.statusCode).toBe(409);
    expect(b.json().code).toBe("CONTRIBUTION_EXCEEDS_REMAINING");
    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json().activeReserved).toBe("3000");
    expect(contribution.declaredEventCount("grpA")).toBe(1);
  });
});

describe("C06 — concurrence optimiste et version d'objet (18.2)", () => {
  it("version attendue dépassée → 409 EVENT_CHAIN_BREAK, sans réservation", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "ver-key-1", 1),
      payload: cash("obl1", 1000),
    });
    const stale = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m2", "ver-key-2", 1),
      payload: cash("obl1", 500),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("EVENT_CHAIN_BREAK");
    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json()).toMatchObject({ activeReserved: "1000", contributionCount: 1 });
  });
});

describe("C06 — canal / référence / motif (6.1)", () => {
  it("électronique sans référence ni motif → 422, sans écriture", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "elec-key-1", 1),
      payload: { obligationId: "obl1", amount: 500, channel: "electronic", allegedDate: "2026-09-10" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("REFERENCE_JUSTIFICATION_REQUIRED");
    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json().contributionCount).toBe(0);
  });

  it("électronique sans référence mais avec motif → accepté", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "elec-key-2", 1),
      payload: {
        obligationId: "obl1",
        amount: 500,
        channel: "electronic",
        justification: "virement confirmé en réunion, reçu illisible",
        allegedDate: "2026-09-10",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("C06 — relecture des droits avant de servir un rejeu", () => {
  it("réacteurs hors groupe : le rejeu est refusé (403), pas rejoué", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "key-group-revoke", 1),
      payload: cash("obl1", 1000),
    });
    // Même identité/clé/corps mais sortie du groupe : droits relus AVANT rejeu.
    const revoked = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "key-group-revoke", 1, []),
      payload: cash("obl1", 1000),
    });
    expect(revoked.statusCode).toBe(403);
    expect(revoked.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });

  it("rôle sans droit de déclarer (auditor) → 403", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("auditor", "idn_a1", "auditor-key-1", 1),
      payload: cash("obl1", 500),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("C06 — non-divulgation et brouillon distinct (6.9)", () => {
  it("obligation inconnue → 404, sans révéler son existence", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/declarations",
      headers: declareHeaders("member", "idn_m1", "unknown-key-1", 1),
      payload: cash("obl_missing", 500),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });

  it("brouillon distinct de la soumission → aucun événement, aucune réservation", async () => {
    const contribution = newStore();
    const app = buildApp({ contribution });
    const draft = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/drafts",
      headers: { ...json, ...actorHeaders("member", "idn_m1") },
      payload: cash("obl1", 2000),
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({ draftSaved: true, submitted: false });
    const view = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/obligations/obl1",
      headers: actorHeaders("member", "idn_m1"),
    });
    expect(view.json()).toMatchObject({ contributionCount: 0, activeReserved: "0" });
    expect(contribution.declaredEventCount("grpA")).toBe(0);
  });
});
