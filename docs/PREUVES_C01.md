# Preuves & revue — Lot C01 (identité / rôles / isolation) · KÓMBE

- **Commit C01 (code) :** `45bca2abcd73e677662db839680dd10cf4c89d0e`
- **Porte :** G0 · **Dépendances :** C00 (fait, `444c207`) · **Stories :** 14.1, 14.2, 18.2, A19
- **Auteur / cycle :** Lead C01 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-27
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** (`pg_isready` absent) → toute preuve d'intérieur de base
  (RLS effective, verrous, isolation de pool, FK croisées) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : machine à états d'adhésion, unicité
  d'une adhésion active, garde « identité active », circuit A19, RBAC, version optimiste.
- Fichiers impactés : `packages/domain/{errors,authorization,index}.ts` + nouveaux
  `identity.ts`, `role_change.ts` ; `packages/api/{commandPipeline,server}.ts` ;
  `packages/db/migrations/0002*` + `*.down.sql` + `provision/roles.sql` + `tests/isolation.pg.mjs`
  + `DICTIONNAIRE.md` ; `docs/adr/0011_*`.

## 2. Contractualiser
- **Erreurs stables ajoutées :** `MEMBERSHIP_STATE_INVALID`, `MEMBERSHIP_ALREADY_ACTIVE`,
  `IDENTITY_NOT_ACTIVE`, `ROLE_ACCEPTANCE_REQUIRED`, `APPROVER_NOT_DISTINCT` (mapping HTTP :
  403 / 409 / 422, cf. `server.ts`).
- **Invariants :** adhésion `pending→active→departed/revoked` (terminaux non rouvrables) ;
  une seule adhésion **active** par (groupe, identité) ; A19 = nomination → **acceptation
  du nommé** → **approbation par un tiers distinct** du proposant et du nommé ; fondateur
  **sans** `role.change.approve` (auditeur = approbateur indépendant).
- **Migrations :** `0001_init.sql` (socle C00) inchangé ; `0002_role_change.sql` **additif**
  (`role_change_request`, `export_request`, RLS) ; **down** fournis ; `provision/roles.sql`
  pose `kombe_app` **non-owner, sans BYPASSRLS**. Backfill : 0002 n'écrit aucune ligne
  existante (purement additif → rejouable).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **52 passed** (oracle 21 + domain 21 + **identity/role_change 10**)
- `@kombe/api` → **19 passed** (contract 4 + server 7 + **rolechange 8**)

### Hashes SHA-256 des artefacts C01
| sha256 | Fichier |
|---|---|
| `e751ddf20e78438447656b7b3c22ca12062c774be2194b5cf40c58d336c14f36` | `packages/domain/src/identity.ts` |
| `8d942b86a19943e77d0af614001de89016ae4b664463d491db4187b73af531ab` | `packages/domain/src/role_change.ts` |
| `cf1e810261046ee1d8fe8118101628f1a983c3447102621facd1866f730efb4b` | `packages/db/migrations/0002_role_change.sql` |
| `12a6b28416a01edb7211fc1242850c44c541a3875b17dfacff5f2f92cf298d5b` | `packages/db/tests/isolation.pg.mjs` |
| `235bd962c4137ef3fce4993b8a5a23bc9b1e4b5d0e06a9cc60093924a71e2e95` | `packages/db/DICTIONNAIRE.md` |

## 4. Éprouver (chemins négatifs + non-effet, via `fastify.inject`)
| Cas | Attendu | Obtenu (réel) |
|---|---|---|
| Nommé accepte sa nomination | 201, version 2 | ✅ |
| Un **autre** que le nommé accepte | 409 `ROLE_ACCEPTANCE_REQUIRED` | ✅ |
| Auditeur distinct approuve (acceptée) | 201 + hash journal 64-hex | ✅ |
| **Fondateur** approuve | 403 `FEATURE_PILOT_FORBIDDEN` | ✅ |
| Approbateur == **proposant** | 403 `APPROVER_NOT_DISTINCT` | ✅ |
| Approbateur **hors groupe** (IDOR) | 403, **puis** bonne commande OK (non-effet) | ✅ |
| Approbation avant acceptation | 409 `ROLE_ACCEPTANCE_REQUIRED` | ✅ |
| **Version dépassée** | 409 `EVENT_CHAIN_BREAK` | ✅ |

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios obligatoires de C01, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C01-TENANT | `cross_group_rows = 0` (A lit l'objet de B, rôle `kombe_app` + RLS) | **BLOCKED** (RA11) |
| C01-FK | `foreign_link_accepted = false` (contribution A → obligation B, FK composite) | **BLOCKED** |
| C01-POOL | `leaked_rows = 0` (100 alternances A/B sur une connexion de pool, `SET LOCAL`) | **BLOCKED** |
| H07 (harnais) | verrou réel (`SELECT … FOR UPDATE`) | **BLOCKED** |
| H18 (harnais) | reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par une
constante lue dans un fichier d'attentes (conformément à `C01_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C01
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit 45bca2a… --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle d'intégrité
(H01 fabrication, H02 runner intact sha256 `78acbc9c…`, H04/H05 identité de commit, H08
mutants, H12 injection refusée, H19 absence prod) reste conforme ; les 9 BLOCKED sont les
limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; fichiers du dossier **préservés**, logique **neuve**.
- Périmètre limité à C01 + interfaces partagées déclarées (exports domain, routes api).
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves d'isolation.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message réel ;
  fonctionnalités pilotes toujours **fermées** (ADR-0005) ; aucune exposition de secret.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et exécuter
  les scénarios C01-TENANT/FK/POOL → alors `tests/isolation.pg.mjs` doit sortir **exit 0**.
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- À la porte G1 : confirmer le plafond unitaire `[OUVERT-D07]` et les rôles de gouvernance.
