# 11 — Runbook d'exploitation

## Base de production : identification (à lire avant toute opération)

| Élément | Production | Ce qui n'est PAS la production |
|---|---|---|
| Projet Neon | `square-resonance-19892972` (« kombe », Francfort) | le projet LYNKSTORmobile |
| Branche | **`production`** (`br-red-river-b1ymeb4o`), branche **par défaut** du projet | `preview-piste-a-claude` (`br-wild-sunset-b10uf45r`) et ses branches `preview-fork-*` : anciennes pistes d'octobre |
| Point d'accès | `ep-ancient-glade-b148md5t` | `ep-dry-wildflower-b19ptfwl` |
| Base | **`neondb`** | **`kombe_prod`** : malgré son nom, une ancienne piste **vide** (51 tables, aucune donnée, migrations arrêtées à 0025 le 09/10/2026). Personne n'y pointe. Conservée, ne jamais la migrer ni la sauvegarder. |
| Variables Vercel (Production) | `KOMBE_API_DATABASE_URL` (application) et `KOMBE_MIGRATION_DATABASE_URL` (migrations du build) pointent vers `neondb` sur `production`. Le journal du build affiche « Base migrée : <point d'accès> / <base> ». | — |

État au 06/11/2026 (après le déploiement de 16:30 UTC) :
- code : branche `claude/continue-previous-a102rx` @ `f68903f`, qui contient la 0.8.0 et les 4 commits suivants de `refonte/premium-photos` ;
- migrations jusqu'à `0040_performance_charge` (0036 à 0040 appliquées par le build, base `ep-ancient-glade / neondb`) ;
- **API branchée sur le pooler** en `kombe_api` (`KOMBE_API_DATABASE_URL` poolée) ;
- `KOMBE_MFA_KEY` et `KOMBE_TOKEN_PEPPER` posées ;
- 20 identités, 6 groupes, 14 adhésions, aucun opérateur.

Retours arrière possibles :
- le déploiement d'avant le pooler (même code, connexion directe) ;
- la 0.8.0 (`dpl_BnCUaCTNXxPigXEeo69SxjkPWQpf`).

Les migrations 0036 à 0040 sont additives : l'ancien code fonctionne avec elles.

Règle : la production est **la branche par défaut du projet**, jamais une base désignée par son nom.

## Bascule de l'API vers le pooler (rôle `kombe_api`, ADR-0045)

**Fait le 06/11/2026.** `kombe_api` est ouvert en production et l'URL poolée est en place. Le pooler est vérifié côté base : `pg_stat_activity` montre `kombe_api` avec `application_name = pgbouncer`. La procédure ci-dessous reste valable pour changer le mot de passe ou pour revenir en arrière.

**Étapes.**
1. **Ouvrir le rôle**, dans l'éditeur SQL de Neon : branche `production`, base `neondb`, rôle `neondb_owner`. Le mot de passe est généré par `openssl rand -hex 24`, ne contient que des caractères hexadécimaux et ne doit jamais être conservé ailleurs.
   ```sql
   ALTER ROLE kombe_api LOGIN PASSWORD '<mot de passe>';
   ```
