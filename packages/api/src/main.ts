/**
 * KÓMBE @kombe/api — point d'entrée d'exécution (service HTTP réel).
 *
 * Ce fichier est la SEULE différence entre « l'app est testée par inject »
 * (buildApp + fastify.inject dans les tests) et « le service écoute un port ».
 * Il ne change AUCUNE règle métier : il se contente de démarrer l'app Fastify
 * construite par buildApp() sur l'horôte/port lus dans l'environnement.
 *
 * HONNÊTETÉ : quand KOMBE_API_DATABASE_URL est posée, l'API sert ses stores
 * Pg* persistants (sessions Bearer résolues côté serveur, RLS kombe_app par
 * transaction, aucun x-actor). Sans cette variable, elle retombe
 * explicitement sur les stores FICTIFS en mémoire de C00 — état de repli du
 * squelette, jamais un backend de production (en mode réel, les routes sans
 * store PG réel répondent 404 plutôt que de servir des données fictives).
 */
import { buildApp } from "./server.js";
import { createApiPool, readApiDatabaseUrl } from "./db/pgPool.js";

// Le socle C00 construit Fastify avec `logger: false` (pas de sortie structurée
// activée). Pour que le cycle de vie du service reste OBSERVABLE au déploiement,
// ces quelques lignes de vie sont écrites directement sur stdout/stderr — sans
// réactiver le logger ni loguer quoi que ce soit de sensible (STACK.md).
const say = (line: string): void => {
  process.stdout.write(`[kombe-api] ${line}\n`);
};
const sayErr = (line: string, err: unknown): void => {
  process.stderr.write(`[kombe-api] ${line} : ${String(err)}\n`);
};

/** Port d'écoute : env var PORT (défaut 3000). Refuse tout autre chose qu'un
 *  entier 0-65535 (jamais un parsing tolérant qui avalerait « 808O » → 808). */
function readPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") return 3000;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`PORT invalide : « ${raw} » (attendu : entier 0-65535)`);
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error(`PORT hors bornes : « ${raw} » (attendu : entier 0-65535)`);
  }
  return port;
}

/** Interface d'écoute : HOST (défaut 0.0.0.0, joignable hors conteneur). */
function readHost(): string {
  return process.env.HOST && process.env.HOST.length > 0 ? process.env.HOST : "0.0.0.0";
}

async function main(): Promise<void> {
  // Mode RÉEL (Piste A3) : seulement si KOMBE_API_DATABASE_URL est posée —
  // jamais un pool silencieusement absent qui ferait croire à un mode réel
  // inactif. Périmètre réel : l'ensemble des stores Pg* câblés (voir
  // BuildAppOptions.pool, server.ts) ; toute route sans store PG réel répond
  // 404 en mode réel plutôt que de servir des données fictives.
  const databaseUrl = readApiDatabaseUrl();
  const pool = databaseUrl ? createApiPool({ connectionString: databaseUrl }) : undefined;
  const app = buildApp(pool ? { pool } : {});
  const port = readPort();
  const host = readHost();

  // Arrêt propre : on laisse Fastify fermer les connexions avant d'exit.
  const shutdown = async (signal: string): Promise<void> => {
    say(`réception ${signal} : arrêt du serveur`);
    try {
      await app.close();
      if (pool) await pool.end();
      process.exit(0);
    } catch (err) {
      sayErr("échec de la fermeture", err);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port, host });
    say(
      pool
        ? `à l'écoute sur http://${host}:${port} (mode RÉEL : stores Pg* persistants, sessions Bearer, RLS kombe_app ; santé : GET /v1/health)`
        : `à l'écoute sur http://${host}:${port} (REPLI FICTIF : KOMBE_API_DATABASE_URL absente ; état en mémoire, santé : GET /v1/health)`,
    );
  } catch (err) {
    sayErr("démarrage impossible", err);
    process.exit(1);
  }
}

void main();
