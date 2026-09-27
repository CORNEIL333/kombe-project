# ADR-0012 — Accès des comptes : sessions, jetons à usage unique, récupération

- **Statut :** ADOPTÉ (C02). Logique pure **recette verte** ; application DB =
  contrat posé, preuve base réelle **BLOCKED**.
- **Auteur :** Lead technique C02 • **Date :** 2026-09-27
- **Contexte / origine :** Stories 1.1–1.5 ; `C02_PROMPT.md` §Conception ;
  maître prompt (le rôle ne se lit pas dans le jeton ; aucune donnée réelle ;
  aucun message réel au pilote) ; ADR-0006 (RBAC) et ADR-0011 (circuit A19).

## Décision
- **Vérification de canal par jeton à usage unique et expirant** (1.1, 1.4) :
  un jeton `registration`/`recovery` a une durée bornée et ne peut être
  consommé qu'une fois (`consumeVerificationToken`). En base, l'unicité d'usage
  est garantie par `UPDATE … WHERE consumed_at IS NULL` sous verrou de ligne et
  par un index partiel unique (un seul jeton actif par identité+finalité).
- **Sessions révocables par génération** (1.2, C02-SESSION) : chaque compte
  porte une `sessionGeneration`. Une session n'est recevable que si sa propre
  génération égale la génération courante, si elle n'est pas révoquée et si
  elle n'a pas expiré. La **récupération incrémente la génération**, ce qui
  révoque d'office toute session antérieure — sans liste à parcourir.
- **Récupération sécurisée** (1.4) : `applyAccountRecovery` consomme le jeton
  (usage unique → `TOKEN_ALREADY_USED` sinon), réactive le compte, révoque les
  sessions (génération + 1) et **suspend temporairement les privilèges**
  (`recoveryLockUntil`). Elle produit une **intention** de notification de
  sécurité (`deliveredAt = null`) : le domaine **n'envoie aucun message** ;
  la livraison est une frontière externe, hors du pilote.
- **Privilège recalculé côté serveur** (1.2, C02-PRIVILEGE) : `isOperator`,
  `channelVerified`, `mfaEnrolled` et la suspension sont des **faits serveur**.
  Un rôle revendiqué par un jeton client (JWT) est **ignoré** ; seule l'état du
  compte décide. Une fonction opérateur exige compte actif, canal vérifié,
  absence de suspension et **MFA souscrite** (MFA obligatoire opérateurs).
- **Anti-énumération** (1.1, 1.4) : les réponses d'inscription/récupération
  sont d'un **gabarit identique** que le compte existe ou non ; aucun jeton
  réel n'est créé ni divulgué pour une identité inconnue (absence d'effet).
- **Aucun secret en clair** : mot de passe et OTP/jeton ne transitent ni ne
  persistent en clair — uniquement des **empreintes** (`password_hash`,
  `token_hash`) ; rien dans les logs ni les exports.

## Alternatives rejetées
- Liste blanche/noire de sessions à parcourir pour révoquer — rejetée (la
  génération rend la révocation O(1) et immune à une session oubliée).
- Fier le privilège au rôle porté par le JWT — rejeté (le maître prompt
  l'interdit ; un rôle périmé dans un token durable est un vecteur d'abus).
- Réponse distinguant « compte inexistant » — rejetée (énumération de comptes).
- Envoi réel d'OTP courriel/SMS pendant les tests — interdit (aucun message
  réel ; frontière externe bouchée en BLOCKED, non simulée).

## Conséquences
- Logique **pure testable maintenant** : `packages/domain/src/access.ts`
  (+ 16 tests Vitest) ; routes d'accès et store fictif `packages/api`
  (`accessStore.ts`, + 7 tests). Recettes vertes : domain 68, api 26.
- Contrat DB par `0003_access.sql` (+ down) : `identity_access`,
  `verification_token`, `access_session`, RLS **self-scope**
  (`kombe.identity_id`). La preuve **effective** (consommation unique sous
  verrou, supplantation de session, invisibilité inter-identité) reste
  **BLOCKED** sans PostgreSQL → scénarios C02-RECOVERY/SESSION/SELFSCOPE de
  `packages/db/tests/isolation.pg.mjs`.
- Aucune dépendance à une fonctionnalité interdite au pilote (ADR-0005) ; les
  barrières de feature restent closes. La MFA **optionnelle** pour les membres
  (1.3, P1) garde ses restrictions ; seule l'exigence **opérateur** est posée.
