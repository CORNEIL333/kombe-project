# ADR-0018 — Validations et corrections de cotisations : indépendance, compensation unique, fenêtre de contestation

- **Statut :** ADOPTÉ (C07). Logique pure **testée** ; verrou réel / sérialisation
  concurrente / atomicité DB / append-only des actes = contrat posé, preuve base
  réelle **BLOCKED**.
- **Auteur :** Lead technique C07 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 6.2 (machine à états déclarée/confirmée/validée/
  rejetée/compensée, rejet avant validation seulement, compensation liée), 6.3
  (double/triple validation, déclarant ≠ confirmateur, troisième contrôleur si
  requis, confirmation sans contrôleur = validation atomique), 6.4 (anti-collusion,
  indépendance non désactivable, notification ≠ validation), 6.5 (contestation :
  fenêtre ordinaire 7 jours, fraude/erreur grave hors délai, blocage avant
  validation / gel des dépendances après), 6.6 (correction : aucune suppression,
  contre-écriture liée, original compensé au plus une fois) ; `ARCHITECTURE_CIBLE.md`
  §Commande et §« Sous verrou » ; ADR-0002 (monnaie XAF entière), ADR-0004 (schéma
  d'événement, chaîne de hash), ADR-0006 (RBAC objet, version optimiste), ADR-0007
  (isolation multi-tenant RLS), ADR-0016 (journal append-only, replay versionné),
  ADR-0017 (déclarations et idempotence, `contribution`/`obligation`). Dépend de
  C06 (cotisations déclarées) et C11 (scellement/replay des événements
  `contribution.validated` / `contribution.compensated`).

## Décision
- **Machine à états explicite, jamais de mutation silencieuse** (6.2) :
  `declared → confirmed → validated`, avec `rejected` atteignable **avant
  validation seulement** et `compensated` atteignable **après** `validated`.
  `confirmContribution`/`controlContribution`/`rejectContribution`/
  `compensateContribution` vérifient la précondition d'état et lèvent
  `CONTRIBUTION_STATE_INVALID` (409) sinon — rejeter ou compenser un état
  incohérent n'a **aucun effet d'écriture**.
- **Indépendance non désactivable entre déclarant et confirmateur** (6.3, 6.4) :
  le **déclarant effectif** qui se confirme lui-même produit
  `validationAccepted = false` / `reason = SELF_DECLARANT` et **ne modifie pas**
  la cotisation (pas d'écriture, pas d'événement). Ce n'est pas une erreur 4xx :
  l'acte est refusé comme décision métier, la cotisation reste `declared`.
- **Anti-cumul : un acteur ne pose qu'un seul acte** (6.3, C07-TRIPLE) : celui qui
  a **confirmé** ne peut **contrôler** la même cotisation
  (`validationAccepted = false`, `reason = ACTOR_ALREADY_ACTED`). Un tiers
  distinct parachève la validation au seuil `requiredControllers`. En base, cette
  règle est **structurelle** : `UNIQUE (group_id, contribution_id,
  actor_identity_id)` sur `contribution_act`.
- **Confirmation sans contrôleur = validation atomique** (6.3) : si
  `requiredControllers = 0`, la confirmation par un acteur indépendant valide la
  cotisation **dans le même acte** (`validationCompleted = true`) et pose
  l'événement scellé `contribution.validated`. Sinon l'acte ne fait que passer
  l'objet en `confirmed` (`reason = AWAITING_CONTROLLERS`).
- **Le seuil de validateurs est une règle, pas une moyenne** (6.3, 6.4) :
  `requiredControllers` provient des **règles versionnées** (C04) ; le serveur
  compare le nombre de **contrôleurs distincts** au seuil. Une notification n'est
  jamais comptée comme validation (les événements de notification sont hors
  chaîne métier).
- **Correction par contre-écriture liée, jamais par effacement** (6.2, 6.6) : un
  original **validé** est corrigé en posant une **compensation** — un événement
  inverse `contribution.compensated` rattaché à l'original (via
  `compensates_contribution_id`), et l'original bascule en `compensated` avec
  `compensatedById` pointant la contre-écriture. L'écriture d'origine et ses
  validations **restent** ; le replay C11 **retranche** le montant du validé net.
  Aucun `UPDATE`/`DELETE` métier d'un validé.
