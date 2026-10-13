# KÓMBE — Composants

## Composants signature (nouveaux)
| Composant | Web (`@kombe/dashboard-core`) | Flutter (`lib/core/widgets/`) | Contrat |
|---|---|---|---|
| Orbite de cycle | `CycleOrbit({total, current, label, center?, onSelect?, selected?, inverse?})` | `KombeCycleOrbit(total:, current:, semanticLabel:, center:, onSelect:, selected:, animate:)` | `total`/`current` viennent du serveur. `current` 1-indexé ; 0 = non démarré ; `total+1` = terminé. Nœuds focusables + libellés « Tour n sur N, passé/en cours/à venir » quand `onSelect` est fourni. Halo jamais rogné. |
| Statut par la forme | `StatusRing({kind, label})` — `draft · pending · confirmed · disputed · offline · syncing · neutral` | `KombeStatusRing(status:, label:)` | Le libellé est toujours rendu (ou porté en sémantique si `showLabel:false`). |
| Signe | `KombeMark({size, inverse?, title?})` | `KombeMark(size:, inverse:, progress:)` | `progress` 0→1 anime la convergence du signe. |
| Orbite du site | `apps/site/src/orbit.ts → createOrbit()` | — | Ajoute `converge` (dispersion → anneau) et `gather` (décision). |

## Composants restylés (API inchangée)
| Composant | Changement |
|---|---|
| `DashboardShell` | Rail sable au lieu de la barre latérale vert dégradé ; marqueur « nœud » au lieu des icônes emoji ; signe vectoriel. |
| `StatCard`, `MetricCard` | Rangée séparée par filets, pas de carte-icône ; montants tabulaires **jamais coupés** (`white-space: nowrap`). |
| `QuickActions` | Liste à filets ; action primaire seule en aplat. Classes explicites `k-quick-action-icon` / `-label` (l'ancien sélecteur `:nth-child` masquait le libellé sans icône). |
| `RemoteState` | Erreur réseau traduite pour les personnes (`describeErrorForPeople`) ; `describeError` inchangé. |
| `JsonDisclosure` | Replié, discret, libellé « Réponse serveur (diagnostic) ». |
| `KombeLogo` (Flutter) | Signe à anneau + « Votre tontine, plus claire. » ; même API `compact`/`size`. |
| `AfricanPatternBand` (Flutter), `MotifAfricain` (PWA) | Le bandeau de triangles devient une trajectoire (filet + nœuds). Noms conservés. |
| `ImmersiveBackdrop` (PWA) | Surface sable + anneau statique ; plus de lueurs floues ni de `backdrop-filter`. |

## Écrans recomposés
| Écran | Fichier | Composition |
|---|---|---|
| Accueil mobile | `features/home/dashboard_content.dart` | Groupe → orbite → **une** prochaine action (avec « qui validera ») → déclaré ce mois → trajectoire d'activité. État vide : un nœud seul sur un anneau pointillé. |
| Cycle | `features/groups/cycle_screen.dart` (`CycleView`) | Orbite interactive (toucher un tour → détail) ; liste avec pastille de tour + `KombeStatusRing` ; libellés FR au lieu des noms d'enum. |
| Onboarding | `features/auth/welcome_screen.dart` | 3 temps (individus → cercle → arc) ; entrées « Se connecter » / « Créer un compte » toujours visibles. |
| Admin — accueil | `apps/dashboard-group-admin/src/App.tsx#Overview` | Cycle (orbite) comme ancre + « À traiter » (règles, fonctions indépendantes, litiges) + progression + actions. |
| PWA — connexion / création | `packages/client/src/connexion`, `App.tsx` | Copy honnête, signe vectoriel, polices locales. |
| Site | `apps/site` | 7 actes (voir KOMBE_CREATIVE_DIRECTION.md). |

## Règles d'usage
- Une seule action primaire (aplat forêt) par écran.
- Toute couleur de statut est doublée d'une forme et d'un texte.
- L'or n'est jamais un texte sur fond clair (test automatique dans `@kombe/brand`).
- Pas d'emoji dans l'interface.

## Ajouts — refonte mobile (2026-10-09)
| Élément | Fichier | Rôle |
|---|---|---|
| Silhouette | `core/widgets/kombe_figure.dart` · site `orbit.ts` (`figures: true`) | Le nœud en version humaine. Couches marque/onboarding uniquement ; le produit garde des nœuds simples. |
| Étapes en trajectoire | `core/widgets/step_indicator.dart` | Fait = nœud coché, en cours = nœud or + halo, à venir = nœud creux, reliés par un chemin. |
| Carte de transparence | `core/widgets/transparency_card.dart` | Avant une action : ce qui va se passer, qui valide, où ça reste. Faits garantis seulement. |
| Confirmation d'envoi | `features/contributions/contribution_sent_sheet.dart` | Arc qui reste **ouvert** : envoyé ≠ validé. |
| Choix du moyen de paiement | `contribution_start_screen.dart#_ChannelOption` | Lignes pleine largeur (≥ 56 px) au lieu d'un contrôle segmenté illisible à 390 px. |
| Libellés du domaine | `core/formatters/labels.dart` | Aucune valeur technique (`underReview`, `treasurer`) n'est affichée. |
| Barre de navigation | `app/router/main_shell.dart` | Bouton « + » rond forêt cerclé d'or ; libellés sur une ligne ; nœud or sous l'onglet actif. |
| Carte groupe | `core/widgets/group_hero_card.dart` | Orbite réelle du groupe en filigrane (remplace le motif « montagnes »). |
| Icône d'app | `android/.../mipmap-*/ic_launcher.png`, `packages/brand/marks/kombe-app-icon-512.png` | Signe à anneau sur fond forêt (charte « icône app, fond foncé »). |
