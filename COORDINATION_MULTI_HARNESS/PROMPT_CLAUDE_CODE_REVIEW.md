# PROMPT À COPIER DANS CLAUDE CODE — Revue des lots en `in_review` (débloquage H06)

> **Objectif** : tu es le **relecteur distinct** désigné par la gouvernance.
> 8 lots attendent ta signature pour passer `in_review → done`.
> Tu es `claude-code`, `identity_key: "claude-code:pending"`, `can_sign_off: true`.
> Dépôt : `https://github.com/CORNEIL333/kombe-project.git`, branche `master`.
> HEAD actuel : `50ce36d`.

---

## 0. Contexte

Tu es le harnais **`claude-code`** (Anthropic Claude Code) dans la coordination multi-harnais KÓMBE.
Ta mission : **relire et signer** (ou refuser) les lots produits par `qoder` qui sont en attente
de revue depuis plusieurs sessions. La règle **H06** exige qu'un `done` soit signé par un harnais
DISTINCT du producteur ; ici `qoder` a produit, tu es le relecteur désigné.

### Lots à revoir (tous `owner_harness_id: qoder`, `reviewer_id: claude-code`)

| Lot | Mission | Commit code | Preuve |
|-----|---------|-------------|--------|
| C08 | Décaissements/frais/rapprochement/clôture | `ea119eb` | `docs/PREUVES_C08.md` |
| C09 | Propositions/votes/décisions | `a616ee9` | `docs/PREUVES_C09.md` |
| C12 | Exports PDF/CSV/vérification | `f61ae19` | `docs/PREUVES_C12.md` |
| C14 | Interface parcours/accessibilité/langues | `dab93e5` | `docs/PREUVES_C14.md` |
| C15 | Cache hors-ligne + synchronisation | `336d7ed` | `docs/PREUVES_C15.md` |
| C16 | Données personnelles/notices/droits | `afab4f7` | `docs/PREUVES_C16.md` |
| C17 | Administration/support/sécurité opé. | `5d2ae9c` | `docs/PREUVES_C17.md` |
| C18 | Mesure pilote/économie unitaire | `130509b` | `docs/PREUVES_C18.md` |

---

## 1. Lis obligatoirement avant de commencer

1. `COORDINATION_MULTI_HARNESS/README.md` — protocole de coordination, règles H06, séparation droits.
2. `COORDINATION_MULTI_HARNESS/CONVENTIONS_GIT.md` — préfixe de commit, format signature.
3. `COORDINATION_MULTI_HARNESS/REGISTRE_HARNESS.json` — ton identité (`claude-code`, `identity_key: "claude-code:pending"`).
4. `COORDINATION_MULTI_HARNESS/ETATS_LOTS.json` — état courant des 8 lots.
5. `COORDINATION_MULTI_HARNESS/MESSAGES.schema.json` — schéma des handoff messages.
6. Pour chaque lot : le prompt source correspondant dans `KOMBE_Audit_Construction/03_Prompts/Cxx_PROMPT.md` (définit les scénarios et invariants attendus).
7. Les ADR pertinents dans `docs/adr/` (0001–0019).
8. Le fichier `docs/PREUVES_Cxx.md` de chaque lot.

---

## 2. Méthodologie de revue (par lot)

Pour **chaque** lot, dans cet ordre :

### 2a. Inspection statique du code
- `git show <commit_sha>` — examiner le diff complet du lot.
- Vérifier que le code livré couvre les **scénarios requis** par le prompt Cxx (ex. C08-HUB, C08-LEDGER, C09-QUORUM, C12-DOWNLOAD, C14-MONEY, C15-RECONNECT, C16-CONSENT, C17-JIT, C18-PAYERS).
- Vérifier les **invariants** déclarés : XAF entier (pas de float), serveur-décide, erreurs stables (`DomainError` / codes documentés), RBAC/anti-IDOR, RLS, append-only.
- Vérifier la **non-régression** : le code n'écrase pas un fichier hors périmètre du lot.

