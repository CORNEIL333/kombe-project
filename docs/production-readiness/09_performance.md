# 09 — Performance (charge mesurée)

**Outil.** `scripts/loadtest.mjs`. Il refuse toute cible non locale sauf autorisation explicite : **jamais de charge sur la production**.

**Données construites par l'API réelle.** 20 groupes de 10 membres (200 personnes), avec trésorier désigné, statuts acceptés et cycle démarré.

**Banc.**
- 1 processus Node 22 (API) et PostgreSQL 16 local.
- 4 cœurs **partagés avec le générateur de charge**.
- Pool de 10 connexions.
- Limites de débit relevées pour le banc, puisque tout part d'une seule IP.

## Résultats : 32 clients simultanés, 30 s par phase, 0 erreur

| Phase | Requêtes | req/s | p50 ms | p95 ms | p99 ms | max ms |
|---|---|---|---|---|---|---|
| A. Lecture (tableau de bord d'un membre) | 10 983 | 365 | 85 | 126 | 156 | 411 |
| B. Déclaration de cotisation (idempotente, 1 par membre) | 200 | 124 | 237 | 314 | 335 | 353 |
| B'. Rejeu de la même clé | 200 | 851 | 36 | 48 | 51 | 54 |
| C. Mixte 90 % lecture / 10 % écriture | 11 498 | 382 | 82 | 116 | 131 | 185 |

Les 200 rejeux ont tous répondu `idempotent-replay`, sans double effet.

### Par route (16 clients, 5 s)

| Route | p50 | p95 | p99 |
|---|---|---|---|
| `/v1/me/notifications/unread-count` (pastille) | 9 | 16 | 21 |
| `/v1/tontines/:id/movements` | 24 | 36 | 44 |
| `/v1/me/dues` | 35 | 48 | 55 |
| `/v1/tontines/:id` | 47 | 67 | 75 |
| `/v1/me/notifications` (liste) | 64 | 85 | 94 |
| `/v1/me/tontines` | 60 | 84 | 96 |

## Lecture des résultats

**Saturation.** À 32 clients, le serveur est saturé : selon la loi de Little, 32 / 365 ≈ 87 ms, soit le p50 mesuré. Passer le pool de 10 à 20 connexions ne gagne que 8 %. Le facteur limitant est donc le **processus Node unique**, sur une machine partagée avec le générateur. Sur Vercel, la charge se répartit entre instances : c'est la base qui devient la ressource commune (voir 12).

**Correctif mesuré.** La pastille, la requête la plus fréquente (chaque minute par session ouverte), passe d'environ 60 ms avec écritures à environ 9 ms, en lecture seule.

**Points chauds restants.**
- `/v1/me/tontines` : N+1 requêtes par groupe (R-04).
- La liste des notifications produit les relances à l'ouverture. C'est voulu pour la fraîcheur.

**Index ajoutés.** Boîte de réception par `(identity_id, created_at DESC)` et index partiel des non-lues.

## Non testé (NOT_TESTED)

- **Charge contre la production** : interdite sans autorisation.
- **Charge sur Neon distant**, avec latence réseau Francfort–Douala : à faire sur une branche jetable de pré-production, avec l'accord du propriétaire.
- **Démarrages à froid Vercel.**

Les résultats bruts sont dans `mesures/charge-2026-11-04-*.json`.
