# Preuves & revue — Lot C07 (validations et corrections de cotisations) · KÓMBE

- **Commit C07 (code) :** `f765bda7d61ca02553598bdad5a5359a88284541`
- **Porte :** G0 · **Dépendances :** C06 (`b99e3b2`, cotisations déclarées), C11 (`30e90ca`, scellement/replay des événements `contribution.validated` / `contribution.compensated`), C00 (`444c207`, canonicalisation/chaîne), C01 (rôles/RLS), C04 (`c998d8e`, règles/seuil), C05 (`159a483`, obligations) · **Stories :** 6.2 (machine à états, rejet avant validation, compensation liée), 6.3 (double/triple validation, déclarant ≠ confirmateur, confirmation atomique), 6.4 (anti-collusion, indépendance, notification ≠ validation), 6.5 (contestation : fenêtre 7 j, fraude/erreur grave hors délai, blocage/gel), 6.6 (correction sans suppression, compensation unique)
- **Auteur / cycle :** Lead C07 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (verrou réel
  `SELECT … FOR UPDATE`, **sérialisation concurrente** de deux compensations d'un
  même original, **atomicité** événement inverse / projection / outbox,
  **append-only effectif** des actes de validation par trigger + `REVOKE`, refus
  d'indépendance et d'anti-cumul **en base** par trigger + `UNIQUE`) est
  **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : **machine à états**
  `declared → confirmed → validated` (+ `rejected` avant validation, +
  `compensated` après) ; **indépendance** déclarant ≠ confirmateur
  (`SELF_DECLARANT`, refus **sans écriture**) ; **anti-cumul** un acte par acteur
  (`ACTOR_ALREADY_ACTED`) ; **confirmation atomique** si seuil de contrôleurs = 0,
  sinon passage en `confirmed` ; **compensation unique** liée à l'original
  (`CONTRIBUTION_ALREADY_COMPENSATED`, `reversalCount ≤ 1`) ; **fenêtre de
  contestation** (ordinaire ≤ 7 j, fraude/erreur grave exemptes), **motif
  obligatoire**, **blocage** de validation avant et **gel** des dépendances après
  validation.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH` et **types
  d'événement déjà rejoués par C11** (`contribution.validated` +amount,
  `contribution.compensated` −amount) ; RBAC `assertAllowed` /
  `isCrossGroupAccess` / `assertExpectedVersion` (ADR-0006) ; monnaie entière
  (ADR-0002). C07 **n'invente** aucun nouveau type d'événement ni nouvelle chaîne ;
  il **compose** avec le replay C11 et **élargit** `contribution`/`dispute` de `0001`.
- Fichiers impactés : `packages/domain/src/validation.ts` (neuf) + `errors.ts`
  (6 codes) + `index.ts` ; `packages/api/src/{validationStore,server,schemas}.ts` ;
  `packages/db/migrations/0009*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0018_*` (+ `0000_index.md`) ;
  `docs/openapi.yaml` (paths C07, 6 codes, 7 schémas).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `CONTRIBUTION_STATE_INVALID` (409),
  `CONTRIBUTION_ALREADY_COMPENSATED` (409), `VALIDATION_BLOCKED_BY_DISPUTE` (409),
  `ROUND_CLOSE_BLOCKED_BY_DISPUTE` (409), `DISPUTE_WINDOW_CLOSED` (422),
  `DISPUTE_REASON_REQUIRED` (422) — mapping dans `server.ts` ; référencées dans
  l'enum `ErrorCode` du contrat OpenAPI.
- **Invariants :** pas de **mutation silencieuse** (précondition d'état, refus
  **avant** écriture) ; **indépendance non désactivable** entre déclarant et
  confirmateur (acte refusé = décision `validationAccepted = false`, **pas** une
  4xx) ; **un acte par acteur** (anti-cumul) ; **seuil de validateurs** issu des
  règles (C04), jamais une moyenne, **une notification ne valide pas** ;
  **correction par contre-écriture liée** (l'original et ses validations
  restent, le replay C11 retranche) ; **original compensé au plus une fois** ;
  **litige** : motif non vide, fenêtre ordinaire 7 j, fraude/erreur grave
  toujours recevables, **blocage avant** validation et **gel après** sans
  effacement ; **résolution de litige hors pilote** (gouvernance/vote, aucun rôle
  de base ne porte `dispute.resolve`).
- **Migrations :** socles `0001`/`0008` inchangés ; `0009_contribution_validation.sql`
  **additif** — CHECK `contribution.state` **+= `confirmed`** et colonnes
  `declarant_identity_id` / `required_controllers` ; table append-only
  `contribution_act` (`UNIQUE (group_id, contribution_id, actor_identity_id)`
  anti-cumul, **trigger `contribution_act_independence`** refusant l'acte du
  déclarant, **trigger append-only** + **`REVOKE UPDATE, DELETE`** à `kombe_app`,
  RLS `tenant_isolation`) ; **index partiel UNIQUE**
  `contribution_one_reversal_per_original` (compensation unique) ; `dispute`
  enrichi (`category` CHECK ordinary/fraud/serious_error, `reason`, `notified_at`,
  `raised_at`) + CHECK `dispute_reason_present` + CHECK `dispute_ordinary_window`
  (ordinaire ≤ 7 jours, fraude/erreur grave exemptées). **Down** fourni (rétablit
  la CHECK d'état `0001`, ne **drop** pas la fonction partagée
  `kombe_journal_append_only`, propriété de `0007`). Ordre de rollback complet :
  `0009…down` → `0008…down` → `0007…down` → … → `0001…down`.
- **Contrat d'API :** `POST /v1/groups/:groupId/contributions/:id/confirmations`
  (200), `…/control` (200), `…/rejections` (200), `…/compensations` (201),
  `POST /v1/groups/:groupId/disputes` (201),
  `POST …/obligations/:obligationId/dependent-operation-attempts` (200),
  `GET …/contributions/:id` (vue de validation) — documentés dans
  `docs/openapi.yaml` (schémas `ValidationActReceipt`, `CompensationRequest`,
  `CompensationReceipt`, `ContributionValidationView`, `DisputeRequest`,
  `DisputeReceipt`, `DependentOperationReceipt` ; montants rendus en **chaînes**).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **177 passed** (C06 154 + **validation 23**)
- `@kombe/api` → **77 passed** (C06 65 + **validation 12**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml **sans clé
  dupliquée** + assertions ; l'enum `ErrorCode` inclut les 6 codes C07 ; le
  chemin préexistant `/groups/{groupId}/disputes` est **enrichi** et non
  dupliqué ; montants en chaînes ; aucun nom interdit `wallet|loan|scoring|insurance`).

### Hashes SHA-256 des artefacts C07
| sha256 | Fichier |
|---|---|
| `ccde8393aa3d674f2ebe5245da856c03758863f77556088e5b883ded2901db4b` | `packages/domain/src/validation.ts` |
| `6a682ca5dca7fbdcb232195081808d3dc5f88db6d5ed522d0963e2b0bcd40990` | `packages/domain/src/errors.ts` |
| `93bdd5db5a95e1748b409537cfea47fb04b6b4cf0b3165321db7d624d49d09e5` | `packages/domain/src/index.ts` |
| `2f532c11337da3f6624b75ebefd3062f5e20cac8a21003e685de410ee4b94d9b` | `packages/domain/test/validation.test.ts` |
| `bfcf7c48aec7e5df7f52cf579a7de751f9e67651d3daba05bec0d623913eab37` | `packages/api/src/validationStore.ts` |
| `a560313688d24cd90b8e93ebc92a5d2b4da5a37ee315c0139418eac9f337f76f` | `packages/api/src/schemas.ts` |
| `8565a6b162c17aa9762ed5096a31ce33bc328598cf8594b0d5f004d9a554b57a` | `packages/api/src/server.ts` |
| `fe08130399049457a06c53452004f0515d1e652fef84e31daa1b6810e79d524a` | `packages/api/test/validation.test.ts` |
| `6d3673c6fffb2f004077ff0ff2599b7b2a7b71ea95c6ac2406d77a8b91e1af0e` | `packages/db/migrations/0009_contribution_validation.sql` |
| `e735028f32a480c2a52ec4761dee129196613999ff387687ebc182dc4e211402` | `packages/db/migrations/0009_contribution_validation.down.sql` |
| `21d092bdea5a83ef7ae6596a7b93ffcbc1fa4651e417adf914fac4ce7ed3d9c4` | `packages/db/tests/isolation.pg.mjs` |
| `17e92790d8e7d4b9eff9bcee70c144a0032e532e59dcc1d537a0785e59b99cf2` | `packages/db/DICTIONNAIRE.md` |
| `45bb9591b539d0946f63bb317e34a73c23c670f9de77c69a52247ac11ed591c0` | `packages/db/README.md` |
| `d442ccad934227e7d32ffa2dab45ddd66a0cbc5ae112a223c60a8fadf97677df` | `docs/adr/0018_validations_corrections_independance_compensation.md` |
| `a278939d070ee97350c09a89ded07632a45070ce06af258ac13168240cab2c88` | `docs/adr/0000_index.md` |
| `2c7da18965a6a863e7da0b8b5ac312fc8900abac49949382270d4624037f711d` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C07, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C07-SELF** | trésorier se **confirme lui-même** ⇒ `validationAccepted = false` (`SELF_DECLARANT`), **0** événement validé, état reste `declared` | ✅ |
| **C07-SELF** (positif) | confirmation par un acteur **distinct et autorisé** ⇒ `validationCompleted = true`, `contribution.validated` scellé | ✅ |
| **C07-TRIPLE** | même acteur **confirme puis contrôle** ⇒ second acte `validationAccepted = false` (`ACTOR_ALREADY_ACTED`), **0** validation | ✅ |
| **C07-TRIPLE** (positif) | **contrôleur distinct** parachève au seuil ⇒ `validationCompleted = true`, 1 événement validé | ✅ |
| rejet après validation | `POST …/rejections` sur un `validated` ⇒ **409** `CONTRIBUTION_STATE_INVALID`, écriture conservée | ✅ |
| **C07-REVERSE** | deux compensations du **même original** ⇒ 1ʳᵉ 201 `reversalCount = 1`, 2ᵈᵉ **409** `CONTRIBUTION_ALREADY_COMPENSATED`, **1** événement `compensated`, vue `compensated = true` | ✅ |
| litige avant validation | litige **ouvert** ⇒ confirmation **409** `VALIDATION_BLOCKED_BY_DISPUTE`, **0** validation | ✅ |
| **C07-DISPUTE** (fenêtre) | ordinaire **hors fenêtre** ⇒ **422** `DISPUTE_WINDOW_CLOSED` ; **fraude** hors fenêtre ⇒ **201** (toujours recevable) | ✅ |
| gel après validation | litige ouvert sur montant **validé** ⇒ opération dépendante **409** `ROUND_CLOSE_BLOCKED_BY_DISPUTE`, écriture **non effacée** | ✅ |
| permission objet | rôle sans droit (`member`) qui valide ⇒ **403** `FEATURE_PILOT_FORBIDDEN` | ✅ |
| anti-IDOR | objet **hors portée** (`groupIds` vides) ⇒ **403** | ✅ |
| version optimiste | `expectedVersion` divergent ⇒ **409** `EVENT_CHAIN_BREAK`, **sans écriture** | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation,
aucune contre-écriture surnuméraire) et la **non-divulgation** (erreurs stables,
identifiants fictifs, montants en chaînes). Côté **domain** (23 tests, sans HTTP) :
préconditions d'état, indépendance/anti-cumul, seuil `requiredControllers`,
compensation unique, motif obligatoire, fenêtre ordinaire vs fraude, blocage de
validation et gel des dépendances — transitions déterministes et reproductibles.

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C07, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
node --check packages/db/tests/isolation.pg.mjs   # → exit 0 (syntaxe valide)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C07-SELF | `self_confirm_accepted = false` (trigger `contribution_act_independence`) **et** `distinct_confirm_accepted = true` | **BLOCKED** |
| C07-TRIPLE | `same_actor_second_accepted = false` (`UNIQUE (group, contribution, actor)`) **et** `third_actor_accepted = true` | **BLOCKED** |
| C07-REVERSE | `first_reversal_accepted = true`, `second_reversal_accepted = false`, `reversal_count = 1` (index partiel UNIQUE `contribution_one_reversal_per_original`) | **BLOCKED** |
| C07-DISPUTE | `ordinary_late_accepted = false` (CHECK `dispute_ordinary_window`) **et** `fraud_late_accepted = true` | **BLOCKED** |
| (C01→C06, C11) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE / IMMUTABLE / PENALTY / UNIQUE / OBLIGATION / APPEND-ONLY / CHECKPOINT / ROLLBACK / IDEMPOTENCE / REPLAY / RACE | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C07_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C07
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit f765bda7d61ca02553598bdad5a5359a88284541 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C07 + interfaces partagées (exports domain, routes api,
  enrichissement du chemin `disputes` et des schémas OpenAPI C07).
- Réutilisation **encadrée** du socle : `sealEventV1` / `GENESIS_HASH` et **types
  d'événement C11** déjà rejoués, RBAC ADR-0006 — tables `contribution` /
  `dispute` du socle 0001 **élargies** (0009 additif), non redéfinies ; `journal`
  et sa fonction append-only (0007) **intacts**.
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves
  de verrou / concurrence / atomicité / append-only / indépendance en base.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; la **résolution** de litige (gouvernance/vote) et le **mandat** (auteur ≠
  membre concerné) restent **hors pilote / gated serveur** (ADR-0005 / ADR-0018) —
  posés et testés en pur, **non activés**.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C07-SELF / C07-TRIPLE / C07-REVERSE / C07-DISPUTE (et les scénarios
  C01→C06, C11) → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les
  observations attendues (verrou `SELECT … FOR UPDATE`, sérialisation effective
  des compensations concurrentes, atomicité événement inverse / projection / outbox).
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **Notifications de validation** aux membres autorisés (6.4) et **gel de
  clôture** effectif du tour (6.5) côté calendrier = raccords C05/C13 à souder
  aux événements déjà émis ; **résolution** de litige = gouvernance/vote (P1).
