# Rapport final — refonte KÓMBE 0.8.0

Branche `refonte/premium-photos`. Décisions : [DESIGN.md](../refonte/DESIGN.md). Comparaison : [AVANT_APRES.md](../refonte/AVANT_APRES.md). Tri de l'autre session : [TRI_AUTRE_SESSION.md](../refonte/TRI_AUTRE_SESSION.md).

## En production

| Élément | Statut |
|---|---|
| Migrations 0032 à 0035 | PASS, appliquées (sauvegarde Neon `sauvegarde-avant-0-8-0-20261105`) |
| Site et API | PASS, `/v1/health/ready` prêt, `/v1/me/photo` 401 sans session |
| Connexion PWA | PASS, 0 pixel de différence |
| Release mobile 0.8.0 (build 80) | PASS, signature `f4d8…4025` identique à la 0.7.1, manifeste vérifié |

## Sur la branche, pas encore en ligne

Lien `/telecharger/` vers GitHub, photos dans les paiements et validations, perles visibles sur l'accueil PWA, moments (sceau, retard, tour), vue tablette, vocabulaire. Le site demande un déploiement, le mobile une version 0.8.1.

## Vérifications

| Vérification | Statut |
|---|---|
| Tests domaine, API, PWA, mobile | PASS |
| Débordements mobile : 32 écrans à 320, 360 (texte × 1,3) et 820 px | PASS |
| PWA : 23 écrans à 390, 820, 1440 px | PASS |
| Routes de photo sur une vraie base, de bout en bout | NOT_TESTED, pas de test dédié |
| Installation sur téléphone Android | NOT_TESTED |
| iOS, TalkBack, VoiceOver | NOT_TESTED |

## Non fait

Séances, amendes et secours natifs ; tableaux de bord ; vue maître-détail sur tablette (seule la navigation latérale existe) ; photo pour les membres sans smartphone ; photo obligatoire (rappel seulement).
