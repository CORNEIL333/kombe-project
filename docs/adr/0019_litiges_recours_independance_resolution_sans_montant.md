# ADR-0019 — Litiges et recours : indépendance à la désignation, résolution sans montant, gel ciblé

- **Statut :** ADOPTÉ (C10). Logique pure **testée** ; verrou réel / unicité en
  base / atomicité / append-only des désignations = contrat posé, preuve base
  réelle **BLOCKED**.
- **Auteur :** Lead technique C10 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 8.1 (ouvrir une contestation sur un objet du
  même groupe accessible, avec **motif** et **correction demandée** ; pièces
  désactivées au pilote ; **statut commun visible de tous**, **détails sensibles
  réservés aux parties et résolveurs**), 8.2 (désigner des **résolveurs non
  impliqués** ; une **hiérarchie de rôle ne remplace pas l'indépendance** — le
  rôle ouvre la porte, l'objet la ferme ; **si tous sont impliqués**, aucun
  résolveur possible ⇒ le gel ciblé demeure et la procédure externe s'applique),
  8.3 (**clôturer le ticket ne change aucun montant** ; décision documentée avec
  motif ; **correction uniquement** via le circuit de compensation C07/C08 que
  l'issue **référence** ; **recours** rouvrant le dossier **lié à l'original**,
  la première résolution restant historisée), 8.4 (mesure P1 gated : **temps
  calendaire et temps ouvré distincts** — médiane 48 h calendaires visée, p90 et
  dossiers ouverts publiés) ; `ARCHITECTURE_CIBLE.md` §Commande et §« Sous
  verrou » ; ADR-0002 (monnaie XAF entière), ADR-0005 (barrières serveur du
  pilote), ADR-0006 (RBAC objet, anti-IDOR, version optimiste), ADR-0007
  (isolation multi-tenant RLS), ADR-0016 (journal append-only, replay versionné),
  ADR-0018 (validations/corrections, `dispute` C07 : fenêtre, motif, gel des
  dépendances). Dépend de **C03** (groupes, membres, séparation des pouvoirs) et
  **C11** (scellement/replay des événements privés `dispute.opened` /
  `dispute.resolved`) ; **débloque C08** (corrections/décaissements).

## Décision
- **Dossier recevable = motif ET correction demandée** (8.1) : `openDisputeCase`
  exige un **motif non vide** (`DISPUTE_REASON_REQUIRED`, 422) **et** une
  **correction demandée non vide** (`DISPUTE_RESOLUTION_REQUIRED`, 422). Un
  « je conteste » sans dire **ce qui est demandé** ne crée pas de dossier. Les
  **pièces sont désactivées** au pilote : **aucun champ de pièce** n'existe dans
  la structure (jamais d'ajout tacite). Le levant est **résolu serveur** depuis
  le jeton d'acteur, jamais fourni par le client.
- **Vue commune vs détail privé, structurel et non désactivable** (8.1,
  C10-PRIVACY) : `disputeCommonView` n'expose que `existence / statut / issue
  utile` (identifiant, obligation, catégorie, état, issue, horodatages, nombre
  de réouvertures) — visible de tout membre du groupe. Le **motif**, la
  **correction demandée** et les **identités de parties** ne transitent **que**
  par `disputeDetailView`, réservé aux **parties** (`isDisputeParty` : levant,
  impliqués, résolveurs désignés). La garde est **structurelle** : la vue commune
  ne contient simplement **pas les champs**, plutôt que de les filtrer à
  l'arrache. Un non-parti reçoit la vue commune ; la recette
  `private_details_returned = false` est tenue par construction.
- **Indépendance vérifiée à la désignation, pas seulement à l'acte** (8.2,
  C10-INDEP) : `designateResolvers` refuse qu'un résolveur soit un **impliqué**
  (`DISPUTE_RESOLVER_NOT_INDEPENDENT`, 403) ; une **désignation vide** lève
  `DISPUTE_RESOLVER_NOT_DESIGNATED` (403) et correspond à l'état « **tous sont
  impliqués** » : **le gel ciblé demeure** et la **procédure externe** acceptée
  s'applique — le serveur **ne résout rien** et n'ouvre aucune porte par rôle.
  Une **hiérarchie de rôle ne remplace pas l'indépendance** : le rôle
  (`dispute.resolve`, accordé au `secrétaire`) **ouvre** la porte d'accès à
  l'action, **l'objet** (n'être ni levant ni impliqué) la **ferme**. En base, un
  **trigger BEFORE INSERT** sur `dispute_assignment` refuse la désignation du
  levant **ou** du déclarant d'une cotisation de l'obligation contestée, et un
  `UNIQUE (dispute_id, assigned_identity_id)` interdit la double désignation.
- **Résolution = zéro montant, structurel** (8.3, C10-RESOLVE) : `resolveDispute`
  ne reçoit **aucun** montant et n'émet **aucun** événement monétaire —
  `validated_total_delta = 0` est **structurel**, pas une promesse : le store de
  litige ne détient **aucune chaîne de journal** et les schémas C10 ne portent
  **aucun champ de montant**. La **correction** d'un solde s'obtient
  **uniquement** par le circuit de compensation C07/C08 ; l'**issue** peut en
  **référencer** les écritures (`correctionContributionIds`) sans jamais les
  créer. La résolution exige un **résolveur désigné ET indépendant** (double
  garde : `DISPUTE_RESOLVER_NOT_DESIGNATED` puis `DISPUTE_RESOLVER_NOT_INDEPENDENT`)
  et un **motif documenté non vide** (`DISPUTE_RESOLUTION_REQUIRED`) ; clore «
  au feeling » est refusé. Un dossier déjà résolu ne se résout pas deux fois
  (`DISPUTE_ALREADY_RESOLVED`, 409).
- **Recours lié à l'original, historique préservé** (8.3, C10-REOPEN) :
  `reopenDispute` ne porte que sur un litige **résolu** (`DISPUTE_NOT_RESOLVABLE`
  sinon) et le **rouvre** en **rétablissant le gel** ciblé, **sans toucher aux
  montants**. Le lien `reopenedFromDisputeId` marque la **réouverture du même
  original** (jamais un détournement vers un autre dossier), `reopenCount` borne
  la reprise, et la **première résolution reste historisée** dans les actes
  append-only (aucun `UPDATE` effaceur). En base, le CHECK
  `dispute_reopen_links_self` (`reopened_from IS NULL OR = dispute_id`) rend la
  règle incompressible. Le **recours n'est ouvert qu'au levant** ; toute autre
  demande relève d'une procédure **gated** (ADR-0005, `FEATURE_PILOT_FORBIDDEN`,
  non révélatrice).
- **Gel de clôture ciblé, jamais en force** (8.3, C10-FREEZE) :
  `assertRoundCloseNotFrozen` refuse la clôture normale d'un tour dès qu'**une
  seule** de ses obligations porte un litige **ouvert**
  (`ROUND_CLOSE_BLOCKED_BY_DISPUTE`, 409) — `normal_close_accepted = false` —
  **sans aucun effacement** d'écriture ni de validation. Le gel se **lève par la
  résolution indépendante**, puis la clôture redevient admise (la cotisation
  validée reste validée).
- **Temps calendaire vs temps ouvré DISTINCTs, fenêtre explicite** (8.4) :
  `calendarProcessingSeconds` compte toutes les secondes écoulées (cible
  « médiane sous 48 h **calendaires** ») ; `businessProcessingSeconds` ne compte
  que les secondes dans la **fenêtre ouvrée** **lundi–vendredi, 08:00–18:00 UTC**
  (`BUSINESS_WINDOW_START_HOUR_UTC`/`END`), choix **unique, assumé, versionné**
  ici — « ouvré » ne veut rien dire sans fenêtre définie. Résoudre lundi 09:00
  un litige ouvert samedi 09:00 vaut **48 h calendaires** mais **0 h ouvrée**.
  Les deux chiffres sont publiés, **jamais confondus** ; la **production** de
  statistiques (médiane/p90/dossiers ouverts) relève d'un lot **pilote gated**,
  seule la **matière de calcul déterministe** vit ici.
- **Garde objet réutilisée, inchangée** (ADR-0006) : chaque acte passe RBAC
  objet (`assertAllowed("dispute.raise" | "dispute.resolve" | "round.close")`),
  anti-IDOR (`isCrossGroupAccess`) et **version d'objet attendue**
  (`assertExpectedVersion` → `EVENT_CHAIN_BREAK`, 409). C10 **réutilise** la
  fenêtre et le motif C07 (`ORDINARY_DISPUTE_WINDOW_SECONDS`, `raiseDispute`,
  `assertValidationNotBlocked`, `assertDependentOperationsNotBlocked`) **sans les
  redéfinir**.

## Alternatives rejetées
- Exposer la vue complète à tout membre « pour la transparence » — rejeté :
  contredit 8.1 ; le **statut** est commun, le **détail sensible** est réservé
  aux parties. La rétention est structurelle (vue sans champs privés).
- Autoriser un résolveur au seul motif de son **rôle** (secrétaire/animeur) —
  rejeté : 8.2 est explicite, **une hiérarchie de rôle ne remplace pas
  l'indépendance** ; l'objet ferme la porte (levant/impliqué refusés par trigger).
- Permettre à la résolution d'**ajuster directement un montant** (un champ
  `amountCorrection` sur la décision) — rejeté : contredit le cœur de 8.3 et la
  monnaie entière traçable ; **aucun montant** ne transite par C10, la correction
  passe **exclusivement** par la compensation C07/C08 référencée par l'issue.
- Réécrire/écraser la première résolution lors d'un recours — rejeté : le
  dossier **historise** (append-only), la réouverture **lie** à l'original et
  **rétablit le gel** sans effacer.
- Traiter un litige « tous impliqués » en désignant d'office un supérieur
  hiérarchique — rejeté : ce serait contourner l'indépendance ; on **maintient
  le gel** et la **procédure externe** s'applique (le serveur ne tranche pas).
- Mesurer la performance 8.4 en **temps ouvré** seulement (ou calendaire
  seulement) — rejeté : les deux sont **demandés** et **distincts** ; les
  confondre masquerait soit l'attente réelle (calendaire), soit l'effort
  effectif (ouvré).

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/disputes.ts`
  (+25 tests domain : ouverture recevable motif+correction, vue commune sans
  détail privé vs détail réservé parties, indépendance à la désignation et
  désignation vide ⇒ gel, résolution par résolveur désigné ET indépendant avec
  motif, double résolution refusée, **aucun canal monétaire** dans la
  résolution, recours lié à l'original rétablissant le gel, garde de clôture de
  tour, et **temps calendaire vs ouvré** sur fenêtre 08:00–18:00 UTC lundi–
  vendredi — valeurs vérifiées : sam→lun ouvré = 1 h, lun+72 h ouvré = 30 h,
  sam+6 j ouvré = 41 h) — soit **202** tests domain au total. Erreurs **stables
  ajoutées** dans `errors.ts` : `DISPUTE_NOT_RESOLVABLE` (409),
  `DISPUTE_ALREADY_RESOLVED` (409), `DISPUTE_RESOLVER_NOT_DESIGNATED` (403),
  `DISPUTE_RESOLVER_NOT_INDEPENDENT` (403), `DISPUTE_RESOLUTION_REQUIRED` (422).
  RBAC (`authorization.ts`) : `dispute.resolve` est **nouvellement** accordé au
  rôle `secrétaire` (l'indépendance par objet reste appliquée en domaine).
- Application **testée** : `packages/api/src/disputeStore.ts` (store **fictif**,
  `monetaryEventsEmitted = 0` structurel) et **7 routes** C10 dans `server.ts`
  (`POST /v1/groups/:groupId/dispute-cases` 201, `GET …/dispute-cases` liste
  commune, `GET …/dispute-cases/:disputeId` vue commune/détail selon partie,
  `POST …/:disputeId/resolvers` 200, `POST …/:disputeId/resolution` 200,
  `POST …/:disputeId/appeals` 200, `POST …/round-close-attempts` 200/409) —
  **22** tests API (soit **99** au total) couvrant **C10-PRIVACY** (non-parti ⇒
  vue commune ne contenant **aucun** motif/correction/identité, partie ⇒ détail
  complet, liste toujours commune, cross-group 403, inconnu 404), **C10-RESOLVE**
  (après résolution d'un dossier portant, la vue d'une cotisation **validée** C07,
  son `journalTailHash` et les compteurs d'événements restent **bit-à-bit
  identiques** — `expect(after).toEqual(before)` ; non-désigné 403 ; sans issue
  422 et état `open` inchangé ; double résolution 409 ; version obsolète 409),
  **recours** (réouverture liée `reopenCount = 1`, non-levant 403 non
  révélatrice) et **C10-FREEZE** (litige ouvert ⇒ clôture 409, après résolution
  la clôture est admise 200 et la cotisation reste validée, un recours
  **re-gèle**, membre sans rôle 403). Les stores **ne simulent ni verrou, ni
  atomicité, ni append-only**.
- Contrat DB posé par `0010_dispute_cases.sql` (**additif** aux socles 0001 et
  0009) : colonnes `dispute` (`requested_correction`, `outcome`, `resolved_at`,
  `resolved_by_identity_id`, `reopened_from_dispute_id` FK) + CHECK
  `dispute_requested_correction_present` (ouverture recevable), CHECK
  `dispute_resolution_documented` (`resolved` exige issue + résolveur tracé),
  CHECK `dispute_reopen_links_self` (recours lié à l'original) ; table
  **append-only** `dispute_assignment` (`UNIQUE (dispute, identity)`
  anti-double-désignation, **trigger d'indépendance** refusant levant/déclarant,
  trigger append-only + **`REVOKE UPDATE, DELETE`** pour `kombe_app`, RLS), avec
  son **down**. **Aucune colonne monétaire** : le dossier ne peut toucher un
  total. La preuve **effective** (scénarios C10-CASE / C10-RESOLVE / C10-INDEP /
  C10-REOPEN de `tests/isolation.pg.mjs`) reste **BLOCKED** sans PostgreSQL.
- Réutilisation **encadrée** du socle : `sealEventV1`/`GENESIS_HASH` et les types
  `dispute.opened` / `dispute.resolved` **déjà rejoués** comme **privés** par C11
  — C10 n'introduit **aucun** nouveau type d'événement ni nouvelle chaîne. La
  monnaie entière (ADR-0002), la canonicalisation (ADR-0003), la RBAC objet
  (ADR-0006) et la fenêtre/motif de contestation (ADR-0018) sont réutilisés sans
  redéfinition.
- **Limites conservées** : la **course** entre résolution et réouverture,
  l'**unicité effective** de la désignation sous concurrents et l'**atomicité**
  désignation/journal/outbox sont des **preuves base réelle BLOCKED** ; en pur,
  l'indépendance et le lien de recours sont déterministes, mais la **course
  effective** n'est pas encore prouvée. La **production de statistiques 8.4**
  (médiane/p90/dossiers ouverts) et la **procédure externe** pour litige « tous
  impliqués » relèvent de lots **gated serveur** (ADR-0005) ; **l'auditeur non
  partie** reste hors des parties pour le détail privé (règle volontairement
  restrictive, assouplissement à arbitrer en gouvernance) ; aucune notification
  réelle ni pièce jointe n'est émise au pilote.
