# PROMPT À COPIER DANS CHATGPT / CODEX — Lot C13 (outbox worker + notifications internes)

> Message de handoff associé : `COORDINATION_MULTI_HARNESS/handoff/6886d239-4c1a-4f7d-b5de-cdb232361817.json`
> (qoder → codex, base `a616ee9`, C08/C09 en `in_review` sur `master`).
> Copier tout ce qui suit dans ChatGPT/Codex, avec accès au dépôt `https://github.com/CORNEIL333/kombe-project.git` (branche `master`).

---

Tu es le harnais **`codex`** (OpenAI Codex) dans la coordination multi-harnais KÓMBE. Tu construis le lot **C13 — Outbox worker + notifications internes** (porte **G0**, dépendances **C01, C11** ; stories **11.1, 11.4, 18.6**). Le lot t'est attribué dans `COORDINATION_MULTI_HARNESS/ETATS_LOTS.json` (`status: in_progress`, `owner_harness_id: codex`). Tu es **producteur seulement** : tu ne signes jamais ta propre livraison (`done` exige un harnais distinct), tu ne modifies **ni** le contrôleur `harness/`, **ni** `COORDINATION_MULTI_HARNESS/verifier_coordination.py`, **ni** `KOMBE_Audit_Construction/` (dossier source, figé).

## 1. Lis d'abord (obligatoire, dans cet ordre)

1. `KOMBE_Audit_Construction/03_Prompts/C13_PROMPT.md` — mission, contraintes, scénarios C13-FAIL / C13-WORKERS / C13-OPT_OUT, stories 11.1/11.4/18.6.
2. `docs/adr/` — notamment 0004 (journal hash chain), 0005 (barrières serveur), 0006 (RBAC/anti-IDOR/version), 0007 (RLS), 0016 (journal d'événements/projections), 0017 (idempotence).
3. `STACK.md` — outbox transactionnelle = patron de fiabilité choisi ; Node 22, TS strict, Fastify, `pg`, XAF entier, aucune promesse exactly-once externe.
4. Le code existant et ses conventions : `packages/worker/src/outbox.ts` (squelette du contrat `OutboxMessage`, refuse tout succès simulé), `packages/domain/src/{journal,errors,index}.ts` (`sealEventV1`, `GENESIS_HASH`, `DomainError`), `packages/db/migrations/0007_event_journal.sql` (journal append-only — **ne pas toucher** `kombe_journal_append_only()`), un store de référence côté API (`packages/api/src/disbursementStore.ts`) et un test de recette de référence (`packages/api/test/disbursement.test.ts`).
5. `COORDINATION_MULTI_HARNESS/{REGISTRE_HARNESS,ETATS_LOTS}.json` — ton identité : `harness_id: "codex"`, `identity_key: "codex:pending"`.

## 2. Périmètre de fichiers (déclaré, non négociable)

- `packages/worker/src/**` — worker, lease, backoff, dead-letter, simulateur de prestataire, notifications internes.
- `packages/db/migrations/0013_outbox.sql` + `0013_outbox.down.sql` — **additif** ; brancher explicitement les deux dans la liste ordonnée de `packages/db/tests/isolation.pg.mjs` (les migrations ne sont pas auto-découvertes ; `roles.sql` reste après toutes les migrations).
- `packages/worker/test/**` — recette via domaine pur + faux canaux.
- `docs/PREUVES_C13.md`, `COORDINATION_MULTI_HARNESS/ETATS_LOTS.json` (C13 uniquement), messages `COORDINATION_MULTI_HARNESS/handoff/*.json`.
- `docs/openapi.yaml` **seulement si** une route de consultation (journal de livraison, relecture administrative) est livrée.
- **Interdiction** de modifier les paquets `domain`/`api` d'autrui en cours de route ; si une interface partagée doit changer, la déclarer dans la livraison et proposer, ne pas imposer.

## 3. Invariants stricts (chaque refus = sans écriture, sans divulgation)

1. **Outbox transactionnelle** : l'événement métier (journal C11) et la tâche d'alerte s'écrivent dans la **même transaction** PostgreSQL. Une alerte jamais perdue après transaction réussie (18.6).
2. **Worker à lease borné** : `locked_by` / `locked_until` (ou `SELECT … FOR UPDATE SKIP LOCKED`), durée de lease explicite, reprise après crash du worker sans double distribution durable.
3. **Backoff avec jitter, tentatives bornées, dead-letter** : après `attemptsMax`, la tâche passe en dead-letter **traçable** (relecture administrative tracée, quota défini), jamais en boucle infinie ni en perte silencieuse.
4. **Unicité** `(event_ref, recipient, channel, type)` = contrainte structurelle en base (PK/UNIQUE), pas un compteur applicatif.
5. **Interne ≠ externe** : les notifications internes se persistent **indépendamment** d'un canal externe ; l'échec externe ne bloque ni la transaction métier, ni la notification interne (11.4). C13-FAIL : `financial_validation_preserved = true`.
6. **Relecture préférences/droits AU DISPATCH** : un destinataire qui a retiré son opt-out externe avant dispatch ⇒ `external_sent = false` (C13-OPT_OUT). Deux workers sur la même alerte interne ⇒ `internal_notification_count = 1` (C13-WORKERS — en base réelle ; sans PostgreSQL, statut **BLOCKED**, jamais simulé).
7. **Crash après acceptation du prestataire** = statut **ambigu** (peut être envoyé), pas de promesse exactly-once ; re-distribution possible ⇒ les canaux consommateurs doivent être idempotents via `idempotencyRef` (hash canonique RFC 8785).
8. **Aucun contenu financier** (montants, soldes, détails sensibles) dans les push écran verrouillé, les logs ou les messages d'erreur prestataire. Les montants, s'ils circulent dans un payload interne, sont des **chaînes XAF entières** — jamais de float (ADR-0002).
9. **Le serveur décide** (règle 18 / ADR-0005) : ni l'horodatage, ni le destinataire, ni le canal ne viennent d'un client de confiance ; TTL des tâches et suspension de canal pilotés serveur.
10. **Toutes les erreurs sont stables** : réutiliser les codes du domaine (`DomainError`) ou en ajouter au registre `packages/domain/src/errors.ts` avec mapping HTTP dans `server.ts` si une route de consultation est livrée.

## 4. Harness de réalisation (méthode obligatoire)

Inspecter → Contractualiser → Construire & tester → Éprouver → Revoir → Prouver.
- D'abord **reproduire le scénario de défaut** (ex. double dispatch de deux workers), puis implémenter.
- Les mocks ne servent qu'aux **frontières externes** (simulateur de prestataire) ; **ne jamais mocker PostgreSQL** pour prétendre prouver lease, unicité ou atomicité : ces preuves sont **BLOCKED** sans base réelle (exit 2 d'`isolation.pg.mjs`, consigné honnêtement).
- Un chemin négatif vérifie aussi **absence d'écriture** (compteurs d'événements) et **absence de divulgation** (404 non-divulgation, erreurs stables).
- Horloge **injectée** ; fixtures **fictives** ; aucun message réel, achat ou transfert pendant les tests.

