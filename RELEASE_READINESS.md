# RELEASE READINESS — KÓMBE

Machine à états (§42) : `NOT_READY` → `STAGING_READY` → `STAGING_VERIFIED` →
`PRODUCTION_READY` → `PRODUCTION_DEPLOYED` → `PRODUCTION_VERIFIED`.
Une transition n'est validée que par une preuve réelle exécutée (§9) — jamais
par avancement d'intention.

## État courant : PRODUCTION_DÉPLOYÉE (Vercel projet unique) — redéploiement des correctifs du 2026-10-15 en attente (§7.10)

**Production en ligne et saine** : `https://kombe.vercel.app` — smoke §22
`SMOKE_PASS` exit 0 exécuté le 2026-10-15 (live ok, ready `mode:"réel"`, auth
401 propres, canal email ouvert, 5 frontaux + config 200 ; preuve
`C:/Users/migco/AppData/Local/Temp/release-smoke-prod-2026-10-15.log`). Le
déploiement a été exécuté hors CI (CLI Vercel, session antérieure/propriétaire).
Les correctifs du 2026-10-15 (7 commits : démarrage de cycle mobile, session
401, PWA invitations/hypothèses, dashboard bureau, docs) et les APK
reconstruits attendent un redéploiement — **BLOCKED_EXTERNAL** faute
d'identifiants Vercel pour la session autonome : action exacte en DEPLOY.md
§7.10.

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
| §22 smoke release | `release-smoke.mjs` contre production déployée | **PASS (SMOKE_PASS exit 0, 2026-10-15, kombe.vercel.app)** — preuve Temp/release-smoke-prod-2026-10-15.log | 2026-10-15 |
| §17 vide→dernier jalon | `migrateEmptyToLatest.pg.mjs` sur base réelle | voir RELEASE_MANIFEST.json | 2026-10-08 |
| §23/§24 backup/restore | 6.1 puis 6.2 de DEPLOY.md exécutés | **BLOCKED_EXTERNAL** (binaires PG absents de l'hôte) | — |
| Base production Neon | DEPLOY.md §7.1 exécuté (base `kombe_prod`, **27 jalons**, kombe_app vérifié) | **PASS (exécuté 2026-10-08 ; avancé 2026-10-09 : 0024+0025 appliqués, kombe_app EXECUTE `kombe_member_groups` vérifié en base réelle)** — base dédiée dans le projet existant (bascule projet dédié : §6.3) | 2026-10-09 |
| Décision hébergement | `[OPEN-D01]/[OPEN-D02]` de STACK.md | **TRANCHÉ** (2026-10-08, DEPLOY.md §4/§7) | 2026-10-08 |

## Prochaine transition

**Redéployer les correctifs du 2026-10-15** (DEPLOY.md §7.10, BLOCKED_EXTERNAL
→ porteur) : CLI Vercel (`vercel login`, `vercel link --project kombe`,
`npx vercel deploy --prod --yes`) ou pose des 5 secrets GitHub (§7.6.2) pour
que chaque push master déploie + smoke seul — machine éteinte. Vérification
post-déploiement : smoke §7.7 vert + `/telecharger/kombe-arm64.apk` ≈ 21,4 Mo
(l'APK servi actuellement, ≈ 20,7 Mo, date d'avant le démarrage de cycle).
