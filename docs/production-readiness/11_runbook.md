# 11 — Runbook d'exploitation

## Base de production : identification (à lire avant toute opération)

| Élément | Production | Ce qui n'est PAS la production |
|---|---|---|
| Projet Neon | `square-resonance-19892972` (« kombe », Francfort) | le projet LYNKSTORmobile |
| Branche | **`production`** (`br-red-river-b1ymeb4o`), branche **par défaut** du projet | `preview-piste-a-claude` (`br-wild-sunset-b10uf45r`) et ses branches `preview-fork-*` : anciennes pistes d'octobre |
| Point d'accès | `ep-ancient-glade-b148md5t` | `ep-dry-wildflower-b19ptfwl` |
| Base | **`neondb`** | **`kombe_prod`** : malgré son nom, une ancienne piste **vide** (51 tables, aucune donnée, migrations arrêtées à 0025 le 09/10/2026). Personne n'y pointe. Conservée, ne jamais la migrer ni la sauvegarder. |
| Variables Vercel (Production) | `KOMBE_API_DATABASE_URL` (application) et `KOMBE_MIGRATION_DATABASE_URL` (migrations du build) pointent vers `neondb` sur `production`. Le journal du build affiche « Base migrée : <point d'accès> / <base> ». | — |

État au 06/11/2026 :
- dernières migrations `0034_group_photo` et `0035_member_photo`, appliquées le 05/11 à 08:40 UTC par le déploiement 0.8.0 ;
- 20 identités, 6 groupes, 14 adhésions.

Règle : la production est **la branche par défaut du projet**, jamais une base désignée par son nom.

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

Ensuite, ouvrir `/ops/`, activer le second facteur et **ranger les codes de secours**. Restreindre ensuite chaque personne au strict nécessaire, par exemple `--roles=support`.

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

## Routines

- **Hebdomadaire.** `security.yml` (audit des dépendances, secrets). Lire les échecs.
- **Trimestrielle.** Exercice de restauration sur une branche Neon (voir 06). Revue des fonctions d'opérateur avec `grant-operator --revoke` pour les départs.
- **Avant chaque migration non triviale.** Répétition sur une branche Neon jetable.
