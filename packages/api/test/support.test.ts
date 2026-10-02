/**
 * Recette C17 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur de la console support : motif obligatoire, permission
 * financière refusée **dès la demande**, **double approbation** par des identités
 * distinctes (COM05), granted seulement au seuil de deux, expiration jugée sur
 * l'**horloge serveur injectée** (C17-JIT), **séparation stricte du pouvoir
 * financier** (C17-FINANCE), anti-IDOR sur la lecture scopée, et journal de
 * sécurité **expurgé** (C17-LOGS : aucune canary sensible dans le log). Chaque
 * refus est vérifié par le code d'erreur HTTP stable. Ne prétend PAS prouver la
 * contrainte SQL de double approbation, la MFA ni la persibilité : contrat
 * `0014_support_security`, **BLOCKED** sans PostgreSQL (ADR-0006 / ADR-0007).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousSupportStore } from "../src/supportStore.js";

const json = { "content-type": "application/json" };

function actorHeaders(role: string, identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return { "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }) };
}

function h(identityId: string, serverDate: string, groupIds: readonly string[] = ["grpA"]) {
  return { ...json, ...actorHeaders("admin", identityId, groupIds), "x-server-date": serverDate };
}

const T0 = "2026-01-01T00:00:00.000Z";
const IN_WINDOW = "2026-01-01T00:10:00.000Z"; // < T0 + 1800 s
const AFTER_TTL = "2026-01-01T01:00:00.000Z"; // > T0 + 1800 s → expiré

function fresh(): { app: ReturnType<typeof buildApp>; store: FictitiousSupportStore } {
  const store = new FictitiousSupportStore();
  return { app: buildApp({ support: store }), store };
}

async function requestAccess(
  app: ReturnType<typeof buildApp>,
  requestId: string,
  permissions: readonly string[],
  motif = "aide rétablissement accès",
  targetGroupId = "grpA",
  ttlSeconds = 1800,
  identityId = "idn_support",
) {
  return app.inject({
    method: "POST",
    url: "/v1/support/access-requests",
    headers: h(identityId, T0),
    payload: { requestId, targetGroupId, motif, permissions, ttlSeconds },
  });
}

async function approve(app: ReturnType<typeof buildApp>, requestId: string, identityId: string, ttlSeconds = 1800) {
  return app.inject({
    method: "POST",
    url: `/v1/support/access-requests/${requestId}/approvals`,
    headers: h(identityId, T0),
    payload: { ttlSeconds },
  });
}

/** Mène une demande jusqu'à `granted` (deux approbateurs distincts). */
async function grant(app: ReturnType<typeof buildApp>, requestId: string) {
  await requestAccess(app, requestId, ["restore_access", "view_trace"]);
  await approve(app, requestId, "idn_appr1");
  return approve(app, requestId, "idn_appr2");
}

async function act(app: ReturnType<typeof buildApp>, requestId: string, action: string, serverDate = IN_WINDOW) {
  return app.inject({
    method: "POST",
    url: `/v1/support/access-requests/${requestId}/actions`,
    headers: h("idn_support", serverDate),
    payload: { action },
  });
}

describe("C17 demande d'accès — motif et permissions (9.6)", () => {
  it("un motif fait de blancs est refusé → 422 SUPPORT_MOTIF_REQUIRED", async () => {
    const { app } = fresh();
    const r = await requestAccess(app, "r1", ["view_trace"], "   ");
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("SUPPORT_MOTIF_REQUIRED");
  });

  it("une permission financière est refusée dès la demande → 403", async () => {
    const { app } = fresh();
    const r = await requestAccess(app, "r2", ["validate_contribution"]);
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("PRIVILEGE_NOT_GRANTED");
  });

  it("demande valide → 201 pending_approval, zéro approbateur", async () => {
    const { app } = fresh();
    const r = await requestAccess(app, "r3", ["view_trace", "restore_access"]);
    expect(r.statusCode).toBe(201);
    const view = r.json() as { status: string; approverCount: number; requiredApprovals: number };
    expect(view.status).toBe("pending_approval");
    expect(view.approverCount).toBe(0);
    expect(view.requiredApprovals).toBe(2);
  });
});

