# Preuves & revue — Lot C04 (moteur de règles versionnées et acceptations) · KÓMBE

- **Commit C04 (code) :** `c998d8e0af213ce2c52c035b2d46a97380c5752f`
- **Porte :** G0 · **Dépendances :** C01 (`45bca2a`), C03 (`c07af77`) · **Stories :** 3.1, 3.2, 3.3, 3.4, 3.7, 6.7
- **Auteur / cycle :** Lead C04 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (déclencheur
  d'immuabilité de `rule_version`, CHECK hash hexadécimal 64, CHECK pilote « pas de
  pénalité », FK d'auto-chânage `supersedes`) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : versions **immuables** scellées
  par `canonicalHash` (RFC 8785), acceptation sur **hash exact**, garde de
  **non-rétroactivité**, plan d'application **essentiel ⇒ cycle suivant sauf
  accord unanime**, **barre pilote** sur les pénalités.
- Fichiers impactés : `packages/domain/src/rules.ts` (neuf) + `errors.ts` (4 codes)
  + `index.ts` ; `packages/api/src/{rulesStore,server,schemas}.ts` ;
  `packages/db/migrations/0005*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0014_*` ; `docs/openapi.yaml` (tag
  `rules`, schéma `RuleSet`).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `RULE_INVALID` (422), `RULE_VERSION_IMMUTABLE`
  (409), `RULE_ACCEPT_HASH_MISMATCH` (412), `RULE_RETROACTIVE` (409) — mapping dans
  `server.ts` ; codes référencés dans l'enum `ErrorCode` du contrat OpenAPI.
- **Invariants :** une version publiée ne se modifie **jamais** (nouvel instantané =
  nouvelle version chaînée par `supersedes`) ; le consentement porte sur le hash
  **exact** de la version ; une règle nouvelle ne réécrit **aucune échéance passée**
  (`dueAtMs < now`) ; un changement **essentiel** (cotisation / effectif / tours) ne
  s'applique qu'au **cycle suivant** sauf acceptation de **toutes** les personnes
  concernées (un refus ⇒ `new_rule_executed = false`) ; au pilote, `penaltyEnabled`
  est **imposablement** `false` et `rounds === memberCount` (une part).
- **Migrations :** socle `0001` inchangé ; `0005_rules_engine.sql` **additif**
  (colonnes `snapshot_hash`/`supersedes`/`published_at`, CHECK hash 64-hex, FK
  composite d'auto-chânage, CHECK pilote sans pénalité, **déclencheur
  `rule_version_no_update` BEFORE UPDATE OR DELETE**, CHECK acceptation non-nullable) ;
  **down** fourni. Rejouable : ajouts de colonnes **nullables** et contraintes,
  aucune réécriture de lignes existantes. Ordre de rollback : `0005…down` → `0004…down`
  → `0003…down` → `0002…down` → `0001…down`.
- **Contrat d'API :** routes `POST /v1/groups/:groupId/rule-versions`,
  `…/rule-versions/:version/acceptances`, `…/rule-changes`,
  `…/cycle-recalculations`, `…/penalty-requests` — documentées dans
  `docs/openapi.yaml` (tag `rules`, schéma `RuleSet`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **96 passed** (C03 81 + **rules 15**)
- `@kombe/api` → **38 passed** (C03 32 + **rules 6**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml + assertions ;
  le schéma `RuleSet` résout `$ref` `Money`, l'enum `ErrorCode` inclut les 4 codes C04).

### Hashes SHA-256 des artefacts C04
| sha256 | Fichier |
|---|---|
| `07edeea0a9cf397338a38bd97732fd701f24a5b049d7437c1f62a2484086fda0` | `packages/domain/src/rules.ts` |
| `d42fa97c690568f0d224714eb882e2dcda9580ce2ef082f40d13d785d841bd9e` | `packages/domain/test/rules.test.ts` |
| `2f6488260493140be7be0ce44624fc6cf36d675fa7361bce910559983c212b88` | `packages/api/src/rulesStore.ts` |
| `2b1bf9a65fe4e3d47a331268a636746978a7cc82fa3f8c33761d5a1236746795` | `packages/api/test/rules.test.ts` |
| `824530a9f03054def414d4128b663b9f607579f3b905f8a8823ff3e25c89525c` | `packages/db/migrations/0005_rules_engine.sql` |
| `72dfb271666856e98b048525df65058b7939e4e0fa606d0f3545449afc84f41e` | `packages/db/migrations/0005_rules_engine.down.sql` |
| `39b5f14d35a219436ed8f9a12e0f5f05306c84c40ac45cd5b3f0df89d8ef9bd2` | `packages/db/tests/isolation.pg.mjs` |
| `6749c76a92eeb22757337239eba8e57bcf5d464f02c2112a0293d04d38299bef` | `packages/db/DICTIONNAIRE.md` |
| `c8bb7eabdad86730c7338f99696146a906c4ce4714534d30ed900cd03908e77e` | `packages/db/README.md` |
| `0810593670bc83787ba72656f1ffe645edab79bd14ce3a68bb6ed670282753bc` | `docs/openapi.yaml` |
| `3e8c370c029d2c154e1c5e55eadc65eb6ea20b932a46dd68bcca8f1f5196ff94` | `docs/adr/0014_regles_versionnees_non_retroactives.md` |

## 4. Éprouver (scénarios propres à C04, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C04-PENALTY** | publication avec `penaltyEnabled=true` ⇒ normalisé **false** au pilote ; `penalty-requests` `{desired:true}` ⇒ `penalty_enabled=false`, `rejected=true` | ✅ |
| C04 hash exact | acceptation sur un **mauvais** hash ⇒ **412** `RULE_ACCEPT_HASH_MISMATCH` ; sur le hash publié ⇒ 201 | ✅ |
| **C04-RETRO** | recalcul qui modifierait le **montant d'une échéance passée** ⇒ **409** `RULE_RETROACTIVE` ; sinon `past_due_changed = false` (200) | ✅ |
| **C04-ACCEPT** | changement **essentiel** (cotisation 6000) accepté par a,b **mais pas c** ⇒ `new_rule_executed = false` ; après acceptation de c ⇒ `true` | ✅ |
| immuabilité (3.1) | `assertVersionImmutable` refuse tout instantané dont le hash diverge de la version publiée (409 `RULE_VERSION_IMMUTABLE`) | ✅ (domain) |
| plan non essentiel | changement de gré à grâce/`dueDay` ⇒ `appliesTo = immediate`, exécution sans accord unanime | ✅ (domain) |

Chaque chemin négatif vérifie l'**absence d'effet** (la version courante reste en
vigueur quand l'unanimité défaut) et la **non-divulgation** (une décision de garde,
jamais un montant réel).

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C04, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C04-IMMUTABLE | `update_rejected = true` / `delete_rejected = true` (le déclencheur `rule_version_no_update` lève une exception sur UPDATE/DELETE) | **BLOCKED** |
| C04-PENALTY | `pilot_penalty_insert_accepted = false` (CHECK `rule_version_pilot_no_penalty` refuse `penaltyEnabled=true`) | **BLOCKED** |
| (C01/C02/C03) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE / STATE / INVITE | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C04_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C04
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit c998d8e0af213ce2c52c035b2d46a97380c5752f --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H11 écart matrice, H12 injection refusée, H15 ADR, H16/H17
déterminisme/budget, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; logique **neuve**, artefacts du dossier
  **préservés**.
- Périmètre limité à C04 + interfaces partagées déclarées (exports domain, routes
  api, tag OpenAPI `rules`, schéma `RuleSet`).
- Réutilisation **encadrée** des modules C00 : `canonicalHash` (scellement de
  version), `perAmount` (bornage monétaire), table `rule_version` du socle 0001
  (élargie, non redéfinie).
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves
  d'immuabilité / de barre pénalité.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; pénalités **fermées** au pilote (ADR-0005 / 6.7).

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C04-IMMUTABLE / C04-PENALTY (et les scénarios C01/C02/C03) → alors
  `isolation.pg.mjs` doit sortir **exit 0** avec toutes les observations attendues.
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- **C05 (agenda / rotation)** : génération effective des échéances et datation au
  calendrier réel (`dueDate`, fin de mois, `rounds` = membres, bénéficiaire unique
  par tour) ; C04 pose la **garde** de non-rétroactivité et le **plan**, C05 pose
  le **calendrier**.
- À la porte G1 : confirmer la matrice complète des paramètres versionnables et le
  seuil d'« essentialité » financière.
