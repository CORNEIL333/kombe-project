// @vitest-environment jsdom
/**
 * Régression du bug de préfixe `/v1` : toutes les routes KÓMBE réelles sont
 * enregistrées sous `/v1/...` (packages/api/src/server.ts). Ce test stub
 * `fetch` et vérifie l'URL effectivement appelée, sans dépendre d'un serveur.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@kombe/dashboard-core";
import { OperationsApi } from "./api";

function stubFetch() {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET" });
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k === "content-type" ? "application/json" : null) },
        json: async () => ({}),
      } as unknown as Response;
    }),
  );
  return calls;
}

describe("OperationsApi — toutes les routes passent par /v1", () => {
  it("préfixe lecture et écriture par /v1 (sinon 404 contre le vrai serveur)", async () => {
    const calls = stubFetch();
    const api = new OperationsApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.health();
    await api.createAccess({
      requestId: "req_1",
      targetGroupId: "grpA",
      motif: "vérification",
      permissions: ["view_trace"],
      ttlSeconds: 900,
    });
    expect(calls).toEqual([
      { url: "https://api.example.invalid/v1/health", method: "GET" },
      { url: "https://api.example.invalid/v1/support/access-requests", method: "POST" },
    ]);
  });
});
