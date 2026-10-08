# RELEASE READINESS — KÓMBE

Machine à états (§42) : `NOT_READY` → `STAGING_READY` → `STAGING_VERIFIED` →
`PRODUCTION_READY` → `PRODUCTION_DEPLOYED` → `PRODUCTION_VERIFIED`.
Une transition n'est validée que par une preuve réelle exécutée (§9) — jamais
par avancement d'intention.

## État courant : STAGING_READY (code) — déploiement PENDING (actions propriétaire)

Décision hébergement tranchée par le propriétaire le 2026-10-08 (§39 respecté :
gratuit uniquement, aucune dépense) : Neon (prod, séparée de la base de
vérification) + Vercel (API serverless, PWA, dashboard admin) + Cloudflare
Workers Static Assets (dashboards opérations/direction/engineering). Runbook :
DEPLOY.md §7.

| Porte | Exigence | Verdict réel | Date preuve |
|---|---|---|---|
| Build local propre | `pnpm -r --if-present run build` sans erreur | PASS (exécuté) | 2026-10-08 |
| Tests unitaires/régression | suites vitest (207/207) + flutter test | PASS (24/24 flutter ; 207/207 API) | 2026-10-08 |
| Preuves base réelle (0023) | `packages/api/test/*.proof.mjs` + `packages/db/tests/*.pg.mjs` | voir RELEASE_MANIFEST.json (verdicts par exécution, pas d'intention) | 2026-10-08 |
| §13 OpenAPI ↔ runtime | contrat servi = contrat versionné | PASS (commit 6c98ebf) | — |
| §18 liveness/readiness | `/v1/health/live`, `/v1/health/ready` | PASS (commit ab60037) | — |
| §20 sécurité | en-têtes durcis + CORS liste fermée + rate limit + audit deps + scan secrets | PASS code/audit (httpGuards, 3 tests dédiés) ; scan secrets : substitution manuelle (gitleaks absent, §39) | 2026-10-08 |
| Déploiement API serverless | handler Vercel + vercel.json + .vercelignore | PASS local (build + smoke HTTP réel du handler, CORS exact) ; **déploiement PENDING** (compte Vercel propriétaire) | 2026-10-08 |
| Dashboards Cloudflare | builds Vite + config → URL API + wrangler.toml | PASS local (3/3 builds, configs vers `https://kombe-api.vercel.app`, wrangler.toml versionnés) ; **déploiement BLOCKED_EXTERNAL** — token Cloudflare fourni lecture seule (§37, action exacte : token « Cloudflare Workers : Modifier ») | 2026-10-08 |
| PWA Flutter web | `flutter test` + `flutter build web --release` | PASS tests 24/24 ; build web **BLOCKED_EXTERNAL** (hôte sans toolchain complète — task #14, jamais de PASS déclaré) | 2026-10-08 |
| §22 smoke release | `release-smoke.mjs` contre production déployée | **NON EXÉCUTÉ** — attend le déploiement (job CI `release-smoke` prêt) | — |
| §17 vide→dernier jalon | `migrateEmptyToLatest.pg.mjs` sur base réelle | voir RELEASE_MANIFEST.json | 2026-10-08 |
| §23/§24 backup/restore | 6.1 puis 6.2 de DEPLOY.md exécutés | **BLOCKED_EXTERNAL** (binaires PG absents de l'hôte) | — |
| Base production Neon | DEPLOY.md §7.1 exécuté (base `kombe_prod`, 25 jalons, kombe_app vérifié) | **PASS (exécuté 2026-10-08)** — base dédiée dans le projet existant (bascule projet dédié : §6.3) | 2026-10-08 |
| Décision hébergement | `[OPEN-D01]/[OPEN-D02]` de STACK.md | **TRANCHÉ** (2026-10-08, DEPLOY.md §4/§7) | 2026-10-08 |

## Prochaine transition

`STAGING_READY` → `PRODUCTION_DEPLOYED` exige (ordre DEPLOY.md §7.0) :
projet Neon production créé + migrations exécutées (25 jalons) → API Vercel
déployée avec `health/ready` en mode réel → config des 4 dashboards pointée
vers l'URL API → dashboards Cloudflare + PWA + admin Vercel déployés →
`release-smoke` vert contre l'API en production.

Actions propriétaire requises (§39, §37) : comptes/tokens Vercel + Cloudflare,
projet Neon séparé, DNS définitifs (J+3..J+5). Détail exact : DEPLOY.md §7.6.
