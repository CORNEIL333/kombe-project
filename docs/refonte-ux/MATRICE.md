# Matrice de couverture — refonte UX

Légende : ✅ fait · 🟨 partiel · ⬜ non traité · ⛔ bloqué (raison en Limite).
Vérif : **T** test automatisé · **E** parcours de bout en bout (app réelle + dépôts de test) · **N** navigateur réel (Playwright, PWA servie localement, données de test) · **A** analyse statique · **R** relecture du contrat serveur · **C** capture avant/après.

## Constats préliminaires (revalidés sur be318cc)

| # | Constat | Revalidation | Changement | État | Vérif |
|---|---|---|---|---|---|
| D1 | Note « optionnelle » envoyée comme référence | confirmé | champ **Référence** distinct (charset serveur) ; sinon **motif** obligatoire hors espèces (règle `REFERENCE_JUSTIFICATION_REQUIRED`) | ✅ | T, R |
| D2 | Justificatif « Joint » jamais transmis | confirmé (aucune route d'envoi) | étape retirée ; consigne « gardez la capture » | ✅ | A, C |
| D3 | Excédent non déclaré mais succès | confirmé | montant plafonné au reste dû, refus au champ avant envoi | ✅ | T |
| D4 | Répartition multi-caisses → partiels | confirmé | plan figé + issue par ligne ; « x sur y enregistrées » ; reprise | ✅ | T |
| D5 | Bouton final non verrouillé | confirmé | verrou + indicateur ; panneau non fermable pendant l'envoi | ✅ | T (double appui) |
| D6 | Clé d'idempotence neuve à chaque appel | confirmé | clé SHA-256 dérivée de l'intention (brouillon+ligne+corps) ; le serveur rejoue | ✅ | T (coupure + reprise = 2 écritures, pas 3) |
| D7 | Brouillons partiels | confirmé | enregistrement à chaque saisie (400 ms) et à la fermeture ; base locale v2 migrée | ✅ | T |
| I1 | Téléphone d'invitation inutilisé | confirmé | le numéro ouvre WhatsApp sur la bonne conversation | ✅ | A |
| I2 | Code/lien non restitué | confirmé | panneau : code, validité, copier, WhatsApp | ✅ | E (capture 14) |
| I3 | Choix de création ignorés | déjà corrigé avant la refonte | — | ✅ | A |
| V1 | « Demander des informations » refusé | confirmé | retiré | ✅ | A |
| V2 | Litiges mobiles bloqués mais accessibles | confirmé | retirés ; transition explicite vers KÓMBE Web (Discipline) | ✅ | A |
| V3 | Confirmer / Valider confondus | confirmé | « À confirmer » (trésorerie) / « À contrôler » (commissaire), libellés d'action distincts ; motif de rejet exigé (plus de motif inventé) | ✅ | T |
| N1 | `groupId`/`target` perdus (Flutter) | confirmé | modèle enrichi + `topic`/`subjectId` exposés par l'API | ✅ | T |
| N2 | Toucher = lu sans ouvrir | confirmé | lu + destination contrôlée (mobile et PWA) | ✅ | T, N |
| N3 | Activité récente non actionnable | confirmé | lignes actionnables (accueil, Activité) | ✅ | E, N |
| N4 | Badge = non-lues parmi 5 | confirmé | `?unread=1` compté par le serveur | ✅ | E |
| N5 | Libellés génériques | confirmé | catalogue de 28 natures, FR/EN, partagé | ✅ | T |
| N6 | Préférences factices | confirmé (« gate G1 ») | écran honnête : interne actif ; push/SMS/WhatsApp non disponibles | ✅ | A |
| H1 | Premier groupe = principal | confirmé | groupe actif choisi, mémorisé, effacé à la déconnexion | ✅ | E, N |
| H2 | Cycle à zéro | confirmé (`cycleIndex: 0`) | accueil sans donnée inventée | ✅ | T |
| H3 | Mois vs échéances | confirmé | un seul périmètre : reste dû des échéances ouvertes | ✅ | T |
| H4 | Fiche groupe répète les accès | confirmé | une entrée par tâche | ✅ | C |
| H5 | Raccourcis non adaptés au rôle | confirmé (membre voyait Inviter/Paramètres) | outils du bureau selon la fonction | ✅ | E |
| H6 | PWA : trop de destinations | confirmé | barre haute + menu + 3 onglets (+ Bureau) | ✅ | N, C |
| M1 | Erreurs techniques brutes | confirmé | `ApiFailure`/`ClientFailure` → phrases ; plus de code brut | ✅ | T |
| M2 | Textes internes | confirmé (~25) | réécrits | ✅ | A (recherche) |
| M3 | Captures sur données factices | confirmé | les captures restent des captures ; contrats prouvés par tests d'adaptateurs | 🟨 | — |

## Écrans — mobile Flutter

| Écran / parcours | Rôle | Changement | État | Vérif | Limite |
|---|---|---|---|---|---|
| Connexion, code, récupération | tous | 0.7.1 : coffre en panne, code collé, canaux ; mise à jour proposée avant connexion | ✅ | T | appareil NOT_TESTED |
| Navigation (barre, menu, onglets) | tous | nouvelle coquille ; « Plus » et « Groupes » supprimés | ✅ | E, C | |
| Accueil | tous / bureau | groupe actif, situation, À faire, séance, activité | ✅ | T, E, C | |
| Mes tontines | tous | liste unique (actives + en attente) ; « Découvrir » (annuaire inexistant) retiré | ✅ | T | |
| Fiche groupe | tous / bureau | une entrée par tâche, rôle | ✅ | C | |
| Bureau | bureau | outils par tâche | ✅ | E, C | |
| Inviter | bureau | panneau, code rendu | ✅ | C | partage natif : WhatsApp + copier |
| Déclarer | membre | écran unique + panneau de vérification | ✅ | T, C | |
| Mes cotisations | membre | brouillons / envois interrompus visibles | ✅ | C | |
| Validations | trésorerie / commissaire | file par étape, panneau de décision | ✅ | T, C | |
| Votes | membre | clos / déjà voté / non électeur ; verrou | ✅ | T | |
| Activité | tous | lignes actionnables, tout lire | ✅ | T, C | |
| Sécurité, notifications, contact | tous | réglages honnêtes | ✅ | A | |
| Cycle, membres, caisses, statuts, documents, aide, profil, hors ligne | tous | textes nettoyés ; structure conservée | 🟨 | C | refonte visuelle fine non faite |
| Créer une tontine, rejoindre | fondateur / invité | textes ; parcours existants conservés | 🟨 | A | |
| Séances, amendes, secours | tous | pas d'API mobile : transition explicite vers KÓMBE Web | ✅ | A | |

## Écrans — PWA

| Écran / parcours | Rôle | Changement | État | Vérif | Limite |
|---|---|---|---|---|---|
| Connexion | tous | inchangée (maquette au pixel) | ✅ | N | |
| Coquille (barre, menu, onglets) | tous | nouvelle | ✅ | N, C | |
| Accueil | tous / bureau | même contrat que le mobile | ✅ | N, C | |
| Activité | tous | onglet exact, lu à l'ouverture | ✅ | T, N | |
| Choix du groupe | tous | demi-fenêtre, Échap, focus rendu | ✅ | N | |
| Groupe (10 onglets), Argent, Tours, Séances, Décisions, Discipline, Membres, Statuts, Historique, Caisses | tous / bureau | inchangés (fonctionnels) ; atteints par liens directs | 🟨 | N (lien) | refonte visuelle non faite |
| Profil, Mes cotisations, Validations, Documents, Aide, Créer, Rejoindre | tous | titres simples (bandeaux retirés de Créer/Rejoindre) | 🟨 | C | |
