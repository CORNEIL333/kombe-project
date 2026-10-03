// @vitest-environment jsdom
/**
 * Couverture de loadRuntimeConfig : priorité au /kombe-dashboard-config.json
 * servi, repli sur la valeur de secours (VITE_…), et échec strict si aucune
 * URL http(s) réelle n'est disponible. `fetch` est stubbé — aucun serveur requis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeConfig } from "./runtime";

function stubFetch(handler: () => { ok: boolean; json?: unknown } | "reject") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = handler();
      if (r === "reject") throw new Error("network down");
      return {
        ok: r.ok,
        json: async () => r.json,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

describe("loadRuntimeConfig", () => {
  it("utilise la config servie (apiBaseUrl + gateway + environment)", async () => {
    stubFetch(() => ({
      ok: true,
      json: { apiBaseUrl: "https://api.conf", engineeringGatewayBaseUrl: "https://gw.conf", environment: "prod" },
    }));
    expect(await loadRuntimeConfig("https://fb.invalid")).toEqual({
      apiBaseUrl: "https://api.conf",
      engineeringGatewayBaseUrl: "https://gw.conf",
      environment: "prod",
    });
  });

  it("omet le gateway si son URL est invalide, mais garde l'apiBaseUrl valide", async () => {
    stubFetch(() => ({ ok: true, json: { apiBaseUrl: "https://api.conf", engineeringGatewayBaseUrl: "file:///bad" } }));
    expect(await loadRuntimeConfig("https://fb.invalid")).toEqual({ apiBaseUrl: "https://api.conf" });
  });

  it("retombe sur la valeur de secours quand fetch échoue", async () => {
    stubFetch(() => "reject");
    expect(await loadRuntimeConfig("https://fb.invalid")).toEqual({ apiBaseUrl: "https://fb.invalid" });
  });

  it("retombe sur la valeur de secours si l'apiBaseUrl servi est invalide", async () => {
    stubFetch(() => ({ ok: true, json: { apiBaseUrl: "file:///bad" } }));
    expect(await loadRuntimeConfig("https://fb.invalid")).toEqual({ apiBaseUrl: "https://fb.invalid" });
  });

  it("lève si aucune URL réelle n'est configurée (ni servie ni secours)", async () => {
    stubFetch(() => "reject");
    await expect(loadRuntimeConfig("")).rejects.toThrow("Aucune URL API réelle configurée.");
  });
});
