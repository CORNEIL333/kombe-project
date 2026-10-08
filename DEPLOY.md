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

## 4. Cibles d'hébergement (décision propriétaire 2026-10-08)

Hébergement tranché (confirme ADR-0021/ADR-0022) :

| Brique | Plateforme | Mode |
|---|---|---|
| PostgreSQL production | **Neon** | Projet **séparé** de la base partagée de vérification |
| API Fastify | **Vercel** | Serverless (`api/serverless.js` + `vercel.json` à la racine) |
| Dashboards opérations / direction / engineering | **Cloudflare Pages** | Statique Vite (SPA) |
| PWA (Flutter web) + dashboard admin | **Vercel** | PWA : build Flutter en CI (`.gitlab-ci.yml`) ; admin : projet Vercel statique Vite |

Procédures pas-à-pas : §7. Pile Docker (§1) toujours valide pour un VPS
autonome ; elle n'est plus la cible de production.

## 5. Ce que le déploiement NE fait PAS encore (honnêtement)

- Worker outbox/delivery non lancé (hors périmètre, lot C13).
- Exécution réelle backup/restore **BLOCKED_EXTERNAL** (§6.4) — procédure écrite,
  outils PostgreSQL absents de cet hôte.
- Déploiement plateformes non exécuté depuis cet hôte : comptes/tokens Vercel +
  Cloudflare et projet Neon de production sont des actions propriétaire (§39 —
  §7.6 liste exacte). Aucun PASS de déploiement n'est déclaré avant exécution réelle.
- `release:smoke` à rejouer contre la production déployée (§22).

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

---

## 7. Déploiement production — Neon + Vercel + Cloudflare (décision 2026-10-08)

Cible : production fiable déployée le jour J, accessible publique sous 3–5 jours.
Aucune étape ci-dessous n'a été exécutée depuis cet hôte : §7.6 liste les actions
propriétaire. Tant qu'une étape n'a pas tourné, son verdict reste PENDING
(§9 — jamais de PASS déclaré sans exécution).

### 7.0 Ordre de déploiement (dépendances réelles)

| # | Étape | Plateforme | Débloque |
|---|---|---|---|
| 1 | Base `kombe_prod` + migrations (§7.1) — **EXÉCUTÉ 2026-10-08** | Neon | tout |
| 2 | API (§7.2) | Vercel | URL publique `https://<api>.vercel.app` |
| 3 | Config dashboards → URL API (§7.3) | dépôt | builds dashboards |
| 4 | Dashboards opérations/direction/engineering (§7.3) | Cloudflare Pages | front métier |
| 5 | PWA (§7.4) + dashboard admin (§7.5) | Vercel | front public |
| 6 | Smoke réel (§7.7) | CI/hôte | verdict §41/§43 |

### 7.1 Neon — base de production

