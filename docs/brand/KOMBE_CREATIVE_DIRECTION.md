# KÓMBE — Direction créative (v1, 8 octobre 2026)

Pages de référence :
- Directions et notation : https://claude.ai/artifact/TCwesWU7N7Bh8qy4BnKipC
- Prototypes héros (L'Orbite) : https://claude.ai/artifact/7C4G9MgeTovfkenV8kDBa3
- Sources HTML : `kombe-design/prototypes/`

## Idée fondatrice : le Ó

Dans KÓMBE, le O est un cercle et l'accent aigu désigne un point de ce cercle. Une tontine fait la même chose : un groupe en cercle, un tour qui désigne une personne.
Le marqueur « l'Accent » (petit trait or, tangent à l'orbite) signale partout « c'est à cette personne » : bénéficiaire du tour, membre qui doit agir, événement sélectionné.

## Grammaire (chaque forme = une donnée réelle)

| Forme | Sens |
|---|---|
| Cercle / orbite | le groupe |
| Nœud | un membre (initiales) |
| Arc depuis le nœud 1 | progression du cycle (tour courant / nombre de tours) |
| Accent | bénéficiaire du tour, ou membre qui doit agir |
| Nœud plein forêt | cotisation confirmée |
| Nœud avec arc or ouvert | cotisation en attente de validation |
| Nœud contour sable | pas encore déclarée |
| Nœud or | bénéficiaire du tour |
| Anneau à 3 segments | triple validation membre → trésorier → commissaire |
| Anneau fermé + coche | confirmé par le serveur |
| Chemin rompu (rouge) | contesté |
| Pointillé | hors connexion / brouillon local |
| Segment pointillé en mouvement | en attente / synchronisation |
| Convergence de nœuds | décision collective |

Règle : aucun cercle décoratif. Un cercle n'apparaît que s'il représente un vrai groupe, cycle ou statut.

## Trois directions et notation

| Critère | 01 Quiet Authority | 02 Living Circle | 03 African Editorial |
|---|---:|---:|---:|
| Distinction | 6 | 9 | 9 |
| Confiance | 9 | 8 | 6 |
| Utilisabilité | 9 | 8 | 6 |
| Mobile | 8 | 9 | 6 |
| Pertinence africaine | 5 | 8 | 9 |
| Évolutivité | 8 | 9 | 6 |
| Accessibilité | 9 | 8 | 7 |
| Performance | 10 | 8 | 7 |
| Impact marketing | 6 | 9 | 9 |
| Longévité | 9 | 8 | 6 |
| **Total** | **79** | **84** | **71** |

- 01 Quiet Authority, « le registre » : Newsreader Light, forêt profonde, filets, aucune carte, mouvement quasi nul. Très fiable, peu mémorable, l'Afrique n'apparaît que par les mots.
- 02 Living Circle, « l'orbite » : grand cercle vivant, convergence, Manrope 300/800 + un mot en Newsreader italique, photographie masquée dans des arcs. Marque, données et interaction partagent une grammaire.
- 03 Contemporary African Editorial, « le journal du quartier » : Archivo en largeur variable, capitales étendues, aplats, photographie pleine hauteur. Très mémorable, trop bruyant pour le produit financier, dépend d'une photographie qui n'existe pas encore.

## Décision : L'Orbite (02), avec une seule hybridation

Dans la couche C (cotisations, validations, gouvernance), l'interface reprend la discipline de Quiet Authority : orbite petite et informative, pas de lumière décorative, un seul bouton plein par écran, pas de serif.

| Couche | Intensité |
|---|---|
| A — marque et site | Orbite plein écran, convergence 1 à 2 s au chargement, lumière radiale chaude, Newsreader italique pour le mot qui « résout » |
| B — onboarding | Les mêmes nœuds racontent : personnes → cercle → arc. 480 ms par transition, « Passer » toujours visible |
| C — produit | Orbite en 220–360 ms puis immobile ; statut lu dans la forme + couleur + texte |

## Typographie

- Manrope (200–800, `tnum` pour les montants) : tout le produit.
- Newsreader italique (OFL, opsz 6–72) : un mot ou une ligne par écran marketing/onboarding. Jamais pour montants, boutons, formulaires.
- Fraunces abandonnée (serif douce trop répandue, axe « wonk » contraire à la précision).

## Couleur

