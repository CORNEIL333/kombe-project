# Mission — KÓMBE « African Contemporary Premium »

Source : prompt maître de l'utilisateur (2026-11-01). Branche `refonte/premium-photos`, empilée sur `refonte/ux-integrale` (PR #5).

## Objectifs
1. Direction artistique premium (forêt `#103C32`, jade `#16765E`, ivoire `#FBF8F1`, menthe `#DCEFE6`, or `#C99439`, encre `#13211C`) en tokens centralisés Flutter + PWA, sans dégradés omniprésents ni effets coûteux.
2. Navigation à QUATRE destinations : Accueil · Cotisations · Groupes · Activité (la cloche ouvre les non-lues en demi-fenêtre ; l'onglet donne l'historique). Bureau accessible depuis Groupes / fiche groupe.
3. Photo de profil par tontine, de bout en bout (API, stockage, autorisations, clients), fallback initiales + motif.
4. Recomposition des écrans prioritaires (accueil + squelette, groupes, menu, cotisations, activité, fiche groupe).

## Contraintes
- Ne pas toucher l'écran de connexion PWA (`#/`), « parfait » selon l'utilisateur.
- Pas de production, pas de stockage externe, pas de données réelles modifiées sans accord.
- Aucun téléchargement sur la machine de l'utilisateur ; builds locaux autorisés ; GitHub Actions bloqué (facturation).
- Images de personnes : illustrations synthétiques, jamais présentées comme membres ni affectées à une tontine.
- « KÓMBE ne conserve pas l'argent » reste vrai ; calculs et droits côté serveur.

## Critères de fin
Quatre onglets et photo de groupe fonctionnels et testés sur les deux clients ; tokens appliqués aux écrans prioritaires ; captures 360/390/430/768/1024/1440 ; FINAL_REPORT honnête (PASS/FAIL/BLOCKED/NOT_TESTED).