describe("C17 double approbation COM05", () => {
  it("un seul approbateur ne suffit pas → reste pending", async () => {
    const { app } = fresh();
    await requestAccess(app, "r4", ["restore_access"]);
    const one = await approve(app, "r4", "idn_appr1");
    expect(one.statusCode).toBe(200);
    expect((one.json() as { status: string }).status).toBe("pending_approval");
    // Action refusée car non granted → 403.
    const denied = await act(app, "r4", "restore_access");
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("SUPPORT_ACCESS_EXPIRED");
  });

  it("l'approbateur ne peut être le demandeur → 403 APPROVER_NOT_DISTINCT", async () => {
    const { app } = fresh();
    await requestAccess(app, "r5", ["restore_access"]);
    const self = await approve(app, "r5", "idn_support");
    expect(self.statusCode).toBe(403);
    expect(self.json().code).toBe("APPROVER_NOT_DISTINCT");
  });

  it("deux approbateurs distincts → granted avec expiration posée", async () => {
    const { app } = fresh();
    const two = await grant(app, "r6");
    expect(two.statusCode).toBe(200);
    const view = two.json() as { status: string; approverCount: number; expiresAt: number };
    expect(view.status).toBe("granted");
    expect(view.approverCount).toBe(2);
    expect(view.expiresAt).toBe(Date.parse(T0) / 1000 + 1800);
  });
});

describe("C17-JIT action, expiration et périmètre", () => {
  it("action autorisée dans la fenêtre → accessAllowed true", async () => {
    const { app } = fresh();
    await grant(app, "r7");
    const r = await act(app, "r7", "restore_access", IN_WINDOW);
    expect(r.statusCode).toBe(200);
    expect((r.json() as { accessAllowed: boolean }).accessAllowed).toBe(true);
  });

  it("action après expiration serveur → 403 SUPPORT_ACCESS_EXPIRED", async () => {
    const { app } = fresh();
    await grant(app, "r8");
    const r = await act(app, "r8", "restore_access", AFTER_TTL);
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("SUPPORT_ACCESS_EXPIRED");
  });

  it("permission non accordée → 403 PRIVILEGE_NOT_GRANTED", async () => {
    const { app } = fresh();
    // r9 granted n'a que restore_access + view_trace (cf. grant).
    await grant(app, "r9");
    const r = await act(app, "r9", "explain_journal", IN_WINDOW);
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("PRIVILEGE_NOT_GRANTED");
  });

  it("révocation immédiate coupe l'accès → 403", async () => {
    const { app } = fresh();
    await grant(app, "r10");
    const revoke = await app.inject({
      method: "POST",
      url: "/v1/support/access-requests/r10/revocations",
      headers: h("idn_appr1", IN_WINDOW),
      payload: {},
    });
    expect(revoke.statusCode).toBe(200);
    expect((revoke.json() as { status: string }).status).toBe("revoked");
    const r = await act(app, "r10", "restore_access", IN_WINDOW);
    expect(r.statusCode).toBe(403);
  });

  it("lecture sous un chemin d'un autre groupe → 404 non-divulgation (anti-IDOR)", async () => {
    const { app } = fresh();
    await requestAccess(app, "r11", ["view_trace"], "motif", "grpA");
    const wrong = await app.inject({
      method: "GET",
      url: "/v1/groups/grpB/support/access-requests/r11",
      headers: h("idn_reader", IN_WINDOW, ["grpB"]),
    });
    expect(wrong.statusCode).toBe(404);
    const ok = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/support/access-requests/r11",
      headers: h("idn_reader", IN_WINDOW, ["grpA"]),
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe("C17-FINANCE : aucun pouvoir financier, même sur accès granted", () => {
  it("toute action financière → 403 SUPPORT_FINANCIAL_FORBIDDEN, jamais exécutée", async () => {
    const { app } = fresh();
    await grant(app, "r12");
    for (const fin of ["validate_contribution", "correct_contribution", "reverse_disbursement"]) {
      const r = await act(app, "r12", fin, IN_WINDOW);
      expect(r.statusCode).toBe(403);
      expect(r.json().code).toBe("SUPPORT_FINANCIAL_FORBIDDEN");
    }
  });
});

describe("C17-LOGS : journal de sécurité expurgé", () => {
  it("une canary sensible du motif n'apparaît JAMAIS dans le journal de sécurité", async () => {
    const { app, store } = fresh();
    const tel = "+241 01 23 45 67";
    const ref = "TXN-AB12CD34";
    await requestAccess(app, "r13", ["restore_access"], `client ${tel} réf ${ref}`);
    const entries = store.securityLogEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.detail).not.toContain(tel);
      expect(e.detail).not.toContain(ref);
      expect(e.detail).not.toContain("01 23 45 67");
    }
  });

  it("une action financière refusée est consignée sous son type dédié (expurgée)", async () => {
    const { app, store } = fresh();
    await grant(app, "r14");
    await act(app, "r14", "reverse_disbursement", IN_WINDOW);
    expect(store.securityEventCount("grpA", "support_financial_action_refused")).toBe(1);
    // Le granted a bien été consigné au fil du flux.
    expect(store.securityEventCount("grpA", "support_access_granted")).toBe(1);
  });
});
