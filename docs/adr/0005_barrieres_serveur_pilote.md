# ADR-0005 — Barrières serveur des fonctionnalités du pilote (G0)

- **Statut :** ADOPTÉ (C00)
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** `00_PROMPT_MAITRE` (le pilote **n'effectue aucun transfert
  du pot** ; tous les modules futurs restent **fermés côté serveur**) ; STACK.md
  §Contraintes ; `RISQUES_AGENTS_IA.md` (dérive de périmètre par l'IA).

## Décision
- Registre fermé de fonctionnalités **interdites au pilote** (`ForbiddenFeature`) :
  `wallet`, `loan`, `scoring`, `insurance`, `potAutoTransfer`, `aiModel`.
- **Toutes les barrières sont fermées par défaut** (`PILOT_FEATURE_GATES`, gelé).
- Le refus est décidé **côté serveur** : `assertNoForbiddenFeatureEnabled` lève
  `FEATURE_PILOT_FORBIDDEN` si une feature prohibée est ouverte ; `requestFeature`
  renvoie `{ enabled, rejected }` pour que l'adaptateur prouve le refus.
- **Masquer l'UI ne suffit pas** : aucune route OpenAPI n'expose ces fonctions
  (cf. `docs/openapi.yaml`), et le serveur les refuse indépendamment du client.
- Chaque module futur aura sa **propre condition de décision** (porte G1+) ; ouvrir
  une barrière exige un ADR dédié, jamais un simple flag.

## Alternatives rejetées
- Feature flags pilotés par le client / JWT — contournables, non auditables.
- Activer « potAutoTransfer » pour le pilote — explicitement exclu par le maître
  prompt (transfert du pot hors périmètre G0).
- Désactivation par convention non testée — refusée : la barrière est un **test**.

## Conséquences
- `pilot_forbidden_feature_enabled = false` devient une **preuve exécutable** du
  harnais (adaptateur C00), pas une affirmation documentaire.
- Le registre est la **source de vérité unique** ; l'OpenAPI et les schémas de
  commande doivent rester alignés avec lui (revue C00).
