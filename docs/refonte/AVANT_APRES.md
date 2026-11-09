# KÓMBE — Avant / après (refonte 0.8.0)

« Avant » : état de la branche au début de la mission design (inventaire du 2026-11-02, version 0.7.1). « Après » : version 0.8.0. Captures dans [captures/](captures/).

## Ce qui change à l'écran

| Famille | Avant | Après |
|---|---|---|
| Accueil | Bandeau, carte blanche, texte en phrases | Une surface forêt : montant très grand, « J'ai payé », perles du cycle, raccourcis en couleur |
| Cotisations | Liste brute, statut en texte | Totaux pleins (émeraude, soleil), paiements par mois, pastilles |
| Groupes | Cartes blanches identiques | Une carte à la couleur du groupe, photo, perles |
| Activité | Liste de cartes | Frise cousue, pictos colorés par sujet, filtres |
| Membres | Picto personne identique pour tous | Bureau puis membres, photos ou initiales colorées, recherche |
| Cycle | Pastilles T1, T2…, carte photo d'ambiance | Perles, carte soleil « Reçoit ce tour » |
| Votes | Boutons radio | Trois grandes cibles, participation, barres de résultat |
| Formulaires | Champs génériques, erreurs en message volant | Blocs, erreur sous le champ, retour au premier champ en erreur |
| Bureau PWA | Barre du bas sur ordinateur, contenu étroit | Colonne à quatre destinations, pleine largeur |

## Mesures (mobile, `lib/features` et coquille)

| Mesure | Avant | Après |
|---|---|---|
| Couleurs en dur `Color(0x` | 12 | 6 |
| Styles de texte en dur `TextStyle(` | 35 | 22 |
| Rangées brutes `ListTile(` | environ 35 | 30, stylées par le thème |
| Avatars génériques `CircleAvatar(` | 10 | 0 |
| Écrans à listes cousues | 0 | 11 |
| Écrans à montants Fraunces | 0 | 15 |
| Écrans contrôlés sans débordement (320 px, 360 px texte × 1,3, 820 px) | aucun contrôle | 32 × 3, test automatique |
| Tests mobile | 46 | 50 |
| Poids de l'APK arm64 | 22,0 Mo | 23,3 Mo |

PWA : six systèmes de couleurs superposés (trois ors différents) réunis dans `systeme.css`. Contrôle à 390, 820 et 1440 px sur 23 écrans : aucune erreur de page, aucun défilement horizontal. Écran de connexion : 0 pixel de différence.

## Critique honnête

Les quatre questions du brief, posées sur la version finale :

- **Pourrait-il appartenir à n'importe quelle fintech ?** Accueil, Groupes, Cycle, Activité : non, les perles et les cartes de couleur sont propres à une tontine. Réglages, Aide, Profil : encore génériques.
- **Plus d'un message principal ?** Accueil : non. L'accueil PWA garde deux rappels sous le héros (paiement à confirmer, photo).
- **Un paragraphe remplaçable ?** Retirés sur Caisses, Règles, Cotisations, Activité. Il en reste dans l'Aide et les formulaires PWA (création, discipline).
- **Une carte blanche de trop ?** Mobile : plus guère. PWA : les onglets du groupe restent en cartes blanches.

## Non mesuré

Contraste en plein soleil, vitesse sur téléphone d'entrée de gamme et lisibilité par de vrais utilisateurs : rien de tout cela n'a été testé sur un appareil. Les gains de « lisibilité » et de « facilité » ci-dessus sont des constats sur captures, pas des mesures d'usage.
