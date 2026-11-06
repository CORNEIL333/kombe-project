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

/** Rôle de CONNEXION dédié à l'API (ADR-0045) : LOGIN, membre de `kombe_app`,
 *  sans BYPASSRLS ni propriété des tables. Avec lui, aucune option de
 *  démarrage n'est nécessaire, ce qui ouvre le pooler (PgBouncer, mode
 *  transaction) : le contexte RLS est posé par `set_config(..., true)` /
 *  `SET LOCAL`, à portée de TRANSACTION, donc compatible. */
export const API_LOGIN_ROLE = "kombe_api";

/** Vrai si l'URL se connecte déjà avec le rôle dédié (pas d'option `role`). */
export function connectsAsApiRole(connectionString: string): boolean {
  try {
    return decodeURIComponent(new URL(connectionString).username) === API_LOGIN_ROLE;
  } catch {
    return false;
  }
}

/** Pool dédié au rôle applicatif `kombe_app`. Ne JAMAIS réutiliser ce pool
 *  pour une opération qui exigerait un rôle différent (migrateur, worker) :
 *  un pool par rôle, conformément au cloisonnement ADR-0022.
 *  - URL en `kombe_api` (cible, compatible pooler) : connexion telle quelle ;
 *  - autre URL (historique : propriétaire + connexion directe) : le rôle
 *    `kombe_app` est assumé dès la connexion (`-c role=kombe_app`), refusé
 *    par les poolers — d'où le rôle dédié. */
export function createApiPool(opts: PgPoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: opts.connectionString,
    ...(connectsAsApiRole(opts.connectionString) ? {} : { options: "-c role=kombe_app" }),
    max: opts.max ?? readPoolMax(),
    // Une connexion inactive est rendue vite (serverless : beaucoup d'instances,
    // plafond de connexions directes côté Neon) ; une attente de connexion
    // bornée échoue proprement plutôt que d'empiler les requêtes.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Taille du pool par instance : `KOMBE_PG_POOL_MAX` (1–50, défaut 10). */
export function readPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.KOMBE_PG_POOL_MAX);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 10;
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

/** Résultat de la vérification de moindre privilège de la connexion applicative. */
export interface DbRoleCheck {
  readonly ok: boolean;
  readonly currentUser: string;
  readonly reasons: readonly string[];
}

/**
 * Garde « moindre privilège » (ADR-0045) : la connexion de l'API ne doit ni
 * contourner la RLS (superuser, BYPASSRLS), ni posséder les tables, ni pouvoir
 * endosser un rôle qui le ferait ; elle doit hériter des droits de `kombe_app`.
 * Une seule requête, indépendante du mode de connexion.
 */
export async function checkDbRole(db: { query: pg.Pool["query"] }): Promise<DbRoleCheck> {
  const r = await db.query(`
    SELECT current_user AS u,
           r.rolsuper AS su,
           r.rolbypassrls AS bypass,
           pg_has_role(current_user, 'kombe_app', 'USAGE') AS app,
           EXISTS (SELECT 1 FROM pg_class c
                    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
                      AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owner_reach,
           EXISTS (SELECT 1 FROM pg_roles x
                    WHERE (x.rolsuper OR x.rolbypassrls) AND x.rolname <> current_user
                      AND pg_has_role(current_user, x.oid, 'MEMBER')) AS escalate
      FROM pg_roles r WHERE r.rolname = current_user`);
  const x = r.rows[0] ?? {};
  const reasons: string[] = [];
  if (x.su === true) reasons.push("superutilisateur");
  if (x.bypass === true) reasons.push("BYPASSRLS");
  if (x.app !== true) reasons.push("n'hérite pas de kombe_app");
  if (x.owner_reach === true) reasons.push("peut agir comme propriétaire de tables (RLS contournée)");
  if (x.escalate === true) reasons.push("peut endosser un rôle superutilisateur ou BYPASSRLS");
  return { ok: reasons.length === 0, currentUser: String(x.u ?? "?"), reasons };
}

const verified = new WeakMap<object, Promise<DbRoleCheck>>();
/** Vérifie une fois par pool (et par instance) ; refuse de servir sinon (fermé par défaut). */
export async function assertDbRole(pool: { query: pg.Pool["query"] }): Promise<void> {
  let p = verified.get(pool);
  if (!p) {
    p = checkDbRole(pool);
    verified.set(pool, p);
    p.catch(() => verified.delete(pool)); // panne réseau : on revérifiera
  }
  const c = await p;
  if (!c.ok) throw new Error(`Connexion applicative trop privilégiée (${c.currentUser} : ${c.reasons.join(", ")}) — service refusé`);
}
