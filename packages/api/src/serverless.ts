/**
 * KÓMBÉ @kombe/api — handler serverless (Vercel, §25).
 *
 * Même buildApp(), mêmes règles métier que main.ts — seul le transport change :
 * le module construit l'app une fois au chargement (pool PG inclus) et la sert
 * en ré-émettant chaque requête Node entrante vers le serveur Fastify interne.
 * La promesse d'initialisation est partagée entre invocations : le premier
 * appel attend `app.ready()`, les suivants réutilisent l'instance chaude.
 *
 * HONNÊTETÉ identique à main.ts : sans KOMBE_API_DATABASE_URL l'app retombe en
 * mode fictif et /v1/health/ready le dit (mode:"fictif") — en production le
 * smoke (§22) échoue alors bruyamment, jamais silencieusement.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./server.js";
import { createApiPool, readApiDatabaseUrl } from "./db/pgPool.js";

const databaseUrl = readApiDatabaseUrl();
// Garde anti-fictif : en production Vercel, une base absente doit faire
// ÉCHOUER le cold start (500 visibles) plutôt que servir du fictif derrière
// des 200 — le smoke §22 ne peut pas rattraper un mensonge silencieux.
if (!databaseUrl && (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production")) {
  throw new Error("KOMBE_API_DATABASE_URL absente : démarrage en mode fictif refusé en production");
}
const pool = databaseUrl ? createApiPool({ connectionString: databaseUrl }) : undefined;
const app = buildApp(pool ? { pool } : {});
const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ready;
  app.server.emit("request", req, res);
}
