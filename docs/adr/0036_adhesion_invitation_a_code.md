# ADR-0036 — Adhésion par invitation à code ; l'amorçage `/v1/groups` reste pour compatibilité

- **Statut :** **PROPOSÉ, appliqué par défaut** — résout X-03 et X-04.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Deux mécanismes coexistaient : `join_code` + parrainage + découvrabilité (migration 0024, en production) et invitations à code expirantes et révocables (0026). Deux créations de groupe aussi (`POST /v1/groups`, `POST /v1/tontines`).

## Décision

- Voie produit : `POST /v1/tontines` et invitations à code (8 caractères sans ambiguïté, durée et nombre d'usages bornés, révocables, partage WhatsApp, `#/rejoindre/CODE`) ; l'adhésion reste en attente jusqu'à l'admission par la présidence.
- `/v1/groups` (amorçage, parrainage, groupes découvrables) reste servi et prouvé pour compatibilité ; aucun client ne l'utilise plus. Le nom affiché du groupe est commun (`group.display_name`).
- Borne du nombre de membres : 2 à 60 (règle serveur unique, formulaire aligné) ; `minimum_members` de 0024 n'est pas utilisé par l'API tontine.

## Conséquences

Retrait de l'amorçage : à décider après le pilote, par migration explicite.
