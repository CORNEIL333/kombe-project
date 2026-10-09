// KÓMBE @kombe/db — GARDE DE SÉCURITÉ « JAMAIS DE TEARDOWN EN PRODUCTION ».
//
// Contexte réel (incident 2026-10-09) : les scripts de recette (proofs base
// réelle, isolation.pg.mjs, migrateEmptyToLatest.pg.mjs) exécutent une boucle
// DOWN qui DROP l'INTÉGRALITÉ du schéma. Ils sont censés ne tourner QUE contre
// une base JETABLE (Neon preview « neondb », kombe_test). Or une variable
// d'environnement RÉSIDUELLE dans le shell ($env:KOMBE_API_DATABASE_URL pointant
// vers kombe_prod) écrase silencieusement « --env-file » (Node ne remplace pas
// une variable déjà définie) : les proofs ont alors visé la PRODUCTION. Ils ne
// l'ont pas détruite UNIQUEMENT parce que le rôle kombe_app n'est pas propriétaire
// des fonctions DDL (erreur « must be owner » = garde-fou accidentel).
//
// Cette garde rend la protection DÉLIBÉRÉE : avant tout teardown, on vérifie le
// nom de la base réellement connectée ; s'il figure dans la liste de production,
// on ABORTE immédiatement et bruyamment. Convention de sortie 04_Harness :
// 2 = BLOCKED (refus explicite, jamais une exécution silencieuse).
//
// Échappatoire légitime : un rollback PROD volontaire doit passer par le runner
// de migration (packages/db/scripts/migrate.mjs) ou une procédure documentée,
// JAMAIS par un script de recette. Il n'existe AUCUN flag pour « forcer » un
// teardown de preuve sur production — c'est le point.

const DEFAULT_PROD_DB_NAMES = ['kombe_prod'];

function prodDbNames() {
  const raw = process.env.KOMBE_PROD_DATABASE_NAMES;
  if (!raw || !raw.trim()) return DEFAULT_PROD_DB_NAMES;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Nom de base extrait d'une chaîne de connexion (segment de chemin). */
export function dbNameFromUrl(url) {
  const s = String(url || '');
  const noQuery = s.split('?')[0];
  const seg = noQuery.split('/').pop();
  return (seg || '').trim();
}

/** Refus sur URL (contrôle de configuration, avant même de se connecter). */
export function assertNonProdUrl(url, target) {
  const db = dbNameFromUrl(url);
  const blocked = prodDbNames();
  if (blocked.includes(db)) {
    process.stderr.write(
      JSON.stringify(
        {
          target: target || 'kombe.db.guard',
          status: 'BLOCKED',
          reason: `TEARDOWN REFUSÉ : la base « ${db} » est en liste de production (KOMBE_PROD_DATABASE_NAMES). ` +
            "Les scripts de recette font un DROP complet du schéma — JAMAIS sur production. " +
            "Vérifiez que KOMBE_API_DATABASE_URL / KOMBE_DATABASE_URL pointent vers une base JETABLE " +
            "(Neon preview « neondb » ou kombe_test). Un var d'env résiduelle du shell écrase « --env-file » : " +
            "en cas de doute, relire la base réellement connectée.",
          exitCode: 2,
        },
        null,
        2,
      ) + '\n',
    );
    process.exit(2);
  }
  return db;
}

/** Refus sur la base RÉELLEMENT connectée (attrape redirections/poolers). */
export async function assertNonProdTeardown(client, target) {
  const res = await client.query('SELECT current_database() AS db');
  const db = res.rows[0].db;
  const blocked = prodDbNames();
  if (blocked.includes(db)) {
    process.stderr.write(
      JSON.stringify(
        {
          target: target || 'kombe.db.guard',
          status: 'BLOCKED',
          reason: `TEARDOWN REFUSÉ : base connectée « ${db} » = production (KOMBE_PROD_DATABASE_NAMES). ` +
            'Abandon avant tout DROP.',
          exitCode: 2,
        },
        null,
        2,
      ) + '\n',
    );
    process.exit(2);
  }
  return db;
}