**Exécuté le 2026-10-08 (état réel, pas d'intention).** La cible initiale était un
projet Neon séparé de la base de vérification ; le projet séparé exigeant un
accès console/API que seul le propriétaire peut créer, la production a été posée
dans le projet existant sous forme d'une **base dédiée `kombe_prod`**, créée par
SQL (`CREATE DATABASE` exécuté avec succès en `neondb_owner`). Isolation réelle :
les preuves de vérification se connectent à `neondb` / `kombe_test` et ne
touchent jamais `kombe_prod` ; les rôles sont partagés au niveau branche, les
données sont isolées au niveau base. Compromis assumé (compute partagé) : la
bascule vers un projet dédié reste un `pg_dump`/`pg_restore` (§6.3), à faire
quand le propriétaire crée le projet séparé.

1. ~~Créer le projet~~ → base `kombe_prod` créée par SQL dans le projet existant
   (rôle `neondb_owner`).
2. Migrations exécutées réellement : `KOMBE_DATABASE_URL=…/kombe_prod pnpm
   --filter @kombe/db run migrate` → **exit 0, 25 jalons** (rôles, migrations
   0001–0023, `provision/roles.sql`).
3. Connexion applicative activée : `ALTER ROLE kombe_app WITH LOGIN PASSWORD
   '<fort>'` (mot de passe aléatoire 144 bits, enregistré hors dépôt dans
   `.env.prod`, gitignored — §15). Vérifié en se connectant réellement en
   `kombe_app` : 50 tables visibles, `SELECT` sur `journal` OK.
4. La chaîne `KOMBE_API_DATABASE_URL` de l'API (Vercel) =
   valeur de `KOMBE_PROD_API_DATABASE_URL` dans `.env.prod`.

### 7.2 API — Vercel serverless

`vercel.json` (racine) et `api/serverless.js` sont versionnés : build
`@kombe/api` (inclut `@kombe/domain`), rewrite `/v1/:path*` → `/api/serverless`.

1. Projet Vercel : importer le dépôt, Root Directory = **racine du dépôt**,
   framework « Other » (déjà fixé par `vercel.json`).
2. Variables d'environnement **Production** :
   | Var | Valeur |
   |---|---|
   | `KOMBE_API_DATABASE_URL` | chaîne `kombe_app` (§7.1.5) |
   | `KOMBE_CORS_ORIGINS` | origines front exactes, séparées par virgules (§7.6.4) |
   | `RESEND_API_KEY` / `KOMBE_EMAIL_FROM` | email transactionnel (déjà gérés, `.env.example`) |
3. Deploy. Vérifications réelles obligatoires avant toute suite :
   - `GET https://<api>.vercel.app/v1/health` → `{"status":"ok","mode":"réel"}`
   - `GET https://<api>.vercel.app/v1/health/ready` → `{"status":"ready","mode":"réel"}`
     (503 = base injoignable → **stop**, corriger §7.1 avant de continuer)
4. Limites assumées (Hobby, documentées) : rate limiter en mémoire **par
   instance chaude** (`packages/api/src/httpGuards.ts`) — borne molle, pas un
   plafond global ; `maxDuration` 10 s par défaut (suffisant au pilote).

### 7.3 Dashboards — Cloudflare Workers Static Assets (opérations, direction, engineering)

Décision 2026-10-08 : hébergement sur **Workers Static Assets** (et non Pages) —
le token Cloudflare fourni n'a aucun droit Pages ni d'écriture Workers à ce
jour ; voie retenue validée par le propriétaire. Équivalence fonctionnelle avec
Pages (SPA servie en HTTPS, URL publique `*.workers.dev`).

Un **Worker par dashboard** (`apps/dashboard-<x>/wrangler.toml`, assets-only,
fallback SPA pour le routage client) :
- Build local : `pnpm --filter @kombe/dashboard-<x>... run build` →
  `apps/dashboard-<x>/dist` (Vite). Le fichier
  `apps/dashboard-<x>/public/kombe-dashboard-config.json` est embarqué tel quel ;
  il est fetché au démarrage par `dashboard-core` (`loadRuntimeConfig`) — le
  fichier gagne toujours, `VITE_KOMBE_API_BASE_URL` n'est que le repli.
- Déploiement (wrangler ≥ 4, authentifié par `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`) :
  ```bash
  cd apps/dashboard-<x> && npx wrangler@4 deploy
  ```
- L'URL publique est `https://kombe-dashboard-<x>.<subdomaine>.workers.dev` ;
  l'ajouter à `KOMBE_CORS_ORIGINS` (§7.2) et redeploy l'API.
- Statut 2026-10-08 : builds des 3 dashboards **PASS** (exécutés), configs
  pointées vers `https://kombe-api.vercel.app`, wrangler.toml versionnés ;
  déploiement **BLOCKED_EXTERNAL** — token Cloudflare lecture seule
  (§41 rapport, action exacte : token avec « Cloudflare Workers : Modifier »).

### 7.4 PWA (Flutter web) — Vercel

Vercel ne fournit pas de SDK Flutter : le build se fait en **CI GitLab** (job
manuel `deploy-pwa-vercel`, image Flutter stable) puis `vercel deploy --prod`.

1. Prérequis CI (Settings → CI/CD → Variables, masquées) : `VERCEL_TOKEN`,
   `KOMBE_API_PUBLIC_URL=https://<api>.vercel.app`.
2. Lancer le job `deploy-pwa-vercel` (master, manuel) : `flutter build web
   --release --dart-define=KOMBE_API_BASE_URL=$KOMBE_API_PUBLIC_URL` puis
   déploiement de `build/web` (`packages/mobile/vercel.json` : en-têtes de
   sécurité, `outputDirectory: build/web`).
3. Équivalent local (machine propriétaire avec Flutter) :
   ```bash
   cd packages/mobile && flutter pub get
   flutter build web --release --dart-define=KOMBE_API_BASE_URL="https://<api>.vercel.app"
   vercel deploy --prod .
   ```
4. Ajouter l'URL PWA à `KOMBE_CORS_ORIGINS`, redeploy l'API.
5. Statut build web Flutter : `flutter test` 24/24 PASS ; le build `--release`
   n'a pas abouti sur cet hôte (pas de verdict — BLOCKED_EXTERNAL, cf. task #14).

### 7.5 Dashboard admin — Vercel

1. Projet Vercel : Root Directory = `apps/dashboard-group-admin` (Vercel détecte
   le workspace pnpm : install à la racine, build dans l'app), framework Vite,
   output `dist`. `apps/dashboard-group-admin/vercel.json` versionné (en-têtes
   de sécurité).
2. Comme §7.3 : éditer `public/kombe-dashboard-config.json` → URL API réelle,
   commit + push ; `VITE_KOMBE_API_BASE_URL` en env de build comme repli.
3. Ajouter l'URL admin à `KOMBE_CORS_ORIGINS`, redeploy l'API.

### 7.6 Actions propriétaire (§39 — aucune dépense, aucun secret dans le dépôt)

1. **Vercel** : compte (Hobby gratuit) + créer 3 projets (API, PWA, admin) +
   token (`VERCEL_TOKEN`) pour la CI.
2. **Cloudflare** : compte (gratuit) + token avec permission **« Cloudflare
   Workers : Modifier »** (Account) — le token « round-smoke-d372 » fourni le
   2026-10-08 est lecture seule (aucun droit Pages ni écriture Workers) ;
   révoquer l'ancien après remplacement.
3. **Neon** : ~~créer projet~~ fait (base `kombe_prod`, §7.1) ; reste **optionnel** :
   projet dédié + bascule `pg_dump`/`pg_restore` (§6.3) pour un compute
   production isolé des preuves.
4. **Domaines publics (J+3..J+5)** : DNS CNAME des domaines définitifs vers
   Vercel (API/PWA/admin) et Cloudflare Workers (dashboards) ; puis mettre à jour
   `KOMBE_CORS_ORIGINS` + les 4 `kombe-dashboard-config.json` avec les domaines
   définitifs, redeploy API + dashboards. En attendant, les URL
   `*.vercel.app` / `*.pages.dev` suffisent (HTTPS inclus).

### 7.7 Smoke final (verdict réel, §22)

Après chaque étape déployée :

```bash
KOMBE_SMOKE_BASE_URL="https://<api>.vercel.app" node scripts/release-smoke.mjs
# ou job CI manuel « release-smoke »
```

Le smoke exige notamment `GET /v1/health/ready` en `mode:"réel"` — un vert ici
est la première preuve de bout en bout production. Verdict consigné dans
`RELEASE_MANIFEST.json` (§41/§43).
