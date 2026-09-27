// KÓMBE @kombe/db — porteur d'état honnête pour C00.
//
// Ce script ne SIMULE JAMAIS une exécution SQL réussie. La migration, le seed
// et les tests d'intégration réels (RLS sur kombe_app non-superuser, verrous,
// pool partagé 100 requêtes A/B, FK composites) exigent une PostgreSQL 16+
// réelle et un pilote de test C01 (Testcontainers) non encore raccordé.
// Convention de code de sortie alignée sur le harness : 0 = succès réel,
// 2 = BLOCKED (dépendance indisponible). Voir 04_Harness/README.md.
const actions = {
  migrate:
    "Appliquer migrations/0001_init.sql sur PostgreSQL 16+ réel (rôle migration dédié).",
  seed:
    "Charger fixtures/fictitious.sql dans une base de test isolée après migration.",
  "test:integration":
    "Exécuter les tests C01 : verrous, RLS kombe_app, isolation de pool, FK croisées.",
};

const action = process.argv[2] ?? "migrate";
const reason =
  "Aucun hôte PostgreSQL ni pilote de test C01 (Testcontainers) disponible sur cette machine. " +
  "Ces preuves ne peuvent pas être obtenues par un mock (règle : ne pas mocker PostgreSQL).";

process.stdout.write(
  JSON.stringify(
    {
      target: "kombe.db",
      action,
      intent: actions[action] ?? action,
      status: "BLOCKED",
      reason,
      exitCode: 2,
    },
    null,
    2,
  ) + "\n",
);
process.exit(2);
