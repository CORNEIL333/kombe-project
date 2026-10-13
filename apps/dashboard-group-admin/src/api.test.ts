// @vitest-environment jsdom
/**
 * Espace bureau : chaque appel vise la VRAIE API tontine (/v1/tontines/…),
 * toute écriture porte une clé d'idempotence, et l'export CSV est sûr pour
 * Excel FR (séparateur « ; », guillemets échappés, montants entiers).
 * `fetch` est stubbé : aucun serveur requis.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "@kombe/dashboard-core";
import { GroupAdminApi, toCsv } from "./api";

function stubFetch() {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : {};
      calls.push({ url: String(url), method: init.method ?? "GET", headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k === "content-type" ? "application/json" : null) },
        json: async () => [],
      } as unknown as Response;
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("GroupAdminApi — API tontine réelle", () => {
  it("lectures sous /v1/tontines/:id, identifiants encodés", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.myTontines();
    await api.detail("grp 1");
    await api.grid("grp_1", 3);
    await api.movements("grp_1", { state: "declared" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.example.invalid/v1/me/tontines",
      "https://api.example.invalid/v1/tontines/grp%201",
      "https://api.example.invalid/v1/tontines/grp_1/rounds/3/grid",
      "https://api.example.invalid/v1/tontines/grp_1/movements?state=declared",
    ]);
  });

  it("confirmation en lot et contrôle : POST idempotents", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.confirm("grp_1", ["mv_1", "mv_2"]);
    await api.control("grp_1", "mv_1");
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.example.invalid/v1/tontines/grp_1/movements/confirmations", body: { movementIds: ["mv_1", "mv_2"] } });
    expect(calls[1]?.url).toBe("https://api.example.invalid/v1/tontines/grp_1/movements/mv_1/control");
    for (const c of calls) expect(c.headers["idempotency-key"]).toMatch(/.{8,}/);
    expect(calls[0]?.headers["idempotency-key"]).not.toBe(calls[1]?.headers["idempotency-key"]);
  });
});

describe("export CSV", () => {
  it("séparateur ; , BOM, guillemets échappés", () => {
    const csv = toCsv(["Nom", "Montant (XAF)"], [["Awa; « la présidente »", "25000"], ['Paul "Pa"', 0]]);
    expect(csv.startsWith("﻿Nom;Montant (XAF)\r\n")).toBe(true);
    expect(csv).toContain('"Awa; « la présidente »";25000');
    expect(csv).toContain('"Paul ""Pa""";0');
  });
});
