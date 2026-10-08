# ROLLBACK — KÓMBE

Stratégie de retour arrière **hôte-agnostique**, ancrée sur deux leviers réels
du dépôt : la table de jalons `kombe_migration` (idempotence du runner) et les
fichiers `*.down.sql` (23 migrations). Aucun PASS déclaré sans exécution.

## 1. Principe

- **Schéma** : réversible fichier par fichier via `migrations/NNNN_*.down.sql`,
  chacun dans sa propre transaction (`BEGIN`/`COMMIT`), objets détruits en
  `IF EXISTS`. Le runner `node packages/db/scripts/migrate.mjs migrate` ne
  réapplique que les jalons absents : ré-exécution sûre après retour arrière.
- **Données** : les `.down.sql` détruisent les colonnes/tables ajitives — un
  retour arrière de schéma **sans restauration de dump = perte des données
  créées sous le nouveau schéma**. D'où la règle §2.
- **Application** : image précédente = code précédent ; les deux seuls contrats
  à tenir entre versions sont l'API (OpenAPI versionné) et le schéma.

## 2. Matrice de décision

| Situation | Action |
|---|---|
| Déploiement applicatif défaillant, schéma **inchangé** | Re-déployer l'image précédente. Aucune action base. |
| Migration déjà appliquée + données écrites sous le nouveau schéma | **Restauration dump** (DEPLOY.md §6.3) — jamais un `down.sql` seul. |
| Migration appliquée, **aucune donnée** écrite sous le nouveau schéma | Retour arrière ciblé : appliquer les `.down.sql` nécessaires dans l'ordre inverse, puis `DELETE FROM kombe_migration WHERE name = ...` pour chaque jalon retiré. |

## 3. Procédure (restauration complète — cas données écrites)

1. Stopper l'API (ne plus écrire).
2. Nouvelle base `kombe_rollback` : `pg_restore` du dernier dump vérifié
   (DEPLOY.md §6.2) puis runner idempotent pour combler l'écart de jalons.
3. Basculer `KOMBE_API_DATABASE_URL` / `KOMBE_DATABASE_URL` vers
   `kombe_rollback`, redémarrer l'API.
4. Vérifier : `GET /v1/health/ready` → `{"status":"ready","mode":"réel"}` ;
   sondes applicatives métier (déclaration, journal, gouvernance).
5. Ne détruire l'ancienne base qu'après observation saine (rétention du dump).

## 4. Statut d'exécution

- **Authorship** : stratégie rédigée (ce document), cohérente avec DEPLOY.md §6.
- **Exécution réelle** : **NON EXÉCUTÉE** — aucun retour arrière n'a encore été
  nécessaire ; la restauration qu'elle exige (§3.2) est elle-même
  **BLOCKED_EXTERNAL** (binaires PG absents, DEPLOY.md §6.4). Le premier
  déploiement staging fournira le premier terrain d'exécution réel du §3.
