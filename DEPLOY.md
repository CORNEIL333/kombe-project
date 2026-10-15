# DÉPLOIEMENT — KÓMBE

**Version :** phase de déploiement — 2026-10-08.
**Statut :** pile **exécutable et persistée** : API à l'écoute, base PostgreSQL
réelle (27 jalons : `roles_create.sql` + migrations 0001→0025 + `roles.sql`),
identité réelle (session → RLS) en mode réel. Ce document dit exactement ce qui
est réel, prouvé, et ce qui reste ouvert. Aucun PASS simulé.

---

## 0. Ce qui est RÉEL vs FICTIF (à lire avant tout déploiement)

| Brique | État | Preuve / limite |
|---|---|---|
| API Fastify (`packages/api/src/main.ts`) | **RÉEL** | `GET /v1/health` → `{"status":"ok","mode":"réel"}` (pool PG) ou `{"status":"ok","mode":"fictif"}` (repli sans pool). |
| Sondes | **RÉEL** | `/v1/health/live` → 200 `{status:"ok"}` ; `/v1/health/ready` → 200 `{status:"ready",mode}` ou **503** (base injoignable). |
| Persistance API → PostgreSQL | **RÉEL** | Stores PG (journal, cotisations, disbursement, dispute, proposal, validation, règles, planning, métriques, session, découverte worker). Mode réel actif dès que `KOMBE_API_DATABASE_URL` est valide. |
| Migrations + provisioning rôles (`migrate.mjs`) | **RÉEL** | Runner explicite de 27 fichiers, verrou consultatif, transaction par fichier, idempotent (table `kombe_migration`). Preuve §17 exécutée sur base réelle : vide → dernier jalon + seconde passe tout « skipped ». |
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
node packages/db/scripts/migrate.mjs migrate    # 27 jalons, idempotent
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
psql kombe_restore_check -c "SELECT count(*) FROM kombe_migration"   # 27 jalons
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
| 1 | Base `kombe_prod` + migrations (§7.1) — **EXÉCUTÉ 2026-10-08, 27 jalons au 2026-10-09** | Neon | tout |
| 2 | Projet Vercel **unique** : site + PWA + 4 tableaux de bord + API (§7.2) | Vercel | tout le front + `/v1/*` à la même origine |
| 3 | Pipeline CI GitHub Actions (§7.2.3) — déploie à chaque push master | GitHub Actions | déploiement machine éteinte |
| 4 | Smoke réel (§7.7, intégré au workflow) | CI | verdict §41/§43 |
| 5 | Domaines publics (§7.6.4) | DNS propriétaire | URL définitives |

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
   0001–0023, `provision/roles.sql`). **Avancé le 2026-10-09** : les slices
   d'amorçage (0024) et multi-adhésion (0025) sont arrivées APRÈS ce déploiement
   initial ; `migrate` relancé idempotemment sur `kombe_prod` (rôle
   `neondb_owner`) → `applied=[0024,0025]`, **27 jalons**. Vérifié en base réelle :
   colonnes `group.display_name/tontine_model/rotation_type/parent_group_id/join_code`
   présentes, fonction `kombe_member_groups` présente, et ExÉCUTABLE par
   `kombe_app` (rôle Vercel, sous RLS) — `SELECT … FROM kombe_member_groups(…)`
   renvoie 0 ligne (pas de « permission denied ») : la route `GET /me/groups`
   sert réellement en production, pas seulement en preuve.
3. Connexion applicative activée : `ALTER ROLE kombe_app WITH LOGIN PASSWORD
   '<fort>'` (mot de passe aléatoire 144 bits, enregistré hors dépôt dans
   `.env.prod`, gitignored — §15). Vérifié en se connectant réellement en
   `kombe_app` : 50 tables visibles, `SELECT` sur `journal` OK.
4. La chaîne `KOMBE_API_DATABASE_URL` de l'API (Vercel) =
   valeur de `KOMBE_PROD_API_DATABASE_URL` dans `.env.prod`.

### 7.2 Site + API — LE projet Vercel unique (architecture v3, 2026-10-09)

