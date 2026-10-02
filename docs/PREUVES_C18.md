# Preuves & revue — Lot C18 (mesure du pilote et économie unitaire : analytics pseudonymisé, cohortes/cycles, économie XAF entier/portes, registre des risques) · KÓMBE

- **Commit C18 (code) :** `130509b399bad0117aea22792231ce0ec54e411e`
- **Porte :** G0 · **Dépendances :** C05 (contributions/validation — le payeur RÉEL est une validation effective, la promesse ne compte pas), C11 (journal/empreinte et socle de décision serveur), C00 (erreurs stables, horloge injectée, canonicalisation/hash) · **Stories :** 16.1 (entonnoir d'analytics **pseudonymisé**, sans aucun champ financier/identitaire individuel), 16.2 (économie unitaire — coût réel en **XAF entier**, paiement **réel ≠ promesse**, portes exploratoires), 16.3 (registre des risques ; un **critique sans contrôle effectif bloque l'extension**), 18.13 (cohortes de pilote ; **un cycle = rotation complète = `memberCount` tours**, éligibilité « trois cycles »)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**`analytics_event` append-only** gardé par trigger `analytics_event_append_only` + `REVOKE UPDATE/DELETE`, **CHECK `properties ?| ARRAY[...]`** interdisant structurellement toute clé financière ou identitaire individuelle, **`unit_economics_snapshot` append-only** et **CHECK `total_cost_minor = support + infra + taxes`** en domaine `kombe_money`, **`pilot_cohort.member_count >= 1`** garantissant un diviseur non nul, et **RLS** multitenant de `analytics_event`/`pilot_cohort`/`unit_economics_snapshot` sur `group_id`) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : un **entonnoir d'analytics pseudonymisé** (`buildAnalyticsEvent`) qui **refuse** toute étape hors liste fermée et **tout** champ `properties` portant une clé financière (`montant`, `cotisation`, `solde`, `iban`, `référence`, `commentaire`…) ou identitaire (`identity`, `member`, `email`, `téléphone`, `nom`…) — avec **assainissement** (seuls les clés non sensibles sont conservées) et l'observation `individualFinancialFields = 0` à l'export (C18-ANALYTICS) ; des **cohortes** où un cycle = `memberCount` tours (rotation égale) et où l'**éligibilité « trois cycles »** exige `completedCycles >= 3` (C18-COHORT : **3 tours / 10 membres ⇒ 0 cycle ⇒ false**) ; une **économie unitaire** en **XAF entier** (`kombe_money`, bigint, jamais de flottant) distinguant le **payeur réel** de la **promesse**, calculant un **taux de paiement réel** arrondi à la baisse et une **porte exploratoire G2** (`paymentRealPercent >= 25` ; C18-PAYERS : **2/10 = 20 % ⇒ `gateG2Met = false`**), et liant le **coût total = support + infrastructure + taxes** ; et un **registre des risques** à sévérité/proba/impact bornés, dont la présence d'**au moins un risque critique sans contrôle effectif** (contrôle + preuve + propriétaire non vides) **bloque l'extension** du pilote.
- Réutilisation **encadrée** du socle : `DomainError` à codes stables (C00) ; `money()` (montant entier borné, non négatif) réutilisé pour tous les champs monétaires du domaine (`metrics.ts`), **`bigint` sérialisé en chaînes** à la frontière API (non serialisable en JSON) ; l'horloge est **SERVEUR** (`x-server-date`, secondes d'époque). C18 **n'invente** aucune donnée : le store **ne prétend ni persister ni brancher un outil d'analytics réel** — le raccordement RGPD-compatible (sans champ individuel) relève de l'infrastructure déployée (C29).
- **Hors du périmètre « pur » maintenant (consigné, non simulé) :** le calcul réel d'un entonnoir sur un entrepôt d'événements, la collecte d'un taux de paiement en production (source = validations C05 effectives, non simulées), l'évaluation réglementaire des « portes » G1/G2 (seuils choisis comme **proxys exploratoires**, non des obligations), et la cotation actuarielle des risques. Leur **substrat décisionnel** (modèles, refus de champ sensible, cycles/rotations, taux réel, total coût, blocage d'extension) est posé ici ; leur **preuve d'exécution** reste BLOCKED.
- Fichiers impactés : `packages/domain/src/{metrics,errors,index}.ts` ; `packages/api/src/{metricsStore,server,schemas}.ts` ; tests domaine (`test/metrics.test.ts`) + API (`test/metrics.test.ts`) ; `packages/db/migrations/0017*` (+ down) **branchés** dans `scripts/migrate.mjs` et `tests/isolation.pg.mjs` ; `docs/openapi.yaml`.

## 2. Contractualiser
- **Erreurs stables ajoutées (7) :** `METRICS_IDENTIFIANT_REQUIS` (422 — `eventId`/`cohortId`/`groupId`/`riskId` vide), `METRICS_ETAPE_ANALYTICS_INCONNUE` (422 — étape hors liste fermée des neuf étapes), `METRICS_CHAMPS_FINANCIER_INDIVIDUEL` (422 — un champ `properties` porte une clé financière/identitaire individuelle, C18-ANALYTICS), `METRICS_DENOMINATEUR_NUL` (422 — division par zéro : `ratePercent(_, 0)` ou cohorte `memberCount <= 0`), `METRICS_SEVERITE_INCONNUE` (422 — sévérité hors `faible`/`moyen`/`eleve`/`critique`), `METRICS_VALEUR_INVALIDE` (422 — entier négatif/non entier, pourcentage hors `[0,100]`, date non `AAAA-MM-JJ`), `METRICS_RISQUE_CRITIQUE_SANS_CONTROLE` (409 — tentative d'extension alors qu'un risque critique n'a pas de contrôle effectif). Réutilisation du socle : `RESERVATION_INCOHERENTE` (404 — non-divulgation d'une cohorte absente), `FEATURE_PILOT_FORBIDDEN` (403 — acteur non authentifié), `MONEY_NEGATIVE`/`MONEY_NOT_INTEGER` (422 — montant via `money()`). Mapping dans `packages/api/src/server.ts` (`STATUS_BY_CODE`) et dans `docs/openapi.yaml` (enum `ErrorCode`).
- **Invariants :** un événement d'analytics **ne porte jamais** de champ financier ou identitaire individuel (refus + assainissement, export `individualFinancialFields = 0`, C18-ANALYTICS) ; l'horodatage et l'identité de l'acteur sont **résolus SERVEUR** (jamais déclarés par le client, ADR-0005) ; **un cycle = rotation complète = `memberCount` tours** et l'éligibilité trois cycles est `completedCycles >= 3` (C18-COHORT) ; le **payeur réel** (`paid`) compte, la **promesse** (`promised`) **jamais** dans le taux réel ; tout montant est en **XAF entier** (`kombe_money`, borné, non négatif) et le **coût total = support + infrastructure + taxes** (pas d'arrondi flottant, ADR-0002) ; `ratePercent` est **arrondi à la baisse** (`Math.floor`) et **refuse un dénominateur nul** ; un **risque critique sans contrôle effectif** (contrôle + preuve + propriétaire non vides) **bloque l'extension** ; toute lecture/écriture est **sans divulgation** (404 stables).
- **Migrations :** socle `0001` inchangé ; `0017_pilot_metrics.sql` **entièrement additive** (quatre nouvelles tables) : `analytics_event` (PK `event_id`, FK `group_id`, `step IN` enum neuf étapes, `occurred_at timestamptz`, `properties jsonb` CHECK `jsonb_typeof='object'` + **`NOT (properties ?| ARRAY[…financier…])`** + **`NOT (properties ?| ARRAY[…identitaire…])`** ; trigger `analytics_event_append_only` via la fonction partagée `kombe_journal_append_only`, **propriété `0007`**, non touchée + `REVOKE UPDATE, DELETE … FROM kombe_app`), `pilot_cohort` (PK `group_id` FK, `member_count CHECK >= 1`, `rounds_completed CHECK >= 0`), `unit_economics_snapshot` (PK `snapshot_id`, FK `group_id`, compteurs `>= 0`, `payment_real_percent BETWEEN 0 AND 100`, montants en **domaine `kombe_money`** (propriété `0001`, non touché), `unit_economics_payers_within_exposed` = `real_payers <= exposed_members`, **`unit_economics_total_is_sum`** = `total = support + infra + taxes` ; trigger append-only + `REVOKE`), `pilot_risk` (PK `risk_id`, `severity IN` enum, `probability_percent`/`impact_percent BETWEEN 0 AND 100`, `reviewed_at date`, **registre révisable non append-only**). RLS `tenant_isolation` sur `analytics_event`/`pilot_cohort`/`unit_economics_snapshot` (scopées groupe) ; `pilot_risk` est un **registre PROGRAMME transverse**, donc **hors RLS**. **Down** fourni, **réversible** (drop politique/RLS/trigger/tables dans l'ordre inverse ; `kombe_journal_append_only` `0007` et `kombe_money` `0001` **non retirés**). `0017` est **branchée explicitement** dans les listes ordonnées de `scripts/migrate.mjs` (UP, après `0016`, avant `provision/roles.sql`) et `tests/isolation.pg.mjs` (up après `0016`, **down en tête**) — les migrations ne sont **pas** auto-découvertes.
- **Contrat d'API (8 routes) :** `POST /v1/metrics/analytics/events` (201 `AnalyticsEventView`, `occurredAt` serveur ; champ individuel → 422 `METRICS_CHAMPS_FINANCIER_INDIVIDUEL`, étape inconnue → 422), `GET /v1/metrics/analytics/funnel/{cohortId}` (200 `AnalyticsFunnelView`, `individualFinancialFields = 0`, C18-ANALYTICS), `POST /v1/metrics/cohorts` (201 `CohortView`, `eligibleThreeCycleRetention` jugée domaine, C18-COHORT), `GET /v1/metrics/cohorts/{groupId}` (200/404 non-divulguant), `POST /v1/metrics/economics` (200 `EconomicsView`, montants en **chaînes** XAF entières, `gateG2Met`, C18-PAYERS), `POST /v1/metrics/risks` (201 `RiskView` ; sévérité/date/proba hors bornes → 422), `GET /v1/metrics/risks` (200 liste), `POST /v1/metrics/extension-check` (200 `ExtensionStatusView`, `extensionAllowed = false` + `criticalWithoutControl` si un critique sans contrôle effectif) — documentées dans `docs/openapi.yaml` (tag `metrics`, params `ServerDate`/`CohortId`/`GroupId`, schémas `AnalyticsEvent*`/`AnalyticsFunnelView`/`Cohort*`/`Economics*`/`Risk*`/`ExtensionStatusView`/`MoneyInput`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK, @kombe/worker OK   → exit 0
pnpm -r test       # vitest run (domaine + api + contrat + worker)         → exit 0
node --check packages/db/scripts/migrate.mjs                     # → exit 0
node --check packages/db/tests/isolation.pg.mjs                 # → exit 0 (0017 branchée)
node packages/db/scripts/migrate.mjs migrate                    # → exit 2 (BLOCKED, KOMBE_DATABASE_URL absente)
python harness/run_h00.py --commit 130509b… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **337 passed** (dont **29** dédiés `metrics` : `test/metrics.test.ts`)
- `@kombe/api` → **198 passed** (dont **14** dédiés `metrics` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée** — chemins C00/C08/C12/C16/C17 intacts, +8 chemins et +11 schémas metrics, enum `ErrorCode` enrichi de 7 codes `METRICS_*`)
- `@kombe/worker` → 10 tests, 0 fail

### Hashes SHA-256 des artefacts C18 (au commit `130509b`)
| sha256 | Fichier |
|---|---|
| `a9ea782cdeb9bafa6fa5ea99d93e37945ac3a188529685b72b76ea55b0475ff5` | `packages/domain/src/metrics.ts` |
| `11a26de1055bd37746f5f269876ca3c6df501a6eee05b251dfef6cc24c087ace` | `packages/domain/test/metrics.test.ts` |
| `a40821f0e417cbf059e7d2d344f97fbd913dcbe105fbf9a3989e93893b67bc4e` | `packages/domain/src/errors.ts` |
| `28aecaac6a4f6554d0d4e4fbfeb6945570afb7f4129b5b9cc7eef02fa1315019` | `packages/domain/src/index.ts` |
| `4780b694a6736d06c70fcffc04d4f3cd4b14f6f087e93679115cdea26f373eb9` | `packages/api/src/metricsStore.ts` |
| `cda2f31d7c5d6452612c6fde51de824bd9c3b1d516d48386e77979582ceffa49` | `packages/api/src/schemas.ts` |
| `4d64714ff07580e1c51b2085cc74d8e72086c34d0366cc864a6fefd96019c608` | `packages/api/src/server.ts` |
| `a740560441d68d40716838cbba4c3648b050d0b2fb68c010a6bfbc8b3de52090` | `packages/api/test/metrics.test.ts` |
| `d1daa8d8c6b61f5784d283c21b03ed4b9ec240a0035ef581a715bf930c6b4645` | `packages/db/migrations/0017_pilot_metrics.sql` |
| `f5852afc688c2e800e5ab55d09ec3e743d26e42287a32bbf2779b95828fd8bda` | `packages/db/migrations/0017_pilot_metrics.down.sql` |
| `6c9cc2fe144a7dcaab06e7a231518d5f8bfbdcfcc1f2a9359aeee1440236e970` | `packages/db/scripts/migrate.mjs` |
| `1cd99b995c140e159970b539eaf6b771966bd17122fa3a309d8b4fd8bbaef02c` | `packages/db/tests/isolation.pg.mjs` |
| `0877b59a2a223dfcdad650d60afac9de27ff04b13b2b85e9155fe79d2ed17ab5` | `docs/openapi.yaml` |
| `37c109915a0031d0488dfbde03f448c814430256f9a7a6beba5d9d2973ab4179` | `harness/reports/RAPPORT_G_CONSTRUCTION.json` |

## 4. Éprouver (scénarios propres à C18, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| acteur absent | aucun `x-actor` ⇒ **403** `FEATURE_PILOT_FORBIDDEN` (toute route metrics) | ✅ |
| événement valide | 201, `occurredAt` = secondes d'époque de `x-server-date` (SERVEUR, jamais le client) | ✅ |
| **C18-ANALYTICS** champ financier | `properties = { montant: 5000 }` ⇒ **422** `METRICS_CHAMPS_FINANCIER_INDIVIDUEL` | ✅ |
| **C18-ANALYTICS** référence/commentaire | clé `reference`/`commentaire`/`member` ⇒ refus (financier ou identitaire) | ✅ |
| étape inconnue | `step = "inconnue"` ⇒ 422 (enum schéma ; au domaine ⇒ `METRICS_ETAPE_ANALYTICS_INCONNUE`) | ✅ |
| **C18-ANALYTICS** export | entonnoir d'une cohorte avec 3 étapes ⇒ **`individualFinancialFields = 0`** ; `steps` porte les étapes atteintes | ✅ |
| **C18-COHORT** 3/10 | `memberCount=10, roundsCompleted=3` ⇒ `completedCycles=0`, **`eligibleThreeCycleRetention=false`** | ✅ |
| C18-COHORT 30/10 | `roundsCompleted=30` ⇒ `completedCycles=3`, **`eligibleThreeCycleRetention=true`** | ✅ |
| C18-COHORT 29/10 | `roundsCompleted=29` ⇒ `completedCycles=2` ⇒ false (un cycle = rotation complète) | ✅ |
| cohorte absente | `GET …/cohorts/{inconnu}` ⇒ **404** `RESERVATION_INCOHERENTE` (non-divulgation) | ✅ |
| **C18-PAYERS** 2/10 | `exposed=10, paid=2, promised=5` ⇒ `realPayers=2`, `paymentRealPercent=20`, **`gateG2Met=false`** (promesses non comptées) | ✅ |
| C18-PAYERS 3/10 | `paid=3` ⇒ `paymentRealPercent=30` ⇒ **`gateG2Met=true`** (seuil 25) | ✅ |
| économie coûts entiers | `support=120min×50` ⇒ `6000`, total `= 6000+10000+500 =` **`"16500"`** ; montants rendus en **chaînes** | ✅ |
| économie montant négatif | `-1` ⇒ 422 (via `money()` `MONEY_NEGATIVE`) | ✅ |
| risque valide | 201 `RiskView` ; sévérité `moyen`, proba/impact bornés, date `AAAA-MM-JJ` | ✅ |
| risque proba hors bornes | `probabilityPercent=150` ⇒ 422 | ✅ |
| **16.3 extension bloquée** | un `critique` **sans** contrôle/preuve/propriétaire ⇒ `extensionAllowed=false`, `criticalWithoutControl ∋ "R-CRIT"` | ✅ |
| extension autorisée | aucun critique sans contrôle effectif (ici `eleve` avec contrôle) ⇒ `extensionAllowed=true` | ✅ |

Chaque chemin négatif vérifie la **non-divulgation** (404 stables, aucune donnée servie) et l'**absence de champ individuel** à l'export. Côté **domaine** (29 tests, sans HTTP) : `ratePercent` (arrondi à la baisse, dénominateur nul, négatif), `buildAnalyticsEvent` (valide/assaini, étape inconnue, identifiant vide, refus `montant`/`reference`/`commentaire`/`member`), `countFinancialFieldsInExport` = 0 et `funnelCounts` en ordre, cohortes (3/10→0→false, 30/10→true, 29/10→false, invalide), économie (`countRealPayers` réel≠promesse, `gateG2Met` seuil 25, `computeUnitEconomics` total = somme, montant négatif, complétude), risques (`buildRisk` valide/invalide, `hasEffectiveControl`, `blocksPilotExtension`/`assertPilotExtensionAllowed` : critique-sans-contrôle ⇒ 409, critique-avec-contrôle ⇒ OK, `eleve`-sans-contrôle ⇒ ne bloque pas).

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
Ce lot est `in_review`. **qoder** l'a produit ; il **ne peut pas** signer son propre `done`. La relecture (diff, migration, permissions minimales, non-divulgation, refus de champ sensible, sémantique cycle/rotation, taux réel vs promesse, blocage d'extension) doit être exécutée et signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`), **jamais auto-validée**. Points d'attention soumis au relecteur :
- **Liste des jetons sensibles (`INDIVIDUAL_FINANCIAL_TOKENS` / `PERSONAL_TOKENS`) :** la détection est une **sous-chaîne en minuscules** (ex. `reference` matche, `ref` **non** — choix délibéré pour ne pas sur-capter des clés licites comme `ref_id` non financières ? à confirmer). À valider comme **suffisante et non excessif** : toute clé financière/identitaire réelle ou attendue est-elle couverte ? La correspondance substrings peut-elle bloquer une étape légitime ? Le relecteur doit trancher la granularité.
- **`ratePercent` arrondi à la baisse & seuil G2 = 25 :** l'arrondi `floor` est **défavorable au passing** (conservateur). À confirmer comme intentionnel ; le seuil 25 % est un **proxy exploratoire en dur**, **pas** une obligation réglementaire — vérifier qu'il n'est présenté nulle part comme un engagement.
- **Sémantique « un cycle = `memberCount` tours » :** `completedCycles = floor(roundsCompleted / memberCount)` et l'éligibilité `>= 3`. À valider contre le modèle de calendrier des cycles/tours (C06/ADR-0015) : la rotation égale (chaque membre une fois par cycle) est-elle bien l'unique définition retenue ? `memberCount <= 0` ⇒ `METRICS_DENOMINATEUR_NUL` (jamais de division silencieuse).
- **Coût total = somme, en `kombe_money` borné `[0,1e9]` :** le CHECK base **et** l'assertion domaine imposent `total = support + infra + taxes`. Un total > 1e9 serait **refusé** par le domaine `kombe_money` — à confirmer comme plafond acceptable pour l'économie **unitaire** d'un pilote (et non une limite métier cachée). Les montants sortent en **chaînes** (bigint non serialisable) : vérifier qu'aucun client ne les attend en nombre.
- **Blocage d'extension = `critique` **sans** contrôle effectif :** seul un risque `critique` **sans** (contrôle **et** preuve **et** propriétaire) bloque ; un `eleve` sans contrôle **ne bloque pas** et un `critique` **avec** contrôle effectif **n'autorise** pas à lui seul d'autres gardes. À valider comme seuil de prudence adéquat pour une **extension de pilote** ; confirmer que `hasEffectiveControl` exige les trois champs non vides (pas seulement l'un).

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C18, **codés et prêts** via la migration `0017` branchée dans `tests/isolation.pg.mjs`, exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C18 analytics immuable | `UPDATE`/`DELETE analytics_event` **refusés** (`analytics_event_append_only` + `REVOKE`) | **BLOCKED** |
| C18 pas de champ financier | INSERT `properties` avec clé `montant`/`iban`/`reference` **refusé** (CHECK `?|` financier) | **BLOCKED** |
| C18 pas de champ identitaire | INSERT `properties` avec clé `email`/`téléphone`/`nom` **refusé** (CHECK `?|` identitaire) — C18-ANALYTICS en base | **BLOCKED** |
| C18 étape fermée | INSERT `step` hors enum ⇒ **refusé** (CHECK) | **BLOCKED** |
| C18 cohorte diviseur | INSERT `pilot_cohort.member_count = 0` **refusé** (CHECK `>= 1`) — garantit cycles calculables | **BLOCKED** |
| C18 coût = somme | INSERT `unit_economics_snapshot` avec `total ≠ support+infra+taxes` **refusé** (`unit_economics_total_is_sum`) | **BLOCKED** |
| C18 montant entier | INSERT coût fractionnaire/négatif **refusé** (domaine `kombe_money`) ; `real_payers > exposed` **refusé** | **BLOCKED** |
| C18 RLS | lecture d'un `analytics_event`/`pilot_cohort`/`unit_economics_snapshot` d'un autre `group_id` **isolée** (`tenant_isolation`) | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |
| entrepôt analytics réel / collecte paiement production / cotation actuarielle / raccord outil RGPD | infra déployée + raccord C29 + source C05 réelle | **non activé — substrat posé** |

## 7. Rapport H00 au SHA C18
```
python harness/run_h00.py --commit 130509b399bad0117aea22792231ce0ec54e411e --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28). **C18 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec les observations (`analytics_event` append-only + `REVOKE` + CHECK `?|` financier/identitaire + enum `step`, `pilot_cohort.member_count >= 1`, `unit_economics_total_is_sum`, `kombe_money` entier borné, `unit_economics_payers_within_exposed`, RLS).
- **Raccord C05 (payeur réel) :** le taux de paiement **réel** est calculé dans le store à partir de signaux `{status:'paid'|'promised'}` **simulés** ; la soudure réelle (une **validation C05** effective = payeur réel ; jamais une promesse comptée) est à câbler côté persistance. Ici le **mécanisme** (réel ≠ promesse, arrondi conservateur, seuil serveur) est prouvé en pur.
- **Raccord C06 (cycles/tours) :** `memberCount` tours = un cycle est une **reformulation** du calendrier des cycles/tours bénéficiaires (C06/ADR-0015) ; la source d'autorité du `roundsCompleted` (clôtures de tour) reste à raccorder. Non duplicable ici.
- **Porte G2 = seuil exploratoire :** `25` est un **proxy en dur**, non une obligation ; sa valeur définitive relève d'une décision de gouvernance (et non d'un engagement contractuel publié).
- **Outil d'analytics réel (C29) :** le store **ne collecte ni ne persiste** ; le déploiement d'un entonnoir RGPD-compatible (sans champ individuel, consentement C16, journal d'accès) est hors périmètre d'implémentation ici.
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; **observations DB C18 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
