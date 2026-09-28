/**
 * Recette C05 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur du calendrier : totaux nés de l'oracle `rotation`
 * (C05-SCHEDULE), dates métier bornées au dernier jour réel du mois avec instants
 * UTC (C05-MONTH), refus de deux tours au même bénéficiaire (C05-UNIQUE), ordre
 * figé après démarrage, départ sans réaffectation de dette, renouvellement. Ne
 * prétend PAS prouver l'unicité/rotation en base : contrat `0006_cycle_schedule.sql`,
 * **BLOCKED**.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousScheduleStore } from "../src/scheduleStore.js";

const json = { "content-type": "application/json" };
const ids = Array.from({ length: 10 }, (_, i) => `idn_m${i + 1}`);

function payload(over: Record<string, unknown> = {}) {
  return {
    groupId: "grpA",
    ruleVersion: 1,
    members: ids,
    contribution: "5000",
    frequency: "monthly",
    dueDay: 5,
    startYear: 2028,
    startMonth: 1,
    beneficiaryOrder: [...ids],
    ...over,
  };
}

function newApp() {
  return buildApp({ schedule: new FictitiousScheduleStore() });
}

async function build(app: ReturnType<typeof newApp>, body: object) {
  return app.inject({ method: "POST", url: "/v1/groups/grpA/schedules", headers: json, payload: body });
}

describe("C05-SCHEDULE — 10 membres à 5000 sur 10 tours (5.1)", () => {
  it("cycle_expected_total = 500000", async () => {
    const res = await build(newApp(), payload());
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.cycleExpectedTotal).toBe("500000");
    expect(body.roundPot).toBe("50000");
    expect(body.rounds).toBe(10);
    expect(body.schedule.length).toBe(10);
    expect(body.schedule[0].obligations.length).toBe(10);
  });
});

describe("C05-MONTH — quantième ramené au dernier jour du mois (5.2)", () => {
  it("31 janv. 2028 puis février bissextil ⇒ second_due_date = 2028-02-29", async () => {
    const res = await build(newApp(), payload({ dueDay: 31 }));
    expect(res.statusCode).toBe(201);
    const s = res.json().schedule;
    expect(s[0].dueDate).toBe("2028-01-31");
    expect(s[1].dueDate).toBe("2028-02-29");
    // instant UTC persisté = 12:00 Douala = 11:00 UTC
    expect(s[0].dueAtMs).toBe(Date.UTC(2028, 0, 31, 11, 0, 0));
  });
});

describe("C05-UNIQUE — deux tours au même bénéficiaire refusés (5.3)", () => {
  it("schedule_accepted = false (refus 422, aucune écriture)", async () => {
    const order = [...ids];
    order[1] = order[0]; // m2 remplace le tour 2 par le bénéficiaire du tour 1
    const app = newApp();
    const res = await build(app, payload({ beneficiaryOrder: order }));
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SCHEDULE_BENEFICIARY_DUPLICATE");
    // absence d'effet : le calendrier n'a pas été mémorisé
    const read = await app.inject({ method: "GET", url: "/v1/groups/grpA/schedules" });
    expect(read.statusCode).toBe(404);
  });

  it("bénéficiaire étranger au groupe refusé", async () => {
    const order = [...ids];
    order[3] = "idn_hors";
    const res = await build(newApp(), payload({ beneficiaryOrder: order }));
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SCHEDULE_MEMBER_UNKNOWN");
  });
});

describe("C05 — ordre figé après démarrage (5.3)", () => {
  it("réassignation refusée une fois le calendrier démarré (409)", async () => {
    const app = newApp();
    await build(app, payload());
    const started = await app.inject({ method: "POST", url: "/v1/groups/grpA/schedule-starts", headers: json, payload: {} });
    expect(started.statusCode).toBe(201);
    expect(started.json().state).toBe("started");
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rounds/1/beneficiary",
      headers: json,
      payload: { seq: 1, newBeneficiaryId: "idn_m5" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SCHEDULE_FROZEN");
  });

  it("réassignation sur brouillon produisant une doublure refusée (422)", async () => {
    const app = newApp();
    await build(app, payload());
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rounds/2/beneficiary",
      headers: json,
      payload: { seq: 2, newBeneficiaryId: "idn_m1" }, // m1 déjà bénéficiaire du tour 1
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("SCHEDULE_BENEFICIARY_DUPLICATE");
  });
});

describe("C05 — départ sans réaffectation de dette", () => {
  it("tours conservés, dette du partant non réaffectée", async () => {
    const app = newApp();
    await build(app, payload());
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/departures",
      headers: json,
      payload: { identityId: "idn_m3" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      departingId: "idn_m3",
      roundsUnchanged: true,
      debtReassigned: false,
      retainedObligations: 10,
    });
  });
});

describe("C05 — renouvellement (5.5)", () => {
  it("engagement essentiel changé ⇒ nouvelles acceptations requises", async () => {
    const app = newApp();
    await build(app, payload()); // contribution 5000, 10 membres, 10 tours
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-renewals",
      headers: json,
      payload: { version: 2, memberCount: 10, contribution: "6000", rounds: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().essentialChange).toBe(true);
    expect(res.json().requiresNewAcceptances).toBe(true);
    expect(res.json().historyPreserved).toBe(true);
  });

  it("changement non essentiel ⇒ pas de nouvelles acceptations", async () => {
    const app = newApp();
    await build(app, payload());
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-renewals",
      headers: json,
      payload: { version: 2, memberCount: 10, contribution: "5000", rounds: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().requiresNewAcceptances).toBe(false);
  });
});
