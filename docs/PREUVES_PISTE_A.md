# Preuves & revue — Piste A (persistance applicative, préprod) · KÓMBE

- **Commit de base (HEAD au moment du travail) :** `48dea6ee380cff6dd8838cdc55b92732f663e11a`
- **Harnais producteur :** `claude-code` (préprod, hors gouvernance de lot H06 — pas de `done` auto-signé ; code produit soumis à relecture comme tout autre producteur)
- **Objet :** Piste A du `PROMPT_CLAUDE_MASTER_PREPROD.md` — « rendre le registre persistant », sous-tâches A1 (stores réels), A2 (session/RLS par requête), A3 (migrate connecté au bon rôle), A4 (preuve).
- **Date :** 2026-10-06
- **Environnement :** Node ≥22, pnpm 11. **Neon réel** (projet `square-resonance-19892972`, nom `kombe`) via une branche **jetable** créée pour cette session : `preview-piste-a-claude` (`br-wild-sunset-b10uf45r`, parent `production`/`br-red-river-b1ymeb4o`). Aucune exécution contre `production`.
- **Statut :** incrément réel livré pour **un** store (contribution, C06) ; **pas** un remplacement complet de la persistance applicative (voir §6 Limites).

## 1. Inspecter (état de départ réel, pas présumé)

- `packages/api` n'a **aucune** dépendance `pg` avant ce travail (`grep -rl "from 'pg'" packages/api/src` = vide) ; les 14 stores (`accessStore.ts`, `contributionStore.ts`, `disbursementStore.ts`, …) sont tous des `Map` en mémoire. Convertir les 14 est un chantier de plusieurs jours testés réellement, pas une passe mécanique — **non prétendu complet ici**.
- `packages/api/src/server.ts:222-227` (`actorFrom`) résout identité/rôle/groupes en **parsant un en-tête JSON fourni par le client** (`x-actor`), sans aucune vérification serveur. C'est le véritable obstacle d'A2 (pas un simple `SET LOCAL` manquant) : une session réelle doit remplacer ce parsing par une résolution base réelle, et ce pattern se répète sur ~toutes les routes métier (`ctxFrom`, `declareCtxFrom`, etc.). **Non traité dans cet incrément** — consigné comme prochaine étape (§8).
- RLS `tenant_isolation` sur `obligation`/`contribution`/`journal` (`packages/db/migrations/0001_init.sql:203-227`) filtre sur `current_setting('kombe.group_id', true)` **avant** toute lecture : le groupe doit être connu **avant** la première requête, pas déduit après coup. La route `POST /v1/groups/:groupId/declarations` (`server.ts:929`) porte déjà `groupId` dans l'URL.
- `DEPLOY.md` §5 affirme que `migrate` connecté en superutilisateur casse les GRANT futurs de `kombe_app`. Lecture du code actuel (`packages/db/provision/roles.sql:38-47`, ajouté au commit `50ce36d` lors du câblage Neon H07) montre un correctif déjà en place : `ALTER DEFAULT PRIVILEGES` échoue proprement sur Neon (`insufficient_privilege` intercepté) et retombe sur un `GRANT ... ON ALL TABLES IN SCHEMA public TO kombe_app` **après** toutes les migrations — peu importe quel rôle a créé les tables. **`DEPLOY.md` est obsolète sur ce point** (écart signalé, §7).
- Mécanisme RÉEL déjà prouvé à réutiliser tel quel : `packages/worker/src/pgWorker.ts` (`transaction()`, H07 PASS) pour le motif transactionnel, et `packages/db/tests/isolation.pg.mjs:177-180` (`options: "-c role=kombe_app"`) pour l'assomption de rôle au niveau connexion — repris ici à l'identique, pas réinventé.

## 2. Contractualiser

- **Nouveaux modules** (`packages/api/src/db/`) :
  - `pgPool.ts` — `createApiPool()` : `pg.Pool` avec `options: "-c role=kombe_app"` (rôle assumé dès la connexion, jamais `SET ROLE` par requête) ; `readApiDatabaseUrl()` lit `KOMBE_API_DATABASE_URL`, `undefined` si absente (jamais un pool fictif silencieux).
  - `txContext.ts` — `withGroupTx(pool, groupId, fn)` : reproduit `pgWorker.ts.transaction()` (BEGIN, `set_config('kombe.group_id', $1, true)`, délais bornés, COMMIT/ROLLBACK) ; `lockGroupForJournalWrite(client, groupId)` : `pg_advisory_xact_lock(hashtext(groupId))`, appelé explicitement par les écritures journal (jamais dans `withGroupTx` lui-même, pour ne pas sérialiser les lectures pures contre les écritures).
  - `pgContributionStore.ts` — `PgContributionStore` : même surface que `FictitiousContributionStore` (`declare`, `saveDraft`, `view`, `declaredEventCount`), **sauf** `groupId` explicite en premier paramètre de `declare`/`view`/`declaredEventCount` (RLS l'exige avant lecture — changement d'interface **assumé**, voir §6).
