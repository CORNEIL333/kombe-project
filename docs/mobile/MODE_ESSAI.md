# KÓMBE mobile — Mode essai (30 jours)

Version de l'app destinée aux **tests UI/UX et responsive** : tous les écrans sont remplis avec des données **fictives** et toutes les actions répondent, sans serveur ni compte réel.

## Ce que fait le mode essai
| | |
|---|---|
| Durée | 30 jours à partir du **premier lancement** sur l'appareil. Ensuite, un écran « Votre période d'essai est terminée » remplace l'app. |
| Bandeau | Permanent en haut de l'écran : « MODE ESSAI · données fictives · J-n ». Impossible de confondre avec de vraies données. |
| Connexion | N'importe quelle adresse et n'importe quel code sont acceptés (aucun email n'est envoyé). |
| Données | 3 groupes fictifs (dont « Les Étoiles de Yaoundé », 12 membres, tour 4/12), historique, 2 validations en attente, 2 votes, 1 litige, notifications, documents. |
| Actions | Elles ont un effet visible : une cotisation déclarée apparaît « en attente » dans l'historique, une validation disparaît de la liste, un vote est enregistré, un litige ouvert s'ajoute. Tout est en mémoire : **un redémarrage de l'app remet les données à zéro** (pas le compteur des 30 jours). |
| Latence | Chaque réponse prend ~0,4 s pour voir les états de chargement réels. |

## Construire l'APK
```bash
flutter build apk --release -t lib/main_trial.dart --build-name=0.2.0-essai --build-number=2
```
Sortie : `build/app/outputs/flutter-apk/app-release.apk` (signée avec la clé de debug : installation directe sur téléphone, **pas** pour le Play Store).

L'app de production se construit toujours sans `-t` (`lib/main.dart`) et ne contient **aucune** donnée d'essai.

## Garanties d'isolement
- Le code d'essai vit uniquement dans `lib/trial/` et n'est atteint que par `lib/main_trial.dart`.
- `test/data/no_embedded_business_data_test.dart` échoue si un fichier de production importe `lib/trial/` (test ajouté avec le mode essai).
- La seule modification de l'app de production est un paramètre optionnel `KombeApp.builder` (habillage), non utilisé par `main.dart`.

## Limites connues
- Le compteur de 30 jours est stocké sur l'appareil : **désinstaller puis réinstaller le remet à zéro**. C'est un outil de test, pas une protection commerciale.
- Même identifiant Android que la future app de production (`com.kombe.kombe_mobile`) : installer l'une remplace l'autre.

## Revue visuelle automatique
Le test « tour » lance l'app en mode essai et capture 21 écrans (390×844) avec les vraies polices :
```bash
KOMBE_TOUR=1 flutter test test/golden/app_tour_test.dart --update-goldens
```
Captures : `test/golden/tour/`.