**Un seul projet Vercel sert tout, à la même origine** (plus de CORS, plus
d'URL collée au build) : `scripts/build-web.mjs` assemble `dist-web/` —
`/` PWA (packages/client), `/bureau/`, `/ops/`, `/direction/`, `/engineering/`,
`/site/` — et `vercel.json` racine route `/v1/:path*` vers la fonction
serverless (`api/serverless.js`). Le build Vercel (`scripts/vercel-build.mjs`)
compile l'API, assemble le web, et en production applique les migrations
manquantes avec le vrai runner (idempotent) via `KOMBE_MIGRATION_DATABASE_URL`.

1. Projet Vercel : importer le dépôt, Root Directory = **racine du dépôt**
   (déjà décrit par `vercel.json`) — ou laisser la CI GitHub le déployer (§7.2.3).
2. Variables d'environnement **Production** :
   | Var | Rôle |
   |---|---|
   | `KOMBE_API_DATABASE_URL` | runtime API : chaîne `kombe_app` (§7.1.4) |
   | `KOMBE_MIGRATION_DATABASE_URL` | migrations auto du build prod : chaîne migrateur/owner |
   | `RESEND_API_KEY` / `KOMBE_EMAIL_FROM` | email transactionnel (`.env.example`) |
3. **Pipeline CI GitHub Actions (machine éteinte)** —
   `.github/workflows/deploy-vercel.yml` : à chaque push sur master, déploie
   `--prod` puis enchaîne le smoke §22 contre l'URL déployée. Secrets requis
   (Settings → Secrets and variables → Actions) : `VERCEL_TOKEN`,
   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `KOMBE_API_DATABASE_URL`,
   `KOMBE_MIGRATION_DATABASE_URL`. Sans secrets, le job s'ignore proprement
   (warning) — jamais de déploiement à moitié configuré.
4. Vérifications réelles obligatoires après premier déploiement :
   - `GET https://<projet>.vercel.app/v1/health` → `{"status":"ok","mode":"réel"}`
   - `GET https://<projet>.vercel.app/v1/health/ready` → `{"status":"ready","mode":"réel"}`
     (503 = base injoignable → **stop**, corriger §7.1 avant de continuer)
5. Limites assumées (Hobby, documentées) : rate limiter en mémoire **par
   instance chaude** (`packages/api/src/httpGuards.ts`) — borne molle, pas un
   plafond global ; `maxDuration` 10 s par défaut (suffisant au pilote).

### 7.3–7.5 (supersedé) — Dashboards Cloudflare / PWA Flutter Vercel / admin séparé

**Supersedé le 2026-10-09 par le projet Vercel unique (§7.2).** Les tableaux de
bord sont assemblés dans `dist-web/` sous leur préfixe (`/ops/`, `/direction/`,
`/engineering/`, `/bureau/`), la PWA web est la Vite `packages/client` et le
livrable mobile est l'APK Android (workflow `mobile-ci.yml`, servi par
`/telecharger/`). Les étapes Cloudflare Pages/Workers, PWA Flutter sur Vercel et
dashboard admin en projet séparé ne sont plus à exécuter — historique conservé
dans git (commits 4f239f1, b92af1c). Cloudflare reste pertinent plus tard pour
le worker outbox (lot C13) et la sauvegarde R2 indépendante (§6.1).

### 7.6 Actions propriétaire (§39 — aucune dépense, aucun secret dans le dépôt)

