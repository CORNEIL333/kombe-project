# ADR-0011 — Circuit A19 d'approbation distincte des rôles

- **Statut :** ADOPTÉ (C01). Application DB = contrat posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C01 • **Date :** 2026-09-27
- **Contexte / origine :** Story A19 ; `ARCHITECTURE_CIBLE.md` §Démarrage ; règle 14.1
  (autorisation objet) et 18.2 (version optimiste) ; ADR-0006 (RBAC).

## Décision
- Un changement de rôle suit un circuit à **trois acteurs distingués** :
  **proposant** (fondateur/animator qui nomme) → **nommé** (qui **accepte** la
  nomination) → **approbateur** (qui approuve). Les états sont
  `nominated → accepted → approved` (ou `declined` / `rejected`).
- **Aucun auto-accord universel** : le fondateur **ne détient pas**
  `role.change.approve` (exclu de sa matrice). L'**auditeur** est l'approbateur
  indépendant qui détient ce droit.
- **Approbateur distinct** (`assertApproverDistinct`) : l'approbateur doit
  différer **et** du proposant **et** du nommé. En base, un `CHECK` interdit déjà
  `approved_by = proposed_by` ; la distinction avec le nommé est appliquée au
  serveur (l'identité cible transite par `membership`).
- **Pas d'affectation silencieuse** : approuver avant acceptation du nommé est
  refusé (`ROLE_ACCEPTANCE_REQUIRED`). Chaque mutation exige la **version attendue**
  de la demande (18.2), conflit explicite sinon.
- Adhésion : une identité n'agit que si elle a une **adhésion active** dans le
  groupe (machine à états `pending/active/departed/revoked`, états terminaux non
  rouvrables ; unicité d'une adhésion active par groupe+identité).

## Alternatives rejetées
- Le fondateur approuve ses propres nominations — rejeté (concentration du pouvoir,
  contredit l'esprit de vérificabilité et le maître prompt).
- Affectation de rôle immédiate sans acceptation du nommé — rejeté (rôle imposé).
- Contrôle de distinction uniquement côté client — contournable ; la décision est
  serveur + doublure de contrainte en base.

## Conséquences
- Logique **pure testable maintenant** : `packages/domain` (`identity.ts`,
  `role_change.ts`) + `packages/api` (routes `/role-nominations/:id/acceptances`,
  `/role-change-requests/:id/approvals`) — recettes Vitest vertes.
- Contrat DB posé par `0002_role_change.sql` (+ down, provision `kombe_app` sans
  BYPASSRLS). La preuve **effective** (CHECK/RLS/verrous en base réelle, scénarios
  C01-TENANT/FK/POOL) reste **BLOCKED** sans PostgreSQL → `tests/isolation.pg.mjs`.
- Le circuit A19 est exposé dans `docs/openapi.yaml` ; il ne dépend d'**aucune**
  feature interdite au pilote (ADR-0005).
