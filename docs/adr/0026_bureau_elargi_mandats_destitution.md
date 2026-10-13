# ADR-0026 — Bureau élargi, mandats et destitution par vote

- **Statut :** **PROPOSÉ, appliqué par défaut** — complète ADR-0011 (circuit A19).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Les associations camerounaises ont un bureau : Président, Vice-président, Secrétaire général, Trésorier, Trésorier adjoint, Commissaire aux comptes, Censeur, Conseiller. L'ancienne application Firebase avait la présidence et la destitution ; le registre n'avait que `animator`.

## Décision

- Rôles techniques `animator, vice_president, secretary, treasurer, treasurer_deputy, auditor, censor, advisor, member` ; libellés camerounais à l'écran.
- Une fonction est **proposée** par la présidence puis **acceptée** par la personne nommée ; la personne voit sa proposition (`MemberView.pendingRoles`). Une fonction financière ne s'attribue jamais à soi-même.
- Matrice des droits unique (`packages/domain/src/tontine/roles.ts`), copiée par la PWA pour l'affichage seulement (test d'égalité).
- Mandat daté (5 ans au plus). Destitution : majorité ABSOLUE des membres actifs, fenêtre ≥ 72 h (`removalAdopted`) — règle de domaine prête, parcours de vote à brancher (voir plan, L-11).

## Conséquences

Plusieurs fonctions possibles pour une personne, jamais sur une même opération (indépendance déclarant/confirmateur/contrôleur conservée).
