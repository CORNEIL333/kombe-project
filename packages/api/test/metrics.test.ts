/**
 * Recette C18 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur de la mesure pilote et de l'économie unitaire : un événement
 * d'analytics portant un **champ financier ou identitaire individuel** est
 * REFUSÉ (C18-ANALYTICS, 422) et un entonnoir n'expose **jamais** un tel champ
 * (`individualFinancialFields = 0`) ; une cohorte à 3 tours sur 10 membres n'est
 * **pas** éligible à la rétention trois cycles (C18-COHORT : un cycle = rotation
 * complète = memberCount tours) ; un taux de paiement **réel** de 2/10 (20 %) est
 * **sous** le seuil exploratoire (25 %) ⇒ porte G2 non atteinte (C18-PAYERS),
 * alors que 3/10 (30 %) l'atteint ; un risque **critique sans contrôle effectif
 * bloque l'extension** du pilote. Les montants sont renvoyés en **chaînes XAF
 * entières** (jamais de flottant JSON). Ne prétend NI persister, NI brancher un
 * vrai outil d'analytics : contrat `0017_pilot_metrics` (tables append-only, RLS
 * d'agrégats, CHECK « no-financial-field »), **BLOCKED** sans PostgreSQL
 * (ADR-0006 / ADR-0007).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousMetricsStore } from "../src/metricsStore.js";

const json = { "content-type": "application/json" };

function h(identityId: string) {
  return {
    ...json,
    "x-actor": JSON.stringify({ handle: identityId, role: "member", identityId, groupIds: ["grpA"] }),
    "x-server-date": "2026-09-15T10:00:00Z",
  };
}

function anon() {
  return { ...json, "x-server-date": "2026-09-15T10:00:00Z" };
}

function fresh(): { app: ReturnType<typeof buildApp>; store: FictitiousMetricsStore } {
  const store = new FictitiousMetricsStore();
  return { app: buildApp({ metrics: store }), store };
}

describe("C18 — gardes d'accès", () => {
  it("acteur absent → 403 FEATURE_PILOT_FORBIDDEN", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/analytics/events",
      headers: anon(),
      payload: { cohortId: "c1", step: "visite" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });
});

describe("C18 — analytics pseudonymisé (16.1, C18-ANALYTICS)", () => {
  it("accepte un événement sans champ sensible (201) et daté SERVEUR", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/analytics/events",
      headers: h("membre_a"),
      payload: { cohortId: "c1", step: "demarrage", properties: { source: "onboarding" } },
    });
    expect(res.statusCode).toBe(201);
    const ev = res.json();
    expect(ev.cohortId).toBe("c1");
    expect(ev.step).toBe("demarrage");
    // occurredAt = x-server-date (2026-09-15T10:00:00Z) en secondes d'époque.
    expect(ev.occurredAt).toBe(Math.floor(Date.parse("2026-09-15T10:00:00Z") / 1000));
  });

  it("REFUSE un champ financier individuel (422 METRICS_CHAMPS_FINANCIER_INDIVIDUEL)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/analytics/events",
      headers: h("membre_a"),
      payload: { cohortId: "c1", step: "premiere_contribution", properties: { montant: 5000 } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("METRICS_CHAMPS_FINANCIER_INDIVIDUEL");
  });

  it("REFUSE une étape inconnue (422)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/analytics/events",
      headers: h("membre_a"),
      payload: { cohortId: "c1", step: "inconnue" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("entonnoir : individualFinancialFields = 0 (C18-ANALYTICS)", async () => {
    const { app } = fresh();
    for (const step of ["visite", "demarrage", "premiere_validation"]) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/metrics/analytics/events",
        headers: h("membre_a"),
        payload: { cohortId: "c9", step, properties: { n: 1 } },
      });
      expect(r.statusCode).toBe(201);
    }
    const res = await app.inject({
      method: "GET",
      url: "/v1/metrics/analytics/funnel/c9",
      headers: h("membre_a"),
    });
    expect(res.statusCode).toBe(200);
    const funnel = res.json();
    expect(funnel.individualFinancialFields).toBe(0);
    expect(funnel.steps.map((s: { step: string }) => s.step)).toContain("premiere_validation");
  });
});

describe("C18 — cohortes et cycles (18.13, C18-COHORT)", () => {
  it("3 tours / 10 membres → 0 cycle → NON éligible trois cycles", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/cohorts",
      headers: h("membre_a"),
      payload: { groupId: "grpA", memberCount: 10, roundsCompleted: 3 },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.completedCycles).toBe(0);
    expect(c.eligibleThreeCycleRetention).toBe(false);
  });

  it("30 tours / 10 membres → 3 cycles → éligible", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/cohorts",
      headers: h("membre_a"),
      payload: { groupId: "grpB", memberCount: 10, roundsCompleted: 30 },
    });
    expect(res.json().eligibleThreeCycleRetention).toBe(true);
  });

  it("GET cohorte inconnue → 404 non-divulguant", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "GET",
      url: "/v1/metrics/cohorts/grpInconnu",
      headers: h("membre_a"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });
});

describe("C18 — économie unitaire (16.2, C18-PAYERS)", () => {
  it("2 payants réels / 10 exposés → 20 % < 25 % → gate_g2_met false", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/economics",
      headers: h("membre_a"),
      payload: {
        exposedMembers: 10,
        paidCount: 2,
        promisedCount: 5,
        supportMinutes: 120,
        supportCostPerMinuteMinor: "50",
        infrastructureCostMinor: "10000",
        cancellations: 1,
        taxesMinor: "500",
      },
    });
    expect(res.statusCode).toBe(200);
    const e = res.json();
    expect(e.realPayers).toBe(2);
    expect(e.paymentRealPercent).toBe(20);
    expect(e.gateG2Met).toBe(false);
    // Montants en chaînes XAF entières (support 120×50=6000, total 6000+10000+500=16500).
    expect(typeof e.supportCostMinor).toBe("string");
    expect(e.supportCostMinor).toBe("6000");
    expect(e.totalCostMinor).toBe("16500");
  });

  it("3 payants réels / 10 exposés → 30 % ≥ 25 % → gate_g2_met true", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/economics",
      headers: h("membre_a"),
      payload: {
        exposedMembers: 10,
        paidCount: 3,
        promisedCount: 0,
        supportMinutes: 0,
        supportCostPerMinuteMinor: "0",
        infrastructureCostMinor: "0",
        cancellations: 0,
        taxesMinor: "0",
      },
    });
    expect(res.json().gateG2Met).toBe(true);
  });
});

describe("C18 — registre des risques et extension (16.3)", () => {
  it("enregistre un risque conforme (201)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/risks",
      headers: h("membre_a"),
      payload: {
        riskId: "R-1",
        severity: "moyen",
        probabilityPercent: 40,
        impactPercent: 30,
        control: "double validation",
        evidenceRef: "docs/PREUVES_C18.md",
        owner: "treasurer",
        reviewedAt: "2026-09-10",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().riskId).toBe("R-1");
  });

  it("REFUSE une probabilité hors bornes (422)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/risks",
      headers: h("membre_a"),
      payload: {
        riskId: "R-2",
        severity: "critique",
        probabilityPercent: 150,
        impactPercent: 30,
        reviewedAt: "2026-09-10",
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("risque critique SANS contrôle effectif → extension bloquée", async () => {
    const { app } = fresh();
    await app.inject({
      method: "POST",
      url: "/v1/metrics/risks",
      headers: h("membre_a"),
      payload: {
        riskId: "R-CRIT",
        severity: "critique",
        probabilityPercent: 60,
        impactPercent: 80,
        control: "",
        evidenceRef: "",
        owner: "",
        reviewedAt: "2026-09-10",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/extension-check",
      headers: h("membre_a"),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const status = res.json();
    expect(status.extensionAllowed).toBe(false);
    expect(status.criticalWithoutControl).toContain("R-CRIT");
  });

  it("aucun risque critique → extension autorisée", async () => {
    const { app } = fresh();
    await app.inject({
      method: "POST",
      url: "/v1/metrics/risks",
      headers: h("membre_a"),
      payload: {
        riskId: "R-OK",
        severity: "eleve",
        probabilityPercent: 20,
        impactPercent: 20,
        control: "surveillance",
        evidenceRef: "docs/PREUVES_C18.md",
        owner: "auditor",
        reviewedAt: "2026-09-10",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics/extension-check",
      headers: h("membre_a"),
      payload: {},
    });
    expect(res.json().extensionAllowed).toBe(true);
  });
});
