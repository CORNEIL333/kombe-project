# Preuves & revue — Lot C17 (console support : accès JIT, double approbation, sécurité opérationnelle) · KÓMBE

- **Commit C17 (code) :** `5d2ae9cfa8f46300de047f02c3a4089110626f9d`
- **Porte :** G0 · **Dépendances :** C02 (sessions/opérateur, révocation), C03 (groupe = périmètre d'accès), C11 (journal/scellement `sealEventV1`/`GENESIS_HASH`), C00 (erreurs stables, horloge injectée) · **Stories :** 8.5 (support externe : rétablit l'accès, explique les traces, **ne tranche ni litige ni versement**), 9.6 (accès just-in-time, **double approbation**, motif, expiration), 9.7 (journal de sécurité séparé, alertes), 14.7 (rédaction des logs — aucune donnée sensible en clair), 18.17 (accès temporaire du support, **aucun accès support ne valide une cotisation**) · **COM05** (deux approbateurs indépendants avant tout accès sensible)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**double approbation** gardée par trigger `kombe_support_grant_gate` (un `granted` avec < 2 approbateurs distincts refusé), **auto-approbation** refusée par `kombe_support_approver_distinct`, **même compte compté une seule fois** par `PRIMARY KEY (request_id, approver_identity_id)`, **permission financière stockée** refusée par `support_perms_support_only`, granted **sans expiration** refusé, **réactivation** d'un accès éteint refusée (CHECK de transition), **journal de sécurité append-only** (`security_log_append_only` + `REVOKE`) et **sans montant** (`security_log_no_amount`), **RLS** multitenant) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : demande d'accès **motivée** (motif obligatoire), **double approbation** par des identités **distinctes** de l'applicant et entre elles (COM05), `granted` **seulement au seuil de deux**, **expiration automatique** jugée sur une **horloge serveur injectée** (C17-JIT), **séparation stricte du pouvoir financier** — le support ne peut **jamais** valider/corriger/reverser un mouvement (C17-FINANCE), périmètre **par groupe** (anti-IDOR, ADR-0006), et **journal de sécurité expurgé** (téléphone / référence de paiement / suite chiffrée masqués **avant** écriture ; C17-LOGS).
- Réutilisation **encadrée** du socle : `DomainError` à codes stables (C00), RBAC/anti-IDOR `PRIVILEGE_NOT_GRANTED`/`APPROVER_NOT_DISTINCT` déjà contractés, `sealEventV1`/`GENESIS_HASH` non requis ici (le journal de sécurité C17 est un **flux distinct** du journal métier append-only C11 — pas de chaînage de hachage, sortant minimal expurgé). C17 **n'invente** aucune permission financière : `SUPPORT_PERMISSIONS` = {`view_trace`, `restore_access`, `explain_journal`} est **disjoint** de `FINANCIAL_ACTIONS` = {`validate_contribution`, `correct_contribution`, `reverse_disbursement`}.
- **Hors du périmètre « pur » maintenant (consigné, non simulé) :** MFA réel, vérification d'identité de session (C01), tickets numérotés avec horaires/responsable (8.5/18.18), alertes temps réel et anti-bot (9.7), CSP/CSRF/HSTS et durcissement cookies (14.4), secrets gestionnaire + rotation (14.3), chiffrement au repos (14.5), plan d'incident/drill S1-S2-S3 (14.9/18.18). Ces critères **P0** relèvent de l'infrastructure déployée et d'une **décision de gouvernance** (nommage) ; leur **substrat décisionnel** (modèle de permission, garde-fou base, rédaction) est posé ici, leur **exécutionpreuve** reste BLOCKED. C17 livre la **sandbox et les barrières**, pas l'activation.
- Fichiers impactés : `packages/domain/src/{support,securityLog,errors,index}.ts` ; `packages/api/src/{supportStore,server,schemas}.ts` ; tests domaine + API ; `packages/db/migrations/0014*` (+ down) **branchés** dans `scripts/migrate.mjs` et `tests/isolation.pg.mjs` ; `docs/openapi.yaml`.

