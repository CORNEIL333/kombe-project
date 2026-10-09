# KÓMBE — Langage visuel

Direction : **Living Circle, disciplinée par Quiet Authority** ([KOMBE_CREATIVE_DIRECTION.md](KOMBE_CREATIVE_DIRECTION.md)).

## 1. Grammaire de formes (une seule, partout)
| Forme | Sens | Web | Flutter |
|---|---|---|---|
| Anneau | Le groupe | `.k-orbit__ring` | `KombeOrbitPainter` |
| Nœud | Membre / tour | `.k-orbit__node` | idem |
| Nœud forêt plein | Tour passé | `--past` | `orbitPast` |
| Nœud or + halo | Tour courant / bénéficiaire | `--current` | `orbitBeneficiary` |
| Nœud creux | Tour à venir | `--future` | `orbitFuture` + trait |
| Arc forêt | Progression | `.k-orbit__arc` | `orbitArc` |
| Arc ouvert | En attente | `StatusRing kind="pending"` | `KombeStatus.pending` |
| Anneau fermé + coche | Validé | `confirmed` | `confirmed` |
| Chemin rompu | Contesté | `disputed` | `disputed` |
| Pointillé | Brouillon local / hors connexion | `draft` / `offline` | idem |
| Filet ponctué de nœuds | Historique (trajectoire) | timeline admin, pied de scène PWA | `_Timeline`, `AfricanPatternBand` |
| Nœuds qui convergent au centre | Décision collective | site, acte 06 | — |

**Règle §13 :** toute composition circulaire porte une donnée réelle (nombre de tours, tour courant, statut). Les seules exceptions décoratives sont le signe lui-même et les illustrations explicitement marquées comme telles sur le site (« Illustration d'un cycle de 8 membres »).

## 2. Le signe
Anneau à quatre nœuds (charte 01/08). Vectoriel : `packages/brand/marks/kombe-mark.svg`, `KombeMark` (React), `KombeMark`/`KombeMarkPainter` (Flutter, animable via `progress`). Zone de protection = diamètre d'un nœud. Taille mini : 24 px (signe seul), 85 px (horizontal).

## 3. Couleur
Jetons : `packages/brand/tokens/kombe.tokens.json` (échelles 50–950 : `forest`, `gold`, `sand`, `ink`).

| Rôle | Jeton | Valeur | Règle |
|---|---|---|---|
| Marque | `brand` | #103C32 | Fonds premium, bouton primaire, texte de marque |
| Action | `brand-action` | #176B52 | Survol, focus, liens |
| Vivant | `brand-living` | #2A8A68 | Graphismes uniquement (blanc dessus = 4,26:1 ✗) |
| Accent | `accent` | #C7922E | **Chirurgical** : tour courant, nœud signature, CTA du site sur fond sombre. Jamais texte sur clair. |
| Canevas | `surface-canvas` | #FBF8F1 | Fond par défaut (jamais blanc pur en plein écran) |
| Encre | `content-primary` | #13211C | Texte |
| Secondaire | `content-secondary` | #5B6963 | Ajusté depuis #66746E de la charte : 4,5:1 garanti sur sable |

Sémantique indépendante de la marque : succès #147A54, attention #A15C00, erreur #B42318, info #1D4ED8 — chacun avec sa surface teintée testée AA. **La couleur de marque n'est jamais une couleur de statut.**

## 4. Lumière comme matière
- Site : une seule radiale chaude (`#FFFDF8`) derrière l'orbite + une lueur or très basse en coin. Pas de flou animé.
- Produit : surfaces plates, filets `line` 1 px, ombres teintées forêt (`shadow-1..3`), aucune `backdrop-filter`.
- Interdits : glassmorphism, néons, dégradés saturés plein écran (ancien fond « or → forêt » de la PWA retiré).

## 5. Composition
- **Couche A** : asymétrie, grande orbite qui déborde, typographie d'affichage, une photo masquée dans un nœud.
- **Couche B** : une phrase par écran, l'illustration *est* l'orbite.
- **Couche C** : une ancre visuelle par écran (l'orbite si le cycle est le sujet), puis filets et listes. Métriques en rangée séparée par filets, pas en « 4 cartes KPI ».

## 6. Iconographie
Material Symbols Rounded / `Icons.*_rounded` pour le générique. Le métier s'exprime par la grammaire (anneau, nœud, arc) plutôt que par une famille de pictogrammes dessinés. **Aucun emoji** dans l'interface (retirés de la navigation des dashboards et de l'écran de connexion PWA).
