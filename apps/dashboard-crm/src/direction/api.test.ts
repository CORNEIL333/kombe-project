// @vitest-environment jsdom
/**
 * Régression du bug de préfixe `/v1` : contrairement à group-admin et
 * operations (corrigés dans ce même changement), direction préfixait déjà
 * `/v1` en dur — ce test fige ce comportement pour éviter une régression
 * inverse (double préfixe) si `dashboard-core` change un jour de convention.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@kombe/dashboard-core";
import { DirectionApi } from "./api";

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

describe("DirectionApi — toutes les routes passent par /v1 (sans doublon)", () => {
  it("appelle /v1/metrics/... exactement une fois préfixé", async () => {
    const calls = stubFetch();
    const api = new DirectionApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.risks();
    await api.extensionCheck();
    expect(calls).toEqual([
      { url: "https://api.example.invalid/v1/metrics/risks", method: "GET" },
      { url: "https://api.example.invalid/v1/metrics/extension-check", method: "GET" },
    ]);
  });
});
