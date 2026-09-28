# Preuves & revue — Lot C11 (journal d'événements, projections, intégrité) · KÓMBE

- **Commit C11 (code) :** `30e90ca385baeb67eb69997fd532e789a991b06b`
- **Porte :** G0 · **Dépendances :** C00 (`444c207`, chaîne de hash), C01 (`role/RLS`), C04 (`c998d8e`), C05 (`159a483`) · **Stories :** 9.1 (journal append-only), 9.3 (timeline), 9.4 (journal métier vs technique), 9.5 (totaux calculés) ; 9.2 (chaîne d'intégrité **P1**, restriction conservée)
- **Auteur / cycle :** Lead C11 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (append-only
  **effectif** par trigger + `REVOKE`, immutabilité de la table `checkpoint`,
  atomicité événement/projection/outbox sous rollback) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : **replay versionné** des totaux
  par obligation (`validatedNet`, `declaredReserved`) **depuis les seuls
  événements** ; **enveloppe scellée** couvrant acteur/rôle instantané/date
  serveur/commande dans le hash ; **vérification indépendante** (intégrité de
  hash, continuité depuis genèse fixe, séquence incrémentale, alignement des
  checkpoints) **qui ne répare jamais** ; **timeline** en langage clair, filtrée
  par droits, sans payload brut.
- Réutilisation **encadrée** du socle : `sealEvent`/`verifyEventIntegrity`
  (chaîne RFC 8785, genèse 64 zéros — ADR-0004), `canonicalHash` (ADR-0003),
  `GENESIS_HASH`. L'enveloppe C11 vit **dans le payload** et ne redéfinit pas le
  profil de hash.
- Fichiers impactés : `packages/domain/src/journal.ts` (neuf) + `errors.ts` (2
  codes) + `authorization.ts` (2 actions RBAC) + `index.ts` ;
  `packages/api/src/{journalStore,server,schemas}.ts` ;
  `packages/db/migrations/0007*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0016_*` (+ `0000_index.md`) ;
  `docs/openapi.yaml` (tag `journal`, schémas C11).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `REPLAY_VERSION_UNKNOWN` (422),
  `CHECKPOINT_MISMATCH` (409) — mapping dans `server.ts` ; codes référencés dans
  l'enum `ErrorCode` et le résultat `JournalVerifyResult` du contrat OpenAPI.
- **Invariants :** le journal est **la source des totaux**, jamais l'inverse (9.5) ;
  un rejoueur rencontrant une **version future inconnue lève** `REPLAY_VERSION_UNKNOWN`
  (jamais de tolérance muette) ; la **compensation retracte** le net **sans effacer**
  l'événement d'origine ; `verifyJournal` **ne recalcule jamais** une chaîne pour
  masquer une altération — un recalcul « réparant » resterait pris en défaut par le
  **checkpoint externe** ; un checkpoint scelle (groupe, seq, headHash) par hash
  canonique et son **écriture est hors des privilèges applicatifs** ; la timeline
  **masque totalement** un événement privé (litige) pour un rôle non autorisé et ne
  rend dans `summary` que des **entiers sûrs**.
- **RBAC (interfaces partagées déclarées) :** `journal.read` (tous les rôles —
  lecture timeline) et `journal.checkpoint` (auditor/secretary/treasurer **seulement**).
  Aucune n'accorde d'**écriture** au journal.
- **Migrations :** socle `0001` inchangé ; `0007_event_journal.sql` **additif**
  (colonnes d'enveloppe **nullables et rejouables** ; trigger `journal_append_only`
  `BEFORE UPDATE OR DELETE` + `REVOKE UPDATE, DELETE ON journal FROM kombe_app` ;
  table `checkpoint` — FK composite vers `journal`, hashes 64-hex, trigger
  d'immutabilité, **`REVOKE INSERT, UPDATE, DELETE`** à `kombe_app`, RLS) ; **down**
  fourni (restaure les grants, drop trigger/table/colonnes). Rejouable : aucun
  remaniement de lignes existantes. Ordre de rollback complet : `0007…down` →
  `0006…down` → `0005…down` → `0004…down` → `0003…down` → `0002…down` → `0001…down`.
- **Contrat d'API :** routes `GET /v1/groups/:groupId/journal/verify`,
  `GET …/timeline` (query `type`), `POST …/journal-checkpoints` (201),
  `POST …/projections-rebuild`, + traces de test `POST …/journal-appends` (NON PROD)
  et `POST …/journal-tamper-tests` — documentées dans `docs/openapi.yaml` (tag
  `journal`, schémas `JournalVerifyResult`, `Checkpoint`, `CheckpointRequest`,
  `TimelineEntry`, `TimelineView`, `RebuildResult`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **134 passed** (C05 115 + **journal 19**)
- `@kombe/api` → **55 passed** (C05 47 + **journal 8**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml + assertions ;
  l'enum `ErrorCode` inclut les 2 codes C11, le tag `journal` et les schémas
  résolvent `$ref` `Money`/`JournalEvent`).

### Hashes SHA-256 des artefacts C11
| sha256 | Fichier |
|---|---|
| `6b539da8d48605e01414e1fd1f19474270a4f8d7910e065de2b3bfd2e02e74d4` | `packages/domain/src/journal.ts` |
| `0d9dc27c42329f9c83b3e63402c760d7d3aba9265691f0c7fe7598ea7860936e` | `packages/domain/src/authorization.ts` |
| `84bdf0f75f58529f1d10a4638aa869571e052f72520a1daa27c866a995a037de` | `packages/domain/src/errors.ts` |
| `7156eab5ce271493493f528e7b36dc4c53feef6ec9ea506d539be339221cca85` | `packages/domain/src/index.ts` |
| `805b7f8542047bd1192ea491590bc22591628e3fbf16582a336ebaba0f71e895` | `packages/domain/test/journal.test.ts` |
| `5c4cc79d55405c3b8684733bce40b68cc8bf61eacfc648f06712df8f02f60c81` | `packages/api/src/journalStore.ts` |
| `d06e3036c5b254b50256daf23b889f0d65a6898603452a9c1eacaba4c9c0b4ec` | `packages/api/src/schemas.ts` |
| `3d1577ada9faba51c3912d6c61dc7bd7661c5b0d018b2116ff942c3798c06d64` | `packages/api/src/server.ts` |
| `b531014c2303c9a9c8466f41821253adf2fdc41cbe410c0ce7819ac16a57e1eb` | `packages/api/test/journal.test.ts` |
| `880351caa04d063ee7dfb1e9c1ce183ada62bba019b0807599efcb1cad612510` | `packages/db/migrations/0007_event_journal.sql` |
| `79710f7ec45918c0b3a65fbf00f14e7c6cc36ef409f5f1468d261994c6e8a373` | `packages/db/migrations/0007_event_journal.down.sql` |
| `01298246d346ab6e4c545f9d4cccc6b16d03930b1d35ce2fbbfefd7b83c17b06` | `packages/db/tests/isolation.pg.mjs` |
| `af40357849f50cd45fd6f02c005bece68e0f07e3da80095fc39bfd125136f0ba` | `packages/db/DICTIONNAIRE.md` |
| `3916646a264e6388e309ee18fc0364e704b6bfd8e5a9d93b3a23bfcd536adf4b` | `packages/db/README.md` |
| `21c1b8b80e9d04314b4d99fceb96f99479b7aba0006803e147669241937fd09c` | `docs/openapi.yaml` |
| `5b79b3439ba34e8be22c6f489fd26fed9c9e8151ecdf61da5b862875e83c3acc` | `docs/adr/0016_journal_evenements_projections_integrite.md` |
| `56dabfe0ca689d7286be0270cfcc63961ad0f885d2337e39fd70d052c4aa948f` | `docs/adr/0000_index.md` |

## 4. Éprouver (scénarios propres à C11, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C11-REBUILD** | `projections-rebuild` rejoue le journal ⇒ `projection_matches = true` à l'identique de la référence | ✅ |
| **C11-REBUILD (divergence)** | référence deliberately fausse ⇒ `projection_matches = false`, puis **reconcile** vers le rejoué | ✅ |
| **C11-TAMPER** | altérer un montant d'une **copie** ⇒ `tamper_detected = true` **et** `internal_chain_intact = true` (la détection ne touche pas la chaîne réelle) | ✅ |
| verify chaîne intacte | `GET …/journal/verify` ⇒ `intact = true` | ✅ |
| checkpoint réservé | `POST …/journal-checkpoints` : auditor ⇒ 201 ; member ⇒ **403** (`FEATURE_PILOT_FORBIDDEN`) | ✅ |
| timeline langage clair | libellés français (« Cotisation déclarée » …), **jamais** le `type` brut | ✅ |
| filtre par type | `?type=contribution.validated` ⇒ uniquement ce type | ✅ |
| non-divulgation | le payload brut (`obligationId`) **n'apparaît pas** dans la timeline rendue | ✅ |

Côté **domain** (19 tests, sans HTTP) : enveloppe scellée couverte par le hash
(falsifier acteur/date ⇒ hash change), replay versionné + compensation qui
retracte sans effacer, refus de `REPLAY_VERSION_UNKNOWN` (version future) et de
montant invalide, checkpoints scellés, `verifyJournal` détectant **altération de
hash / déchaînement / séquence divergente** et **refusant de réparer** (le
checkpoint externe prend en défaut une chaîne « recalculée »), timeline filtrée
sans divulgation du privé.

Chaque chemin négatif vérifie l'**absence d'effet** (copie altérée ≠ chaîne
réelle) et la **non-divulgation** (erreurs stables, identifiants fictifs).

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C11, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C11-APPEND-ONLY | `update_refused = true` **et** `delete_refused = true` sur une ligne `journal` posée (trigger + `REVOKE`), `row_present_after = 1` | **BLOCKED** |
| C11-CHECKPOINT | `checkpoint_app_insert_refused = true` (écriture `checkpoint` retirée à `kombe_app`) | **BLOCKED** |
| C11-ROLLBACK | `partial_commit_count = 0` (rollback d'un lot command+journal+outbox ⇒ aucune écriture partielle) | **BLOCKED** |
| (C01→C05) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE / IMMUTABLE / PENALTY / UNIQUE / OBLIGATION | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C11_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C11
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit 30e90ca385baeb67eb69997fd532e789a991b06b --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C11 + interfaces partagées déclarées (exports domain, routes
  api, actions RBAC `journal.read`/`journal.checkpoint`, tag OpenAPI `journal`,
  schémas C11).
- Réutilisation **encadrée** du socle C00 : `sealEvent`/`verifyEventIntegrity`/
  `canonicalHash`/`GENESIS_HASH` — table `journal` du socle 0001 **élargie**, non
  redéfinie ; le hash d'un événement reste calculé **hors son propre champ `hash`**.
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves
  d'append-only / atomicité / checkpoint.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; P1 (9.2 chaîne d'intégrité par vérification **externe** et détection d'une
  réécriture rétroactive administrateur) **non activée** au pilote (ADR-0005 /
  ADR-0016) — le mécanisme est posé et testé en pur, la promesse dépend des
  checkpoints hors privilèges, pas d'une capacité activée du pilote.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C11-APPEND-ONLY / C11-CHECKPOINT / C11-ROLLBACK (et les scénarios
  C01→C05) → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les
  observations attendues.
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **Consommation outbox / worker** = lot **C13** ; **idempotence registre complet**
  (same-key/different-body 409, réservations sous verrou, totaux partiels) = lot
  **C06** (dépendances C01/C04/C05/C11 désormais satisfaites) — à enchaîner.
- **Vérification par tiers** avec distribution des checkpoints hors base = opération
  d'**exploitation** (C17/C29), non activée au pilote.
