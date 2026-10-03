# KÓMBE Mobile — Flutter

Client mobile Flutter natif du projet KÓMBE.

## Statut de ce lot

Ce livrable est un **client mobile de production à raccorder**, pas une maquette ni un jeu de démonstration.

- aucune tontine, aucun membre, aucun montant, aucun bénéficiaire, aucun vote et aucun historique n'est préchargé ;
- aucune opération métier n'est simulée comme réussie ;
- le client démarre en mode `backend unconfigured` et bloque les commandes qui exigent l'autorité serveur ;
- les seuls enregistrements locaux autorisés sont les **préférences UI** et les **brouillons explicitement saisis par l'utilisateur** ;
- validation, vote, changement de rôle, publication de règles et confirmation d'un décaissement restent des commandes serveur uniquement.

## Stack mobile

- Flutter stable 3.47.x / Dart 3.12+
- Material 3
- `go_router` pour la navigation et les deep links
- `provider` pour l'injection de dépendances
- MVVM / repositories / services selon les recommandations d'architecture Flutter
- SQLite (`sqflite`) uniquement pour les brouillons locaux
- `flutter_secure_storage` pour le futur matériel de session opaque
- `local_auth` pour la biométrie système
- l10n FR/EN via `gen_l10n`

## Démarrage

Le code applicatif est complet dans `lib/`. Les enveloppes Android/iOS sont volontairement générées par le SDK Flutter installé localement afin d'éviter de figer des templates de plateforme différents de la version SDK réellement utilisée.

```bash
cd apps/mobile
flutter --version
flutter create . --platforms=android,ios --org com.kombe --project-name kombe_mobile
flutter pub get
flutter gen-l10n
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
flutter run
```

Après `flutter create .`, vérifier le diff : aucun fichier de `lib/`, `test/`, `pubspec.yaml`, `analysis_options.yaml` ou `l10n.yaml` ne doit être remplacé silencieusement.

## Raccordement au backend

Remplacer les repositories `Unavailable*Repository` fournis par `AppDependencies.unconfigured()` par les adapters HTTP réels conformes à `docs/openapi.yaml` du dépôt KÓMBE.

Les widgets n'ont pas à être réécrits : les vues consomment uniquement les interfaces `domain/repositories/`.

## Tests obligatoires avant merge

```bash
flutter analyze
flutter test
python3 tool/audit_no_embedded_business_data.py
```

Aucun PASS n'est déclaré dans ce paquet tant que ces commandes ne sont pas exécutées dans un environnement Flutter réel.