### 2b. Exécution des tests
```bash
git pull --rebase origin master
pnpm install
pnpm -r build
pnpm -r test
pnpm -r typecheck
```
- Build, typecheck, tests doivent être **exit 0** (hormis `@kombe/client` dont le binaire vite est un problème d'environnement pré-existant connu — accepter).
- Nombre de tests attendu (depuis `50ce36d`) : **587+** sur 45 fichiers. Si un chiffre inférieur apparaît, investiguer.

### 2c. Vérification de la preuve (`PREUVES_Cxx.md`)
- Le document suit-il la structure imposée (Inspect → Contractualiser → Construire → Éprouver → Revue → Limites BLOCKED → Rapport H00 → Défauts restants) ?
- Les chiffres de tests revendiqués correspondent-ils à ce que TU as exécuté ?
- Les BLOCKED sont-ils **honnêtes** (pas de PASS simulé) ?
- Les SHA-256 des artefacts sont-ils présents ?

### 2d. Vérification de coordination
```bash
python COORDINATION_MULTI_HARNESS/verifier_coordination.py
```
- Doit sortir **exit 0 / PASS**.

### 2e. H00 harness (optionnel, best-effort)
```bash
python harness/run_h00.py --commit <SHA_40> --out harness/reports/RAPPORT_G_CONSTRUCTION.json
```
- Résultat attendu : 11+ PASS / 0 FAIL / ≤9 BLOCKED (exit 2).
- Si un FAIL apparaît → ne PAS signer le lot, documenter le problème.

> ⚠️ Sous Windows, ajouter `$env:PYTHONIOENCODING='utf-8'` avant chaque commande `python` pour éviter l'erreur `UnicodeEncodeError` sur les caractères `→`.

---

## 3. Critères de décision

### SIGNER `done` si TOUTES ces conditions sont réunies :
- [ ] Code couvre les scénarios requis du prompt Cxx.
- [ ] Build + tests + typecheck verts (exit 0).
- [ ] PREUVES_Cxx.md complet, honnête, cohérent avec les résultats réels.
- [ ] Aucun invariant fondamental violé (XAF entier, serveur-décide, RBAC, RLS, append-only, pas de secrets).
- [ ] verifier_coordination.py exit 0.
- [ ] Aucune régression sur les lots `done` précédents.

### REFUSER (rester `in_review` ou passer `blocked`) si :
- [ ] Un scénario requis est absent ou simulé.
- [ ] Un test échoue pour une raison imputable au lot.
- [ ] La PREUVES_Cxx.md contient une affirmation fausse.
- [ ] Le H00 rapport affiche un FAIL nouveau.
- [ ] Un invariant monétaire, RLS, ou append-only est violé.

En cas de refus : créer un message `handoff/<uuid>.json` avec `action: "escalate"`, `reason: "<explication>"`, et commit `claude-code(review Cxx): BLOQUE — <raison>`.

---

## 4. Protocole de signature (par lot, à la lettre)

1. **Mettre à jour** `COORDINATION_MULTI_HARNESS/ETATS_LOTS.json` :
   - `"status": "done"`
   - `"signoff_by": "claude-code"`
   - NE PAS toucher au `owner_harness_id` ni aux `files`.

2. **Créer un message handoff** dans `COORDINATION_MULTI_HARNESS/handoff/<uuid_v4>.json` :
   ```json
   {
     "message_id": "<uuid v4>",
     "from_harness_id": "claude-code",
     "to_harness_id": "qoder",
     "lot": "Cxx",
     "action": "pass",
     "commit_sha": "<SHA du dernier commit que tu vérifies>",
     "base_head_sha": "<HEAD actuel de master>",
     "evidence": { "type": "manual", "ref": "docs/PREUVES_Cxx.md" },
     "signature": "claude-code:pending",
     "at_utc": "<horodatage ISO 8601 UTC>"
   }
   ```
   Remplacer `<uuid v4>` par un vrai UUID (ex : `python -c "import uuid; print(uuid.uuid4())"`).

3. **Commit** : préfixe `claude-code(review Cxx): signe done` pour le lot N.
   - Grouper plusieurs lots dans un seul commit si tout est vert :
     `claude-code(review C08,C09,C12,C14,C15,C16,C17,C18): signatures done`

4. **Vérification post-commit** :
   ```bash
   python COORDINATION_MULTI_HARNESS/verifier_coordination.py
   ```
   → exit 0 / PASS obligatoirement.

5. **Push** : `git push origin master`.

---

## 5. Interdictions (non négociables)

- **NE PAS** modifier `harness/run_h00.py`, `harness/verify_gate.py`, `COORDINATION_MULTI_HARNESS/verifier_coordination.py`, `MESSAGES.schema.json`.
- **NE PAS** modifier le code source des lots (tu es relecteur, pas correctiveur — si un micro-fix est nécessaire, le consigner en `escalate` et laisser qoder le faire).
- **NE PAS** modifier `KOMBE_Audit_Construction/` (dossier source figé).
- **NE PAS** simuler un test exécuté. Si une commande n'est pas lanceable sur ton environnement, le déclarer.
- **NE PAS** signer un lot produit par claude-code (`self-signing = H06 violation`). Ici, tous sont produits par qoder → conforme.

---

## 6. Format de réponse de fin de revue

Pour chaque lot, produire un résumé structuré :

```
## Cxx — [SIGNÉ done | REFUSÉ]
- Scénarios couverts : liste + cases cochées
- Tests exécutés : N pass / 0 fail (commande exacte)
- PREUVES_Cxx.md : conforme / incomplet (préciser)
- Points d'attention relevés (non bloquants) : …
- Décision : done / escalate + raison
```

Puis en tête du commit message, le SHA vérifié et le HEAD réel.

---

## 7. Commande rapide (résumé copie-colle)

```bash
git clone https://github.com/CORNEIL333/kombe-project.git && cd kombe-project
git checkout master
$env:PYTHONIOENCODING='utf-8'
pnpm install
pnpm -r build; pnpm -r test; pnpm -r typecheck
python COORDINATION_MULTI_HARNESS/verifier_coordination.py
# Lire docs/PREUVES_C08.md, docs/PREUVES_C09.md, etc.
# Puis signer en mettant à jour ETATS_LOTS.json + handoff + commit + push
```
