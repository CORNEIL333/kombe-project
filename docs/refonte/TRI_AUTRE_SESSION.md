# Tri du travail de `kombe project` (branche `immersif-v3`)

État relevé le 2026-11-06, en lecture seule. Rien n'a été modifié dans ce dossier.

## Ce qui s'y trouve

- 71 fichiers non enregistrés : 63 modifiés, 8 nouveaux.
- 2 commits absents de `refonte/premium-photos` : traduction du mobile et de la PWA (FR/EN/PCM).
- Mobile : 48 fichiers, +3461 / −1674 lignes. Le travail remplace les textes français écrits en dur par des clés de traduction (`AppLocalizations`).
- Tableaux de bord : 15 fichiers, +547 / −466 lignes (`apps/dashboard-*`, `packages/dashboard-core`).

## Risque

52 fichiers sont modifiés des deux côtés, dont 43 dans `packages/mobile/lib`. La refonte a réécrit ces écrans et changé leurs textes (« J'ai payé », « Règles », « Paiement »). Une fusion directe donnera des conflits sur presque tous les écrans mobiles, et les anciennes formulations reviendraient dans les fichiers de traduction.

Les tableaux de bord ne se recoupent presque pas avec la refonte : ce travail peut être repris tel quel.

## Ordre conseillé

1. Enregistrer ce travail sur sa propre branche : il n'est pas sauvegardé, et rien ne le protège aujourd'hui.
2. Fusionner `refonte/premium-photos` dans `master` après le test sur téléphone.
3. Reprendre les tableaux de bord depuis cette branche, sans conflit attendu.
4. Refaire la traduction du mobile écran par écran sur la version refondue, plutôt que fusionner : les textes ont changé, et la même méthode s'applique vite. Garder les fichiers `.arb` comme point de départ en y portant le nouveau vocabulaire.
5. Vérifier `probe_legacy.json` et le nouveau test de `packages/api/test` avant de les garder.

Décision à prendre par le propriétaire : la session qui a produit ce travail est-elle terminée ? Si elle tourne encore, il faut la prévenir avant toute fusion.