- **Aucune règle métier déplacée** : hash de corps (`contributionBodyHash`), décision rejeu/conflit (`decideIdempotency`), réservation sous capacité (`reserveObligation`), validation (`validateDeclaration`), scellement (`sealEventV1`) restent les fonctions pures de `@kombe/domain`, importées à l'identique. Ce fichier ne fait que les exécuter contre des lignes Postgres réelles sous verrou, au lieu de `Map`.
- **Verrouillage** : `SELECT ... FOR UPDATE` sur l'obligation ciblée (sérialise deux déclarations concurrentes sur LA MÊME obligation) + verrou advisory group-level pour l'assignation du `seq` journal (protège deux obligations DIFFÉRENTES du même groupe — `journal` n'a pas de compteur dédié).
- **Dépendance ajoutée** : `pg` (`^8.13.1`, déjà la version utilisée par `@kombe/db`) + `@types/pg` dans `packages/api/package.json` (`dependencies`, pas `devDependencies` : le serveur en a besoin à l'exécution).
- **Limite documentée (non cachée)** : `idempotency_registry.command_id` (FK vers `command`) est laissé `NULL` — le peupler exigerait d'insérer aussi dans `command`, dont `idempotency_key` est **UNIQUE globalement** (pas scopé acteur/groupe/type comme `idempotency_registry` l'est pour C06), un risque de collision hors du périmètre de cet incrément. Le rejeu reconstruit `commandId` depuis la requête **courante**, pas une valeur relue en base ; avec le défaut client (`commandId` dérivé de la clé d'idempotence), c'est déjà identique octet pour octet.

## 3. Construire & tester (commandes RÉELLEMENT exécutées)

```
pnpm install                 → exit 0 (pg@8.23.0 résolu pour @kombe/api)
pnpm -r build                → exit 0 (packages/api/dist/db/{pgPool,txContext,pgContributionStore}.js générés)
pnpm -r typecheck            → exit 0
pnpm -r test                 → exit 0 (597+ tests, AUCUNE régression — contributionStore.ts/server.ts non touchés)
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   → PASS, exit 0
```

Aucun test existant modifié ni désactivé. `FictitiousContributionStore` et ses 10 tests domaine / API restent inchangés et verts.

## 4. Éprouver — preuve base réelle (Neon, branche jetable `preview-piste-a-claude`)

Script dédié, **pas vitest/mock** : `packages/api/test/pgContributionStore.proof.mjs`. Reconstruit son propre schéma (même ordre DOWN/UP que `isolation.pg.mjs`), insère deux obligations fictives dans deux groupes distincts, puis exerce `PgContributionStore` contre de VRAIES transactions :

```
KOMBE_API_DATABASE_URL=postgresql://neondb_owner:***@ep-dry-wildflower-b19ptfwl.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require \
  node packages/api/test/pgContributionStore.proof.mjs
→ exit 0
```

| ID | Attendu | Obtenu (réel) |
|---|---|---|
| **A1-DECLARE** | déclaration appliquée, `availableToDeclare = 2000` (5000 dû − 3000 réservé) | `status=applied, remainingDue=5000, availableToDeclare=2000` ✅ |
| **A1-REPLAY** | même clé/corps → `duplicate`, **aucun** second événement journal | `status=duplicate, countAfterFirst=1, countAfterReplay=1` ✅ |
| **A1-CONFLICT** | même clé, corps différent → `IDEMPOTENCY_BODY_CONFLICT` | `conflictCode=IDEMPOTENCY_BODY_CONFLICT` ✅ |
| **A1-EXCESS** | dépassement de capacité → refusé, **aucune** écriture | `excessCode=CONTRIBUTION_EXCEEDS_REMAINING, countBeforeExcess=1, countAfterExcess=1` ✅ |
| **A1-CROSSGRP** | transaction scopée groupe B ne voit **pas** l'obligation du groupe A (RLS, pas une vérification applicative seule) | `crossGroupCode=RESERVATION_INCOHERENTE` ✅ |
| **A1-RESTART** | un **nouveau** `Pool` (processus « redémarré ») relit la donnée committée par le précédent | `activeReserved=3000, contributionCount=1, count2=1` (identique à avant redémarrage) ✅ |

Ce dernier scénario (A1-RESTART) répond directement au constat `DEPLOY.md` : « l'état se réinitialise au redémarrage » — **n'est plus vrai pour ce store**, démontré par une seconde connexion indépendante, pas par un redémarrage simulé.

**A3 re-vérifié indépendamment**, pas seulement relu dans l'historique : avant ce test, `node packages/db/tests/isolation.pg.mjs` a été exécuté sur la même branche jetable (fraîchement rebuild down→up par le script lui-même) → `exitCode: 0`, scénarios C06/C07/C10/C11/C13 tous conformes (ex. `C06_RACE.accepted_total=3000`, `C06_REPLAY.contribution_count=1`). Confirme que `provision/roles.sql` (déjà en l'état depuis `50ce36d`) suffit sur Neon sans changement supplémentaire — `DEPLOY.md` §5 est obsolète sur ce point précis.

## 5. Revue (auto-relecture avant livraison — pas un `done` H06)

Deux bugs réels trouvés et corrigés **pendant** cette session, par exécution réelle (pas de simulation) :
- Script de preuve : `import()` avec chemin Windows brut → `ERR_INVALID_ARG_VALUE` (ESM exige une URL `file://` sur Windows). Corrigé avec `pathToFileURL`.
- `.catch(() => {})` ajouté par excès de prudence autour des DOWN-migrations → avalait une erreur réelle sans `ROLLBACK`, laissait la session Postgres dans `current transaction is aborted` pour tout le reste du script. Retiré ; le script suit maintenant `isolation.pg.mjs` à l'identique (aucune capture silencieuse).
- `JSON.stringify(event)` sur le payload journal → `TypeError: Do not know how to serialize a BigInt` (montant XAF entier, ADR-0002). Corrigé par un replacer dédié (`jsonSafe`), appliqué **après** le calcul du hash canonique (`sealEventV1`), donc sans impact sur l'empreinte.

## 6. Limites assumées (ce que cet incrément NE fait PAS)

- **13 des 14 stores restent fictifs** (`accessStore`, `disbursementStore`, `proposalStore`, `privacyStore`, `supportStore`, `metricsStore`, `exportStore`, `disputeStore`, `validationStore`, `rulesStore`, `scheduleStore`, `journalStore`, `governanceStore`). Chacun a ses propres invariants transactionnels ; les convertir exige le même niveau de preuve réelle, pas une passe mécanique.
- **Non câblé à `server.ts`/HTTP.** `PgContributionStore` exige `groupId` en paramètre explicite (RLS), alors que `FictitiousContributionStore` ne l'a pas — les unifier correctement implique de changer la signature du store fictif ET ses appelants (`server.ts:940,970,976`), ce qui touche des tests existants. **Volontairement non fait ici** pour zéro risque de régression sur les 597 tests verts ; c'est la prochaine étape logique avant un bascule par variable d'environnement (`KOMBE_API_DATABASE_URL` présente ⇒ `PgContributionStore`, absente ⇒ `FictitiousContributionStore`).
- **A2 (session réelle) non traité.** `actorFrom`/`ctxFrom`/`declareCtxFrom` continuent de faire confiance à l'en-tête `x-actor` fourni par le client. C'est un chantier séparé et plus large (résolution session → base réelle, sur ~toutes les routes), identifié précisément (§1) mais pas résous ici.
- **`idempotency_registry.command_id` reste `NULL`** (voir §2) — limitation documentée, pas cachée.
- **Piste B/C/D** (porte H00, trio d'hébergement, G0) **non abordées** dans cet incrément — hors périmètre d'A1/A3 tel que livré ici.
- **Contrôleur de recette non touché.** Aucun fichier de `harness/`, `verifier_coordination.py`, `MESSAGES.schema.json` modifié ou commité.
- **Branche Neon jetable laissée en l'état** (`preview-piste-a-claude`, `br-wild-sunset-b10uf45r`) — suppression non effectuée unilatéralement (destructif), à la discrétion de l'opérateur.

## 7. Écarts signalés vs état de départ annoncé

- `DEPLOY.md` §5 (migrate superutilisateur casse les GRANT futurs) : **obsolète** depuis `50ce36d` — voir §1/§4. À corriger dans une future mise à jour de `DEPLOY.md` (non fait dans ce commit pour rester focalisé sur le code ; signalé ici pour que le lead/qoder le priorise).
- Le "Statut : EXÉCUTABLE MAINTENANT" du prompt maître pour Piste A supposait un accès Neon déjà configuré sur cet hôte ; il a fallu reconfigurer l'accès (CLI Neon authentifié, profil déjà présent mais non découvert initialement via le connecteur MCP scopé sur un compte sans rapport) avant de pouvoir produire une preuve réelle. Résolu dans cette session (branche jetable créée, testée, voir §4).

## 8. Prochaine dépendance (ordre recommandé)

1. Unifier l'interface `declare/view/declaredEventCount` (groupId explicite) sur `FictitiousContributionStore` **et** `PgContributionStore`, avec tests de non-régression sur les 10 tests existants, puis bascule `server.ts` par variable d'environnement.
2. Résoudre A2 : remplacer `actorFrom` par une résolution de session réelle (table `access_session`/`identity_access`, déjà posée par C02/migration 0003) — préalable à tout déploiement pilote.
3. Répéter le motif `withGroupTx`/`Pg<X>Store` pour les stores restants, un à la fois, chacun avec son propre script de preuve réelle (comme celui-ci), jamais un remplacement groupé non testé.
