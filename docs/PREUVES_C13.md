# Preuves et livraison — C13 : outbox et notifications internes

- **Code :** `e00f93d66170385c8c552b757702754931e717a6` ; base réelle inspectée : `6a297bc20655d1ba04bfaeba0c82f353475dfe2d` (contient C09 `a616ee9`).
- **Auteur :** codex, identité déclarative `codex:pending` ; destinataire de revue : qoder.
- **État :** `in_review`, jamais `done` ; aucune signature indépendante encore obtenue.
- **Porte / stories :** G0 ; 11.1, 11.4, 18.6 ; dépendances C01/C11.
- **Environnement réellement exécuté :** Node v24.19.0, pnpm 11.25.0, Python 3 ; Linux. Lockfile inchangé, installation `--frozen-lockfile --ignore-scripts`. Aucun message réel, réseau prestataire, achat ou transfert.

## Inspecter

Mission `KOMBE_Audit_Construction/03_Prompts/C13_PROMPT.md`, ADR 0002–0007, 0016/0017, STACK, journal C11, store/test C08 et registre de coordination inspectés. Le worker initial ne proposait que `processOutbox`, qui retournait `blocked`. La première commande de recette C13 a échoué (exit 1, module compilé absent : `ERR_MODULE_NOT_FOUND`). Ce défaut d'exécutabilité est archivé ci-dessous ; **ce n'est pas une reproduction d'une double distribution en base**. La reproduction de concurrence/atomicité reste BLOCKED et la recette PostgreSQL l'éprouve avant livraison opérationnelle.

Base de test : `KOMBE_TEST_DATABASE_URL` absente. Pas de preuve PostgreSQL obtenue. Les stores API existants sont fictifs : leur écriture en mémoire n'active pas le trigger PostgreSQL. Aucun raccord API réel n'est prétendu ici.

## Contractualiser

- `outbox.ts` : décisions pures de dispatch/backoff et référence SHA-256 RFC 8785 via `canonicalHash` existant. Contrat historique conservé : `processOutbox` reste honnêtement bloqué ; utiliser `PgOutboxWorker`.
- `0013_outbox.sql` : additive ; `AFTER INSERT journal` pour une liste explicite d'événements publics de cotisation, décaissement et proposition. Notification interne, commande technique et tâches outbox créées **dans la transaction de l'INSERT journal**. Le journal et sa fonction append-only C11 ne sont pas réécrits. Les événements privés et inconnus ne produisent pas de notification ; aucun payload financier n'est copié.
- Notification interne persistée immédiatement, indépendante du push. `UNIQUE(event_ref,recipient,channel,notification_type)` sur outbox ; clé de notification interne ; FK composites incluant hash du journal et groupe de la trace.
- Lease 30 s, `SKIP LOCKED`, jeton UUID propre à chaque prise, contrôle du jeton/échéance à la finalisation. Durées SQL : verrou 2 s, requête 10 s, session inactive en transaction 10 s ; prestataire 5 s avec abort. Aucun lease mémorisé comme preuve en dehors de la base.
- Maximum 5 prises par cycle, backoff exponentiel avec jitter injecté ; dead-letter durable et traces immuables. Une tâche expirée est terminale ; une suspension consomme un budget borné et n'affecte jamais la notification interne.
- TTL serveur : interne 7 jours, push 1 jour ; interne persistée conservée après expiration de sa tâche. Push suspendu par défaut, opt-in absent = refus. Seul le provisionneur de confiance configure préférences/canaux ; aucune route de mutation des préférences livrée dans ce lot.
- Droits relus au dispatch : compte actif/vérifié, blocage de récupération, adhésion active, préférence et suspension. Verrous `FOR SHARE` via fonctions SECURITY DEFINER à `search_path` fixe et sortie minimale, EXECUTE révoqué à PUBLIC ; aucun droit UPDATE sur adhésions/préférences au worker. Le propriétaire migrateur doit rester distinct des rôles applicatifs/worker.
- Acceptation sans réponse / crash / lease récupéré : trace `ambiguous`, reprise possible avec **la même référence canonique**. Le simulateur consommateur déduplique ; le fournisseur réel doit respecter cette référence. Aucune garantie exactly-once externe.
- Texte push strictement générique. Aucun montant interne copié (donc aucun float ou chaîne monétaire à transporter), aucun message d'erreur brut du prestataire stocké ou journalisé.
- Relecture `replay` : secrétaire/auditeur actif, quota **3 reprises à vie par tâche**, uniquement dead-letter non expirée, audit atomique. Le quota ne se réinitialise pas avec les tentatives.
- `readInternal` : synchronisation par destinataire serveur, droits relus, pages de 100 avec curseur scoped ; `readDelivery` : trace administrative minimale. Interfaces de store seulement, **aucune route HTTP** ni changement OpenAPI/API/domaine.
- Erreurs DomainError existantes : `JOUR_INVALIDE`, `RESERVATION_INCOHERENTE`, `PRIVILEGE_NOT_GRANTED`, `TOKEN_EXPIRED`, `CHANNEL_NOT_VERIFIED`. SQL interne converti en erreur générique ; aucune nouvelle erreur partagée imposée.

