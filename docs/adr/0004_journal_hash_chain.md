# ADR-0004 — Schéma d'événement et chaîne de hash du journal

- **Statut :** ADOPTÉ (C00). Persistance réelle = BLOCKED sans PostgreSQL (voir ADR-0010).
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** `ARCHITECTURE_CIBLE.md` §Journal append-only et preuves ;
  `00_PROMPT_MAITRE` (journal inviolable, projections reconstruisibles).

## Décision
- Journal **append-only**. Schéma d'événement figé :
  `{ groupId, seq, type, version, previousHash, payload, hash }`.
- `hash` = SHA-256 sur la forme canonique RFC 8785 de l'événement **sans son propre
  champ `hash`** (règle : « exclure seulement le champ de son propre hash ») —
  cf. `computeEventHash`.
- **Hash de genèse explicite** : `GENESIS_HASH = "0".repeat(64)`. Le premier
  événement d'une chaîne porte `previousHash = GENESIS_HASH`.
- Continuité vérifiée par `verifyChain` : genèse en tête, `seq` à partir de **1**
  par pas de 1, chaque `previousHash` égal au `hash` du prédécesseur, intégrité de
  chaque événement. Rupture → `EVENT_CHAIN_BREAK` ; hash incohérent →
  `EVENT_HASH_MISMATCH`.
- Les **projections** se reconstruisent à partir du journal ; ce module ne définit
  que structure + vérification, **pas** la persistance.

## Alternatives rejetées
- Hash incluant le champ `hash` lui-même — cycle non calculable.
- Genèse implicite (chaînée depuis null/absent) — ambiguïté entre groupes ; d'où
  une constante explicite de 64 zéros.
- Journal modifiable / upserts — contredit l'append-only et l'auditabilité.

## Conséquences
- Vérifiable en **pur** (42 tests domain dont chaînage et rupture) ; l'**unicité
  `(group_id, seq)` et la atomicité d'écriture** relèvent de constraints/locks
  PostgreSQL → preuve base réelle renvoyée en C01, statut **BLOCKED** ici.
- `payload` ne doit contenir que des entiers sûrs et chaînes (profil ADR-0003).
