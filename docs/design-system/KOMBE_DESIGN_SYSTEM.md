# KÓMBE — Design system

## 1. Architecture : une source, trois cibles
```text
packages/brand/tokens/kombe.tokens.json      ← SOURCE UNIQUE (éditer ici)
        │  node packages/brand/scripts/build-tokens.mjs   (porte : contrastes AA)
        ├─► packages/brand/css/kombe.css                → --k-* (PWA, 4 dashboards, site)
        └─► packages/mobile/lib/core/design/kombe_tokens.g.dart
                                                         → KombeTokens / KombeMotion / KombeEasing / KombeTypeScale
```
- `pnpm --filter @kombe/brand tokens` régénère ; `pnpm --filter @kombe/brand test` échoue si un fichier généré est périmé **ou** si une paire texte requise passe sous WCAG AA.
- Couches de consommation : `@kombe/brand/kombe.css` → `dashboard-core/src/styles/tokens.css` (alias historiques `--k-green-*` conservés) → `core.css`. La PWA mappe ses variables `--kombe-*` / `--couleur-*` sur les jetons ; le site les utilise directement.
- Flutter : `KombeColors` (noms historiques) pointe sur `KombeTokens` ; `KombeTheme.light()` construit le thème.

## 2. Polices (OFL, auto-hébergées)
| Cible | Fichiers | Remarque |
|---|---|---|
| Web | `packages/brand/fonts/*.woff2` (Manrope variable latin + latin-ext, Fraunces variable + italique) | `font-display: swap`, découpage `unicode-range` ; Fraunces n'est téléchargée que si une page l'utilise |
| Flutter | `packages/mobile/assets/fonts/Manrope-{400..800}.ttf`, `Fraunces-Display-500.ttf` (opsz 144, SOFT 50), `Fraunces-Title-600.ttf` (opsz 48) | Instances statiques tirées des polices variables (`fontTools.varLib.instancer`) : Flutter n'applique pas `fontWeight` à l'axe `wght` de façon fiable |
Licences : `OFL-*.txt` à côté des fichiers ; enregistrées dans `LicenseRegistry` (Flutter `main.dart`).

**Décision typographique (mandat §8)** : le couple Manrope + Fraunces est conservé. Manrope a des chiffres tabulaires propres et des accents français complets ; Fraunces, avec ses axes `opsz`/`SOFT`, donne une coupe d'affichage propre à KÓMBE (opsz 144, SOFT 50, WONK 0) qui la distingue de l'usage générique « serif doux ». Fraunces n'apparaît jamais sur un montant, un bouton, un champ ou un tableau.

## 3. Échelle typographique
| Style | Taille / interligne | Police | Usage |
|---|---|---|---|
| display-xl | 96/92 | Fraunces 500 | Site, hero |
| display | 64/64 | Fraunces 500 | Titres d'acte |
| hero-mobile | 44/44 | Fraunces 500 | Onboarding |
| h1 / h2 / h3 | 40/46 · 32/38 · 24/30 | Manrope 700 | Écrans produit |
| title | 18/24 | Manrope 700 | Titres de section |
| body-lg / body | 18/28 · 16/24 | Manrope 400 | Texte |
| meta / caption | 14/20 · 12/16 | Manrope 500–600 | Méta, légendes |
| eyebrow | 11/14, +0.2em, capitales | Manrope 700 | Sur-titres |
| amount | 28/32, tabulaire | Manrope 700 | Montants |

## 4. Espace, rayons, ombres
Base 4 px ; structure en multiples de 8. Rayons `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · pill`. Ombres teintées forêt `shadow-1..3`. Cibles tactiles ≥ 48 px (`touch.min`). Formulaire ≤ 560 px, contenu ≤ 1200 px (dashboards : 1440 px).

## 5. Vitrine des composants (§53)
- **Flutter** : golden tests `packages/mobile/test/golden/` (accueil, accueil vide, cycle, onboarding, grammaire des statuts) rendus avec les vraies polices. Régénération :
  `flutter test --update-goldens test/golden`
- **Web** : `docs/brand/directions/*.html` (explorations) et captures `docs/brand/screens/`. QA reproductible :
  `node scripts/design/shoot.mjs <url> <png> [l] [h]`, `scripts/design/qa-admin.mjs` (parcours de connexion réel, API interceptée dans le navigateur de test uniquement), `scripts/design/qa-pwa.mjs`.

## 6. Fixtures de design
Les données de démonstration n'existent que dans `docs/brand/directions/` (bandeau « fixtures de design » visible), `scripts/design/qa-admin.mjs` et `packages/mobile/test/golden/`. Aucune n'est importée par un `src/` ou `lib/` ; `no_embedded_business_data_test.dart` continue de passer.
