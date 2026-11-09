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


## 5 000 personnes simultanées (06/11/2026)

**Outil** : `scripts/loadtest-5000.mjs`, qui refuse toute cible non locale.

**Modèle**
- 500 groupes de 10 membres, construits par l'API réelle.
- Chaque personne se comporte comme un membre :
  - **ouverture de l'application** : tontines, détail du groupe, échéances ;
  - **pastille** toutes les 60 s ;
  - **une action** toutes les 30 à 90 s ;
  - **sa déclaration** de cotisation une fois.
- **Les 5 000 arrivent en 60 s**, comme à l'heure d'une séance, puis restent connectées 3 minutes.

**Banc** : 3 instances d'API (Node 22, en grappe), PgBouncer en mode transaction (20 connexions serveur, rôle `kombe_api`) et PostgreSQL 16. Les **4 cœurs** de la machine sont partagés avec le générateur de charge.

### Avant et après les correctifs (mêmes conditions)

| | Avant | Après |
|---|---|---|
| Requêtes, erreurs | 42 503, **0** | 42 448, **0** |
| p50 / p95 / p99 global | 32 / 1 912 / 2 320 ms | 22 / **916** / 1 146 ms |
| Ouverture de l'application, p95 | 6 257 ms | **2 972 ms** |
| Régime établi (après l'arrivée), p95 | ≈ 50 ms | **≈ 30 ms** |
| Pastille, p50 | 20 ms | **5 ms** |
| Rafale d'arrivée, débit au pic | ≈ 310 req/s | ≈ 360 req/s |

Les résultats bruts sont dans `mesures/charge-5000-simultanes-2026-11-06-*.json`.

### Défauts trouvés par la mesure et corrigés

1. **`membership` sans index sur `identity_id`.** `kombe_my_memberships()`, appelée par presque chaque écran, parcourait toute la table : 131 M de lignes lues en 3 minutes. Index ajouté (0040) : environ 2 ms → 0,5 ms par appel.
2. **Limitation de débit.** Le ménage de `kombe_rate_hit` parcourait toute la table à chaque tentative de connexion (100 M de lignes lues). Corrigé par un index et un ménage effectué un appel sur cinquante (0040).
3. **Ouverture de transaction.** Elle coûtait 4 allers-retours ; il n'en reste qu'un, et les délais sont posés par la connexion. La pastille passe de 8,2 à 5 instructions par requête.
4. **Dispatcher de notifications.** Une réclamation était lancée à chaque écriture (27 000 réclamations vides). Les déclenchements sont désormais regroupés : un traitement à la fois, plus un traitement de suite. Résultat : environ 4 fois moins de réclamations, et toujours un envoi en moins d'une seconde environ.
5. **Relances.** Elles étaient produites personne par personne ; elles le sont maintenant par groupe, au plus toutes les 2 minutes.
6. **Lectures en double** (tours, caisses, parts, règlement, noms) dans une même requête de lecture : cache limité à la requête (« mes tontines » : 31 → 26 instructions).
7. **Existence de la table photo** vérifiée à chaque requête : désormais retenue une fois trouvée.
8. **Tâche planifiée.** Tous les groupes passaient dans une seule transaction. Désormais : une transaction par groupe, un budget de temps et un départ tournant.

### Coût par requête au pic (mesuré pendant la simulation)

| Composant | CPU par requête | À 360 req/s (pic d'arrivée) | À 200 req/s (5 000 personnes en régime établi) |
|---|---|---|---|
| PostgreSQL | **5,6 ms** | ≈ 2,0 cœurs | ≈ 1,1 cœur |
| API (Node) | 2,9 ms | ≈ 1,0 cœur, réparti entre les instances | ≈ 0,6 cœur |
| Pooler | 1,0 ms | géré par Neon | géré par Neon |

**Conclusion.** Sur le banc, la saturation pendant la rafale vient de la machine : les 4 cœurs sont partagés entre la base, le pooler, 3 API et le générateur. Le code tient la charge sans erreur. En production, l'API se répartit sur les instances Vercel, et **la ressource à dimensionner est le calcul Neon** (voir 12).
