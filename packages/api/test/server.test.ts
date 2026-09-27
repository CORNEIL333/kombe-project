/**
 * Recette du squelette de commande (fastify.inject, sans réseau ni base).
 *
 * Ces cas prouvent la CHAÎNE DE DÉCISION (RBAC, barrières serveur, version
 * d'objet, idempotence, invariants de montant) et le non-effet sur chemin
 * négatif. Ils ne prouvent PAS le verrouillage/isolation/atomicité réels,
 * qui exigent PostgreSQL (C01, BLOCKED sur cet hôte sans base).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousCommandStore } from "../src/commandPipeline.js";

const memberActor = { handle: "alice", role: "member", groupIds: ["grpA"] };

function appWith(seeds: Array<[string, string]>) {
  const store = new FictitiousCommandStore();
  for (const [oblId, groupId] of seeds) store.seedObligation(oblId, groupId);
  return buildApp({ store });
}

function declare(app: ReturnType<typeof buildApp>, body: unknown, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/v1/groups/grpA/contributions",
    payload: body as object,
    headers: { "content-type": "application/json", ...headers },
  });
}

const baseHeaders = {
  "idempotency-key": "key-00000001",
  "if-match-version": "1",
  "x-actor": JSON.stringify(memberActor),
};

describe("POST declaration de cotisation (squelette)", () => {
  it("health ok", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().phase).toBe("c00-skeleton");
  });

  it("accepte une declaration entiere et versionnee", async () => {
    const app = appWith([["obl_1", "grpA"]]);
    const res = await declare(app, { obligationId: "obl_1", amount: 5000 }, baseHeaders);
    expect(res.statusCode).toBe(201);
    const receipt = res.json();
    expect(receipt.status).toBe("applied");
    expect(receipt.resultVersion).toBe(2);
    expect(receipt.journalEventHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse l'acces intergroupe sans divulgation (anti-IDOR)", async () => {
    const app = appWith([["obl_B", "grpB"]]);
    const res = await declare(
      app,
      { obligationId: "obl_B", amount: 5000 },
      baseHeaders, // acteur uniquement dans grpA
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });

  it("conflit explicite sur version depassee (aucun ecrasement silencieux)", async () => {
    const app = appWith([["obl_1", "grpA"]]);
    const res = await declare(
      app,
      { obligationId: "obl_1", amount: 5000 },
      { ...baseHeaders, "if-match-version": "99" },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EVENT_CHAIN_BREAK");
  });

  it("refuse un montant flottant et n'crit aucun effet", async () => {
    const app = appWith([["obl_1", "grpA"]]);
    const res = await declare(
      app,
      { obligationId: "obl_1", amount: 10.5 },
      baseHeaders,
    );
    expect(res.statusCode).toBe(422);
    // Non-effet : la version courante reste 1, une declaration valide passe apres.
    const ok = await declare(app, { obligationId: "obl_1", amount: 2000 }, baseHeaders);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().resultVersion).toBe(2); // partie de 1, pas de mutation fantome
  });

  it("rejeu idempotent renvoie le resultat d'origine", async () => {
    const app = appWith([["obl_1", "grpA"]]);
    const first = await declare(app, { obligationId: "obl_1", amount: 5000 }, baseHeaders);
    expect(first.statusCode).toBe(201);
    const second = await declare(app, { obligationId: "obl_1", amount: 5000 }, baseHeaders);
    expect(second.statusCode).toBe(201);
    expect(second.json().status).toBe("duplicate");
    expect(second.json().commandId).toBe(first.json().commandId);
  });

  it("objet inexistant repond 404 sans divulguer", async () => {
    const app = appWith([]);
    const res = await declare(app, { obligationId: "nope", amount: 5000 }, baseHeaders);
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Requête refusée");
  });
});
