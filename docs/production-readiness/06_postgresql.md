# 06 — PostgreSQL : migrations, sauvegarde et restauration

## Migrations

- **Moteur.** `packages/db/scripts/migrate.mjs` applique chaque fichier une seule fois.
  - Le fichier et son jalon (`kombe_migration`) passent dans une même transaction.
  - Un verrou consultatif empêche deux exécutions concurrentes.
- **Garde de build.** En production, le build exécute les migrations avant la mise en ligne. Il refuse le déploiement sans URL de migration ou sans secrets (vérifié, voir 10).
- **Sonde.** `/v1/health/ready` répond 503 si le schéma attendu par le build manque (`kombe_schema_has`).
- **Réversibilité.** Chaque migration a son `.down.sql`, qui refuse de perdre des traces (journal opérateur, envois consignés).

## Exercice de restauration et de mise à niveau (04/11/2026, 08:08 UTC)

| Étape | Résultat |
|---|---|
| Copie de la production | Branche Neon `drill-restore-20261104` créée depuis `production` au LSN `0/8D27128`, par copie à l'écriture. Aucune écriture sur la production. |
| Délai d'usage | Branche joignable en moins de 30 s (création, point d'accès, URI). |
| Fidélité | Compteurs identiques à la production : 20 identités, 6 groupes, 14 adhésions, 92 notifications, 14 mouvements, 75 entrées de journal (séquence max 45), 0 empreinte manquante. |
| Mise à niveau | Le **vrai** `migrate.mjs` a été exécuté sur la copie : 0035, 0036, 0037 et 0038 appliquées, le reste ignoré, statut OK. |
| Contrôles après migration (rôle `kombe_app`) | Droits exacts sous Neon : `operator_role` en SELECT, `notification_outbox` en SELECT, `identity` en INSERT et SELECT. Sans session, `identity` et la boîte de réception renvoient 0 ligne. Registre fermé (42501). `kombe_rate_hit` fonctionne. Une notification réelle sans consentement crée 0 ligne d'envoi. |
| API sur la copie | `/v1/health/ready` : prêt, schéma à jour. Contrôles SMOKE-LIVE, READY et AUTH-401 réussis. Connexion, `/v1/me`, tontines, notifications, préférences, pastille et `/v1/ops/me` : 200. Console refusée à un non-opérateur. |
| Nettoyage | Branche supprimée, URI temporaire effacée, 7 branches restantes comme avant l'exercice. |

**Objectifs démontrés.**
- **RPO** : la restauration à un instant précis (PITR) de Neon couvre la fenêtre d'historique du plan.
- **RTO** : une copie restaurée utilisable en moins d'une minute, puis le basculement de `KOMBE_API_DATABASE_URL` et un redéploiement, de l'ordre de quelques minutes.
- À répéter chaque trimestre, et avant toute migration non triviale.

## Procédure de restauration (incident)

1. Console Neon, puis *Branches*, puis *Create branch* depuis `production` à l'instant **précédant** l'incident (horodatage ou LSN).
2. Vérifier la copie : comptages et `/v1/health/ready` d'une API locale pointée sur la branche.
3. Dans Vercel, remplacer `KOMBE_API_DATABASE_URL` et `KOMBE_MIGRATION_DATABASE_URL` par l'URL **directe** (non poolée) de la branche, puis redéployer.
4. Après stabilisation, renommer ou promouvoir la branche selon la procédure Neon, et conserver l'ancienne branche pour l'analyse.

## Points de vigilance

- **URL directe obligatoire.** L'URL poolée de Neon (PgBouncer) refuse l'option de démarrage `role=kombe_app`, constaté pendant l'exercice. Évolution prévue : voir 12, R-03.
- **Droits explicites.** Sous Neon, `ALTER DEFAULT PRIVILEGES` est ignoré. Chaque nouvelle table doit recevoir ses GRANT et REVOKE dans sa migration ; c'est le cas de 0036 à 0038.