## Construire et tester — commandes réellement exécutées

| Commande | Exit | Résultat |
|---|---:|---|
| `pnpm -r build` | 0 | domaine/API construits ; le package worker sans scripts est ignoré par cette commande |
| `pnpm -r test` | 0 | domaine **256**, API **144** ; aucune désactivation |
| `node packages/worker/test/build.mjs` | 0 | compilation worker TS strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess, déclarations |
| `node --test --test-isolation=none packages/worker/test/outbox.test.mjs` | 0 | **10 tests PASS**, décisions pures et faux prestataire uniquement |
| `node --check packages/worker/test/postgres.mjs` | 0 | syntaxe uniquement, aucune observation PostgreSQL |
| `node --check packages/db/tests/isolation.pg.mjs` | 0 | syntaxe uniquement |
| `node packages/db/tests/isolation.pg.mjs` | 2 | BLOCKED : URL PostgreSQL absente |
| `python COORDINATION_MULTI_HARNESS/verifier_coordination.py` | 0 | PASS avant code ; relancé après rédaction de la livraison |
| `python harness/run_h00.py --commit e00f93d66170385c8c552b757702754931e717a6 --out harness/reports/RAPPORT_G_CONSTRUCTION.json` | 2 | **11 PASS / 0 FAIL / 9 BLOCKED**, 0 NOT_RUN |
| `git diff --check` | 0 | aucun défaut d'espacement |

Le runner Node isolé par processus (`node --test` sans option) a initialement échoué dans cet environnement. Le mode `--test-isolation=none` a exécuté toutes les assertions. Deux assertions initiales comparaient un code DomainError à son texte : elles ont été corrigées pour comparer **e.code**, puis la suite complète exécutée (10/10). Aucun test existant retiré.

