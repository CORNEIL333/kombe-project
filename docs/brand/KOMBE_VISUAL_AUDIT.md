# KÓMBE — Audit visuel du dépôt

**Date :** 2026-10-08 · **Périmètre :** `packages/client` (PWA), `packages/dashboard-core` + `apps/dashboard-*` (4 dashboards), `packages/mobile` (Flutter), charte visuelle 01–05/08, planches produit, recherche `deep-research-kombe-identite-visuel.md`.
**Constat global :** le socle fonctionnel est sérieux (RLS, journal chaîné, offline honnête, aucune donnée fabriquée). La couche de présentation, elle, **n'exprime pas la marque** et se fragmente en trois systèmes visuels qui ne se reconnaissent pas entre eux.

---

## 1. Ce qui est déjà juste (à préserver)

| Acquis | Où | Pourquoi c'est précieux |
|---|---|---|
| Aucune donnée métier fabriquée en runtime | `no_embedded_business_data_test.dart`, `CapabilityNotice`, `RemoteState` | La confiance est le produit. Le redesign ne doit **jamais** combler un vide d'API par un faux chiffre. |
| Statut jamais porté par la seule couleur | `StatusChip`, `ProgressTrack`, `StatutContribution` | Base WCAG déjà là. |
| Distinction local / envoyé / validé | `horsLigne/moteur.ts`, `offline_policy.dart`, `server_action_guard.dart` | C'est exactement le « statut explicite » que la marque doit rendre *visible*. |
| `prefers-reduced-motion` respecté | PWA + dashboard-core | À conserver, à raffiner (dégradé en fondu, pas en « tout coupé »). |
| Cibles tactiles 44–48 px | thème Flutter, PWA | Conforme. |
| Copy honnête (« aucune garantie sur les fonds ») | pied de page PWA | Ton de marque juste ; à rendre plus humain, pas plus vague. |

## 2. Écarts critiques

### A1 — Deux palettes, aucune n'est celle de la charte
| | Charte (02/08) | Code actuel (PWA, Flutter, dashboards) |
|---|---|---|
| Vert marque | `#103C32` Forêt | `#07583D` (plus clair, plus « M-PESA ») |
| Vert actif | `#176B52` | `#0B7550` |
| Or | `#C7922E` | `#D4A83E` (plus jaune, plus « promo ») |
| Encre | `#13211C` (encre verte) | `#102234` (encre **bleue**) / `#172026` |
| Texte secondaire | `#66746E` | `#637084` / `#667085` (gris bleuté SaaS) |

L'encre bleue et les gris bleutés « Untitled UI » (`#667085`, `#ECFDF3`, `#FEF3F2`) sont la signature de *n'importe quel* dashboard Tailwind. Ils annulent la chaleur sable/forêt.

### A2 — Deux logos concurrents
- Charte 01/08 et 05/08 : **anneau à 4 nœuds** (or / sable / forêt), signature « Votre tontine, plus claire. »
- Flutter `kombe_logo.dart` + planches produit : **emblème « personnes + feuilles »**, signature « Ma tontine, simplement. »
- PWA / dashboards : PNG `logo-emblem.png` raster, rendu flou en petite taille, impossible à animer.

**Décision prise :** l'anneau à nœuds est canonique (il porte toute la grammaire Cercle → Groupe, Nœud → Membre, Arc → Progression). Il est redessiné en vectoriel paramétrique (SVG + `CustomPainter`), donc animable. L'emblème « personnes » est retiré. Signature canonique : **« Votre tontine, plus claire. »**

### A3 — Typographie
- Web : Fraunces chargé depuis Google Fonts (bloquant, hors-ligne cassé), texte en `system-ui` ; dashboards en **Inter** non chargé (tombe sur Segoe/Roboto).
- Flutter : police Material par défaut (Roboto), graisses 800 partout → hiérarchie par le *poids* seulement, pas par le contraste.
- Aucune chiffre tabulaire sur les montants hors champ OTP.

### A4 — Syndrome « dashboard template »
- `DashboardShell` : sidebar sombre 270 px + topbar + 4 `StatCard` + panneau JSON → strictement le gabarit SaaS que le mandat proscrit.
- Icônes de navigation en **emoji** (`👥 💰 🗳`) : rendu différent sur chaque OS, ton ludique incompatible avec une gouvernance financière.
- `JsonDisclosure` « Détail serveur » visible dans le parcours ordinaire d'un administrateur de groupe : utile au diagnostic, mais c'est un journal technique exposé à un trésorier.

### A5 — Accueil mobile = mini-dashboard bancaire
`dashboard_screen.dart` : logo + titre « Tableau de bord » + carte verte « montagnes » + 2 metric cards + 4 quick actions + liste. Cinq blocs de même poids ; la question « qu'attend-on de moi ? » n'a pas de réponse visuelle. Le motif « montagnes » de `GroupHeroCard` n'appartient à aucune grammaire de marque.

### A6 — Mouvement décoratif, pas explicatif
PWA : lueurs floues qui dérivent 24–34 s, filigrane qui tourne, `backdrop-filter: blur(16px)` sur la carte d'étape. C'est de l'ambiance, pas de l'information, et c'est coûteux sur Android d'entrée de gamme. Flutter : aucun token de mouvement ; transitions par défaut de go_router.

### A7 — Le cercle de confiance est absent de l'interface
Le concept est dans la charte, pas dans le produit. Le cycle est rendu par une barre linéaire (`LinearProgressIndicator`) ou des pastilles numérotées (`ProgressTrack`). Le statut d'une cotisation est une pilule colorée générique.

### A8 — Pas de site marketing
Aucun package ne porte la couche A (marque). La seule « vitrine » est le panneau gauche de l'écran de connexion PWA, avec une photo générique.

## 3. Risques à ne pas créer pendant le redesign
1. Remplacer un état serveur réel par une maquette statique (mandat §55).
2. Faire fuiter des fixtures de design dans un build runtime (mandat §56) — les prototypes vivent dans `docs/brand/`, jamais dans `packages/*/src`.
3. Casser les tests existants qui ciblent des libellés/rôles ARIA (`parcours.test.tsx`, `welcome_screen_test.dart`, `offline_status_semantics_test.dart`).
4. Ajouter WebGL / bibliothèque d'animation lourde : l'orbite tient en SVG + CSS et `CustomPainter`.

## 4. Inventaire des surfaces

| Surface | Fichiers | Couche | Priorité |
|---|---|---|---|
| Accueil mobile | `features/home/dashboard_screen.dart` | C | P0 |
| Cycle | `features/groups/cycle_screen.dart` | C | P0 |
| Déclaration cotisation | `features/contributions/*` + PWA `cotisation/` | C | P0 |
| Onboarding | `features/auth/welcome_screen.dart`, PWA `parcours/` | B | P0 |
| Admin groupe — accueil | `apps/dashboard-group-admin/src/App.tsx#Overview` | C (desktop) | P0 |
| Ops / Direction / Engineering | `apps/dashboard-*` | C (desktop) | P1 — héritent du socle `dashboard-core` |
| Site marketing | *inexistant* | A | P0 |
