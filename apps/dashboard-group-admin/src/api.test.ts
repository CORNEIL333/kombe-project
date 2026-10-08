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
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : {};
      calls.push({ url: String(url), method: init.method ?? "GET", headers });
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
    expect(calls.map((c) => ({ url: c.url, method: c.method }))).toEqual([
      { url: "https://api.example.invalid/v1/groups/grpA/cycle-readiness", method: "GET" },
      { url: "https://api.example.invalid/v1/groups/grpA/memberships", method: "POST" },
    ]);
  });
});

describe("GroupAdminApi — actions C07/C08 : aucun x-actor, if-match-version conservé", () => {
  it("confirmContribution: version exigée, jamais d'en-tête x-actor", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.confirmContribution("grpA", "ctb_1", 3);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://api.example.invalid/v1/groups/grpA/contributions/ctb_1/confirmations",
      method: "POST",
      headers: { "if-match-version": "3" },
    });
    expect(calls[0]?.headers["x-actor"]).toBeUndefined();
  });

  it("declareDisbursement: aucune version sur une création (CREATE, pas de mutation d'objet existant)", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.declareDisbursement(
      "grpA",
      {
        disbursementId: "dsb_1",
        roundId: "rnd_1",
        obligationId: "obl_1",
        beneficiaryIdentityId: "idn_b",
        netAmount: "50000",
        groupFees: "0",
        requiredControllers: 1,
        allegedDate: 1_700_000_000,
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.invalid/v1/groups/grpA/disbursements");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers["if-match-version"]).toBeUndefined();
    expect(calls[0]?.headers["x-actor"]).toBeUndefined();
  });

  it("requestDisbursementReversal: route /reversal-requests avec motif et version", async () => {
    const calls = stubFetch();
    const api = new GroupAdminApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.requestDisbursementReversal("grpA", "dsb_1", "montant erroné", 2);
    expect(calls[0]).toMatchObject({
      url: "https://api.example.invalid/v1/groups/grpA/disbursements/dsb_1/reversal-requests",
      method: "POST",
      headers: { "if-match-version": "2" },
    });
    expect(calls[0]?.headers["x-actor"]).toBeUndefined();
  });
});
