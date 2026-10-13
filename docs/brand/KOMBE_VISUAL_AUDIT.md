# KÓMBE — Audit visuel (v1, 8 octobre 2026)

Périmètre : les 10 images et la recherche approfondie fournies dans le projet.
Audit du code (étape 1 du mandat), 13 octobre 2026 : recherche dans `apps/` et `packages/` des formulations ci-dessous (« débité », « solde/épargne/retrait » côté interface, « chiffrement de bout en bout », +221, « moderne et sécurisée », « Ma tontine, simplement. »). Seule la signature obsolète subsistait, dans l'app Flutter (`app_fr.arb`, `app_en.arb`, `kombe_logo.dart`) : alignée sur « Votre tontine, plus claire. » / « Your tontine, made clear. ». Les autres occurrences sont des commentaires de code ou du vocabulaire interne, pas de la copie affichée.

## Ce qu'on garde

| Élément | Pourquoi |
|---|---|
| Le territoire « cercle de confiance » | Il décrit la structure réelle d'une tontine (groupe, tour, rotation). Aucun concurrent du benchmark ne l'occupe. |
| Le symbole anneau + 4 nœuds (planche logo, charte 01/08) | Il est lisible à 12 mm, fonctionne en monochrome, et contient déjà la grammaire nœud / arc / anneau. |
| La signature « Votre tontine, plus claire. » | Elle promet de la clarté, pas une garde d'argent. Conforme au principe « don't hold the money, hold the truth ». |
| La palette forêt / or / sable de la recherche (#103C32, #176B52, #2A8A68, #C7922E, #FBF8F1, #F3ECDD, #13211C) | Contrastes vérifiés : forêt 900 sur blanc 12,25:1, encre 16,64:1. |
| Les règles d'usage de la charte 02/08 | « L'or n'est pas un texte sur blanc », « couleur + icône + libellé ». |
| Les durées de mouvement de la charte 03/08 | 100 / 150 / 220 / 300 / 420 / 560 ms, réduites à 0–120 ms en mode réduit. |
| L'écran « Vote / Validation » | Trois choix explicites (valider, rejeter, demander des informations) : bonne base. |

## Ce qu'il faut corriger

| Problème | Où | Gravité | Correction |
|---|---|---|---|
| Deux logos concurrents : « trois personnages » et « anneau + nœuds » | Maquettes du 27 sept. vs planche logo | Critique | Un seul symbole : l'anneau. Le pictogramme « trois personnages » est retiré. |
| Deux signatures : « Ma tontine, simplement. » et « Votre tontine, plus claire. » | Maquettes vs charte | Haute | Garder « Votre tontine, plus claire. » |
| Trois palettes différentes : #093D33/#D4A544/#F3E9D7/#0B0B0B (charte 01), #103C32/#C7922E (charte 02), #1A7A48/#D4A843 (ancien système NK) | Charte 01 vs 02, code existant | Haute | Une seule source de vérité : les gammes 50–950 de `KOMBE_COLOR_SCALES.json`. |
| « Ce montant sera débité à chaque cycle » | Charte 04/08, champ d'aide | Critique | KÓMBE ne débite rien. « Montant attendu de chaque membre à chaque tour. » |
| « Solde déclaré », « Épargne totale 2 850 000 FCFA », « Retrait −600 000 FCFA », « Évolution de l'épargne » | Tableau de bord mobile et dashboard | Critique | Vocabulaire de portefeuille : laisse croire que KÓMBE garde l'argent. Remplacer par « cotisations confirmées », « remise prévue », « tour ». |
| « Chiffrement de bout en bout » | Écran de connexion | Critique | Affirmation probablement fausse pour Firestore. Ne promettre que ce que le code fait. |
| « La solution de tontine moderne et sécurisée » | Accueil | Moyenne | Formule générique. |
| Indicatif +221 et drapeau du Sénégal | Charte 04/08, champ téléphone | Moyenne | Marché principal : Cameroun, +237. |
| Pile de pièces comme icône « contribution » | Charte 03/08, détail du groupe | Moyenne | La recherche exclut les pièces (vocabulaire wallet/crypto). Nouveau pictogramme : arc qui rejoint un nœud. |
| Texte doré « CHARTE VISUELLE » sur sable | Toutes les pages de charte | Moyenne | Contraste 2,6:1, viole la propre règle de la charte. Or 700 (#8A5F14, 5,3:1) pour du texte. |
| Puces de statut = point de couleur + texte | Charte 04/08 | Moyenne | Statut porté par la forme : arc ouvert, anneau fermé, chemin interrompu. |
| Rendu « logo lumineux » sur noir | Image 916a4e69 | Moyenne | Halo néon proche de l'esthétique crypto ; mot-symbole illisible. À ne pas utiliser. |
| Le mot-symbole n'est pas en Manrope | Planche logo | Basse | À redessiner à partir d'une grotesque géométrique, avec le Ó comme élément signature (voir direction). |

## Ce qu'on abandonne

- Bande de motifs en zigzag type pagne en bas d'écran : c'est exactement le « motif traditionnel en papier peint » que le mandat exclut.
- Bannières silhouettes de groupe au coucher de soleil, montagnes, femme en foulard en plan héros : clichés de banque d'images.
- Accueil type « Bonjour Amina 👋 » + 4 boutons ronds + 2 cartes KPI + bouton + central doré : schéma de fintech générique.
- Dashboard desktop « sidebar + 4 cartes KPI + histogramme + donut » : le schéma que la section 32 du mandat rejette.
- Mise en page « téléphone à droite, titre à gauche, forme floue derrière » (charte 05/08, page web).

## Écarts entre la recherche et les maquettes

La recherche recommande « groupe → cycle → obligation → tour » plutôt que « portefeuille → transactions ». Les maquettes font l'inverse : solde, épargne, retraits, montant en héros. Le futur accueil répond aux cinq questions de la recherche (quel groupe, où en est le cycle, qu'attend-on de moi, que s'est-il passé, quelle action) et rien d'autre.

## Typographie : vérification de Manrope + Fraunces

- Manrope : à garder pour l'interface. Accents français complets, chiffres tabulaires (`tnum`), 200–800, rendu mobile solide, licence OFL.
- Fraunces : à remplacer. C'est la serif « douce » la plus utilisée par les startups depuis 2023, et son axe « wonk » contredit l'idée de précision. Proposition : **Newsreader** (Production Type, OFL), axe de taille optique 6–72, italique très lisible, accents français soignés. Utilisée seulement pour un mot ou une ligne, jamais pour les montants, boutons ou formulaires.