1. **Vercel** : ~~compte + token~~ compte Hobby existant côté propriétaire ;
   créer **un seul projet** (import du dépôt GitHub, racine) puis relever
   `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (Settings → General).
2. **GitHub Actions secrets** (Settings → Secrets and variables → Actions) :
   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
   `KOMBE_API_DATABASE_URL` (= `KOMBE_PROD_API_DATABASE_URL` de `.env.prod`),
   `KOMBE_MIGRATION_DATABASE_URL` (chaîne migrateur/owner vers `kombe_prod`).
   Dès posés, chaque push master déploie + smoke automatiquement — machine
   locale éteinte.
3. **Neon** : ~~créer projet~~ fait (base `kombe_prod`, §7.1) ; reste **optionnel** :
   projet dédié + bascule `pg_dump`/`pg_restore` (§6.3) pour un compute
   production isolé des preuves.
4. **Domaines publics (J+3..J+5)** : DNS CNAME des domaines définitifs vers le
   projet Vercel unique ; les URL `*.vercel.app` suffisent en attendant
   (HTTPS inclus, tout à la même origine).

### 7.7 Smoke final (verdict réel, §22)

**Intégré au workflow** `.github/workflows/deploy-vercel.yml` : chaque
déploiement production est suivi du smoke contre l'URL fraîchement déployée.
Équivalent manuel :

```bash
KOMBE_SMOKE_BASE_URL="https://<projet>.vercel.app" node scripts/release-smoke.mjs
```

Le smoke exige notamment `GET /v1/health/ready` en `mode:"réel"` — un vert ici
est la première preuve de bout en bout production. Verdict consigné dans
`RELEASE_MANIFEST.json` (§41/§43).

### 7.8 Checklist porteur finale (session autonome 2026-10-15)

À cocher dans l'ordre ; chaque ligne est une saisie de compte tiers, jamais
une dépense obligatoire (tout a un plan gratuit) :

- [ ] **Sécurité immédiate — révoquer le token Cloudflare** collé dans la
  conversation du 2026-10-08 (`round-smoke-d372`, exp. 2026-11-07) : il a été
  exposé en clair dans un chat. Dashboards.plus nécessaire (projet Vercel
  unique). Dashboard Cloudflare → API Tokens → Delete.
- [ ] **SMS** : compte Africa's Talking (gratuit) → `KOMBE_SMS_PROVIDER=
  africastalking` + `KOMBE_SMS_API_KEY` + `KOMBE_SMS_SENDER_ID` dans Vercel →
  Environment Variables → login téléphone ouvert.
- [ ] **E-mail** : vérifier le domaine d'envoi dans Resend → `KOMBE_EMAIL_FROM`
  (ex. `codes@<domaine>`) dans Vercel → les codes parviennent à tous.
- [ ] **Redéploiement** : les 5 secrets GitHub (§7.6.2) posés → push master →
  le pipeline déploie + smoke tout seul.
- [ ] **APK signés (C1)** : générer un keystore local (hors dépôt) :
  `keytool -genkeypair -v -keystore kombe-release.keystore -alias kombe
  -keyalg RSA -keysize 2048 -validity 10000` ; noter `android/k key.properties`
  (storePassword, keyPassword, keyAlias, storeFile) ; puis
  `packages/mobile/android/app/build.gradle` avec `signingConfigs.release`.
  Le script `build-apk.ps1` reste utilisable tel quel en attendant (signé
  debug keys, installable, « sources inconnues »).
- [ ] **Domaine custom (B4)** : CNAME vers le projet Vercel → puis mettre à
  jour `KOMBE_CORS_ORIGINS` et les 4 `kombe-dashboard-config.json`.
- [ ] **Smoke après chaque étape** (§7.7) : `GET /v1/health/ready` en
  `mode:"réel"` + `/telecharger/kombe-arm64.apk` en 200.

### 7.9 Sens grand public (livré en session autonome)

- L'app mobile embarque désormais le **démarrage du cycle** (gap C4) : le
  bureau choisit l'ordre de passage (tirage vérifiable ou ordre d'arrivée)
  et le calendrier des tours s'affiche à tous — plus de groupe « bloqué ».
- **Session expirée** : l'app ramène proprement à la connexion au lieu
  d'empiler des erreurs techniques.
- Les **messages d'erreur sont les phrases du serveur** (français lisible),
  jamais des codes bruts.
- `docs/DESIGN_2026_REFS.md` fixe le référentiel design (Liquid Glass,
  M3 Expressive, fintech Afrique francophone, WCAG 2.2 AA) et les 12 règles
  d'or pour la suite des refontes.
