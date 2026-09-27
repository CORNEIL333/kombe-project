# Preuves & revue — Lot C02 (accès des comptes : inscription / sessions / récupération) · KÓMBE

- **Commit C02 (code) :** `162fab82c305b7767b20195bf601b1e12f668e93`
- **Porte :** G0 · **Dépendances :** C01 (fait, `45bca2a`) · **Stories :** 1.1, 1.2, 1.3, 1.4, 1.5
- **Cycle :** Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-27
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (unicité d'usage du
  jeton sous verrou, suppression en cascade des sessions, RLS self-scope) est
  **BLOCKED**, jamais mockée. Frontière externe (envoi réel d'OTP courriel/SMS) =
  adaptateur **non raccordé**, **aucun message réel** émis ni simulé (contrainte pilote).
- Construit **en pur** dès maintenant : machine à états d'accès, jetons à usage
  unique et expirants, politique de mot de passe, sessions par génération,
  récupération avec révocation, privilège **recalculé serveur**, anti-énumération.
- Fichiers impactés : `packages/domain/{errors,index}.ts` + nouveau `access.ts` ;
  `packages/api/{server,schemas}.ts` + nouveau `accessStore.ts` ;
  `packages/db/migrations/0003_access*` + `tests/isolation.pg.mjs` (étendu) +
  `DICTIONNAIRE.md` + `README.md` ; `docs/adr/0012_*`.

## 2. Contractualiser
- **Erreurs stables ajoutées :** `TOKEN_INVALID`, `TOKEN_EXPIRED`,
  `TOKEN_ALREADY_USED`, `PASSWORD_TOO_WEAK`, `PASSWORD_COMPROMISED`,
  `SESSION_INVALID`, `CHANNEL_NOT_VERIFIED`, `PRIVILEGE_NOT_GRANTED` (mapping HTTP
  400/401/403/409/422, cf. `server.ts`).
- **Invariants :** jeton consommable **une seule fois** et avant expiration ;
  session recevable ssi `generation` courante du compte **et** non révoquée **et**
  non expirée ; la récupération **incrémente la génération** (révoque toutes les
  sessions antérieures) et **suspend temporairement** les privilèges ; privilège
  opérateur = fait serveur (canal vérifié, compte actif, MFA souscrite, pas de
  suspension), **jamais** lu d'un jeton ; réponse d'inscription/récupération
  **anti-énumération** (gabarit identique, aucun effet pour identité inconnue).
- **Migration :** `0003_access.sql` **additive** (`identity_access`,
  `verification_token`, `access_session`, RLS self-scope) ; **down** fourni ;
  **aucun secret en clair** (empreintes `password_hash`/`token_hash`). Backfill :
  0003 purement additif → rejouable, ne réécrit aucune ligne existante.

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **68 passed** (socle 52 + **access 16**)
- `@kombe/api` → **26 passed** (contract 4 + server 7 + rolechange 8 + **access 7**)

### Hashes SHA-256 des artefacts C02
| sha256 | Fichier |
|---|---|
| `549b5b096ca978d62407c1a46261cf81c78ff3a1ba50a79fa645a7a3dee55100` | `packages/domain/src/access.ts` |
| `f7f4f5b6a49165c459129c84b017bd345507c56a160ff23e3dfa7d91fe001052` | `packages/api/src/accessStore.ts` |
| `b9ead0522f6ca25b9d1d0b1871d4b05ee560980cf9a39bfbc799672091488b43` | `packages/db/migrations/0003_access.sql` |
| `66e1da86d3f921a1cb7e8eee5f25f04b7c00e947b9019418eab500a3875e9d7a` | `packages/db/tests/isolation.pg.mjs` |
| `bf8447321b74aeda5cdadee8bf2058caf5d9597427898a00046999be802aa9ff` | `packages/db/DICTIONNAIRE.md` |

## 4. Éprouver (chemins négatifs + non-effet, via `fastify.inject`)
| Cas | Attendu | Obtenu (réel) |
|---|---|---|
| **C02-RECOVERY** — consommer 2× le même jeton | 2ᵉ refusé `TOKEN_ALREADY_USED` (`second_use_accepted=false`) | ✅ |
| **C02-SESSION** — session d'avant après récupération | 401 `SESSION_INVALID` (`old_session_accepted=false`) | ✅ |
| Session explicitement révoquée puis usage | 401 `SESSION_INVALID` | ✅ |
| **C02-PRIVILEGE** — compte nouveau → fonction opérateur | `operator_access=false` (via `CHANNEL_NOT_VERIFIED`) | ✅ |
| Opérateur sans MFA / avec MFA | refus / accord | ✅ |
| Privilège pendant puis après suspension post-récupération | `false` / `true` (horloge serveur avancée) | ✅ |
| Inscription : achèvement par jeton | 200 `state=active` | ✅ |
| Anti-énumération (compte connu vs inconnu) | même gabarit, **aucun jeton** pour l'inconnu | ✅ |

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios obligatoires de C02, **codés et prêts** dans `tests/isolation.pg.mjs`,
exécution impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C02-RECOVERY | 2ᵉ `UPDATE … WHERE consumed_at IS NULL` → 0 ligne (`second_use_accepted=false`) | **BLOCKED** |
| C02-SESSION | après bump de génération, jointure session→compte vide (`old_session_accepted=false`) | **BLOCKED** |
| C02-SELFSCOPE | kombe_app (RLS `kombe.identity_id`) : 0 ligne d'autrui | **BLOCKED** |
| H07 (harnais) | verrou réel (`SELECT … FOR UPDATE`) | **BLOCKED** |
| H18 (harnais) | reprise sur sauvegarde PG | **BLOCKED** |

La consommation unique s'appuiera sur `UPDATE … WHERE consumed_at IS NULL` sous
verrou de ligne ; la révocation en cascade sur l'égalité de génération. Ces
observations viendront d'**actions/réquisitions réelles**, non d'une constante.

## 6. Rapport H00 au SHA C02
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit 162fab82c305b7767b20195bf601b1e12f668e93 --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact sha256, H04/H05 identité de
commit, H08 mutants, H12 injection refusée, H19 absence prod) reste conforme ;
les 9 BLOCKED sont les limites d'environnement documentées (ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; fichiers du dossier **préservés**, logique **neuve**.
- Périmètre limité à C02 + interfaces partagées déclarées (exports domain, routes api).
- Données **fictives** et **horloge injectée** ; **aucun** mock de PostgreSQL pour
  les preuves d'accès ; **aucun** message réel (OTP) émis ni simulé.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message
  réel ; fonctionnalités pilotes toujours **fermées** (ADR-0005) ; **aucun secret
  en clair** ni dans les logs ni dans les réponses.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C02-RECOVERY/SESSION/SELFSCOPE → alors `tests/isolation.pg.mjs` sort **exit 0**.
- Frontière identité externe (fournisseur, envoi OTP) à raccorder via un adaptateur
  mockable **à cette frontière seulement** (jamais pour la base).
- MFA **optionnelle** membres (1.3, P1) : socle posé, activation garde ses
  restrictions ; exigence retenue ici = **opérateurs**.
- À la porte G1 : confirmer mécanisme de hachage des secrets et durée de suspension.
