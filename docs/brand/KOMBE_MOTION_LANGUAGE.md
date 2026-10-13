# KÓMBE — Langage du mouvement

**Principes :** calme · intentionnel · continu · physique · précis. Le mouvement explique un changement d'état ; il ne décore jamais. Aucune animation ne bloque une interaction.

## 1. Jetons (source : `kombe.tokens.json` → `--k-motion-*` / `KombeMotion`, `--k-ease-*` / `KombeEasing`)
| Jeton | Durée | Usage |
|---|---:|---|
| `instant` | 100 ms | Pression de bouton (`scale(.98)`) |
| `fast` | 150 ms | Survol, chip, focus |
| `ui` | 220 ms | Changement d'état, fondu, AnimatedSwitcher |
| `spatial` | 300 ms | Sheet, navigation locale, déplacement d'un nœud |
| `brand` | 420 ms | Fermeture d'anneau, signe |
| `expressive` | 560 ms | Moment exceptionnel (convergence, premier groupe) — plafond |

| Courbe | Valeur | Usage |
|---|---|---|
| `standard` | (0.2, 0, 0, 1) | Par défaut |
| `enter` | (0, 0.4, 0, 1) | Entrées |
| `exit` | (0.4, 0, 1, 1) | Sorties (120–180 ms) |
| `spatial` | (0.4, 0, 0, 1) | Déplacements |
| `brand` | (0.2, 0.8, 0.2, 1) | Orbite, signe — amorti, sans rebond |

## 2. Signature : convergence → fermeture
Nœuds dispersés → rejoignent l'anneau (décalage 24–55 ms par nœud) → l'arc trace la progression → le nœud courant reçoit son halo.

| Contexte | Intensité | Implémentation |
|---|---|---|
| Site, acte 01 | Pleine (≈ 1,6 s, une fois) | `createOrbit({converge:true}).play()` |
| Onboarding | Pilotée par l'utilisateur, 3 temps | `_StoryPainter(stage)` + `TweenAnimationBuilder` |
| Accueil / cycle mobile | 420 + 560 ms, premier affichage seulement | `KombeCycleOrbit` |
| Dashboard admin | Arc 560 ms, nœuds en fondu | `.k-orbit__arc` (keyframe `k-arc`) |
| Validation | Arc → anneau fermé (320 ms) puis coche (220 ms) | `StatusRing`/`KombeStatusRing` |

## 3. Chorégraphie par type de navigation
| Type | Mouvement |
|---|---|
| Pairs (onglets) | Fondu croisé `ui`, pas de glissement |
| Descente (groupe → cycle) | Transition plateforme (Android : *fade forwards* ; iOS : Cupertino). L'identité du groupe reste en tête d'écran. |
| Tâche modale (déclarer) | Montée `spatial` de la feuille, sortie `exit` |
| Confirmation | Fermeture d'anneau ; jamais de confettis |
| Retour | Inverse exact de l'entrée |

## 4. États système
| État | Mouvement |
|---|---|
| Chargement | Squelette qui préserve la mise en page ; orbite en rotation lente **uniquement** pendant une opération bloquante réelle. Jamais de pourcentage inventé. |
| Synchronisation | `StatusRing kind="syncing"` (rotation 1,6 s) tant que l'opération dure |
| Hors connexion | Segments pointillés, aucun clignotement |
| Retour de connexion | Les segments se rejoignent ; message « Connexion rétablie. Vérification des changements… » |
| Erreur | Aucune secousse ; bordure + message + action |
| Réordonnancement | `spatial` sur la position, `ui` sur l'opacité |

## 5. Micro-interactions
Bouton : `scale(.98)` en `instant`. Focus : anneau 3 px `focus`, sans transition de taille. Toggle : 150 ms. Case OTP : bordure `brand-action` + halo 4 px. Chip de statut : changement de forme, pas seulement de couleur. Copier/partager une invitation : texte de confirmation (« Lien copié »), pas d'animation dédiée.

## 6. Haptique (Flutter)
| Événement | Retour | État |
|---|---|---|
| Sélection d'un nœud | `HapticFeedback.selectionClick` | ✅ branché (`KombeCycleOrbit`) |
| Déclaration envoyée (réponse serveur) | `lightImpact` | ✅ branché (`contribution_review_screen.dart`) |
| Validation enregistrée | `mediumImpact` | ✅ branché (`validation_screens.dart`) |
| Erreur d’une commande serveur | `heavyImpact` (une fois) | ✅ branché (déclaration, validation) |
Jamais sur le défilement, jamais en boucle. Pas de son.

## 7. Mouvement réduit
Web : `prefers-reduced-motion` plafonne toutes les durées à 120 ms (fondus) au lieu de tout couper ; l'orbite s'affiche directement à son état final. Flutter : `MediaQuery.disableAnimations` → `KombeCycleOrbit` à `t = 1`, onboarding sans tween. La hiérarchie reste identique sans animation.
