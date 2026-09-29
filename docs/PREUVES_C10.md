# Preuves & revue — Lot C10 (litiges et recours) · KÓMBE

- **Commit C10 (code) :** `c11279d51b37160f0b7bcafbcf14caac0f5fb1c2`
- **Porte :** G0 · **Dépendances :** C03 (`gouvernance`, séparation des pouvoirs / rôles), C11 (`30e90ca`, scellement/replay **privé** des événements `dispute.opened` / `dispute.resolved`), C07 (`f765bda`, `dispute` C07 : fenêtre 7 j, motif, blocage/gel, cotisation validée), C00 (`444c207`, canonicalisation/chaîne), C01 (rôles/RLS) · **Stories :** 8.1 (ouvrir un dossier : motif + correction demandée, pièces désactivées, vue commune vs détail privé), 8.2 (résolveurs **indépendants**, rôle ≠ indépendance, « tous impliqués » ⇒ gel + procédure externe), 8.3 (résolution **sans aucun montant**, correction via C07/C08, **recours lié** à l'original), 8.4 (temps **calendaire** vs **ouvré** distincts) · **Débloque :** C08 (corrections / décaissements)
- **Auteur / cycle :** Lead C10 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**indépendance à
  la désignation** effective par trigger `dispute_assignment_independence`,
  **anti-double-désignation** par `UNIQUE`, **résolution documentée** et
  **recours lié** par CHECK, **append-only effectif** des désignations par trigger
  + `REVOKE`, **course** résolution/réouverture sous verrou `SELECT … FOR UPDATE`)
  est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : **dossier recevable** (motif **et**
  correction demandée non vides, pièces désactivées) ; **vue commune** (existence /
  statut / issue) vs **détail privé** (motif, correction, parties) réservé aux
  parties — rétention **structurelle** ; **indépendance vérifiée à la désignation**
  (levant/impliqué refusés) et **à l'acte** (résolveur désigné ET indépendant) ;
  **désignation vide** ⇒ « tous impliqués » ⇒ **gel maintenu** + procédure externe ;
  **résolution = zéro montant** (aucun canal monétaire, `validated_total_delta = 0`
  structurel), l'issue **référence** des écritures C07/C08 sans les créer ;
  **recours** rouvrant lié à l'original (historique préservé, `reopenCount` borné) ;
  **gel de clôture** d'un tour dès qu'une obligation porte un litige ouvert ;
  **temps calendaire vs ouvré** (fenêtre 08:00–18:00 UTC lun–ven) distincts.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH` et **types
  d'événement `dispute.opened` / `dispute.resolved` déjà rejoués comme PRIVÉS par
  C11** ; `ORDINARY_DISPUTE_WINDOW_SECONDS` / `raiseDispute` /
  `assertValidationNotBlocked` / `assertDependentOperationsNotBlocked` de **C07**
  (fenêtre, motif, blocage/gel) **sans redéfinition** ; RBAC `assertAllowed` /
  `isCrossGroupAccess` / `assertExpectedVersion` (ADR-0006). C10 **n'invente**
  aucun nouveau type d'événement ni nouvelle chaîne ; il **prolonge** `dispute` de
  `0001`/`0009`.
- Fichiers impactés : `packages/domain/src/disputes.ts` (neuf) + `errors.ts`
  (5 codes) + `authorization.ts` (`dispute.resolve` → secrétaire) + `index.ts` ;
  `packages/api/src/{disputeStore,server,schemas,validationStore}.ts` ;
  `packages/db/migrations/0010*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0019_*` (+ `0000_index.md`) ;
  `docs/openapi.yaml` (paths C10, 5 codes, 8 schémas).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `DISPUTE_NOT_RESOLVABLE` (409),
  `DISPUTE_ALREADY_RESOLVED` (409), `DISPUTE_RESOLVER_NOT_DESIGNATED` (403),
  `DISPUTE_RESOLVER_NOT_INDEPENDENT` (403), `DISPUTE_RESOLUTION_REQUIRED` (422) —
  mapping dans `server.ts` ; référencées dans l'enum `ErrorCode` du contrat
  OpenAPI. (`DISPUTE_REASON_REQUIRED` / `DISPUTE_WINDOW_CLOSED` /
  `ROUND_CLOSE_BLOCKED_BY_DISPUTE` **réutilisés** de C07, non redéfinis.)
- **Invariants :** dossier = motif **et** correction non vides ; **pièces
  désactivées** (aucun champ) ; **vue commune sans champs privés** (rétention
  structurelle, non un filtrage) ; **une hiérarchie de rôle ne remplace pas
  l'indépendance** (le rôle ouvre la porte, l'objet la ferme) ; **résolution qui
  ne reçoit AUCUN montant et n'émet AUCUN événement monétaire** —
  `validated_total_delta = 0` **structurel** ; **correction exclusivement** via
  compensation C07/C08 **référencée** par l'issue ; **recours lié** à l'original
  (jamais circulaire, historique préservé) ; **gel de clôture ciblé** sans
  effacement ; **temps calendaire ≠ temps ouvré**, fenêtre ouvrée **explicite et
  unique**.
- **RBAC :** `dispute.resolve` est **nouvellement** accordé au rôle `secrétaire`
  dans `authorization.ts` ; l'indépendance **par objet** (n'être ni levant ni
  impliqué) reste appliquée **en domaine** et **en base** (trigger).
- **Migrations :** socles `0001`/`0009` inchangés ; `0010_dispute_cases.sql`
  **additif** — colonnes `dispute` (`requested_correction`, `outcome`,
  `resolved_at`, `resolved_by_identity_id`, `reopened_from_dispute_id` FK) + CHECK
  `dispute_requested_correction_present` (ouverture recevable 8.1), CHECK
  `dispute_resolution_documented` (`resolved` exige issue + résolveur tracé 8.3),
  CHECK `dispute_reopen_links_self` (recours lié à l'original 8.3) ; table
  append-only `dispute_assignment` (`UNIQUE (dispute_id, assigned_identity_id)`
  anti-double-désignation, **trigger `kombe_dispute_assignment_independence`**
  refusant le levant **ou** le déclarant d'une cotisation de l'obligation
  contestée, **trigger append-only** + **`REVOKE UPDATE, DELETE`** à `kombe_app`,
  RLS `tenant_isolation`). **Aucune colonne monétaire.** **Down** fourni (ne
  **drop** pas la fonction partagée `kombe_journal_append_only`, propriété de
  `0007`). Ordre de rollback complet : `0010…down` → `0009…down` → `0008…down` →
  … → `0001…down`.
- **Contrat d'API :** `POST /v1/groups/:groupId/dispute-cases` (201, détail au
  levant), `GET …/dispute-cases` (liste de vues **communes**),
  `GET …/dispute-cases/:disputeId` (commune vs détail selon partie),
  `POST …/:disputeId/resolvers` (200), `POST …/:disputeId/resolution` (200),
  `POST …/:disputeId/appeals` (200), `POST …/round-close-attempts` (200/409) —
  documentés dans `docs/openapi.yaml` (schémas `DisputeCaseRequest`,
  `DisputeCommonView`, `DisputeRecord`, `ResolversRequest`,
  `DisputeResolutionRequest`, `RoundCloseRequest`, `DisputeActReceipt`,
  `RoundCloseReceipt` ; **aucun champ de montant**).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **202 passed** (C07 177 + **disputes 25**)
- `@kombe/api` → **99 passed** (C07 77 + **disputes 22**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml **sans clé
  dupliquée** + assertions ; l'enum `ErrorCode` inclut les 5 codes C10 ; les
  chemins C10 sont **neufs** et n'écrasent aucun `operationId` existant ;
  aucun nom interdit `wallet|loan|scoring|insurance`).

### Hashes SHA-256 des artefacts C10
| sha256 | Fichier |
|---|---|
| `e363294f4d4c33ccb440db7ae23a1da23f28a2f83b8abade1e190bfbe386f106` | `packages/domain/src/disputes.ts` |
| `f87ec3e8cfbb466cf3cee26a22ad88ed5ba58bf048e9f3a9bd620bf82a063c8a` | `packages/domain/test/disputes.test.ts` |
| `29ef64144c82d845e48e1754a24e421c562879ab3d75505109b9b6642f0c1e1c` | `packages/api/src/disputeStore.ts` |
| `55629110252669c820c5d3c3b31eb883c092940f8f8c2310eb28e55c0e80a663` | `packages/api/test/disputes.test.ts` |
| `4aeccb9a714a81a9610772ddf7b91aaaf090bd1490e3717260149574bbf59ca0` | `packages/api/src/server.ts` |
| `150937c0ea5ac86b81199fc5f7b93b86c8451dcedac2a7668a9f10ba77cc00bc` | `packages/api/src/schemas.ts` |
| `bd6cda6d4103e2331fc66ed668dae4dfa12049789d064a4b8816069a6d819c1b` | `packages/db/migrations/0010_dispute_cases.sql` |
| `c47913dc57ab64dd17ec6d7c527f63564b8bda6bfcba611fe61be9bc77a1a44b` | `packages/db/migrations/0010_dispute_cases.down.sql` |
| `b1fe9e7a41a202e9cd656f1f581e173e8af69a8ce6aaafae8e2c8a5e972e5282` | `packages/db/tests/isolation.pg.mjs` |
| `55a1ea4213c186b74cdc4c80dc3b5c033a527f08d47c34ce04b8fceae1fd6a7d` | `docs/adr/0019_litiges_recours_independance_resolution_sans_montant.md` |
| `c4c3d0a210b82720a47b3963f2cd8b297c77800b81bdcabe52bf54bf348f0dc4` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C10, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| ouverture dossier | membre ouvre ⇒ **201**, état `open`, **levant résolu côté serveur** | ✅ |
| correction absente | ouverture **sans correction demandée** ⇒ **422** `DISPUTE_RESOLUTION_REQUIRED`, **0** dossier | ✅ |
| permission lever | rôle sans droit (`treasurer` n'a pas `dispute.raise`) ⇒ **403** | ✅ |
| **C10-PRIVACY** (non-partie) | membre du groupe **non partie** ⇒ vue **commune** ne contenant **ni** `reason` **ni** `requestedCorrection` **ni** identité de partie (`private_details_returned = false`) | ✅ |
| **C10-PRIVACY** (partie) | levant / résolveur désigné ⇒ **détail complet** (motif + correction + parties) | ✅ |
| **C10-PRIVACY** (liste) | `GET …/dispute-cases` ⇒ **vues communes seulement**, quel que soit le demandeur | ✅ |
| anti-IDOR | dossier d'un **autre groupe** ⇒ **403** ; identifiant inconnu ⇒ **404** non divulguant | ✅ |
| **C10-INDEP** (désignation) | désigner un **impliqué** ⇒ **403** `DISPUTE_RESOLVER_NOT_INDEPENDENT` ; un **indépendant** ⇒ 200 | ✅ |
| **C10-RESOLVE** | sur cotisation **validée** C07, la **résolution** laisse la vue de la cotisation, son `journalTailHash` et les **compteurs d'événements bit-à-bit identiques** (`expect(after).toEqual(before)`, `validated_total_delta = 0`) | ✅ |
| **C10-RESOLVE** (négatifs) | résolveur **non désigné** ⇒ **403** ; **sans issue** ⇒ **422** et état **`open` inchangé** ; **double résolution** ⇒ **409** `DISPUTE_ALREADY_RESOLVED` ; version obsolète ⇒ **409** `EVENT_CHAIN_BREAK` | ✅ |
| **recours** (8.3) | levant rouvre un dossier résolu ⇒ lié à l'original, `reopenCount = 1`, **première résolution historisée** ; **non-levant** ⇒ **403** non révélateur | ✅ |
| **C10-FREEZE** | litige **ouvert** sur une obligation du tour ⇒ clôture **409** `ROUND_CLOSE_BLOCKED_BY_DISPUTE` (`normal_close_accepted = false`) ; après **résolution** ⇒ clôture **admise 200** et cotisation **toujours validée** ; un **recours re-gèle** ; membre sans rôle qui clôture ⇒ **403** | ✅ |
| temps calendaire vs ouvré (8.4, domain) | sam→lun 09:00 = 48 h **calendaires** mais **1 h ouvrée** ; lun+72 h = **30 h ouvrées** ; sam+6 j = **41 h ouvrées** (fenêtre lun–ven 08:00–18:00 UTC) | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation,
aucun total touché, aucun écrit surnuméraire) et la **non-divulgation** (vue
commune sans privé, erreurs stables, identifiants fictifs). Côté **domain**
(25 tests, sans HTTP) : recevabilité motif+correction, rétention structurelle de
la vue commune, indépendance à la désignation et à l'acte, résolution sans
montant, double résolution, recours lié rétablissant le gel, garde de clôture,
et calculs calendaire/ouvré — transitions déterministes et reproductibles.

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C10, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
node --check packages/db/tests/isolation.pg.mjs   # → exit 0 (syntaxe valide)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C10-CASE | `case_no_correction_accepted = false` (CHECK `dispute_requested_correction_present`), `case_with_correction_accepted = true`, `resolve_no_outcome_accepted = false` (CHECK `dispute_resolution_documented`) | **BLOCKED** |
| C10-RESOLVE | la base n'a **aucun canal vers un total** — `dispute`/`dispute_assignment` ne portent **aucune colonne monétaire** | **BLOCKED** |
| C10-INDEP | `raiser_assigned = false` + `independent_assigned = true` (trigger `kombe_dispute_assignment_independence`), `duplicate_assigned = false` (`UNIQUE`), `assignment_update_refused = true` (append-only + `REVOKE`) | **BLOCKED** |
| C10-REOPEN | `reopen_self_link_accepted = true`, `reopen_cross_link_accepted = false` (CHECK `dispute_reopen_links_self`) | **BLOCKED** |
| (C01→C07, C11) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE / IMMUTABLE / PENALTY / UNIQUE / OBLIGATION / APPEND-ONLY / CHECKPOINT / ROLLBACK / IDEMPOTENCE / REPLAY / RACE / SELF / TRIPLE / REVERSE / DISPUTE | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C10_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C10
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit c11279d51b37160f0b7bcafbcf14caac0f5fb1c2 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (porte BLOCKED)
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C10 + interfaces partagées (exports domain, `dispute.resolve`
  → secrétaire dans la matrice RBAC, routes api, chemins/schémas OpenAPI neufs,
  ajout de `journalTailHash` en **lecture** sur `validationStore` C07 pour la
  sonde d'intégrité C10-RESOLVE — sans modifier les attentes de recette C07).
- Réutilisation **encadrée** du socle : types d'événement **privés** C11 déjà
  rejoués, fenêtre/motif/gel **C07** réutilisés sans redéfinition, RBAC ADR-0006 —
  table `dispute` du socle 0001/0009 **prolongée** (0010 additif), non redéfinie ;
  `journal` et sa fonction append-only (0007) **intacts**.
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves
  de verrou / concurrence / atomicité / append-only / indépendance en base ;
  **aucun montant** ne transite par C10 (résolution structurellement neutre).
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; la **production de statistiques 8.4** (médiane/p90/dossiers ouverts) et
  la **procédure externe** pour litige « tous impliqués » restent **gated serveur**
  (ADR-0005) — posées et testées en pur, **non activées**.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C10-CASE / C10-RESOLVE / C10-INDEP / C10-REOPEN (et les scénarios
  C01→C07, C11) → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les
  observations attendues (indépendance effective par trigger, anti-double-
  désignation par `UNIQUE`, course résolution/réouverture sous verrou, atomicité
  désignation/journal/outbox).
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **Assouplissement éventuel** de la rétention du détail privé pour l'**auditeur
  non partie** (choix volontairement restrictif ici) = arbitrage de gouvernance à
  trancher (ADR-0019 §Limites).
- **Débloque C08** : la correction monétaire d'un litige résolu passe par le
  circuit de compensation C07/C08 que l'issue **référence** ; le raccord
  décaissements (C08) est le chaînon suivant de cette voie.