## 5. Commandes de validation (doivent être vertes ou BLOCKED honnêtes)

```
pnpm -r build
pnpm -r test                      # ne casse RIEN de l'existant : domaine 256 / API 144 attendus
node --check packages/db/tests/isolation.pg.mjs
node packages/db/tests/isolation.pg.mjs   # exit 2 = BLOCKED sans PostgreSQL (honnête) ; exit 0 si base réelle dispo
python COORDINATION_MULTI_HARNESS/verifier_coordination.py   # doit sortir 0 / PASS
python harness/run_h00.py --commit <SHA_40_hex_de_ton_commit_code> --out harness/reports/RAPPORT_G_CONSTRUCTION.json
```

Ne déclare **jamais** un test exécuté s'il est seulement écrit. Aucun statut PASS simulé. Un test existant ne se désactive pas pour passer.

## 6. Protocole de livraison (à la lettre)

1. Commit code, préfixe **`codex(C13): …`** → note le SHA complet (40 hex).
2. H00 sur ce SHA (rapport regenerated).
3. `docs/PREUVES_C13.md` sur le modèle de `docs/PREUVES_C08.md` / `docs/PREUVES_C09.md` (Inspect/Contractualiser/Construire/Éprouver/Revue/Limites BLOCKED/Rapport H00/Défauts restants ; hashes SHA-256 des artefacts).
4. `ETATS_LOTS.json` : C13 → **`in_review`** (jamais `done` par toi-même), `evidence_ref: docs/PREUVES_C13.md`, `commit: <SHA>`, owner `codex`.
5. Message `handoff/<uuid>.json` : `from_harness_id: "codex"`, `to_harness_id: "qoder"` (relecteur), `action: "pass"`, `commit_sha`/`base_head_sha` = SHAs réels existants, `signature: "codex:pending"`, `evidence: {"type": "prevues_md", "ref": "docs/PREUVES_C13.md"}`.
6. `python COORDINATION_MULTI_HARNESS/verifier_coordination.py` → **PASS exit 0** obligatoirement avant le commit preuves.
7. Commit preuves (`codex(C13): preuves + coordination in_review …`) puis `git push origin master`.

Commentaires de code en **français**, style du dépôt (TS strict, zod aux frontières, stores délèguant toute décision au domaine pur).

## 7. Format de réponse de fin de lot

Objectif atteint ; changements par fichier ; contrats/migrations ; résultats **réellement** exécutés et leurs limites ; défauts non résolus ; preuves et commandes de reproduction ; prochaine dépendance (ex. PostgreSQL 16 pour lever C13-WORKERS en base réelle). Ne pas se limiter à un plan.
