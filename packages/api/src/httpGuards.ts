/**
 * Gardes HTTP transverses (§20/§25) — CORS multi-origines + limitation de
 * débit minimale. Volontairement sans dépendance : le besoin tient en
 * soixante lignes, les plugins (helmet/cors/rate-limit) en ajouteraient dix
 * fois plus pour le même comportement observé.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";

/** Liste fermée d'origines exactes (jamais « * » avec credentials). */
function readOrigins(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.KOMBE_CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => /^https?:\/\//.test(o)),
  );
}

function readCap(envValue: string | undefined, fallback: number): number {
  const n = Number(envValue);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Fenêtre fixe en mémoire : suffisant pour une instance unique ; en
 *  serverless la limite est par instance chaude (DEPLOY.md §7), pas un
 *  garde-fou distribué — documenté, pas masqué. */
class FixedWindow {
  private readonly hits = new Map<string, { start: number; count: number }>();
  constructor(private readonly cap: number, private readonly windowMs: number) {}

  allow(key: string, now: number): boolean {
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (now - v.start > this.windowMs) this.hits.delete(k);
    }
    const slot = this.hits.get(key);
    if (!slot || now - slot.start > this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return true;
    }
    slot.count += 1;
    return slot.count <= this.cap;
  }
}

/** Adresse client pour la limitation de débit. Derrière le proxy Vercel,
 *  `request.ip` est l'adresse interne du sauteur : tous les clients se
 *  partageraient un seul seau (429 collectifs, login verrouillable par un
 *  tiers). On lit `x-real-ip` — posé par la plateforme, jamais transmis tel
 *  quel par le client — et on retombe sur l'adresse socket en exécution
 *  directe (dev, conteneur local). */
function clientIp(request: FastifyRequest): string {
  const real = request.headers["x-real-ip"];
  if (typeof real === "string" && real.trim() !== "") return real.trim();
  return request.ip;
}

export function registerHttpGuards(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env): void {
  const origins = readOrigins(env);
  const globalLimit = new FixedWindow(readCap(env.KOMBE_RATE_LIMIT_GLOBAL, 120), 60_000);
  const authLimit = new FixedWindow(readCap(env.KOMBE_RATE_LIMIT_AUTH, 10), 60_000);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const allowed = origin !== undefined && origins.has(origin);
    if (allowed) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "Origin");
      reply.header("access-control-allow-headers", "content-type, authorization, idempotency-key, if-match-version, x-csrf-token");
      reply.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      // Les clients (PWA, tableaux de bord) appellent en `credentials: include` :
      // sans cet en-tête, le navigateur bloque TOUTE réponse cross-origin.
      // Sûr ici car l'origine est renvoyée exactement (liste fermée, jamais « * »).
      reply.header("access-control-allow-credentials", "true");
      reply.header("access-control-expose-headers", "x-correlation-id, idempotent-replay, retry-after");
      reply.header("access-control-max-age", "600");
    }
    if (request.method === "OPTIONS") {
      await reply.code(allowed ? 204 : 403).send();
      return;
    }

    // Limitation de débit : plafond global par IP, plafond serré sur les
    // routes d'accès (anti-force-brute : sessions, login, registration,
    // recovery sous /v1/access/*).
    const now = Date.now();
    const ip = clientIp(request);
    const isAuthRoute = request.method === "POST" && /^\/v1\/(access|auth)\//.test(request.url);
    if (!globalLimit.allow(ip, now) || (isAuthRoute && !authLimit.allow(ip, now))) {
      await reply.code(429).header("retry-after", "60").send({
        code: "RATE_LIMITED",
        message: "Trop de requêtes, réessayez dans une minute.",
      });
    }
  });
}