- **Un original n'est compensé qu'une seule fois** (6.6, C07-REVERSE) : une
  seconde compensation du même original lève `CONTRIBUTION_ALREADY_COMPENSATED`
  (409) **sans** seconde contre-écriture ; `reversalCount` reste à 1. En base,
  un **index partiel UNIQUE** sur `compensates_contribution_id` rend la règle
  incompressible, indépendante de toute course serveur.
- **Contestation bornée dans le temps, effets distincts avant/après validation**
  (6.5) : `raiseDispute` exige un **motif non vide** (`DISPUTE_REASON_REQUIRED`)
  et, pour un litige **ordinaire**, une ouverture dans les **7 jours** suivant la
  notification (`DISPUTE_WINDOW_CLOSED`, 422) ; **fraude** et **erreur grave**
  sont toujours recevables. Un litige **ouvert** **bloque la validation** d'une
  cotisation non encore validée (`VALIDATION_BLOCKED_BY_DISPUTE`, 409, sans
  écriture) et **gèle les opérations dépendantes** (clôture de tour, etc. —
  `ROUND_CLOSE_BLOCKED_BY_DISPUTE`, 409) **sans effacer** écriture ni validation
  historique.
- **Résolution du litige hors pilote** (6.5, 6.6) : la **clôture** d'un litige est
  un acte de **gouvernance/vote** (C-vote), délibérément **non cavité** ici —
  aucun rôle applicatif de base ne porte `dispute.resolve`, de sorte qu'aucune
  validation ne peut être « débloquée » unilatéralement au pilote.
- **Garde objet réutilisée, inchangée** (ADR-0006) : chaque acte de validation
  passe par RBAC objet (`assertAllowed("contribution.validate")`), anti-IDOR
  (`isCrossGroupAccess`) et **version d'objet attendue**
  (`assertExpectedVersion` → `EVENT_CHAIN_BREAK`, 409). L'acte de lever un litige
  exige `dispute.raise`.

## Alternatives rejetées
- Traiter l'indépendance violée comme une exception 4xx — rejeté : le refus
  d'un acte **non avenu** est une **décision** (`validationAccepted = false`,
  aucune écriture), pas un échec de requête ; la 4xx est réservée aux violations
  d'état/de droits/de version.
- Autoriser un même acteur à confirmer puis contrôler « pour accélérer » —
  rejeté : contredit 6.3/6.4 (anti-collusion) ; la base l'interdit par l'UNIQUE
  des actes.
