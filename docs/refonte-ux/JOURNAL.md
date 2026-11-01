# Refonte UX intégrale — journal de progression

Branche : `refonte/ux-integrale` (depuis `design/immersif-v3` @ be318cc, elle-même 62 commits devant `master` = 14d6885).
PR cible : `design/immersif-v3` (diff lisible) — ne pas fusionner ni déployer en production sans accord.

## Contraintes d'environnement (vérifiées)
- Aucun téléchargement sur la machine (consigne utilisateur) : pas d'image d'émulateur → **recette Android sur appareil = NOT_TESTED** ; iOS : pas de Mac → **NOT_TESTED**.
- GitHub Actions bloqué (verrou de facturation du compte) : builds et publication en local (`node scripts/mobile/publier.mjs`).
- Pas de base Postgres de test locale ni de projet Neon KÓMBE accessible : les contrats réels sont prouvés par tests d'adaptateurs (MockClient) + lecture du serveur ; aucune écriture de test en production.

## Décisions
1. **Le serveur reste l'autorité** ; la refonte ne contourne aucune règle (auto-confirmation, rôles, cloisonnement).
2. **Clé d'idempotence stable par intention** (brouillon + caisse + tour) : le serveur rejoue la réponse stockée (`api_idempotency`), donc une reprise après coupure ne crée jamais de doublon et termine un lot partiel.
3. **Justificatif** : aucune route d'envoi de fichier n'existe. On n'affiche plus « Joint » ; l'étape devient une consigne honnête (garder la capture, la montrer au trésorier) — pas de faux upload.
4. **Notifications** : le serveur expose déjà `groupId` + `target` ; on ajoute `topic` (préfixe de la clé de dédoublonnage, compatible) pour des libellés exacts. Toucher = marquer lu + ouvrir la destination contrôlée (le serveur re-vérifie les droits à l'ouverture).
5. **Litiges** : pas d'API mobile → les parcours mobiles bloqués sont retirés ; la discipline (amendes, contestation) existe dans la PWA : transition explicite vers l'onglet Discipline du groupe.
6. **Navigation cible** (mobile et PWA) : barre supérieure épurée (groupe actif + cloche + avatar), menu latéral court (groupes, documents, aide, réglages), 3 destinations basses stables (Accueil, Cotisations, Activité) + bureau si fonction, panneaux (bottom sheets) pour les actions courtes.

## Lots
| Lot | Contenu | État |
|---|---|---|
| 0 | Compréhension, matrice | fait |
| 1 | Intégrité des actions mobiles (déclaration, invitation, validation, litiges, erreurs) | en cours |
| 2 | Notifications actionnables (API topic, mobile, PWA) | à faire |
| 3 | Fondations UI (tokens, panneaux, barre, menu) mobile + PWA | à faire |
| 4 | Accueil contextuel + groupe actif | à faire |
| 5 | Généralisation des écrans | à faire |
| 6 | Accessibilité, perf, recette finale | à faire |

## Prochaine action exacte
Lot 1 : réécrire `submitDraft` (clés stables, plafond, résultat partiel), séparer référence / commentaire dans `contribution_start_screen.dart`.
