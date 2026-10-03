// @vitest-environment jsdom
/**
 * Couverture du client HTTP de dashboard-core : construction d'URL (jointure,
 * requête), en-têtes (accept/content-type/CSRF), repli 204, et ApiError sur
 * réponse non-OK. `fetch` est stubbé — aucun serveur requis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";

type Call = { url: string; init: RequestInit };
type FakeResponse = {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
};

function stubFetch(next: () => FakeResponse): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      const r = next();
      const headers = new Headers(r.headers ?? {});
      return {
        ok: r.ok,
        status: r.status,
        headers,
        json: async () => r.json,
        text: async () => r.text ?? "",
      } as unknown as Response;
    }),
  );
  return calls;
}

// Appel garanti capturé (stubFetch pushed exactly one before assertions).
const only = (calls: Call[]): Call => calls[0] as Call;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

describe("ApiClient.joinUrl", () => {
  it("joint base + chemin et encode la requête (null/undefined ignorés)", async () => {
    const calls = stubFetch(() => ({ ok: true, status: 200, headers: { "content-type": "application/json" }, json: {} }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid/" });
    await api.get("/v1/groups", { limit: 5, q: "a b", skip: null, flag: true });
    expect(only(calls).url).toBe("https://api.example.invalid/v1/groups?limit=5&q=a+b&flag=true");
  });

  it("exige un chemin absolu ('/…')", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: {} }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid" });
    await expect(api.get("groups")).rejects.toThrow("API path must start with '/'.");
  });
});

describe("ApiClient.request — en-têtes et options", () => {
  it("GET : accept json, sans content-type ni CSRF ; credentials/no-store/redirect", async () => {
    const calls = stubFetch(() => ({ ok: true, status: 200, json: {} }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid", getCsrfToken: () => "tok" });
    await api.get("/v1/x");
    const c = only(calls);
    const h = c.init.headers as Headers;
    expect(c.init.method).toBe("GET");
    expect(h.get("accept")).toBe("application/json");
    expect(h.get("content-type")).toBeNull();
    expect(h.get("x-csrf-token")).toBeNull(); // CSRF réservé aux mutations
    expect(c.init.credentials).toBe("include");
    expect(c.init.cache).toBe("no-store");
    expect(c.init.redirect).toBe("error");
  });

  it("POST : content-type json + en-tête CSRF ; corps sérialisé", async () => {
    const calls = stubFetch(() => ({ ok: true, status: 201, json: { id: 1 } }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid", getCsrfToken: () => "tok", csrfHeaderName: "x-csrf-token" });
    await api.post("/v1/groups", { a: 1 });
    const c = only(calls);
    const h = c.init.headers as Headers;
    expect(c.init.method).toBe("POST");
    expect(c.init.body).toBe(JSON.stringify({ a: 1 }));
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-csrf-token")).toBe("tok");
  });

  it("204 : renvoie null (pas de corps à décoder)", async () => {
    stubFetch(() => ({ ok: true, status: 204 }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid" });
    expect(await api.get("/v1/noop")).toBeNull();
  });
});

describe("ApiClient — ApiError sur réponse non-OK", () => {
  it("transporte status, code, message, body et x-correlation-id", async () => {
    stubFetch(() => ({
      ok: false,
      status: 403,
      headers: { "content-type": "application/json", "x-correlation-id": "req-42" },
      json: { message: "Acces refuse", code: "FORBIDDEN" },
    }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid" });
    await expect(api.get("/v1/secret")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/v1/secret")).rejects.toMatchObject({
      status: 403, code: "FORBIDDEN", message: "Acces refuse", correlationId: "req-42",
      body: { message: "Acces refuse", code: "FORBIDDEN" },
    });
  });

  it("message générique quand le corps n'a ni message ni error", async () => {
    stubFetch(() => ({ ok: false, status: 500, headers: { "content-type": "application/json" }, json: { unexpected: true } }));
    const api = new ApiClient({ baseUrl: "https://api.example.invalid" });
    await expect(api.get("/v1/boom")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/v1/boom")).rejects.toMatchObject({
      message: "Requête refusée par le serveur.", code: null,
    });
  });
});
