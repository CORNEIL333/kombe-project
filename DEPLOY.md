# DÉPLOIEMENT — KÓMBE

**Version :** phase de déploiement — 2026-10-08.
**Statut :** pile **exécutable et persistée** : API à l'écoute, base PostgreSQL
réelle (25 jalons : `roles_create.sql` + migrations 0001→0023 + `roles.sql`),
identité réelle (session → RLS) en mode réel. Ce document dit exactement ce qui
est réel, prouvé, et ce qui reste ouvert. Aucun PASS simulé.

---

## 0. Ce qui est RÉEL vs FICTIF (à lire avant tout déploiement)

| Brique | État | Preuve / limite |
|---|---|---|
| API Fastify (`packages/api/src/main.ts`) | **RÉEL** | `GET /v1/health` → `{"status":"ok","mode":"réel"}` (pool PG) ou `{"status":"ok","mode":"fictif"}` (repli sans pool). |
| Sondes | **RÉEL** | `/v1/health/live` → 200 `{status:"ok"}` ; `/v1/health/ready` → 200 `{status:"ready",mode}` ou **503** (base injoignable). |
| Persistance API → PostgreSQL | **RÉEL** | Stores PG (journal, cotisations, disbursement, dispute, proposal, validation, règles, planning, métriques, session, découverte worker). Mode réel actif dès que `KOMBE_API_DATABASE_URL` est valide. |
| Migrations + provisioning rôles (`migrate.mjs`) | **RÉEL** | Runner explicite de 25 fichiers, verrou consultatif, transaction par fichier, idempotent (table `kombe_migration`). Preuve §17 exécutée sur base réelle : vide → dernier jalon + seconde passe tout « skipped ». |
| Identité / RLS | **RÉEL** | Résolution session `Bearer <sessionId>` → rôle `kombe_app` (RLS par groupe) ; en-tête `x-actor` **interdit** en mode réel. |
| Worker outbox (C13) | **HORS PÉRIMÈTRE** | Voir `COORDINATION_MULTI_HARNESS/`. |
| Backup/restore | **PROCÉDURE ÉCRITE, EXÉCUTION BLOCKED_EXTERNAL** | §6 ci-dessous. |

---

## 1. Démarrage rapide (Docker)

```bash
cp .env.example .env            # valeurs de dev ; en prod, secrets hors bande
docker compose up --build       # postgres:16 + api (ports 5432 et 3000)
curl http://localhost:3000/v1/health       # → {"status":"ok","mode":"fictif"|"réel"}
curl http://localhost:3000/v1/health/ready # → {"status":"ready",…} ou 503
```

Appliquer le schéma sur la base de déploiement (idempotent, suit les jalons) :

```bash
docker compose --profile tools run --rm migrate
```

Preuves base réelle (`packages/db/tests/*.pg.mjs`, `packages/api/test/*.proof.mjs`) :
chaque preuve attend sa variable (`KOMBE_TEST_DATABASE_URL` /
`KOMBE_API_DATABASE_URL`) et sort **exit 2 (BLOCKED)** si la base est absente —
jamais un succès simulé. Sur hôte Docker, la CI (`.gitlab-ci.yml`) exécute déjà
la suite sur `postgres:16`.

Arrêt + purge des données : `docker compose down -v`.

## 2. Démarrage sans Docker (base Postgres déjà disponible)

```bash
pnpm -r --if-present run build
export KOMBE_DATABASE_URL=postgresql://kombe:kombe_dev_only@localhost:5432/kombe
node packages/db/scripts/migrate.mjs migrate    # 25 jalons, idempotent
export KOMBE_API_DATABASE_URL="$KOMBE_DATABASE_URL"
export PORT=3000 HOST=0.0.0.0
pnpm --filter @kombe/api run start              # node dist/main.js → écoute
```

Sans `KOMBE_DATABASE_URL`, le runner sort **exit 2 (BLOCKED)**. Avec une URL
présente mais malformée (§15), l'API **échoue au démarrage** (fail-fast) — pas
de repli silencieux sur un mode incompris.

## 3. Variables d'environnement

