# ADR-0021 — Fournisseur PostgreSQL géré : Neon

- **Statut :** ADOPTÉ — décision humaine du 2026-10-03
- **Décision remplacée :** `OPEN-D02` de `STACK.md`
- **Portée :** hébergement PostgreSQL géré pour `packages/db` ; projet Neon `square-resonance-19892972`, branche `production`

## Décision

KÓMBE adopte **Neon** comme fournisseur PostgreSQL géré, parmi les options documentées en C00 (Supabase payant · Neon · Render Postgres — `TEC04`, `ZN03`).

Le projet Neon `square-resonance-19892972` est lié au dépôt via `neon link --branch production`. Ceci fixe l'**hébergement** de la base ; cela ne modifie aucune des décisions déjà arrêtées en C00 (`pg` node-postgres sans ORM, transactions manuelles, RLS, rôles `kombe_migrateur`/`kombe_app`/`kombe_worker` sans `BYPASSRLS`, migrations SQL versionnées dans `packages/db/migrations`). Les rôles et `DEFAULT PRIVILEGES` définis par `packages/db` s'appliquent à l'identique sur Neon — aucune réécriture de schéma n'est nécessaire.

## Pourquoi Neon plutôt que Supabase ou Render

- PostgreSQL géré nu, sans surcouche imposée côté authentification/API — cohérent avec le choix déjà arrêté de ne pas déléguer l'auth à un fournisseur DB tant qu'`OPEN-D06` n'est pas tranché (voir « Hors-périmètre » ci-dessous).
- Branches de base de données natives (copy-on-write) — utile pour aligner un environnement de preview/CI sur un état de schéma donné, sans dupliquer manuellement les fixtures.
- Compatible RLS et rôles PostgreSQL standards : aucune des preuves base réelle déjà écrites (`packages/db/tests/isolation.pg.mjs`, H07) n'a besoin d'être adaptée.

## Hors-périmètre de cette décision

Le scaffold généré par `neon config init` (`neon.ts`) active par défaut `auth: true` et déclare une fonction d'exemple (`functions.api` → `hello.ts`) ainsi qu'un bucket de stockage (`buckets.uploads`). **Ces primitives sont conservées telles quelles comme gabarit de départ, pas comme décision d'architecture :**

- `auth: true` ne résout **pas** `OPEN-D06` (fournisseur d'identité). KÓMBE n'adopte pas Neon Auth par cet ADR ; l'identité reste gérée par `packages/api` (C02) jusqu'à décision explicite sur `OPEN-D06`.
- La fonction `hello.ts` et le bucket `uploads` sont un exemple de plateforme, non branchés au domaine métier, non exposés aux utilisateurs, et ne doivent recevoir aucune donnée réelle avant une porte explicite.
- Aucun secret (clé API, chaîne de connexion) n'est commité dans le dépôt ; `neon login` authentifie la session locale de l'opérateur, pas le dépôt.

## Conséquences

- `STACK.md` §2 : `OPEN-D02` passe de décision ouverte à décision arrêtée (§1), référence `ADR-0021`.
- Les preuves base réelle (H07, H18) restent gouvernées par `ADR-0007`/`ADR-0010` ; Neon ne change pas leur statut `BLOCKED` sur un hôte sans réseau vers la base — il devient la cible quand ce réseau existe.
- `OPEN-D06` (identité), `OPEN-D09` (sauvegarde indépendante) et `OPEN-D10` (région primaire, à mesurer depuis le Cameroun) restent ouverts et non engagés par cet ADR.
