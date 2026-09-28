# ADR-0014 — Moteur de règles versionnées, immuables et non rétroactives

- **Statut :** ADOPTÉ (C04). Logique pure **testée** ; application DB = contrat
  posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C04 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 3.1–3.7, 6.7 ; `ARCHITECTURE_CIBLE.md`
  §Snapshot de règles ; règle cardinale du pilote « une part, rotation égale,
  pas de pouvoir financier caché » ; ADR-0002 (monnaie entière), ADR-0003 (hash
  canonique RFC 8785), ADR-0005 (barrières serveur du pilote), ADR-0013 (acceptation
  des règles = consentement horodaté). Dépend de C01 (identité/rôles) et C03
  (groupe, acceptation des règles pour amorçage).

## Décision
- **Version de règles = instantané immuable scellé par hash canonique** (3.1) :
  un `RuleSet` (effectif, cotisation entière bornée, tours, fréquence, quantième
  d'échéance, quorum, grâce, pénalités) est validé/normalisé par
  `compileRuleSet`, puis **publié** par `publishRule` qui pose
  `hash = canonicalHash(snapshot)` (RFC 8785, ADR-0003). Une version publiée ne
  se **modifie jamais** : `assertVersionImmutable` refuse tout instantané
  candidat dont le hash diverge (`RULE_VERSION_IMMUTABLE`) ; changer une règle =
  **nouvelle version** chaînée par `supersedes`.
- **Acceptation sur hash EXACT** (3.2) : le consentement d'une identité porte sur
  le hash de la version publiée ; `acceptRuleVersion` rejette tout hash approximé
  ou divergent (`RULE_ACCEPT_HASH_MISMATCH`, HTTP 412). Cela prolonge la règle
  C03 (acceptation = précondition d'amorçage et de cotisation).
- **Non-rétroactivité** (3.4, C04-RETRO) : une nouvelle règle ne **réécrit aucune
  échéance déjà passée**. `assertNonRetroactive(before, after, now)` compare les
  obligations avant/après recalcul et lève `RULE_RETROACTIVE` (HTTP 409) si une
  échéance dont `dueAtMs < now` verrait son montant ou sa date modifiée. Seules
  les échéances **futures** peuvent évoluer ; la réponse porte
  `past_due_changed = false`.
- **Engagement essentiel ⇒ cycle suivant, sauf accord unanime** (3.7, C04-ACCEPT) :
  `isEssentialFinancialChange` détecte un changement de cotisation / effectif /
  tours. `planRuleChange` pose alors `appliesTo = "next_cycle"` et
  `requiresAllConcernedAcceptance = true` ; `newRuleEffective` ne renvoie `true`
  que si **chaque** personne concernée a accepté la version exacte — **un seul
  refus ⇒ `new_rule_executed = false`**, la règle courante reste en vigueur. Un
  changement non essentiel s'applique immédiatement.
- **Barre pilote sur les pénalités** (6.7, C04-PENALTY) : au pilote,
  `compileRuleSet` normalise **imposablement** `penaltyEnabled = false` et exige
  `rounds === memberCount` (une part par membre). `requestPenaltyEnabled` renvoie
  **toujours** `penalty_enabled = false` au pilote (demande tracée,
  `rejected = true`) — aucune valeur imposée par un client n'active de pénalité.

## Alternatives rejetées
- Versionner les règles par incréments destructifs (`UPDATE` de l'instantané en
  place) — rejeté : détruirait la preuve de consentement (le hash accepté ne
  correspondrait plus à la règle appliquée) et permettrait des rétro-écritures.
- Acceptation portant sur un numéro de version plutôt que sur le **hash exact** —
  rejeté : deux versions pourraient porter la même étiquette ; le consentement doit
  porter sur l'objet exact approuvé (cohérent avec ADR-0003 et ADR-0013).
- Application immédiate d'un changement financier essentiel avec simple
  notification — rejeté : imposerait une dette nouvelle sur des engagements déjà
  pris ; le désaccord d'un seul concerné bloque l'exécution (C04-ACCEPT).
- Activation des pénalités « côté serveur mais commandable par l'animator » au
  pilote — rejeté : introduirait un pouvoir financier non consenti ; la barre est
  absolue (`penaltyEnabled = false`) tant que le pilote court (ADR-0005).

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/rules.ts` (+15 tests
  domain couvrant compile/publication/immuabilité, acceptation-hash, plan
  essentiel/non-essentiel, effectivité unanime, non-rétroactivité, barre pénalité),
  `packages/api/src/rulesStore.ts` et routes C04
  (`/groups/:id/rule-versions`, `/rule-versions/:version/acceptances`,
  `/rule-changes`, `/cycle-recalculations`, `/penalty-requests`) — 6 tests API
  couvrant C04-PENALTY / C04-RETRO / C04-ACCEPT et l'acceptation sur hash exact.
- Contrat DB posé par `0005_rules_engine.sql` (**additif** au socle 0001) : colonnes
  `snapshot_hash`/`supersedes`/`published_at`, CHECK hash hexadécimal 64, FK
  composite d'auto-chânage, CHECK pilote « pas de pénalité », **déclencheur
  d'immuabilité** (`rule_version_no_update` BEFORE UPDATE OR DELETE) et CHECK
  d'acceptation non-nullable ; avec son **down**. La preuve **effective**
  (mutation d'une version refusée par le déclencheur, pénalité pilote impossible —
  scénarios C04-IMMUTABLE / C04-PENALTY de `tests/isolation.pg.mjs`) reste
  **BLOCKED** sans PostgreSQL.
- Le recalcul complet du cycle (génération des échéances) et la détermination des
  dates au calendrier réel relèvent de **C05** ; C04 pose la **garde** qui interdit
  qu'un changement de règle touche le passé, et le **plan** d'application.
