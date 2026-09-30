/**
 * KÓMBE @kombe/api — point d'entrée d'exécution (service HTTP réel).
 *
 * Ce fichier est la SEULE différence entre « l'app est testée par inject »
 * (buildApp + fastify.inject dans les tests) et « le service écoute un port ».
 * Il ne change AUCUNE règle métier : il se contente de démarrer l'app Fastify
 * construite par buildApp() sur l'horôte/port lus dans l'environnement.
 *
 * HONNÊTETÉ DU SOCLE : les stores servis sont les FICTIFS en mémoire de C00
 * (l'état réinitialise à chaque redémarrage ; aucune persistance PostgreSQL,
 * pas de session réelle ni de RLS appliquée ici). La persistance et l'identité
 * serveur sont des lots ultérieurs (C01+). Ce démarrage rend le contrat
 * RÉELLEMENT ÉCOUTABLE pour le déploiement du squelette, rien de plus.
 */
import { buildApp } from "./server.js";

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
  const app = buildApp();
  const port = readPort();
  const host = readHost();

  // Arrêt propre : on laisse Fastify fermer les connexions avant d'exit.
  const shutdown = async (signal: string): Promise<void> => {
    say(`réception ${signal} : arrêt du serveur`);
    try {
      await app.close();
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
      `à l'écoute sur http://${host}:${port} (socle C00, stores fictifs en mémoire ; santé : GET /v1/health)`,
    );
  } catch (err) {
    sayErr("démarrage impossible", err);
    process.exit(1);
  }
}

void main();
