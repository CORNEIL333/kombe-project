# DÉPLOIEMENT — KÓMBE (socle déployable)

**Version :** socle post-C09 — 2026-09-30.
**Statut :** pile **exécutable** (API à l'écoute + base PostgreSQL réelle + migrations).
Ce document dit **exactement** ce qui est réel et ce qui reste fictif. Aucun PASS simulé.

---

## 0. Ce qui est RÉEL vs ce qui est FICTIF (à lire avant tout déploiement)

| Brique | État | Preuve / limite |
|---|---|---|
| API Fastify **à l'écoute** (`packages/api/src/main.ts`) | **RÉEL** | `GET /v1/health` → `200 {"status":"ok","phase":"c00-skeleton"}` vérifié par démarrage HTTP réel (hors `inject`). |
| Migrations PostgreSQL + provisioning des rôles (`migrate.mjs`) | **RÉEL** (exécution) / **BLOCKED** (preuves) | S'applique vraiment sur Postgres 16+ ; les preuves RLS/verrous/pool restent BLOCKED sans base joignable (le runner sort **exit 2**, jamais un faux 0). |
| Pile conteneurisée (`docker-compose.yml`) | **PRÊTE** | Build + démarrage validés par la CI / tout hôte Docker ; non exécutés sur cet hôte Windows sans Docker. |
| **Persistance applicative de l'API** | **FICTIF** | L'API sert les stores **en mémoire** de C00 : l'état **se réinitialise au redémarrage** et l'API **ne lit/écrit pas** PostgreSQL. La soudure API↔base est un lot ultérieur (C01+ persistance). |
| Auth/session réelle, RLS appliquée aux requêtes | **FICTIF (recette)** | Identité injectée par en-têtes fictifs ; la résolution session + RLS est posée par C01/C02 en base réelle. |
| Worker outbox (C13) | **HORS PÉRIMÈTRE** | Attribué au harnais `codex` (voir `COORDINATION_MULTI_HARNESS/`). |

> Conséquence assumée : on peut **déployer et faire tourner** le socle dès maintenant
> (service HTTP + schéma + base), mais ce déploiement est une **vitrine de contrat**,
> pas un registre persistant. La bascule en persistance réelle est le jalon suivant.

---

## 1. Démarrage rapide (Docker)

```bash
cp .env.example .env            # valeurs de dev ; en prod, secrets hors bande
docker compose up --build       # postgres:16 + api (ports 5432 et 3000)
curl http://localhost:3000/v1/health     # → {"status":"ok","phase":"c00-skeleton"}
```

Appliquer le schéma sur la base de déploiement (idempotent, suit les jalons) :

```bash
docker compose --profile tools run --rm migrate
```

Exécuter les **preuves base réelle** (C01 : RLS `kombe_app` non-owner, verrous,
isolation de pool A/B, FK composites). Le one-shot `dbtest` **migre d'abord** la
base `kombe_test` puis lance `isolation.pg.mjs` (qui reconstruit le schéma et pose
`SET ROLE kombe_app`), sans quoi le premier `.down.sql` échouerait sur des objets
absents. C'est le véhicule qui **permet d'exécuter** ces preuves sur tout hôte
Docker, là où elles sont `BLOCKED` sur cet hôte Windows sans base :

```bash
docker compose --profile test run --rm dbtest     # migrate kombe_test puis isolation.pg.mjs
```

> Nous ne déclarons **aucun PASS** pour ce chemin depuis cette machine (sans
> Docker/PostgreSQL). Le rendu `PASS`/`FAIL` vient de l'exécution réelle sur l'hôte
> conteneurisé ou en CI (`h00-trusted.yml`), jamais d'une intention.

Arrêt + purge des données : `docker compose down -v`.

## 2. Démarrage sans Docker (base Postgres déjà disponible)

```bash
pnpm -r --if-present run build
export KOMBE_DATABASE_URL=postgresql://kombe:kombe_dev_only@localhost:5432/kombe
pnpm --filter @kombe/db run migrate           # applique migrations + roles.sql
export PORT=3000 HOST=0.0.0.0
pnpm --filter @kombe/api run start            # node dist/main.js → écoute
```

Sans `KOMBE_DATABASE_URL`, `migrate` sort **exit 2 (BLOCKED)** — comportement voulu,
jamais un succès simulé.

## 3. Variable d'environnement

| Var | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute API. |
| `HOST` | `0.0.0.0` | Interface d'écoute (0.0.0.0 pour être joignable hors conteneur). |
| `KOMBE_DATABASE_URL` | — | Chaîne de connexion du runner `migrate` (rôle migrateur/propriétaire). |
| `KOMBE_TEST_DATABASE_URL` | — | Base de test isolée pour `isolation.pg.mjs` (preuves C01). |
| `POSTGRES_USER/PASSWORD/DB` | `kombe`/`kombe_dev_only`/`kombe` | Initialisation du conteneur Postgres (dev uniquement). |

Aucun secret réel dans le dépôt : `.gitignore` exclut `.env` / `.env.*` (sauf
`.env.example`). En production, fournir mot de passe et hôtes via le gestionnaire
de secrets de l'hébergeur.

---

## 4. Cibles d'hébergement (décision ouverte)

Le choix d'hébergeur et de PostgreSQL managé est **tranché par ADR**, pas ici :
voir `STACK.md` `[OPEN-D01]` (app/worker) et `[OPEN-D02]` (PostgreSQL). Cette pile
Docker fonctionne telle quelle sur un VPS conteneurisé ; pour Render/Railway/Fly,
déployer le `Dockerfile` (service web unique) + une base managée, puis brancher
`migrate` en phase de release. La CI (`h00-trusted.yml`) exécute déjà les preuves
H00 sur un service PostgreSQL 16.

## 5. Ce que le déploiement NE fait PAS encore (honnêtement)

- Aucune persistance API → base (les écritures ne survivent pas à un redémarrage).
- Aucune authentification session réelle ni application RLS par requête (schéma +
  rôles prêts, soudure API à venir).
- Aucun worker d'outbox/delivery lancé (hors périmètre, géré par le lot C13/`codex`).
- Sauvegarde/reprise (C29) et protection des environnements (C28) non livrées.
- Le service `migrate` tourne sous le superutilisateur du conteneur (`kombe`). Or
  `provision/roles.sql` pose `ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur` :
  pour que les futures tables créées par l'app revienne bien à `kombe_app`, un
  déploiement réel doit migrer **connecté en `kombe_migrateur`** (ou ajouter des
  GRANT explicites). `isolation.pg.mjs` fait déjà ces GRANT, donc les preuves passent ;
  ce n'est pas encore le cas du chemin `migrate` seul. Sans persistance API active,
  aucun impact fonctionnel aujourd'hui ; à corriger à la soudure API↔base.

Ces points sont des **jalons planifiés**, pas des zones floues : les portes G0
exigent la persistance + preuves base réelle vertes avant toute mise en service
du registre comme source de vérité.
