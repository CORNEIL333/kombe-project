# Preuves & revue — Lot C05 (cycles, tours, échéances, bénéficiaires) · KÓMBE

- **Commit C05 (code) :** `159a4838594420c7542d3d6ce52e3ae7962e63ff`
- **Porte :** G0 · **Dépendances :** C03 (`c07af77`), C04 (`c998d8e`) · **Stories :** 5.1, 5.2, 5.3 (P0) ; 5.4, 5.5 (P1, restrictions conservées)
- **Auteur / cycle :** Lead C05 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (index partiel
  unique de rotation `round_one_beneficiary_per_group`, contrainte
  `obligation_unique_member_round`, FK composites bénéficiaire/version de règle) est
  **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : calendrier N tours / N membres,
  **permutation** des bénéficiaires (unicité), obligations membre/tour, dates métier
  **Africa/Douala** bornées au dernier jour réel du mois + instants **UTC**, gel de
  l'ordre après démarrage, départ sans réaffectation de dette, renouvellement.
- Réutilisation **encadrée** des modules C00/C04 : `calendar.dueDate` (fin de mois,
  bissextile), `rotation` (totaux), `isEssentialFinancialChange` (renouvellement).
- Fichiers impactés : `packages/domain/src/schedule.ts` (neuf) + `errors.ts` (5 codes)
  + `index.ts` ; `packages/api/src/{scheduleStore,server,schemas}.ts` ;
  `packages/db/migrations/0006*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0015_*` ; `docs/openapi.yaml` (tag
  `rounds`, schémas C05).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `SCHEDULE_ROUNDS_MISMATCH` (422),
  `SCHEDULE_BENEFICIARY_DUPLICATE` (422), `SCHEDULE_MEMBER_UNKNOWN` (422),
  `SCHEDULE_OBLIGATION_DUPLICATE` (409), `SCHEDULE_FROZEN` (409) — mapping dans
  `server.ts` ; codes référencés dans l'enum `ErrorCode` du contrat OpenAPI.
- **Invariants :** `rounds === memberCount` au pilote et totaux **dérivés de
  `rotation`** (jamais réimplémentés) ; `beneficiaryOrder` = **bijection** des
  membres (refus dupliqué/étranger/compte incohérent **avant** production) ;
  **obligation unique membre/tour** ; date métier `Africa/Douala` bornée au dernier
  jour réel du mois, instant **UTC** persisté (12:00 Douala = 11:00 UTC), rattaché à
  une **version de règle** ; amorçage **complet** puis **gel** de l'ordre ; départ
  **conservant** la dette et les tours ; renouvellement **exigeant de nouvelles
  acceptations** si engagement essentiel changé, **historique préservé**.
