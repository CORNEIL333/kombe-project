# Preuves & revue — Lot C00 (socle) · KÓMBE

- **Commit C00 (code) :** `444c20713ea722baaae8d45907690217af12270d`
- **Auteur / cycle :** Lead technique C00 — Inspecter → Contractualiser → Construire & tester → Relire → Prouver
- **Date :** 2026-09-27
- **Portée :** Initialisation propre du monorepo pnpm. Logique cœur **neuve**
  (aucune réutilisation de l'ancien MVP), fichiers du dossier **préservés**.
  Contrats (OpenAPI, ADR 0000–0010) + squelette sur **données fictives**.

## 1. Environnement (honnête, non simulé)
| Élément | Valeur |
|---|---|
| Node | v26.4.0 |
| pnpm | 11.24.0 (`packageManager: pnpm@11.24.0`) |
| Python | 3.14.6 |
| Registre npm | `registry.npmjs.org` (réel) |
| Docker | **absent** |
| PostgreSQL | **absent** (`pg_isready`/`psql` indisponibles) |
| Remote Git / CI | **absent** (dépôt local uniquement) |

> En l'absence de Docker/PostgreSQL/CI, **toute preuve d'intérieur de base** (RLS,
> verrous, isolation de pool, atomicité) est livrée en statut **BLOCKED** — jamais
> mockée ni simulée (règle maître prompt / `packages/db/README.md`).

## 2. Vérification install (politique stricte, aucun build de dépendance)
```
pnpm install            # exit 0 ; esbuild ne peut pas exécuter de postinstall
```
Config `pnpm-workspace.yaml` : `allowBuilds: esbuild:false`, `strictDepBuilds:false`,
`ignoreScripts:true`, `verifyDepsBeforeRun:false`. Lockfile suivis :
`pnpm-lock.yaml` sha256 `9e8b220c6e6b4fb541f3d09cb0ba41b141f9d564da2554dcf735c71ce0cc3687`.

## 3. Recette C00 — build + tests (commande exacte)
```
pnpm run recette:c00        # = pnpm run build && pnpm run test   → exit 0
```
Résultats réels :
- Build `tsc -p tsconfig.json` : `@kombe/domain` OK, `@kombe/api` OK.
- Tests `vitest run` :
  - `@kombe/domain` → **42 passed** (`oracle.test.ts` 21 + `domain.test.ts` 21)
  - `@kombe/api` → **11 passed** (`contract.test.ts` 4 + `server.test.ts` 7)

### 3.1 Recroisement contre l'oracle **indépendant** (exigence maître prompt)
`packages/domain/test/oracle.test.ts` compare rotation / reste / réconciliation /
verdict de vote (Fraction) / date d'échéance / CSV aux vecteurs issus de
`KOMBE_Audit_Construction/04_Harness/reference_oracles.py`
(sha256 `44706a774874b52a4871dc7421c3df298d08dd5e3f69115311406448ef03b30c`).
L'oracle **n'appelle pas** le code de production → indépendance prouvée.

## 4. Harness d'assurance H00 (G-CONSTRUCTION) — avant le métier
```
# harnais auto-testé (intact, non modifié)
py -3 harness/test_h00.py                                   → 23 tests OK, exit 0
py -3 KOMBE_Audit_Construction/04_Harness/test_reference.py → 28 tests OK, exit 0

# exécution de la chaîne au SHA C00 réel (hôte cp1252 → mode UTF-8 explicite)
$env:PYTHONUTF8=1
py -3 harness/run_h00.py --commit 444c20713ea722baaae8d45907690217af12270d \
    --out harness/reports/RAPPORT_G_CONSTRUCTION.json       → exit 2 (BLOCKED)
```
Rapport : `harness/reports/RAPPORT_G_CONSTRUCTION.json`, `commit` = SHA C00,
statut global **BLOCKED**, **11 PASS / 0 FAIL / 9 BLOCKED / 0 NOT_RUN**.

| Cas | Statut | Motif (si BLOCKED) |
|---|---|---|
| H01 PASS | fabrication d'un PASS sans appel service **détectée** | — |
| H02 PASS | SHA du runner identique avant/après témoin | runner sha256 `78acbc9c908e87b373cb9e498a962c15a8a30532724629c8b1aff1d1ac2711d8` |
| H03 BLOCKED | lecture d'attentes privées possible sans isolation OS | Docker/namespace (→ C28) |
| H04 PASS | SHA déclaré ≠ SHA contrôleur → rejet | — |
| H05 PASS | rapport PASS d'un autre commit rejeté | — |
| H06 BLOCKED | deux noms sans identité authentifiée | CI/plateforme (→ C28) |
| H07 BLOCKED | **PostgreSQL indisponible** → verrou réel non testé | Testcontainers (→ C01) |
| H08 PASS | mutants auth + unicité **détectés** | — |
| H09 BLOCKED | env hérité du parent (sentinelle visible) | allowlist (→ C28) |
| H10 BLOCKED | restrictions réseau non configurées | egress (→ C28) |
| H11 PASS | cas manquant détecté à la matrice | — |
| H12 PASS | instruction de contenu externe **refusée** | — |
| H13 BLOCKED | sandboxing scripts d'installation | → C28 |
| H14 BLOCKED | protection branches Git (pas de remote) | → C28 |
| H15 PASS | ADR périmé détecté | — |
| H16 PASS | 1ʳᵉ erreur conservée ; relance ne ferme pas le défaut | — |
| H17 PASS | arrêt borné (budget + 1) | — |
| H18 BLOCKED | reprise sur sauvegarde PostgreSQL | Testcontainers (→ C01) |
| H19 PASS | aucune variable de production dans l'environ | — |
| H20 BLOCKED | séparation job candidat / job de confiance | GitHub Actions (→ C28) |

**Décision de porte (ADR-0010) :** G-CONSTRUCTION = **BLOCKED explicite**. Cette
décision **autorise la construction encadrée du socle** mais **ni pilote réel, ni
release**. Le harnais de référence **ne franchit pas, à lui seul, la porte** ; les
9 BLOCKED sont des limites d'environnement documentées, **pas** des succès simulés.

## 5. Contrats livrés (C00)
- **OpenAPI** `docs/openapi.yaml` (sha256 `d9c0944578e1ea7913b2f8b62553f5bb54da64160f56e3698ef285f3a75683bc`)
  — serveur `/v1`, routes A19 (commandes, nominations/acceptations de rôle,
  demandes/approbations de changement de rôle, clôtures, annulations, réouvertures,
  demandes/effectuation de contre-passation, clôtures de tour), schéma `Money`
  entier `min 0 / max 9007199254740991`, enum `ErrorCode` aligné sur le domaine,
  **aucune** route wallet/prêt/scoring/assurance (barrières ADR-0005).
- **ADRs** `docs/adr/0000_index.md` + 0001–0007 + 0010 (statuts ADOPTÉ / contrat /
  BLOCKED selon dépendances ; 0008–0009 `[PROPOSÉ]`, 0011–0020 `[OUVERT]`).
- **Schéma DB (contrat)** `packages/db/migrations/0001_init.sql`
  (sha256 `71ba06cff9e9fa0d8587d1b14bb62728cf5d30879e6bd9df875d03f3b7f384a7`) — RLS +
  FK composites + unicité structurelle ; exécution **BLOCKED** (code 2).

## 6. Périmètre et conformité aux contraintes
- Aucun déploiement, aucun service payant, aucun message réel (H19 : aucune variable
  de production ; `features.ts` : barrières du pilote toutes fermées).
- Données strictement **fictives** (`fixtures/fictitious.sql`, `FictitiousCommandStore`).
- Ordre séquentiel respecté : **C00 → H00/G-CONSTRUCTION** ; C01+ **non lancé** en
  parallèle sur des interfaces partagées.

## 7. Limites connues (à lever plus tard)
- Preuves base réelle (RLS/verrous/pool/atomicité) → **lot C01** sur PostgreSQL 16+.
- Isolation OS/env/réseau, CI à jobs séparés, identité authentifiée, protection de
  branches → **lot C28**.
- Plafond monétaire unitaire `[OUVERT-D07]` ; fournisseurs `[OUVERT-D01..D10]`.

## 8. Révision (critère 18.20)
Chaque arbitrage porte auteur/date/alternatives/conséquences via les ADR. Les
décisions `[PROPOSÉ]`/`[OUVERT]` ne deviennent pas des obligations par simple
mention. **Aucun succès simulé** : tout ce qui dépend d'une ressource absente est
`BLOCKED` avec motif et lot de levée.
