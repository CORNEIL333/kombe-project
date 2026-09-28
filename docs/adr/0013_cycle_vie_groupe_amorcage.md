# ADR-0013 — Cycle de vie du groupe, porte d'amorçage et invitations

- **Statut :** ADOPTÉ (C03). Logique pure **testée** ; application DB = contrat
  posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C03 • **Date :** 2026-09-28
- **Contexte / origine :** Stories 2.1, 2.7, 4.1, 4.2, 4.4, 4.5, 4.9 ;
  `ARCHITECTURE_CIBLE.md` §Démarrage ; règle cardinale du pilote « amorçage sans
  pouvoir financier » ; ADR-0006 (RBAC), ADR-0007 (isolation), ADR-0011 (circuit
  A19). Dépend de C01 (identité/rôles) et C02 (accès).

## Décision
- **Cycle de vie explicite du groupe** (2.7) : `configuration → active → paused
  → closed → stopped_with_discrepancies → archived`, transitions strictement
  bornées (`GROUP_TRANSITIONS`). `closed` et `archived` sont en **lecture seule**
  (`assertGroupMutable` refuse toute écriture) ; `stopped_with_discrepancies`
  **conserve** les obligations non résolues ; `archived` est terminal.
- **Porte de démarrage du cycle** (`assertCycleStartable`, 2.1) : le groupe ne
  passe de `configuration` à `active` que si, agrégés **côté serveur** :
  (a) le nombre de **fonctions indépendantes requises** est atteint **et accepté**,
  (b) **tous** les membres actifs ont accepté la **version courante** des règles,
  (c) un **suppléant** est désigné pour la cotisation du trésorier (4.4), et
  (d) l'effectif actif minimal est respecté. Le **fondateur seul** ne peut donc
  pas démarrer → observation `cycle_started = false` (scénario C03-BOOT).
- **Invitation bornée, expirante, révocable** (4.1) : `max_uses ≥ 1`, compteur
  d'usage, `expires_at`, `revoked_at`. Elle **ne révèle aucune donnée du registre
  réel** avant adhésion — seule une vue publique minimale (`groupName`,
  `revealsRegistry: false`) est exposée. Toute cause d'indisponibilité (expirée,
  révoquée, épuisée) renvoie une **erreur unique non divulguante**
  (`INVITATION_INVALID`).
- **Acceptation des règles = consentement horodaté à une version exacte** (4.2) :
  une identité ne peut cotiser que si elle a accepté la version **courante**
  (`assertContributionAllowed`) ; une acceptation périmée ne compte pas.
- **Séparation des pouvoirs** (4.5, 4.9) : le changement de rôle suit le circuit
  A19 (ADR-0011) — un administrateur **ne s'approuve pas** son propre nouveau
  rôle ; le fondateur reste **sans** `role.change.approve`. Ces droits sont
  **revérifiés à chaque commande**, côté serveur.

## Alternatives rejetées
- Démarrage du cycle par le seul fondateur (règles non acceptées, validateurs non
  indépendants) — rejeté : concentrerait le pouvoir financier dès l'amorçage,
  contredit le maître prompt.
- Invitation permanente ou révélant la composition du groupe avant adhésion —
  rejeté (fuite d'information, contournable).
- Distinction en erreur des motifs « expiré / révoqué / épuisé » — rejeté : elle
  révélerait un état interne à un observateur non membre ; erreur unique retenue.
- Vérification de la porte côté client seulement — contournable ; la décision est
  **serveur** (`packages/domain/src/group.ts`), la base ne faisant que borner les
  états (`CHECK group.state`) et les usages (`used_count ≤ max_uses`).

## Conséquences
- Logique **pure testée maintenant** : `packages/domain/src/group.ts`,
  `governance.ts` (+13 tests domain), `packages/api/src/governanceStore.ts` et
  routes C03 (`/groups/:id/cycle-starts`, `/cycle-readiness`, `/mutations`,
  `/membership-terminations`, `/rules-acceptances`, `/contribution-declarations`,
  `/invitations/:id/redemptions`) — 6 tests API couvrant C03-BOOT / C03-REVOKE /
  C03-ROLE.
- Contrat DB posé par `0004_group_governance.sql` (CHECK `group.state` élargie +
  table `invitation` RLS tenant-scope) avec son **down**. La preuve **effective**
  (état élargi accepté, second usage refusé par la borne, invitation de A
  invisible au contexte de B — scénarios C03-STATE / C03-INVITE / C03-TENANT de
  `tests/isolation.pg.mjs`) reste **BLOCKED** sans PostgreSQL.
- Les P1 (4.6 délégation, 4.7 exclusion, 4.10 statuts spéciaux) restent **hors du
  pilote** : le serveur refuse les états non supportés (ADR-0005) ; aucune
  activation implicite.
