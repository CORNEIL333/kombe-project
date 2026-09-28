# ADR-0017 — Déclarations partielles et idempotence : registre durable, capacité sous verrou

- **Statut :** ADOPTÉ (C06). Logique pure **testée** ; verrou réel / sérialisation
  concurrente / atomicité DB = contrat posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C06 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 6.1 (déclarer un montant, espèces/électronique,
  date alléguée), 6.9 (aucune valeur par défaut d'argent, pas de preuve présumée),
  18.1 (idempotence de commande), 18.2 (concurrence et version optimiste),
  18.3 (déclarations partielles couvrant une obligation, excédent bloqué) ;
  `ARCHITECTURE_CIBLE.md` §Commande et §« Sous verrou » ; ADR-0002 (monnaie XAF
  entière), ADR-0003 (canonicalisation RFC 8785 → hash de corps), ADR-0004 (schéma
  d'événement, chaîne de hash), ADR-0006 (RBAC objet, version optimiste),
  ADR-0007 (isolation multi-tenant RLS), ADR-0015 (cycle/tours produisant les
  obligations), ADR-0016 (journal append-only, événement scellé). Dépend de C00
  (canonicalisation/chaîne), C01 (rôles/RLS), C04 (règles), C05 (obligations),
  C11 (scellement d'événement).

## Décision
- **L'idempotence naît d'un registre DURABLE, jamais d'un cache TTL** (18.1) :
  une entrée est scopée `(acteur, groupe, type de commande, clé d'idempotence)`
  et porte le **hash canonique du corps sémantique**. Un cache expiré **ne recrée
  jamais** une exécution : après timeout ou coupure, le rejeu relit le registre
  posé en base, pas une mémoire volatile.
- **Même clé / même corps = rejeu ; même clé / corps différent = conflit 409**
  (18.1) : `decideIdempotency` renvoie `execute` (aucune entrée), `replay` du
  résultat d'origine **sans second événement métier** (hash de corps égal), ou
  `conflict` (hash différent → `IDEMPOTENCY_BODY_CONFLICT`, HTTP 409). Aucun
  écrasement silencieux d'une commande déjà appliquée.
- **Le hash de corps ne retient que le sémantique** (ADR-0003) :
  `contributionBodyHash` hache obligation, montant, canal, référence/motif
  (**absents ≠ valeur** : une propriété optionnelle absente n'est pas sérialisée)
  et date alléguée. Un changement de **montant** sous la même clé change le hash
  → conflit ; un rejeu strictement identique reconstitue le même hash → rejeu.
- **Droits relus AVANT de servir un rejeu** (18.1, ADR-0006) : la voie `replay`
  **revérifie** l'autorisation RBAC et l'isolation de groupe avant de rendre le
  résultat stocké. Un résultat mis en réserve ne franchit pas la barrière de
  droits ; un acteur sans accès ne récupère pas le fruit d'une commande d'un
  autre locataire (la clé est scopée par acteur, un autre acteur n'atteint pas
  l'entrée).
- **Capacité sous verrou = dû − réservations actives** (18.3) : `reserveObligation`
  repose sur l'oracle `remaining(due, validatedNet, activeReserved)` (balance.ts)
  ; un montant **supérieur à la capacité disponible** lève
  `CONTRIBUTION_EXCEEDS_REMAINING` (**excédent bloqué**), **avant toute
  mutation**. Plusieurs déclarations couvrent une obligation ; **aucune
  sur-allocation automatique** au tour suivant.
- **Restant dû affiché = dû − validé NET**, non − réservations (18.3) : la
  réservation est une **mise en réserve** réversible qui n'efface aucune écriture
  ; le chiffre « reste à couvrir » provient du net validé. En base, capacité
  gardée structurellement par le CHECK hérité `validated_net ≤ active_reserved ≤
  due_amount` (0001) et lue **sous `SELECT … FOR UPDATE`**.
- **Deux courses concurrentes sont sérialisées** (18.2, C06-RACE) : sous verrou
  réel, la seconde ne voit que la capacité restante après la première — deux
  déclarations de 3000 sur une dette de 5000 donnent `accepted_total = 3000`, la
  seconde est **refusée** (excédent). En pur, la décision est reproductible ; la
  **sérialisation effective** est une preuve base réelle (**BLOCKED**).
- **Date serveur distincte de date alléguée** (6.1) : la déclaration porte la
  date **affirmée par le client** (`allegedDate`) ; l'horodatage **serveur** est
  injecté séparément au scellement de l'événement (ADR-0016) et n'est **jamais**
  dérivable du corps soumis.
- **Électronique sans référence exige un motif ; une référence ne prouve rien**
  (6.1, 6.9) : `validateDeclaration` admet des espèces sans référence, exige un
  **motif non vide** pour une preuve électronique sans référence, et n'authentifie
  **jamais** une transaction externe — le registre l'enregistre comme une
  **affirmation**, pas comme une confirmation bancaire.
- **Atomicité événement / projection / registre / outbox** (18, ADR-0016) :
  poser l'événement scellé, la réservation, l'entrée d'**idempotence** et l'entrée
  d'**outbox** dans **une seule transaction** ; un crash entre les deux ne laisse
  **aucune écriture partielle** (`contribution_count` et `registry` restent
  cohérents — prouvé en base réelle, **BLOCKED** ici).

## Alternatives rejetées
- Fidèle à un cache en mémoire (TTL, Redis seul) pour l'idempotence — rejeté :
  un cache expiré ferait **re-exécuter** une commande déjà appliquée (double
  cotisation) ; la vérité est le registre durable en base.
- Écraser silencieusement le résultat stocké quand le corps change sous la même
  clé — rejeté : masquerait une soumission différente ; on lève un **conflit 409**
  explicite.
- Accepter tout montant puis « écrêter » au dû, ou reporter l'excédent
  automatiquement sur le tour suivant — rejeté : contredit 18.3 (pas de sur-
  allocation ni d'affectation automatique) ; l'excédent est **bloqué** à
  l'écriture.
- Déduire le restant dû des réservations en cours — rejeté : une réservation est
  amovible ; le chiffre public vient du **validé net** pour ne pas laisser
  croire une dette couverte par une déclaration non validée.
- Traiter une référence électronique comme preuve authentifiée — rejeté : contredit
  6.9 ; le registre garde une **affirmation**, la réconciliation bancaire est un
  lot ultérieur, hors pilote.
- Dériver la date serveur depuis le corps haché — rejeté : rendrait l'horodatage
  falsifiable côté client ; il est posé **hors** du corps, au scellement.

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/contribution.ts`
  (+20 tests domain : hash de corps RFC 8785 et « absent ≠ valeur », rejeu vs
  conflit sur même clé, droits relus avant rejeu, capacité sous verrou et excédent
  bloqué, restant dû sur validé net, validation canal/motif, montant nul/négatif/
  hors plafond refusés), `packages/api/src/contributionStore.ts` et routes C06
  (`POST …/declarations`, `POST …/drafts`, `GET …/obligations/:obligationId`) —
  10 tests API couvrant **C06-REPLAY** (20 rejeux d'une même clé/corps ⇒
  `contribution_count = 1`), **C06-BODY** (même clé, montant différent ⇒ 409) et
  **C06-RACE** (deux 3000 sur 5000 ⇒ `accepted_total = 3000`), plus le brouillon
  qui **ne soumet rien** et la voie de lecture sans mutation.
- Erreurs **stables ajoutées** : `IDEMPOTENCY_BODY_CONFLICT` (409),
  `CONTRIBUTION_EXCEEDS_REMAINING` (409), `REFERENCE_JUSTIFICATION_REQUIRED`
  (422) — mapping HTTP dans `server.ts`, référencées dans l'enum `ErrorCode` et
  les schémas de déclaration du contrat OpenAPI.
- Contrat DB posé par `0008_contribution_idempotency.sql` (**additif** au socle
  0001) : table `idempotency_registry` (clé **scopée** UNIQUE, `body_hash` 64-hex,
  FK vers `command`, `result_status IN ('applied')`, **trigger append-only** +
  **`REVOKE UPDATE, DELETE`** pour `kombe_app`, RLS) ; colonnes `command`
  (`actor_identity_id`, `command_type`, `body_hash`) ; champs de preuve
  `contribution` (`channel` CHECK, `reference`, `justification`, `alleged_date`,
  `server_date`) et CHECK « électronique sans référence exige un motif » ; avec
  son **down**. La capacité / excédent bloqué reste gardé par le CHECK hérité
  `active_reserved ≤ due_amount`. La preuve **effective** (UPDATE du registre refusé,
  rejeu ⇒ `contribution_count = 1`, seconde course refusée, `accepted_total = 3000`
  — scénarios C06-IDEMPOTENCE / C06-REPLAY / C06-RACE de `tests/isolation.pg.mjs`)
  reste **BLOCKED** sans PostgreSQL.
- Réutilisation **encadrée** du socle : `canonicalHash` (ADR-0003), `remaining`
  (oracle de balance), `sealEventV1`/`GENESIS_HASH` (ADR-0004/0016), RBAC
  `assertAllowed`/`isCrossGroupAccess`/`assertExpectedVersion` (ADR-0006). C06 ne
  redéfinit ni la chaîne de hash ni le socle d'obligation/contribution/command/outbox
  de `0001` ; il les **élargit**.
- **Limites conservées** : la **réconciliation** d'une référence électronique avec
  un relevé bancaire est hors pilote ; le **statut** d'une cotisation reste
  membre de l'ensemble statué, jamais une moyenne (règles C04) ; l'**activation**
  temps réel et les notifications restent **P1** et **gated serveur** (ADR-0005).
  Le verrou `SELECT … FOR UPDATE`, la sérialisation concurrente et l'atomicité
  transactionnelle sont des **preuves base réelle BLOCKED** ; en pur, la décision
  est déterministe mais la **concurrence effective** n'est pas encore prouvée.
