# ADR-0041 — Téléphones anciens : bundle abaissé, polices locales, filet de démarrage

- **Statut :** ACCEPTÉ (correctif de mise en ligne, 15/10/2026)
- **Date :** 2026-10-15
- **Auteur :** harnais `claude-code`

## Contexte

Première mise en ligne : « https://kombe.vercel.app ne parvient pas à charger »,
sur plusieurs téléphones. Le serveur répondait partout (40 sondes dans le
monde, dont Lagos, Luanda et Johannesburg). Cause reproduite sur un Chromium 79
(Android dont Chrome n'est plus mis à jour) : Vite 8 produit par défaut du code
pour Chrome 107+ / Safari 16+ (`??`, `?.`, `||=`…). Le script échoue en
`SyntaxError` et l'écran reste sur « Chargement de KÓMBE… » sans explication.
La feuille Google Fonts bloquait aussi l'affichage sur un réseau lent ou filtré.

## Décision

- PWA et Espace bureau : `@vitejs/plugin-legacy` en mode **un seul bundle**
  (`renderLegacyChunks: false`), abaissé à **Chrome 67 / Safari 14 / Samsung
  Internet 9 / Firefox 68** avec les polyfills core-js nécessaires. Plancher
  imposé par les `BigInt` des montants. Pas de bundle SystemJS : ses scripts en
  ligne importent une URL `data:`, que notre CSP interdit (`script-src 'self'`).
- Consoles plateforme et site : `build.target` abaissé aux mêmes navigateurs.
- **Polices auto-hébergées** (Manrope, Fraunces) : plus aucun appel à Google ;
  la CSP se resserre (`style-src 'self' 'unsafe-inline'`, `font-src 'self'`,
  `connect-src 'self'`).
- `public/demarrage.js` (ES5, sans module) : si l'application n'a pas démarré
  au bout de 20 s, il affiche la cause probable (réseau, navigateur trop
  ancien) et un bouton « Réessayer » au lieu d'un écran figé.

## Conséquences

- Preuves : Chromium 79 réel. Connexion téléphone, nom, accueil et création
  passent sur la PWA, sans erreur JS. Le bureau, les 3 consoles et le site
  s'affichent aussi. Les 6 E2E Playwright passent sur un Chromium récent.
- Navigateurs plus anciens que Chrome 67 / iOS 14 : non pris en charge. Le
  message de démarrage les oriente (mettre Chrome à jour, ouvrir dans Chrome).
- `webStatic.test.ts` garde la CSP de `vercel.json` identique à celle servie
  par l'API.
