# Rapport final — refonte « African Contemporary Premium » + photo de tontine

Branche : `refonte/premium-photos` (base `refonte/ux-integrale`). Aucun déploiement en production.

## Livré

| Lot | Contenu | Commits |
|---|---|---|
| A — Photo serveur | Migration 0034 (`group_photo`, bytea 512/256, RLS, sans DELETE applicatif), `cleanGroupPhoto` (structure JPEG, dimensions réelles, EXIF/APPn/COM retirés), permission `group.photo` (présidence, vice-présidence, secrétariat), 6 changements/heure, journal `tontine.photo_changed/removed`, routes `GET/PUT/DELETE /v1/tontines/:id/photo` + invitation, ETag versionné, OpenAPI | 9d51e29, 966f75b |
| B1 — PWA | 4 destinations (Accueil, Cotisations, Groupes, Activité), cloche → non lues en demi-fenêtre, coquille forêt persistante ≥ 900 px, accueil bento, Mes groupes, Activité filtrée, photo de groupe (recadrage, JPEG 512/256 côté client), squelettes, `cyclePosition` réel | 507f506, 966f75b |
| B2 — Flutter | Même structure à 4 onglets, barre avec pilule du groupe et cloche, accueil de la planche, menu forêt/ivoire, Groupes, Activité, éditeur de photo (galerie/appareil, isolat, EXIF effacé) | 68f0e9e |

## Statuts de recette

| Vérification | Statut | Preuve |
|---|---|---|
| Tests domaine (444) | PASS | `pnpm -C packages/domain test` |
| Tests API (249) | PASS | `pnpm -C packages/api test` |
| Tests PWA (30) | PASS | `pnpm -C packages/client test` (garde « épargne »/« retrait » incluse) |
| Flutter analyze + 46 tests + goldens + visite | PASS | `flutter analyze`, `flutter test` |
| PWA 360/390/430/768/1024/1440 : ni erreur de page, ni défilement horizontal | PASS | Playwright local, `captures/pwa/` |
| Écran de connexion PWA inchangé | PASS | 0 pixel de différence avec la production (`captures/pwa/connexion-*`) |
| EXIF/GPS absents des photos (serveur et mobile) | PASS | tests `groupPhoto.test.ts`, `group_photo_test.dart` |
| Migration 0034 sur PostgreSQL réel | BLOCKED | aucune base isolée disponible ; aucune action sur Neon sans accord |
| Build APK | NOT_TESTED | `image_picker` ajoute des artefacts Gradle absents du cache ; téléchargement interdit |
| Appareil Android / iOS, TalkBack / VoiceOver | NOT_TESTED | pas d'émulateur ni d'appareil branché |
| Mise en production | NOT_TESTED | non autorisée |

## Écarts connus

- PWA bureau : conteneur limité à 64 rem (le bento est serré à 1440 px) ; espacement icône/titre de section ; ligne de date du téléphone à libeller « Avant le … ». Corrections préparées puis interrompues : non appliquées.
- Le « 👋 » de l'accueil Flutter apparaît comme un carré dans les goldens (pas de police emoji en test) ; à confirmer sur appareil.
- Aucune photo de personnes n'est utilisée comme photo de tontine ni présentée comme membre ; fonds conservés : tissage, Yaoundé, paysage, confirmation.

## Pour livrer

1. Relire et fusionner la PR `refonte/premium-photos` → `refonte/ux-integrale`.
2. Appliquer la migration 0034 sur une branche Neon de recette, puis vérifier `PUT/GET/DELETE` photo de bout en bout.
3. Construire l'APK sur une machine où le cache Gradle contient `image_picker`, puis recette sur téléphone (photo galerie + appareil, TalkBack).
