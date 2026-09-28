# Dictionnaire de données — `@kombe/db` (C00 socle + C01/C02/C03 gouvernance et accès)

Registre de tontines fermées. Toutes les tables métier portent `group_id` ; les
relations composées sont `UNIQUE`/`FK` sur `(group_id, id)` (isolation
structurelle, cf. ADR-0007). Montants : domaine `kombe_money` = `bigint` borné
`[0, 1_000_000_000]`, jamais de `FLOAT` (ADR-0002). RLS `tenant_isolation` via
`current_setting('kombe.group_id', true)` (SET LOCAL par transaction).

## Socle (migration `0001_init.sql`)
| Table | Rôle | Clés / contraintes clés |
|---|---|---|
| `identity` | Identité globale, indépendante des groupes. | PK `identity_id` |
| `group` | Groupe de tontine (locataire). | PK `group_id` ; `state` ∈ configuration/active/paused/closed (+ stopped_with_discrepancies/archived élargis par `0004`, cf. C03) ; `version ≥ 1` |
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

## Accès des comptes (migration additive `0003_access.sql`, lot C02)
Tables **globales-identité** (sans `group_id`) ; RLS **self-scope** via
`current_setting('kombe.identity_id', true)` (et non plus `kombe.group_id`).
Aucun secret en clair : uniquement des **empreintes** (`password_hash`,
`token_hash`).

| Table | Rôle | Clés / contraintes clés |
|---|---|---|
| `identity_access` | État d'accès global d'une identité (1.1,1.2,1.3,1.5). | PK `identity_id`→`identity` ; `state` ∈ pending_verification/active/suspended/closed ; `channel_verified`/`mfa_enrolled`/`is_operator` booléens ; **`session_generation ≥ 1`** (révocation en cascade) ; `recovery_lock_until` (suspension post-récupération) ; `password_hash` (jamais le mot de passe) |
| `verification_token` | Jeton de vérification **à usage unique et expirant** (1.1 inscription, 1.4 récupération). | PK `token_id` ; FK `identity_id` ; `purpose` ∈ registration/recovery ; `channel` ∈ email/phone ; `token_hash` (jamais le code) ; `expires_at > issued_at` ; **unicité d'usage** = `consumed_at` posé par `UPDATE … WHERE consumed_at IS NULL` sous verrou + **index partiel unique** `one_active_token_per_subject (identity_id, purpose) WHERE consumed_at IS NULL` |
| `access_session` | Session **révocable**, liée à une génération du compte (1.2). | PK `session_id` ; FK `identity_id` ; `generation ≥ 1` ; `expires_at > issued_at` ; `revoked_at` nullable ; valide ssi `generation = identity_access.session_generation` (jointure serveur) |

> Preuve **effective** (consommation unique sous verrou, supplantation de
> session par génération, self-scope RLS) = scénarios C02-RECOVERY / C02-SESSION
> / C02-SELFSCOPE de `tests/isolation.pg.mjs`, **BLOCKED** sans base réelle.

## Gouvernance des groupes (migration additive `0004_group_governance.sql`, lot C03)
Élargit les états du groupe (2.7) et pose les invitations (4.1). L'acceptation
des règles (4.2, `rules_acceptance`) et les rôles (4.4, `role_assignment`)
existent déjà dans le socle `0001` et ne sont pas redéfinis.

| Table | Rôle | Clés / contraintes clés |
|---|---|---|
| `invitation` | Lien d'adhésion **borné, expirant, révocable** (4.1) ; ne révèle aucune donnée métier. | PK `invitation_id` ; FK composite `UNIQUE(group_id, invitation_id)` ; `channel` ∈ link/whatsapp/email ; `max_uses ≥ 1` ; **`used_count ≤ max_uses`** (borne dure) ; `expires_at > issued_at` ; `revoked_at` nullable ; RLS `tenant_isolation` (porte `group_id`) |
| `group.state` (élargi) | Cycle de vie complet d'un groupe (2.7). | CHECK reposée : `configuration`/`active`/`paused`/`closed` **+ `stopped_with_discrepancies`/`archived`** ; transition et lecture seule d'un groupe clos/archivé = **décision serveur** (`packages/domain/src/group.ts`), la base ne choisit pas la transition |

