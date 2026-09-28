/**
 * Recette C04 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur du moteur de règles : pénalités fermées au pilote
 * (C04-PENALTY), acceptation sur hash exact, non-rétroactivité des échéances
 * passées (C04-RETRO), et effectivité d'un engagement essentiel soumise à
 * l'accord de tous les concernés (C04-ACCEPT). Ne prétend PAS prouver
 * l'immuabilité/hash en base : contrat `0005_rules_engine.sql`, **BLOCKED**.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousRulesStore } from "../src/rulesStore.js";

const json = { "content-type": "application/json" };
const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function snapshot(over: Record<string, unknown> = {}) {
  return {
    memberCount: 10,
    contribution: "5000",
    rounds: 10,
    frequency: "monthly",
    dueDay: 5,
    quorum: { numerator: 2, denominator: 3 },
    gracePeriodDays: 0,
    penaltyEnabled: false,
    ...over,
  };
}

async function publish(app: ReturnType<typeof buildApp>, groupId: string, snap: unknown) {
  return app.inject({
    method: "POST",
    url: `/v1/groups/${groupId}/rule-versions`,
    headers: json,
    payload: { snapshot: snap },
  });
}

describe("C04-PENALTY — pénalités fermées au pilote (3.3)", () => {
  it("publication avec penaltyEnabled=true normalise à false", async () => {
    const app = buildApp({ rules: new FictitiousRulesStore() });
    const res = await publish(app, "grpA", snapshot({ penaltyEnabled: true }));
    expect(res.statusCode).toBe(201);
    expect(res.json().penaltyEnabled).toBe(false);
  });
  it("demande d'activation refusée : penalty_enabled=false, rejected=true", async () => {
    const app = buildApp({ rules: new FictitiousRulesStore() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/penalty-requests",
      headers: json,
      payload: { desired: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requested: true, penalty_enabled: false, rejected: true });
  });
});

describe("C04 acceptation sur hash exact (3.6)", () => {
  it("le bon hash est accepté, un hash erroné est refusé (412)", async () => {
    const app = buildApp({ rules: new FictitiousRulesStore() });
    const pub = await publish(app, "grpA", snapshot());
    const { hash } = pub.json();
    const ok = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rule-versions/1/acceptances",
      headers: json,
      payload: { identityId: "idn_a", hash },
    });
    expect(ok.statusCode).toBe(201);
    const bad = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rule-versions/1/acceptances",
      headers: json,
      payload: { identityId: "idn_b", hash: "f".repeat(64) },
    });
    expect(bad.statusCode).toBe(412);
    expect(bad.json().code).toBe("RULE_ACCEPT_HASH_MISMATCH");
  });
});

describe("C04-RETRO — aucune échéance passée réécrite (3.2, 3.7)", () => {
  function seededStore() {
    const store = new FictitiousRulesStore();
    store.setNow(NOW);
    store.seedDues("grpA", [
      { obligationId: "obl_1", dueAtMs: NOW - 10 * DAY, amount: 5000n }, // passée
      { obligationId: "obl_2", dueAtMs: NOW + 10 * DAY, amount: 5000n }, // future
    ]);
    return store;
  }

  it("recalcul augmentant une échéance déjà passée est refusé (409)", async () => {
    const app = buildApp({ rules: seededStore() });
    await publish(app, "grpA", snapshot()); // v1 contribution 5000 (= échéances seedées)
    await publish(app, "grpA", snapshot({ contribution: "6000" })); // v2 essentielle
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-recalculations",
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("RULE_RETROACTIVE");
    // past_due_changed = false : le recalcul a été refusé, rien n'a été écrit.
  });

  it("sans changement de montant passé, le recalcul aboutit et past_due_changed=false", async () => {
    const app = buildApp({ rules: seededStore() });
    await publish(app, "grpA", snapshot()); // contribution 5000 = montants seedés
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/cycle-recalculations",
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().past_due_changed).toBe(false);
  });
});

describe("C04-ACCEPT — essentiel exécuté seulement si tous les concernés acceptent (3.7)", () => {
  it("un refus bloque l'exécution ; l'accord complet l'autorise", async () => {
    const store = new FictitiousRulesStore();
    const app = buildApp({ rules: store });
    await publish(app, "grpA", snapshot()); // v1 (5000)
    const v2 = await publish(app, "grpA", snapshot({ contribution: "6000" })); // essentielle
    const hash2 = v2.json().hash as string;

    const accept = (identityId: string) =>
      app.inject({
        method: "POST",
        url: "/v1/groups/grpA/rule-versions/2/acceptances",
        headers: json,
        payload: { identityId, hash: hash2 },
      });

    await accept("idn_a");
    await accept("idn_b"); // idn_c refuse (aucune acceptation)
    const partial = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rule-changes",
      headers: json,
      payload: { version: 2, concerned: ["idn_a", "idn_b", "idn_c"] },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().essential).toBe(true);
    expect(partial.json().appliesTo).toBe("next_cycle");
    expect(partial.json().new_rule_executed).toBe(false);

    await accept("idn_c");
    const full = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/rule-changes",
      headers: json,
      payload: { version: 2, concerned: ["idn_a", "idn_b", "idn_c"] },
    });
    expect(full.json().new_rule_executed).toBe(true);
  });
});
