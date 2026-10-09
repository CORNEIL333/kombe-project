# MORNING SETUP — Déployer KÓMBE en quelques clics

**Objectif :** passer de « tout est codé, testé, base de prod à jour » à
« URLs publiques accessibles », avec le minimum d'actions humaines. Tout ce qui
ne dépend **pas** d'un compte externe est **déjà fait et prouvé** (voir §A). Ce
fichier ne liste **que** les actions qui exigent les identifiants du propriétaire
(§39 DEPLOY.md) — chacune 2–5 min, dans l'ordre.

Dernière mise à jour : 2026-10-09. Branche : `claude/overnight-release`.

---

## A. Déjà prêt et VÉRIFIÉ (ne rien refaire)

| Élément | État réel | Preuve |
|---|---|---|
| Code applicatif (domain/api/worker/db/client/dashboards/mobile) | **VERT** | `pnpm -r build` ✓ · `typecheck` exit 0 ✓ · tests : domain ✓, api 216, worker 10/0, dashboard-core 33, client 29, dashboards ×4 ✓ |
| Base de production Neon `kombe_prod` | **27 jalons, à jour** | migrate idempotent exécuté (`applied=[0024,0025]`) ; 5 colonnes `group` d'amorçage présentes ; fonction `kombe_member_groups` présente et exécutable par `kombe_app` (RLS). Voir DEPLOY.md §7.1 |
| API en mode RÉEL contre `kombe_prod` | **SMOKE_PASS** | `node dist/main.js` (mode RÉEL, RLS kombe_app) + `scripts/release-smoke.mjs` → exit 0 : LIVE 200, READY 200 `mode:"réel"`, AUTH-401 + AUTH-BAD 401 (garde active, aucun repli fictif). NB : localhost ≠ déploiement (DEPLOY.md §33) — ça prouve l'artefact, pas Vercel. |
| Persistance | **13 stores PG** câblés dès qu'un pool est présent | `server.ts` (routes en double branche `pool && real*` ; les routes squelette fictives sont `if (!pool)` → 404 en prod, jamais de fausse donnée) |
| Auth clients | **paires RÉELLES utilisées** | PWA + mobile appellent `/access/login-requests` + `/login-completions` + `/registrations(/verifications)` + `/recovery-*` ; **jamais** `/access/sessions` (fictif) |
| Artefacts de build prod | **versionnés et validés** | `vercel.json` + `api/serverless.js` → `packages/api/dist/serverless.js` (présent) ; 4 `kombe-dashboard-config.json` pointés vers `https://kombe-api.vercel.app` (dont admin, aligné 2026-10-09) |

**⚠️ Garde anti-teardown-prod (ajoutée 2026-10-09).** Les preuves de recette
(`packages/api/test/*.proof.mjs`, `isolation.pg.mjs`, `migrateEmptyToLatest.pg.mjs`)
font un **DROP complet** du schéma à chaque cycle DOWN/UP. Elles ne doivent
JAMAIS viser `kombe_prod`. Incident réel : une variable d'env résiduelle du shell
(`$env:KOMBE_API_DATABASE_URL`) écrasait `--env-file` (Node ne remplace pas une
variable déjà définie) et redirigeait les preuves vers la prod. Dorénavant
`packages/db/scripts/guard.mjs` lit `current_database()` avant tout teardown et
ABORTE (`status:BLOCKED exit 2`) si la base est dans `KOMBE_PROD_DATABASE_NAMES`
(défaut : `kombe_prod`). Lancer les preuves dans un shell **neuf** (ou après
`Remove-Item Env:\KOMBE_API_DATABASE_URL`) ; `node --env-file=.env
scripts/run_neon_proofs.mjs` doit afficher **14/14 PASS**, jamais BLOCKED.

**Ce qui manque UNIQUEMENT :** les jetons de compte (personnel) + 5 clics de
déploiement.

---

## B. Déploiement — dans cet ordre (dépendances réelles)

### 1) Vercel — API (≈ 4 min) → débloque tout le reste
```bash
# une fois le projet Vercel créé (Importer le dépôt, Root = racine, framework Other)
vercel link                       # choisir l'org + créer le projet "kombe-api"
vercel env add KOMBE_API_DATABASE_URL production   # coller la valeur de .env.prod : KOMBE_PROD_API_DATABASE_URL
vercel env add RESEND_API_KEY production           # valeur Resend existante
vercel env add KOMBE_EMAIL_FROM production         # ex. no-reply@kombe.app
vercel env add KOMBE_CORS_ORIGINS production       # listes d'origines (voir D)
vercel --prod
```

