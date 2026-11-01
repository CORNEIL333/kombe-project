# Matrice de couverture — refonte UX

Légende état : ⬜ à faire · 🟨 en cours · ✅ fait · ⛔ bloqué (raison en colonne Limite).
Vérif : T = test automatisé, N = navigateur (PWA réelle servie localement), A = analyse statique, R = relecture du contrat serveur.

## Constats préliminaires (revalidés sur be318cc)

| # | Constat | Revalidation | Changement | État | Vérif |
|---|---|---|---|---|---|
| D1 | Note « optionnelle » envoyée comme référence de transaction | **confirmé** (`submitDraft`, `contribution_start_screen`) | champ Référence distinct (requis Mobile Money/virement) + commentaire séparé | ⬜ | |
| D2 | Justificatif « Joint » jamais transmis | **confirmé** (aucune route d'upload) | plus de « Joint » ; consigne honnête | ⬜ | |
| D3 | Excédent non déclaré mais succès | **confirmé** (`left > 0` → succès) | plafond = reste dû, refus avant envoi | ⬜ | |
| D4 | Répartition multi-caisses → résultats partiels | **confirmé** | clés stables + écran « x/y enregistrées, reprendre » | ⬜ | |
| D5 | Bouton final non verrouillé | à vérifier écran revue | verrou + indicateur | ⬜ | |
| D6 | `postOnce` = clé neuve à chaque appel | **confirmé** | clé dérivée de l'intention | ⬜ | |
| D7 | Brouillons sauvegardés partiellement | à vérifier | sauvegarde à chaque modification | ⬜ | |
| I1 | Téléphone d'invitation inutilisé | **confirmé** | le numéro sert au partage WhatsApp du lien | ⬜ | |
| I2 | Code/lien créé non restitué | **confirmé** (retour `void`) | panneau avec code, lien, copier, partager | ⬜ | |
| I3 | Choix de création ignorés (modèle, rotation, parent) | **déjà corrigé** (écran actuel n'a plus ces choix) | — | ✅ | A |
| V1 | « Demander plus d'informations » refusé par l'adaptateur | **confirmé** | retiré | ⬜ | |
| V2 | Litiges mobiles accessibles mais bloqués | **confirmé** (`TontineDisputeRepository` const, entrées Plus + action rapide) | retirés ; lien explicite vers Discipline (PWA) | ⬜ | |
| V3 | Confirmer / Valider peu distingués | à revoir sur l'écran | libellés selon la fonction (trésorerie = confirmer, commissaire = contrôler) | ⬜ | |
| N1 | `groupId`/`target` perdus côté Flutter | **confirmé** | modèle enrichi | ⬜ | |
| N2 | Toucher = lu sans ouvrir | **confirmé** | ouverture de la destination | ⬜ | |
| N3 | Activités récentes non actionnables | **confirmé** | idem N2 | ⬜ | |
| N4 | Badge = non-lues parmi 5 | **confirmé** (`recentActivity`) | compteur `unreadOnly` serveur | ⬜ | |
| N5 | Libellés génériques inadaptés | **confirmé** (`general`) | `topic` serveur → libellé exact | ⬜ | |
| N6 | Préférences de notification factices | à vérifier | n'afficher que les réglages réels | ⬜ | |
| H1 | Premier groupe = groupe principal | à vérifier | groupe actif choisi et mémorisé | ⬜ | |
| H2 | Données de cycle à zéro | à vérifier | données réelles ou absence explicite | ⬜ | |
| H3 | Montant mensuel vs progression : périmètres différents | à vérifier | même périmètre, libellé exact | ⬜ | |
| H4 | Fiche groupe répète les accès | à vérifier | une entrée par tâche | ⬜ | |
| H5 | Raccourcis non adaptés au rôle | à vérifier | filtrés par fonction | ⬜ | |
| H6 | PWA : trop de destinations au même niveau | **confirmé** (en-tête + nav basse + profil) | hiérarchie barre/menu/nav | ⬜ | |
| M1 | Erreurs techniques brutes affichées | **confirmé** (`ApiFailure(...)`, `ClientFailure(...)`) | messages : ce qui s'est passé / sens / quoi faire | ⬜ | |
| M2 | Textes internes de développement | à inventorier | supprimés | ⬜ | |
| M3 | Goldens = données factices | **confirmé** | noté comme limite ; tests d'adaptateurs sur contrat | ⬜ | |

## Écrans — mobile Flutter (51 routes)

| Écran / parcours | Rôle | Problème | Changement prévu | État | Vérif | Limite |
|---|---|---|---|---|---|---|
| Accueil `/`, connexion, code, récupération | tous | corrigé en 0.7.1 (coffre, code collé, canaux) | harmoniser avec la barre/système | 🟨 | T | appareil NOT_TESTED |
| Session expirée | tous | purge 401 OK | message explicite au retour connexion | ⬜ | | |
| Tableau de bord `/app` | membre/bureau | H1–H5, N4 | cartes contextuelles stables | ⬜ | | |
| Groupes `/app/groups`, mine, discover | membre | « découvrir » vide (pas d'annuaire) | retirer discover ; changer de groupe par panneau | ⬜ | | |
| Rejoindre `/app/groups/join` | invité | — | panneau, aperçu du groupe avant adhésion | ⬜ | | |
| Créer `/app/groups/create` | fondateur | — | parcours plein écran conservé, brouillon | ⬜ | | |
| Fiche groupe `/app/groups/:id` | tous | H4 | sections par tâche | ⬜ | | |
| Membres, détail membre | tous/bureau | — | liste + panneau détail | ⬜ | | |
| Cycle, bénéficiaires | tous/bureau | — | une vue « Tours » | ⬜ | | |
| Bureau | bureau | — | outils par fonction | ⬜ | | |
| Caisses | tous/bureau | — | — | ⬜ | | |
| Règles, réglages groupe | tous/bureau | — | — | ⬜ | | |
| Inviter | bureau | I1, I2 | panneau | ⬜ | | |
| Déclarer (start, evidence, review) | membre | D1–D7 | 2 étapes : montant/canal/référence → récap | ⬜ | | |
| Historique, détail cotisation | membre | — | — | ⬜ | | |
| Validations, détail | trésorerie/commissaire | V1, V3 | — | ⬜ | | |
| Votes, détail | membre | vérifier objet déjà traité | — | ⬜ | | |
| Litiges (3 routes) | — | V2 | retirés | ⬜ | | |
| Notifications | tous | N1–N5 | — | ⬜ | | |
| Profil, édition | tous | — | — | ⬜ | | |
| Sécurité, langue, notifications, confidentialité | tous | N6 | — | ⬜ | | |
| Documents, exports | tous | exports sans backend ? | vérifier | ⬜ | | |
| Aide, support, hors ligne, à propos | tous | — | — | ⬜ | | |
| Plus `/app/more` | tous | placard | remplacé par menu latéral | ⬜ | | |

## Écrans — PWA React

| Écran / parcours | Rôle | Problème | Changement prévu | État | Vérif | Limite |
|---|---|---|---|---|---|---|
| Connexion | tous | conforme maquette (à préserver) | — | ✅ | N | |
| Accueil | tous | H6 | cartes contextuelles | ⬜ | | |
| Notifications | tous | ouvre le groupe, pas l'onglet | destination exacte | ⬜ | | |
| Groupe (onglets) | tous | — | — | ⬜ | | |
| Argent / déclarer / confirmer / contrôler | tous/trésorerie | vérifier idempotence de la file hors ligne | — | ⬜ | | |
| Tours, Séances, Décisions, Discipline, Membres, Statuts, Historique, Caisses | tous/bureau | — | — | ⬜ | | |
| Profil, Mes cotisations, Validations, Documents, Aide | tous | — | — | ⬜ | | |
| Création, Rejoindre | fondateur/invité | — | — | ⬜ | | |
