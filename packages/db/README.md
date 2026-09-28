# `@kombe/db` — contrat de persistance PostgreSQL (C00)

**Statut C00 : CONTRAT posé, exécution `BLOCKED`.** Ce paquet fige le schéma
canonique du registre. Il **n'applique pas** le schéma et **ne simule aucune**
preuve base réelle : ces démonstrations (RLS effective, verrous, isolation de
pool, FK composites) sont le **lot C01** et exigent une **PostgreSQL 16+ réelle**.

## Règle maîtresse — jamais de mock de PostgreSQL
Le maître prompt et la méthode interdisent de mocker l'intérieur de la base pour
faire afficher un succès. Ici, aucune dépendance `pg`/Testcontainers n'est
raccordée et **aucun hôte PostgreSQL n'est disponible** sur cette machine. Les
scripts `migrate`/`seed`/`test:integration` sont donc des **porteurs d'état
honnêtes** qui sortent en `BLOCKED` (code **2**), jamais en faux PASS.

## Contenu
| Chemin | Rôle |
|---|---|
| `migrations/0001_init.sql` | Contrat de schéma : domaines, tables tenant-scope, **FK composites `(group_id, id)`**, contraintes d'unicité structurelle, **RLS** + politiques `tenant_isolation`. |
| `fixtures/fictitious.sql` | Données **fictives** seulement (aucune donnée réelle). |
| `scripts/blocked.mjs` | Renvoie `BLOCKED` (exit 2) avec l'intention de l'action demandée. |

## Invariants encodés dans le schéma (rappel)
- Montant : `kombe_money` = `bigint` borné `[0, 1_000_000_000]`, jamais de `FLOAT`
  (cf. ADR-0002). Plafond total d'entier sûr vérifié en domaine.
- Isolation structurelle : chaque table métier porte `group_id`, clés composites
  et RLS (cf. ADR-0007). Contexte posé par `SET LOCAL kombe.group_id`.
- Journal append-only : `journal(group_id, seq)` PK, `hash`/`previous_hash` en
  hexadécimal 64 (chaîne RFC 8785, genèse = 64 zéros, cf. ADR-0004).
- Unicité : une adhésion active par (groupe, identité), une validation par
  (contribution, rôle), un bulletin par (vote, identité).

## Commandes (comportement actuel sur cet hôte)
```bash
pnpm --filter @kombe/db migrate            # -> BLOCKED (exit 2) : aucune base
pnpm --filter @kombe/db seed               # -> BLOCKED (exit 2)
pnpm --filter @kombe/db test:integration   # -> BLOCKED (exit 2)
```
Convention de sortie alignée sur `04_Harness/` : **0** = succès réel, **1** = échec,
**2** = `BLOCKED` (dépendance indisponible).

## Ce que C01 devra prouver (base réelle via Testcontainers)
1. Application de `0001_init.sql` par un **rôle de migration dédié** (hors `kombe_app`).
2. **RLS effective** sur le rôle applicatif `kombe_app` (non-superuser, sans `BYPASSRLS`) :
   une session ne voit que les lignes de son `kombe.group_id`.
3. **Isolation de pool** : ≥ 100 requêtes A/B entremêlées sur des groupes distincts
   via un pool partagé, sans fuite grâce à `SET LOCAL` transactionnel.
4. **Verrous / atomicité** : `SELECT … FOR UPDATE` sur l'obligation sous le verdict,
   `lock_timeout`, cohérence `validated_net <= active_reserved <= due_amount`.
5. **Rejet des FK croisées** entre groupes (tentative de référence inter-tenant).
6. Rejeu des fixtures **fictives** puis tests d'intégration reproductibles.

Tant que PostgreSQL/ Testcontainers ne sont pas disponibles, le statut reste
`BLOCKED` — **documenté, jamais simulé** (cf. `docs/adr/0010_*.md`).

## C01 — gouvernance et preuves prêtes à l'emploi (contrat élargi)
Le lot C01 **élargit le contrat** et livre les **tests prêts à exécuter** ; leur
exécution réelle reste `BLOCKED` sans PostgreSQL.

