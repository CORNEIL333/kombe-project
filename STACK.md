# STACK TECHNIQUE — KÓMBE

**Version :** C00 — 2026-09-25
**Statut :** Socle initial C00, avant premier ADR adopté. Les entrées marquées `[OPEN]` sont des propositions documentées qui nécessitent une décision explicite avant le début de P1.

---

## 1. Décisions arrêtées

Ces choix sont issus de `01_Audit/ARCHITECTURE_CIBLE.md`, de `01_Audit/AUDIT_PROJET.md` et du registre `02_Technologies/`. Ils sont considérés actifs tant qu'aucun ADR ne les révise.

| Composant | Choix retenu | Justification |
|---|---|---|
| Langage back-end | TypeScript strict (Node.js 22 LTS) | Écosystème unifié front/back, types stricts, support `exactOptionalPropertyTypes` |
| Framework API | Fastify ≥ 5 | Schéma JSON natif, performances, plugin d'isolation par requête, maintien actif |
| Base de données | PostgreSQL ≥ 16 | RLS, verrouillage explicite, transactions ACID, replay d'événements |
| Driver DB | `pg` (node-postgres) + transactions manuelles | Contrôle explicite des verrous et du contexte transactionnel ; pas d'ORM en couche |
| Monnaie | XAF entier (`bigint` PostgreSQL, `bigint` JS) | Aucun float pour les montants ; plafond à fixer par ADR |
| Canonicalisation des événements | RFC 8785 (JSON Canonicalization Scheme) | Reproductibilité du journal ; profil exact à fixer dans ADR05 |
| Patron de fiabilité | Outbox transactionnelle | Worker séparé lit la table outbox dans la même DB ; aucune promesse exactly-once externe |
| Build front-end | Vite ≥ 6 + React ≥ 19 | SPA légère, SSR optionnel ; même repo (monorepo packages/) |
| Client installable web | PWA (Service Worker + Web App Manifest) | Priorité pilote ; pas de publication store requise |
| Tests unitaires | Vitest | Natif ESM, API Jest-compatible, rapide |
| Tests concurrence / DB | Testcontainers Node (`@testcontainers/postgresql`) | PostgreSQL réel ; aucun mock pour prouver verrou ou RLS |
| Tests de propriétés | fast-check | Invariants métier, oracle indépendant du code de production |
| Tests mutation | Stryker (StrykerJS) | Détecter tests faibles sur chemins critiques |
| Tests E2E | Playwright | Parcours navigateurs ; CI épinglé au commit |
| Qualité code | ESLint ≥ 9 (config stricte) + Prettier | Lint et format séparés, aucune règle désactivée en silence |
| CI | GitHub Actions | Workflows épinglés à un SHA de commit complet |
| Secrets scan | Gitleaks | Pré-push et CI |
| Analyse vulnérabilités | Trivy | Image et dépendances |
| Gestion des versions | pnpm workspaces (monorepo) | Lockfile déterministe, hoisting contrôlé |
| Fournisseur PostgreSQL géré | Neon (projet `square-resonance-19892972`, branche `production`) | ADR-0021 ; RLS/rôles PostgreSQL standards inchangés, branches DB natives pour CI/preview |

---

## 2. Décisions ouvertes — à adopter avant P1

Ces points ont été identifiés dans le dossier d'audit (`DECISIONS_ET_VERSION.md`, `ZONES_NOIRES_ET_GRISES.md`). Chacun doit faire l'objet d'un ADR signé avant le démarrage du lot P1.