Extrait réel du résultat worker :
```
ℹ tests 10
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
Extrait réel PostgreSQL :
```
{"status":"BLOCKED","reason":"KOMBE_TEST_DATABASE_URL absente : aucune base PostgreSQL de test joignable sur cet hôte.","exitCode":2}
```

## Éprouver — couverture et limites

| Scénario | Action / observation | Statut réel |
|---|---|---|
| C13-OPT_OUT pur | décision externe `suppressed` quand le consentement relu est false | PASS, décision pure uniquement |
| révocation, TTL, suspension | refus stables ; l'interne ne dépend pas de suspension externe | PASS, pur |
| backoff/jitter/budget | bornes et terminal dead après cinquième prise | PASS, pur |
| crash après acceptation du simulateur | erreur stable, reprise même idempotencyRef, une acceptation consommateur | PASS, frontière externe fictive |
| contenu financier push | simulateur refuse une substitution contenant un montant avant acceptation | PASS, frontière fictive |
| C13-WORKERS | deux vrais workers sur une unique tâche interne, PK refuse duplicat ; count = 1 | BLOCKED PostgreSQL |
| C13-FAIL | journal de validation conservé, replay net inchangé, interne accessible, externe indisponible | BLOCKED PostgreSQL |
| C13-OPT_OUT intégré | preference changée après enqueue ; worker relit ; aucune acceptation | BLOCKED PostgreSQL |
| C13-ROLLBACK | journal/outbox/interne avant INSERT puis rollback : compteurs identiques | BLOCKED PostgreSQL |
| C13-LEASE | expiration, nouvelle prise, ancien jeton ne produit aucune écriture | BLOCKED PostgreSQL |
| C13-AMBIGUOUS intégré | statut durable ambigu, puis référence identique au rejeu du consommateur | BLOCKED PostgreSQL |
| C13-DEAD/replay | cinq tentatives, dead-letter, autorisation et quota, refus sans trace nouvelle | BLOCKED PostgreSQL |
| révocation/autre groupe | lecture vide et compteur de traces inchangé | BLOCKED PostgreSQL |

`worker/test/postgres.mjs` contient ces recettes avec Pool pg réel et requêtes de contrôle indépendantes. `isolation.pg.mjs` les appelle avant de rendre son résultat : assertion échouée = exit 1. Il applique explicitement 0013 up, 0013 down en ordre inverse et conserve roles.sql **après** toutes les migrations. Aucun mock de pool, transaction, lease ou unicité.

## Revue

Auto-revue technique, **pas** une revue indépendante : types d'événements alignés avec `disbursement.requested` du store C08 ; refus compte suspendu/fermé et recovery lock ; correction des CHECK SQL pour interdire notification_type NULL et lease partiel ; FK groupe/hash ; absence de droits UPDATE des adhésions ; curseur pour synchronisation au-delà de 100 notifications ; limite du prestataire et session inactive en transaction. Tests purs et compilation worker relancés après les corrections. Diff nul sur paquets API/domaine, audit source et code contrôleur depuis la base. Seul le rapport H00 généré change sous harness/.

**Revue indépendante : EN ATTENTE qoder.** L'identité `codex:pending` reste déclarative ; aucune authentification de provenance prétendue.

## Migration / retour arrière

Appliquer après 0012 avec le rôle migrateur propriétaire. 0013 reprend les lignes existantes comme `legacy` et ne les envoie pas. Le worker traite un groupe par transaction sous kombe_worker avec RLS ; la liste de groupes provient d'une configuration d'ordonnanceur serveur, jamais d'une liste client. Les fonctions SECURITY DEFINER et grants demandent une revue DBA avant activation.

Le down retire les objets C13 et les lignes outbox C13. **Il détruit leurs traces et notifications** : arrêter les workers, exporter/archiver ces données et contrôler la sauvegarde avant retour arrière. Il ne retire pas les événements journal ni les commandes techniques historiques. Up/down et restauration non exécutés sans PostgreSQL. Les défauts du runner PostgreSQL antérieur (initialisation/down exigeant un schéma précédent, éventuels SET LOCAL paramétrés) ne sont pas corrigés hors périmètre ; ils peuvent nécessiter un suivi C01 lors du premier raccord.

## Rapport H00

SHA **e00f93d66170385c8c552b757702754931e717a6** ; état BLOCKED, 11 PASS / 0 FAIL / 9 BLOCKED : H03/H06/H07/H09/H10/H13/H14/H18/H20. Les PASS concernent le témoin et les contrôles H00 : **ils ne valident pas le worker métier**. Rapport généré : `harness/reports/RAPPORT_G_CONSTRUCTION.json`.

## Défauts restants / raccords proposés

1. **PostgreSQL 16+ réel + pilote pg** dans l'environnement db, avec rôle migrateur pouvant provisionner et SET ROLE kombe_worker : lever la preuve C13 et revoir up/down/RLS/SECURITY DEFINER. Aucune prétention de release/pilote.
2. **API de production C01/C11** : les stores actuels en mémoire ne déclenchent pas SQL ; brancher leur append réel au journal PostgreSQL. Aucun paquet d'autrui modifié.
3. **Scripts package worker** : proposer séparément build/test/main et runtime pg épinglé. Le périmètre imposé n'autorisait pas package.json/lockfile. Jusqu'alors le build/test explicite ci-dessus est obligatoire ; pnpm seul ne couvre pas le worker.
4. **Préférences/canaux** : interfaces authentifiées à livrer côté propriétaire API/C17, pour retirer le consentement en production ; seul le provisionneur fiable peut modifier ces tables actuellement.
5. **C17/C29** : ordonnanceur de groupes, observabilité sur traces minimales, rétention/archivage, fournisseur push sandbox et tests timeouts/crash de processus réel. Aucun fournisseur live, daemon ou UI push installé par C13.
6. **ADR-0008** encore proposé dans l'index : décision formelle et revue des privilèges à demander au propriétaire de l'ADR, hors périmètre. Contrat technique détaillé ici, pas d'adoption auto-signée.
7. Revue qoder et CI protégée C28 pour indépendance et provenance. **Publication distante BLOCKED** : `git push origin master` exécuté, exit 128 ; après accès réseau autorisé, erreur réelle `could not read Username for https://github.com: No such device or address`. Aucun identifiant GitHub disponible, aucun push réalisé. Livraison autonome par bundle Git et patch ; les deux commits restent locaux et la coordination distante est donc encore inchangée.

