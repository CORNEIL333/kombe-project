# COORDINATION MULTI-HARNESS — protocole de communication entre agents CLI

**Statut :** plan de coordination opérationnel, complémentaire à
[`KOMBE_Audit_Construction/07_Construction_IA/`](../KOMBE_Audit_Construction/07_Construction_IA/METHODE_ET_GOUVERNANCE.md)
(méthode & gouvernance des agents IA). Ce dossier ne **remplace pas** la gouvernance
existante : il ajoute le **plan d'échange concret** quand **plusieurs harnais CLI**
travaillent sur le même dépôt (Qoder, OpenAI Codex, Anthropic Claude Code, etc.).

---

## 1. Problème visé

Plusieurs harnais IA concurrents sur un dépôt unique risquent :

1. **chevauchement de lots** (deux agents éditent le même composant Cxx) ;
2. **identité non authentifiée** — deux noms textuels suffisent à tromper un
   contrôleur (limite **H06** / `verify_gate.py` du dossier d'audit) ;
3. **preuves fabriquées** — un agent affirme « PASS » sans exécution réelle ;
4. **perte de traçabilité** — qui a fait quoi, sur quel SHA, avec quelle preuve.

Ce protocole rend chacun de ces points **vérifiable par machine**, aligné sur la
discipline existante : code candidat vs contrôleur de confiance séparés
(**H20**), jamais de PASS simulé, tout ce qui est inexécutable reste **BLOCKED**.

---

## 2. Source de vérité unique : le tableau d'états git-versionné

La coordination se fait **par commits sur ce dépôt**, pas par un service externe.
Le fichier [`ETATS_LOTS.json`](./ETATS_LOTS.json) est la **seule** référence pour
« qui fait quoi ». Un harnais **réserve** un lot en committant ce fichier :

| Champ `status` | Sens |
|---|---|
| `todo` | lot libre, aucun détenteur |
| `in_progress` | réservé par `owner_harness_id`, branche `owner_branch` |
| `in_review` | livré, attend relecture par **un autre** harnais |
| `blocked` | dépendance indisponible (ex. PostgreSQL/CI) — **honnête**, jamais simulé |
| `done` | recette réelle passée, `evidence_sha` = commit de preuve |

**Règle de verrouillage :** deux lots ne peuvent pas avoir le même
`owner_harness_id` en `in_progress` **sur des fichiers qui se recouvrent**. Une
double revendication sur un même lot = **conflit** → le validateur sort en `1` →
CI rouge. Le merge en amont (`git pull --rebase`) **avant** de réserver est
obligatoire pour éviter les réserves fantômes.

---

## 3. Identité des harnais (réponse à H06)

Chaque harnais a une entrée dans [`REGISTRE_HARNESS.json`](./REGISTRE_HARNESS.json)
avec un **`identity_key`** (empreinte publique, pas un secret) et un périmètre de
droits. La convention d'auteur de commit est fixée dans
[`CONVENTIONS_GIT.md`](./CONVENTIONS_GIT.md) :

- message de commit préfixé par l'identifiant harnais : `qoder(C08): …`,
  `codex(C06): …`, `claude-code(review C05): …` ;
- une **revue** (`in_review → done`) doit être signée par un `identity_key`
  **distinct** de celui qui a produit le lot — c'est la séparation auteur/relecteur
  que H06 exige ; deux noms textuels sans empreinte **ne suffisent pas**.

> Limite assumée : tant que le dépôt n'a pas de **remote protégé + GitHub
> Environments**, l'identité reste déclarative (auto-signée). Le protocole la
> **rend vérifiable** dès que la protection de branche est activée (lot **C28**),
> sans changer ce document.

---

## 4. Format d'échange inter-harnais

Les harnais échangent par **messages JSON** validés par
[`MESSAGES.schema.json`](./MESSAGES.schema.json), déposés dans
[`handoff/`](./handoff/). Types d'actions : `claim`, `release`, `handoff`,
`block`, `pass`, `review`, `escalate`. Extrait minimal :

```json
{
  "message_id": "uuid",
  "from_harness_id": "qoder",
  "to_harness_id": "claude-code",
  "lot": "C08",
  "action": "handoff",
  "commit_sha": "40 hex",
  "evidence": { "type": "h00_report|test_run|manual", "ref": "chemin/ou/SHA" },
  "base_head_sha": "SHA attendu en base",
  "signature": "identity_key de l'émetteur"
}
```

`base_head_sha` permet au destinataire de **détecter un remaniement** : si le
`HEAD` du dépôt diffère, la preuve est **périmée** (règle H16 : « relance ne ferme
pas le défaut ») → le destinataire refuse et redemande une preuve fraîche.

---

## 5. Séparation des droits (rappel, non négociable)

Hérité de `METHODE_ET_GOUVERNANCE.md` et des cas H00 :

- aucun harnais ne modifie les **critères de recette** qui le jugent
  (`harness/run_h00.py`, `verify_gate.py`, schémas `MESSAGES`/`ETATS`) depuis une
  branche candidate ; ces fichiers relèvent du **job de confiance** ;
- un harnais en `in_progress` n'a **aucun** accès prod ni capacité de publier une
  approbation ;
- les preuves d'un agent sont des **propositions** : la CI et un relecteur distinct
  les confirment (`in_review → done`).

---

## 6. Contrôle exécutable

[`verifier_coordination.py`](./verifier_coordination.py) rejoue les invariants de
coordination (aucune double réservation, `owner` connu du registre, SHA valides,
séparation auteur/relecteur, pas de `done` sans `evidence_sha`). Codes de sortie
alignés sur le harness : **0** conforme, **1** violation, **2** non exécutable.
Brancher ce script en CI (job candidat) pour que le protocole ne soit pas
 Décoratif mais **appliqué**.

---

## 7. Démarrage rapide pour un nouveau harnais

1. `git pull --rebase origin <branche>` ;
2. lire `REGISTRE_HARNESS.json` ; si absent, **s'enregistrer** (commit `claim self`),
   sinon demander un `identity_key` à un pair ;
3. réserver un lot `todo` → `in_progress` dans `ETATS_LOTS.json` + message
   `handoff/…claim.json` ;
4. produire le lot, livrer → `in_review` ;
5. un **autre** harnais relit, signe, passe `done` (ou `blocked` honnête).