| ID | Sujet | Options documentées | Référence audit |
|---|---|---|---|
| `[OPEN-D01]` | **Hébergeur application et worker** | Render payant (recommandé pilote) · Vercel commercial (si plan vérifié) · VPS conteneurisé | TEC01, A15 |
| ~~`[OPEN-D02]`~~ | ~~Fournisseur PostgreSQL géré~~ | **Tranché : Neon — voir §1 et ADR-0021** | TEC04, ZN03 |
| `[OPEN-D03]` | **Client mobile natif** | PWA seule (pilote web) · Flutter en parallèle · React Native | TEC02/TEC03 |
| `[OPEN-D04]` | **Email transactionnel** | Resend · Brevo · Amazon SES | TEC09 |
| `[OPEN-D05]` | **SMS / OTP** | Twilio · Infobip · Vonage (couverture Cameroun à tester) | TEC07 |
| `[OPEN-D06]` | **Fournisseur identité** | Supabase Auth (si même fournisseur DB) · Auth.js · Identité gérée maison | A07 |
| `[OPEN-D07]` | **Plafond XAF par montant** | 1 000 000 000 XAF proposé ; entier sûr JSON à confirmer par ADR | Architecture cible §Invariants |
| `[OPEN-D08]` | **RPO cible** | ≤ 1 h (recommandé) ou ≤ 24 h (risque accepté par écrit) | ZG08, A09 |
| `[OPEN-D09]` | **Fournisseur sauvegarde indépendante** | Backblaze B2 · S3-compatible hébergeur choisi | Plan déploiement §7 |
| `[OPEN-D10]` | **Région primaire** | À mesurer depuis Cameroun avant engagement | Plan déploiement §3 |

---

## 3. Structure des packages (monorepo pnpm)

```
kombe/
├── packages/
│   ├── api/          # Fastify — commandes, routes, authentification
│   ├── worker/       # Outbox processor, notifications externes
│   ├── client/       # React + Vite — PWA
│   ├── domain/       # Invariants métier, types partagés, oracles
│   └── db/           # Migrations, schéma, fixtures fictives
├── docs/             # ADR, OpenAPI, contrats
├── harness/          # Chaîne d'assurance H00 (scripts Python existants)
├── KOMBE_Audit_Construction/   # Dossier documentaire initial — ne pas modifier
├── STACK.md          # Ce fichier
├── .gitignore
└── pnpm-workspace.yaml
```

Le dossier `KOMBE_Audit_Construction/` est conservé tel quel. Il constitue la base documentaire du projet et ne sera jamais déplacé ni réécrit par les agents constructeurs.

---

## 4. Contraintes transversales non négociables

- **Aucun float pour les montants.** `bigint` en DB et en JS partout.
- **Horloge serveur seule.** `Africa/Douala` pour l'affichage des échéances ; l'horloge cliente n'est jamais de confiance.
- **Aucun secret en clair dans le dépôt.** Gitleaks en pre-push ; fichiers `.env*` exclus du suivi Git.
- **Fixtures fictives uniquement** pendant développement et CI ; aucune donnée réelle avant G0.
- **PostgreSQL réel dans tous les tests de concurrence et d'isolation.** Pas de mock pour prouver un verrou.
- **Contrôleur H00 versionné séparément.** Le code candidat ne peut pas modifier ses propres critères de recette.
- **Fonctionnalités P1+ désactivées côté serveur.** Même si l'UI les masque, le serveur les refuse avant la porte correspondante.

---

## 5. Versions à figer dans C00

Les versions exactes ci-dessous sont des cibles ; C00 doit les vérifier, les installer et les inscrire dans `pnpm-lock.yaml` avant la première release.

| Package | Version cible | Source officielle |
|---|---|---|
| Node.js | 22 LTS (latest patch) | [nodejs.org/en/download](https://nodejs.org/en/download/) |
| pnpm | ≥ 9 | [pnpm.io](https://pnpm.io/) |
| TypeScript | ≥ 5.5 | [typescriptlang.org](https://www.typescriptlang.org/) |
| Fastify | ≥ 5 | [fastify.dev](https://fastify.dev/) |
| React | ≥ 19 | [react.dev](https://react.dev/) |
| Vite | ≥ 6 | [vitejs.dev](https://vitejs.dev/) |
| PostgreSQL | ≥ 16 | [postgresql.org](https://www.postgresql.org/) |
| pg (node-postgres) | ≥ 8.12 | [node-postgres.com](https://node-postgres.com/) |
| Vitest | ≥ 2 | [vitest.dev](https://vitest.dev/) |
| Playwright | ≥ 1.47 | [playwright.dev](https://playwright.dev/) |
| fast-check | ≥ 3.22 | [fast-check.dev](https://fast-check.dev/) |
| Stryker | ≥ 8 | [stryker-mutator.io](https://stryker-mutator.io/) |
| ESLint | ≥ 9 | [eslint.org](https://eslint.org/) |

---

*Toute modification de ce fichier après C00 doit passer par un ADR versionnté dans `docs/adr/`.*
