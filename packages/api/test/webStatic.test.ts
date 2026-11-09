/** Service du site web à la même origine : confiné, jamais sous /v1. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWebStatic, resolveWebFile } from "../src/webStatic.js";

const root = mkdtempSync(join(tmpdir(), "kombe-web-"));
mkdirSync(join(root, "bureau", "assets"), { recursive: true });
writeFileSync(join(root, "index.html"), "<p>pwa</p>");
writeFileSync(join(root, "bureau", "index.html"), "<p>bureau</p>");
writeFileSync(join(root, "bureau", "assets", "a.js"), "1");
writeFileSync(join(root, "kombe-dashboard-config.json"), '{"apiBaseUrl":"/"}');

describe("resolveWebFile", () => {
  it("confine à la racine", () => {
    expect(resolveWebFile(root, "/../../etc/passwd")).toBeNull();
    expect(resolveWebFile(root, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
    expect(resolveWebFile(root, "/bureau/")).toBe(join(root, "bureau", "index.html"));
    expect(resolveWebFile(root, "/absent.js")).toBeNull();
  });
});

describe("registerWebStatic", () => {
  const app = Fastify();
  app.get("/v1/health", async () => ({ ok: true }));
  registerWebStatic(app, root);
  it("sert la PWA, les tableaux de bord et la configuration", async () => {
    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.statusCode).toBe(200);
    expect(home.headers["content-type"]).toMatch(/text\/html/);
    expect(home.headers["x-frame-options"]).toBe("DENY");
    expect(home.headers["content-security-policy"]).toMatch(/script-src .self./);
    expect((await app.inject({ method: "GET", url: "/bureau" })).statusCode).toBe(301);
    expect((await app.inject({ method: "GET", url: "/bureau/" })).body).toContain("bureau");
    const asset = await app.inject({ method: "GET", url: "/bureau/assets/a.js" });
    expect(asset.headers["cache-control"]).toMatch(/immutable/);
    expect((await app.inject({ method: "GET", url: "/kombe-dashboard-config.json" })).json()).toEqual({ apiBaseUrl: "/" });
  });
  it("une route /v1 inconnue reste une erreur d'API (jamais une page)", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/absente" });
    expect(r.statusCode).toBe(404);
    expect(r.json().code).toBe("NOT_FOUND");
    expect((await app.inject({ method: "POST", url: "/" })).statusCode).toBe(404);
  });
});

describe("CSP", () => {
  it("vercel.json porte exactement la CSP servie par l'API", async () => {
    const { readFileSync } = await import("node:fs");
    const { WEB_CSP } = await import("../src/webStatic.js");
    const conf = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as {
      headers: { headers: { key: string; value: string }[] }[];
    };
    const csp = conf.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toBe(WEB_CSP);
  });
});