| Chemin | Rôle (C01) |
|---|---|
| `migrations/0002_role_change.sql` | Migration **additive** : `role_change_request` (circuit A19), `export_request` (export privé), RLS. |
| `migrations/0002_role_change.down.sql` | **Retour arrière** de 0002 (drops en ordre inverse). |
| `migrations/0001_init.down.sql` | **Retour arrière** complet du socle (prérequis : down 0002 d'abord). |
| `provision/roles.sql` | Rôles distincts : `kombe_migrateur` (DDL), `kombe_app` (DML, non-owner, **sans BYPASSRLS**), `kombe_worker` (outbox). |
| `tests/isolation.pg.mjs` | Scénarios **C01-TENANT / C01-FK / C01-POOL** sur base réelle. Sort `BLOCKED` (2) sans `KOMBE_TEST_DATABASE_URL` ni pilote `pg`. |
| `DICTIONNAIRE.md` | Dictionnaire des tables, contraintes et rôles. |

**Stratégie de migration / retour / backfill.** Les migrations sont `BEGIN…COMMIT`
(enveloppes atomiques) avec `statement_timeout`/`lock_timeout`. 0002 est **purement
additive** (nouvelles tables) : pas de réécriture de lignes existantes, donc
rejouable après échec sans effet partiel. Un backfill futur (données du MVP non
réutilisées — D01) suivra le même patron up/down. Ordre de rollback : `0002…down`
puis `0001…down`.

**Reproduction (quand l'infra existe) :**
```bash
pnpm --filter @kombe/db migrate        # contrat ; BLOCKED (2) sans base
KOMBE_TEST_DATABASE_URL=postgresql://… node packages/db/tests/isolation.pg.mjs
   # attendu une fois la base réelle fournie :
   #   C01-TENANT.cross_group_rows = 0
   #   C01-FK.foreign_link_accepted = false
   #   C01-POOL.leaked_rows = 0        → status PASS, exit 0
```
Observations issues **d'actions/réquisitions réelles**, jamais de constantes lues
dans un fichier d'attentes (cf. `C01_PROMPT` §scénarios).

## C02 — accès des comptes (inscription, sessions, récupération)
Le lot C02 **ajoute** la persistance d'accès (tables **globales-identité**, hors
tenant) et les scénarios de preuve ; l'exécution réelle reste `BLOCKED`.

| Chemin | Rôle (C02) |
|---|---|
| `migrations/0003_access.sql` | Migration **additive** : `identity_access` (état, génération de sessions, MFA/opérateur, suspension), `verification_token` (usage unique + expiration, **empreinte** seulement), `access_session` (session liée à une génération). RLS **self-scope** (`kombe.identity_id`). |
| `migrations/0003_access.down.sql` | **Retour arrière** de 0003 (drops en ordre inverse). |
| `tests/isolation.pg.mjs` (étendu) | Scénarios **C02-RECOVERY** (double consommation refusée sous verrou), **C02-SESSION** (supplantation par génération), **C02-SELFSCOPE** (invisible hors identité). |

Unicité d'usage du jeton : `UPDATE … WHERE consumed_at IS NULL` sous verrou de
ligne + index partiel unique (un seul jeton actif par identité+finalité).
Révocation en cascade des sessions : la validité exige `access_session.generation
= identity_access.session_generation` ; la récupération incrémente la génération.
**Aucun secret en clair** (ni mot de passe, ni OTP) : uniquement des empreintes.
Ordre de rollback complet : `0004…down` → `0003…down` → `0002…down` → `0001…down`.

## C03 — gouvernance des groupes (cycle de vie, invitations)
Le lot C03 **élargit** le contrat : nouveaux états du groupe et table
d'invitations tenant-scope ; l'exécution réelle reste `BLOCKED`.

| Chemin | Rôle (C03) |
|---|---|
| `migrations/0004_group_governance.sql` | Migration **additive** : CHECK `group.state` élargie (`stopped_with_discrepancies`/`archived`, 2.7) + table `invitation` (bornée `max_uses`, expirante, révocable, 4.1) avec RLS `tenant_isolation`. |
| `migrations/0004_group_governance.down.sql` | **Retour arrière** de 0004 (drop `invitation`, repose la CHECK d'origine ; échoue sans perte si des groupes occupent un état ajouté). |
| `tests/isolation.pg.mjs` (étendu) | Scénarios **C03-STATE** (état élargi accepté), **C03-INVITE** (second usage d'une invitation `max_uses=1` refusé par la borne), **C03-TENANT** (invitation de A invisible au contexte de B). |

La **porte de démarrage du cycle** (fonctions indépendantes acceptées + règles
acceptées + suppléant nommé) et la **lecture seule** d'un groupe `closed`/
`archived` sont des **décisions serveur** (`packages/domain/src/group.ts`) ; la
base ne fait que borner les états et les usages, elle ne choisit pas la transition.

## C04 — moteur de règles (versions immuables, barre pilote)
Le lot C04 **renforce** `rule_version` / `rules_acceptance` sans les redéfinir ;
l'exécution réelle reste `BLOCKED`.

| Chemin | Rôle (C04) |
|---|---|
| `migrations/0005_rules_engine.sql` | Migration **additive** : `snapshot_hash` (empreinte 64-hex), `supersedes` (auto-FK), `published_at` ; **CHECK barre pilote** `snapshot->>'penaltyEnabled' = 'false'` ; **trigger d'immuabilité** `BEFORE UPDATE OR DELETE` ; `rules_acceptance.accepted_at NOT NULL`. |
| `migrations/0005_rules_engine.down.sql` | **Retour arrière** de 0005 (drop trigger/fonction/contraintes/colonnes, ordre inverse). |
| `tests/isolation.pg.mjs` (étendu) | Scénarios **C04-IMMUTABLE** (UPDATE de `rule_version` refusé par le déclencheur), **C04-PENALTY** (INSERT `penaltyEnabled=true` refusé par la CHECK). |

La **non-rétroactivité** des échéances passées et l'**effectivité** d'un engagement
essentiel (accord de tous les concernés) sont des **décisions serveur**
(`packages/domain/src/rules.ts`) ; la base ne scelle que l'immuabilité des versions
et la barre pilote sur les pénalités. Ordre de rollback complet : `0005…down` →
`0004…down` → `0003…down` → `0002…down` → `0001…down`.
