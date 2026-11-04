# Refonte UX KÓMBE — rapport de livraison

Branche `refonte/ux-integrale` · base `design/immersif-v3` · aucun déploiement en production, aucune fusion.

## Organisation retenue (mobile et PWA, même contrat)

- **Groupe actif** : choisi par la personne, mémorisé sur l'appareil, nommé dans la barre supérieure et changeable par une demi-fenêtre sans quitter l'écran. Jamais « le premier renvoyé ». Effacé à la déconnexion.
- **Barre supérieure** : menu · groupe actif · Activité (compteur réel).
- **Barre du bas, stable** : Accueil · Cotisations · Activité · (+ Bureau si la personne tient une fonction dans le groupe actif). Les repères ne bougent pas d'un rôle à l'autre ; seul l'onglet Bureau s'ajoute.
- **Menu latéral** (moins fréquent) : vos groupes (choisir, rejoindre, créer), votes, documents, aide, profil et réglages ; sur la PWA aussi la langue et la déconnexion. Colonne permanente sur grand écran.
- **Accueil** : emplacements fixes et règles explicables. (1) Situation : reste dû réel, échéance ou retard, montant déclaré en attente, action « Déclarer un versement » — ou « à jour ». (2) À faire : envoi à reprendre, confirmations/contrôles permis par MA fonction (le serveur exclut mes propres déclarations), votes ouverts où je n'ai pas voté. (3) Prochaine séance. (4) Activité du groupe, chaque ligne menant à l'action.
- **Panneaux** pour les tâches courtes (vérifier une déclaration, décider une validation, inviter, choisir un groupe, ouvrir KÓMBE Web) ; **plein écran** pour la saisie (déclarer) et les parcours longs.
- **Notifications** : 28 natures nommées précisément (FR/EN), destination contrôlée (bon groupe, bon onglet ou bon objet), marquées lues à l'ouverture, jamais une décision automatique. Le serveur expose `topic`/`subjectId` (ajout compatible, sans migration).
- **Résultats honnêtes** : succès seulement à réception de la réponse ; partiel affiché tel quel ; réponse perdue = « résultat inconnu » avec reprise sans doublon (clé d'idempotence dérivée de l'intention).

## Rapport PASS / FAIL / NOT_TESTED

| Exigence | Résultat | Preuve |
|---|---|---|
| Analyse statique mobile (`flutter analyze`) | PASS | 0 erreur, 0 avertissement |
| Tests mobile | PASS | 43 tests (`flutter test`), dont déclaration, accueil, coque, adaptateurs |
| Typage + tests workspace (domaine, API, PWA, tableaux de bord) | PASS | domaine 439, API 248, PWA 28, dashboards 44 |
| Garde de vocabulaire (mots interdits) | PASS | `copieProduit.test.ts` (a détecté « retrait », corrigé) |
| Première connexion (mobile) | PASS (tests) / NOT_TESTED (appareil) | tests 0.7.1 ; aucun émulateur ni téléchargement autorisé |
| Adhésion par invitation | PASS (adaptateur) | `joinGroup` testé ; invitation rendue (capture 14) |
| Création conforme aux choix | PASS (revalidé) | constat I3 déjà corrigé |
| Déclaration et référence | PASS | test « référence distincte », « motif → justification » |
| Justificatif | PASS | étape mensongère retirée (aucune route d'envoi) |
| Double appui | PASS | test widget : 1 seul envoi, bouton verrouillé |
| Montant excessif | PASS | refus au champ, plan refusé (`AmountExceedsDue`) |
| Interruption après écriture partielle | PASS | test : 1/2 enregistrée, reprise → 2 écritures au total |
| Réponse serveur perdue | PASS | test : même clé renvoyée, « Réponse non reçue » |
| Reprise de brouillon | PASS | plan figé enregistré avant envoi ; « Envoi à reprendre » à l'accueil |
| Notification avec session expirée | PASS (logique) | 401 → purge → connexion ; la destination se rouvre depuis Activité |
| Changement de groupe | PASS | test de bout en bout mobile ; Playwright PWA |
| Confirmation / contrôle selon le rôle | PASS | test adaptateur (`can.confirm`), libellés par étape |
| Refus d'accès | PASS (partiel) | 403/404 → phrases ; onglet Bureau absent sans fonction |
| Vote et objet déjà traité | PASS | test « vote clos » : issue + décompte, pas de bulletin |
| Saisie continue, copier-coller | PASS (partiel) | code collé avec espaces (0.7.1) ; saisie du montant testée |
| Fermeture / réouverture des panneaux | PASS | Playwright : Échap, voile, focus rendu au déclencheur |
| Retour système / navigateur | PASS (PWA) | Playwright : notification → onglet → retour = Activité |
| Petit écran | PASS | 390 px sans défilement horizontal (PWA) ; captures mobiles 390 dp |
| Grand texte | NOT_TESTED | pas de recette à 200 % faite |
| Clavier PWA | PASS (coque) | menu, choix du groupe, Échap, focus visible |
| TalkBack / VoiceOver | NOT_TESTED | pas d'appareil ; libellés sémantiques posés et testés en partie |
| Contrastes WCAG 2.2 | NOT_TESTED (mesure) | palette de la charte conservée ; pas de mesure outillée |
| Push système | NOT_TESTED / non implémenté | aucune infrastructure push dans le projet ; annoncé comme indisponible |
| iOS | NOT_TESTED | pas de Mac ; aucune affirmation |
| Intégration API réelle | NOT_TESTED | pas de base de test isolée ; rien écrit en production |

## Migrations et compatibilité

- **API** : `NotificationView.topic` et `subjectId` ajoutés (lus dans `dedup_key`, déjà stockée). Aucune migration SQL. Les clients antérieurs ignorent ces champs ; les nouveaux clients se replient sur la catégorie si le serveur est plus ancien.
- **Base locale mobile (brouillons)** : SQLite v1 → v2 (`ALTER TABLE ADD COLUMN reference, plan_json`). Les anciens brouillons gardent leur note comme motif. Retour arrière vers une version antérieure de l'app : non vérifié — désinstaller/réinstaller efface les brouillons locaux.
- **Préférence locale** `kombe.groupe_actif` (mobile et PWA) : nouvelle, sans effet si absente.

## Ce qui reste (limites explicites)

- Refonte visuelle fine des écrans secondaires (cycle, membres, caisses, statuts, profil, aide ; onglets du groupe sur la PWA) : fonctionnels et nettoyés, pas redessinés.
- Verrou biométrique : la préférence n'était jamais appliquée → retirée. Le réaliser demande une activité Android compatible (`FlutterFragmentActivity`) et un écran de verrouillage.
- Séances, amendes, secours : pas d'API mobile ; transition explicite vers KÓMBE Web.
- Notifications push : à concevoir (permission au bon moment, confidentialité sur écran verrouillé).

## Actions manuelles indispensables

1. Relire et fusionner la PR, puis déployer l'API (pour `topic`) avant ou avec la PWA.
2. Publier la version mobile (hausser la version, `node scripts/mobile/publier.mjs`) — non fait : cela mettrait à jour tous les téléphones.
3. Recette sur un vrai téléphone Android (connexion, déclaration, notifications).

## Captures

`captures/avant/` (version précédente : goldens mobiles et PWA en production, données de test) · `captures/apres/` (visite complète de l'app mobile `tour/*`, PWA locale). Mêmes données de test des deux côtés.
