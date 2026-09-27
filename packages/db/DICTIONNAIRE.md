# Dictionnaire de données — `@kombe/db` (C00 socle + C01 gouvernance)

Registre de tontines fermées. Toutes les tables métier portent `group_id` ; les
relations composées sont `UNIQUE`/`FK` sur `(group_id, id)` (isolation
structurelle, cf. ADR-0007). Montants : domaine `kombe_money` = `bigint` borné
`[0, 1_000_000_000]`, jamais de `FLOAT` (ADR-0002). RLS `tenant_isolation` via
`current_setting('kombe.group_id', true)` (SET LOCAL par transaction).

## Socle (migration `0001_init.sql`)
| Table | Rôle | Clés / contraintes clés |
|---|---|---|
| `identity` | Identité globale, indépendante des groupes. | PK `identity_id` |
| `group` | Groupe de tontine (locataire). | PK `group_id` ; `state` ∈ configuration/active/paused/closed ; `version ≥ 1` |
| `membership` | Adhésion d'une identité à un groupe. | PK `membership_id` ; `UNIQUE(group_id, membership_id)` ; **une adhésion active** par (groupe, identité) via `active_marker` généré + `UNIQUE` ; `state` ∈ pending/active/departed/revoked |
| `role_assignment` | Rôle attribué dans un groupe ; accepté avant activation. | PK ; FK composite `(group_id, membership_id)` ; `role` ∈ animator/treasurer/secretary/auditor/member ; `accepted_at` |
| `rule_version` | Instantané **immuable** des règles. | PK `(group_id, rules_version)` ; `snapshot` jsonb canonique |
| `rules_acceptance` | Acceptation des règles par une identité. | PK `(group_id, identity_id, rules_version)` ; FK composite vers `rule_version` |
| `round` | Tour de rotation. | PK ; `UNIQUE(group_id, round_id)` ; `UNIQUE(group_id, seq)` ; `seq ≥ 1` |
| `obligation` | Dette de cotisation d'un membre pour un tour. | `due_amount`/`validated_net`/`active_reserved` kombe_money ; **`validated_net ≤ active_reserved ≤ due_amount`** (cohérence sous verrou) ; `version ≥ 1` |
| `contribution` | Cotisation déclarée sur une obligation. | FK composite `(group_id, obligation_id)` ; `state` ∈ declared/validated/rejected/compensated |
| `validation` | Validation d'une contribution **par rôle**. | PK `(contribution_id, role)` — une seule par rôle ; `role` ∈ animator/treasurer/secretary/auditor |
| `disbursement` | Décaissement d'un tour. | `state` ∈ requested/reversal_requested/reversed/completed |
| `vote` | Vote avec **électeurs figés** à l'ouverture. | `electorate_size ≥ 1` ; `quorum_num ≤ quorum_den` ; `frozen_electors bigint[]` |
| `ballot` | Bulletin d'un électeur. | PK `(vote_id, identity_id)` — un bulletin par électeur ; `choice` ∈ yes/no/abstain |
| `dispute` | Litige. | `state` ∈ open/resolved/reopened |
| `journal` | Journal **append-only** (chaîne de hash, genèse = 64 zéros). | PK `(group_id, seq)` ; `hash`/`previous_hash` ~ `^[0-9a-f]{64}$` |
| `command` | Registre d'**idempotence** des commandes. | `idempotency_key` UNIQUE ; `status` ∈ queued/applied/rejected/conflict |
| `outbox` | **Outbox transactionnelle** (effets externes différés). | FK `command_id` ; `processed_at`nullable |

## Gouvernance A19 (migration additive `0002_role_change.sql`)
| Table | Rôle | Clés / contraintes clés |
|---|---|---|
| `role_change_request` | Circuit nomination → acceptation → **approbation distincte**. | PK `request_id` ; FK composite `(group_id, target_membership_id)` ; `state` ∈ nominated/accepted/declined/approved/rejected ; **`approved_by ≠ proposed_by`** (CHECK) ; distinction avec le nommé + acceptation par la cible = contrôle serveur (`assertApproverDistinct`/`acceptNomination`) |
| `export_request` | Demande d'export **privé** (traçabilité, jamais public). | PK `export_id` ; `scope` = `private` (seule valeur) ; `state` ∈ requested/delivered/revoked |

## Provisionnement (`provision/roles.sql`)
| Rôle | Privilèges | But |
|---|---|---|
| `kombe_migrateur` | DDL, propriétaire du schéma | Appliquer migrations up/down |
| `kombe_app` | DML seulement, **non-owner**, **sans BYPASSRLS**, NOLOGIN | RLS effective côté applicatif |
| `kombe_worker` | SELECT/UPDATE sur `outbox` + `command` | Consommation d'outbox minimale |

> Aucun secret de service-role exposé au navigateur : le navigateur ne parle
> qu'à l'API, qui ouvre des transactions PostgreSQL sous `kombe_app` avec un
> `kombe.group_id` dérivé **côté serveur** de la session (jamais fourni par le client).

## Statut d'exécution
Ce dictionnaire décrit un **contrat**, pas une base déployée. L'application du
schéma et les preuves (RLS effective, verrous, isolation de pool, FK croisées)
sont le **lot C01 d'exécution** sur PostgreSQL 16+ réel
(`tests/isolation.pg.mjs`), **BLOCKED** sur un hôte sans base.
