# Preuves & revue — Lot C16 (données personnelles : notices, registre, consentement séparé, droits, export filtré, effacement/restauration) · KÓMBE

- **Commit C16 (code) :** `afab4f710b96e82c036bba6c9647f0e298f3bf62`
- **Porte :** G0 · **Dépendances :** C02 (identité — sujet résolu serveur), C03 (groupe/membres = service cœur et périmètre d'accès), C12 (socle export/empreinte et langage prudent, `in_review`, code commité `f61ae19` traité comme **stable** — même règle divulguée que C08→C12), C00 (erreurs stables, horloge injectée, canonicalisation/hash) · **Stories :** 13.1 (notices légales versionnées), 13.2 (contenu factuel — ni placeholder ni promesse), 13.3 (registre des traitements), 13.4 (consentement séparé du service cœur), 18.10 (droit à l'effacement, purge par tombstones, restauration), 18.19 (droits d'accès/export/rectification/opposition à **vérification proportionnée**)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**notices append-only** gardées par trigger `legal_notice_append_only` + `REVOKE UPDATE/DELETE` et **CHECK `body !~*`** interdisant placeholder et promesse, **tombstones append-only** (`data_erasure_tombstone`, propriété de la restauration), **`personal_consent` dont la CHECK borne structurellement les catégories à `research`/`marketing`/`future_ai`** — le service cœur ne peut donc **jamais** être une catégorie de consentement révoquée, **RLS** multitenant de `rights_request` sur `group_id`, **`rights_erasure_high_verification`** exigeant un seuil ≥ 3 pour un effacement, **`rights_frozen_needs_motif`** exigeant un motif non vide pour tout gel) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : des **notices légales versionnées** refusant à la publication tout placeholder (`bientôt`, `TBD`, `coming soon`, `[…]`, `{…}`, `___`) et toute **promesse de garantie des fonds / de preuve légale / de rentabilité** (mention prudente systématique) ; un **registre des traitements factuel** exigeant une **base légale connue** et une **durée de conservation entière ≥ 1 jour** ; un **consentement strictement séparable** où recherche / marketing / IA future sont **facultatifs** et où la **disponibilité du service cœur** est résolue **serveur** depuis l'appartenance active — un refus de consentement ne la coupe **jamais** (C16-CONSENT) ; des **demandes de droits à vérification proportionnée** (seuils access=1 / rectification·opposition·export=2 / effacement=3) qui **ne sont jamais refusées d'office** (statut `requires_more_info`, pas `refusée`), un gel **motivé et daté** obligatoire, et une exécution bloquée tant que le seuil n'est pas atteint ; un **export personnel filtré** qui **exclut structurellement tout champ privé d'un autre membre** (`third_party_private_fields = 0`, C16-EXPORT) ; une **purge par tombstones idempotente** et une **restauration qui réapplique effacements ET révocations postérieurs** avant réouverture (une identité effacée après le point reste invisible, `deleted_identity_visible = false`, C16-RESTORE) ; et la distinction **pseudonymisé ≠ anonyme** (risque de réidentification porté par les quasi-identifiants).
- Réutilisation **encadrée** du socle : `DomainError` à codes stables (C00), `csvText`/`sha256` ne sont **pas** réutilisés ici (aucun fichier produit) ; montants **typés** non pertinents pour ce lot. C16 **n'invente** aucune valeur juridique : `PRIVACY_PRUDENT_NOTICE` affirme que « les paiements restent hors application et ne sont garantis par KÓMBE. Aucun document ne constitue une preuve légale automatique » ; le store **ne prétend pas** purger un vrai cache/index/backup ni authentifier une session réelle.
- **Hors du périmètre « pur » maintenant (consigné, non simulé) :** l'exécution effective d'un droit (notification du responsable de traitement, délais RGAA/RGPD réels, propagation aux index/caches/backups/objet-storage), la suppression physique (le modèle pose un **tombstone logique**, la purgeDifférée et l'anonymisation irréversible relèvent de l'infra déployée et du raccord C29), le registre versionné « qui s'applique à quelle période » (règles non rétroactives, C04/ADR-0014) et la compensation de recherche réelle. Leur **substrat décisionnel** (modèles, gardes-fou base, seuils, motif de gel, filtrage d'export) est posé ici ; leur **preuve d'exécution** reste BLOCKED.
- Fichiers impactés : `packages/domain/src/{privacy,errors,index}.ts` ; `packages/api/src/{privacyStore,server,schemas}.ts` ; tests domaine (`test/privacy.test.ts`) + API (`test/privacy.test.ts`) ; `packages/db/migrations/0016*` (+ down) **branchés** dans `scripts/migrate.mjs` et `tests/isolation.pg.mjs` ; `docs/openapi.yaml`.