## Reproduction

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm -r build
pnpm -r test
node packages/worker/test/build.mjs
node --test --test-isolation=none packages/worker/test/outbox.test.mjs
node --check packages/db/tests/isolation.pg.mjs
node packages/db/tests/isolation.pg.mjs
python harness/run_h00.py --commit e00f93d66170385c8c552b757702754931e717a6 --out harness/reports/RAPPORT_G_CONSTRUCTION.json
python COORDINATION_MULTI_HARNESS/verifier_coordination.py
```
PostgreSQL exige une **base de recette fictive dédiée** : le runner réinitialise son schéma. Sans URL, exit 2 attendu et consigné. Node 22 supportant l'option d'isolation de tests ou Node 24 ; compiler le worker avant la recette db (import de dist). Jamais sur base réelle d'utilisateurs.

## SHA-256 des artefacts

| SHA-256 | Fichier |
|---|---|
| `31f43357ac77eda74107284df5557626ae9648e5dfaeffa490729975b9ffd375` | `packages/worker/src/outbox.ts` |
| `321b52fb5484bc456ff5eae51c422019b6affb59e7e2c72c882bbde146753f7d` | `packages/worker/src/pgWorker.ts` |
| `9999a39462c399c70c64505446854867066903d3bf35618e632be371363f18e1` | `packages/worker/src/simulator.ts` |
| `d977154be1b889c5fb911b1f8705f74059e90cab323f0435a204af8cbf8eba95` | `packages/worker/test/build.mjs` |
| `0f9b21e3abf568f50649cfe58f4c0ab97a103e672aed0acbc28404d621929e98` | `packages/worker/test/outbox.test.mjs` |
| `df7938fc95d0d10a6a0752bde57893779be76c808912e23c8a33c8106ea848e0` | `packages/worker/test/postgres.mjs` |
| `d5773827a323a5e0ff0fc35a5e3d6a1544c96e34c4e1cc95d7e192feb81afdba` | `packages/db/migrations/0013_outbox.sql` |
| `dc5b24103e6d5dbf38d3eeae1d743a96bfb38a1f0fccd94e2e72f4746ae135e7` | `packages/db/migrations/0013_outbox.down.sql` |
| `7894834afd461fff58c2bdf72400994ae9d59d5f5724421b256d090464c3d44b` | `packages/db/tests/isolation.pg.mjs` |
| `e0433a6d5e37aad8d022da2a3f2222d4c86c6e31a266372d2c10e5f3a4ba72b2` | `harness/reports/RAPPORT_G_CONSTRUCTION.json` |
