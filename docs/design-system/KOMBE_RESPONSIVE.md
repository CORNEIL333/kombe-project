# KÓMBE — Adaptatif

**Principe :** recomposer, pas rétrécir. Mobile = tâche d'abord · tablette = contexte + tâche · desktop = vue d'ensemble + contrôle.

## Points de rupture (jetons `breakpoint`)
| Nom | Seuil | Navigation | Mise en page |
|---|---|---|---|
| compact | < 600 | Barre du bas (Flutter), onglets défilants (dashboards) | 1 colonne |
| medium | 600–839 | Rail | 1–2 colonnes |
| expanded | ≥ 840 | Rail persistant | 12 colonnes |
| large / xlarge | ≥ 1200 / 1600 | Rail + contenu centré | max 1440 px, jamais étiré |

## Recompositions réelles
| Surface | Desktop | ≤ 1100 px | ≤ 760 px |
|---|---|---|---|
| Admin — accueil | Orbite + métriques côte à côte (8 col.) / « À traiter » (4 col.) | Orbite centrée au-dessus des métriques | Tout en une colonne ; rail → onglets défilants collants ; métriques empilées |
| Site — hero | Titre à gauche, orbite à droite, photo au centre de l'anneau, puces de statut | — | Titre puis orbite pleine largeur, photo au centre, puces masquées |
| Site — actes 02/03 | Scène collante : fragments dispersés → registre au défilement | — | Registre directement (pas de scène collante sur petit écran) |
| Site — preuves | 4 colonnes | 2 colonnes | 1 colonne |

## QA visuelle (exécutée le 2026-10-08)
| Surface | 360 | 390 | 1440 | Débordement horizontal |
|---|---|---|---|---|
| Site | ✔ | ✔ | ✔ | 0 px |
| PWA (création, connexion) | — | ✔ | ✔ | 0 px |
| Admin groupe (accueil) | — | ✔ | ✔ | 0 px |
| Flutter (goldens 390×844) | — | ✔ | — | aucun `RenderFlex overflow` |

Non encore capturés : 768, 1024, 1920 ; chaînes FR extrêmes (noms de groupe de 60+ caractères) ; texte à 200 %. Commande : `node scripts/design/shoot.mjs <url> <png> <largeur> <hauteur>`.
