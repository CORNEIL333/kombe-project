# RELEASE READINESS — KÓMBE

Machine à états (§42) : `NOT_READY` → `STAGING_READY` → `STAGING_VERIFIED` →
`PRODUCTION_READY` → `PRODUCTION_DEPLOYED` → `PRODUCTION_VERIFIED`.
Une transition n'est validée que par une preuve réelle exécutée (§9) — jamais
par avancement d'intention.

## État courant : STAGING_READY (code) — déploiement PENDING (actions propriétaire)

Décision hébergement mise à jour le 2026-10-09 (§39 respecté : gratuit
uniquement, aucune dépense) : **LE projet Vercel unique** (site + PWA +
tableaux de bord + API à la même origine, `dist-web` + `/v1/*`) + Neon
(`kombe_prod`, 27 jalons). Déploiement automatique à chaque push master via
GitHub Actions (machine locale éteinte). Runbook : DEPLOY.md §7.

| Porte | Exigence | Verdict réel | Date preuve |
|---|---|---|---|
| Build local propre | `pnpm -r --if-present run build` sans erreur | PASS (exécuté) | 2026-10-08 |
| Tests unitaires/régression | suites vitest (207/207) + flutter test | PASS (24/24 flutter ; 207/207 API) | 2026-10-08 |
| Preuves base réelle (0023) | `packages/api/test/*.proof.mjs` + `packages/db/tests/*.pg.mjs` | voir RELEASE_MANIFEST.json (verdicts par exécution, pas d'intention) | 2026-10-08 |
| §13 OpenAPI ↔ runtime | contrat servi = contrat versionné | PASS (commit 6c98ebf) | — |
| §18 liveness/readiness | `/v1/health/live`, `/v1/health/ready` | PASS (commit ab60037) | — |
| §20 sécurité | en-têtes durcis + CORS liste fermée + rate limit + audit deps + scan secrets | PASS code/audit (httpGuards, 3 tests dédiés) ; scan secrets : substitution manuelle (gitleaks absent, §39) | 2026-10-08 |
| Déploiement API serverless | handler Vercel + vercel.json + .vercelignore | PASS local (build + smoke HTTP réel du handler, CORS exact) ; **déploiement PENDING** (compte Vercel propriétaire) | 2026-10-08 |
| Pipeline CI déploiement | `.github/workflows/deploy-vercel.yml` (push master → deploy --prod → smoke) | PASS local (workflow versionné, skip gracieux sans secrets) ; **exécution PENDING** (secrets GitHub propriétaire : VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, KOMBE_API_DATABASE_URL, KOMBE_MIGRATION_DATABASE_URL) | 2026-10-09 |
| Dashboards Cloudflare | — | **SUPERSEDÉ 2026-10-09** : dashboards assemblés dans dist-web (projet Vercel unique, même origine) | 2026-10-09 |
| Mobile Flutter | `flutter test` + build web + APK Android | PASS tests 24/24 ; build web **pris en charge par le workflow `mobile-ci.yml`** (aucun secret requis, artifact APK) ; exécution CI PENDING | 2026-10-09 |
| PWA Flutter web | `flutter test` + `flutter build web --release` | PASS tests 24/24 ; build web **BLOCKED_EXTERNAL** (hôte sans toolchain complète — task #14, jamais de PASS déclaré) | 2026-10-08 |
| §22 smoke release | `release-smoke.mjs` contre production déployée | **NON EXÉCUTÉ** — attend le déploiement (job CI `release-smoke` prêt) | — |
| §17 vide→dernier jalon | `migrateEmptyToLatest.pg.mjs` sur base réelle | voir RELEASE_MANIFEST.json | 2026-10-08 |
| §23/§24 backup/restore | 6.1 puis 6.2 de DEPLOY.md exécutés | **BLOCKED_EXTERNAL** (binaires PG absents de l'hôte) | — |
| Base production Neon | DEPLOY.md §7.1 exécuté (base `kombe_prod`, **27 jalons**, kombe_app vérifié) | **PASS (exécuté 2026-10-08 ; avancé 2026-10-09 : 0024+0025 appliqués, kombe_app EXECUTE `kombe_member_groups` vérifié en base réelle)** — base dédiée dans le projet existant (bascule projet dédié : §6.3) | 2026-10-09 |
| Décision hébergement | `[OPEN-D01]/[OPEN-D02]` de STACK.md | **TRANCHÉ** (2026-10-08, DEPLOY.md §4/§7) | 2026-10-08 |

## Prochaine transition

`STAGING_READY` → `PRODUCTION_DEPLOYED` exige (DEPLOY.md §7.0) : base Neon
`kombe_prod` ~~créée~~ **fait** (27 jalons) → **secrets GitHub Actions posés**
(§7.6.2) → push master → workflow `deploy-vercel.yml` : deploy --prod +
migrations auto + smoke vert contre l'URL déployée.

Action propriétaire requise (§37) : créer le projet Vercel unique et poser les
5 secrets GitHub (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID,
KOMBE_API_DATABASE_URL, KOMBE_MIGRATION_DATABASE_URL). Détail : DEPLOY.md §7.6.
