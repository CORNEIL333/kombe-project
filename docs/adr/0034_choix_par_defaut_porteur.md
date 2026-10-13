# ADR-0034 — Choix par défaut à confirmer par le porteur

- **Statut :** **PROPOSÉ, appliqué par défaut** (section 7 du prompt maître) — chaque choix est configurable par groupe quand c'est possible.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Plusieurs décisions de produit étaient ouvertes ; il fallait des valeurs pour construire.

## Décision

| Question | Choix appliqué |
|---|---|
| Njangi seul ou association complète ? | Association complète : cagnotte, secours, amendes, fonctionnement, réserve de fin d'année |
| Amendes dès le pilote ? | Oui, caisse séparée, barème accepté, contestation possible |
| Mot pour l'épargne collective | « Réserve de fin d'année » |
| Anciens groupes Firebase | Import de l'historique en lecture seule (L-20) |
| Transparence « qui a payé » | Visible de tous les membres, configurable (bureau seulement, anonymisé) |
| Collecte par tontinier | Implémentée, drapeau fermé |
| Prêts | Registre implémenté, drapeau fermé |

## Conséquences

Le porteur confirme ou inverse chaque ligne ; une inversion fait l'objet d'une ADR qui remplace celle-ci sur ce point.
