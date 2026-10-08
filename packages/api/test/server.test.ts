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

describe("gardes HTTP (§20/§25) : CORS à liste fermée + limitation de débit", () => {
  it("pré-flight OPTIONS : 204 pour origine permise, 403 sinon, jamais de « * »", async () => {
    process.env.KOMBE_CORS_ORIGINS = "https://ops.pages.dev,https://admin.vercel.app";
    try {
      const app = buildApp();
      const ok = await app.inject({
        method: "OPTIONS",
        url: "/v1/groups/grpA/contributions",
        headers: { origin: "https://ops.pages.dev", "access-control-request-method": "POST" },
      });
      expect(ok.statusCode).toBe(204);
      expect(ok.headers["access-control-allow-origin"]).toBe("https://ops.pages.dev");
      expect(ok.headers["access-control-allow-headers"]).toContain("authorization");
      expect(ok.headers["access-control-allow-origin"]).not.toBe("*");

      const ko = await app.inject({
        method: "OPTIONS",
        url: "/v1/groups/grpA/contributions",
        headers: { origin: "https://evil.example" },
      });
      expect(ko.statusCode).toBe(403);
      expect(ko.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      delete process.env.KOMBE_CORS_ORIGINS;
    }
  });

  it("requête simple : en-tête CORS seulement si origine permise", async () => {
    process.env.KOMBE_CORS_ORIGINS = "https://ops.pages.dev";
    try {
      const app = buildApp();
      const allowed = await app.inject({
        method: "GET",
        url: "/v1/health/live",
        headers: { origin: "https://ops.pages.dev" },
      });
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://ops.pages.dev");
      const sameOrigin = await app.inject({ method: "GET", url: "/v1/health/live" });
      expect(sameOrigin.headers["access-control-allow-origin"]).toBeUndefined();
      const unknown = await app.inject({
        method: "GET",
        url: "/v1/health/live",
        headers: { origin: "https://evil.example" },
      });
      expect(unknown.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      delete process.env.KOMBE_CORS_ORIGINS;
    }
  });

  it("limite serrée anti-force-brute sur /v1/access/* (10/min/IP)", async () => {
    const app = buildApp();
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/access/sessions",
        payload: { handle: "mallory", password: "x" },
        headers: { "content-type": "application/json" },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    const health = await app.inject({ method: "GET", url: "/v1/health/live" });
    expect(health.statusCode).toBe(200);
  });
});

describe("POST declaration de cotisation (squelette)", () => {
  it("health ok", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    // Contrat santé : en mode fictif (sans pool) le service se déclare prêt
    // sans base — jamais l'ancienne constante « c00-skeleton ».
    expect(res.json()).toEqual({ status: "ok", mode: "fictif" });
  });

  it("liveness et readiness exposées (DÉPLOIEMENT)", async () => {
    const app = buildApp();
    const live = await app.inject({ method: "GET", url: "/v1/health/live" });
    expect(live.statusCode).toBe(200);
    const ready = await app.inject({ method: "GET", url: "/v1/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready", mode: "fictif" });
  });

  it("en-têtes de sécurité posés sur chaque réponse, succès comme erreur (§20)", async () => {
    const app = buildApp();
    const ok = await app.inject({ method: "GET", url: "/v1/health/live" });
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["x-frame-options"]).toBe("DENY");
    expect(ok.headers["referrer-policy"]).toBe("no-referrer");
    expect(ok.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(ok.headers["cache-control"]).toBe("no-store");
    // Même exigence sur une réponse d'erreur (onSend couvre toutes les réponses).
    const err = await app.inject({ method: "GET", url: "/v1/groups/grpA/members" });
    expect(err.headers["x-content-type-options"]).toBe("nosniff");
    expect(err.headers["cache-control"]).toBe("no-store");
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
