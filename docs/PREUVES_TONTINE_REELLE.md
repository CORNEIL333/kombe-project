# Preuves — « KÓMBE, tontine réelle »

Exécutées le 13 octobre 2026 dans la session cloud, sur le HEAD de
`claude/continue-previous-a102rx`. Chaque ligne est une commande réellement
lancée et son résultat ; rien n'est simulé. Sans base ou sans navigateur, ces
scripts sortent `BLOCKED` (code 2), jamais `PASS`.

## Environnement

PostgreSQL 16 local (rôle applicatif `kombe_app`, sans BYPASSRLS), Node 22,
pnpm, Chromium (`/opt/pw-browsers/chromium`), Flutter 3.x. Simulateur SMS :
le code s'affiche en développement, aucun SMS réel.

## Monorepo

| Commande | Résultat |
|---|---|
| `pnpm -r run typecheck` | exit 0 |
| `pnpm -r run build` | exit 0 |
| `pnpm -r run test` | exit 0 — domaine 425, API 243, dashboard-core 33, client 23, Espace bureau 3, Opérations 4, Direction 3, Engineering 1 |

## PostgreSQL réel — `scripts/proofs-local.sh` (base fraîche migrée par preuve)

| Preuve | Statut |
|---|---|
| `packages/db/tests/isolation.pg.mjs` (dont `C30_DECISION` : 0 ligne inter-groupe, bulletin étranger refusé, bulletin non modifiable) | PASS |
| `packages/db/tests/migrateEmptyToLatest.pg.mjs` (33 jalons : rôles + 0001 → 0031 + rôles) | PASS |
| `packages/api/test/tontineApi.proof.mjs` (44 vérifications : parcours complet) | PASS |
| `packages/api/test/decisions.proof.mjs` (55 vérifications : part partagée, pause, suspension, destitution, exclusion avec dette / place vacante, reprise de place, vote secret, cahier, diaspora, tour prioritaire, échange, idempotence, tiers 404, journal) | PASS |
| `packages/api/test/opsConsole.proof.mjs` et 15 preuves des stores (accès, cotisations, décaissements, litiges, journal, métriques, amorçage, propositions, règles, calendrier, sessions, validations, worker, mode réel) | PASS |
| `packages/api/test/tontineCycles.proof.mjs` (45 vérifications, ADR-0039 : cycle complet avec trésorier et commissaire uniques, simulateur, « mon tour », régularité, résumé WhatsApp, réserve rendue, cycle 2) | PASS |
| **Total** | **20 / 20 PASS** |

## Navigateur — Playwright / Chromium contre l'API réelle

`KOMBE_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` (dans `packages/client`) :

| Parcours | Statut |
|---|---|
| `tontine.spec.ts` — tour complet à trois personnes | PASS |
| `decisions.spec.ts` — pause votée puis reprise du cahier | PASS |
| `seanceHorsLigne.spec.ts` — déclarations sans réseau, envoyées une seule fois au retour | PASS |
| `horsLigne.spec.ts` (2) — bandeau hors connexion, accessibilité clavier | PASS |
| `cycles.spec.ts` — « Mon tour », régularité, cycle complet avec trésorier unique bénéficiaire, cycle 2 démarré depuis la PWA | PASS |

Espace bureau « Votes & sanctions » piloté dans Chromium, servi en même
origine par l'API (`/bureau/`) : scrutins, bulletins secrets, dépouillement.

## Mise en ligne simulée

`node scripts/build-web.mjs` puis `KOMBE_SMOKE_BASE_URL=http://localhost:3000 node scripts/release-smoke.mjs` → `SMOKE_PASS`
(API prête en mode réel, voies de connexion, PWA et 4 tableaux de bord servis, configuration même origine).

## Mobile

`cd packages/mobile && flutter analyze` → 0 erreur, 0 avertissement ;
`flutter test` → 51 PASS (dont contrats HTTP des adaptateurs tontine : chemins,
clés d'idempotence, montants entiers, votes).

## Non exécuté (voir `docs/BLOCAGES_TONTINE_REELLE.md`)

SMS / WhatsApp / e-mail réels, déploiement Vercel, migrations sur `kombe_prod`,
build Android signé, parcours mobile sur appareil, exercice de restauration.
