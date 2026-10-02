# Preuves & revue — Lot C12 (exports du relevé : PDF/CSV, empreinte, vérification indépendante) · KÓMBE

- **Commit C12 (code) :** `f61ae19a38883ca94bd9ce771120d07333c02310`
- **Porte :** G0 · **Dépendances :** C03 (groupe = périmètre d'accès), C08 (décaissements — source de lignes du relevé, `in_review`, code commité `ea119eb` traité comme **stable**), C11 (journal = source de la séquence de coupure), C00 (erreurs stables, horloge injectée, canonicalisation/hash) · **Stories :** 10.1 (relevé PDF/CSV), 10.2 (empreinte du fichier), 10.3 (langage prudent — jamais « preuve légale »), 10.4 (export imprimable), 10.5 (export final, signature conditionnelle — **non simulée**), 18.8 (manifeste d'export)
- **Auteur / cycle :** Qoder — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-10-02
- **Environnement :** Node ≥22, pnpm 11, Python 3.x. **Docker / PostgreSQL / remote CI : absents.**
- **Statut plateau :** `in_review` (une relecture par un harnais **distinct** du lead signe le `done` ; jamais auto-validé — règle H06).

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (**manifeste immuable** gardé par trigger `export_manifest_append_only` + `REVOKE UPDATE/DELETE`, **empreinte SHA-256 strictement formée** par CHECK regex, **mention prudente exempte de promesse juridique** par `export_no_legal_promise`, **coupure entière bornée**, **date d'expiration postérieure à la capture**, **RLS** multitenant par `group_id`) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : un **snapshot figé au `cutoff_sequence`** (seuls les événements `1 ≤ seq ≤ cutoff` entrent dans le relevé ; l'état reste cohérent quelle que soit l'évolution ultérieure du journal), un **CSV neutralisé** contre l'injection de formule (tout champ texte passe par `csvText` — apostrophe si `= + - @` ou tabulation/CR/LF en tête), un **PDF imprimable déterministe** (A4, police chassee), une **empreinte SHA-256 calculée sur les octets finalisés** consignée dans un **manifeste séparé** (le hash ne vit pas dans le fichier), un **vérificateur autonome** qui recalcule et compare (une divergence est un **résultat**, pas une exception), et une **ACL de téléchargement recontrôlée à l'acheminement** (un membre sortant reçoit un **404 non-divulguant**, jamais ses octets).
- Réutilisation **encadrée** du socle : `csvText` (C00, copie de l'oracle `csv_text`), `DomainError` à codes stables (C00), `sha256`/`createHash` (C00 canonical), montants **typés** `bigint` rendus en champs nombres (jamais texte libre — ADR-0002). C12 **n'invente** aucune valeur juridique : `EXPORT_PRUDENT_NOTICE` affirme « ne constitue pas une preuve légale … aucune signature juridique » ; **aucune signature** n'est produite ni simulée (10.5 fermé côté serveur).
- **Hors du périmètre « pur » maintenant (consigné, non simulé) :** stockage d'objet privé expirant (le PDF/CSV réels ne sont pas archivés ici — seule l'**empreinte** l'est), proxy de révocation immédiate, export final « à la clôture » versionné (10.5), mise en page A4 opérationnelle riche. Ces critères relèvent de l'infrastructure déployée et du raccord objet-storage ; leur **substrat décisionnel** (modèle de manifeste, garde-fou base, langage prudent) est posé ici, leur **preuve d'exécution** reste BLOCKED.
- Fichiers impactés : `packages/domain/src/{export,errors,index}.ts` (+ `csv.ts` réutilisé inchangé) ; `packages/api/src/{exportStore,server,schemas}.ts` ; tests domaine + API ; `packages/db/migrations/0015*` (+ down) **branchés** dans `scripts/migrate.mjs` et `tests/isolation.pg.mjs` ; `docs/openapi.yaml`.

## 2. Contractualiser
- **Erreurs stables ajoutées :** `EXPORT_CUTOPE_INVALID` (422 — coupure non entière, négative, **ou postérieure à l'état courant du journal**), `EXPORT_IDENTIFIANT_REQUIS` (422 — `groupId` ou `manifestId` vide). Réutilisation du socle : `RESERVATION_INCOHERENTE` (404 — non-divulgation d'un export inexistant, hors tenant, ou dont le demandeur n'est plus membre), `FEATURE_PILOT_FORBIDDEN` (403 — acteur non authentifié). Mapping dans `packages/api/src/server.ts` (`STATUS_BY_CODE`) et dans `docs/openapi.yaml` (enum `ErrorCode`).
- **Invariants :** la **coupure** est résolue **SERVEUR** et ne peut dépasser le `seq` maximal du journal (on n'exporte pas un état postérieur à la réalité — ADR-0005) ; l'**empreinte** porte sur les **octets finalisés** et vit **hors du fichier** (manifeste séparé, append-only) ; la **vérification** est **indépendante** (recalcul réel, jamais une constante du scénario) ; le **CSV** ne livre **aucune cellule exécutable** (neutralisation `csvText`, apostrophe préfixée) ; les **nombres** proviennent de **champs typés** `bigint`, pas de textes libres ; le **langage est prudent** (mention systématique, aucune promesse légale, aucune signature) ; l'**ACL est recontrôlée à l'acheminement** (anti-IDOR : titulaire + appartenances **courantes** au groupe) ; toute lecture/refus est **sans divulgation** (404 stable).
- **Migrations :** socle `0001` inchangé ; `0015_export_manifest.sql` **entièrement additive** (une seule nouvelle table) : `export_manifest` (`manifest_id` PK, `group_id`/`requester_identity_id` FK, `cutoff_sequence bigint CHECK >= 0`, `generator_version` non vide, `pdf_sha256`/`csv_sha256` CHECK `~ '^[0-9a-f]{64}$'`, `object_key`/`expires_at`/`revoked_at` nullables, `prudent_notice` NOT NULL + `export_no_legal_promise` (`!~*`), `export_expiry_coherent`). Trigger `export_manifest_append_only` (via la fonction partagée `kombe_journal_append_only`, **propriété `0007`**, non touchée) + `REVOKE UPDATE, DELETE … FROM kombe_app`. RLS `tenant_isolation` sur `group_id`. **Down** fourni, **réversible** (drop politique/RLS/trigger/table dans l'ordre inverse). `0015` est **branchée explicitement** dans les listes ordonnées de `scripts/migrate.mjs` (UP, après `0014`, avant `provision/roles.sql`) et `tests/isolation.pg.mjs` (up après `0014`, **down en tête**) — les migrations ne sont **pas** auto-découvertes.
- **Contrat d'API :** `POST /v1/groups/{groupId}/exports` (201 manifeste ; non-membre → 404 ; coupure hors état → 422), `GET /v1/exports/{manifestId}/manifest` (200 scopé, 404), `GET /v1/exports/{manifestId}/download` (200 `application/pdf`, ACL re-vérifiée → 404 si membre sortant, C12-DOWNLOAD), `GET /v1/exports/{manifestId}/csv` (200 `text/csv` neutralisé, mêmes ACL), `POST /v1/exports/{manifestId}/verifications` (200 `verification_passed`, corps `{bytesBase64}` ; octet altéré → `false`, C12-HASH) — documentés dans `docs/openapi.yaml` (tag `exports`, params `GroupId`/`ManifestId`/`x-server-date`, schémas `StatementExportInput`/`ExportManifestView`/`ExportVerificationInput`/`ExportVerificationResult`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm -r build      # @kombe/domain OK, @kombe/api OK, @kombe/worker OK   → exit 0
pnpm -r test       # vitest run (domaine + api + contrat + worker)         → exit 0
node --check packages/db/scripts/migrate.mjs                     # → exit 0
node --check packages/db/tests/isolation.pg.mjs                 # → exit 0 (0015 branchée)
python harness/run_h00.py --commit f61ae19… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2 (BLOCKED, jamais un PASS simulé)
```
Résultats réels :
- `@kombe/domain` → **287 passed** (dont **14** dédiés `export` : `test/export.test.ts`)
- `@kombe/api` → **169 passed** (dont **11** dédiés `export` ; `test/contract.test.ts` parse `docs/openapi.yaml` **sans clé dupliquée** — **75 chemins, 57 schémas**, chemins C00 intacts)
- `@kombe/worker` → 10 tests, 0 fail

### Hashes SHA-256 des artefacts C12 (au commit `f61ae19`)
| sha256 | Fichier |
|---|---|
| `0b919a8a72a89b0bc6f8002ab232655531672e12ab887bf43829dfeed4748363` | `packages/domain/src/export.ts` |
| `2ba732917bd1c9be757a46a3ac5efd23e4245aaf252c7e8409735e80fa49480c` | `packages/domain/src/errors.ts` |
| `8ea5d785ca9da359cd3810e447ae6a4cee4c5168ae1adbbabc2b7e757b6ad7e6` | `packages/domain/src/index.ts` |
| `c6bd993c68c41eebab22531e3ae3021a4b5720a357b7893747d81619f46abf61` | `packages/domain/test/export.test.ts` |
| `6168fc3667535e74f89d0f8e6ba377d89679b2ce6b41978fec2fec49551b07c6` | `packages/api/src/exportStore.ts` |
| `591b8399d97660416c0fbabb81fc15fd4ce1560c7f7cdf3a4b8b1ddcab346294` | `packages/api/src/schemas.ts` |
| `84ef730673055277bec5a4062a5d8cce2e673ac644e9632caa8c0a25e9a4695d` | `packages/api/src/server.ts` |
| `6498711149069e820f6577e149454f0ae1ab51d97861e29f701ce7cf133a292e` | `packages/api/test/export.test.ts` |
| `f9b9d7ea3dde15af2af99db711977887ee9520ccf99d1329ecda70d384f0afc4` | `packages/db/migrations/0015_export_manifest.sql` |
| `c11dcc5483a9101f4d924450f546baf5095253839a594d2b409e2b5625f76996` | `packages/db/migrations/0015_export_manifest.down.sql` |
| `1202cc7d90cc052387c5f9b1b1f96470c38aad940b87363824db2b9698c9f114` | `packages/db/scripts/migrate.mjs` |
| `811b811cc498c7bf894ff7f216fad3a82fd37d75ea646b95f05a712cb4093cf7` | `packages/db/tests/isolation.pg.mjs` |
| `52df3a45ca1d5f837e15543eb72ea3410667dd0c09b4c0247a264be2e43a345f` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C12, via `fastify.inject` + domaine pur)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| snapshot figé (10.1) | coupure `cutoff=1` sur un journal de 3 événements ⇒ seules les lignes `seq ≤ 1` sortent ; mutation `seq > cutoff` exclue | ✅ |
| coupure invalide | `cutoff` négatif / non entier (domaine) ⇒ `DomainError` `EXPORT_CUTOPE_INVALID` | ✅ |
| coupure postérieure (API) | `cutoff=99` > `seq` max (3) ⇒ **422** `EXPORT_CUTOPE_INVALID` (on n'exporte pas un état inexistant) | ✅ |
| génération membre | 201, `cutoffSequence = 3` (résolu serveur), `pdfSha256`/`csvSha256` hex 64, mention prudente, `downloadPath` | ✅ |
| génération non-membre | demande d'un acteur hors membres ⇒ **404** `RESERVATION_INCOHERENTE` (non-divulgation de l'existence du relevé) | ✅ |
| **C12-CSV** formule | acteur `=HYPERLINK("http://evil")` ⇒ **aucune** cellule émise n'est exécutable (`isFormulaExecutableCell = false`) ; le CSV porte `'=HYPERLINK` | ✅ |
| détecte une cellule brute | `'"=cmd"'` ⇒ `true` (pièce de contrôle) ; `"'=cmd"` ⇒ `false` (neutralisée) | ✅ |
| PDF déterministe | même snapshot ⇒ mêmes octets ; entête `%PDF` ; `hashBytes` stable | ✅ |
| empreinte au manifeste | `manifest.pdfSha256 == hashBytes(pdf)` ; `csvSha256 == hashBytes(csv)` | ✅ |
| téléchargement PDF | 200 `application/pdf`, octets commençant par `%PDF`, `hashBytes(octets) == manifest.pdfSha256` | ✅ |
| **C12-HASH** intact | `/verifications` avec octets originaux (base64) ⇒ `verification_passed = true` | ✅ |
| **C12-HASH** altéré | un octet retourné du PDF redescendu ⇒ `verification_passed = false` (**recalcul réel**, pas une constante) | ✅ |
| **C12-DOWNLOAD** membre sortant | accès créé (`membre_a`) puis `removeMember` ⇒ `/download` **404** `RESERVATION_INCOHERENTE`, octets **jamais** servis | ✅ |
| **C12-DOWNLOAD** autre titulaire | `/download` du relevé de `membre_a` par `membre_b` ⇒ **404** (grant rattaché au titulaire, ADR-0006) | ✅ |
| accès exigé pour vérifier | membre sorti ⇒ `/verifications` **404** | ✅ |
| objet hors groupe (domaine) | `grant.objectGroupId ≠ grant.groupId` ⇒ `isDownloadAllowed = false` | ✅ |
| événement d'export (18.8) | la génération produit un événement `statement_exported` portant `pdfSha256` = celui du manifeste | ✅ |
| langage prudent (10.3) | `EXPORT_PRUDENT_NOTICE` contient « ne constitue pas une preuve légale … aucune signature » ; mention en tête du CSV et du PDF | ✅ |

Chaque chemin négatif vérifie la **non-divulgation** (404 stables, aucune donnée servie) et l'**absence de promesse juridique**. Côté **domaine** (14 tests, sans HTTP) : coupure et tri, neutralisation CSV (`= + - @`, tab/CR/LF), déterminisme et empreinte PDF/CSV, vérification indépendante (intacte vs altérée), ACL de téléchargement (membre/titulaire/tenant), payload d'événement.

## 5. Revue CodeReview — à réaliser par un harnais DISTINCT (règle H06)
Ce lot est `in_review`. **qoder** l'a produit ; il **ne peut pas** signer son propre `done`. La relecture (diff, migration, permissions minimales, non-divulgation, vérification indépendante) doit être exécutée et signée par un harnais distinct (`claude-code` ou lead `CORNEIL333`), **jamais auto-validée**. Points d'attention soumis au relecteur :
- **PDF fait main (Latin-1) :** `renderStatementPdf` assemble un PDF mono-page avec offsets `xref` calculés en octets **Latin-1** (`Buffer.byteLength(.., 'latin1')`) et `pdfEscape` restreint aux codes ≤ 255 (au-delà → `?`). À confirmer comme suffisant pour le pilote (lisible/imprimable) et non une promesse de conformité PDF/A ; le **CSV** porte la fidélité complète des données.
- **Coupure serveur vs demandée :** le store **refuse** (`422`) une coupure postérieure à l'état courant plutôt que de la **borner silencieusement** ; une coupure antérieure valide produit un état figé cohérent. À valider comme sémantique attendue (jamais un export d'un futur inexistant).
- **Emprunte hors fichier :** le hash est stocké dans le **manifeste**, pas dans le PDF/CSV ; la `/verifications` compare les octets **soumis** au hash du manifeste. À confirmer que ceci satisfait 10.2/18.8 (vérification indépendante) sans jamais modifier le fichier après calcul.
- **`ExportGrant` côté API :** l'ACL effective (membre sortant) s'appuie sur l'appartenance **courante** relue serveur dans le store fictif ; le raccord réel (session + membership C02/C03 + `export_manifest` RLS) reste à souder en base.

## 6. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C12, **codés et prêts** via la migration `0015` branchée dans `tests/isolation.pg.mjs`, exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C12 empreinte inaltérable | `UPDATE`/`DELETE export_manifest` **refusés** (`export_manifest_append_only` + `REVOKE`) | **BLOCKED** |
| C12 empreinte bien formée | `pdf_sha256`/`csv_sha256` non conformes `^[0-9a-f]{64}$` **refusés** (CHECK) | **BLOCKED** |
| C12 langage prudent | `prudent_notice` promettant « preuve légale » / « signed » **refusé** (`export_no_legal_promise`) | **BLOCKED** |
| C12 coupure bornée | `cutoff_sequence < 0` **refusé** (CHECK) | **BLOCKED** |
| C12 expiration cohérente | `expires_at <= captured_at` **refusé** (`export_expiry_coherent`) | **BLOCKED** |
| C12 RLS | lecture d'un manifeste d'un autre `group_id` **isolée** (`tenant_isolation`) | **BLOCKED** |
| H07 / H18 | verrou réel / sérialisation / atomicité / reprise sur sauvegarde PG | **BLOCKED** |
| stockage objet privé / proxy révocation / export final signé (10.5) | infra déployée + objet-storage + décision de gouvernance | **non activé — substrat posé** |

## 7. Rapport H00 au SHA C12
```
python harness/run_h00.py --commit f61ae19a38883ca94bd9ce771120d07333c02310 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**. La chaîne de contrôle d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08 mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010), dont H07/H18 (base réelle) et H03/H06/H09/H10/H13/H14/H20 (isolation contrôleur / identité authentifiée / chaîne de livraison — C28). **C12 n'a pas** modifié le contrôleur, les attentes ni la politique de livraison pour obtenir un statut.

## 8. Défauts / dépendances restants (limites assumées, consignées — non masquées)
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter les scenarii §6 → alors `isolation.pg.mjs` doit sortir **exit 0** avec les observations (`export_manifest` append-only + `REVOKE`, CHECK d'empreinte, `export_no_legal_promise`, `export_expiry_coherent`, RLS).
- **Raccord C08 (source des lignes) :** les lignes du relevé viennent d'une **entrée générique** d'événements (`StatementEventInput`) ; la soudure réelle (projection depuis le journal C11 et les décaissements C08, `cutoff_sequence` aligné sur la séquence du journal chaîné) est à câbler côté persistance — ici le mécanisme de **coupure** et de **cohérence de snapshot** est prouvé en pur.
- **Objet privé expirant / proxy :** `object_key`/`expires_at`/`revoked_at` sont **modélisés** et bornés en base ; le **stockage d'objet** réel et le **proxy de révocation immédiate** relèvent de l'infra déployée (C29), non posés comme preuve ici.
- **Export final & signature (10.5, P1) :** **volontairement non activé** — tant qu'aucun algorithme/clé/signataire/vérificateur ne sont réellement disponibles, le résultat reste un **export avec empreinte**, jamais une signature simulée.
- **CI / Conteneur (C28)** pour H03/H06/H09/H10/H13/H14/H20 ; **observations DB C12 dédiées** dans `isolation.pg.mjs` à souder lors du raccord PostgreSQL.
