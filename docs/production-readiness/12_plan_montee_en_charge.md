# 12 — Plan de montée en charge

Les paliers sont indicatifs : nombre de membres actifs, chacun ouvrant l'application environ 3 fois par jour, plus la pastille pendant les sessions.

| Palier | Charge attendue | Ce qui tient tel quel | À faire avant |
|---|---|---|---|
| **P1 · ≤ 5 000 membres** | Quelques req/s, pics de séance à environ 30 req/s | Architecture actuelle (Vercel et Neon, connexion directe, pool de 10) | Secrets posés, opérateurs, planificateur externe pour `/v1/internal/cron/notifications` (toutes les 5 à 15 min) ou Vercel Pro |
| **P2 · ≤ 50 000** | Environ 50 à 150 req/s aux heures de séance | Bail SKIP LOCKED, compteurs partagés, index | **R-03** : rôle LOGIN dédié et pooler Neon (voir ci-dessous) ; **R-04** : résumé de groupes en une requête ; calcul Neon dimensionné, avec mise à l'échelle automatique |
| **P3 · ≤ 500 000** | Plusieurs centaines de req/s | Partitionnement naturel par groupe (RLS) | Réplica en lecture pour Direction et Engineering ; archivage de la boîte de réception (plus de 90 jours) ; push Web ; file d'envoi traitée par un worker dédié (`packages/worker`) plutôt que par la fonction API |

## R-03 : connexions

**Problème.** Chaque instance serverless ouvre jusqu'à `KOMBE_PG_POOL_MAX` connexions **directes**. Le pooler Neon (PgBouncer) refuse l'option de démarrage `role=kombe_app`.

**Solution, sans perte de sécurité.**
1. Créer `kombe_api` (LOGIN, NOBYPASSRLS, `IN ROLE kombe_app`) avec un mot de passe dans Neon.
2. Retirer l'option `-c role=` lorsque l'URL se connecte déjà avec ce rôle.
3. Passer l'URL de l'API sur le point d'accès **poolé**.

**Ce qui reste fiable.** `set_config(..., true)` et `SET LOCAL` sont à portée de transaction, compatibles avec le mode « transaction » de PgBouncer. L'ADR-0022 sera à amender.

**Garde à ajouter.** Au démarrage, refuser de servir si `current_user` est propriétaire des tables ou BYPASSRLS.

## R-04 : `/v1/me/tontines`

Remplacer la boucle par groupe (chargement du groupe et de son résumé) par une requête agrégée : prochaine séance, montant dû et rôle, en un aller-retour.

Gain attendu : p50 de 60 ms à environ 15 ms, mesuré sur le banc de 09.

## Indicateurs à surveiller

- p95 par route : journaux Vercel, `reqId`.
- `notification_outbox` : lignes `retry` et `dead` (`kombe_outbox_stats`, console Opérations).
- Connexions Neon et temps CPU.
- 429 par seau.
- Âge de la plus ancienne déclaration en attente (`/v1/ops/overview`).
