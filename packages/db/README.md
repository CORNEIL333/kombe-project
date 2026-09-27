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
