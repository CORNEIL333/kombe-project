# ADR-0035 — Déploiement en un seul projet Vercel, à la même origine

- **Statut :** **PROPOSÉ, appliqué par défaut** — remplace partiellement ADR-0022 (les tableaux de bord ne sont plus sur Cloudflare).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Le découpage API/Vercel + 3 tableaux de bord/Cloudflare + admin/Vercel exigeait un jeton Cloudflare en écriture (indisponible), une liste CORS et des URL d'API recopiées à la compilation. Les clients appelaient en `credentials: include` alors que l'API n'envoyait pas `Access-Control-Allow-Credentials` : en déploiement séparé, le navigateur aurait bloqué toutes les réponses.

## Décision

- Un projet Vercel : API `/v1/*` (fonction serverless) + site statique `dist-web` (PWA `/`, `/bureau/`, `/ops/`, `/direction/`, `/engineering/`, `/site/`), configuration unique `apiBaseUrl: "/"`.
- Migrations appliquées au build de production si `KOMBE_MIGRATION_DATABASE_URL` est posée (jamais depuis un aperçu).
- Pour Docker/Render : `KOMBE_WEB_ROOT` fait servir le même site par l'API.
- CORS corrigé quand même (`allow-credentials` pour les origines de la liste fermée).

## Conséquences

Une seule URL à partager ; aucun jeton Cloudflare ; CSP web stricte (tout en `'self'` sauf polices Google).
