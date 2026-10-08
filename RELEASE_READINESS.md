# RELEASE READINESS — KÓMBE

Machine à états (§42) : `NOT_READY` → `STAGING_READY` → `STAGING_VERIFIED` →
`PRODUCTION_READY` → `PRODUCTION_DEPLOYED` → `PRODUCTION_VERIFIED`.
Une transition n'est validée que par une preuve réelle exécutée (§9) — jamais
par avancement d'intention.

## État courant : NOT_READY

| Porte | Exigence | Verdict réel | Date preuve |
|---|---|---|---|
| Build local propre | `pnpm -r --if-present run build` sans erreur | PASS (exécuté) | 2026-10-08 |
| Tests unitaires/régression | suites vitest + flutter test | PASS (24/24 flutter ; suites API) | 2026-10-08 |
| Preuves base réelle (0023) | `packages/api/test/*.proof.mjs` + `packages/db/tests/*.pg.mjs` | voir RELEASE_MANIFEST.json (verdicts par exécution, pas d'intention) | 2026-10-08 |
| §13 OpenAPI ↔ runtime | contrat servi = contrat versionné | PASS (commit 6c98ebf) | — |
| §18 liveness/readiness | `/v1/health/live`, `/v1/health/ready` | PASS (commit ab60037) | — |
| §20 sécurité | en-têtes durcis + audit deps + scan secrets | PASS code/audit ; scan secrets : substitution manuelle (gitleaks absent, §39) | 2026-10-08 |
| §22 smoke release | `pnpm release:smoke` contre staging **déployé** | **NON EXÉCUTÉ** — attend le staging | — |
| §17 vide→dernier jalon | `migrateEmptyToLatest.pg.mjs` sur base réelle | voir RELEASE_MANIFEST.json | 2026-10-08 |
| §23/§24 backup/restore | 6.1 puis 6.2 de DEPLOY.md exécutés | **BLOCKED_EXTERNAL** (binaires PG absents de l'hôte) | — |
| Staging déployé | §25 (accès existants) | **NON DÉPLOYÉ** | — |
| Décision hébergement | `[OPEN-D01]/[OPEN-D02]` de STACK.md | **OUVERT — décision propriétaire** (§39) | — |

## Prochaine transition

`NOT_READY` → `STAGING_READY` exige : staging réellement déployé +
`pnpm release:smoke` vert contre lui. La décision hébergement (prod) reste
ouverte et ne bloque pas le staging.