## 2. Contractualiser
- **Erreurs stables ajoutées :** `SUPPORT_MOTIF_REQUIRED` (422), `SUPPORT_ACCESS_EXPIRED` (403 — accès non granted **ou** expiré, decision non divulguante), `SUPPORT_FINANCIAL_FORBIDDEN` (403 — pouvoir financier interdit au support). Réutilisation des codes du socle : `PRIVILEGE_NOT_GRANTED` (403 — permission financière/inconnue à la création, hors périmètre, permission absente), `APPROVER_NOT_DISTINCT` (403 — auto-approbation / double compte), `RESERVATION_INCOHERENTE` (404 — non-divulgation d'une demande inconnue ou hors groupe), `FEATURE_PILOT_FORBIDDEN` (403 — acteur non authentifié), `EVENT_CHAIN_BREAK` (409 — doublon d'enregistrement). Mapping complet dans `packages/api/src/server.ts` (`STATUS_BY_CODE`).
- **Invariants :** un accès sensible n'est **jamais** accordé sous deux approbateurs distincts (COM05) ; l'**approbateur ≠ demandeur** et les deux signataires sont **mutuellement distincts** ; l'accès est **temporellement borné** (`expiresAt = dernière approbation + ttl`) ; **aucune permission financière** n'existe pour le support, refusée **à la création** et **à l'action** (double garde, jamais par omission) ; le **périmètre est par groupe** (une action hors du groupe visé est refusée sans divulgation) ; l'**horloge est SERVEUR** (le client ne décide ni expiration ni acteur — ADR-0005) ; le **journal de sécurité expurge** téléphone / référence de paiement / suite chiffrée **avant** écriture, de façon **idempotente**, et rejette un type d'événement inconnu ( whitelist ). Chaque refus est **sans effet** (aucune mutation, `accessAllowed` jamais `true` sur un refus).
- **Migrations :** socle `0001` inchangé ; `0014_support_security.sql` **entièrement additive** (trois nouvelles tables seulement) : `support_access_request` (motif `CHECK btrim<>''`, `permissions <@ ARRAY['view_trace','restore_access','explain_journal']`, `required_approvals >= 2`, cohérence expiration/statut), `support_access_approver` (`PRIMARY KEY (request_id, approver_identity_id)` = distincté structurelle, trigger anti-auto-approbation, append-only + `REVOKE`), `security_log` (`event_type` whitelist CHECK, `detail !~` longues suites chiffrées, append-only + `REVOKE`). Trigger `kombe_support_grant_gate` : naissance `pending_approval` obligatoire, transitions légales, `granted` exige **≥ 2 approbateurs distincts** + expiration, version monotone (`NEW.version = OLD.version + 1`). RLS `tenant_isolation` sur les trois tables. La fonction partagée `kombe_journal_append_only` (propriété `0007`) **n'est pas** touchée. **Down** fourni, **réversible** (-drop dans l'ordre inverse). `0014` est **branchée explicitement** dans les listes ordonnées de `scripts/migrate.mjs` (UP_MIGRATIONS) et `tests/isolation.pg.mjs` (up après `0013`, down en tête) — les migrations ne sont **pas** auto-découvertes.
- **Contrat d'API :** `POST /v1/support/access-requests` (201, demande motivée — corps **sans** approbateur ni acteur ; permission financière → 403), `POST /v1/support/access-requests/{requestId}/approvals` (200, identité serveur distincte, ttl au corps ; auto/double compte → 403), `POST /v1/support/access-requests/{requestId}/actions` (200 `accessAllowed = true` seulement ; refus → 403 stable, jamais exécuté), `POST /v1/support/access-requests/{requestId}/revocations` (200), `GET /v1/groups/{groupId}/support/access-requests/{requestId}` (200 scopé, 404 anti-IDOR) — documentés dans `docs/openapi.yaml` (tag `support`, param `x-server-date`, schémas `SupportAccessRequestInput`/`SupportApprovalInput`/`SupportActionInput`/`SupportAccessView`/`SupportActionReceipt`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK, @kombe/worker OK   → exit 0
pnpm -r test       # vitest run (domaine + api + contrat + worker)         → exit 0
node --check packages/db/scripts/migrate.mjs                     # → exit 0
node --check packages/db/tests/isolation.pg.mjs                 # → exit 0 (0014 branchée)
python harness/run_h00.py --commit 5d2ae9c… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **273 passed** (dont **17** dédiés `support` : `test/support.test.ts`)
- `@kombe/api` → **158 passed** (dont **14** dédiés `support` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée** — 70 chemins, 53 schémas, chemins C00 intacts)
- `@kombe/worker` → 10 tests, 0 fail

