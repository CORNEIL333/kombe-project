# ADR-0002 — Monnaie XAF entière, plafonds, canonicalisation des montants

- **Statut :** ADOPTÉ (C00), **y compris le plafond unitaire** — `[OPEN-D07]` clos par
  décision humaine du porteur le 2026-10-06 : `1 000 000 000` XAF confirmé (pas de
  changement de valeur, la valeur par défaut déjà en vigueur dans le code est ratifiée).
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27 · **Ratification plafond :** 2026-10-06
- **Contexte / origine :** `01_Audit/ARCHITECTURE_CIBLE.md` §Invariants de données ;
  `00_PROMPT_MAITRE` (les montants ont un oracle **indépendant** du code de production) ;
  STACK.md §Contraintes (OPEN-D07 plafond).

## Décision
- Devise du registre : **XAF**, unité entière, **aucune sous-unité**, **aucun float**.
- Représentation interne : `bigint`. Sortie JSON : uniquement des **entiers sûrs**
  (`Number.MAX_SAFE_INTEGER` = 9 007 199 254 740 991), bornes `MAX_SAFE`.
- Un **float monétaire est une erreur**, jamais une approximation : `parseAmount`
  refuse tout non-entier (`MONEY_NOT_INTEGER`) et tout dépassement d'entier sûr
  (`MONEY_OVER_SAFE_CEILING`) **sans arrondi**.
- Plafond **par montant unitaire** (contribution / dette d'un tour) :
  `PER_AMOUNT_CEILING = 1 000 000 000` XAF — **ratifié** par le porteur (2026-10-06,
  `[OPEN-D07]` clos), valeur inchangée par rapport au défaut déjà en vigueur dans le
  code. Le plafond dur d'entier sûr s'applique à **tout** montant, agrégats compris.
- Toute valeur monétaire est validée par `money()` avant agrégat ou hash ; erreurs
  stables et non divulguantes (code + message, jamais de fuite interne).

## Alternatives rejetées
- `number` IEEE-754 / decimal à virgule flottante — pertes de précision, arrondis
  silencieux, hash non reproductible.
- Stocker des centimes fractionnaires — le XAF n'a pas de sous-unité en usage ;
  introduirait une ambiguïté d'oracle.
- `bigint` brut exposé tel quel au JSON — dépassement silencieux de l'entier sûr
  côté consommateur ; d'où la borne `MAX_SAFE` et `toSafeNumber`.

## Conséquences
- Invariants testés par `packages/domain/src/money.ts` et **recroisés contre
  l'oracle Python indépendant** (`reference_oracles.py` → `oracle.test.ts`, 21 vecteurs).
- Le plafond unitaire est désormais **acquis** (`[OPEN-D07]` clos le 2026-10-06) ;
  une révision reste possible par un nouvel ADR si l'usage réel du pilote le justifie,
  mais ce n'est plus une valeur provisoire par défaut.
