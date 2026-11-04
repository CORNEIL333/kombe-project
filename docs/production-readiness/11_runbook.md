# 11 — Runbook d'exploitation

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
