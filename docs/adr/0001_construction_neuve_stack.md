# ADR-0001 — Construction neuve, monorepo pnpm, stack verrouillée

- **Statut :** ADOPTÉ (C00)
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** Décisions D01 (construction à zéro), D05 (proposition d'architecture), `01_Audit/ARCHITECTURE_CIBLE.md`.

## Décision
- Dépôt neuf ; les données/sources historiques du dossier sont **préservées**, non réutilisées comme code.
- Monorepo **pnpm workspaces**, paquets : `domain`, `api`, `db`, `worker`, `client`.
- Stack : TypeScript strict (Node 22+), Fastify 5, PostgreSQL 16+, driver `pg` (pas d'ORM de couche), Vitest, PWA React/Vite (client différé C02+).
- Versions **fixées par lockfile** (`pnpm-lock.yaml`) ; `packageManager` épinglé.
- Politique d'installation stricte : aucun build de dépendance exécuté (voir ADR-0009).

## Alternatives rejetées
- Réutilisation de l'ancien MVP — rejetée par D01.
- Monorepo npm/yarn — lockfile moins déterministe / hoisting moins contrôlé.
- ORM de couche — masque les verrous et le contexte transactionnel exigés par les invariants.

## Conséquences
- `pnpm run recette:c00` (build + tests) = commande de recette reproductible.
- Les choix de fournisseurs restent `[OUVERT-D01..D10]` (non adoptés ici).