- Corriger une cotisation validée par `UPDATE` du montant ou `DELETE` puis
  ressaisie — rejeté : contredit 6.6 (préservation de l'historique) ; on pose
  une **contre-écriture liée** et, si besoin, une **nouvelle** déclaration.
- Compenser plusieurs fois le même original (cumul de contre-écritures) —
  rejeté : fausserait le solde ; la compensation est **au plus une fois**.
- Supprimer/réécrire un litige pour débloquer une dépendance — rejeté : le
  litige conserve sa valeur historique ; après validation il **gèle** sans
  effacer, et sa résolution relève de la gouvernance.
- Faire dépendre la fenêtre de contestation d'un réglage client — rejeté : la
  fenêtre (7 j) est une **règle**, bornée structurellement en base pour
  l'ordinaire, tandis que fraude/erreur grave y échappent par nature.

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/validation.ts`
  (+23 tests domain : machine à états et préconditions, indépendance
  SELF_DECLARANT, anti-cumul ACTOR_ALREADY_ACTED, confirmation atomique vs
  seuil de contrôle, rejet avant validation seulement, compensation unique
  CONTRIBUTION_ALREADY_COMPENSATED, fenêtre de litige ordinaire/fraude, motif
  obligatoire, blocage de validation et gel des dépendances) — soit **177** tests
  domain au total. Erreurs **stables ajoutées** dans `errors.ts` :
  `CONTRIBUTION_STATE_INVALID` (409), `CONTRIBUTION_ALREADY_COMPENSATED` (409),
  `VALIDATION_BLOCKED_BY_DISPUTE` (409), `ROUND_CLOSE_BLOCKED_BY_DISPUTE` (409),
  `DISPUTE_WINDOW_CLOSED` (422), `DISPUTE_REASON_REQUIRED` (422).
- Application **testée** : `packages/api/src/validationStore.ts` et routes C07
  dans `server.ts` (`POST …/contributions/:id/confirmations|control|rejections`
  200, `POST …/compensations` 201, `POST /v1/groups/:groupId/disputes` 201,
  `POST …/obligations/:obligationId/dependent-operation-attempts` 200, `GET
  …/contributions/:id`) — **12** tests API (soit **77** au total) couvrant
  **C07-SELF** (déclarant se confirmant ⇒ `validationAccepted = false`, 0
  événement validé), **C07-TRIPLE** (confirmateur ≠ contrôleur ; second acte du
  même acteur refusé ; tiers distinct valide), rejet après validation (409),
  **C07-REVERSE** (seconde compensation ⇒ 409, `reversalCount = 1`), litige avant
  validation bloquant (409, 0 écriture), fenêtre ordinaire hors délai (422) vs
  fraude recevable (201), gel des dépendances après validation (409), plus
  permission/anti-IDOR/version (403/403/409). Les stores restent **fictifs** : ils
  délèguent au domaine et **ne simulent ni verrou, ni atomicité, ni append-only**.
- Contrat DB posé par `0009_contribution_validation.sql` (**additif** aux socles
  0001 et 0008) : CHECK `contribution.state` **+= `confirmed`** et colonnes
  `declarant_identity_id` / `required_controllers` ; table append-only
  `contribution_act` (`UNIQUE (group, contribution, actor)` anti-cumul, **trigger
  d'indépendance** refusant l'acte du déclarant, trigger append-only + **`REVOKE
  UPDATE, DELETE`** pour `kombe_app`, RLS) ; **index partiel UNIQUE**
  `contribution_one_reversal_per_original` (compensation unique) ; `dispute`
  enrichi (`category` CHECK, `reason`, `notified_at`, `raised_at`) + CHECK
  `dispute_reason_present` + CHECK `dispute_ordinary_window` (ordinaire ≤ 7 jours,
  fraude/erreur grave exemptées) ; avec son **down** (rétablit la CHECK d'état
  0001). La preuve **effective** (scénarios C07-SELF / C07-TRIPLE / C07-REVERSE /
  C07-DISPUTE de `tests/isolation.pg.mjs`) reste **BLOCKED** sans PostgreSQL.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH` et les types
  d'événement **déjà rejoués** par C11 (`contribution.validated` +amount,
  `contribution.compensated` −amount) — C07 n'introduit **aucun** nouveau type
  d'événement ni nouvelle chaîne ; il **compose** avec le replay existant. La
  monnaie entière (ADR-0002), la canonicalisation (ADR-0003) et la RBAC objet
  (ADR-0006) sont réutilisées sans redéfinition.
- **Limites conservées** : la **sérialisation concurrente** de deux compensations
  d'un même original (`SELECT … FOR UPDATE`) et l'**atomicité** événement
  inverse / projection / outbox sont des **preuves base réelle BLOCKED** ; en pur,
  la garde « au plus une fois » est déterministe et `reversalCount` est borné à 1,
  mais la **course effective** n'est pas encore prouvée. La **résolution** de
  litige et le **mandat** (auteur ≠ membre concerné, règle de conflits approuvée)
  relèvent de lots ultérieurs (gouvernance/vote) et restent **gated serveur**
  (ADR-0005) ; aucune notification réelle n'est émise.
