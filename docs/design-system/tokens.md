# KÓMBE — Tokens et composants (direction « L'Orbite » v2)

Source de vérité visuelle : `docs/brand/KOMBE_CREATIVE_DIRECTION.md`. Gammes complètes 50–950 : `docs/brand/KOMBE_COLOR_SCALES.json`.

## Où vivent les tokens

| Surface | Fichier |
|---|---|
| PWA (React) | `packages/client/src/styles.css` (bloc `:root`) |
| Tableaux de bord | `packages/dashboard-core/src/styles/tokens.css` (+ surcharge v2 en fin de `core.css`) |
| Flutter | `packages/mobile/lib/core/design/kombe_colors.dart`, `kombe_theme.dart` |

## Couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Nuit | #061F1B | fond de la coquille sombre, barre latérale |
| Forêt 950 / 900 | #082C26 / #103C32 | titres sur clair, bouton principal |
| Forêt 700 / 500 | #176B52 / #2A8A68 | arc de progression, validé ; 500 jamais sous du texte blanc |
| Or 500 | #C7922E | formes seulement : Accent, nœud courant, anneau en attente |
| Or 300 | #E2B868 | texte or sur fond sombre, onglet actif |
| Or 700 | #8A5F14 | texte or sur fond clair |
| Sable 50 / 100 / 200 | #FBF8F1 / #F3ECDD / #E7DCC6 | cartes, texte sur sombre, bordures |
| Encre 950 / 600 | #13211C / #56645E | texte principal / secondaire sur clair |
| Alerte | #B42318 sur #FDECE4 | erreur, contesté |

Contrastes vérifiés (WCAG 2.2, texte normal ≥ 4,5:1) :

| Paire | Ratio |
|---|---:|
| Sable 100 sur nuit | 14,6 |
| Sable 100 à 74 % sur forêt 950 | 7,6 |
| Or 300 sur forêt 950 | 8,1 |
| Encre 600 sur sable 50 | 5,9 |
| Or 700 sur #FFFAF0 (badge en attente) | 5,4 |
| Forêt 700 sur forêt 50 (badge validé) | 5,9 |
| Sable 50 sur forêt 900 (bouton) | 11,6 |
| Encre 950 sur or 300 (onglet actif) | 9,0 |

## Typographie

- Manrope 400–800, chiffres tabulaires (`tnum`) partout.
- Newsreader italique 400 : un seul mot ou une ligne par écran (titres de scène, promesse). Jamais pour un montant, un bouton ou un champ.

## Mouvement

| Token CSS | Durée | Usage |
|---|---:|---|
| `--duree-appui` | 100 ms | appui |
| `--duree-rapide` | 150 ms | survol |
| `--duree-ui` | 220 ms | changement d'état |
| `--duree-spatiale` | 320 ms | arc de progression |
| `--duree-marque` | 480 ms | convergence de l'orbite de marque, apparition des cartes |
| `--duree-fermeture` | 560 ms | fermeture de l'anneau (max) |

Courbes : `--courbe-standard` cubic-bezier(.2,0,0,1), `--courbe-entree` cubic-bezier(0,.4,0,1). Sous `prefers-reduced-motion`, aucune animation ni transition.

## Composants livrés (PWA)

| Composant | Fichier | Sens |
|---|---|---|
| `LogoKombe`, `SymboleOrbite` | `composants/Marque.tsx` | logotype : le Ó est l'orbite, l'accent est or |
| `Orbite` | `composants/Orbite.tsx` | nœuds = membres ou étapes, arc = progression, nœud or + Accent = position courante |
| `AnneauValidation` | `composants/AnneauValidation.tsx` | 3 segments : déclarée → confirmée → validée ; fermé + coche = validé ; rouge = contesté |
| `Scene` | `composants/Scene.tsx` | récit (surtitre, titre, mot résolu, photo en orbite) + carte fonctionnelle |
| `Icone` | `composants/Icones.tsx` | icônes linéaires (validation, registre, hors ligne, trace, flèche) |

Côté tableaux de bord : `BrandMark` (logotype) et l'orbite de `ProgressTrack` (arc = tours échus) dans `packages/dashboard-core/src/ui`.

## Règles

- Aucune forme ne porte l'information seule : chaque orbite ou anneau est accompagné d'un texte.
- Aucun cercle décoratif dans le produit : l'orbite de marque n'apparaît que dans les récits de scène.
- Textes : « remise prévue », jamais « reçoit », « solde », « épargne », « retrait », « débité ». KÓMBE ne détient pas l'argent du groupe et ne le dit jamais.
