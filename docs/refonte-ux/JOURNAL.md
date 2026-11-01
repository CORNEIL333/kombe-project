# Refonte UX intégrale — journal de progression

Branche : `refonte/ux-integrale` (depuis `design/immersif-v3` @ be318cc). PR vers `design/immersif-v3`. Ne pas fusionner ni déployer en production sans accord.

## Contraintes d'environnement (vérifiées)
- Aucun téléchargement sur la machine (consigne utilisateur) : pas d'image d'émulateur → recette Android sur appareil NOT_TESTED ; iOS : pas de Mac → NOT_TESTED.
- GitHub Actions bloqué (verrou de facturation du compte) : builds et tests en local.
- Pas de base Postgres de test isolée : contrats prouvés par tests d'adaptateurs + lecture du serveur ; rien écrit en production. Les captures PWA « avant » interceptent toutes les requêtes API (données de test).

## Décisions
1. Le serveur reste l'autorité ; aucune protection contournée.
2. Clé d'idempotence dérivée de l'intention pour les déclarations (le serveur rejoue la réponse mémorisée).
3. Rien de factice : étape justificatif, litiges mobiles, exports vides, « Découvrir », biométrie et préférences de notification sans effet → retirés ou rendus honnêtes.
4. Notifications : `topic`/`subjectId` ajoutés à l'API (sans migration) ; catalogue partagé mobile/PWA.
5. Navigation commune : groupe actif + barre haute + menu latéral + 3 onglets stables (+ Bureau selon la fonction).

## Lots
| Lot | Contenu | État | Commit |
|---|---|---|---|
| 0 | Compréhension, matrice | fait | fd4f45b |
| 1 | Intégrité mobile (déclaration, invitation, validation, litiges, erreurs) | fait | fd4f45b |
| 2–5 | Notifications (API + mobile), coquille mobile, accueil, fiche groupe, bureau | fait | 9bfcb79 |
| 3–5 PWA | Coquille, accueil, notifications | fait | c5e91dd |
| 5 bis | Réglages honnêtes, jargon, votes clos | fait | cd19a49 |
| 6 | Rapport, captures, matrice | fait | (ce commit) |
| 7 | Refonte visuelle fine des écrans secondaires ; push ; verrou biométrique | à faire | — |

## Vérifications (dernier passage)
`flutter analyze` 0/0 · `flutter test` 43 · domaine 439 · API 248 · PWA 28 · dashboards 44 · visite complète de l'app mobile (`KOMBE_TOUR=1`) · Playwright PWA (menu, focus, groupe, notification → onglet, retour navigateur).

## Prochaine action exacte
Lot 7 : redessiner les écrans secondaires mobiles (cycle, membres, caisses, statuts, profil) avec les mêmes lignes/sections que l'accueil, puis les onglets du groupe PWA ; recette TalkBack et texte à 200 % dès qu'un appareil est disponible.