- **Migrations :** socle `0001` inchangé ; `0006_cycle_schedule.sql` **additif**
  (colonnes `round.beneficiary_membership_id`/`due_date_business`/`due_at_utc`/
  `rules_version` + FK composites, index partiel unique de rotation, contrainte
  d'unicité membre/tour, CHECK de cohérence de datation) ; **down** fourni. Rejouable :
  ajouts **nullables** et contraintes, aucune réécriture de lignes existantes. Ordre de
  rollback complet : `0006…down` → `0005…down` → `0004…down` → `0003…down` →
  `0002…down` → `0001…down`.
- **Contrat d'API :** routes `POST/GET /v1/groups/:groupId/schedules`,
  `POST …/schedule-starts`, `POST …/rounds/:seq/beneficiary`, `…/departures`,
  `…/cycle-renewals` — documentées dans `docs/openapi.yaml` (tag `rounds`, schémas
  `ScheduleBuildRequest`, `CycleScheduleView`, `DepartureView`, `RenewalPlan`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **115 passed** (C04 96 + **schedule 19**)
- `@kombe/api` → **47 passed** (C04 38 + **schedule 9**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml + assertions ;
  les schémas C05 résolvent `$ref` `Money`, l'enum `ErrorCode` inclut les 5 codes C05).

### Hashes SHA-256 des artefacts C05
| sha256 | Fichier |
|---|---|
| `fd789ee22272ac93f84de0cf716e3ecc5e4eced65a593eb1ebb801e5853041dd` | `packages/domain/src/schedule.ts` |
| `4885a7ab6c1e10b6bc4b183efa72fee2686f57df427c143394211c31464796dc` | `packages/domain/test/schedule.test.ts` |
| `5e1f3a0c63eca607ba466a418f7bd7c82240910aafce1aeddc5af065a81142f0` | `packages/api/src/scheduleStore.ts` |
| `b7dc878a078f2995d671df48c88a1ddd797b2a0e94a34adea445666e2ddb8d23` | `packages/api/test/schedule.test.ts` |
| `0b613311321ccc839c6cc7cc480fe17ba7654cc1084a782cd4a75367b0b9162a` | `packages/db/migrations/0006_cycle_schedule.sql` |
| `7c50c37c99148affeb0a0e5503107bb4999c78392be3f4003e746482e13ae7d8` | `packages/db/migrations/0006_cycle_schedule.down.sql` |
| `9ff5682a0dd80b3e3eb9d72907ae861c381974151f546b7889302b4ff358c928` | `packages/db/tests/isolation.pg.mjs` |
| `32ac18689aa1fdf4de5e66b5a13039b0f5997c45ff96099d0773920d4b29e851` | `packages/db/DICTIONNAIRE.md` |
| `4768f0e0323e33608e3cdd3af6050dd66da3a338fc0caef8a6b2bee5c31bb19f` | `packages/db/README.md` |
| `e3a475f744cc32d13bf1460a42e71e65531f3620aa262e231074de7ef5f1d609` | `docs/openapi.yaml` |
| `c963201134b5dab837fdcec9e9eecf0a93ba8737b01144fe5b5b0cf253c48aca` | `docs/adr/0015_calendrier_cycles_tours_beneficiaires.md` |

## 4. Éprouver (scénarios propres à C05, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C05-SCHEDULE** | 10 membres à 5000 sur 10 tours ⇒ `cycle_expected_total = 500000` (`roundPot = 50000`, 100 obligations) | ✅ |
| **C05-MONTH** | mensuel 31 janv. 2028 puis février ⇒ `second_due_date = "2028-02-29"` (bissextile) ; instant UTC = 11:00 (12:00 Douala) | ✅ |
| **C05-UNIQUE** | deux tours au même bénéficiaire ⇒ `schedule_accepted = false` (422 `SCHEDULE_BENEFICIARY_DUPLICATE`), **et** absence d'écriture (GET ⇒ 404) | ✅ |
| bénéficiaire étranger | ⇒ 422 `SCHEDULE_MEMBER_UNKNOWN` | ✅ |
| ordre figé (5.3) | réassignation après `schedule-starts` ⇒ 409 `SCHEDULE_FROZEN` | ✅ |
| réassignation brouillon | produisant une doublure ⇒ 422 `SCHEDULE_BENEFICIARY_DUPLICATE` | ✅ |
| départ (5.x) | `roundsUnchanged = true`, `debtReassigned = false`, 10 obligations conservées | ✅ |
| renouvellement (5.5) | engagement essentiel changé ⇒ `requiresNewAcceptances = true` ; sinon `false` ; `historyPreserved = true` | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (calendrier non mémorisé sur
refus) et la **non-divulgation** (erreurs stables, identifiants fictifs).

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C05, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C05-UNIQUE | `second_round_same_beneficiary_accepted = false` (index partiel unique `round_one_beneficiary_per_group` refuse le second tour vers le même bénéficiaire) | **BLOCKED** |
| C05-OBLIGATION | `duplicate_member_round_accepted = false` (contrainte `obligation_unique_member_round` refuse le doublon membre/tour) | **BLOCKED** |
| (C01→C04) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE / IMMUTABLE / PENALTY | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C05_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C05
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit 159a4838594420c7542d3d6ce52e3ae7962e63ff --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C05 + interfaces partagées déclarées (exports domain, routes
  api, tag OpenAPI `rounds`, schémas C05).
- Réutilisation **encadrée** des modules C00/C04 : `calendar.dueDate`, `rotation`,
  `isEssentialFinancialChange`, tables `round`/`obligation` du socle 0001 (élargies,
  non redéfinies).
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves de
  rotation / d'unicité membre-tour.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; P1 (5.3 tirage auditable, 5.4 changement voté, 5.5 création effective du
  cycle) **non activées** au pilote (ADR-0005) — seules les décisions P0 sont rendues.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C05-UNIQUE / C05-OBLIGATION (et les scénarios C01→C04) → alors
  `isolation.pg.mjs` doit sortir **exit 0** avec toutes les observations attendues.
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **Suite du backlog (au-delà de C05, hors des cinq directives séquentielles)** :
  contributions/validation (C06+), décaissements, litiges, votes de gouvernance,
  et activation P1 (5.4/5.5) sous ADR dédié. Non engagés ici.
- À la porte G1 : confirmer la date d'échéance métier (heure locale) et la
  politique de cycles multi-rotation (`cycle_id`) aujourd'hui bornée par groupe.