## 2. Contractualiser
- **Erreurs stables ajoutées (5) :** `PRIVACY_IDENTIFIANT_REQUIS` (422 — identifiant de notice ou sujet de demande vide), `PRIVACY_CONTENU_PLACEHOLDER` (422 — contenu à placeholder, date non `AAAA-MM-JJ`, genre de notice/base légale/catégorie de droit inconnu, catégories de données vides, durée de conservation non entière ou `< 1`), `PRIVACY_CONSENTEMENT_CATEGORIE_INCONNUE` (422 — catégorie hors `research`/`marketing`/`future_ai`), `PRIVACY_VERIFICATION_INSUFFISANTE` (403 — exécution d'une demande dont la vérification n'atteint pas le seuil proportionné, ou demande gelée), `PRIVACY_MOTIF_GEL_REQUIS` (422 — gel/restreindre sans motif documenté). Réutilisation du socle : `RESERVATION_INCOHERENTE` (404 — non-divulgation d'une demande de droit inexistante, hors tenant, ou dont le demandeur n'est pas le sujet ; d'une notice absente ; d'un point de restauration absent), `FEATURE_PILOT_FORBIDDEN` (403 — acteur non authentifié), `EVENT_CHAIN_BREAK` (409 — ouverture d'une demande déjà enregistrée). Mapping dans `packages/api/src/server.ts` (`STATUS_BY_CODE`) et dans `docs/openapi.yaml` (enum `ErrorCode`).
- **Invariants :** le **sujet** d'une demande et son **appartenance active** (service cœur) sont résolus **SERVEUR** (jamais déclarés par le client, ADR-0005) ; le **consentement est séparable** — `coreServiceAvailable` ne dépend **que** de l'appartenance active, jamais d'un refus de catégorie facultative (C16-CONSENT) ; la **vérification est proportionnée** à l'irréversibilité du droit (effacement = seuil 3) et son **absence met en attente**, ne **refuse** pas ; un **gel exige un motif documenté et daté** (aucun refus automatique silencieux) ; l'**export exclut structurellement** tout champ `private` d'un tiers (`third_party_private_fields` compte à `0`, C16-EXPORT) ; l'**effacement est idempotent** (tombstone, pas de double purge) ; la **restauration réapplique les effacements ET les révocations postérieurs** au point **avant** réouverture (C16-RESTORE) ; **pseudonymisé ≠ anonyme** (réidentification possible tant qu'il reste des quasi-identifiants) ; tout refus/lecture est **sans divulgation** (404 stables) ; le **registre** porte une **base légale connue** et une **durée entière** ; les **notices** sont **versionnées** et **sans promesse** (langage prudent).
- **Migrations :** socle `0001` inchangé ; `0016_privacy_law.sql` **entièrement additive** (cinq nouvelles tables) : `legal_notice` (PK `notice_id`+`version`, CHECK genre enum + date `AAAA-MM-JJ` + `body !~*` placeholder + `body !~*` promesse légale/garantie des fonds/fructification/rentabilité/« sans risque » ; trigger `legal_notice_append_only` via la fonction partagée `kombe_journal_append_only`, **propriété `0007`**, non touchée + `REVOKE UPDATE, DELETE … FROM kombe_app`), `processing_record` (CHECK finalité non vide/sans placeholder, `cardinality(data_categories) >= 1`, `legal_basis IN` enum, `retention_days integer CHECK >= 1`, `basis_confirmed`), `personal_consent` (PK `identity_id`+`category`, **CHECK `category IN ('research','marketing','future_ai')`** — le service cœur est **structurellement** exclu du consentement), `rights_request` (`group_id` FK + RLS `tenant_isolation`, genre/statut CHECK, `rights_frozen_needs_motif` = `statut <> 'frozen' OR btrim(reason) <> ''`, `rights_erasure_high_verification` = `genre <> 'erasure' OR required >= 3`), `data_erasure_tombstone` (PK `identity_id`, trigger append-only + `REVOKE` — garde base de C16-RESTORE). FKs : `identity(identity_id)`, `"group"(group_id)`. **Down** fourni, **réversible** (drop politique/RLS/trigger/tables dans l'ordre inverse). `0016` est **branchée explicitement** dans les listes ordonnées de `scripts/migrate.mjs` (UP, après `0015`, avant `provision/roles.sql`) et `tests/isolation.pg.mjs` (up après `0015`, **down en tête**) — les migrations ne sont **pas** auto-découvertes.
- **Contrat d'API (11 routes) :** `POST /v1/privacy/notices` (201 notice ; placeholder/promesse → 422), `GET /v1/privacy/notices/{noticeId}` (200/404), `POST /v1/privacy/processing-records` (201 ; base inconnue/durée invalide → 422), `POST /v1/privacy/consents` (200 `ConsentView` portant `coreServiceAvailable` résolu serveur, C16-CONSENT), `GET /v1/privacy/consents` (200), `POST /v1/privacy/rights-requests` (201 `received`, sujet = identité serveur), `POST /v1/privacy/rights-requests/{requestId}/verifications` (200 `ready`/`requires_more_info` selon seuil), `…/restrictions` (200 gel motivé ; motif vide → 422 `PRIVACY_MOTIF_GEL_REQUIS`), `…/export` (201 `PersonalExportReceipt`, `thirdPartyPrivateFields=0` ; sous-seuil → 403, hors-sujet → 404, C16-EXPORT), `…/erasure` (200 tombstone posé ; sous-seuil/gelé → 403), `POST /v1/privacy/restore-points` (201 instantanés des identités visibles), `POST /v1/privacy/restorations` (200 `RestoreReceiptView`, `deletedIdentityVisible=false` si effacé après point, C16-RESTORE ; point absent → 404) — documentés dans `docs/openapi.yaml` (tag `privacy`, params `ServerDate`, schémas `LegalNotice*`/`ProcessingRecord*`/`Consent*`/`Rights*`/`PersonalField`/`PersonalExportReceipt`/`Restore*`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK, @kombe/worker OK   → exit 0
pnpm -r test       # vitest run (domaine + api + contrat + worker)         → exit 0
node --check packages/db/scripts/migrate.mjs                     # → exit 0
node --check packages/db/tests/isolation.pg.mjs                 # → exit 0 (0016 branchée)
python harness/run_h00.py --commit afab4f7… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **308 passed** (dont **21** dédiés `privacy` : `test/privacy.test.ts`)
- `@kombe/api` → **184 passed** (dont **15** dédiés `privacy` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée** — chemins C00/C08/C12/C17 intacts, +11 chemins et +14 schémas privacy, enum `ErrorCode` enrichi de 5 codes `PRIVACY_*`)
- `@kombe/worker` → 10 tests, 0 fail

### Hashes SHA-256 des artefacts C16 (au commit `afab4f7`)
| sha256 | Fichier |
|---|---|
| `ede4dcde7509b15bd6067b6213486af176684dd3cf127848e6588a0860ea5861` | `packages/domain/src/privacy.ts` |
| `db467864260bc83ac16bee9c1da2c96bf7063c5acbd9cff39f3bfd20edf45422` | `packages/domain/src/errors.ts` |
| `eac6c5eea023830eb2042365d943c5801bfeeb8130d775f61e8ca7558c34b840` | `packages/domain/src/index.ts` |
| `7ffda9ca8c61020d9d63f003a88c6841a20ea94643dcabbc42625e62e8ea4bb3` | `packages/domain/test/privacy.test.ts` |
| `a87e16c3b1e81e5f8b1bdbc62279c3a0b9136425d074caec7c1b984c5d638a33` | `packages/api/src/privacyStore.ts` |
| `b3c24bbf4ed40b8915c6b1ec92d8010474706e01bd9f23c7d739ea911e4a93aa` | `packages/api/src/schemas.ts` |
| `bd4fe3aea75fe6976801a01f2b882a41fd34f11640572c216c65f8ac94beda0f` | `packages/api/src/server.ts` |
| `d34da12139ffc544b62a28b5819270887487d4a5200660826b7930851a494d5c` | `packages/api/test/privacy.test.ts` |
| `b485d5165e84215a67ea081addbf698aa66b3276a8f5e3d0d6273af693301a63` | `packages/db/migrations/0016_privacy_law.sql` |
| `35ab457c57c9372fab49d03a832c28963d7a4542f82e0c317e231112b521b145` | `packages/db/migrations/0016_privacy_law.down.sql` |
| `4e4b63eb0e4b55054d4b1c5de42f745de8cd817a004399f9647a0a0efb75e0bf` | `packages/db/scripts/migrate.mjs` |
| `ccf8f1fbeaab0fa8cf7a6baae6d2ea551505b6cbdd6702a3b7fd1a1ebfe780b4` | `packages/db/tests/isolation.pg.mjs` |
| `37d5f5ae7a0f1139ac002b67b6dcf50ca1478e7786fcab1ed2ee80d9b488007b` | `docs/openapi.yaml` |
| `85b704b4d3eaea7ddcc6634c7f59c2f17a4b0cc910d231c7fe2122e90b3c66b4` | `harness/reports/RAPPORT_G_CONSTRUCTION.json` |

## 4. Éprouver (scénarios propres à C16, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| notice valide | 201, `version`/`lastUpdatedAt` conformes, corps prudent | ✅ |
| notice à placeholder | « bientôt », `[…]`, `{…}`, `___` ⇒ refus `PRIVACY_CONTENU_PLACEHOLDER` | ✅ |
| notice promettant des fonds | « …fait fructifier vos fonds » / « preuve légale » / « rentabilité » ⇒ refus (regex `FORBIDDEN_GUARANTEE_RE`, langage prudent 13.2) | ✅ |
| notice date invalide | `lastUpdatedAt` non `AAAA-MM-JJ` ⇒ 422 | ✅ |
| notice id vide | identifiant vide ⇒ `PRIVACY_IDENTIFIANT_REQUIS` | ✅ |
| notice lue absente | `GET …/notices/{inconnu}` ⇒ **404** `RESERVATION_INCOHERENTE` (non-divulgation) | ✅ |
| registre valide | 201, base légale connue + `retentionDays` entier ≥ 1 | ✅ |
| registre sans finalité/catégories | catégories vides / base inconnue / durée `2.5` ou `-1` / `TBD` ⇒ `PRIVACY_CONTENU_PLACEHOLDER` | ✅ |
| **C16-CONSENT** refus recherche | acteur membre actif refuse `research` ⇒ `coreServiceAvailable = true` (**jamais coupé** par un refus facultatif) | ✅ |
| service cœur non-membre | acteur hors membres ⇒ `coreServiceAvailable = false` (résolu serveur depuis l'appartenance, pas le consentement) | ✅ |
| catégorie inconnue | `category = core_service` (ou autre) ⇒ 422 (schéma enum) ; au domaine ⇒ `PRIVACY_CONSENTEMENT_CATEGORIE_INCONNUE` | ✅ |
| **C16-EXPORT** filtré | sujet `membre_a` (privé `tel_a`, partagé `note_a`) + tiers `membre_b` (privé `tel_b`, public `pseudo_b`) ; vérification ≥ seuil puis export ⇒ reçu = [`tel_a`,`note_a`,`pseudo_b`], **exclut `tel_b`**, `thirdPartyPrivateFields = 0` | ✅ |
| export sous-seuil | vérification `level=1` < seuil ⇒ **403** `PRIVACY_VERIFICATION_INSUFFISANTE` (mis en attente, jamais exécuté) | ✅ |
| export anti-IDOR | `membre_b` tente d'exécuter la demande de `membre_a` ⇒ **404** `RESERVATION_INCOHERENTE` (non-divulgation) | ✅ |
| gel sans motif | restriction `reason` blancs ⇒ **422** `PRIVACY_MOTIF_GEL_REQUIS` (aucun refus automatique silencieux) | ✅ |
| gel motivé + suite | motif daté ⇒ statut `frozen` ; toute exécution sur demande gelée ⇒ 403 | ✅ |
| seuils proportionnés | accès=1, rectification/opposition/export=2, effacement=3 ; `received`→`requires_more_info`→`ready`→`fulfilled` ; exécution avant seuil ⇒throws `PRIVACY_VERIFICATION_INSUFFISANTE` | ✅ |
| **C16-RESTORE** effacement après point | instantané [a,b,c] ; effacement de b ; restauration en sondant b ⇒ `deletedIdentityVisible = false`, `reAppliedErasures = 1`, `visible` exclut b | ✅ |
| **C16-RESTORE** révocations | `c` révoqué après le point ⇒ `reAppliedRevocations` contient `c`, `reAppliedErasures = 0` (révoqué ≠ effacé, les deux sont réappliqués) | ✅ |
| restauration sans point | aucun point ⇒ **404** `RESERVATION_INCOHERENTE` | ✅ |
| effacement idempotent | double effacement ⇒ un seul tombstone, `isErased` stable | ✅ |
| ouverture dupliquée | même `requestId` deux fois ⇒ 409 `EVENT_CHAIN_BREAK` | ✅ |
| pseudonymisé ≠ anonyme | quasi-identifiants non vides ⇒ `assessReidentification` = risque présent (jamais « anonyme ») | ✅ |

Chaque chemin négatif vérifie la **non-divulgation** (404 stables, aucune donnée servie) et l'**absence de promesse juridique**. Côté **domaine** (21 tests, sans HTTP) : construction de notice (placeholder/promesse/date/genre/identifiant), registre (finalité/catégories/base/durée), consentement séparé (`coreServiceAvailable` ≠ refus, compensation plafonnée), filtrage d'export + compte de tiers privés à 0, seuils et machine à états des droits (gel motivé daté, exécution sous-seuil refusée), effacement idempotent, restauration réappliquant effacements **et** révocations, évaluation de réidentification.

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
Ce lot est `in_review`. **qoder** l'a produit ; il **ne peut pas** signer son propre `done`. La relecture (diff, migration, permissions minimales, non-divulgation, proportionnalité des vérifications, filtrage d'export, réapplication des effacements/révocations) doit être exécutée et signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`), **jamais auto-validée**. Points d'attention soumis au relecteur :
- **Complétude des catégories de consentement :** la séparation du service cœur est **structurelle** (CHECK base `IN ('research','marketing','future_ai')` + catégorie absente du domaine). À confirmer comme suffisante : aucun mécanisme ne peut traiter le cœur comme une case « décochable » qui couperait l'accès. Le `ConsentView.coreServiceAvailable` est **toujours** résolu serveur — vérifier qu'aucune route ne laisse le client le déclarer.
- **Seuils de vérification proportionnée :** `requiredVerificationFor` (access=1, erasure=3, défaut=2) est une **table en dur** choisie comme proxy de l'irréversibilité. À valider comme adéquate (et non une promesse réglementaire) ; confirmer que le passage à `ready` exige `level >= required` (et non `==`), et qu'une demande `frozen`/`fulfilled` ignore une vérification tardive (`recordVerification` inchangé).
- **Filtrage d'export (`third_party_private_fields = 0`) :** l'extraction garde les champs du **sujet** (toute visibilité) + les champs **non privés** d'autrui ; un champ `private` d'un tiers est **exclu** et compté à 0. À confirmer comme le comportement de non-divulgation attendu (partage d'un champ partagé/public d'un tiers = licite, un champ privé d'un tiers = jamais exporté), et que la valeur du compte est bien **recalculée** (constante du scénario).
- **Restauration = réapplication, pas annulation :** `restoreFromPoint` **ne supprime pas** les tombstones/révocations survenus après le point ; il les **réapplique** avant réouverture (d'où `deletedIdentityVisible=false`). À valider comme sémantique de reprise correcte (on ne « ramène » pas une identité effacée). La **révision** d'un tombstone (purge physique, délai de conservation) reste hors périmètre et BLOCKED en base.
- **Sujet/rôles résolus dans le store fictif :** l'identité-sujet et l'appartenance active sont **simulées** côté store (`seedActiveMember`/`revokeAccess`) ; le raccord réel (session C02 + membership C03 + `rights_request` RLS + `personal_consent`/`data_erasure_tombstone`) est à souder en base. Vérifier qu'aucune route ne fait confiance à un `subjectIdentityId` fourni par le client.

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C16, **codés et prêts** via la migration `0016` branchée dans `tests/isolation.pg.mjs`, exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C16 notices immuables | `UPDATE`/`DELETE legal_notice` **refusés** (`legal_notice_append_only` + `REVOKE`) | **BLOCKED** |
| C16 notices sans promesse | `body` promettant « preuve légale »/« garanti des fonds »/« fructifier »/« sans risque » **refusé** (CHECK `!~*`) | **BLOCKED** |
| C16 notices sans placeholder | `body`/`version` à placeholder (`bientôt`, `[…]`, `___`) **refusé** (CHECK `!~*`) | **BLOCKED** |
| C16 consentement cœur impossible | `personal_consent` avec `category = 'core_service'` **refusé** (CHECK enum) — le cœur n'est pas révocable par consentement | **BLOCKED** |
| C16 gel motivé | `rights_request` `status='frozen'` avec `reason` vide **refusé** (`rights_frozen_needs_motif`) | **BLOCKED** |
| C16 effacement haut seuil | `rights_request` `kind='erasure'` avec `required_verification < 3` **refusé** (`rights_erasure_high_verification`) | **BLOCKED** |
| C16 registre factuel | `processing_record` durée non entière/`< 1`, base hors enum, catégories vides **refusés** (CHECK) | **BLOCKED** |
| C16 tombstones immuables | `UPDATE`/`DELETE data_erasure_tombstone` **refusés** (append-only + `REVOKE`) — garde de C16-RESTORE | **BLOCKED** |
| C16 RLS | lecture d'une `rights_request` d'un autre `group_id` **isolée** (`tenant_isolation`) | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |
| purge physique / délai RGPD / propagation caches·index·backups·objet-storage / notification responsable | infra déployée + raccord C29 + décision de gouvernance | **non activé — substrat posé** |

## 7. Rapport H00 au SHA C16
```
python harness/run_h00.py --commit afab4f710b96e82c036bba6c9647f0e298f3bf62 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28). **C16 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec les observations (`legal_notice` append-only + `REVOKE`, CHECK promesse/placeholder, `personal_consent` enum cœur-exclu, `rights_frozen_needs_motif`, `rights_erasure_high_verification`, `data_erasure_tombstone` append-only, RLS).
- **Raccord C02/C03 (sujet & appartenance) :** le sujet de la demande et l'appartenance active (service cœur) sont **simulés** dans le store fictif ; la soudure réelle (session C02 → identité, membership C03 → `activeMembers`/`revokeAccess`, RLS sur `rights_request`) est à câbler côté persistance. Ici le **mécanisme** de résolution serveur et de non-divulgation est prouvé en pur.
- **Purge physique & délais réglementaires (18.10) :** le modèle pose un **tombstone logique** idempotent ; la **suppression physique différée**, l'**anonymisation irréversible**, et la **propagation** aux caches/index/backups/objet-storage relèvent de l'infra déployée (C29) — non posés comme preuve ici.
- **Registre versionné non rétroactif (C04/ADR-0014) :** le registre C16 décrit les **traitements** ; la question « quelle règle de conservation s'appliquait à quelle période » relève du moteur de règles versionnées, non duplicable ici.
- **Compensation de recherche :** `researchCompensationHours` plafonne des heures **seulement si** la catégorie est consentie ; aucun versement/récompense réel n'est modélisé (hors périmètre paiement, qui reste hors application — mention prudente).
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; **observations DB C16 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
