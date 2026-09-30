# Preuves & revue — Lot C08 (décaissements, frais, rapprochement et clôture) · KÓMBE

- **Commit C08 (code) :** `ea119eb51f8e5615fc0f331897d8e443fb6f5184`
- **Porte :** G0 · **Dépendances :** C07 (validations/corrections cotisations, cotisations validées nettes au rapprochement), C10 (litige bloquant → clôture), C11 (scellement/replay `disbursement.requested` / `disbursement.completed` / `disbursement.reversed`), C00 (canonicalisation/chaîne + oracle `reconciliation`), C01 (rôles/RLS), C04 (règles/seuil de contrôleurs), C05 (obligation soldée) · **Stories :** 2.8 (déclaration/suppléance/confirmation), 6.10 (séparation des pouvoirs, indépendance du contrôle, contre-écriture unique), 18.4 (frais groupe ≠ frais personnels, égalité de clôture, écart jamais masqué), 18.9 (clôture normale refusée si écart/litige/impayé, arrêt exceptionnel non équilibré, jamais de remboursement externe)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-30
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**verrou réel** `SELECT … FOR UPDATE`, **sérialisation concurrente** de deux contre-écritures d'un même original, **atomicité** événement `disbursement.reversed` / projection / outbox, **append-only effectif** des actes et contre-écritures par trigger + `REVOKE`, refus d'**indépendance** et de **cohérence de groupe** **en base** par trigger + `UNIQUE`/PK) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : machine à états `requested → completed → reversal_requested → reversed` ; **séparation des pouvoirs** (le déclarant n'est jamais le bénéficiaire ⇒ suppléant, `DISBURSEMENT_SUBSTITUTE_REQUIRED`, refus **sans écriture**) ; **confirmation par le bénéficiaire seul** (`NOT_BENEFICIARY`) ; **contrôle distinct et indépendant** (`NOT_INDEPENDENT`, anti-cumul `ACTOR_ALREADY_ACTED`, seuil `requiredControllers`, confirmation préalable exigée) ; **demande → approbation INDÉPENDANTE → contre-écriture UNIQUE** (`DISBURSEMENT_REVERSAL_NOT_INDEPENDENT`, `DISBURSEMENT_ALREADY_REVERSED`, `reversalCount ≤ 1`, le **bénéficiaire** jugerait sa propre cause ⇒ exclus) ; **jamais de remboursement externe** (`refundedExternally` structurellement `false`) ; **grand livre** frais **pot** vs **personnel hors pot** (jamais déduit) ; **rapprochement** et **décision de clôture** adossés à l'**oracle indépendant** `reconciliation` ; **arrêt exceptionnel** conservant l'écart et se disant **non équilibré**.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH`, RBAC `assertAllowed`/`isCrossGroupAccess`/version optimiste (ADR-0006), monnaie entière à **plafond par montant** (ADR-0002, `kombe_money ≤ 1 000 000 000`), oracle `reconciliation` (C00). C08 **n'invente** aucun nouveau type d'événement hors de la boucle décaissement déjà contractée ; il **élargit** `disbursement` du socle `0001`.
- Fichiers impactés : `packages/domain/src/{disbursement,errors}.ts` ; `packages/api/src/{disbursementStore,server,schemas}.ts` ; tests domaine + API ; `packages/db/migrations/0011*` (+ down) + `tests/isolation.pg.mjs` (branchement explicite) ; `docs/openapi.yaml` ; correctif d'honnêteté `harness/run_h00.py` (H07).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `DISBURSEMENT_STATE_INVALID` (409), `DISBURSEMENT_SUBSTITUTE_REQUIRED` (422), `DISBURSEMENT_ALREADY_REVERSED` (409), `DISBURSEMENT_REVERSAL_NOT_INDEPENDENT` (403), `DISBURSEMENT_SERVER_DATE_INVALID` (422, date serveur illisible ⇒ refus explicite, jamais un `0` silencieux) — mapping dans `server.ts`.
- **Invariants :** aucune **mutation silencieuse** (précondition d'état, refus **avant** écriture) ; **séparation des pouvoirs** et **indépendance** non désactivables (acte refusé = `actAccepted = false`, **pas** une 4xx banale, sans écriture) ; **contre-écriture unique** d'un original ; **frais groupe ≠ frais personnels** (les seconds exclus du rapprochement) ; `contributions validées nettes = décaissements nets + frais groupe` pour la clôture normale ; **écart jamais masqué** (un `reversal_requested` reste compté aux sorties) ; **clôture normale** refusée si écart ≠ 0 **OU** litige bloquant **OU** impayé affectant le pot ; **toutes les entrées de décision de clôture sont SERVEUR** (le client ne peut ni forcer `normalCloseAccepted`, ni masquer un écart, ni cacher un litige — barrières serveur, règle 18 / ADR-0005) ; `refundedExternally = false` **structurel** (KÓMBE ne transfère aucun fonds).
- **Migrations :** socle `0001` inchangé ; `0011_disbursement.sql` **additif** — colonnes `obligation_id` (NOT NULL + **FK composée** `(group_id, obligation_id)` vers `obligation`), `beneficiary_identity_id`/`declarant_identity_id` **NOT NULL** + `CHECK (declarant <> beneficiary)` (suppléance, non contournable par NULL), montants `kombe_money`, `personal_fees_out_of_pot`, `required_controllers`, `refunded_externally` figé à `false` (CHECK) ; **table `disbursement_reversal` à PRIMARY KEY = `disbursement_id`** (l'**unicité de contre-écriture est structurelle** sous concurrence, pas un compteur lisible-modifiable) + trigger d'indépendance exigeant **demande préalable + état `reversal_requested`** et excluant déclarant/bénéficiaire/demandeur ; table d'actes `disbursement_act` (`UNIQUE (group_id, disbursement_id, actor_identity_id)`, trigger à **trois gardes** : déclarant ne contrôle pas, seul le bénéficiaire confirme, contrôle suppose confirmation) + append-only + `REVOKE UPDATE, DELETE` + RLS. **Down** fourni et symétrique. La fonction partagée `kombe_journal_append_only` (propriété `0007`) **n'est pas** touchée. `0011` est **branchée explicitement** dans la liste ordonnée de `tests/isolation.pg.mjs` (les migrations ne sont **pas** auto-découvertes).
- **Contrat d'API :** `POST /v1/groups/:groupId/disbursements` (201), `POST …/disbursements/:id/confirmations` (200), `…/control` (200), `…/reversal-requests` (200), `…/reversals` (200, feuille alignée sur l'opération C00 `confirmDisbursementReversal`), `GET …/disbursements/:id` (vue scopée), `GET …/rounds/:roundId/reconciliation` (200, **sans aucun paramètre de décision**) — documentés dans `docs/openapi.yaml`.

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK      → exit 0
pnpm -r test       # vitest run (domaine + api + contrat)  → exit 0
node --check packages/db/tests/isolation.pg.mjs   # → exit 0 (syntaxe valide)
python -m py_compile harness/run_h00.py            # → exit 0
```
Résultats réels :
- `@kombe/domain` → **231 passed** (dont **29** dédiés `disbursement`)
- `@kombe/api` → **123 passed** (dont **24** dédiés `disbursement` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée**, chemins A19 C00 intacts)

### Hashes SHA-256 des artefacts C08 (au commit `ea119eb`)
| sha256 | Fichier |
|---|---|
| `f8d19c9edc0bcb6e52cfbfa38f3c1a879a24e7b385c1bcf813963a240d262e2f` | `packages/domain/src/disbursement.ts` |
| `3404f8a5dddf5b25d2c21123b64b53f63d3f6e5183d5f177c8c2b55cc89dc704` | `packages/domain/src/errors.ts` |
| `97a259a16330de7e09d418c7e980ea17886bc7f6743fbee402fc7ccf5d330fe1` | `packages/domain/test/disbursement.test.ts` |
| `ea7da27945e3ce4c5abfd09fa7e6268866b08654c3bbd695eb6165f944123f34` | `packages/api/src/disbursementStore.ts` |
| `f0b36e22fa2b4f980e704e3c5a6e34b05f09e50c49cb80fa9274c44fd0640063` | `packages/api/src/server.ts` |
| `af28ad6219bffbd763cf6abee0c07728a436abfc06b07ced02b60922783c778a` | `packages/api/src/schemas.ts` |
| `e8da0670fe3911b45ccaa597fe6ed95b36db402bbd5dcfb718bed433bb27aa30` | `packages/api/test/disbursement.test.ts` |
| `86168f23e94a0ed7ce8e8ecab5c6c8a99b8d16e10865617813773fd75a96bd5d` | `packages/db/migrations/0011_disbursement.sql` |
| `7e933cf1bbb470d5adff53c6b02cec856c5e79b4abe2cffd96498f066ccd2428` | `packages/db/migrations/0011_disbursement.down.sql` |
| `b01e6d3b01df7890b3b91abebb83428a79d644a6b967f18317fdb691d50086c9` | `packages/db/tests/isolation.pg.mjs` |
| `ae159fdbb8fa2283a8e603c07d9ecc8d66e2d857523d6d17cf238583bfdfb1eb` | `docs/openapi.yaml` |
| `1cd4e9e2f36bfc9986a8a36c2f6f5d09d6af2265791876f226549550b12b7eb5` | `harness/run_h00.py` |

## 4. Éprouver (scénarios propres à C08, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| trésorier déclare pour autrui | 201, `requested`, `reversalCount = 0`, `refundedExternally = false`, 1 événement `disbursement.requested` | ✅ |
| **séparation des pouvoirs** | bénéficiaire se déclare lui-même ⇒ **422** `DISBURSEMENT_SUBSTITUTE_REQUIRED`, **0** écriture | ✅ |
| membre sans droit déclare | **403** `FEATURE_PILOT_FORBIDDEN`, **0** événement | ✅ |
| confirmation non-bénéficiaire | `actAccepted = false` (`NOT_BENEFICIARY`), **0** `disbursement.completed` | ✅ |
| confirmation parachève (seuil 0) | `completed`, 1 événement `disbursement.completed` | ✅ |
| contrôle déclarant/bénéficiaire | `actAccepted = false` (`NOT_INDEPENDENT`) | ✅ |
| contrôleur distinct parachève | `completed = true` au seuil, 1 événement | ✅ |
| **C08-CORRECTION** | demande → approbation indépendante ⇒ `reversed`, `reversalCount = 1`, **1** `disbursement.reversed` ; **seconde course ⇒ 409** `DISBURSEMENT_ALREADY_REVERSED`, compteur figé à 1 | ✅ |
| approbateur = demandeur/déclarant | **403** `DISBURSEMENT_REVERSAL_NOT_INDEPENDENT` | ✅ |
| **bénéficiaire approuve le sien** | **403** `DISBURSEMENT_REVERSAL_NOT_INDEPENDENT`, **0** `disbursement.reversed` (il jugerait sa propre cause) | ✅ |
| **C08-BALANCE** | 50000 validés (**serveur**), 49000 décaissés, 1000 frais ⇒ `reconciliationGap = "0"`, `normalCloseAccepted = true` | ✅ |
| **C08-GAP** | 50000/48000/1000 ⇒ `reconciliationGap = "1000"`, `normalCloseAccepted = false`, `blockedByGap` | ✅ |
| **clôture forcée par query** | paramètres client `validatedNetTotal`/`hasBlockingDispute` **ignorés** ; total serveur 50000 ⇒ gap **1000** maintenu, clôture refusée | ✅ |
| litige bloquant **serveur** | à écart nul, `setRoundBlockers` ⇒ `normalCloseAccepted = false`, `blockedByDispute = true` | ✅ |
| **frais personnels hors pot** | à écart nul : `personalFeesOutOfPot = 2000` **exclu** du total imputable, gap reste 0 | ✅ |
| anti-IDOR (lecture) | acteur d'un autre groupe ⇒ **403** ; objet d'un autre groupe sous un chemin tiers ⇒ **404** `RESERVATION_INCOHERENTE` | ✅ |
| tour inconnu | rapprochement sans écriture serveur ⇒ **404** (jamais un solde inventé par défaut) | ✅ |
| version optimiste | `expectedVersion` divergent ⇒ **409** `EVENT_CHAIN_BREAK`, sans écriture ; **mutation sans en-tête** ⇒ **422** (aucun défaut silencieux à 1) | ✅ |
| plafond par montant | montant `> 1 000 000 000` ⇒ `MONEY_OVER_PER_AMOUNT_CEILING` (domaine, ADR-0002) | ✅ |
| `reversal_requested` compté | somme nette/frais **incluent** l'objet en correction (écart non masqué) | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation, aucune contre-écriture surnuméraire) et la **non-divulgation** (erreurs stables, identifiants fictifs, montants rendus en **chaînes**). Côté **domaine** (29 tests, sans HTTP) : transitions déterministes, indépendances, somme des sorties, grand livre, clôture via oracle, arrêt exceptionnel non équilibré.

## 5. Revue CodeReview appliquée (verdict précédent « non prêt » → réglé)
Une revue a refusé le commit initial (2 blocants, 5 majeurs, 9 mineurs). Correctifs **appliqués et re-vérifiés** (seconde revue : « aucun bloquant de sécurité subsistant ») :
- **Bloquant — clôture pilotée par le client** : la query `validatedNetTotal`/`hasBlockingDispute`/`hasUnpaidAffectingPot` est **supprimée** ; `reconcile(ctx, groupId, roundId)` lit un état **serveur** (`roundStates`, posé par `setRoundValidatedNet`/`setRoundBlockers`, **jamais une route**). Test de non-régression : paramètres hostiles ignorés, gap maintenu.
- **Bloquant — lectures non authentifiées/ignorant `groupId`** : `view`/`reconcile` passent par `gateRead` (authentification + `isCrossGroupAccess` ⇒ 403 ; `record.groupId ≠ groupId` ⇒ 404 non-divulgation).
- **Majeur — `reversal_count <= 1` ne bloquait pas la course** : remplacé par la **PRIMARY KEY** `disbursement_reversal(disbursement_id)` = unicité **structurelle** ; NOTE amendiée (preuves SQL = BLOCKED).
- **Majeur — suppléance contournable par NULL** : `beneficiary`/`declarant` **NOT NULL** + `CHECK (declarant <> beneficiary)`.
- **Majeur — trigger amputé** : trois gardes (déclarant ne contrôle pas, seul le bénéficiaire confirme, contrôle suppose confirmation).
- **Majeur — bénéficiaire pouvait approuver sa propre correction** : exclu (domaine + trigger reversal + tests domaine/API).
- **Majeur — H07 rendait vert une migration cassée** : `rc==2`/`status BLOCKED` ⇒ BLOCKED ; **tout autre non-zero (rc==1 sans observations, rc==0 sans PASS) ⇒ FAIL** ; `TimeoutExpired` ⇒ FAIL, `OSError` ⇒ BLOCKED.
- **Mineurs** : `serverDate` via `Date.parse` (NaN ⇒ erreur explicite) ; version **stricte** sur mutations (ctx `declare`/lecture séparés) ; `reversal_requested` **inclus** aux sommes ; plafond `perAmount` à la déclaration ; `obligation_id` NOT NULL + **FK composée**.

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C08, **codés et prêts** dans `tests/isolation.pg.mjs` (migration `0011` branchée), exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C08-CORRECTION | second `INSERT disbursement_reversal` **refusé par la PK** (unicité structurelle sous concurrence), `reversal_count` jamais > 1 | **BLOCKED** |
| Séparation des pouvoirs | `INSERT disbursement` déclarant = bénéficiaire **refusé** par `CHECK disbursement_substitute_required` | **BLOCKED** |
| Indépendance de contre-écriture | `INSERT disbursement_reversal` par déclarant/bénéficiaire/demandeur **refusé** par trigger ; sans demande préalable ou hors `reversal_requested` **refusé** | **BLOCKED** |
| Actes de contrôle | `confirm` non-bénéficiaire / `control` sans confirmation / cumul même acteur **refusés** (trigger + `UNIQUE`) ; UPDATE/DELETE `disbursement_act` **refusés** (append-only + `REVOKE`) | **BLOCKED** |
| Rapprochement sous verrou | total validé vs sorties recalculés **sous `SELECT … FOR UPDATE`**, clôture normale atomique | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |

## 7. Rapport H00 au SHA C08
```
$env:PYTHONUTF8=1
python harness/run_h00.py --commit ea119eb51f8e5615fc0f331897d8e443fb6f5184 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28).

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les observations (PK de contre-écriture, triggers d'indépendance, append-only, verrou de rapprochement).
- **Action RBAC dédiée au `control`** et **`requiredControllers` issu des règles versionnées** (C04) : dans le pilote, le seuil vient du corps de commande et le contrôle est gardé par l'appartenance au groupe + l'indépendance d'objet ; l'ancrage règles → C04/C13.
- **Registre d'idempotence consommé** (rejeu `IdempotencyKey`) : la route `declare` ne rejoue pas encore une clé (posée en C13) ; par honnêteté, **aucun en-tête `IdempotencyKey` n'est documenté** sur `POST …/disbursements` dans l'OpenAPI.
- **Rattachement tenant des identités** : la base référence `identity` (global) et scoping effectif par RLS sur `group_id` de la ligne + `obligation (group_id, …)` ; l'exigence d'**adhésion active** du bénéficiaire/déclarant au groupe reste un raccord C03/C01 (session), non posé ici comme preuve SQL.
- **Colonnes NOT NULL additives** : `0011` ajoute `obligation_id`/`beneficiary_identity_id`/`declarant_identity_id` NOT NULL sans défaut — sur une table **peuplée**, la passe réelle exige ajout nullable → backfill → `SET NOT NULL` (consigné dans le NOTE de `0011`, non masqué). Le pilote écrit depuis le début avec ces colonnes (table vide à l'application).
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20 ; **schémas OpenAPI détaillés** (corps actuellement `{ type: object }`, enrichi en suivi) et **observations DB C08 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
