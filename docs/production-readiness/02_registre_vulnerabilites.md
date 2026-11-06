# 02 — Registre des vulnérabilités et anomalies

**Statuts** :
- CORRIGÉ : correctif poussé, avec sa preuve.
- RÉSIDUEL : risque accepté ou différé, plan à suivre.
- PROPRIÉTAIRE : action réservée au porteur.

| ID | Sév. | Constat | Statut | Correctif · Preuve |
|---|---|---|---|---|
| V-01 | P0 | Idempotence en plusieurs transactions. Un échec entre l'effet et la mémorisation produit un effet orphelin ; deux requêtes concurrentes avec la même clé produisent un double effet. | CORRIGÉ | Une seule transaction avec verrou consultatif ; les transactions imbriquées deviennent des SAVEPOINT. `idempotence.proof` : 20 requêtes concurrentes → 1 effet et 19 rejeux ; échec forcé → aucun orphelin. |
| V-02 | P0 | Refus d'accès support journalisés dans la transaction annulée : aucune trace. | CORRIGÉ | Journal hors transaction. `operatorSecurity` : REFUSALS-DURABLE-AFTER-403. |
| V-03 | P0 | Approbation et révocation JIT sans version attendue. | CORRIGÉ | `if-match-version` exigé (409 sinon) ; révocation tracée. |
| V-04 | P0 | Un booléen opérateur ouvre toutes les consoles, sans second facteur. | CORRIGÉ | Fonctions distinctes ; TOTP obligatoire, scellé en AES-GCM, protégé contre le rejeu ; codes de secours ; journal opérateur. `operatorSecurity`, `opsConsole`, parcours Chromium. |
| V-05 | P0 | Codes OTP stockés en SHA-256 simple. | CORRIGÉ | HMAC avec poivre serveur (`h2:`). `authHardening` : HASH-PEPPERED. |
| V-06 | P0 | Limitation OTP en mémoire, par instance. | CORRIGÉ | Compteurs partagés en base (`kombe_rate_hit`). `authHardening` : la limite partagée entre 2 instances produit un 429. |
| V-07 | P0 | `identity` énumérable (l'identifiant est le login). | CORRIGÉ | RLS (lecture de sa propre ligne seulement) (0037). `operatorSecurity` : RLS-IDENTITY-NO-ENUMERATION. |
| V-08 | P0 | Auto-attribution d'un rôle opérateur possible si l'écriture était accordée (installation neuve : `roles.sql` accorde ALL). | CORRIGÉ | Politique en lecture seule et REVOKE miroirs. RLS-NO-OPERATOR-SELF-GRANT. |
| V-09 | P1 | Registre des migrations lisible et modifiable par le rôle applicatif. | CORRIGÉ | REVOKE ; sonde `kombe_schema_has()`. MIGRATION-LEDGER-CLOSED. |
| V-10 | P1 | `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, high), fastify et fast-uri vulnérables. | CORRIGÉ | zod 4, fastify 5.12.8, overrides ; `pnpm audit --prod` propre ; audit bloquant en CI. |
| V-11 | P1 | API sans journaux (`logger: false`). | CORRIGÉ | Journaux JSON (pino), jetons masqués, `x-correlation-id`. |
| V-12 | P1 | Déploiement possible sans migration ni secrets. | CORRIGÉ | Garde de build vérifiée (exit 1, voir 10). |
| V-13 | P1 | Limitation par IP incompatible avec le CGNAT ; fichiers statiques comptés. | CORRIGÉ | Seau par session, plafond IP large, statiques exclus. Tests unitaires. |
| V-14 | P1 | Les 26 preuves PG ne tournaient pas en CI. | CORRIGÉ | `proofs-postgres.yml` (27 preuves). |
| V-15 | P1 | Pastille sondée chaque minute : liste complète et production des relances (écritures) à chaque appel. | CORRIGÉ | `/unread-count` (≈ 9 ms au lieu de ≈ 60 ms) ; relances au plus toutes les 10 min. |
| V-16 | P2 | Contraste 4,16:1 (texte secondaire sur fond sable). | CORRIGÉ | ink-600 (≈ 4,9:1). axe-core : 24/24. |
| V-17 | P2 | Tableaux défilants inaccessibles au clavier. | CORRIGÉ | `tabIndex`, région nommée, focus visible. |
| R-01 | P1 | Jetons de session stockés en clair (`access_session.session_id`). Une fuite de la base permet de détourner des sessions. | RÉSIDUEL | Plan : colonne `token_hash` (SHA-256) et recherche par empreinte ; double lecture pendant une durée de session (12 h), puis abandon de la colonne en clair. |
| R-02 | P1 | Tables « vie privée » sans RLS (`personal_consent`, `data_erasure_tombstone`, `restore_point`, `processing_record`, `legal_notice`), `pilot_risk` et `"group"`. Exposées uniquement en cas d'injection SQL, l'API étant paramétrée partout. | RÉSIDUEL | Le magasin `PgPrivacyStore` doit d'abord ouvrir un contexte de session (`inTx` + `kombe.identity_id`), puis il faut une migration de politiques. |
| R-03 | P1 | Le pooler Neon (PgBouncer) est incompatible avec l'option de démarrage `role`. Les connexions directes sont plafonnées par le calcul Neon. | **CORRIGÉ (code) · PROPRIÉTAIRE (bascule)** | Rôle `kombe_api` (0039) et garde de moindre privilège (ADR-0045). Preuves : 27/27 via PgBouncer en mode transaction, charge 407 req/s avec 10 connexions serveur, répétition sur une copie Neon via `-pooler`. Bascule : voir 11. |
| R-04 | P2 | `/v1/me/tontines` : N+1 requêtes par groupe (≈ 60 ms p50 à 16 clients). | RÉSIDUEL | Résumé de groupe calculé en une requête (voir 09). |
| R-05 | P2 | Plan Vercel Hobby : une tâche planifiée par jour. Les messages différés (heures de silence, nouvelles tentatives) attendent cette tâche ou un appel externe. | RÉSIDUEL | Planificateur externe gratuit sur `/v1/internal/cron/notifications`, ou plan Pro. |
| R-06 | P2 | Pas de WebAuthn (le TOTP est retenu pour les opérateurs). | RÉSIDUEL | WebAuthn en second facteur optionnel quand des clés matérielles seront distribuées. |
| R-07 | P2 | Le push Web (VAPID) de la PWA n'est pas fait ; l'application mobile n'enregistre pas encore son jeton FCM. | PROPRIÉTAIRE puis code | Projet Firebase et `google-services.json`, puis intégration de `firebase_messaging`. |
| O-01 | — | `KOMBE_MFA_KEY` et `KOMBE_TOKEN_PEPPER` absents en production : le build refuse le déploiement. | PROPRIÉTAIRE | Voir 11, étape 1. |
| O-02 | — | 0 opérateur en production : les consoles sont inaccessibles. | PROPRIÉTAIRE | `grant-operator.mjs` (voir 11). |
