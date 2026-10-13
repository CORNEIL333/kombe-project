# KÓMBE — Accessibilité

**Cible :** WCAG 2.2 AA. L'outillage automatique ne certifie rien seul : des sessions avec lecteur d'écran (TalkBack, NVDA) et des utilisateurs au Cameroun restent nécessaires.

## Garanti par construction
| Exigence | Comment |
|---|---|
| Contraste texte ≥ 4,5:1 | Porte automatique `packages/brand/scripts/tokens.test.mjs` sur 13 paires (texte primaire/secondaire sur les 3 surfaces, inverse sur marque, 4 statuts sur leur surface, focus, accent sur marque). `content-secondary` passé de #66746E à #5B6963 pour tenir 4,5:1 sur sable. |
| L'or jamais en texte sur clair | Test dédié (ratio < 4,5 attendu → usage interdit). |
| Statut jamais par la couleur seule | `StatusRing` / `KombeStatusRing` : forme + libellé obligatoires. |
| Orbite lisible par lecteur d'écran | `<title>` / `semanticLabel` complet (« Cycle de 12 tours, tour 4 en cours ») ; nœuds interactifs = boutons nommés (« Tour 5 sur 12, à venir »), cibles 48 px en Flutter. |
| Mouvement réduit | Web : durées plafonnées à 120 ms, orbite à l'état final. Flutter : `disableAnimations` respecté par l'orbite et l'onboarding. |
| Focus visible | Anneau 3 px `focus` sur tout élément interactif (site, PWA, dashboards). |
| Cibles tactiles | ≥ 48 px (boutons Flutter 52 px, boutons site 52 px, pas d'étape 48 px). |
| Lien d'évitement | Site, PWA et dashboards. |
| Langue | `lang="fr"` ; bascule FR/EN conservée. |

## Vérifié pendant ce lot
- Tests existants inchangés et verts : `offline_status_semantics_test.dart`, `welcome_screen_test.dart` (rôles/libellés), parcours PWA (`parcours.test.tsx`).
- Aucun débordement horizontal à 360/390 px sur le site, la PWA et l'admin.

## Points ouverts (à traiter avant G0)
1. Audit lecteur d'écran réel sur l'onboarding `PageView` (annonce de l'étape : `Semantics(label: 'Étape n sur 3')` présent, à éprouver).
2. Zoom 200–400 % des dashboards (reflow à vérifier sur les tableaux larges).
3. La scène collante des actes 02/03 du site : vérifier qu'elle reste lisible au clavier (le contenu est dans le DOM, seul l'état visuel change).
4. Haptique Flutter sur validation/erreur non encore branchée (voir KOMBE_MOTION_LANGUAGE.md §6).
