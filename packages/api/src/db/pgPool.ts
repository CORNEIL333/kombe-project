/**
 * KÓMBE @kombe/api — pool PostgreSQL réel pour la persistance applicative
 * (Piste A1/A2, préprod). Conforme ADR-0022 : connexion DIRECTE (pas de
 * pooler transactionnel pgbouncer — nécessaire pour que `SET LOCAL`/
 * `set_config(..., true)` restent fiables à l'intérieur d'une transaction),
 * rôle `kombe_app` assumé DÈS l'établissement de connexion via l'option de
 * démarrage libpq `-c role=kombe_app` — exactement le mécanisme prouvé par
 * `packages/db/tests/isolation.pg.mjs` (H07 PASS, RLS/verrous réels sur Neon).
 *
 * `kombe_app` est NOLOGIN (provision/roles_create.sql) : la connexion
 * s'authentifie avec le rôle propriétaire (ex. neondb_owner sur Neon,
 * kombe_migrateur membre sur Docker) qui a reçu `GRANT kombe_app TO
 * CURRENT_USER` (provision/roles.sql), puis assume kombe_app pour toute la
 * durée de la session — jamais BYPASSRLS, jamais un accès superuser aux
 * requêtes métier.
 */
import pg from "pg";

export interface PgPoolOptions {
  readonly connectionString: string;
  readonly max?: number;
}

/** Pool dédié au rôle applicatif `kombe_app`. Ne JAMAIS réutiliser ce pool
 *  pour une opération qui exigerait un rôle différent (migrateur, worker) :
 *  un pool par rôle, conformément au cloisonnement ADR-0022. */
export function createApiPool(opts: PgPoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: opts.connectionString,
    options: "-c role=kombe_app",
    max: opts.max ?? 10,
  });
}

/**
 * Lit `KOMBE_API_DATABASE_URL`. Absente ⇒ `undefined` : l'appelant (server.ts)
 * reste alors sur les stores FICTIFS en mémoire — jamais un faux pool silencieux,
 * jamais un PASS simulé. Distincte de `KOMBE_DATABASE_URL` (rôle migrateur,
 * `packages/db/scripts/migrate.mjs`) : l'API ne migre jamais le schéma.
 */
export function readApiDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.KOMBE_API_DATABASE_URL;
  if (!url || url.length === 0) return undefined;
  // Fail-fast (§15) : une valeur présente mais mal formée doit faire échouer
  // le démarrage, pas la première requête.
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("KOMBE_API_DATABASE_URL mal formée (attendu : postgresql://…)");
  }
  return url;
}