2. **Construire l'URL poolée.** Attention au suffixe `-pooler` :
   ```
   postgresql://kombe_api:<mot de passe>@ep-ancient-glade-b148md5t-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
3. **Remplacer `KOMBE_API_DATABASE_URL` dans Vercel** (Production, type *Sensitive*) par cette URL. Noter l'ancienne valeur pour un retour arrière éventuel.
   Ne **pas** toucher à `KOMBE_MIGRATION_DATABASE_URL` : les migrations restent en connexion directe, avec le rôle propriétaire.
4. **Redéployer**, puis vérifier `/v1/health/ready`.
   - Réponse attendue : `{"status":"ready", …}`.
   - `privilege.ok=false` signifie que la connexion est trop privilégiée : le service est refusé (fermé par défaut).
   - Puis lancer `release-smoke.mjs`.

**Retour arrière.** Remettre l'ancienne `KOMBE_API_DATABASE_URL` et redéployer : le code accepte les deux modes.

**Réglage.** Garder `KOMBE_PG_POOL_MAX=10`. Derrière le pooler, ce sont des connexions *clientes*, peu coûteuses ; le pooler partage un petit nombre de connexions serveur.

## État du schéma et retour arrière d'une migration

- **Lecture seule** : `KOMBE_DATABASE_URL=<URL migrateur> node packages/db/scripts/migrate.mjs status`. Le résultat liste les jalons appliqués, ceux en attente, les jalons inconnus et la dernière migration.
- **Défaire une migration** : `migrate.mjs down migrations/00NN_nom.sql`.
  - Une seule migration à la fois : la dernière appliquée, nommée explicitement.
  - Le fichier `.down.sql` et la suppression du jalon s'exécutent dans une même transaction.
  - En production, il faut en plus `KOMBE_CONFIRM_PROD_DOWN=<même nom>`, et une sauvegarde Neon d'abord. Certains retours arrière refusent de s'exécuter s'il existe des données (CRM) ou défont des empreintes (0042 : reconnexion de tous).

## Sauvegarde avant chaque mise à jour

- **Une seule** branche de sauvegarde par version, créée juste avant le déploiement, depuis la branche par défaut :
  ```
  NEON_API_KEY=… node scripts/neon-sauvegarde.mjs 0.8.1
  ```
  Le nom est `sauvegarde-avant-0-8-1-AAAAMMJJ`. Le script refuse une seconde sauvegarde pour la même version et ne supprime rien.
- On **conserve les 2 dernières** sauvegardes. Les plus anciennes sont supprimées dans la console Neon une fois la nouvelle version validée en production.
- Les **branches de répétition** (`test-…`), qui servent à essayer les migrations sur une copie, sont supprimées dès la répétition terminée.
- Le plan gratuit limite le projet à 10 branches.

## Mise en production de cette version (propriétaire)

**1. Secrets (Vercel → Project → Settings → Environment Variables, cible Production, type *Sensitive*)**

- `KOMBE_MFA_KEY` : 64 caractères hexadécimaux, générés par `openssl rand -hex 32`.
- `KOMBE_TOKEN_PEPPER` : au moins 32 caractères, générés par `openssl rand -base64 32`.

Ne jamais les coller ailleurs. Les perdre n'est pas grave mais a deux effets :
- les opérateurs devront réactiver leur second facteur ;
- les codes de connexion en cours deviendront invalides.

**2. Fusion puis déploiement**

- Fusionner `claude/continue-previous-a102rx`, ou déployer cette branche.
- Le build applique **automatiquement** les migrations 0035 à 0038. `KOMBE_MIGRATION_DATABASE_URL` est déjà posée.
- Ces migrations ont été répétées sur une copie de la production (voir 06).

**3. Vérifier**

- `https://<domaine>/v1/health/ready` doit répondre `{"status":"ready","schema":{"upToDate":true}}`.
- Puis lancer `KOMBE_SMOKE_BASE_URL=https://<domaine> node scripts/release-smoke.mjs`.

**4. Premier opérateur (depuis un poste qui atteint Neon)**

```
KOMBE_DATABASE_URL='<URL migrateur>' node packages/db/scripts/grant-operator.mjs +2376XXXXXXXX --roles=admin
```

Ensuite, ouvrir `/crm/`, activer le second facteur et **ranger les codes de secours**. Restreindre ensuite chaque personne au strict nécessaire, par exemple `--roles=support`.

**Fonctions et sections du CRM (ADR-0046) :**

| Fonction | Sections visibles dans `/crm/` |
|---|---|
| `support`, `operations` | CRM (demandes, comptes, contacts, tâches, segments), Opérations |
| `direction` | Tableau de bord, comptes, segments, Direction, Conformité |
| `engineering` | Technique, runbooks |
| `admin` | Tout, y compris le journal d'audit et l'anonymisation |

## Incidents

| Symptôme | Action |
|---|---|
| `/v1/health/ready` → 503, `schema.upToDate=false` | Le build est passé sans migration. Relancer le déploiement, ou exécuter `migrate.mjs` avec l'URL du migrateur. |
| `/v1/health/ready` → 503 sans `schema` | La base est injoignable. Voir le statut Neon et le plafond de connexions (voir 12). |
| Erreur 500 signalée par un membre | Demander l'identifiant de corrélation (`x-correlation-id`, affiché par les consoles), puis chercher ce `reqId` dans les journaux Vercel. |
| 429 en masse | Vérifier `KOMBE_RATE_LIMIT_*`. Les membres derrière un même opérateur mobile partagent une IP ; le seau est par session. |
| Opérateur bloqué (téléphone perdu) | Il utilise un code de secours. Sinon, un admin lui retire puis lui rend ses fonctions, et il réactive son second facteur. |
| Notifications non reçues hors de l'application | Lire `notification_outbox` (`state`, `last_code`). Si le code est `EXTERNAL_DISABLED`, le canal n'est pas ouvert (voir 07). |
| Restauration nécessaire | Voir 06, « Procédure de restauration ». |
| Un membre dit « le support ne me répond pas » | `/crm/#/demandes`, filtre « Personne » : assigner la demande. Les dépassements de délai sont comptés au tableau de bord. |
| Demande d'accès, de rectification ou d'effacement de données | Catégorie « Données personnelles » : 30 jours au plus, suivie dans `/crm/#/conformite`. |

## Routines

- **Hebdomadaire.** `security.yml` (audit des dépendances, secrets). Lire les échecs.
- **Mensuelle.** Relecture du journal d'audit du CRM par un `admin` (affichages d'identifiants et leurs motifs).
- **Trimestrielle.** Exercice de restauration sur une branche Neon (voir 06). Revue des fonctions d'opérateur avec `grant-operator --revoke` pour les départs.
- **Annuelle.** Anonymisation des demandes closes depuis plus de 730 jours (`/crm/#/conformite`, fonction `admin`).
- **Avant chaque migration non triviale.** Répétition sur une branche Neon jetable.