> Preuve **effective** (état élargi accepté, second usage d'une invitation bornée
> refusé, invitation de A invisible au contexte de B) = scénarios C03-STATE /
> C03-INVITE / C03-TENANT de `tests/isolation.pg.mjs`, **BLOCKED** sans base réelle.

## Moteur de règles (migration additive `0005_rules_engine.sql`, lot C04)
Renforce `rule_version` / `rules_acceptance` (socle 0001) sans les redéfinir :
versions **immuables** scellées par empreinte canonique, chaînées, et barre
pilote sur les pénalités.

| Objet | Rôle | Clés / contraintes clés |
|---|---|---|
| `rule_version` (élargi) | Version horodatée et **immuable** des règles. | + `snapshot_hash` (~ `^[0-9a-f]{64}$`, posée par le serveur), `supersedes` (auto-FK composite `(group_id, supersedes)`), `published_at` |
| `rule_version_pilot_no_penalty` | Barre PILOTE en base (3.3, ADR-0005). | CHECK `snapshot->>'penaltyEnabled' = 'false'` : impossible de publier une version activant les pénalités au pilote |
| `rule_version_no_update` (trigger) | Immuabilité **effective** (append-only). | Déclencheur `BEFORE UPDATE OR DELETE` levant une exception : corriger = nouvelle version, jamais un UPDATE |
| `rules_acceptance` (bornée) | Acceptation horodatée d'une version exacte. | PK `(group_id, identity_id, rules_version)` (une fois par membre et version) ; + CHECK `accepted_at IS NOT NULL` |

> La **non-rétroactivité** des échéances passées et l'**effectivité** d'un
> engagement essentiel (accord de tous les concernés) sont des **décisions
> serveur** (`packages/domain/src/rules.ts`), pas des contraintes SQL. Preuve
> effective (trigger refusant un UPDATE ; CHECK refusant `penaltyEnabled=true`) =
> scénarios C04-IMMUTABLE / C04-PENALTY de `tests/isolation.pg.mjs`, **BLOCKED**.

## Calendrier des cycles (migration additive `0006_cycle_schedule.sql`, lot C05)
Élargit `round` / `obligation` (socle 0001) sans les redéfinir : bénéficiaire
désigné par tour, dates métier/UTC, version de règle rattachée, rotation égale et
obligation unique membre/tour.

| Objet | Rôle | Clés / contraintes clés |
|---|---|---|
| `round` (élargi) | Tour du calendrier avec bénéficiaire et échéance datée. | + `beneficiary_membership_id` (FK composite `(group_id, membership_id)`), `due_date_business` (date métier), `due_at_utc` (instant UTC), `rules_version` (FK composite `(group_id, rules_version)` vers `rule_version`, 5.2) |
| `round_one_beneficiary_per_group` | **Rotation égale** (5.3, une part). | **index partiel unique** `(group_id, beneficiary_membership_id) WHERE beneficiary_membership_id IS NOT NULL` : un second tour vers le même bénéficiaire est refusé (C05-UNIQUE base) |
| `obligation_unique_member_round` | **Obligation unique** membre/tour (5.2). | `UNIQUE (group_id, round_id, member_membership_id)` : une seule dette par membre et par tour |
| `round_due_consistency` | Cohérence datation. | CHECK `due_at_utc IS NULL OR due_date_business IS NOT NULL` |

> La **génération** N tours / N membres, l'**unicité du bénéficiaire** (permutation),
> le **gel de l'ordre** après démarrage (`SCHEDULE_FROZEN`), le **départ sans
> réaffectation de dette** et le **renouvellement** (nouvelles acceptations si
> engagement changé) sont des **décisions serveur** (`packages/domain/src/schedule.ts`) ;
> la base ne fait que **borner structurellement** (rotation, unicité membre/tour).
> L'arrondi au dernier jour réel du mois est **calculé en domaine** (`calendar.dueDate`,
> horodatage `Africa/Douala` persisté en UTC). Preuve effective (second bénéficiaire
> refusé par l'index ; doublon membre/tour refusé par la contrainte) = scénarios
> C05-UNIQUE / C05-OBLIGATION de `tests/isolation.pg.mjs`, **BLOCKED** sans base réelle.

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
schéma et les preuves (RLS effective, verrous, isolation de pool, FK croisées,
bornes d'invitation, supplantation de session) sont le **lot d'exécution** sur
PostgreSQL 16+ réel (`tests/isolation.pg.mjs`), **BLOCKED** sur un hôte sans base.
