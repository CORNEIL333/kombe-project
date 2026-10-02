# PROMPT À COPIER DANS CHATGPT / CODEX — Lot C18 (mesure du pilote et économie unitaire)

> Prends le dépôt `https://github.com/CORNEIL333/kombe-project.git`, branche `master`,
> **après** `git pull --rebase`. Copie tout ce qui suit dans ChatGPT/Codex.

---

Tu es le harnais **`codex`** (OpenAI Codex), rôle **builder**, `identity_key:
"codex:pending"`, **`can_sign_off: false`**. Tu construis le lot **C18 — Mesure du
pilote et économie unitaire** (porte **G0**, dépendances **C05, C11** ; stories
**16.1, 16.2, 16.3, 18.13**). Tu es **producteur seulement** : tu ne passes JAMAIS
ton lot à `done` (une relecture par un harnais distinct + habilité le fera). Tu ne
modifies **ni** `harness/`, **ni** `verifier_coordination.py`, **ni** le dossier
`KOMBE_Audit_Construction/` (source figée), **ni** les paquets d'autrui hors interfaces
déclarées.

## 1. Réserver le lot (avant toute écriture)

1. `git pull --rebase origin master` (le `base_head_sha` des handoffs est `c0250ed…` ;
   si `HEAD` diffère, repars du `HEAD` réel).
2. Dans `COORDINATION_MULTI_HARNESS/ETATS_LOTS.json` : C18 `todo → in_progress`,
   `owner_harness_id: "codex"`, `owner_branch: "master"`, et **déclare tes fichiers**
   (`packages/domain/src/metrics.ts`, `packages/domain/src/index.ts`, …). ⚠️ **qoder est
   `in_progress` sur C17** et touche `packages/domain/src/errors.ts`, `index.ts`,
   `packages/api/src/server.ts`, `schemas.ts`, `packages/db/migrations/0014*.sql`.
   **Ne déclare AUCUN motif de fichier qui recouvre C17** (le validateur sort en 1 sur
   recouvrement `in_progress`). Si une interface partagée (`errors.ts`/`index.ts`/
   `server.ts`) doit changer, **propose-la dans la livraison**, ne l'impose pas ; sinon
   isole C18 dans ses propres fichiers (`metrics.ts`, store/lecture dédiés).

## 2. Lis d'abord (obligatoire)

`KOMBE_Audit_Construction/03_Prompts/C18_PROMPT.md` ; `docs/adr/` (0002 XAF entier,
0004/0016 journal+projections, 0005 barrières serveur, 0006 RBAC/version) ; `STACK.md` ;
code et conventions existants : `packages/domain/src/{journal,schedule,disbursement,
proposal,errors,index}.ts`, `packages/api/src/{server,schemas}.ts` et un store de
référence (`packages/api/src/proposalStore.ts`), un test de recette de référence
(`packages/api/test/proposal.test.ts`). Registre + tableau d'états pour ton identité.

## 3. Mission et invariants stricts

Mesurer l'usage réel **sans exposer le registre** dans les analytics.
1. **Analytics pseudonymisés/agrégés**, whitelist d'événements : **aucun montant,
   référence ou commentaire individuel** (C18-ANALYTICS : `individual_financial_fields`
   = 0). Éviter tout session-replay métier.
2. **Cohortes** : distinguer éligibles / invitations uniques / validation / tours /
   cycles. **Complétude ≠ solvabilité.** Pas de taux de rétention **trois cycles** avant
   durée réellement observée (C18-COHORT : groupe ayant fini 3 tours seulement ⇒
   `eligible_three_cycle_retention` = false).
3. **Afficher nombres bruts**, médiane/p90, dossiers ouverts, dénominateurs du chap. 19.
4. **Paiement réel séparé de la promesse** ; seuil G2 non atteint si trop peu de payeurs
   (C18-PAYERS : 2/10 ⇒ `gate_g2_met` = false).
5. Coût support = minutes × coût horaire ; messages, infra, annulations, taxes à
   documenter (registre risques). Tableau **manuel reproductible** acceptable au pilote.
6. Le **serveur décide** période/éligibilité ; horodatage client non fiable. Erreurs
   stables via `DomainError`. XAF **entier**, jamais de float.

## 4. Harness (Inspecter → Contractualiser → Construire&tester → Éprouver → Revoir → Prouver)

- Rendre d'abord le scénario de défaut reproductible (ex. un champ financier qui fuite
  dans l'export), puis implémenter.
- Un chemin négatif vérifie **absence d'écriture** et **absence de divulgation**.
- **Ne jamais mocker PostgreSQL** pour prétendre prouver une requête d'agrégat réelle :
  sans base, l'épreuve SQL est **BLOCKED** (exit 2 honnête), jamais simulée.
- Horloge injectée, fixtures fictives, aucun message réel/achat/transfert.

## 5. Validation (verts ou BLOCKED honnêtes)

```
pnpm -r build
pnpm -r test                       # ne casse RIEN : domaine 256 / API 144 attendus
node --check packages/db/tests/isolation.pg.mjs
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   # 0 / PASS obligatoire
python harness/run_h00.py --commit <SHA_40_hex_de_ton_commit> --out harness/reports/RAPPORT_G_CONSTRUCTION.json
```
Ne déclare jamais un test exécuté s'il est seulement écrit. Aucun PASS simulé.

## 6. Livraison (à la lettre)

1. Commit code, préfixe **`codex(C18): …`** → note le SHA (40 hex).
2. H00 sur ce SHA (rapport regenerated).
3. `docs/PREUVES_C18.md` sur le modèle `docs/PREUVES_C08.md`/`_C09.md` (Inspect/Contract/
   Construire/Éprouver incluant les 3 scénarios C18-COHORT/PAYERS/ANALYTICS avec leurs
   sorties réelles/limites/Rapport H00/Défauts restants + SHA-256 des artefacts).
4. `ETATS_LOTS.json` : C18 → **`in_review`** (jamais `done`), `reviewer_id` laissé vide
   (ce n'est pas toi qui signes), `evidence_ref: docs/PREUVES_C18.md`, `commit: <SHA>`.
5. Message `handoff/<uuid>.json` : `from_harness_id: "codex"`, `to_harness_id: "claude-code"`
   (relecteur habilité), `action: "pass"`, `signature: "codex:pending"`, `evidence {type:
   prevues_md, ref: docs/PREUVES_C18.md}`, `commit_sha`/`base_head_sha` = SHAs réels.
6. `verifier_coordination.py` → **PASS exit 0** avant le commit preuves.
7. Commit preuves (`codex(C18): preuves + coordination in_review …`) puis `git push origin master`.

Commentaires de code en **français**, style du dépôt (TS strict, zod aux frontières,
décisions déléguées au domaine pur). Fin de lot : objectif, changements par fichier,
résultats réellement exécutés et limites (dont PostgreSQL BLOCKED), défauts restants,
prochaine dépendance.
