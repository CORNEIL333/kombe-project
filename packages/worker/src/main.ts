/**
 * KÓMBE @kombe/worker — point d'entrée d'exécution du consommateur d'outbox
 * (C13). Ce fichier est la SEULE différence entre « la classe PgOutboxWorker
 * est testée par les recettes » et « le worker tourne comme service » : il
 * ne change AUCUNE règle métier (décisions pures dans outbox.ts, SQL dans
 * pgWorker.ts) — il fournit l'ordonnancement (découverte des groupes, boucle
 * bornée, santé HTTP) et l'injection réelle (pool pg, horloge serveur).
 *
 * HONNÊTETÉ :
 *  - Aucune URL de base ⇒ exit 1 immédiat (jamais de boucle fictive qui
 *    tournerait sans base en prétendant traiter l'outbox).
 *  - Canal 'push' externe : aucun prestataire n'est câblé au socle. Le
 *    provider injecté REJETTE explicitement : le domaine trace alors
 *    CHANNEL_NOT_VERIFIED et applique sa politique de reprise. Les droits
 *    relus en base (external_enabled / suspended) restent la première barrière
 *    — sans activation explicite, la tâche est 'suppressed' avant tout appel.
 *    Résultat : jamais un envoi simulé, jamais un succès fake (règle §9).
 *  - La découverte des groupes passe par la fonction SECURITY DEFINER
 *    kombe_c13_pending_groups() (migration 0023) : le rôle kombe_worker ne
 *    peut pas lister l'outbox en direct (RLS c13_worker_tenant), et on ne
 *    lui donne pas de privilège large pour compenser.
 *
 * Logs : lignes de vie sur stdout/stderr uniquement ; aucun jeton, aucun
 * contenu de notification, aucune donnée de prestataire (STACK.md).
 */
import pg from "pg";
import { createServer } from "node:http";
import { PgOutboxWorker } from "./pgWorker.js";
import type { Provider } from "./outbox.js";

const say = (line: string): void => {
  process.stdout.write(`[kombe-worker] ${line}\n`);
};
const sayErr = (line: string, err: unknown): void => {
  process.stderr.write(`[kombe-worker] ${line} : ${String(err)}\n`);
};

function readUrl(): string {
  const url = process.env.KOMBE_WORKER_DATABASE_URL;
  if (!url || url.length === 0) {
    // Fail-loud : un worker sans base ne peut RIEN traiter ; prétendre le
    // contraire serait un backend fictif (interdit).
    process.stderr.write(
      "[kombe-worker] KOMBE_WORKER_DATABASE_URL absente : aucune base joignable, arrêt (pas de mode fictif).\n",
    );
    process.exit(1);
  }
  return url;
}

function readPort(): number {
  const raw = process.env.WORKER_PORT;
  if (raw === undefined || raw === "") return 3001;
  if (!/^\d+$/.test(raw)) throw new Error(`WORKER_PORT invalide : « ${raw} »`);
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error(`WORKER_PORT hors bornes : « ${raw} »`);
  }
  return port;
}

function readPollMs(): number {
  const raw = process.env.WORKER_POLL_MS;
  if (raw === undefined || raw === "") return 1000;
  const ms = Number(raw);
  if (!Number.isSafeInteger(ms) || ms < 50 || ms > 60_000) {
    throw new Error(`WORKER_POLL_MS hors bornes [50, 60000] : « ${raw} »`);
  }
  return ms;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Prestataire push du socle : aucun envoi réel possible → rejet explicite.
 *  Le domaine transforme ce rejet en trace CHANNEL_NOT_VERIFIED + reprise ;
 *  l'état 'delivered' n'est JAMAIS écrit sans acceptation d'un provider réel. */
const noExternalProvider: Provider = {
  async send() {
    return { status: "rejected" };
  },
};

async function main(): Promise<void> {
  const connectionString = readUrl();
  const port = readPort();
  const pollMs = readPollMs();

  // Un pool par rôle (ADR-0022) : connexion authentifiée avec le rôle membre,
  // rôle kombe_worker assumé dès l'établissement (options -c role=...), comme
  // le prouvent isolation.pg.mjs (api) et worker/test/postgres.mjs (worker).
  const pool = new pg.Pool({
    connectionString,
    options: "-c role=kombe_worker",
    max: 5,
  });
  pool.on("error", (err) => sayErr("erreur de pool (connexion rendue au pool)", err));

  const worker = new PgOutboxWorker(pool, noExternalProvider);

  // Santé réelle : le service n'est « sain » que si sa DERNIÈRE requête de
  // découverte auprès de PostgreSQL a réussi — pas un 200 constants.
  let dbReachable = false;
  let stopping = false;
  const healthServer = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
      return;
    }
    const ok = dbReachable && !stopping;
    response.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify(ok ? { status: "ok" } : { status: "degraded" }));
  });
  await new Promise<void>((resolve) => healthServer.listen(port, "127.0.0.1", resolve));

  const shutdown = async (signal: string): Promise<void> => {
    say(`réception ${signal} : arrêt du worker`);
    stopping = true;
    try {
      healthServer.close();
      await pool.end();
      process.exit(0);
    } catch (err) {
      sayErr("échec de la fermeture", err);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  say(
    `à l'écoute (santé : http://127.0.0.1:${port}/health) ; ` +
      "canal push externe : aucun prestataire configuré → rejets tracés CHANNEL_NOT_VERIFIED",
  );

  // Ordonnancement : un tour découvre les groupes à traiter via la fonction
  // dédiée (SECURITY DEFINER, sortie minimale), puis PgOutboxWorker.runOnce
  // consomme AU PLUS une tâche par groupe — chaque prise est bornée par le
  // lease et les verrous SKIP LOCKED (reprise multi-instances sûre).
  while (!stopping) {
    try {
      const pending = await pool.query("SELECT group_id FROM kombe_c13_pending_groups()");
      dbReachable = true;
      let processed = 0;
      for (const row of pending.rows) {
        if (stopping) break;
        const outcome = await worker.runOnce(String(row.group_id));
        if (outcome !== "idle") processed += 1;
      }
      if (processed === 0) await sleep(pollMs);
    } catch (err) {
      dbReachable = false;
      sayErr("tour de découverte échoué (base injoignable ?)", err);
      await sleep(Math.max(pollMs, 5_000));
    }
  }
}

void main();
