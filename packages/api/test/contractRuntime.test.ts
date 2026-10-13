/**
 * X-01 — Contrat ↔ runtime, dans les deux sens :
 *  1. chaque route RÉELLEMENT déclarée par l'API en mode réel figure dans
 *     docs/openapi.yaml (même méthode, mêmes segments ; le nom des paramètres
 *     est indifférent) ;
 *  2. chaque route du contrat existe à l'exécution (mode réel ou squelette).
 * Les routes du squelette de développement (absentes en mode réel) sont
 * listées explicitement ci-dessous, avec leur raison.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { buildApp, registeredRoutes } from "../src/server.js";
import { NullEmailSender } from "../src/email/emailSender.js";

/** Squelette de développement (stores fictifs) : jamais servi en mode réel. */
const SKELETON_ONLY = new Set([
  "POST /v1/access/sessions",
  "GET /v1/access/sessions/:",
  "POST /v1/access/sessions/:/revocations",
  "POST /v1/groups/:/journal-appends",
]);

const norm = (method: string, path: string) => `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, ":").replace(/:[A-Za-z_]\w*/g, ":")}`;

const doc = yaml.load(readFileSync(resolve(__dirname, "../../../docs/openapi.yaml"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};
const documented = new Set<string>();
for (const [p, ops] of Object.entries(doc.paths)) {
  for (const m of Object.keys(ops)) if (["get", "post", "put", "patch", "delete"].includes(m)) documented.add(norm(m, `/v1${p}`));
}

async function routesOf(real: boolean): Promise<Set<string>> {
  const pool = real ? new pg.Pool({ connectionString: "postgres://contract@127.0.0.1:1/none" }) : undefined;
  const app = buildApp(pool ? { pool, emailSender: new NullEmailSender() } : {});
  await app.ready();
  const out = new Set(registeredRoutes(app).filter((r) => r.url.startsWith("/v1")).map((r) => norm(r.method, r.url)));
  await app.close();
  await pool?.end();
  return out;
}

describe("contrat OpenAPI ↔ runtime", () => {
  it("toute route du mode réel est au contrat", async () => {
    const real = await routesOf(true);
    expect(real.size).toBeGreaterThan(100);
    expect([...real].filter((r) => !documented.has(r)).sort()).toEqual([]);
  });

  it("toute route du contrat existe à l'exécution", async () => {
    const all = new Set([...(await routesOf(true)), ...(await routesOf(false))]);
    expect([...documented].filter((r) => !all.has(r)).sort()).toEqual([]);
  });

  it("le squelette de développement reste hors du mode réel", async () => {
    const real = await routesOf(true);
    for (const r of SKELETON_ONLY) expect(real.has(r), r).toBe(false);
  });
});
