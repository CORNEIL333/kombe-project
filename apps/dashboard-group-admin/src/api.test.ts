// @vitest-environment jsdom
/**
 * Régression du bug de préfixe `/v1` : toutes les routes KÓMBE réelles sont
 * enregistrées sous `/v1/...` (packages/api/src/server.ts). Ce test stub
 * `fetch` et vérifie l'URL effectivement appelée, sans dépendre d'un serveur.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@kombe/dashboard-core";
import { GroupAdminApi } from "./api";

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

describe("GroupAdminApi — toutes les routes passent par /v1", () => {
  it("préfixe lecture et écriture par /v1 (sinon 404 contre le vrai serveur)", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.cycleReadiness("grpA");
    await api.invite("grpA", "idn_new");
    expect(calls).toEqual([
      { url: "https://api.example.invalid/v1/groups/grpA/cycle-readiness", method: "GET" },
      { url: "https://api.example.invalid/v1/groups/grpA/memberships", method: "POST" },
    ]);
  });
});
