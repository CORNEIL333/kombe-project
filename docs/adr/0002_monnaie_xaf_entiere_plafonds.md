# ADR-0002 — Monnaie XAF entière, plafonds, canonicalisation des montants

- **Statut :** ADOPTÉ (C00). Plafond unitaire = valeur provisoire `[OUVERT-D07]`.
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
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
  `PER_AMOUNT_CEILING = 1 000 000 000` XAF — proposition `[OUVERT-D07]`, en vigueur
  par défaut jusqu'à décision contraire du porteur. Le plafond dur d'entier sûr
  s'applique à **tout** montant, agrégats compris.
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
- Le plafond unitaire doit être revu à la porte G1 avant tout pilote réel ;
  sa valeur provisoire est explicitement signalée `[OUVERT-D07]` dans le code et
  l'index ADR, sans être présentée comme acquise.