### Hashes SHA-256 des artefacts C17 (au commit `5d2ae9c`)
| sha256 | Fichier |
|---|---|
| `fd07eca31fcd1c8a10d6d961e72f0489fb9128128a3888b6285bdeb3f11b1f3f` | `packages/domain/src/support.ts` |
| `9863093e97afcf76ff4344f5e9baf937dbd19a9fae69d8452f88dc89d7c1fcda` | `packages/domain/src/securityLog.ts` |
| `677ccc57fd435f44213e765de32166093f44d6c1fd5607f7330016a6b55ec8eb` | `packages/domain/src/errors.ts` |
| `391f38f90c5889a5c525e4395e79cdc5b2ed44e35ce0a306d9345e7a77232ed4` | `packages/domain/src/index.ts` |
| `c420dcafa072938800ffa45cb4dd37597c8c2c8fbcfb63a5c4884603a5326be2` | `packages/domain/test/support.test.ts` |
| `05b247bfc6a801d9c1861dd9a47572d1ac245416f758fa31602268d1e6e3ce79` | `packages/api/src/supportStore.ts` |
| `c841d0dd5ec914331d7a48f2c955b2182e056befe005fc659672ffa77e4fe998` | `packages/api/src/schemas.ts` |
| `d10de9b4d3ae5f32aee4e25d1a9590755c17b309a824a4e9c0e41fa113c981d7` | `packages/api/src/server.ts` |
| `3ed7b683ef69ed2e78dba075931f4108b6c0034ddb306be0e71e8592f96ebd57` | `packages/api/test/support.test.ts` |
| `2bbd5c1f21270d936de99e44e496c5fba508d8b50f7142b340b21ea89e675549` | `packages/db/migrations/0014_support_security.sql` |
| `5a92e42826ebd2114c5cb16e2d7e609bfe028f9bad2a5d1aed536d8bbb466da5` | `packages/db/migrations/0014_support_security.down.sql` |
| `62b7819aa45197078910223058b658475f9c43436ec0185cef4b20500d51652f` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C17, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| motif absent/blancs (9.6) | demande à motif vide ⇒ **422** `SUPPORT_MOTIF_REQUIRED`, **0** écriture | ✅ |
| **permission financière à la demande** (18.17) | `validate_contribution` demandé ⇒ **403** `PRIVILEGE_NOT_GRANTED`, **0** demande créée | ✅ |
| demande valide | 201, statut `pending_approval`, `approverCount = 0`, `requiredApprovals = 2` | ✅ |
| **un seul approbateur ne suffit pas** | après 1 approbation ⇒ reste `pending_approval` ; action ⇒ **403** `SUPPORT_ACCESS_EXPIRED` | ✅ |
| **auto-approbation** (COM05) | le demandeur s'approuve ⇒ **403** `APPROVER_NOT_DISTINCT` | ✅ |
| **double compte** (COM05) | même second approbateur appelé deux fois ⇒ **403** `APPROVER_NOT_DISTINCT` (domaine) | ✅ |
| **deux approbateurs distincts** | ⇒ `granted`, `approverCount = 2`, `expiresAt = dernière approbation + ttl` | ✅ |
| action autorisée dans la fenêtre | `restore_access` sur `granted` avant expiration ⇒ 200 `accessAllowed = true` | ✅ |
| **C17-JIT** accès expiré | action après expiration serveur (horloge injectée) ⇒ **403** `SUPPORT_ACCESS_EXPIRED`, `access_allowed = false` | ✅ |
| permission non accordée | `explain_journal` hors octroi ⇒ **403** `PRIVILEGE_NOT_GRANTED` | ✅ |
| **C17-FINANCE** valider cotisation | `validate_contribution`/`correct_contribution`/`reverse_disbursement` sur accès **granted** ⇒ **403** `SUPPORT_FINANCIAL_FORBIDDEN`, `validation_accepted = false`, **jamais exécutée** | ✅ |
| révocation immédiate | `revoked` ⇒ action ensuite **403** | ✅ |
| anti-IDOR (lecture scopée) | demande de `grpA` lue sous chemin `grpB` ⇒ **404** `RESERVATION_INCOHERENTE` (non-divulgation) ; sous `grpA` ⇒ 200 | ✅ |
| **C17-LOGS** canary sensible | motif contenant `+241 01 23 45 67` et `TXN-AB12CD34` : **aucune** entrée du journal de sécurité ne contient la canary ⇒ `sensitive_canary_in_logs = false` | ✅ |
| rédaction idempotente | ré-appliquer la rédaction sur une sortie masquée ne change rien | ✅ |
| type d'événement inconnu | un `eventType` hors whitelist ⇒ consigné `support_access_denied` (jamais une catégorie arbitraire) | ✅ |
| action financière refusée consignée | le refus financier crée **1** événement `support_financial_action_refused` (et le granted **1** `support_access_granted`) | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (refus **avant** mutation ; aucune autorisation implicite par omission) et la **non-divulgation** (erreurs stables, identifiants fictifs). Côté **domaine** (17 tests, sans HTTP) : création/motif, double approbation et distincté, expiration, périmètre par groupe, boucle `C17-FINANCE`, rédaction (téléphone, référence, idempotence, type inconnu, erreur prestataire brute).

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
Ce lot est `in_review`. **qoder** l'a produit ; il **ne peut pas** signer son propre `done`. La relecture (diff, migrations, permissions minimales, non-divulgation, absence d'effet sur chaque refus) doit être exécutée et signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`), **jamais auto-validée**. Points d'attention soumis au relecteur :
- **Discrétion du schéma vs domaine :** `permissions` est laissé **ouvert** côté zod (`z.array(z.string())`) pour que la **politique** (refus financier/inconnu) vive **unique** dans le domaine + le `CHECK` base — pas dupliquée dans le schéma. À confirmer comme choix (refus observable en 403, pas 422 de schéma).
- **Version optimiste C17 :** le store bump `version` sur `approve`/`revoke` (mutation) mais **pas** sur `act` (une épreuve d'action ne mute pas l'objet). La migration impose `NEW.version = OLD.version + 1` ; raccord à souder lors de la persistance réelle (C01/postgres).
- **Journal de sécurité ≠ journal C11 :** flux distinct, **non chaîné** ; la `security_log_no_amount` (`!~ [0-9]{6,}` borné par des blancs) est un garde-fou **résiduel**, la rédaction domaine restant la barrière primaire. À valider comme suffisant (les canaries de test passent ; le motif business reste stocké en clair côté `support_access_request`, ce qui est **voulu** — motif nécessaire à l'audit, distinct du log).

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C17, **codés et prêts** via la migration `0014` branchée dans `tests/isolation.pg.mjs`, exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C17 double approbation | `UPDATE … SET status='granted'` avec < 2 approbateurs distincts **refusé** par `kombe_support_grant_gate` | **BLOCKED** |
| C17 auto-approbation | `INSERT support_access_approver` par le demandeur **refusé** par `kombe_support_approver_distinct` | **BLOCKED** |
| C17 distincté compte | second `INSERT` même `(request_id, approver_identity_id)` **refusé par la PK** | **BLOCKED** |
| C17-FINANCE en base | `permissions` contenant une action financière **refusé** par `support_perms_support_only` | **BLOCKED** |
| C17 granted sans expiration | `UPDATE granted` avec `expires_at IS NULL` **refusé** | **BLOCKED** |
| C17 réactivation | transition `revoked/expired → granted` **refusée** (CHECK de transition) | **BLOCKED** |
| C17-LOGS base | `UPDATE`/`DELETE security_log` **refusés** (trigger + `REVOKE`) ; `detail` avec suite chiffrée **refusé** (`security_log_no_amount`) ; RLS isotope le `group_id` | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |
| MFA / tickets / alertes temps réel / CSP-CSRF-HSTS / secrets / chiffrement / drill (14.3-14.9, 18.18) | infra déployée + gouvernance (hors G0 « pur ») | **non activé — sandbox/barrières posées** |

## 7. Rapport H00 au SHA C17
```
$env:PYTHONUTF8=1
python harness/run_h00.py --commit 5d2ae9cfa8f46300de047f02c3a4089110626f9d --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28). **C17 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec les observations (PK `support_access_approver`, triggers `kombe_support_grant_gate`/`kombe_support_approver_distinct`, `security_log` append-only + `security_log_no_amount`, RLS des trois tables).
- **Verrou concurrent / MFA / identité de session :** l'acteur (demandeur/approbateur) vient de l'**en-tête fictif** ; la résolution par session réelle + MFA (C01/C02) et la **sérialisation** de deux approbations concurrentes restent des raccords SQL, non posés comme preuve ici.
- **Registre de tickets & gouvernance (8.5 / 18.18) :** canal, horaires, numéro de ticket, responsable/suppléant nommés, drill S1-S2-S3 → **décision de gouvernance** (lead) hors du périmètre code pur ; consignés, non simulés.
- **Durcissement sécurité système (14.3 secrets/rotation, 14.4 cookies/CSRF/CSP/HSTS, 14.5 chiffrement au repos, 9.7 alertes temps réel + anti-bot) :** relèvent de la **config d'infrastructure déployée** et de la revue sécurité ; la **décision de rédaction** et le **modèle de permission** sont posés (substrat), leur **preuve d'exécution** reste BLOCKED.
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; **observations DB C17 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
