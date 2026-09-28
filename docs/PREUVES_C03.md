# Preuves & revue — Lot C03 (groupes / membres / séparation des pouvoirs) · KÓMBE

- **Commit C03 (code) :** `c07af770c2d2970bf1d2f68c0f41600bae9b3d9c`
- **Porte :** G0 · **Dépendances :** C01 (`45bca2a`), C02 (`162fab8`) · **Stories :** 2.1, 2.7, 4.1, 4.2, 4.4, 4.5, 4.9 (P1 4.6/4.7/4.10 hors pilote)
- **Auteur / cycle :** Lead C03 — Inspecter → Contractualiser → Construire & tester → Éprouver → Relire → Prouver
- **Date :** 2026-09-28
- **Environnement :** Node v26.4.0, pnpm 11.24.0, Python 3.14.6. **Docker / PostgreSQL / remote CI : absents.**

## 1. Inspect (état de départ)
- Base disponible ? **Non** → toute preuve d'intérieur de base (CHECK `group.state`
  élargie effective, borne `used_count ≤ max_uses` sous verrou, RLS de
  l'invitation) est **BLOCKED**, jamais mockée.
- Périmètre construit **en pur** dès maintenant : machine à états du groupe, porte
  de démarrage du cycle (C03-BOOT), invitations bornées/expirantes/révocables,
  acceptation des règles à version exacte, séparation des pouvoirs (A19).
- Fichiers impactés : `packages/domain/src/{group,governance}.ts` + `errors.ts` (5
  codes) + `index.ts` ; `packages/api/src/{governanceStore,server,schemas}.ts` ;
  `packages/db/migrations/0004*` (+ down) + `tests/isolation.pg.mjs` (extension) +
  `DICTIONNAIRE.md` ; `docs/adr/0013_*` ; `docs/openapi.yaml` (tag `governance`).

## 2. Contractualiser
- **Erreurs stables ajoutées :** `GROUP_STATE_INVALID`, `GROUP_READ_ONLY`,
  `CYCLE_START_NOT_READY`, `INVITATION_INVALID`, `RULES_NOT_ACCEPTED` (mapping HTTP :
  403 / 409 / 410, cf. `server.ts`).
- **Invariants :** transitions du groupe bornées (`closed`/`archived` en lecture
  seule, `archived` terminal, `stopped_with_discrepancies` conserve les obligations) ;
  amorçage **sans pouvoir financier** (fonctions indépendantes acceptées + règles
  acceptées par tous + suppléant du trésorier + effectif minimal) ; invitation
  bornée / révocable / expirante ne révélant **aucun registre** ; cotisation conditionnée
  à l'acceptation de la version **courante** des règles ; changement de rôle via A19
  (approbateur distinct — fondateur **sans** `role.change.approve`).
- **Migrations :** socle `0001` inchangé ; `0004_group_governance.sql` **additif**
  (CHECK `group.state` élargie + table `invitation` RLS tenant-scope) ; **down** fourni.
  Rejouable : la table `invitation` est nouvelle (aucune réécriture) ; la repose de la
  CHECK d'origine en **down** échoue sans perte si un groupe occupe un état ajouté.
- **Contrat d'API :** routes `POST /v1/groups` (déjà C00), `GET …/cycle-readiness`,
  `POST …/cycle-starts`, `…/state-transitions`, `…/mutations`,
  `…/membership-terminations`, `…/rules-acceptances`, `…/contribution-declarations`,
  `POST /v1/invitations/:id/redemptions` — documentées dans `docs/openapi.yaml` (tag
  `governance`).

## 3. Construire & tester (commandes exactes, exécutées)
```
pnpm run recette:c00            # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc` : `@kombe/domain` OK, `@kombe/api` OK.
- `@kombe/domain` → **81 passed** (oracle 21 + domain 21 + identity/role_change 10
  + access 16 + **group/governance 13**)
- `@kombe/api` → **32 passed** (contract 4 + server 7 + rolechange 8 + access 7 +
  **governance 6**)
- Contrat OpenAPI validé (`test/contract.test.ts`, parse js-yaml + assertions).

### Hashes SHA-256 des artefacts C03
| sha256 | Fichier |
|---|---|
| `b5201426d06ad37530131e64bf22ac08e15ce3667c31712c57521abf758a8831` | `packages/domain/src/group.ts` |
| `824722fb9438e300aa22953f21005cfcaca4e381026da4d8382370c47ae33037` | `packages/domain/src/governance.ts` |
| `b4b3e4b1892044c5f5ad47d09f7627671dc7749b6ff28ed6955d2f273380317e` | `packages/api/src/governanceStore.ts` |
| `320f12253eb1ce7b36c06f0d04eb4783ad186e25b1d1d6184fb956b27194a3ba` | `packages/db/migrations/0004_group_governance.sql` |
| `5e526e83537b54228c21da87076fbfcce1ba028e043e1109f2129b250fe5cfb1` | `packages/db/tests/isolation.pg.mjs` |
| `2a82ced8bc74383cef17e9399963b5f942b8e730912571dd303ab9b121ec7a36` | `packages/db/DICTIONNAIRE.md` |
| `a5e6edf93088e4256b3c94a8981620c81adc8041d28b73e328173edd7a1ec1b5` | `docs/openapi.yaml` |