| Var | Rôle |
|---|---|
| `PORT` / `HOST` | Écoute API (défaut 3000 / 0.0.0.0). |
| `KOMBE_DATABASE_URL` | Connexion du runner `migrate` (rôle migrateur/propriétaire). |
| `KOMBE_API_DATABASE_URL` | Connexion API en mode réel (stores PG + session + RLS). |
| `KOMBE_TEST_DATABASE_URL` | Base de test isolée pour les preuves (`*.pg.mjs`, `*.proof.mjs`). |
| `POSTGRES_USER/PASSWORD/DB` | Initialisation conteneur (dev uniquement). |

Aucun secret réel dans le dépôt : `.gitignore` exclut `.env` / `.env.*` (sauf
`.env.example`). En production, fournir mot de passe et hôtes via le gestionnaire
de secrets de l'hébergeur.

## 4. Cibles d'hébergement (décision ouverte)

Choix tranché par ADR, pas ici : `STACK.md` `[OPEN-D01]` (app/worker) et
`[OPEN-D02]` (PostgreSQL). La pile Docker fonctionne telle quelle sur un VPS
conteneurisé ; pour Render/Railway/Fly, déployer le `Dockerfile` + une base
managée, brancher `migrate` en phase de release.

## 5. Ce que le déploiement NE fait PAS encore (honnêtement)

- Worker outbox/delivery non lancé (hors périmètre, lot C13).
- Exécution réelle backup/restore **BLOCKED_EXTERNAL** (§6.4) — procédure écrite,
  outils PostgreSQL absents de cet hôte.
- Décision d'hébergement staging/production `[OPEN-D01]/[OPEN-D02]` — au
  propriétaire (§39 : ni achat, ni contrat, ni engagement de dépense).
- `release:smoke` à rejouer contre le staging déployé (§22).

## 6. Sauvegarde et restauration (§23/§24)

Procédure **hôte-agnostique** : PostgreSQL 16+ joignable + rôle propriétaire.
Aucun PASS déclaré tant qu'elle n'a pas tourné réellement — voir 6.4.

### 6.1 Sauvegarde (quotidienne, rétention 30 jours)

Dump **custom format** (compressé, parallélisable à la restauration), base
complète (schéma + données) : le schéma versionné reste la référence des
migrations, le dump est la protection contre la perte de données.

```bash
pg_dump "$KOMBE_DATABASE_URL" --format=custom --file="kombe-$(date +%F).dump"
# Conservation : 30 générations, stockage hors site (S3-compatible) chiffré.
```

Sur **Neon**, sauvegardes managées/PITR = dépendance au plan souscrit : ne pas
s'en remettre sans confirmation écrite. Le `pg_dump` reste le filet minimal.

### 6.2 Vérification de la sauvegarde (mensuelle, obligatoire)

Une sauvegarde non restaurée est un espoir, pas une preuve :

```bash
createdb kombe_restore_check
pg_restore --dbname="kombe_restore_check" "kombe-$(date +%F).dump" --exit-on-error
psql kombe_restore_check -c "SELECT count(*) FROM kombe_migration"   # 25 jalons
psql kombe_restore_check -c "SELECT count(*) FROM journal"
dropdb kombe_restore_check
```

### 6.3 Restauration (incident)

```bash
createdb kombe_restored
pg_restore --dbname="kombe_restored" "kombe-YYYY-MM-DD.dump" --exit-on-error
# Ré-appliquer le runner : idempotent via les jalons (skip de l'appliqué).
KOMBE_DATABASE_URL="…/kombe_restored" node packages/db/scripts/migrate.mjs migrate
# Basculer KOMBE_API_DATABASE_URL vers kombe_restored, redémarrer l'API,
# vérifier : GET /v1/health/ready → {"status":"ready","mode":"réel"}.
```

### 6.4 Statut d'exécution

- **Authorship** : procédure rédigée et relue (ce document).
- **Exécution réelle** : **BLOCKED_EXTERNAL** sur cet hôte — ni Docker ni
  binaires PostgreSQL (`pg_dump`/`pg_restore`/`createdb` absents) ; l'installation
  de logiciels est hors mandat (§39). EXACT ACTION REQUIRED : exécuter 6.1 puis
  6.2 sur l'hôte de déploiement (ou tout hôte disposant des outils PostgreSQL
  16+ et de `KOMBE_DATABASE_URL`). AFTER ACTION : coller le verdict réel dans le
  rapport §41 et faire évoluer `RELEASE_READINESS.md`.