**⚠️ Email d'inscription — domaine Vérifié OBLIGATOIRE (≈ 2 min, sinon les
inscrits récents échouent en silencieux).** En mode réel, `requireResendSender()`
exige `RESEND_API_KEY` (sinon l'API **démarre pas** — pas de repli simulé). Mais
si `KOMBE_EMAIL_FROM` est **absent**, le code retombe sur
`KÓMBE <onboarding@resend.dev>`, l'expéditeur de TEST Resend qui **ne livre
qu'à la boîte du propriétaire du compte Resend** : toute inscription d'un vrai
utilisateur (autre email) renvoie `502 EMAIL_DELIVERY_FAILED`. **Action
propriétaire** : dans Resend → Domains, vérifier un domaine (DKIM/SPF, ~2 min,
ex. `kombe.app`), puis régler `KOMBE_EMAIL_FROM` sur une adresse de ce domaine
(ex. `no-reply@kombe.app`). Sans domaine vérifié, la PWA/mobile **ne peuvent pas
inscrire d'utilisateurs réels** — ce n'est pas un bug du code, c'est la config
Resend.
**Vérif obligatoire** (stop si échec) :
```bash
curl https://kombe-api.vercel.app/v1/health/ready   # → {"status":"ready","mode":"réel"}
```
Si `503`/`degraded` : la base est injoignable depuis Vercel → vérifier que
`KOMBE_API_DATABASE_URL` est bien la chaîne `kombe_app` de `kombe_prod`
(`.env.prod`). Si `mode:"fictif"` : la variable d'env n'est pas arrivée au
déploiement.

### 2) Dashboards — Cloudflare Workers Static Assets (≈ 3 min chacun)
> Le token Cloudflare actuellement fourni est **lecture seule** (aucun droit
> d'écriture Workers). **Action requise :** créer un token avec la permission
> **« Cloudflare Workers : Modifier »** (niveau Account).

Pour `operations`, `direction`, `engineering`, `group-admin` :
```bash
pnpm --filter @kombe/dashboard-operations... run build     # idem par dashboard
cd apps/dashboard-operations
CLOUDFLARE_API_TOKEN=<token-modifier> CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler@4 deploy
```
Chaque `wrangler.toml` est déjà versionné (assets-only + fallback SPA).
URL obtenue : `https://kombe-dashboard-<x>.<subdomaine>.workers.dev`.

### 3) PWA (Flutter web) — Vercel (≈ 5 min)
```bash
cd packages/mobile
flutter pub get
flutter build web --release --dart-define=KOMBE_API_BASE_URL="https://kombe-api.vercel.app"
vercel deploy --prod .          # vercel.json embarqué (en-têtes, outputDirectory build/web)
```
(Équivalent CI : job manuel `deploy-pwa-vercel`, exige `VERCEL_TOKEN`.)

### 4) Dashboard admin — Vercel (≈ 3 min)
Projet Vercel, Root Directory = `apps/dashboard-group-admin`, framework Vite,
output `dist`. `vercel.json` déjà versionné. Sa config pointe déjà l'URL API
(§A).

---

## C. C-order final (après B)

Rajouter chaque URL publique obtenue à `KOMBE_CORS_ORIGINS` (API) puis
redeploy l'API :
```bash
vercel env rm KOMBE_CORS_ORIGINS production ; vercel env add KOMBE_CORS_ORIGINS production
# valeur = origines séparées par des virgules, voir D
vercel --prod
```

## D. `KOMBE_CORS_ORIGINS` — valeur exacte (liste fermée)
```
https://kombe-api.vercel.app,https://<pwa>.vercel.app,https://<admin>.vercel.app,https://kombe-dashboard-operations.<sub>.workers.dev,https://kombe-dashboard-direction.<sub>.workers.dev,https://kombe-dashboard-engineering.<sub>.workers.dev,https://kombe-dashboard-group-admin.<sub>.workers.dev
```
Aucun `*` (le CORS est une liste fermée, `httpGuards.ts`).

## E. Smoke réel contre la prod déployée (verdict §41/§43)
```bash
KOMBE_SMOKE_BASE_URL="https://kombe-api.vercel.app" node scripts/release-smoke.mjs
# → SMOKE_PASS attend que READY renvoie mode:"réel" contre Neon via Vercel
```
C'est la **première preuve de bout en bout** (Vercel → Neon). Consigner le
verdict dans `RELEASE_MANIFEST.json` (`release-smoke-deployed` PENDING → PASS).

---

## F. Récap des secrets/identifiants à fournir (hors dépôt, jamais commités)
| Variable | Où | Source |
|---|---|---|
| `KOMBE_API_DATABASE_URL` | Vercel (API) | = `KOMBE_PROD_API_DATABASE_URL` de `.env.prod` (rôle `kombe_app`, base `kombe_prod`) |
| `RESEND_API_KEY`, `KOMBE_EMAIL_FROM` | Vercel (API) | compte Resend existant |
| `KOMBE_CORS_ORIGINS` | Vercel (API) | §D |
| `VERCEL_TOKEN` (+ org/project) | CLI + CI GitLab | compte Vercel (Hobby gratuit) |
| `CLOUDFLARE_API_TOKEN` (**Modifier** Workers) + `CLOUDFLARE_ACCOUNT_ID` | CLI wrangler | compte Cloudflare — remplacer le token lecture-seule actuel |

## G. Optionnel (plus tard, non bloquant)
- Domaines publics définitifs : DNS CNAME → Vercel/Cloudflare ; mettre à jour
  `KOMBE_CORS_ORIGINS` + les 4 configs, redeploy (DEPLOY.md §7.6.4).
- Projet Neon dédié (compute isolé des preuves) : bascule `pg_dump`/`pg_restore`
  (DEPLOY.md §6.3).
- Backup/restore réel 6.1/6.2 sur un hôte outillé PostgreSQL 16+ (BLOCKED ici :
  binaires absents).
