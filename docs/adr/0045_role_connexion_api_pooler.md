# ADR-0045 — Rôle de connexion dédié à l'API et pooler de connexions

- **Statut :** ACCEPTÉ (demande du porteur, 06/11/2026 : « traiter R-03 avant 5 000 membres »).
- **Date :** 2026-11-06
- **Auteur :** harnais `claude-code`
- **Amende :** ADR-0022, sur un seul point : le choix d'une connexion directe obligatoire, justifié par `SET LOCAL`.

## Contexte

Jusqu'ici, l'API se connectait avec le rôle **propriétaire** des tables, puis endossait `kombe_app` dès l'ouverture de la connexion, grâce à l'option de démarrage `-c role=kombe_app`.

Ce mécanisme pose deux problèmes :
- **Le pooler est inutilisable.** Le pooler de Neon (PgBouncer) refuse cette option, avec l'erreur `unsupported startup parameter in options: role`. Ce refus a été constaté sur Neon le 04/11, puis reproduit localement le 06/11. Chaque instance serverless consomme donc des connexions **directes**, que Neon plafonne selon la taille du calcul. C'est le risque R-03.
- **La garantie de sécurité dépend de la configuration.** Une URL qui se connecte avec le propriétaire, sans l'option, contourne silencieusement toute la RLS.

L'ADR-0022 imposait une connexion directe pour que `SET LOCAL` et `set_config(..., true)` restent fiables. Or ces deux mécanismes sont à **portée de transaction**, ce qui les rend compatibles avec le mode « transaction » des poolers. Seuls les états de session (`SET` sans `LOCAL`, verrous consultatifs de session, `LISTEN`) sont incompatibles, et l'API n'en utilise aucun (vérifié).

## Décision

1. **Rôle `kombe_api`** (migration `0039_role_api`).
   - Il peut se connecter (`LOGIN`), est **membre de `kombe_app`** (il en hérite les droits et les politiques RLS) et n'est ni superutilisateur, ni BYPASSRLS, ni REPLICATION, ni propriétaire d'une table.
   - La migration le crée sans connexion ni mot de passe : aucun secret dans le dépôt. Elle échoue si le rôle venait à porter un attribut dangereux.
   - Le propriétaire ouvre le rôle lui-même : `ALTER ROLE kombe_api LOGIN PASSWORD …` (voir le runbook).
2. **Pool de l'API.** Si l'URL se connecte avec `kombe_api`, aucune option de démarrage n'est envoyée : le point d'accès **poolé** devient utilisable. Toute autre URL garde le mode historique (`-c role=kombe_app`, connexion directe), ce qui permet un retour arrière sans changer de code.
3. **Garde de moindre privilège** (`checkDbRole`, `assertDbRole`).
   - À la première transaction de chaque instance, l'API vérifie que sa connexion n'est ni superutilisateur, ni BYPASSRLS, qu'elle hérite de `kombe_app` et qu'elle ne peut ni agir en propriétaire de tables ni endosser un rôle privilégié.
   - Si l'un de ces contrôles échoue, l'API **refuse de servir** et `/v1/health/ready` répond 503 (`privilege.ok=false`).
4. **Migrations.** Elles restent en **connexion directe** avec le rôle propriétaire (`KOMBE_MIGRATION_DATABASE_URL`). Elles ont besoin du DDL et d'un verrou consultatif de session.

## Preuves (06/11/2026)

- **PgBouncer 1.22 en mode transaction, sans requêtes préparées**, avec l'API connectée en `kombe_api` :
  - **27/27 preuves PostgreSQL** réussies ;
  - 124 connexions applicatives passées par le pooler ;
  - le seul refus du journal est le test volontaire de l'ancien mode.
- **Charge à 32 clients via PgBouncer** : 407 requêtes/s en lecture (p95 108 ms), 200 déclarations sur 200 et 0 erreur, avec **10 connexions serveur**. En connexion directe, on mesurait 365 requêtes/s (p95 126 ms).
- **Garde de moindre privilège**, vérifiée en connexion directe comme via le pooler : un pool branché sur le propriétaire est détecté, `/ready` répond 503 et les requêtes sont refusées (`operatorSecurity`, contrôles DB-ROLE-*).
- **Neon**, sur une copie de la production (branche supprimée ensuite) :
  - 0036 à 0039 s'appliquent ;
  - `kombe_api` hérite de `kombe_app`, sans attribut dangereux ;
  - l'API fonctionne via le point d'accès `-pooler` : disponibilité, connexion, écritures idempotentes, photo de profil, isolement entre groupes.

  Une première version de la migration n'accordait pas l'adhésion sous Neon : PostgreSQL 16 refuse à un rôle CREATEROLE de modifier BYPASSRLS ou REPLICATION, même pour les retirer. Ce défaut a été corrigé avant toute production.

## Conséquences

- Pour basculer, le propriétaire ouvre le rôle, remplace `KOMBE_API_DATABASE_URL` par l'URL **poolée** en `kombe_api` et redéploie. Le retour arrière consiste à remettre l'ancienne URL (runbook).
- Le plafond de connexions directes de Neon cesse d'être la limite de montée en charge pour les paliers P1 et P2.
- La CI exécute les preuves dans les deux modes : connexion directe et pooler.
