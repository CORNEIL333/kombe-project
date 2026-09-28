# ADR-0015 — Calendrier des cycles : tours, bénéficiaires et échéances

- **Statut :** ADOPTÉ (C05). Logique pure **testée** ; application DB = contrat
  posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C05 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 5.1, 5.2, 5.3 (P0) ; 5.4, 5.5 (P1, restrictions
  conservées) ; `ARCHITECTURE_CIBLE.md` §Calendrier ; règle cardinale du pilote
  « rotation égale, une part, un membre = un tour » ; ADR-0002 (monnaie entière),
  ADR-0003 (canonicalisation), ADR-0013 (amorçage du cycle), ADR-0014 (règles
  versionnées et non-rétroactivité). Dépend de C03 (groupe/membres) et C04 (règles).

## Décision
- **Un cycle = N tours pour N membres, une part chacun** (5.1) : `buildSchedule`
  produit exactement `rounds === memberCount` tours, le pot de tour et le total
  attendu du cycle étant **dérivés de l'oracle `rotation`** (ADR-0002), jamais
  réimplémentés (`cycleExpectedTotal` = `rotation.cycleTotal`). Les champs
  `rounds`/`memberCount` restent **séparés et vérifiés** (pas de confusion
  membres/tours/cycles).
- **Ordre des bénéficiaires = permutation** (5.3, P0) : `beneficiaryOrder` doit
  être une **bijection** de la liste des membres. Toute anomalie est levée **avant**
  production du calendrier — bénéficiaire dupliqué (`SCHEDULE_BENEFICIARY_DUPLICATE`,
  C05-UNIQUE `schedule_accepted = false`), bénéficiaire étranger
  (`SCHEDULE_MEMBER_UNKNOWN`), compte de tours incohérent (`SCHEDULE_ROUNDS_MISMATCH`).
  L'ordre est **figé à la construction** ; le tirage auditable et la négociation
  d'ordre restent **P1**.
- **Échéance identifiée et datée sans ambiguïté** (5.2) : chaque obligation porte
  un identifiant unique, un **montant** entier, une **date métier** calculée en
  **Africa/Douala** via `calendar.dueDate` (le quantième est ramené au **dernier
  jour réel du mois** — « 31 février » → 28/29, année bissextile gérée), un
  **instant UTC persisté** (`businessDateToUtcMs`, 12:00 Douala = 11:00 UTC, sans
  confiance en l'horloge cliente) et la **version de règle** précise à laquelle il
  s'applique. **Obligation unique membre/tour** garantie (`assertUniqueMemberRound`).
- **Démarrage complet, puis gel** (5.1, 5.3) : `assertScheduleStartable` refuse un
  amorçage **incomplet** (tours ≠ membres, bénéficiaire sans obligation, doublon
  membre/tour) — en continuité de la porte d'amorçage C03. `startSchedule` **gèle**
  l'ordre ; `reassignBeneficiary` après démarrage lève `SCHEDULE_FROZEN`. Le
  changement de bénéficiaire par **vote** (5.4) reste **P1** et n'est pas activé.
- **Départ sans réaffectation de dette** (contrainte 5.x) : `applyDeparture`
  **conserve** les obligations déjà dues du partant (`debtReassigned = false`) et
  **ne réduit pas** silencieusement le nombre de tours (`roundsUnchanged = true`) ;
  la rotation et le total attendu du cycle restent entiers.
- **Renouvellement à partir de la version acceptée** (5.5, P1) : `planRenewal`
  repart de la **dernière version acceptée** des règles, **exige de nouvelles
  acceptations** si l'engagement **essentiel** change (réutilise
  `isEssentialFinancialChange` de C04), et **préserve l'historique** de l'ancien
  cycle. C'est un **plan** (drapeaux), pas une création effective de cycle.

## Alternatives rejetées
- Réduire/multiplier silencieusement les tours quand un membre part — rejeté :
  cela réécrirait des engagements pris et casserait la rotation égale ; le départ
  conserve la dette et les tours.
- Réutiliser un tableau de dates brut ou `Date` local pour les échéances — rejeté :
  la date métier passe par `calendar.dueDate` (bornage fin de mois, bissextile) et
  l'instant est **UTC** ; l'horloge cliente n'est jamais de confiance (ADR-0002/
  contraintes STACK).
- Calculer `cycleExpectedTotal` dans le store plutôt que via `rotation` — rejeté :
  duplicerait un oracle déjà croisé par la production (C00) ; la source unique est
  `rotation`.
- Autoriser l'édition libre de l'ordre après démarrage — rejeté : contreviendrait à
  5.3 (« non modifiable par simple édition ») ; seul un vote (P1, 5.4) pourra
  l'altérer, et il reste fermé au pilote (ADR-0005).

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/schedule.ts` (+19 tests
  domain : totaux oracle, bornage fin de mois et roue des mois, hebdomadaire,
  unicité bénéficiaire/membre-tour, gel après démarrage, départ, renouvellement),
  `packages/api/src/scheduleStore.ts` et routes C05 (`/groups/:id/schedules`
  GET/POST, `/schedule-starts`, `/rounds/:seq/beneficiary`, `/departures`,
  `/cycle-renewals`) — 9 tests API couvrant C05-SCHEDULE / C05-MONTH / C05-UNIQUE,
  le gel, le départ et le renouvellement.
- Contrat DB posé par `0006_cycle_schedule.sql` (**additif** au socle 0001) :
  colonnes `round.beneficiary_membership_id`/`due_date_business`/`due_at_utc`/
  `rules_version` avec FK composites, **index partiel unique**
  `round_one_beneficiary_per_group` (rotation égale), contrainte
  `obligation_unique_member_round` (dette membre/tour) et CHECK de cohérence de
  datation ; avec son **down**. La preuve **effective** (second tour vers le même
  bénéficiaire refusé par l'index ; doublon `(groupe, tour, membre)` refusé par la
  contrainte — scénarios C05-UNIQUE / C05-OBLIGATION de `tests/isolation.pg.mjs`)
  reste **BLOCKED** sans PostgreSQL.
- Réutilisation **encadrée** des modules C00/C04 : `calendar.dueDate` (bornage fin
  de mois, bissextile, Africa/Douala), `rotation` (totaux), `isEssentialFinancialChange`
  (renouvellement). Aucune redéfinition de la monnaie ni du calendrier.
- P1 conservées fermées au pilote : tirage auditable/négociation d'ordre (5.3),
  changement de bénéficiaire par vote (5.4), création effective d'un nouveau cycle
  (5.5) ; le serveur ne les active pas (ADR-0005).
