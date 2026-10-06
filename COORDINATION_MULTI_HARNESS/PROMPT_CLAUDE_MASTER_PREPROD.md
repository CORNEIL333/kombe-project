# PROMPT MAÎTRE À COPIER DANS CLAUDE CODE — Débloquer la voie vers production (pistes A→D)

> **Rôle** : tu es l'ingénieur responsable de la **mise en état production** de KÓMBE.
> Tu n'es **pas** le relecteur de lots (ça reste `claude-code` pour H06) et tu n'es **pas**
> le porteur (les arbitrages métier/fournisseurs restent humains).
> Dépôt : `https://github.com/CORNEIL333/kombe-project.git`, branche `master`.
> Harnais producteur actuel : `qoder` ; toi (`claude-code`) tu peux produire du code de
> **pistes** mais **jamais** signer tes propres lots (règle H06 : `self-signing = violation`).

---

## 0. État de départ réel (à relire, ne pas présumer)

- **Porte `G-CONSTRUCTION` = `BLOCKED`** — `harness/reports/RAPPORT_G_CONSTRUCTION.json` :
  **12 PASS / 0 FAIL / 8 BLOCKED** (H03, H06, H09, H10, H13, H14, H18, H20). `ADR-0010` :
  cet état autorise la construction encadrée mais **interdit pilote réel et release**.
- **H07 = PASS** : preuves base-réelle RLS/verrous/isolation exécutées pour vrai sur Neon.
- **`DEPLOY.md` §0/§5** : l'API **ne persiste pas** (stores mémoire C00, l'état repart au
  redémarrage, aucune lecture/écriture PostgreSQL). Auth/session réelle + RLS par requête =
  **FICTIF (recette)**. Worker outbox hors périmètre. Sauvegarde/reprise (C29) non livrée.
- **`ADR-0022` (adopté 2026-10-06)** : trio Vercel + Cloudflare (Workers/Durable Object/
  Hyperdrive/R2) + Neon, sauvegarde indépendante, RPO ≤ 15 min / RTO ≤ 4 h. **Adoption ≠
  souscription ≠ déploiement.**
- **`STACK.md` §2 encore `OPEN`** : `D04` (email), `D05` (SMS/OTP), `D06` (identité),
  `D07` (plafond unitaire), `D10` (région — mesure requise).

> **Avant toute action** : `git pull --rebase origin master`, puis relis `DEPLOY.md`,
> `docs/adr/0010_*.md`, `docs/adr/0022_*.md`, `harness/reports/RAPPORT_G_CONSTRUCTION.json`.
> Si un point de l'état ci-dessus ne correspond plus au dépôt, **fais foi sur le dépôt** et
> signale l'écart dans ton rapport.

---

## 1. Règles non négociables (hiérarchie documentaire + gouvernance)

1. **Jamais un succès simulé.** Une commande non lanceable sur ton hôte = `BLOCKED` honnête,
   jamais un PASS fabriqué. Ne change **ni** le contrôleur, **ni** les attentes critiques, **ni**
   la politique de livraison **pour** obtenir un PASS.
2. **Contrôleur de recette protégé.** Ne commite/push **aucune** modification de
   `harness/run_h00.py`, `harness/verify_gate.py`, `harness/reports/RAPPORT_G_CONSTRUCTION.json`,
   `COORDINATION_MULTI_HARNESS/verifier_coordination.py`, `MESSAGES.schema.json` **sans
   ratification explicite du lead (`corneil333`)**. Tu peux **préparer** le diff, le consigner,
   et **demander** comment le promouvoir (idéal : job CI de confiance H20).
3. **Ne déploie pas en production, ne souscris aucun service payant, n'envoie aucun message
   réel, pas de données réelles avant G0** (`00_PROMPT_MAITRE`, `STACK.md` §4). Fixtures fictives,
   secrets hors dépôt, `pnpm --frozen-lockfile`.
