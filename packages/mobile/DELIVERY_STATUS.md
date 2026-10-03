# KÓMBE Mobile Flutter — État de livraison

## Périmètre livré

- 47 écrans applicatifs réels recensés dans `docs/mobile/SCREEN_INVENTORY.md`.
- Architecture UI / ViewModel / Repository / Service, avec dépendances injectées.
- Navigation `go_router`, Material 3, design system KÓMBE et structure FR/EN.
- Contrats de repositories couvrant session, profil, dashboard, groupes, cotisations, gouvernance, litiges, notifications, documents et brouillons.
- SQLite limité aux brouillons explicitement saisis par l'utilisateur.
- Secure storage réservé aux futurs jetons/sessions opaques ; aucun PIN persistant.
- Biométrie via l'OS.
- Zéro seed métier et zéro donnée de démonstration embarquée.
- Les commandes exigeant l'autorité serveur restent bloquées tant que le backend réel n'est pas raccordé.

## Vérifications statiques exécutées dans l'environnement de livraison

- `tool/audit_no_embedded_business_data.py` : PASS.
- Inventaire manifeste : 47 écrans.
- Recherche `TODO/FIXME/placeholder` dans `lib/` et `test/` : aucun marqueur trouvé.

## Limite de preuve

Le SDK Flutter/Dart n'est pas installé dans l'environnement de génération de ce paquet. Par conséquent, **aucun PASS de compilation, d'analyse Flutter, de test widget ou de build Android/iOS n'est déclaré**.

Avant intégration au dépôt principal, exécuter sur une machine disposant de Flutter stable 3.47.x :

```bash
cd apps/mobile
flutter create . --platforms=android,ios --org com.kombe --project-name kombe_mobile
flutter pub get
flutter gen-l10n
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
python3 tool/audit_no_embedded_business_data.py
```

Tout défaut révélé par ces commandes doit être corrigé avant de déclarer le lot mobile `PASS`.
