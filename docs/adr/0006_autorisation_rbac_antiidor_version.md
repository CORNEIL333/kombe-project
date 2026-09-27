# ADR-0006 — Autorisation RBAC objet, anti-IDOR, version optimiste

- **Statut :** ADOPTÉ (C00). La **preuve base réelle** (RLS/locks) est renvoyée en C01.
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** Règle 14.1 (autorisation objet, anti-IDOR), règle 18.2
  (version d'objet attendue, conflit explicite) ; `ARCHITECTURE_CIBLE.md` §Démarrage
  des rôles.

## Décision
- Rôles : `founder`, `animator`, `treasurer`, `secretary`, `auditor`, `member`.
- Autorisation décidée **côté serveur** via une matrice `Rôle → Actions` explicite ;
  **refus par défaut** pour toute action absente (`can` / `assertAllowed`).
- **Aucun fondateur ne détient `role.change.approve`** : le droit d'approbation
  universel est explicitement exclu de la matrice. Après démarrage, toute
  modification de rôle passe par un circuit à **approbateur distinct** (C01/A19).
- **Anti-IDOR (14.1)** : `isCrossGroupAccess(actorGroupIds, targetGroupId)` refuse un
  acteur dont les groupes actifs ne contiennent pas l'objet, **sans divulguer** son
  existence (pas de 404-vs-403 distinguable).
- **Version optimiste (18.2)** : `assertExpectedVersion(current, expected)` — version
  absente/invalide → `RESERVATION_INCOHERENTE` ; dépassement → conflit explicite
  `EVENT_CHAIN_BREAK`. Jamais d'écrasement silencieux.
- Démarrage : le créateur **invite et propose** une liste de fonctions ; les nommés
  **acceptent** (`role.accept`) ; la validation croisée des montants exige plusieurs
  rôles (cf. schéma DB, table `validation`).

## Alternatives rejetées
- RBAC encodé dans le JWT et trusté côté ressource — non révoquable, client-dépendant.
- Contrôle d'accès dans le client seul — contournable ; le serveur reste la barrière.
- Verrouillage pessimiste généralisé à la place de la version — réduit la concurrence ;
  la version optimiste est complétée par des **locks ciblés** en C01 (base réelle).

## Conséquences
- Décisions pur-logique testables **maintenant** (matrice, anti-IDOR, version) —
  voir `packages/api` (11 tests) et `domain.test.ts`.
- L'**application effective** de ces règles en base (RLS + FK composites + locks)
  est une **preuve C01** sur PostgreSQL réel, statut **BLOCKED** sur cet hôte.
