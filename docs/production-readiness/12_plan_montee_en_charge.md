# 12 — Plan de montée en charge

Les paliers sont indicatifs : nombre de membres actifs, chacun ouvrant l'application environ 3 fois par jour, plus la pastille pendant les sessions.

| Palier | Charge attendue | Ce qui tient tel quel | À faire avant |
|---|---|---|---|
| **P1 · ≤ 5 000 membres** | Quelques req/s, pics de séance à environ 30 req/s | Architecture actuelle (Vercel et Neon, connexion directe, pool de 10) | Secrets posés, opérateurs, planificateur externe pour `/v1/internal/cron/notifications` (toutes les 5 à 15 min) ou Vercel Pro |
| **P2 · ≤ 50 000** | Environ 50 à 150 req/s aux heures de séance | Bail SKIP LOCKED, compteurs partagés, index, **pooler via `kombe_api`** (R-03, livré) | Bascule vers le pooler (voir ci-dessous) ; **R-04** : résumé de groupes en une requête ; calcul Neon dimensionné, avec mise à l'échelle automatique |
| **P3 · ≤ 500 000** | Plusieurs centaines de req/s | Partitionnement naturel par groupe (RLS) | Réplica en lecture pour Direction et Engineering ; archivage de la boîte de réception (plus de 90 jours) ; push Web ; file d'envoi traitée par un worker dédié (`packages/worker`) plutôt que par la fonction API |

## R-03 : connexions (traité le 06/11/2026, ADR-0045)

- **Code et migration livrés.** Rôle `kombe_api` (LOGIN, membre de `kombe_app`, sans BYPASSRLS). Le pool n'envoie plus d'option de démarrage quand il se connecte avec ce rôle. Une garde de moindre privilège refuse de servir si la connexion est trop privilégiée.
- **Prouvé.**
  - 27/27 preuves via PgBouncer en mode transaction.
  - Charge à 32 clients : 407 req/s, p95 de 108 ms, 0 erreur, **10 connexions serveur** pour environ 25 000 requêtes.
  - Répétition réussie sur une copie de la production Neon, via le point d'accès `-pooler`.
- **Reste à faire par le propriétaire** : la bascule (runbook, « Bascule de l'API vers le pooler »), au prochain déploiement de cette branche.

## Dimensionnement pour 5 000 personnes simultanées et au-delà (mesuré, voir 09)

**Base (Neon, la ressource partagée).** Environ 5,6 ms de CPU par requête.
- 5 000 personnes en régime établi (≈ 200 req/s) : ≈ 1,1 vCPU.
- Toutes arrivant en une minute, à l'heure d'une séance (≈ 360 req/s) : ≈ 2 vCPU.
- Réglage recommandé :
  - **mise à l'échelle automatique de 1 à 4 CU** pour la branche de production, pour garder environ 50 % de marge au pic ;
  - mise en veille désactivée ;
  - **API branchée sur le pooler** (`kombe_api`, voir 11).
- Avec un maximum de 8 CU, la même base absorbe environ 10 000 personnes arrivant en une minute.

Ces valeurs sont des ordres de grandeur mesurés sur PostgreSQL 16 local. Il faut les confirmer par une charge sur une branche Neon jetable, avec l'accord du propriétaire.

**API (Vercel).** Environ 2,9 ms de CPU par requête, soit environ 1 vCPU au total à 360 req/s, réparti automatiquement entre les instances. Garder `KOMBE_PG_POOL_MAX=10` par instance, le pooler partageant les connexions serveur.

**Leviers suivants (non faits)**, par gain attendu sur le CPU de la base :
1. **Requêtes préparées nommées** (le pooler Neon les accepte en mode transaction). Elles suppriment l'analyse et la planification répétées de chaque instruction.
2. **Écran « mes tontines »** calculé en une requête agrégée (R-04 ci-dessous).
3. **Ouverture de l'application** : regrouper tontines, détail et échéances en une seule réponse.

## R-04 : `/v1/me/tontines`

Remplacer la boucle par groupe (chargement du groupe et de son résumé) par une requête agrégée : prochaine séance, montant dû et rôle, en un aller-retour.

Gain attendu : p50 de 60 ms à environ 15 ms, mesuré sur le banc de 09.

## Indicateurs à surveiller

- p95 par route : journaux Vercel, `reqId`.
- `notification_outbox` : lignes `retry` et `dead` (`kombe_outbox_stats`, console Opérations).
- Connexions Neon et temps CPU.
- 429 par seau.
- Âge de la plus ancienne déclaration en attente (`/v1/ops/overview`).
