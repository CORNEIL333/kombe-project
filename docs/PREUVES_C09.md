# Preuves & revue — Lot C09 (propositions, votes et décisions) · KÓMBE

- **Commit C09 (code) :** `a616ee9a59f669fea22f63f9e59e8a833c0ac8f2`
- **Porte :** G0 · **Dépendances :** C03 (électorat = membres actifs du groupe, cycle groupe), C04 (règles versionnées ⇒ quorum + version appliquées), C11 (scellement/chaîne `proposal.*`), C00 (canonicalisation RFC 8785 + oracle `voteResult`), C01 (rôles/RLS/anti-IDOR) · **Stories :** 7.1 (ouvrir une volée, électeurs figés), 7.2 (bulletin unique et identifié), 7.3 (clôture / annulation motivée, dénominateur figé), 7.4 (exécution contrôlée d'une décision approuvée, idempotente), 7.5 (historique chronologique des décisions), 18.5 (récusations/conflits d'intérêts, barrières serveur — le client ne décide ni acteur, ni électorat, ni quorum)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-30
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**unicité structurelle** du bulletin sous `PRIMARY KEY (vote_id, identity_id)` face à une double course, refus d'**éligibilité** en base, garde de **volée ouverte / hors délai serveur** par trigger `kombe_ballot_guards`, **transition d'état** `open→closed→executed` / annulation par trigger `kombe_vote_transition`, **append-only effectif** de l'instantané d'électorat et des bulletins par trigger + `REVOKE`, **RLS** multitenant) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : cycle de vie `open → closed → executed`, ou `cancelled` avant exécution ; **électorat figé** à l'ouverture (dénominateur incompressible — un départ ne change pas N ; pour le changer, annuler puis rouvrir) ; **bulletin unique** (oui/non/abstention) par électeur identifié ; **aucun vote après clôture** ni **après l'échéance SERVEUR** ; résultat adossé à l'**oracle indépendant** `voteResult` (quorum `ceil(2N/3)`, majorité **strictement** > moitié des oui/non exprimés, abstentions comptent **seulement** au quorum, **zéro suffrage exprimé rejette**) ; **exécution idempotente** portant résultat, acceptations individuelles et date d'effet ; **annulation motivée**.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH` (genèse 64 zéros, C00/C11), RBAC `assertAllowed`/`isCrossGroupAccess`/version optimiste (ADR-0006), oracle `voteResult` (C00, croisé avec le `reference_oracles.vote_result` Python), canonique RFC 8785 pour le hash de proposition. C09 **n'invente** aucun type d'événement hors de la boucle décisionnelle déjà contractée (A19) ; il **élargit** `vote`/`ballot` du socle `0001` via `0012` additif. Aucun **montant** ne circule en C09 (le vote ne porte pas de somme — ADR-0002 non applicable ici).
- Fichiers impactés : `packages/domain/src/{proposal,errors,index}.ts` ; `packages/api/src/{proposalStore,server,schemas}.ts` ; tests domaine + API ; `packages/db/migrations/0012*` (+ down) + `tests/isolation.pg.mjs` (branchement explicite) ; `docs/openapi.yaml`.

## 2. Contractualiser
- **Erreurs stables ajoutées :** `PROPOSAL_REASON_REQUIRED` (422), `PROPOSAL_DEADLINE_INVALID` (422), `PROPOSAL_STATE_INVALID` (409), `PROPOSAL_NOT_DUE` (409), `PROPOSAL_NOT_APPROVED` (409), `PROPOSAL_CANCEL_REASON_REQUIRED` (422), `PROPOSAL_SERVER_DATE_INVALID` (422, date serveur illisible ⇒ refus explicite, jamais un `0` silencieux) — mapping dans `server.ts`. Réutilisation des codes du socle : `ELECTORATE_INVALIDE` (422), `VOTE_HORS_LIMITES` (422, quorum hors limites / numérateur nul), `RULE_INVALID` (422, règles serveur absentes), `RESERVATION_INCOHERENTE` (404, non-divulgation d'une proposition inconnue), `FEATURE_PILOT_FORBIDDEN` (403), `EVENT_CHAIN_BREAK` (409, version d'objet dépassée / doublon d'ouverture).
- **Invariants :** **TOUTES les entrées de décision sont SERVEUR** (règle 18 / ADR-0005) — l'**électorat** provient de l'état serveur (`setGroupElectorate`, membres actifs), le **quorum et la version des règles** sont résolus côté serveur (`setGroupRules`, jamais un corps de requête), le **votant** est l'identité de session (en-tête résolu C01, jamais un champ du corps), l'**échéance** est `ouverture serveur + durée` et le retard est jugé sur l'horloge serveur. Un corps électoral ou un quorum **ne s'invente pas** : à défaut d'état serveur, `ELECTORATE_INVALIDE` / `RULE_INVALID` (422) **sans écriture**. Aucune **mutation silencieuse** : tout refus (non-électeur, double vote, hors délai, hors état, clôture avant échéance, exécution non approuvée) rend `voteAccepted = false` (ou une 4xx d'état) **avant** mutation — aucun bump de version, **aucun** événement scellé (vérifié par compteur d'événements). Exécution **idempotente** : une seconde exécution rend le même enregistrement **sans** nouvel événement `proposal.executed`. `quorum` à **numérateur nul refusé** (0/N incompressible ferait approuver par un seul oui).
- **Migrations :** socle `0001` inchangé ; `0012_proposal.sql` **additif** sur `vote`/`ballot` — métadonnées de volée (`subject_*`/`reason`/`canonical_hash` NOT NULL + `CHECK vote_subject_present`, `rules_version >= 1`, `opened_at`, `deadline`, `closed_at`/`effective_at`/`executed_at`/`cancelled_at`/`cancel_reason`, `quorum`/`approved`), enum d'état élargi à `executed`, **`deadline` verrouillée NOT NULL** après backfill (une volée sans échéance serveur est une violation d'invariant, non un blanc-seing du garde-fou hors délai). Table **`vote_electorate`** (`PRIMARY KEY (vote_id, identity_id)`, trigger de cohérence, append-only + `REVOKE` + RLS) = instantané d'électeurs. `ballot` ancré `group_id` + trigger `kombe_ballot_guards` (cohérence tenant, volée `open`, `now() <= deadline`, identité présente dans `vote_electorate`) + append-only + `REVOKE` + RLS. Trigger `kombe_vote_transition` : `open→closed/cancelled`, `closed→executed/cancelled`, `executed` exige `approved = true`, re-exécution bloquée. La fonction partagée `kombe_journal_append_only` (propriété `0007`) **n'est pas** touchée. **Down** fourni, **réversible** (rétrograde `executed→closed` avant de rétablir la `CHECK` d'état du socle, sinon rollback impossible). `0012` est **branchée explicitement** dans la liste ordonnée de `tests/isolation.pg.mjs` (les migrations ne sont **pas** auto-découvertes).
- **Contrat d'API :** `POST /v1/groups/:groupId/votes` (201, ouverture — corps **sans** électorat ni quorum), `POST /v1/votes/:voteId/ballots` (201 accepté / **200 refusé sans écriture**, 403/409/422), `POST /v1/proposals/:proposalId/closures` (200, `ExpectedVersion`), `POST /v1/proposals/:proposalId/cancellations` (200, `reason` obligatoire, `ExpectedVersion`), `POST /v1/votes/:voteId/executions` (200, idempotente), `GET /v1/groups/:groupId/votes/:voteId` (200 scopé, 403/404), `GET /v1/groups/:groupId/decisions` (200, `Vote[]` chronologique) — documentés dans `docs/openapi.yaml` (chemins A19 déjà requis par `test/contract.test.ts`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK      → exit 0
pnpm -r test       # vitest run (domaine + api + contrat)  → exit 0
node --check packages/db/tests/isolation.pg.mjs   # → exit 0 (syntaxe valide)
python harness/run_h00.py --commit a616ee9… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **256 passed** (dont **25** dédiés `proposal`)
- `@kombe/api` → **144 passed** (dont **21** dédiés `proposal` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée**, chemins A19 C00 intacts)

### Hashes SHA-256 des artefacts C09 (au commit `a616ee9`)
| sha256 | Fichier |
|---|---|
| `752dd99a77718085325c531ec00bd00751a1015138b9d9468b79edc7704d626d` | `packages/domain/src/proposal.ts` |
| `2d0c23b3bcabe65a37b53fa171331f25abe82ea3046ae8b11c10a8ac770a15f9` | `packages/domain/src/errors.ts` |
| `df394d25c6640149c806bc01b7c929d23d97cf36615926719c6b81cf7ac8f494` | `packages/domain/src/index.ts` |
| `df7f5d9d36958fca858b95ebb8c25a66b338f273d9768b1b5cbfd96d4164e998` | `packages/domain/test/proposal.test.ts` |
| `d8dbeec9fadba8081f94c47444cddc8385928239f44add4e2d7fb6bb05e909d2` | `packages/api/src/proposalStore.ts` |
| `da92c13755e84db1d55562149ab3f6cea385bf3631ed45ebc313a261a8e39919` | `packages/api/src/schemas.ts` |
| `72617495f7b05cb7a77d6f705d49097f8aee37b1b71aabd2cf40a2e821c55832` | `packages/api/src/server.ts` |
| `5558476f0df25952a02c53ca81493a7d8ed3df096c0e9e8c75e2a7fff3eb097c` | `packages/api/test/proposal.test.ts` |
| `b05465c6d30726eeb46a9190e9d66bbf12865f6ca0661db1231f9d7a5f5f3cce` | `packages/db/migrations/0012_proposal.sql` |
| `4b6621fb87579fcd42b34c8a70071a1c3b6d7926ff33908b829c622324d39c94` | `packages/db/migrations/0012_proposal.down.sql` |
| `ac57f005a5436c4c5e83ed71390e06613d3bf36615926719c6b81cf7ac8f494` | `packages/db/tests/isolation.pg.mjs` |
| `bb215386060d31dc90473ec98fc02c8bada0fe77964b30b438c49a9cb4aadc90` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C09, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| ouverture serveur | 201, état `open`, `electorateSize = 10` (scellé depuis l'état serveur), `canonicalHash` 64, `deadline = ouverture + 3600 s` | ✅ |
| **électorat non fourni par le client** | sans électorat serveur ⇒ **422** `ELECTORATE_INVALIDE`, **0** écriture | ✅ |
| **quorum/version non fournis par le client** | électorat posé mais **aucune règle serveur** ⇒ **422** `RULE_INVALID` (le client ne décide pas son quorum) | ✅ |
| rôle sans `vote.open` (trésorier) ouvre | **403** `FEATURE_PILOT_FORBIDDEN`, **0** événement | ✅ |
| doublon d'ouverture (même `proposalId`) | **409**, seconde ouverture refusée | ✅ |
| bulletin d'un électeur dans la volée | **201**, `voteAccepted = true`, 1 événement `proposal.ballot` | ✅ |
| **C09-PASS** | 10 électeurs, 4 oui / 2 non / 1 abstention ⇒ clôture 200, `quorum = 7`, `turnout = 7`, `approved = true` | ✅ |
| **C09-TIE** | 10, 3 oui / 3 non / 1 abstention ⇒ `approved = false` (majorité strictement > moitié) | ✅ |
| **C09-LATE** | bulletin après échéance serveur (date client ancienne ignorée) ⇒ `voteAccepted = false`, `reason = LATE`, **0** `proposal.ballot` | ✅ |
| double vote (7.2) | second bulletin ⇒ `voteAccepted = false`, `reason = ALREADY_VOTED`, **1** seul `proposal.ballot` | ✅ |
| non-électeur | `voteAccepted = false`, `reason = NOT_ELIGIBLE`, **0** écriture | ✅ |
| **dénominateur figé** | seuls 7 votent sur 10 ⇒ `quorum` calcifié sur N=10 (`ceil(20/3)=7`), pas sur le nombre de votants | ✅ |
| zéro suffrage exprimé | abstentions seules ⇒ comptées au quorum, rejetées faute de oui/non | ✅ |
| clôture avant échéance serveur | **409** `PROPOSAL_NOT_DUE`, sans écriture | ✅ |
| exécution approuvée puis **ré-exécution** | 1ʳᵉ `executed`, 1 événement `proposal.executed` ; seconde **idempotente** ⇒ même état, version figée, **aucun** second événement | ✅ |
| exécution non approuvée | **409** `PROPOSAL_NOT_APPROVED`, sans écriture | ✅ |
| annulation motivée | `reason` vide ⇒ **422** ; motif posé ⇒ `cancelled`, 1 `proposal.cancelled` | ✅ |
| annulation après exécution | refusée (`PROPOSAL_STATE_INVALID`) | ✅ |
| version optimiste | `expectedVersion` divergent ⇒ **409** `EVENT_CHAIN_BREAK`, sans écriture ; **mutation sans en-tête** ⇒ **422** (aucun défaut silencieux) | ✅ |
| anti-IDOR (lecture) | acteur d'un autre groupe ⇒ **403** ; objet inconnu sous chemin scopé ⇒ **404** `RESERVATION_INCOHERENTE` | ✅ |
| historique décisions (7.5) | `GET …/decisions` 200, `Vote[]` scopé groupe, tri chronologique par instant de décision | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation, compteur d'événements scellés inchangé) et la **non-divulgation** (erreurs stables, identifiants fictifs). Côté **domaine** (25 tests, sans HTTP) : scellement/échéance serveur, transitions déterministes, quorum/majorité via oracle, dénominateur figé, exécution idempotente, annulation, refus quorum numérateur nul.

## 5. Revue CodeReview appliquée (correctifs pré-commit)
Une revue pré-commit du lot a relevé un **bloquant** et cinq **avertissements** — **tous corrigés et re-vérifiés** (suite verte 256/144) :
- **Bloquant — quorum & version des règles pilotés par le client** : `quorumNumerator`/`quorumDenominator`/`rulesVersion` **retirés** de `openVoteBody` (schéma + OpenAPI + route) ; désormais résolus **côté serveur** (`setGroupRules`, miroir de `setGroupElectorate`), à défaut `RULE_INVALID` (422). Le domaine refuse aussi un **numérateur nul** (0/N incompressible). Test de non-régression : ouverture sans règle serveur ⇒ 422 `RULE_INVALID`.
- **Avertissement — bulletin refusé répondait 201** : la route renvoie **201** si `voteAccepted`, **200** sinon (refus sans écriture, convention C07/C08) ; OpenAPI documente 200/201/403/409/422.
- **Avertissement — OpenAPI omettait `ExpectedVersion` sur `/votes/{voteId}/ballots`** alors que la route exige l'en-tête de version : paramètre `ExpectedVersion` + réponse 422 ajoutés.
- **Avertissement — `/decisions` rendait des objets non conformes au schéma `Vote`** (manquaient `groupId`/`electorateSize`) et non chronologiques : `history()` renvoie désormais des **vues complètes** triées par instant de décision (`executed → closed → cancelled`).
- **Avertissement — `vote.deadline` nullable désarmait le garde-fou hors délai** en base : verrouillé **NOT NULL** après backfill ; le trigger `kombe_ballot_guards` refuse une échéance absente au lieu de la passer.
- **Avertissement — le `down` de `0012` échouait** si une décision était passée à `executed` (re-`CHECK` d'état du socle) : rollback **rétrograde `executed→closed`** avant de rétablir la `CHECK`.

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C09, **codés et prêts** via la migration `0012` branchée dans `tests/isolation.pg.mjs`, exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C09 unicité bulletin | second `INSERT ballot` même `(vote_id, identity_id)` **refusé par la PK** (unicité structurelle sous double course) | **BLOCKED** |
| C09 éligibilité | `INSERT ballot` par une identité absente de `vote_electorate` **refusé** par `kombe_ballot_guards` | **BLOCKED** |
| C09-LATE en base | `INSERT ballot` avec `now() > deadline` **refusé** par le trigger (horloge serveur) | **BLOCKED** |
| Volée fermée | `INSERT ballot` quand `vote.state ≠ 'open'` **refusé** | **BLOCKED** |
| C09 transitions | `UPDATE vote SET state` illégale (ex. `closed→open`) **refusée** par `kombe_vote_transition` ; `executed` sans `approved = true` **refusé** | **BLOCKED** |
| Électorat append-only | UPDATE/DELETE `vote_electorate` **refusés** (trigger + `REVOKE`) ; RLS isotope le `group_id` | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |

## 7. Rapport H00 au SHA C09
```
$env:PYTHONUTF8=1
python harness/run_h00.py --commit a616ee9a59f669fea22f63f9e59e8a833c0ac8f2 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28).

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec toutes les observations (PK du bulletin, triggers `kombe_ballot_guards`/`kombe_vote_transition`, append-only + RLS de `vote_electorate`).
- **Récusations / conflits d'intérêts (18.5)** appliqués à l'ouverture : dans le pilote, l'électorat serveur est posé tel quel par `setGroupElectorate` ; l'**exclusion** d'un membre récusé/conflit d'intérêts du dénominateur figé reste un raccord du lot qui **possède** les conflits d'intérêts (C03/C10), **consigné ici et non simulé** comme preuve SQL.
- **`setGroupRules` / quorum issu des règles versionnées** : posé côté serveur pour honorer la règle 18, mais **non encore adossé** au moteur de règles C04/C05 (snapshot versionné + hash) ; le raccord règles → vote est un suivi C04/C13.
- **Registre d'idempotence consommé** (rejeu `IdempotencyKey`) : les routes ne rejouent pas encore une clé (posée en C13) ; par honnêteté, l'`IdempotencyKey` est déclaré au contrat mais non exercé comme preuve de rejeu.
- **Rattachement tenant des identités votantes** : le bulletin suppose l'identité de session (C01) ; l'exigence d'**adhésion active** au groupe au moment du vote reste un raccord C03/C01, non posé comme preuve SQL ici.
- **CI/Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; **observations DB C09 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
