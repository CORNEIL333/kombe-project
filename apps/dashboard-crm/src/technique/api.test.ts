// @vitest-environment jsdom
/**
 * EngineeringApi parle au gateway local lecture-seule (gateway/server.mjs),
 * pas à l'API KÓMBE : ses routes sont `/api/...`, jamais `/v1/...`. Ce test
 * fige la distinction pour éviter qu'un futur alignement sur les autres
 * dashboards n'y ajoute par erreur un préfixe `/v1` qui n'existe pas côté
 * gateway.
 */
import { describe, expect, it, vi } from "vitest";
import { EngineeringApi } from "./api";

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

describe("EngineeringApi — routes du gateway local, pas de préfixe /v1", () => {
  it("appelle /api/... sans préfixe /v1", async () => {
    const calls = stubFetch();
    const api = new EngineeringApi("http://127.0.0.1:4399");
    await api.health();
    await api.lots();
    expect(calls).toEqual([
      { url: "http://127.0.0.1:4399/api/health", method: "GET" },
      { url: "http://127.0.0.1:4399/api/lots", method: "GET" },
    ]);
  });
});