Gammes 50–950 dans `KOMBE_COLOR_SCALES.json`, ancrées sur forêt 900 #103C32, forêt 950 #082C26, forêt 700 #176B52, forêt 500 #2A8A68, or 500 #C7922E, sable 50 #FBF8F1, sable 100 #F3ECDD, encre 950 #13211C, encre 600 #66746E.
- Texte or : or 700 #8A5F14 (5,3:1 sur sable). Or 500 réservé aux nœuds bénéficiaire, à l'Accent, aux formes.
- Forêt 500 : jamais de texte blanc dessus (4,26:1) ; graphisme seulement.
- Or 300 #E2B868 sur forêt 900 : 5,8:1, utilisable en texte sur fond sombre.

## Mouvement (tokens proposés)

| Token | Durée | Usage |
|---|---:|---|
| press | 100 ms | appui |
| fast | 150 ms | survol, puces |
| ui | 220 ms | changement d'état, orbite produit |
| spatial | 320 ms | feuilles, rotation de l'orbite |
| brand | 480 ms | onboarding |
| closure | 560 ms max | fermeture de l'anneau de validation |

Courbes : standard `cubic-bezier(.2,0,0,1)`, entrée `cubic-bezier(0,.4,0,1)`, sortie `cubic-bezier(.4,0,1,1)`.
Mouvement réduit : positions finales directes, fondus ≤ 120 ms, aucune rotation.

## Copie (règles appliquées dans les prototypes)

- « Remise prévue », jamais « reçoit », « solde », « épargne », « retrait », « débité ».
- Succès seulement après confirmation serveur : « Déclaration envoyée. Elle reste en attente de validation. »
- Hors connexion : « Brouillon enregistré sur cet appareil. Il n'a pas encore été envoyé au groupe. »
- Avant une action critique : ce qui va se passer, qui le verra, si c'est modifiable, qui doit valider.

## v2 (13 octobre 2026) : plus audacieuse

Retour du porteur sur la v1 : « trop sobre, pas assez moderne, manque d'image et de layout ».
La v2 garde la grammaire et pousse la mise en page :
- coquille sombre (forêt de nuit #061F1B), cartes fonctionnelles claires (sable) ;
- grands titres Manrope 800 dont un mot « résout » en Newsreader italique or clair ;
- photographie de communauté masquée dans l'orbite ; les nœuds peuvent devenir des visages ;
- icônes SVG linéaires au lieu des emojis ; bandeau zigzag et logotype « K + 3 orbes » retirés de la PWA et des tableaux de bord.

Les photos actuelles sont provisoires. Un shooting réel (Douala, Yaoundé) est recommandé avant le lancement public.

## État de l'implémentation

Voir `docs/design-system/tokens.md` pour les tokens et les composants livrés (PWA, tableaux de bord, palette Flutter).

## v3 — mise en œuvre immersive (oct. 2026)

La direction « L'Orbite » est désormais appliquée de façon identique sur les
quatre surfaces :

| Surface | Ce qui est livré |
| --- | --- |
| Site de présentation (`/site/`) | Héros orbite avec photos de membres, scène « chaos → registre » au défilement, cycle interactif, écrans d'exemple étiquetés « données d'exemple ». |
| PWA (`/`) | Bandeaux photographiques par écran, couvertures de groupes (photo stable par groupe + monogramme), orbite réelle du cycle sur la page du groupe, entrées en cascade, en-tête mobile à icônes. |
| Tableaux de bord (`/bureau/`, `/ops/`, `/direction/`, `/engineering/`) | Connexion en scène photographique propre à chaque espace, en-têtes de page « scène » (forêt + photo en fondu + orbite), barre latérale à nœuds, cascade des panneaux. |
| App mobile (APK) | Logotype Orbite (remplace l'ancien emblème), Manrope imposée dans tout le thème (Android retombait sur Roboto), Newsreader pour la phrase expressive, accueil plein écran photographique, frise d'orbite, transitions d'écran. |

Règles constantes : une seule phrase Newsreader italique par titre ; les
photos sont des illustrations d'ambiance décoratives (jamais un membre réel,
jamais une donnée) ; toute animation est coupée sous `prefers-reduced-motion`
(web) ou quand le système réduit les animations (mobile) ; aucune animation en
boucle sur mobile. Fraunces est retirée : **Newsreader** (OFL) est la police
expressive livrée partout.
