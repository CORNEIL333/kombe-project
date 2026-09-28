# Preuves & revue — Lot C06 (déclarations partielles et idempotence) · KÓMBE

- **Commit C06 (code) :** `b99e3b298bfb03e68e75481a0db39c06f710a126`
- **Porte :** G0 · **Dépendances :** C00 (`444c207`, canonicalisation/chaîne), C01 (rôles/RLS), C04 (`c998d8e`), C05 (`159a483`), C11 (`30e90ca`, scellement d'événement) · **Stories :** 6.1 (déclarer un montant, espèces/électronique, date alléguée), 6.9 (aucune valeur par défaut d'argent, pas de preuve présumée), 18.1 (idempotence de commande), 18.2 (concurrence/version optimiste), 18.3 (déclarations partielles, excédent bloqué)
- **Auteur / cycle :** Lead C06 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (verrou réel
  `SELECT … FOR UPDATE`, **sérialisation concurrente**, **atomicité**
  événement/projection/registre/outbox, **append-only effectif** du registre
  d'idempotence par trigger + `REVOKE`, refus de seconde application d'une même
  clé scopée par l'`UNIQUE`) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : **hash canonique RFC 8785 du
  corps sémantique** (absent ≠ valeur) ; **décision d'idempotence** rejeu /
  conflit / exécution sur clé scopée `(acteur, groupe, type, clé)` ; **droits
  relus avant** de servir un rejeu ; **capacité sous verrou** reposée sur
  l'oracle `remaining(due, validatedNet, activeReserved)` (balance.ts) ;
  **excédent bloqué** avant mutation ; **restant dû = dû − validé net** ; date
  **serveur** distincte de la date **alléguée** ; validation canal/motif.
- Réutilisation **encadrée** du socle : `canonicalHash` (ADR-0003), `remaining`
  (oracle de balance), `sealEventV1`/`GENESIS_HASH` (ADR-0004/0016), RBAC
  `assertAllowed`/`isCrossGroupAccess`/`assertExpectedVersion` (ADR-0006). C06
  **n'invente** ni la chaîne de hash, ni le socle obligation/contribution/command/
  outbox de `0001` ; il les **élargit**.
- Fichiers impactés : `packages/domain/src/contribution.ts` (neuf) + `errors.ts`
  (3 codes) + `index.ts` ; `packages/api/src/{contributionStore,server,schemas}.ts` ;
  `packages/db/migrations/0008*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0017_*` (+ `0000_index.md`) ;
  `docs/openapi.yaml` (tag `contributions`, 3 routes, 4 schémas, 3 codes).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `IDEMPOTENCY_BODY_CONFLICT` (409),
  `CONTRIBUTION_EXCEEDS_REMAINING` (409), `REFERENCE_JUSTIFICATION_REQUIRED`
  (422) — mapping dans `server.ts` ; codes référencés dans l'enum `ErrorCode` et
  les schémas de déclaration du contrat OpenAPI.
- **Invariants :** l'idempotence naît d'un **registre durable**, jamais d'un cache
  TTL — un cache expiré **ne recrée jamais** une exécution ; **même clé / même
  hash de corps = rejeu** du résultat d'origine **sans second événement** ;
  **même clé / corps différent = conflit 409** (jamais d'écrasement silencieux) ;
  les **droits sont relus avant** de servir un rejeu ; la **capacité = dû −
  réservations actives**, un montant au-dessus **lève** l'erreur **avant toute
  mutation** (excédent **bloqué**, **aucune** affectation automatique au tour
  suivant) ; le **restant dû affiché** naît du **validé net**, non des
  réservations ; une **référence électronique ne prouve jamais** l'authenticité
  (le registre garde une **affirmation**) ; la **date serveur** n'est **jamais**
  dérivable du corps soumis.
- **Migrations :** socle `0001` inchangé ; `0008_contribution_idempotency.sql`
  **additif** — table `idempotency_registry` (clé **scopée** `(acteur, groupe,
  type, clé)` `UNIQUE`, `body_hash`/`event_hash` 64-hex, FK vers `command`,
  `result_status IN ('applied')`, **trigger append-only** + **`REVOKE UPDATE,
  DELETE`** à `kombe_app`, RLS `tenant_isolation`) ; colonnes `command`
  (`actor_identity_id`, `command_type`, `body_hash` nullable) ; champs de preuve
  `contribution` (`channel` CHECK cash/electronic, `reference`, `justification`,
  `alleged_date`, `server_date` nullables) + CHECK `contribution_electronic_reference`
  (électronique sans référence exige un motif non vide). La **capacité sous verrou /
  excédent bloqué** reste gardé par le CHECK **hérité** de `0001`
  (`validated_net ≤ active_reserved ≤ due_amount`). **Down** fourni (ne **drop**
  pas la fonction partagée `kombe_journal_append_only`, propriété de `0007`).
  Ordre de rollback complet : `0008…down` → `0007…down` → … → `0001…down`.
- **Contrat d'API :** routes `POST /v1/groups/:groupId/declarations` (201 si
  appliqué, 200 si rejeu), `POST …/drafts` (brouillon sans soumission),
  `GET …/obligations/:obligationId` (lecture seule) — documentées dans
  `docs/openapi.yaml` (tag `contributions`, schémas `ContributionDeclaration`,
  `DeclarationReceipt`, `DraftReceipt`, `ContributionObligationView` ; montants
  rendus en **chaînes** pour préserver l'entier au-delà de JSON number).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **154 passed** (C11 134 + **contribution 20**)
- `@kombe/api` → **65 passed** (C11 55 + **contribution 10**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml + assertions ;
  l'enum `ErrorCode` inclut les 3 codes C06, le tag `contributions` et les
  schémas résolvent `$ref` `Money` ; aucun nom interdit `wallet|loan|scoring|insurance`).

### Hashes SHA-256 des artefacts C06
| sha256 | Fichier |
|---|---|
| `763ee2be724519247af64f93f4fe98a760ae7908b2ce910e6a4fd0283d1bfc73` | `packages/domain/src/contribution.ts` |
| `ac85023d7064d45b87870e4e4a4e29b1f7ebfc5f3bd553cb88dad942d88db0b0` | `packages/domain/src/errors.ts` |
| `363c597281f256fa86d1d6635567d1c4e70c8c7aded2ff92d2d3ffc6591b62ae` | `packages/domain/src/index.ts` |
| `39fd5f87577515f8bc9ba749e9d315253b38d1a73a4ad317d4693f47d2fdfb29` | `packages/domain/test/contribution.test.ts` |
| `ec373ee66df420c79abbc7f56a7688d53ffabdd549214fea33f8ea8d8b921aed` | `packages/api/src/contributionStore.ts` |
| `1b4a491292c9a43d810efb069a269b885dde9912703f8d1a5bf6ae7aa0b03244` | `packages/api/src/schemas.ts` |
| `9cc31697d573ff0c9bbc4af958165bd232756c53fa8e8828ac4a65cd54a7a216` | `packages/api/src/server.ts` |
| `220815744fee3063c73ce91c064244977271b1286c863d547102ec99cd4efedc` | `packages/api/test/contribution.test.ts` |
| `963e2551c396f00ec74d466da72d8750c4b4b942f6c098005999a9186ac972e7` | `packages/db/migrations/0008_contribution_idempotency.sql` |
| `ef57b4c3c00463f21097ee241b47b5cd31436f76cba393cc3115514578965766` | `packages/db/migrations/0008_contribution_idempotency.down.sql` |
| `d42f8ea35bc6c5485acd29625237fdfcfdc79d80905339c2ac924679300080ae` | `packages/db/tests/isolation.pg.mjs` |
| `aebcc424a6ea292680414a0e1fad04ae8d445f98dc3309ed4fc9027ec037646c` | `packages/db/DICTIONNAIRE.md` |
| `49eaa13e73bd47c729cd7a1ed14c20b1da306b4be011ae9272efe47cda556bc9` | `packages/db/README.md` |
| `f0f9d608024795d466865a0a757ad9aa64cf8da12c693dc16e045e52838ec7a0` | `docs/adr/0017_idempotence_registre_capacite_sous_verrou.md` |
| `abaff32ac3c5b70bc6ed56df7df00d0d423ebb793a5d20d4e7d98381caa649a2` | `docs/adr/0000_index.md` |
| `9871cf4c8e19f330560b5feaca6ca42b78d7d0d5cc72904913494d5b17d3e0dd` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C06, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C06-REPLAY** | 20 rejeux de la **même clé / même corps** ⇒ `contribution_count = 1`, `status = duplicate` (200), **aucun second événement** | ✅ |
| **C06-BODY** | même clé, **montant différent** ⇒ **409** `IDEMPOTENCY_BODY_CONFLICT` (jamais d'écrasement silencieux) | ✅ |
| **C06-RACE** | dette 5000, deux déclarations de 3000 ⇒ la **seconde refusée** (`CONTRIBUTION_EXCEEDS_REMAINING`, 409), `accepted_total = 3000` | ✅ |
| première application | `POST …/declarations` ⇒ **201** `applied`, réservation posée, événement scellé | ✅ |
| rejeu après « timeout » | relit le **registre durable**, rejoue le résultat d'origine, ne re-exécute pas | ✅ |
| droits relus avant rejeu | rejeu servi à un acteur **sans accès** ⇒ **403** (le résultat stocké ne franchit pas la barrière) | ✅ |
| cross-groupe | acteur d'un autre groupe ⇒ **403** `FEATURE_PILOT_FORBIDDEN` | ✅ |
| version optimiste | `expectedVersion` divergent ⇒ **409** `EVENT_CHAIN_BREAK` | ✅ |
| électronique sans référence | **sans motif** ⇒ **422** `REFERENCE_JUSTIFICATION_REQUIRED` ; **avec motif** ⇒ admis (affirmation, jamais preuve) | ✅ |
| brouillon | `POST …/drafts` ⇒ `submitted = false`, **aucune** mutation / réservation / événement | ✅ |
| lecture seule | `GET …/obligations/:id` ⇒ `remainingDue = dû − validé net`, `availableToDeclare = dû − réservations`, **sans mutation** | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation,
aucune sur-allocation) et la **non-divulgation** (erreurs stables, identifiants
fictifs, montants en chaînes). Côté **domain** (20 tests, sans HTTP) : hash de
corps stable et « absent ≠ valeur », rejeu vs conflit sur même clé, capacités
`availableToDeclare`/`remainingDue`, excédent bloqué, montant nul/négatif/hors
plafond refusés, validation canal/motif, décision d'idempotence déterministe.

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C06, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C06-IDEMPOTENCE | `registry_update_refused = true` (trigger + `REVOKE` sur `idempotency_registry`) **et** `duplicate_scoped_key_accepted = false` (seconde application d'une même clé scopée refusée par l'`UNIQUE`) | **BLOCKED** |
| C06-REPLAY | `replay_second_registry_insert_accepted = false` et `contribution_count = 1` (pas de second événement) | **BLOCKED** |
| C06-RACE | `second_course_accepted = false` et `accepted_total = 3000` (CHECK de capacité sous verrou `active_reserved ≤ due_amount`) | **BLOCKED** |
| (C01→C05, C11) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE / IMMUTABLE / PENALTY / UNIQUE / OBLIGATION / APPEND-ONLY / CHECKPOINT / ROLLBACK | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C06_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C06
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit b99e3b298bfb03e68e75481a0db39c06f710a126 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C06 + interfaces partagées (exports domain, routes api, tag
  OpenAPI `contributions`, schémas C06).
- Réutilisation **encadrée** du socle : `canonicalHash` / `remaining` /
  `sealEventV1` / `GENESIS_HASH` / RBAC — tables `obligation`/`contribution`/
  `command`/`outbox` du socle 0001 **élargies**, non redéfinies.
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves
  de verrou / concurrence / atomicité / append-only du registre.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; la **réconciliation** d'une référence électronique avec un relevé
  bancaire et les notifications restent **P1 gated serveur** (ADR-0005 /
  ADR-0017) — posées et testées en pur, **non activées** au pilote.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C06-IDEMPOTENCE / C06-REPLAY / C06-RACE (et les scénarios C01→C05, C11)
  → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les observations
  attendues (verrou `SELECT … FOR UPDATE`, sérialisation effective des courses).
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **Validation / compensation** d'une contribution (passage de la réservation au
  validé net, rôles de validation) et **consommation outbox / worker** = lots
  ultérieurs (C07+/C13) ; C06 pose la **déclaration** et son **idempotence**, pas
  le workflow de validation.
