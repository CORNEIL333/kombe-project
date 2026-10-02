# PROMPT À COPIER DANS ANTHROPIC CLAUDE CODE — Relecture indépendante C08 + C09

> Messages de handoff associés (qoder → claude-code, action `handoff`) :
> - `COORDINATION_MULTI_HARNESS/handoff/171ff690-4440-4ac6-aeaa-aedb570fc9d6.json` (C08, commit `ea119eb`)
> - `COORDINATION_MULTI_HARNESS/handoff/ba828602-6e46-49ac-b16e-db2cd41af563.json` (C09, commit `a616ee9`)
> Copier tout ce qui suit dans Claude Code, avec accès au dépôt
> `https://github.com/CORNEIL333/kombe-project.git` (branche `master`).

---

Tu es le harnais **`claude-code`** (Anthropic Claude Code), rôle **builder+reviewer**,
`identity_key: "claude-code:pending"`, **`can_sign_off: true`** (registre). Tu relis
les lots **C08 (Décaissements/frais/rapprochement/clôture)** et **C09
(Propositions/votes/décisions)**, tous deux produits par **qoder** et en `in_review`
sur `master`. Tu es **distinct du producteur** → la séparation auteur/relecteur
(**H06**) est satisfaite : toi seul (ou le lead `corneil333`) peut promouvoir `done`.

**Défense d'exécuter :** ne modifie **ni** `harness/run_h00.py`/`witness.py`, **ni**
`COORDINATION_MULTI_HARNESS/verifier_coordination.py`, **ni** `ETATS_LOTS.json` des
autres lots, **ni** `KOMBE_Audit_Construction/` (dossier source figé). Tu ne relis pas
ta propre production.

## 1. Réception et fraîcheur de la preuve (H16)

1. `git pull --rebase origin master`.
2. Contrôler `base_head_sha` des deux handoffs (`c0250ed…`) : si le `HEAD` réel diverge,
   la preuve est **périmée** → refuse et redemande une preuve fraîche (règle H16).
3. Lis `docs/PREUVES_C08.md` et `docs/PREUVES_C09.md` en entier.

## 2. Relire contre les critères réels

Pour chaque lot, vérifier **le code**, pas seulement le prose :
- C08 : `packages/domain/src/disbursement.ts`, `packages/api/src/disbursementStore.ts`,
  `packages/db/migrations/0011*.sql`, ses tests. Invariants : montant **XAF entier**
  (ADR-0002, jamais de float), barrières serveur (ADR-0005), RBAC/anti-IDOR/version
  (ADR-0006), journal append-only intact (ADR-0004/0016), clôtures irréversibles,
  rapprochement avec **oracle indépendant** des fonctions de production.
- C09 : `packages/domain/src/proposal.ts`, `packages/api/src/proposalStore.ts`,
  `packages/db/migrations/0012*.sql`, ses tests. Invariants : quorum/version **pipelinés
  serveur** (pas client), bulletins uniques (PK), deadline NOT NULL, transitions
  triggerées, électorat sous RLS+append-only, `down` qui rétrograde `executed→closed`.

Chaque chemin négatif doit montrer **absence d'écriture** et **absence de divulgation**.

## 3. Recette que tu relances toi-même (obligatoire, exit réels)

```
pnpm -r build
pnpm -r test                       # domaine 256 / API 144 attendus (C08/C09)
node --check packages/db/tests/isolation.pg.mjs
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   # doit être 0 / PASS
python harness/run_h00.py --commit <SHA_code_C08_ou_C09> --out harness/reports/RAPPORT_G_CONSTRUCTION.json
```
Aucune recette **PostgreSQL base réelle** ne doit être revendiquée PASS ici : H07/C13
restent **BLOCKED** tant que la CI Docker (`dbtest`) n'est pas verte (facturation lead).
Si une preuve C08/C09 annonce un PASS base réelle, **c'est un défaut** → ne pas signer.

## 4. Verdict et livraison

- **Conforme** → pour CHAQUE lot : `ETATS_LOTS.json` `in_review → done`,
  `reviewer_id: "claude-code"`, `evidence_ref` conservé, + message
  `handoff/<uuid>.json` `from_harness_id: "claude-code"`, `to_harness_id: "qoder"`,
  `action: "review"`, `signature: "claude-code:pending"`, `evidence {type: prevues_md,
  ref: docs/PREUVES_C0x.md}`, `commit_sha` = SHA relu, `base_head_sha` = HEAD réel.
  Commit `claude-code(review C08): …` et `claude-code(review C09): …`, push `master`.
- **Non conforme** → laisse `in_review`, message `action: "review"` listant les
  défauts bloquants dans `evidence`, et n'écris **jamais** `done`.
- **Incertain sur un invariant critique** → `escalate` vers `corneil333` (avec `reason`).

Rappel : un `done` = recette **réelle** passée + relecture signée par un harnais
distinct. Une suite verte ne remplace pas la revue.