## 4. Éprouver (scénarios propres à C03, via `fastify.inject`)
| ID | Attendu (observation obligatoire) | Obtenu (réel) |
|---|---|---|
| **C03-BOOT** | fondateur seul ⇒ `cycle_started = false` (409 `CYCLE_START_NOT_READY`), `acceptedIndependentRoles = 0` | ✅ |
| C03-BOOT (positif) | amorçage complet ⇒ `configuration → active` (201) | ✅ |
| **C03-REVOKE** | adhésion terminée ⇒ `mutation_accepted = false` (403 `IDENTITY_NOT_ACTIVE`), et OK avant terminaison | ✅ |
| **C03-ROLE** | auto-approbation d'un rôle par un admin/fondateur refusée (403) | ✅ |
| C03 règles (4.2) | cotiser sans acceptation refusé (403 `RULES_NOT_ACCEPTED`) ; après acceptation, permis | ✅ |
| C03 invitation (4.1) | au-delà de `max_uses`, rachat refusé (410 `INVITATION_INVALID`) | ✅ |

Chaque chemin négatif vérifie l'**absence d'effet** (la commande précédente est
observée acceptée, puis refusée après terminaison) et la **non-divulgation**
(erreur unique pour expiré/révoqué/épuisé).

## 5. Limites — preuves base réelle **BLOCKED** (jamais simulées)
Scénarios C03, **codés et prêts** dans `tests/isolation.pg.mjs`, exécution
impossible sans PostgreSQL :
```
node packages/db/tests/isolation.pg.mjs
# → { "status": "BLOCKED", "reason": "KOMBE_TEST_DATABASE_URL absente …", "exitCode": 2 }   (réel, exit 2)
```
| Scénario | Observation visée (base réelle) | Statut |
|---|---|---|
| C03-STATE | `extended_state_accepted = true` (la CHECK élargie accepte `stopped_with_discrepancies`) | **BLOCKED** |
| C03-INVITE | `first_redeem_accepted = true`, `second_redeem_accepted = false` (borne `used_count ≤ max_uses` sous verrou) | **BLOCKED** |
| C03-TENANT | `cross_group_invitation_rows = 0` (invitation de A invisible au contexte RLS de B) | **BLOCKED** |
| (C01/C02) | TENANT / FK / POOL / RECOVERY / SESSION / SELFSCOPE | **BLOCKED** |
| H07 / H18 | verrou réel / reprise sur sauvegarde PG | **BLOCKED** |

Les observations seront produites par des **actions/requêtes réelles**, jamais par
une constante lue dans un fichier d'attentes (`C03_PROMPT` §scénarios).

## 6. Rapport H00 au SHA C03
```
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit c07af770c2d2970bf1d2f68c0f41600bae9b3d9c --out harness/reports/RAPPORT_G_CONSTRUCTION.json   # exit 2
```
→ statut **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED**. La chaîne de contrôle
d'intégrité (H01 fabrication, H02 runner intact, H04/H05 identité de commit, H08
mutants, H12 injection refusée, H15 ADR, H16/H17 déterminisme/budget, H19 absence
prod) reste conforme ; les 9 BLOCKED sont les limites d'environnement documentées
(ADR-0010).

## 7. Revue & conformité
- Aucune réutilisation du MVP (D01) ; fichiers du dossier **préservés**, logique **neuve**.
- Périmètre limité à C03 + interfaces partagées déclarées (exports domain, routes api,
  tag OpenAPI `governance`).
- Données **fictives** uniquement ; **aucun** mock de PostgreSQL pour les preuves d'isolation.
- Contraintes tenues : pas de déploiement, pas de service payant, pas de message réel ;
  P1 (4.6/4.7/4.10) non activées, états non supportés refusés côté serveur (ADR-0005).
- Dépendances d'amont respectées : C03 réutilise le circuit A19 (C01) et l'état
  d'identité active (C01/C02) sans redéfinir leurs interfaces.

## 8. Défauts / dépendances restants
- **Prochaine dépendance :** PostgreSQL 16+ (Testcontainers) pour lever H07/H18 et
  exécuter C01/C02/C03-TENANT/FK/POOL/STATE/INVITE → alors `isolation.pg.mjs` doit
  sortir **exit 0** avec toutes les observations attendues.
- CI/Conteneur (C28) pour H03/H06/H09/H10/H13/H14/H20.
- Stories P1 (4.6 délégation bornée, 4.7 exclusion par vote, 4.8 calcul de position de
  départ, 4.10 décès/incapacité) à traiter au lot ultérieur ; le pilote refuse déjà les
  états non supportés.
- À la porte G1 : confirmer plafond unitaire `[OUVERT-D07]`, matrice complète des rôles
  de gouvernance et nombre de fonctions indépendantes requises.
