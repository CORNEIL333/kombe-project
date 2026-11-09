# Migration des écrans KÓMBE vers Figma

Ce dossier contient tout ce qu'il faut pour recréer les écrans de KÓMBE dans Figma. La liste complète est dans [INVENTAIRE.md](INVENTAIRE.md).

**Important :** l'import n'a pas encore été essayé dans Figma lui-même. Le plugin a été testé contre une imitation de l'API Figma, et les calques ont été comparés aux captures dans un navigateur. Commencez par un petit lot.

## Contenu

| Dossier | Contenu | Dans Figma |
|---|---|---|
| `calques/` | Écrans web décrits en éléments (formes, textes, icônes) | Modifiables |
| `ecrans/` | Captures PNG de tous les écrans, mobile compris | Images |
| `jetons/` | Couleurs, rayons, espacements, styles de texte | Variables et styles |
| `plugin/` | Plugin d'import local | À installer une fois |
| `polices/` | Merriweather, Libre Franklin, Manrope et leurs licences | À installer si besoin |
| `logos/` | Logos SVG et icône d'application | À glisser dans Figma |
| `icones/` | 56 icônes SVG | À glisser dans Figma |

## Importer

1. Installez **Figma Desktop** : les plugins de développement ne s'installent pas depuis le navigateur.
2. Ouvrez un fichier de design, puis faites clic droit, **Plugins**, **Development**, **Import plugin from manifest**.
3. Choisissez `docs/figma/plugin/manifest.json`.
4. Lancez **KÓMBE Import** et choisissez `jetons/kombe.tokens.json`.
5. Relancez-le et choisissez quelques fichiers de `calques/`. Vérifiez le rendu avant de continuer.
6. Importez le reste groupe par groupe, par exemple tous les `pwa-390__*.json`.
7. Pour le mobile, choisissez les fichiers `mobile-*.png` de `ecrans/`.

Le plugin range tout dans quatre pages (Mobile, PWA, Consoles, Site), avec une section par groupe. Sur une offre Figma limitée en pages, il replie tout sur la page ouverte.

**Conseil :** les écrans web font environ 20 000 éléments au total. Importez par groupes, ou répartissez-les dans plusieurs fichiers Figma, pour garder un fichier fluide.

## Ce qui est modifiable, et ce qui ne l'est pas

| Écrans | Arrivée dans Figma |
|---|---|
| PWA, consoles, site | Modifiables : textes, formes, couleurs, icônes |
| Application mobile | **Images uniquement.** Flutter dessine ses écrans sans éléments lisibles par un navigateur. Pour modifier un écran mobile, partez de son équivalent PWA à 390 px |

**Limites des calques :**

- Ce sont des éléments positionnés, pas des composants ni de l'Auto Layout. Ce travail reste à faire dans Figma, en commençant par le bouton, la carte de groupe et la pastille.
- Un dégradé devient un aplat de sa première couleur. Les lignes pointillées dessinées en CSS, les images de fond et les fondus ne sont pas repris : les bandeaux photo des consoles sont simplifiés.
- Les couleurs ne sont pas reliées aux variables après l'import.

## Données affichées

Tous les noms, montants et groupes sont **fictifs**, servis uniquement au navigateur de capture. Aucune donnée réelle, aucune photo de membre. Les avatars montrent donc des initiales.

Les jetons de `jetons/` viennent du code en production. `packages/brand/tokens/kombe.tokens.json` contient encore l'ancienne palette : ne pas s'y fier.

## Refaire l'export

```bash
node scripts/build-web.mjs
```

```bash
node scripts/design/serve-web.mjs 4400 http://127.0.0.1:4401
```

Dans un autre terminal, avec une API factice sur le port 4401 :

```bash
node scripts/figma/capturer-web.mjs http://localhost:4400 docs/figma
```

```bash
cd packages/mobile && KOMBE_FIGMA=1 flutter test test/golden/figma_export_test.dart --update-goldens
```

Copiez ensuite `test/golden/figma/<telephone|tablette>/x.png` vers `docs/figma/ecrans/mobile-<telephone|tablette>__x.png`, puis :

```bash
node scripts/figma/inventaire.mjs docs/figma
```

```bash
node scripts/figma/tester-plugin.mjs docs/figma
```

## Écrans non capturés

- Le choix du nom d'affichage à la première connexion (mobile) : l'app y redirige seulement pour un compte sans nom.
- Les fenêtres et états temporaires : erreurs, chargements, confirmations, feuilles de photo.
- Le parcours du second facteur des consoles.