4. **Ne modifie pas `KOMBE_Audit_Construction/`** (dossier source figé).
5. **Décisions humaines ≠ ton travail.** `D06` (fournisseur d'identité), `D04`/`D05` (email/SMS),
   `D07` (plafond), `D10` (région) sont des **arbitrages du porteur**. Tu prépares la décision
   (devis, POC, mesure, ADR `[PROPOSÉ]`) — **tu ne l'adoptes pas** à sa place.
6. **XAF entier, serveur-décide, RLS, append-only, canonicalisation RFC 8785** : aucun de ces
   invariants ne bouge. Toute modification d'invariant passe par un ADR signé, jamais par le code.
7. Sous Windows PowerShell : `$env:PYTHONIOENCODING='utf-8'` avant chaque `python` (sinon
   `UnicodeEncodeError` sur `→`) ; séparateur de commande `;` (jamais `&&`) ; le succès d'un
   `git push` se lit à la ligne `old..new master -> master`, pas à l'ExitCode.

---

## 2. Pistes, dans l'ordre de dépendance (chaîne critique : A → 2 → C → D)

### PISTE A — Rendre le registre persistant (LE prérequis de tout le reste)
**Objectif** : souder `packages/api` ↔ Neon, brancher session/RLS réelles, corriger `migrate`.

- **A1. Persistance API.** Remplacer les stores mémoire C00 par des transactions `pg`
  manuelles (pas d'ORM). Toute écriture doit survivre au redémarrage. Citer chemin/symbole.
- **A2. Session + RLS par requête.** Résoudre la session (modèle **déjà adopté** en
  `ADR-0012`/C02 — identité gérée par `packages/api`, **ne pas** attendre `D06`) puis
  `SET LOCAL role kombe_app` **et** `set_config('kombe.group_id', $1, true)` dans chaque
  `BEGIN` (cf. `pgWorker.ts` ; sinon les politiques `c13_tenant` voient NULL et ne drainent
  rien). **Pooler DIRECT Neon** (pas pgbouncer) pour le `SET ROLE` transactionnel.
- **A3. `migrate` connecté en `kombe_migrateur`.** Actuellement le conteneur migre en
  superuser `kombe`, donc les `ALTER DEFAULT PRIVILEGES FOR ROLE kombe_migrateur` ne lient pas
  les futures tables à `kombe_app` (`DEPLOY.md` §5). Corriger le chemin `migrate` seul.
- **A4. Preuve.** Étendre/exécuter `packages/db/tests/isolation.pg.mjs` et les tests API pour
  montrer : redémarrage → données intactes ; session expirée refusée ; aucune ligne inter-groupe.
- **Statut** : **EXÉCUTABLE MAINTENANT** (H07 prouve que Neon + rôle-switch marchent de cet hôte).

### PISTE B — Débloquer les 8 cas `BLOCKED` de la porte (CI de confiance + reprise)
Certains ne dépendent **que** d'un opérateur humain/infra, pas de code :

- **B1 (H14) — Remote + protection de branches.** Pousser sur GitHub et activer la branch
  protection (`master`). ⚠️ Le blocage mémoire **C28/C29 = billing lock GitHub** : si un job a
  `runner_id: 0` + steps vides + échec ~2 s, c'est un **compte sans runner alloué** → **action
  opérateur (billing)**, pas un défaut de code. Le signaler comme `BLOCKED — billing`, ne pas « réparer » le YAML.
- **B2 (H06, H20) — Jobs séparés candidat ≠ confiance + identité authentifiée.** Structurer
  `.github/workflows/h00-trusted.yml` en job de confiance hors reach du job candidat ; gate
  H20. **⚠️ Ceci touche au politique de recette → ratification lead avant push.**
- **B3 (H09, H10, H13) — env allowlist + restrictions réseau + sandbox install.** Configurer
  le job candidat : `pnpm --ignore-scripts`, egress par namespace/conteneur, subprocess sans
  héritage des variables du parent.
- **B4 (H18) — Reprise avec Testcontainers.** Nécessite un **hôte Docker/Testcontainers**
  (Neon **ne** fournit **pas** Testcontainers). **Ne pas** forcer H18 au-delà de son `BLOCKED`
  codé en dur ; câbler le vrai test de restauration sur un hôte qui peut l'exécuter, sinon
  `BLOCKED` honnête. **Éditer `run_h00.py` pour câbler H07/H18 nativement → ratification lead.**
- **Statut** : B1 = action opérateur ; B2/B3 = code CI + revue ; B4 = dépend d'un conteneur hôte.

### PISTE C — Provisionner le trio + premier exercice de sauvegarde/reprise (ADR-0022)
- **C1. Projets séparés** : Vercel (front/PWA/dashboards + API Node 22), Cloudflare Workers +
  Durable Object (worker outbox, verrou par `scope_id`) + Hyperdrive → Neon, **R2 dans un compte
  distinct**. `packages/worker` : ajouter la cible Workers (`wrangler`, bindings DO/Hyperdrive/R2)
  **à côté** de la cible Node, sans changer la sémantique `ADR-0008`/`ADR-0017`.
- **C2. Secrets hors dépôt** via gestionnaires Vercel/Cloudflare (`wrangler secret put`) ;
  rotation `neon` ; aucun secret commité.
- **C3. Sauvegarde indépendante** : dump `pg_dump` + WAL archive chiffrés côté client vers R2
  (Object Lock COMPLIANCE) ; **registre des révocations/effacements** dupliqué hors du point de
  restauration ; manifeste canonique horodaté (SHA-256 artefacts + SHA commit + version schéma +
  empreinte chaîne de hash).
- **C4. Exercice réel C29** (devient contractuel ici) : restaurer PITR **et** dump+R2 dans un
  projet Neon jetable, **réseau sortant coupé**, worker absent / `KOMBE_DRY_RUN=1` vérifié :
  `C29-RESTORE` → `restore_verified=true` ; `C29-RIGHTS` → session révoquée avant point reste
  refusée (`revoked_session_accepted=false`) ; `C29-OUTBOUND` → `external_messages_sent=0`.
- **Statut** : C1/C2 = **souscription** → **GATE** : ne pas acheter avant décision opérateur ;
  préparer `wrangler.json`/`vercel.json`/IaC et le plan de coûts **sans déployer**.

### PISTE D — Préparer la porte G0 (pas l'ouvrir toi-même)
- **D1.** Consigner les **conditions G0** manquantes (`PLAN_GLOBAL_DEPLOIEMENT.md` §9) :
  persistance + preuves base-réelle vertes (Piste A), `G-CONSTRUCTION` franchi (Piste B),
  reprise démontrée + export + notices + support nommé + revue locale/données (Piste C + C16/C17).
- **D2.** `D10` région : **mesurer** la latence p50/p95 depuis Douala/Yaoundé vers les candidats
  Neon Paris/Francfort, produire une note chiffrée → **ADR `[PROPOSÉ]`** que le porteur signe.
- **D3.** `D04`/`D05`/`D06` : produire les **candidats + POC + coûts** (pas de souscription,
  pas d'envoi réel) et des ADR `[PROPOSÉ]` ; l'adoption reste humaine.

---

## 3. Méthode par piste (harness de réalisation, à respecter)

`Inspecter → Contractualiser → Construire → Éprouver → Revoir → Prouver`
(cf. `C28`/`C29` harness de réalisation) :

1. **Inspecter** : état existant, fichiers impactés, dépendances, incertitudes, tâches bornées.
   Citer **chemin + symbole** pour chaque affirmation sur le code. Dépendance absente ⇒ livrer
   contrat + tests en `BLOCKED` explicite, jamais un succès simulé.
2. **Contractualiser** : entrées/sorties, autorisations objet/champ/période, invariants, erreurs
   stables (`DomainError`), sémantique transaction/reprise, numéros de stories. Pour toute
   nouvelle lib : doc officielle + compat + licence + **version épinglée**.
3. **Construire + tester** : rendre le défaut reproductible d'abord. **Ne pas mocker PostgreSQL**
   pour prouver verrou/RLS/atomicité. Oracles monétaires indépendants du code de prod. Chemin
   négatif ⇒ vérifier aussi **absence d'écriture** et **absence de divulgation**.
4. **Éprouver** : commande répétée, deux acteurs concurrents, identité révoquée, autre groupe,
   état dépassé, horloge cliente fausse, crash avant/après commit, réseau coupé.
5. **Revoir** : diff, migrations, perf, permissions — par une **personne distincte** pour le
   critique. **Aucun test désactivé pour passer.**
6. **Prouver** : commandes exactes, stdout/stderr **expurgés**, codes de sortie, environnement,
   SHA du commit, versions de schéma, résultats scénario par scénario, anomalies restantes.
   Un test écrit ≠ un test exécuté. Format : `docs/PREUVES_<piste>.md`.

---

## 4. Barres de validation (reproduites à chaque incrémentation)

```bash
$env:PYTHONIOENCODING='utf-8'
git pull --rebase origin master
pnpm install --frozen-lockfile
pnpm -r build; pnpm -r typecheck; pnpm -r test
# Persistance/pistes DB depuis cet hôte Windows SANS Docker, mais AVEC Neon :
#   KOMBE_TEST_DATABASE_URL = pooler DIRECT Neon ; export KOMBE_DATABASE_URL = kombe_migrateur
node packages/db/tests/isolation.pg.mjs            # exit 0 attendu
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   # exit 0
```
- `pnpm -r test` attendu ≥ 587 tests verts (sauf `@kombe/client` vite = échec d'environnement
  pré-existant connu, **accepter**). Toute **baisse** = investiguer, pas masquer.
- **H00** : `py -3 harness/run_h00.py --commit <SHA40> --out harness/reports/RAPPORT_G_CONSTRUCTION.json`.
  Ne **commit/push le rapport régénéré** qu'avec ratification lead (contrôleur protégé, §1.2).

---

## 5. Interdictions récapitulatives

- ❌ Éditer/push `run_h00.py`, `verify_gate.py`, le rapport H00, `verifier_coordination.py`,
  `MESSAGES.schema.json` **sans ratification** — sinon c'est exactement ce que H06/H20 existent
  pour empêcher (conflit d'intérêt producteur = contrôleur).
- ❌ Forcer un `BLOCKED → PASS` (H18 notamment) ou éditer un workflow pour afficher du vert.
- ❌ Souscrire un service, déployer en prod, envoyer un message/email/SMS réel, toucher des
  données réelles avant G0.
- ❌ Adopter à la place du porteur une décision `D04/D05/D06/D07/D10`.
- ❌ Modifier `KOMBE_Audit_Construction/` ou un invariant monétaire/RLS/append-only sans ADR.
- ❌ Signer (`done`) un lot que **tu** as produit (H06).

---

## 6. Format de réponse de fin de piste (obligatoire)

```
## PISTE <A|B|C|D> — [AVANCÉ | PARTIEL | BLOCKED]
- Objectif atteint ? : …
- Changements par fichier : chemin + symbole + quoi
- Contrats / migrations ajoutés : …
- Commandes RÉELLEMENT exécutées + codes de sortie : …
- Résultats scénario par scénario (C29-RESTORE/RIGHTS/OUTBOUND, Hxx…) : …
- Limites / ce qui reste BLOCKED (et POURQUOI : opérateur / infra / décision humaine) : …
- Diff contrôleur éventuel PRÉPARÉ mais RETENU (à ratifier) : …
- Preuve archivée : docs/PREUVES_<piste>.md ; SHA ; empreintes
- Défauts non résolus + prochaine dépendance : …
```
**Ne pas** livrer un simple plan : livrer l'incrément + sa preuve, ou un `BLOCKED` motivé.
Finir par une **livraison reviewable** (commit à préfixe explicite, ex.
`claude-code(preprod A1): soudure API↔Neon persistance`).
